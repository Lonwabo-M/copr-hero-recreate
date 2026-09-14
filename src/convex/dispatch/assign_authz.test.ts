/**
 * assignDriver Authorization Tests
 *
 * Verifies the B2 hardening: `assignDriver` (deliveries/state_machine.ts) now
 * enforces the COMPANY_ADMIN company-ownership rule already established by
 * `dispatchDelivery`, `reassignDelivery`, and `requestReassignment`.
 *
 * Follows the repository's source-verification pattern: pure-logic tests for
 * the ownership rule plus source assertions that authorization ordering,
 * fail-closed behaviour, write-before-authz prevention, and existing
 * eligibility checks hold in the implementation.
 */
import { readFileSync } from "fs";
import { strict as assert } from "assert";
import path from "path";

function read(relPath: string): string {
  return readFileSync(path.join(process.cwd(), relPath), "utf8");
}

const stateMachine = read("src/convex/deliveries/state_machine.ts");
const engine = read("src/convex/dispatch/engine.ts");
const schema = read("src/convex/schema.ts");
const authz = read("src/convex/auth/authorization.ts");

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

// ─── assignDriver source block ────────────────────────────────────────────────

function assignBlock(): string {
  const start = stateMachine.indexOf("export const assignDriver = mutation");
  const end = stateMachine.indexOf("export const acceptAssignment = mutation", start);
  assert.ok(start !== -1, "assignDriver exists in state machine");
  assert.ok(end !== -1 && end > start, "assignDriver block end found");
  return stateMachine.slice(start, end);
}

// ─── Pure-logic ownership rule (mirrors the authoritative check) ─────────────

interface OrderLike {
  businessId?: string;
}

/**
 * The authoritative COMPANY_ADMIN ownership rule shared by the assignment
 * operations: the actor's company comes from the session (never client args),
 * the delivery's company from its order, and both must exist and match.
 */
function companyAdminOwns(
  actorBusinessId: string | undefined,
  order: OrderLike | null,
): boolean {
  if (!order) return false;
  if (!actorBusinessId) return false;
  if (!order.businessId) return false;
  return order.businessId === actorBusinessId;
}

test("COMPANY_ADMIN can assign a driver for their own company's delivery", () => {
  assert.equal(companyAdminOwns("biz_1", { businessId: "biz_1" }), true);
});

test("COMPANY_ADMIN cannot assign a driver for another company's delivery", () => {
  assert.equal(companyAdminOwns("biz_1", { businessId: "biz_2" }), false);
});

test("COMPANY_ADMIN with no company association fails closed", () => {
  assert.equal(companyAdminOwns(undefined, { businessId: "biz_1" }), false);
  assert.equal(companyAdminOwns(undefined, null), false);
});

test("missing order/company resolution fails closed", () => {
  assert.equal(companyAdminOwns("biz_1", null), false);
  assert.equal(companyAdminOwns("biz_1", {}), false, "order without business is denied");
});

test("undefined !== undefined does not fail open (the B2 edge)", () => {
  // The old `order.businessId !== user.businessId` comparison alone passes
  // when both are undefined. The hardened rule requires both to be present.
  const bothUndefined = (undefined as string | undefined) !== (undefined as string | undefined);
  assert.equal(bothUndefined, false, "old bare comparison fails open");
  assert.equal(companyAdminOwns(undefined, {}), false, "hardened rule denies instead");
});

// ─── assignDriver implementation assertions ──────────────────────────────────

test("assignDriver enforces the COMPANY_ADMIN ownership rule before any write", () => {
  const block = assignBlock();
  assert.ok(
    block.includes("if ((user.role as string) === ROLES.COMPANY_ADMIN)"),
    "COMPANY_ADMIN branch exists",
  );
  assert.ok(
    block.includes("!actorBusinessId || !order.businessId || order.businessId !== actorBusinessId"),
    "fail-closed ownership comparison (requires both sides to exist)",
  );
  // Authorization ordering: the ownership check must appear before the first
  // delivery patch (the first write in the mutation).
  const authzPos = block.indexOf("Access denied: delivery belongs to another company");
  const firstWritePos = block.indexOf("await ctx.db.patch");
  assert.ok(authzPos !== -1, "ownership check present");
  assert.ok(firstWritePos !== -1, "assignment write present");
  assert.ok(authzPos < firstWritePos, "authorization executes before any write");
});

test("assignDriver still requires DELIVERY_ASSIGN permission (existing gate preserved)", () => {
  const block = assignBlock();
  assert.ok(
    block.includes("requirePermission(ctx, PERMISSIONS.DELIVERY_ASSIGN)"),
    "existing permission gate unchanged",
  );
});

test("order/company resolution fail-closed in assignDriver", () => {
  const block = assignBlock();
  assert.ok(
    block.includes('if (!order) throw new Error("Order not found")'),
    "missing order fails closed before ownership evaluation",
  );
});

test("unauthorized assignment produces no state change, offer change, or success audit", () => {
  const block = assignBlock();
  // Every write/side-effect must come after the ownership check.
  const authzPos = block.indexOf("Access denied: delivery belongs to another company");
  for (const marker of [
    "await ctx.db.patch",
    "recordDeliveryEvent(",
    "recordDeliveryTransition",
    "notifyDeliveryEvent(",
  ]) {
    const pos = block.indexOf(marker);
    assert.ok(pos !== -1, `side effect present: ${marker}`);
    assert.ok(pos > authzPos, `side effect occurs after authorization: ${marker}`);
  }
  assert.ok(!block.includes("cancelOffersForDeliveryInternal"), "assignDriver does not touch offers");
});

test("existing driver eligibility checks remain intact", () => {
  const block = assignBlock();
  assert.ok(block.includes("Driver not found"), "driver existence check");
  assert.ok(block.includes("driver_profiles"), "driver profile lookup");
  assert.ok(block.includes("Driver is not available"), "availability check");
  assert.ok(block.includes("Vehicle does not belong to this driver"), "vehicle-ownership check");
  assert.ok(block.includes("validateTransition(delivery.status, DELIVERY_STATUS.ASSIGNED)"), "state transition validation");
  assert.ok(
    block.includes('delivery.status !== DELIVERY_STATUS.PENDING_DISPATCH'),
    "pending_dispatch precondition unchanged",
  );
});

test("successful-assignment audit and notification behaviour preserved", () => {
  const block = assignBlock();
  assert.ok(block.includes("AUDIT_ACTIONS.DELIVERY_ASSIGNED"), "existing audit action preserved");
  assert.ok(block.includes('notifyDeliveryEvent(ctx, "delivery_assigned"'), "existing notification preserved");
});

// ─── Role matrix ─────────────────────────────────────────────────────────────

test("role matrix unchanged: operations/company_admin/super_admin hold DELIVERY_ASSIGN", () => {
  const ops = schema.indexOf("[ROLES.OPERATIONS]: [");
  const cap = schema.indexOf("[ROLES.COMPANY_ADMIN]: [");
  const sup = schema.indexOf("[ROLES.SUPER_ADMIN]: [");
  const opsBlock = schema.slice(ops, schema.indexOf("],", ops));
  const capBlock = schema.slice(cap, schema.indexOf("],", cap));
  const supBlock = schema.slice(sup, schema.indexOf("],", sup));
  assert.ok(opsBlock.includes("PERMISSIONS.DELIVERY_ASSIGN"), "operations keeps delivery:assign");
  assert.ok(capBlock.includes("PERMISSIONS.DELIVERY_ASSIGN"), "company_admin keeps delivery:assign");
  assert.ok(supBlock.includes("...Object.values(PERMISSIONS)"), "super_admin keeps all permissions");
});

test("FLEET_MANAGER behaviour unchanged (no DELIVERY_ASSIGN, therefore cannot assign)", () => {
  const start = schema.indexOf("[ROLES.FLEET_MANAGER]: [");
  const block = schema.slice(start, schema.indexOf("],", start));
  assert.ok(
    !block.includes("PERMISSIONS.DELIVERY_ASSIGN"),
    "fleet_manager does not hold delivery:assign — unchanged by this task",
  );
  const authzTest = read("src/convex/auth/authorization.test.ts");
  assert.ok(
    authzTest.includes('hasPermission(ROLES.FLEET_MANAGER, PERMISSIONS.DELIVERY_ASSIGN), false'),
    "existing fleet_manager authorization test still asserts denial",
  );
});

test("DRIVER and CUSTOMER remain denied via TRANSITION_PERMISSIONS and permission map", () => {
  const m = schema.match(/"pending_dispatch->assigned":\s*\[([^\]]*)\]/);
  assert.ok(m, "transition permission entry exists");
  const roles = m![1];
  assert.ok(roles.includes("operations") && roles.includes("company_admin") && roles.includes("super_admin"));
  assert.ok(!roles.includes("driver"), "driver denied");
  assert.ok(!roles.includes("customer"), "customer denied");
  assert.ok(!roles.includes("fleet_manager"), "fleet_manager not in transition map (denied)");
});

test("super_admin and operations are not subject to the company-ownership restriction", () => {
  const block = assignBlock();
  const ownershipBranch = block.slice(
    block.indexOf("if ((user.role as string) === ROLES.COMPANY_ADMIN)"),
    block.indexOf("// 3. Validate current state"),
  );
  assert.ok(!ownershipBranch.includes("ROLES.SUPER_ADMIN"), "super_admin unrestricted");
  assert.ok(!ownershipBranch.includes("ROLES.OPERATIONS"), "operations unrestricted");
  assert.ok(!ownershipBranch.includes("ROLES.FLEET_MANAGER"), "fleet_manager not referenced");
});

// ─── Same-class gap search: consistency across assignment operations ─────────

test("all COMPANY_ADMIN-assignment operations use the same fail-closed rule", () => {
  for (const [label, src, startMarker, endMarker] of [
    ["dispatchDelivery", engine, "export const dispatchDelivery = mutation", "export const acceptAssignment = mutation"],
    ["reassignDelivery", engine, "export const reassignDelivery = mutation", "async function processExpiredOffersInternal"],
    ["requestReassignment", stateMachine, "export const requestReassignment = mutation", "export const getDelivery = query"],
  ] as const) {
    const start = src.indexOf(startMarker);
    const end = src.indexOf(endMarker, start);
    const block = src.slice(start, end);
    assert.ok(
      block.includes("Access denied: delivery belongs to another company"),
      `${label} enforces company ownership`,
    );
    assert.ok(
      block.includes("!user.businessId") || block.includes("!actorBusinessId"),
      `${label} fails closed on missing company association`,
    );
  }
});

test("dispatchDelivery fail-open edge is fixed (B2 same-class sweep)", () => {
  const start = engine.indexOf("export const dispatchDelivery = mutation");
  const end = engine.indexOf("export const acceptAssignment = mutation", start);
  const block = engine.slice(start, end);
  assert.ok(
    block.includes("!user.businessId || !order.businessId || order.businessId !== user.businessId"),
    "dispatchDelivery now requires both sides to exist (undefined !== undefined no longer passes)",
  );
});

test("driver-side offer mutations remain scoped to the session driver", () => {
  const acceptBlock = engine.slice(
    engine.indexOf("export const acceptAssignment = mutation"),
    engine.indexOf("export const rejectAssignment = mutation"),
  );
  assert.ok(acceptBlock.includes("Only drivers can accept assignment offers"), "driver-only gate intact");
  assert.ok(
    acceptBlock.includes("driverId: userId"),
    "target driver derived from session, not client args",
  );
});

// ─── Cross-company driver target finding ─────────────────────────────────────

test("cross-company driver target: platform-wide courier model is consistent (no new fleet model invented)", () => {
  // driver_profiles has no business/company field; dispatchDelivery itself
  // offers any available driver to any company's delivery. Restricting the
  // target driver by company only in assignDriver would contradict dispatch
  // and invent a new fleet model — documented, not implemented.
  assert.ok(
    !schema.includes("driver_profiles: defineTable({") ||
      !schema.slice(schema.indexOf("driver_profiles: defineTable({"), schema.indexOf("driver_profiles: defineTable({") + 400).includes("businessId"),
    "driver_profiles has no business relationship to enforce",
  );
  // Existing target validation remains: driver exists, is available, vehicle belongs to driver.
  const block = assignBlock();
  assert.ok(block.includes("Driver is not available"), "target-driver availability still enforced");
  assert.ok(block.includes("Vehicle does not belong to this driver"), "target-driver vehicle binding still enforced");
});

// ─── Regression anchors ──────────────────────────────────────────────────────

test("existing test anchors preserved (state-machine / dispatch source slices)", () => {
  assert.ok(stateMachine.includes("export const requestReassignment = mutation"));
  assert.ok(stateMachine.indexOf("export const getDelivery = query") > stateMachine.indexOf("export const assignDriver = mutation"));
  assert.ok(engine.includes("export const reassignDelivery = mutation"));
  assert.ok(engine.includes("export const processExpiredOffers = mutation"));
});

test("no scoring, expiry, GPS, POD, payment, or settlement logic touched by this hardening", () => {
  const assignBlockStr = assignBlock();
  assert.ok(!assignBlockStr.includes("createScoringService"), "no scoring in assignDriver");
  const crons = read("src/convex/crons.ts");
  assert.ok(crons.includes("{ minutes: 1 }"), "offer-expiry cron unchanged");
  assert.ok(engine.includes("processExpiredOffersInternal"), "expiry core unchanged");
});

// ─── Report ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error("FAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
