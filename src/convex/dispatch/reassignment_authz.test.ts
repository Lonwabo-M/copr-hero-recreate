/**
 * Reassignment Authorization Tests
 *
 * Verifies the hardened authorization boundary for operational delivery
 * reassignment:
 *   - reassignDelivery (dispatch engine) is company-ownership scoped for
 *     COMPANY_ADMIN, using the SAME authoritative rule as dispatchDelivery.
 *   - requestReassignment (state machine) enforces the same rule, closing the
 *     bypass path into the same reassignment boundary.
 *   - The actor's identity, role, and company are resolved server-side from
 *     the Convex session — never from client args.
 *   - Ownership checks run BEFORE any write (cancel/patch/offer), so an
 *     unauthorized attempt fails atomically with no state change.
 *
 * Run: bunx tsx src/convex/dispatch/reassignment_authz.test.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── Test harness (matches repo pattern) ──────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`${name}: ${msg}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${msg}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected ${expected}, got ${actual}`);
  }
}

function assertTrue(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertContains(haystack: string, needle: string, message: string) {
  if (!haystack.includes(needle)) {
    throw new Error(`Assertion failed: ${message}. Expected to find: "${needle}"`);
  }
}

function assertNotContains(haystack: string, needle: string, message: string) {
  if (haystack.includes(needle)) {
    throw new Error(`Assertion failed: ${message}. Should NOT contain: "${needle}"`);
  }
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const engine = read("src/convex/dispatch/engine.ts");
const stateMachine = read("src/convex/deliveries/state_machine.ts");
const authz = read("src/convex/auth/authorization.ts");
const schema = read("src/convex/schema.ts");

// ─── Helpers to extract mutation blocks ───────────────────────────────────────

function reassignBlock(): string {
  const start = engine.indexOf("export const reassignDelivery = mutation");
  const end = engine.indexOf("export const processExpiredOffers = mutation");
  assertTrue(start !== -1, "reassignDelivery exists in dispatch engine");
  assertTrue(end !== -1 && end > start, "reassignDelivery block end found");
  return engine.slice(start, end);
}

function requestReassignmentBlock(): string {
  const start = stateMachine.indexOf("export const requestReassignment = mutation");
  const end = stateMachine.indexOf("export const getDelivery = query");
  assertTrue(start !== -1, "requestReassignment exists in state machine");
  assertTrue(end !== -1 && end > start, "requestReassignment block end found");
  return stateMachine.slice(start, end);
}

function dispatchBlock(): string {
  const start = engine.indexOf("export const dispatchDelivery = mutation");
  const end = engine.indexOf("export const acceptAssignment = mutation");
  assertTrue(start !== -1, "dispatchDelivery exists in dispatch engine");
  assertTrue(end !== -1 && end > start, "dispatchDelivery block end found");
  return engine.slice(start, end);
}

// ─── 1. Identity resolution is server-side ─────────────────────────────────────

console.log("\n1. Server-side identity resolution");

test("reassignDelivery resolves actor from the Convex session (getCurrentAuthUser)", () => {
  const block = reassignBlock();
  assertContains(
    block,
    "const user = await getCurrentAuthUser(ctx);",
    "actor identity comes from the session",
  );
  assertContains(
    block,
    'if (!user) throw new Error("Authentication required");',
    "unauthenticated actors are rejected",
  );
});

test("reassignDelivery accepts no client-supplied company/business/user/driver identity", () => {
  const block = reassignBlock();
  // args must only contain the delivery locator and operational parameters
  assertContains(
    block,
    "deliveryId: v.id(\"deliveries\"),",
    "delivery locator is accepted from the client",
  );
  assertNotContains(block, "businessId:", "no client-supplied businessId in args");
  assertNotContains(block, "companyId:", "no client-supplied companyId in args");
  // The ownership comparison must reference the session user's businessId and
  // the order record — never args.
  const authzSection = block.slice(
    block.indexOf("// 3. Check company ownership"),
    block.indexOf("// 4. Validate delivery is in reassignable state"),
  );
  assertContains(authzSection, "user.businessId", "ownership uses the session actor's company");
  assertContains(authzSection, "order.businessId", "ownership uses the order's company record");
});

test("schema ownership chain: deliveries.orderId -> orders.businessId -> businesses", () => {
  // Deliveries reference orders (orders table is defined before deliveries)
  const deliveriesBlock = schema.slice(
    schema.indexOf("deliveries: defineTable({"),
    schema.indexOf("deliveries: defineTable({") + 800,
  );
  assertContains(deliveriesBlock, "orderId: v.id(\"orders\")", "delivery references its order");
  // Orders carry the business association
  const ordersBlock = schema.slice(
    schema.indexOf("orders: defineTable({"),
    schema.indexOf("deliveries: defineTable({"),
  );
  // Users carry the session-side company association
  const usersBlock = schema.slice(
    schema.indexOf("users: defineTable({"),
    schema.indexOf("businesses: defineTable({"),
  );
  assertContains(usersBlock, "businessId: v.optional(v.id(\"businesses\"))", "user carries businessId");
  assertContains(ordersBlock, "businessId: v.optional(v.id(\"businesses\"))", "order carries businessId");
});

// ─── 2. Role authorization matrix ──────────────────────────────────────────────

console.log("\n2. Reassignment role authorization matrix");

test("role gate allows only operations / company_admin / super_admin", () => {
  const block = reassignBlock();
  assertContains(block, "ROLES.OPERATIONS,", "operations authorized");
  assertContains(block, "ROLES.COMPANY_ADMIN,", "company_admin authorized (ownership-scoped)");
  assertContains(block, "ROLES.SUPER_ADMIN,", "super_admin authorized");
  assertNotContains(block, "ROLES.DRIVER,", "drivers not in reassign role list");
  assertNotContains(block, "ROLES.CUSTOMER,", "customers not in reassign role list");
  // The state-machine driver requestReassignment is the only driver path,
  // and it is courier-scoped separately (driver may only request reassignment
  // for their own assigned delivery).
});

test("reassignDelivery enforces company ownership for COMPANY_ADMIN (same rule as dispatchDelivery)", () => {
  const block = reassignBlock();
  const authzSection = block.slice(
    block.indexOf("// 3. Check company ownership"),
    block.indexOf("// 4. Validate delivery is in reassignable state"),
  );
  assertContains(
    authzSection,
    "user.role === ROLES.COMPANY_ADMIN",
    "ownership check is scoped to company admins",
  );
  assertContains(
    authzSection,
    "!user.businessId || order.businessId !== user.businessId",
    "fail-closed ownership comparison: no company association or foreign order is denied",
  );
  assertContains(
    authzSection,
    "delivery belongs to another company",
    "denial is explicit, matching dispatchDelivery's denial",
  );
  // Same authoritative rule as dispatchDelivery
  const dispatch = dispatchBlock();
  assertContains(
    dispatch,
    "if (user.role === ROLES.COMPANY_ADMIN && order.businessId !== user.businessId)",
    "dispatchDelivery's existing ownership rule is unchanged",
  );
});

test("COMPANY_ADMIN with no company association fails closed", () => {
  const block = reassignBlock();
  const authzSection = block.slice(
    block.indexOf("// 3. Check company ownership"),
    block.indexOf("// 4. Validate delivery is in reassignable state"),
  );
  // !user.businessId is checked BEFORE the equality comparison
  assertTrue(
    authzSection.indexOf("!user.businessId") !== -1 &&
      authzSection.indexOf("!user.businessId") < authzSection.indexOf("order.businessId !== user.businessId"),
    "missing company association is denied before any comparison",
  );
});

test("OPERATIONS and SUPER_ADMIN are not ownership-scoped (existing authority preserved)", () => {
  const block = reassignBlock();
  const authzSection = block.slice(
    block.indexOf("// 3. Check company ownership"),
    block.indexOf("// 4. Validate delivery is in reassignable state"),
  );
  assertEqual(
    authzSection.split("ROLES.OPERATIONS").length - 1,
    0,
    "ownership check does not apply to operations",
  );
  assertEqual(
    authzSection.split("ROLES.SUPER_ADMIN").length - 1,
    0,
    "ownership check does not apply to super_admin",
  );
});

// ─── 3. Atomic failure behaviour ───────────────────────────────────────────────

console.log("\n3. Atomic failure behaviour");

test("ownership check runs BEFORE any write in reassignDelivery", () => {
  const block = reassignBlock();
  const ownershipPos = block.indexOf("// 3. Check company ownership");
  const cancelOffersPos = block.indexOf("await cancelOffersForDeliveryInternal");
  const patchPos = block.indexOf("await ctx.db.patch");
  assertTrue(ownershipPos !== -1, "ownership check present");
  assertTrue(cancelOffersPos !== -1, "offer cancellation write present");
  assertTrue(patchPos !== -1, "delivery patch write present");
  assertTrue(
    ownershipPos < cancelOffersPos && ownershipPos < patchPos,
    "authorization completes before offers are cancelled / delivery patched",
  );
});

test("unauthorized attempt cannot produce a misleading successful audit event", () => {
  // reassignDelivery creates no audit records at all (offer/dispatch domain);
  // the state-machine requestReassignment writes its audit event AFTER the
  // transition — verify ordering so a denied attempt never reaches the audit write.
  const block = requestReassignmentBlock();
  const ownershipPos = block.indexOf("Check company ownership");
  const auditPos = block.indexOf("recordDeliveryTransition");
  assertTrue(ownershipPos !== -1, "ownership check present in requestReassignment");
  assertTrue(auditPos !== -1, "audit write present in requestReassignment");
  assertTrue(ownershipPos < auditPos, "denied attempts never reach the audit write");
});

test("requestReassignment (state machine) enforces the same COMPANY_ADMIN ownership rule", () => {
  const block = requestReassignmentBlock();
  const authzSection = block.slice(
    block.indexOf("Check company ownership"),
    block.indexOf("Validate current state"),
  );
  assertContains(
    authzSection,
    "userRole === ROLES.COMPANY_ADMIN",
    "bypass path is also ownership-scoped",
  );
  assertContains(
    authzSection,
    "!actorBusinessId || order.businessId !== actorBusinessId",
    "same fail-closed comparison on the bypass path",
  );
  assertContains(
    authzSection,
    "delivery belongs to another company",
    "same explicit denial",
  );
  // The actor's company must come from the server-resolved user record
  assertContains(
    authzSection,
    "(currentUser as Doc<\"users\">).businessId",
    "company resolved from the authenticated user record",
  );
});

test("reassignment logic after authorization is unchanged (same state gate + re-dispatch flow)", () => {
  const block = reassignBlock();
  // Existing state gate preserved
  assertContains(block, "DELIVERY_STATUS.PENDING_DISPATCH,", "pending_dispatch reassignable");
  assertContains(block, "DELIVERY_STATUS.ASSIGNED,", "assigned reassignable");
  assertContains(block, "DELIVERY_STATUS.DRIVER_ACCEPTED,", "driver_accepted reassignable");
  assertContains(block, "DELIVERY_STATUS.REASSIGNMENT_REQUIRED,", "reassignment_required reassignable");
  // Existing flow preserved: cancel offers -> reset assignment -> re-dispatch
  assertContains(block, "await cancelOffersForDeliveryInternal", "offers cancelled");
  assertContains(block, "status: DELIVERY_STATUS.PENDING_DISPATCH,", "delivery reset to pending_dispatch");
  assertContains(block, "courierId: undefined,", "courier cleared");
  assertContains(block, "await createDispatchOfferInternal", "offers re-created");
});

// ─── 4. Authorization helpers unchanged ────────────────────────────────────────

console.log("\n4. Authorization helpers");

test("no second company-ownership mechanism invented (reuses session user + order record)", () => {
  // The ownership rule reads user.businessId / order.businessId directly, the
  // same fields used by dispatchDelivery — no new helper, no new table, no
  // new permission.
  assertContains(engine, "order.businessId !== user.businessId", "engine uses the canonical rule");
  assertContains(
    authz,
    "businessId?: Id<\"businesses\">",
    "AuthUser still exposes the session businessId",
  );
});

test("no broadened permissions in schema RBAC", () => {
  // The change adds an ownership constraint; no new permission strings or
  // role lists should appear.
  assertNotContains(engine, "PERMISSIONS.REASSIGN_ANY", "no invented permissions");
});

// ─── 5. Regression anchors ─────────────────────────────────────────────────────

console.log("\n5. Regression anchors");

test("dispatchDelivery role list unchanged", () => {
  const block = dispatchBlock();
  assertContains(block, "ROLES.OPERATIONS,", "operations can dispatch");
  assertContains(block, "ROLES.COMPANY_ADMIN,", "company_admin can dispatch (ownership-scoped)");
  assertContains(block, "ROLES.SUPER_ADMIN,", "super_admin can dispatch");
  assertContains(block, "ROLES.FLEET_MANAGER,", "fleet_manager can dispatch");
});

test("Operations Centre reassign action still wired to the engine mutation", () => {
  const opsPage = read("src/pages/OperationsCentre.tsx");
  assertContains(
    opsPage,
    "api.dispatch.engine.reassignDelivery",
    "UI still calls the hardened mutation",
  );
});

test("audit service reassignment actions untouched", () => {
  const auditService = read("src/convex/audit/service.ts");
  assertContains(auditService, "DELIVERY_REASSIGNED: \"delivery.reassigned\"", "audit action preserved");
});

// ─── Summary ───────────────────────────────────────────────────────────────────

console.log(`\nReassignment authorization tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
