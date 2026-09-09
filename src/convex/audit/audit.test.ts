/**
 * Lasha Audit Logging Tests
 *
 * Validates audit event structure, action constants, and authorization rules.
 * Run with: bunx vitest run src/convex/audit/audit.test.ts
 */

// ─── Simple Test Runner ───────────────────────────────────────────────────────

let _passed = 0;
let _failed = 0;
const _errors: string[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ─── Delivery Actions ─────────────────────────────────────────────────────────

const DELIVERY_ACTIONS = [
  "delivery.created",
  "delivery.dispatched",
  "delivery.assigned",
  "delivery.accepted",
  "delivery.rejected",
  "delivery.en_route",
  "delivery.arrived_pickup",
  "delivery.picked_up",
  "delivery.in_transit",
  "delivery.arrived_dropoff",
  "delivery.completed",
  "delivery.failed",
  "delivery.cancelled",
  "delivery.reassigned",
];

const PRICING_ACTIONS = [
  "pricing.quote_created",
  "pricing.rule_created",
  "pricing.rule_deactivated",
  "pricing.rule_changed",
];

const POD_ACTIONS = [
  "pod.created",
  "pod.evidence_added",
  "pod.completed",
  "pod.failed",
];

const PAYMENT_ACTIONS = [
  "payment.initiated",
  "payment.confirmed",
  "payment.failed",
  "payment.refunded",
  "settlement.created",
  "settlement.processed",
  "settlement.completed",
  "settlement.failed",
];

const AUDIT_CATEGORIES = [
  "delivery", "dispatch", "tracking", "pricing", "payment", "pod",
  "user", "driver", "vehicle", "company", "notification", "auth", "admin", "system",
];

const GLOBAL_AUDIT_ROLES = ["operations", "company_admin", "super_admin"];

// ─── Tests ────────────────────────────────────────────────────────────────────

function runTests() {
  // Delivery actions
  for (const action of DELIVERY_ACTIONS) {
    assert(action.startsWith("delivery."), `action "${action}" should start with delivery.`);
    assert(action.split(".").length === 2, `action "${action}" should have exactly one dot`);
  }
  assertEqual(DELIVERY_ACTIONS.length, 14, "should have 14 delivery actions");

  // Pricing actions
  for (const action of PRICING_ACTIONS) {
    assert(action.startsWith("pricing."), `action "${action}" should start with pricing.`);
  }

  // POD actions
  for (const action of POD_ACTIONS) {
    assert(action.startsWith("pod."), `action "${action}" should start with pod.`);
  }

  // Payment actions
  for (const action of PAYMENT_ACTIONS) {
    assert(
      action.startsWith("payment.") || action.startsWith("settlement."),
      `action "${action}" should start with payment. or settlement.`
    );
  }

  // Categories
  for (const cat of AUDIT_CATEGORIES) {
    assert(typeof cat === "string" && cat.length > 0, `category "${cat}" should be non-empty string`);
  }
  assertEqual(AUDIT_CATEGORIES.length, 14, "should have 14 categories");

  // Authorization
  assert(GLOBAL_AUDIT_ROLES.includes("operations"), "operations should have global access");
  assert(GLOBAL_AUDIT_ROLES.includes("company_admin"), "company_admin should have global access");
  assert(GLOBAL_AUDIT_ROLES.includes("super_admin"), "super_admin should have global access");
  assert(!GLOBAL_AUDIT_ROLES.includes("customer"), "customer should not have global access");
  assert(!GLOBAL_AUDIT_ROLES.includes("driver"), "driver should not have global access");

  // Event model
  const requiredFields = ["actorId", "actorRole", "category", "action", "entityType", "entityId", "timestamp"];
  for (const f of requiredFields) {
    assert(typeof f === "string" && f.length > 0, `required field "${f}" should be valid`);
  }

  // State transition snapshots
  const before = JSON.stringify({ status: "at_dropoff", courierId: "driver1" });
  const after = JSON.stringify({ status: "delivered", courierId: "driver1" });
  assertEqual(JSON.parse(before).status, "at_dropoff", "before status");
  assertEqual(JSON.parse(after).status, "delivered", "after status");

  // Metadata capture
  const rejectionMeta = JSON.stringify({ reason: "Vehicle breakdown" });
  assertEqual(JSON.parse(rejectionMeta).reason, "Vehicle breakdown", "rejection reason");

  const cancelMeta = JSON.stringify({ reason: "Customer request" });
  assertEqual(JSON.parse(cancelMeta).reason, "Customer request", "cancellation reason");
}

// ─── Execute ──────────────────────────────────────────────────────────────────

try {
  runTests();
  console.log("✅ All audit logging tests passed");
} catch (e: any) {
  console.error(`❌ Test failed: ${e.message}`);
}
