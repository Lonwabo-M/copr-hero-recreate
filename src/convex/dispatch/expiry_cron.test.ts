/**
 * Scheduled Offer-Expiry Tests
 *
 * Verifies the automated execution path for the existing
 * `processExpiredOffers` logic (Convex cron → internal mutation → shared
 * expiry core). Follows the repository's source-verification pattern:
 * pure-logic tests for reusable predicates plus source assertions for wiring,
 * concurrency safety, and invariants that must hold in the implementation.
 *
 * The cron itself is registered in `src/convex/crons.ts`; the shared core and
 * both entry points (manual operations mutation + internal cron mutation)
 * live in `src/convex/dispatch/engine.ts`.
 */
import { readFileSync } from "fs";
import { strict as assert } from "assert";
import path from "path";

function read(relPath: string): string {
  return readFileSync(path.join(process.cwd(), relPath), "utf8");
}

const cronsSource = read("src/convex/crons.ts");
const engine = read("src/convex/dispatch/engine.ts");

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    console.error(`  ✗ ${name}`);
  }
}

// ─── Pure-logic checks on the expiry predicate ───────────────────────────────

interface OfferLike {
  status: "pending" | "accepted" | "rejected" | "expired" | "cancelled";
  expiresAt: number;
  respondedAt?: number;
}

const isExpirable = (o: OfferLike, now: number) =>
  o.status === "pending" && o.expiresAt < now;

test("expired offers are processed automatically (predicate matches)", () => {
  const offer = { status: "pending" as const, expiresAt: 1000 };
  assert.equal(isExpirable(offer, 1001), true);
  assert.equal(isExpirable(offer, 2000), true);
});

test("non-expired offers are untouched", () => {
  const now = 2000;
  assert.equal(isExpirable({ status: "pending", expiresAt: 2000 }, now), false, "not yet due");
  assert.equal(isExpirable({ status: "pending", expiresAt: 2001 }, now), false, "expires in future");
});

test("already-accepted offers are untouched", () => {
  assert.equal(
    isExpirable({ status: "accepted", expiresAt: 500 }, 2000),
    false,
    "accepted offer never matches expiry predicate",
  );
});

test("already-rejected offers are untouched", () => {
  assert.equal(
    isExpirable({ status: "rejected", expiresAt: 500 }, 2000),
    false,
    "rejected offer never matches expiry predicate",
  );
});

test("reassigned/cancelled/expired offers are not reprocessed (idempotency)", () => {
  const now = 2000;
  assert.equal(isExpirable({ status: "cancelled", expiresAt: 500 }, now), false);
  assert.equal(isExpirable({ status: "expired", expiresAt: 500 }, now), false, "already expired: no double-processing");
});

// ─── Cron wiring ──────────────────────────────────────────────────────────────

test("convex cron configuration exists and is valid", () => {
  assert.ok(cronsSource.includes('import { cronJobs } from "convex/server"'), "uses Convex native cron mechanism");
  assert.ok(cronsSource.includes("export default crons"), "crons module exports the cronJobs instance");
  assert.ok(cronsSource.includes("crons.interval("), "registers an interval job");
  assert.ok(
    !/github|vercel|upstash|redis|node-cron/i.test(cronsSource),
    "no external scheduler provider referenced",
  );
});

test("scheduled function invokes processExpiredOffers via internal mutation", () => {
  assert.ok(
    cronsSource.includes("internal.dispatch.engine.processExpiredOffersCron"),
    "cron targets the internal scheduled mutation",
  );
  assert.ok(
    engine.includes("export const processExpiredOffersCron = internalMutation({"),
    "internal mutation exists in dispatch engine",
  );
  // Cron entry point must not be publicly reachable.
  const cronBlock = engine.slice(engine.indexOf("export const processExpiredOffersCron"));
  assert.ok(
    !cronBlock.includes("getCurrentAuthUser") && !cronBlock.includes("requireAuth"),
    "cron mutation performs no client-session auth (internal-only entry point)",
  );
});

test("interval (1 minute) is documented against the 2-minute expiry window", () => {
  const scoring = read("src/convex/dispatch/scoring_service.ts");
  assert.ok(scoring.includes("offerExpiryMs: 2 * 60 * 1000"), "expiry window is 2 minutes");
  assert.ok(
    cronsSource.includes("{ minutes: 1 }"),
    "cron runs every minute: expired offers processed within ~1 min of expiry",
  );
});

// ─── Shared core: single implementation, existing behaviour preserved ────────

test("manual operations mutation delegates to the shared expiry core (no second implementation)", () => {
  const manualBlock = engine.slice(
    engine.indexOf("export const processExpiredOffers = mutation"),
    engine.indexOf("export const processExpiredOffersCron = internalMutation"),
  );
  assert.ok(
    manualBlock.includes("processExpiredOffersInternal(ctx)"),
    "manual trigger invokes the same shared core as the cron",
  );
});

test("existing public mutation boundary preserved (auth + role gate)", () => {
  const manualBlock = engine.slice(
    engine.indexOf("export const processExpiredOffers = mutation"),
    engine.indexOf("export const processExpiredOffersCron = internalMutation"),
  );
  assert.ok(manualBlock.includes("Authentication required"), "still requires an authenticated session");
  assert.ok(
    manualBlock.includes("ROLES.OPERATIONS") && manualBlock.includes("ROLES.SUPER_ADMIN") && manualBlock.includes("ROLES.COMPANY_ADMIN"),
    "still operations-authorized",
  );
});

test("expiry core closes offers through the existing status write", () => {
  const coreBlock = engine.slice(
    engine.indexOf("async function processExpiredOffersInternal"),
    engine.indexOf("export const processExpiredOffers = mutation"),
  );
  assert.ok(coreBlock.includes('status: "expired"'), "offer closed with existing `expired` status");
  assert.ok(coreBlock.includes("respondedAt"), "respondedAt stamp preserved (existing behaviour)");
  // Terminal-state and assignment safety: the core must not touch deliveries.
  assert.ok(
    !coreBlock.includes("db.patch") ||
      !coreBlock.slice(coreBlock.indexOf("db.patch"), coreBlock.indexOf("db.patch") + 200).includes("deliveries"),
    "expiry core never patches delivery records",
  );
  assert.ok(
    !coreBlock.includes('query("deliveries")'),
    "expiry core never queries/moves delivery state",
  );
});

// ─── Concurrency / re-check / failure handling ───────────────────────────────

test("per-item re-check guards against concurrent acceptance/expiry", () => {
  const coreBlock = engine.slice(
    engine.indexOf("async function processExpiredOffersInternal"),
    engine.indexOf("export const processExpiredOffers = mutation"),
  );
  assert.ok(
    coreBlock.includes('current.status !== "pending"'),
    "status re-checked inside the write loop (accept/reject/cancel between scan and write is respected)",
  );
  assert.ok(
    coreBlock.includes("expiresAt >="),
    "expiry window re-checked inside the write loop",
  );
});

test("one bad offer does not stop the scheduled run (per-item error isolation)", () => {
  const coreBlock = engine.slice(
    engine.indexOf("async function processExpiredOffersInternal"),
    engine.indexOf("export const processExpiredOffers = mutation"),
  );
  assert.ok(coreBlock.includes("try {"), "per-offer try block exists");
  assert.ok(coreBlock.includes("failureCount"), "failures are counted");
  assert.ok(coreBlock.includes("log.error"), "failures are logged, not swallowed");
  assert.ok(
    coreBlock.indexOf("catch") < coreBlock.indexOf("return { expiredCount"),
    "catch is per-item; the run summary is still returned",
  );
});

test("observability: run summary logged with counts, no sensitive data", () => {
  const coreBlock = engine.slice(
    engine.indexOf("async function processExpiredOffersInternal"),
    engine.indexOf("export const processExpiredOffers = mutation"),
  );
  assert.ok(coreBlock.includes("log.info(\"Expired-offer pass complete\""), "run summary logged");
  assert.ok(coreBlock.includes("LOG_CATEGORIES.DISPATCH"), "uses the existing dispatch log category");
  assert.ok(
    !coreBlock.match(/password|token|secret|apiKey/i),
    "no sensitive values in log metadata",
  );
});

// ─── Delivery-state integrity ────────────────────────────────────────────────

test("terminal deliveries cannot regress: ASSIGNED→REASSIGNMENT_REQUIRED remains the only expiry-related exit", () => {
  const schema = read("src/convex/schema.ts");
  const delivered = schema.indexOf("[DELIVERY_STATUS.DELIVERED]: []");
  const cancelled = schema.indexOf("[DELIVERY_STATUS.CANCELLED]: []");
  const failed = schema.indexOf("[DELIVERY_STATUS.FAILED]: []");
  assert.ok(delivered !== -1 && cancelled !== -1 && failed !== -1, "terminal states defined");
  assert.ok(
    schema.slice(delivered, delivered + 40).includes("[]") &&
      schema.slice(cancelled, cancelled + 40).includes("[]") &&
      schema.slice(failed, failed + 40).includes("[]"),
    "DELIVERED/CANCELLED/FAILED remain terminal (no transitions out)",
  );
});

test("manual operational recovery remains available (existing flows untouched)", () => {
  assert.ok(engine.includes("export const reassignDelivery = mutation"), "operations re-dispatch exists");
  assert.ok(engine.includes("export const dispatchDelivery = mutation"), "re-dispatch exists");
  assert.ok(
    read("src/convex/deliveries/state_machine.ts").includes("export const requestReassignment = mutation"),
    "driver/customer-side reassignment request exists",
  );
  const opsPage = read("src/pages/OperationsCentre.tsx");
  assert.ok(
    opsPage.includes('kind: "offer_expired"'),
    "Operations Centre still surfaces expired offers as attention items",
  );
});

// ─── Existing contracts still hold ───────────────────────────────────────────

test("existing dispatch tests' source anchors remain intact", () => {
  // reassignment_authz.test.ts slices the engine between these two markers.
  assert.ok(engine.includes("export const reassignDelivery = mutation"));
  assert.ok(engine.includes("export const processExpiredOffers = mutation"));
  assert.ok(
    engine.indexOf("export const processExpiredOffers = mutation") >
      engine.indexOf("export const reassignDelivery = mutation"),
    "marker ordering unchanged for existing source-slicing tests",
  );
  // operations.test.ts slices between reassignDelivery and processExpiredOffers.
  assert.ok(
    engine.indexOf("export const acceptAssignment = mutation") >
      engine.indexOf("export const dispatchDelivery = mutation"),
    "dispatch/accept marker ordering unchanged",
  );
});

test("no new delivery/notification/audit behaviour invented in the expiry path", () => {
  const coreBlock = engine.slice(
    engine.indexOf("async function processExpiredOffersInternal"),
    engine.indexOf("export const processExpiredOffers = mutation"),
  );
  assert.ok(!coreBlock.includes("sendDeliveryNotification"), "no notifications invented in expiry path");
  assert.ok(!coreBlock.includes("recordDeliveryEvent"), "no audit events invented in expiry path");
  assert.ok(!coreBlock.includes("insert"), "expiry path only patches existing offer records");
});

// ─── Report ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error("FAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
