/**
 * Generic Audit Entity Authorization Tests
 *
 * Verifies the hardened resource-level authorization of
 * audit/service.getAuditEventsForEntity:
 *   - only the known entity-type set is accepted (arbitrary strings rejected
 *     at the argument level)
 *   - every supported type resolves the resource server-side and reuses the
 *     resource's existing ownership rule
 *   - pricing_rule is operations/admin-only (platform config, no ownership)
 *   - drivers/customers get access only where a schema-backed ownership
 *     relationship exists
 *   - missing entities and missing company associations fail closed
 *
 * Run: bunx tsx src/convex/audit/entity_authz.test.ts
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

const service = read("src/convex/audit/service.ts");
const schema = read("src/convex/schema.ts");

function entityQueryBlock(): string {
  const start = service.indexOf("export const getAuditEventsForEntity = query");
  const end = service.indexOf("export const getAuditEventsByActor = query");
  assertTrue(start !== -1, "getAuditEventsForEntity exists");
  assertTrue(end !== -1 && end > start, "block end found");
  return service.slice(start, end);
}

// ─── 1. Entity-type inventory is closed ────────────────────────────────────────

console.log("\n1. Supported entity-type set");

test("query accepts only the known entity-type set (no arbitrary strings)", () => {
  const block = entityQueryBlock();
  assertContains(
    service,
    "const AUDIT_ENTITY_TYPES = [",
    "supported entity types are declared explicitly",
  );
  assertContains(block, "...AUDIT_ENTITY_TYPES.map((t) => v.literal(t))", "args use a literal union, not v.string()");
  // entityType must not be a free-form string anymore
  const argsSection = block.slice(
    block.indexOf("args: {"),
    block.indexOf("handler:"),
  );
  assertNotContains(argsSection, "entityType: v.string()", "entityType is not free-form");
});

test("every declared entity type matches values actually written to audit_events", () => {
  const block = entityQueryBlock();
  // Types discovered by searching every writer in the repo (not from comments):
  const expected = [
    '"delivery"',          // recordDeliveryTransition
    '"order"',             // orders carry order-scoped events
    '"proof_of_delivery"', // recordPODEvent
    '"users"',             // users.ts profile updates
    '"businesses"',        // users/businessProfile.ts
    '"payment_transaction"', // payments/mutations.ts
    '"delivery_quote"',    // pricing/service.ts
    '"settlement"',        // pricing/service.ts
    '"pricing_rule"',      // pricing/service.ts
  ];
  for (const t of expected) {
    assertContains(block, t, `supported type ${t} is declared`);
  }
});

test("logging bridge 'unknown' type is NOT queryable", () => {
  const block = entityQueryBlock();
  assertNotContains(block, '"unknown"', "the logging bridge's 'unknown' type is excluded");
});

test("schema audit_events entityType field unchanged (creation side untouched)", () => {
  const block = schema.slice(
    schema.indexOf("audit_events: defineTable({"),
    schema.indexOf("audit_events: defineTable({") + 1400,
  );
  assertContains(block, "entityType: v.string()", "creation-side schema is unchanged");
  // actorId is now optional (system attribution) — but still user-id typed
  assertContains(block, "actorId: v.optional(v.id(\"users\"))", "actorId optional for system events");
});

// ─── 2. Resource resolution and reuse of existing rules ───────────────────────

console.log("\n2. Resource-level authorization per entity type");

test("delivery / POD entities reuse assertDeliveryAuditAccess (same rule as getDelivery)", () => {
  const block = entityQueryBlock();
  const deliveryCase = block.slice(
    block.indexOf('case "delivery"'),
    block.indexOf('case "order"'),
  );
  assertContains(deliveryCase, "await ctx.db.get(", "delivery resolved server-side");
  assertContains(deliveryCase, 'throw new Error("Delivery not found")', "missing delivery fails closed");
  assertContains(deliveryCase, "assertDeliveryAuditAccess", "reuses the hardened delivery rule");

  const podCase = block.slice(
    block.indexOf('case "proof_of_delivery"'),
    block.indexOf('case "users"'),
  );
  assertContains(podCase, "assertDeliveryAuditAccess", "POD scoped through its delivery");
});

test("order entity reuses assertOrderAuditAccess", () => {
  const block = entityQueryBlock();
  const orderCase = block.slice(
    block.indexOf('case "order"'),
    block.indexOf('case "proof_of_delivery"'),
  );
  assertContains(orderCase, "assertOrderAuditAccess", "reuses the hardened order rule");
  assertContains(orderCase, 'throw new Error("Order not found")', "missing order fails closed");
});

test("users entity: self or ops/admin only", () => {
  const block = entityQueryBlock();
  const usersCase = block.slice(
    block.indexOf('case "users"'),
    block.indexOf('case "businesses"'),
  );
  assertContains(usersCase, "target._id !== user.userId", "self-access allowed");
  assertContains(
    usersCase,
    'cannot view another user\'s audit events',
    "cross-user reads denied",
  );
});

test("businesses entity: owning company admin or ops/admin", () => {
  const block = entityQueryBlock();
  const bizCase = block.slice(
    block.indexOf('case "businesses"'),
    block.indexOf('case "payment_transaction"'),
  );
  assertContains(bizCase, "user.businessId !== business._id", "company scope enforced");
  assertContains(bizCase, "another company", "cross-company denial explicit");
});

test("payment / quote / settlement entities: owner or company scope via order", () => {
  const block = entityQueryBlock();
  for (const [entity, ownerField] of [
    ["payment_transaction", "txn.userId"],
    ["delivery_quote", "quote.userId"],
    ["settlement", "settlement.driverId"],
  ] as const) {
    const nextEntity = entity === "payment_transaction"
      ? 'case "delivery_quote"'
      : entity === "delivery_quote"
        ? 'case "settlement"'
        : 'case "pricing_rule"';
    const c = block.slice(block.indexOf(`case "${entity}"`), block.indexOf(nextEntity));
    assertContains(c, ownerField, `${entity} owner checked`);
    assertContains(c, "order.businessId === user.businessId", `${entity} company scope via order`);
    assertContains(c, "not found", "missing resource fails closed");
  }
});

test("pricing_rule is operations/admin-only (documented classification)", () => {
  const block = entityQueryBlock();
  const ruleCase = block.slice(
    block.indexOf('case "pricing_rule"'),
    block.indexOf("const events = await ctx.db"),
  );
  assertContains(ruleCase, "ROLES.OPERATIONS, ROLES.SUPER_ADMIN", "ops/admin-only role list");
  assertContains(ruleCase, "operations-only", "explicit classification denial");
  assertNotContains(ruleCase, "ROLES.DRIVER", "drivers not exposed to platform config audit");
  assertNotContains(ruleCase, "ROLES.CUSTOMER", "customers not exposed to platform config audit");
});

// ─── 3. Isolation invariants ───────────────────────────────────────────────────

console.log("\n3. Isolation invariants");

test("query performs authorization on every direct invocation (no caller-trust path)", () => {
  const block = entityQueryBlock();
  assertContains(
    block,
    "const user = await getCurrentAuthUser(ctx);",
    "identity from the session on every call",
  );
  assertContains(
    block,
    'if (!user) throw new Error("Authentication required");',
    "unauthenticated calls rejected",
  );
  // Authorization precedes the index read
  const authPos = block.indexOf("switch (args.entityType)");
  const readPos = block.indexOf('.withIndex("by_entity"');
  assertTrue(authPos !== -1 && readPos !== -1 && authPos < readPos, "auth runs before any data read");
});

test("COMPANY_ADMIN/DRIVER/CUSTOMER isolation embedded per-case (no role-only blanket allow)", () => {
  const block = entityQueryBlock();
  // There must be no blanket role allow-list that returns access for all
  // three roles without resource checks (the previous defect).
  const authSection = block.slice(
    block.indexOf("switch (args.entityType)"),
  );
  assertNotContains(
    authSection.slice(0, authSection.indexOf("case \"delivery\"")),
    "ROLES.COMPANY_ADMIN",
    "no pre-switch role blanket allow",
  );
});

test("hardened delivery/order audit queries remain intact", () => {
  assertContains(
    service,
    "await assertDeliveryAuditAccess(ctx, user, delivery);",
    "getAuditEventsForDelivery still resource-scoped",
  );
  assertContains(
    service,
    "assertOrderAuditAccess(user, order);",
    "getAuditEventsForOrder still resource-scoped",
  );
});

// ─── 4. Audit creation untouched ───────────────────────────────────────────────

console.log("\n4. Audit creation untouched");

test("recordGenericEvent / recordDeliveryTransition creation path unchanged", () => {
  const createBlock = service.slice(
    service.indexOf("export const recordDeliveryTransition = internalMutation"),
    service.indexOf("export const recordDeliveryTransition = internalMutation") + 1200,
  );
  assertContains(createBlock, "entityType: \"delivery\"", "delivery creation unchanged");
  assertContains(createBlock, "ctx.db.insert(\"audit_events\"", "insert path unchanged");
});

// ─── Summary ───────────────────────────────────────────────────────────────────

console.log(`\nGeneric audit entity authorization tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
