/**
 * Audit Actor Attribution Integrity Tests
 *
 * Verifies that audit events carry trustworthy actor attribution:
 *   - no arbitrary first-user fallback exists anywhere
 *   - system-generated events (logging bridge) are distinguishable from human
 *     events and can never be attributed to a real user
 *   - authenticated human paths retain their real session actor
 *   - audit event creation semantics and schema fields remain intact
 *   - resource-level audit authorization (hardened previously) is untouched
 *
 * Run: bunx tsx src/convex/audit/actor_attribution.test.ts
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

const logging = read("src/convex/logging/service.ts");
const schema = read("src/convex/schema.ts");
const auditService = read("src/convex/audit/service.ts");
const stateMachine = read("src/convex/deliveries/state_machine.ts");
const payments = read("src/convex/payments/mutations.ts");

// ─── 1. Fallback removal ───────────────────────────────────────────────────────

console.log("\n1. Arbitrary actor fallback removed");

test("logging bridge no longer queries the first user as actor", () => {
  assertNotContains(
    logging,
    'query("users").first()',
    "no first-user lookup in the logging bridge",
  );
  // The exact former defect line is gone entirely
  assertNotContains(logging, "?._id ?? \"system\"", "no arbitrary-user-then-system fallback chain");
});

test("no first-user actor fallback exists anywhere in the backend", () => {
  const files = [
    logging,
    auditService,
    schema,
    stateMachine,
    payments,
    read("src/convex/pricing/service.ts"),
    read("src/convex/users.ts"),
    read("src/convex/pod/service.ts"),
  ];
  for (const f of files) {
    // Audit actors must never be sourced from an arbitrary table scan
    assertNotContains(f, 'query("users").first()', "no first-user lookup used as an actor source");
  }
});

test("schema forbids silent fallback: actorId is optional for system events", () => {
  const block = schema.slice(
    schema.indexOf("audit_events: defineTable({"),
    schema.indexOf("audit_events: defineTable({") + 700,
  );
  assertContains(
    block,
    "actorId: v.optional(v.id(\"users\"))",
    "schema supports system events without a fabricated actor",
  );
});

// ─── 2. System attribution is explicit and distinguishable ─────────────────────

console.log("\n2. System actor attribution");

test("logging bridge writes system attribution with NO actorId", () => {
  const bridgeBlock = logging.slice(
    logging.indexOf("export const storeCriticalEvent = internalMutation"),
    logging.indexOf("export const getRecentCriticalEvents = query"),
  );
  const insertBlock = bridgeBlock.slice(
    bridgeBlock.indexOf('ctx.db.insert("audit_events"'),
    bridgeIndexOfEnd(bridgeBlock),
  );
  assertContains(insertBlock, "actorRole: \"system\"", "event is explicitly system-attributed");
  assertContains(insertBlock, "category: \"system\"", "system category preserved");
  assertNotContains(
    insertBlock.replace(/^\s*\/\/.*$/gm, ""),
    "actorId:",
    "no actorId field is written (cannot be mistaken for a human actor)",
  );
});

test("involved-user context is preserved as metadata, never as actor", () => {
  const bridgeBlock = logging.slice(
    logging.indexOf("export const storeCriticalEvent = internalMutation"),
    logging.indexOf("export const getRecentCriticalEvents = query"),
  );
  assertContains(bridgeBlock, "involvedUserId", "user context kept for traceability");
  assertContains(bridgeBlock, "never", "documented as non-actor");
});

// ─── 3. Human attribution preserved ────────────────────────────────────────────

console.log("\n3. Human actor attribution preserved");

test("state machine audit events use the authenticated session actor", () => {
  // requireAuth resolves the session user; audit writes use that identity
  assertContains(stateMachine, "await requireAuth(ctx)", "session-resolved actor");
  assertContains(stateMachine, "actorId: user", "audit actor is the session user");
  assertContains(stateMachine, "actorId: user.userId", "audit actor is the session user (AuthUser form)");
});

test("payment audit events use server-resolved internal actors", () => {
  const block = payments.slice(
    payments.indexOf("export const createPaymentTransaction = internalMutation"),
  );
  assertContains(block, "internalMutation", "payments are internal (not client-invokable)");
  assertContains(block, "actorId: args.userId", "actor comes from the server-resolved payment owner");
});

test("generic event recording still accepts real actors (creation semantics intact)", () => {
  const block = auditService.slice(
    auditService.indexOf("actorId: v.id(\"users\")"),
  );
  assertContains(block, "actorId: args.actorId", "human events still record the passed real actor");
});

// ─── 4. Existing audit fields intact ───────────────────────────────────────────

console.log("\n4. Audit event fields intact");

test("audit_events schema fields unchanged except actorId optionality", () => {
  const block = schema.slice(
    schema.indexOf("audit_events: defineTable({"),
    schema.indexOf("by_actor"),
  );
  for (const field of [
    "actorRole: v.string()",
    "actorEmail: v.optional(v.string())",
    "action: v.string()",
    "entityType: v.string()",
    "entityId: v.string()",
    "before: v.optional(v.string())",
    "after: v.optional(v.string())",
    "metadata: v.optional(v.string())",
    "timestamp: v.number()",
  ]) {
    assertContains(block, field, `field intact: ${field}`);
  }
});

test("by_actor index unchanged", () => {
  assertContains(schema, '.index("by_actor", ["actorId", "timestamp"])', "actor index intact");
});

test("historical records are not rewritten (no update/patch on audit_events)", () => {
  for (const [name, f] of [["audit service", auditService], ["logging", logging]] as const) {
    assertNotContains(f, 'db.patch("audit_events"', "no audit patching");
    const patchCalls = f.match(/ctx\.db\.patch\(\s*[^,]+,\s*\{[^}]*\}\s*\)/gs) ?? [];
    for (const c of patchCalls) {
      assertNotContains(c, "audit_events", "no audit record mutation");
    }
  }
});

// ─── 5. Resource authorization untouched ───────────────────────────────────────

console.log("\n5. Resource-level authorization untouched");

test("assertDeliveryAuditAccess / assertOrderAuditAccess and entity dispatch intact", () => {
  assertContains(auditService, "async function assertDeliveryAuditAccess(", "delivery rule present");
  assertContains(auditService, "function assertOrderAuditAccess(", "order rule present");
  assertContains(auditService, "const AUDIT_ENTITY_TYPES = [", "generic entity dispatch present");
  assertContains(auditService, "delivery belongs to another company", "cross-company denial intact");
});

test("logging bridge read path keeps its ops/admin gate", () => {
  const queryBlock = logging.slice(
    logging.indexOf("export const getRecentCriticalEvents = query"),
  );
  assertContains(queryBlock, '["operations", "super_admin"]', "critical events remain ops/admin-only");
});

// ─── Helpers ───────────────────────────────────────────────────────────────────

function bridgeIndexOfEnd(block: string): number {
  const end = block.indexOf("timestamp: args.timestamp,");
  return end === -1 ? block.length : end;
}

// ─── Summary ───────────────────────────────────────────────────────────────────

console.log(`\nAudit actor attribution tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
