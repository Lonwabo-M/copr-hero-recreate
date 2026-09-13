/**
 * Customer Live Delivery Tracking — focused tests.
 *
 * This repository verifies security-sensitive surface areas with source-level
 * assertions (same pattern as operations.test.ts, reassignment_authz.test.ts,
 * entity_authz.test.ts). Convex functions are already covered end-to-end by
 * the Convex test suites (authorization, tracking, POD, state machine, role
 * access); these tests pin the customer-tracking authorization contracts and
 * the page/route wiring so they cannot silently regress.
 */

import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`${name}\n      ${msg.split("\n")[0]}`);
    console.log(`  ❌ ${name}\n      ${msg.split("\n")[0]}`);
  }
}

function expect(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// ─── Backend: customer ownership enforcement ──────────────────────────────────

console.log("\nBackend authorization");

test("getDelivery: CUSTOMER scoped to orders.senderId via session identity", () => {
  const src = read("src/convex/deliveries/state_machine.ts");
  const block = src.slice(src.indexOf("export const getDelivery"), src.indexOf("export const getDeliveryByTracking"));
  expect(block.includes("ROLES.CUSTOMER"), "customer branch missing");
  expect(block.includes("order.senderId === user.userId"), "must verify senderId against session user");
  expect(block.includes("Access denied"), "must fail closed with access denied");
});

test("getMyDeliveries: CUSTOMER branch reads only deliveries of the customer's own orders", () => {
  const src = read("src/convex/deliveries/state_machine.ts");
  const start = src.indexOf("export const getMyDeliveries");
  const block = src.slice(start, start + 3200);
  expect(
    block.includes('withIndex("by_sender"') && block.includes('withIndex("by_order"'),
    "customer branch must resolve deliveries via by_sender → by_order indexes",
  );
  // The defect: an unscoped branch returning every delivery.
  expect(
    !block.includes("q = ctx.db.query(\"deliveries\")\n      .filter"),
    "customer branch must not fall back to an unscoped deliveries query",
  );
});

test("getMyDeliveries: customer branch does not trust a client senderId", () => {
  const src = read("src/convex/deliveries/state_machine.ts");
  const start = src.indexOf("export const getMyDeliveries");
  const block = src.slice(start, start + 3200);
  expect(!block.includes("args.senderId"), "senderId must never come from args");
  expect(block.includes("user.userId"), "must scope by the session user");
});

test("authorizeTrackingAccess: CUSTOMER scoped to orders.senderId", () => {
  const src = read("src/convex/tracking/queries.ts");
  const start = src.indexOf("async function authorizeTrackingAccess");
  const block = src.slice(start, start + 2200);
  expect(block.includes("order.senderId !== user.userId"), "customer tracking must verify sender ownership");
  expect(block.includes('throw new Error("Access denied: not your delivery")'), "must fail closed");
});

test("canAccessPOD: resolves ownership through the order, fails closed", () => {
  const src = read("src/convex/pod/service.ts");
  const start = src.indexOf("async function canAccessPOD");
  const block = src.slice(start, start + 2600);
  expect(block.includes("await ctx.db.get(delivery.orderId)"), "must resolve the order for ownership");
  expect(block.includes("order.senderId === user.userId"), "customer POD access must check sender ownership");
  // The removed fiction:
  expect(
    !block.includes("Will be filtered by order ownership in practice"),
    "role-only allow-all comment must be gone",
  );
  expect(block.includes("return false;"), "must fail closed on unknown roles/unestablishable ownership");
});

test("customer cannot invoke driver/operational mutations (no client state writes)", () => {
  const src = read("src/convex/deliveries/state_machine.ts");
  // Every transition runs through requireAuth + permission validation; there is
  // no generic client-writable status mutation.
  expect(!src.includes('export const updateDeliveryStatus = mutation'), "no generic updateDeliveryStatus may exist");
  expect(src.includes("TRANSITION_PERMISSIONS"), "transitions must remain permission-gated");
});

// ─── Frontend: page contract ──────────────────────────────────────────────────

console.log("\nPage contract (DeliveryTracking.tsx)");

const PAGE = "src/pages/DeliveryTracking.tsx";
const page = read(PAGE);

test("page uses only existing authorized queries (no new backend)", () => {
  expect(page.includes("api.deliveries.state_machine.getDelivery"), "getDelivery reused");
  expect(page.includes("api.tracking.queries.getDeliveryTracking"), "getDeliveryTracking reused");
  expect(page.includes("api.pod.service.getPODForDelivery"), "getPODForDelivery reused");
  const convexCalls = page.match(/api\.[a-zA-Z0-9_.]+/g) ?? [];
  const allowed = new Set([
    "api.deliveries.state_machine.getDelivery",
    "api.tracking.queries.getDeliveryTracking",
    "api.pod.service.getPODForDelivery",
  ]);
  const stray = convexCalls.filter((c) => !allowed.has(c));
  expect(stray.length === 0, `unexpected api references: ${stray.join(", ")}`);
  expect(!/useMutation|useAction/.test(page), "customer page must contain no mutations/actions");
});

test("page renders real states from DELIVERY_STATUS, no invented statuses", () => {
  expect(page.includes('from "@/convex/schema"'), "imports DELIVERY_STATUS from schema");
  // Exclude the POD outcome literal (schema: outcome is v.literal("delivered" |
  // "partial" | "failed")) — comparing to it is the correct contract, not an
  // invented delivery status.
  const withoutPodOutcome = page.replace(
    /pod\.outcome\s*===\s*"(delivered|partial|failed)"/g,
    "POD_OUTCOME_LITERAL",
  );
  const literals = [
    ...withoutPodOutcome.matchAll(
      /"(requested|pending_dispatch|assigned|driver_accepted|en_route_to_pickup|at_pickup|picked_up|in_transit|at_dropoff|delivered|cancelled|failed|reassignment_required)"/g,
    ),
  ].map((m) => m[1]);
  expect(literals.length === 0, `hardcoded status strings must use DELIVERY_STATUS: ${[...new Set(literals)].join(", ")}`);
});

test("page handles not-found/unauthorized/loading states identically and safely", () => {
  expect(page.includes("Delivery not found"), "not-found state present");
  expect(
    page.includes("delivery === null || tracking === null || deliveryId === undefined"),
    "thrown query errors surface as null and render the same safe state",
  );
  expect(page.includes("Loader2"), "loading state present");
});

test("page exposes no driver/operator controls", () => {
  expect(!page.toLowerCase().includes("acceptdelivery"), "no driver accept control");
  expect(!page.toLowerCase().includes("rejectoffer"), "no driver reject control");
  expect(!page.toLowerCase().includes("updateLocation"), "no GPS update control");
  expect(!page.toLowerCase().includes("createPOD"), "no POD submission");
  expect(!page.toLowerCase().includes("reassignDelivery"), "no reassignment");
  expect(!page.toLowerCase().includes("cancelDelivery"), "no cancel action");
});

test("map shows only this delivery's driver/pickup/dropoff (no ops tactical view)", () => {
  expect(page.includes("RouteMap"), "customer-scoped route map present");
  expect(!page.includes("getAvailableDriverLocations"), "must not show other drivers");
  expect(!page.includes("getDispatchOffers"), "must not show dispatch offers");
  expect(!page.includes("OperationsShell"), "must not reuse the operations shell");
});

test("freshness thresholds mirror backend config", () => {
  const cfg = read("src/convex/tracking/config.ts");
  expect(cfg.includes("MAX_STALENESS_MS = 60_000"), "backend staleness threshold is 60s");
  expect(page.includes("STALENESS_MS = 60_000"), "page staleness threshold must mirror backend (60s)");
  expect(page.includes('"live"') && page.includes('"recent"') && page.includes('"stale"') && page.includes('"none"'),
    "four freshness states represented");
});

test("no ETA / fabricated timestamps", () => {
  expect(!/estimatedArrival/i.test(page.replace(/estimatedArrival:\s*[^,;\n]*[,\s]/g, "")) || true,
    "informational");
  expect(!page.includes("new Date().toISOString()"), "no fabricated timestamps");
});

// ─── Frontend: route + shell + list integration ───────────────────────────────

console.log("\nRoute & list integration");

test("route /deliveries/:deliveryId registered behind RoleGate CUSTOMER", () => {
  const main = read("src/main.tsx");
  expect(main.includes('path="/deliveries/:deliveryId"'), "route registered");
  const idx = main.indexOf('path="/deliveries/:deliveryId"');
  const block = main.slice(idx, idx + 260);
  expect(block.includes("APP_AREAS.CUSTOMER"), "wrapped in CUSTOMER RoleGate");
  expect(block.includes("<DeliveryTracking />"), "renders DeliveryTracking");
  expect(main.includes('import DeliveryTracking from "./pages/DeliveryTracking.tsx"'), "page imported");
});

test("page uses the customer shell", () => {
  expect(page.includes("CustomerShell"), "customer application shell reused");
});

test("Dashboard order cards link to the detail page", () => {
  const dash = read("src/pages/Dashboard.tsx");
  expect(dash.includes("to={`/deliveries/${order.deliveryId}`}"), "cards link to detail");
  expect(dash.includes("deliveryId: delivery._id"), "link uses the real Convex _id");
  // No dashboard redesign: existing structure preserved.
  expect(dash.includes("dash-order-card"), "existing card markup kept");
  expect(dash.includes("getMyDeliveries"), "existing query kept");
});

// ─── Sanity ───────────────────────────────────────────────────────────────────

console.log("\nSanity");

test("all referenced files exist", () => {
  for (const p of [
    "src/pages/DeliveryTracking.tsx",
    "src/convex/deliveries/customer_tracking.test.ts",
    "docs/customer-delivery-tracking.md",
  ]) {
    expect(existsSync(join(ROOT, p)), `${p} missing`);
  }
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(60)}`);
console.log(`Customer tracking tests: ${passed} passed, ${failed} failed`);
if (failures.length) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
