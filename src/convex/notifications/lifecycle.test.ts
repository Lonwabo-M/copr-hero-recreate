/**
 * Notification Lifecycle Tests
 *
 * Verifies the delivery-notification lifecycle wiring:
 *   - delivery lifecycle events in the state machine dispatch the correct
 *     existing notification types to server-resolved recipients
 *   - dispatch offers notify the authoritative target driver
 *   - POD completion and payment confirmation notify the customer
 *   - recipient IDs are never accepted from the client
 *   - idempotency: (eventType, deliveryId, user) dedup + eventKey index
 *   - preferences are enforced where the existing model opts out
 *   - cross-user notification access remains blocked
 *   - deep links point to role-specific existing routes
 *   - no external notification provider (SMS/email/push) is introduced
 *
 * Run: bunx tsx src/convex/notifications/lifecycle.test.ts
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
    throw new Error(`Assertion failed: ${message}. Expected NOT to find: "${needle}"`);
  }
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf-8");
}

const stateMachine = read("src/convex/deliveries/state_machine.ts");
const engine = read("src/convex/dispatch/engine.ts");
const pod = read("src/convex/pod/service.ts");
const payments = read("src/convex/payments/mutations.ts");
const service = read("src/convex/notifications/service.ts");
const schema = read("src/convex/schema.ts");
const notificationsPage = read("src/pages/Notifications.tsx");
const driverHome = read("src/pages/DriverHome.tsx");

// ─── 1. Domain-event wiring: every lifecycle transition notifies ─────────────

test("delivery creation notifies the customer (both creation paths)", () => {
  // Both createOrderAndDelivery and createDelivery send delivery_created.
  const matches = stateMachine.match(/notifyDeliveryEvent\(\s*ctx,\s*"delivery_created"/g);
  assertTrue(matches !== null && matches.length === 2, "expected exactly 2 delivery_created call sites");
});

test("driver assignment → accepted → pickup → transit → dropoff each notify", () => {
  const expected = [
    "delivery_assigned",
    "delivery_accepted",
    "delivery_en_route_pickup",
    "delivery_arrived_pickup",
    "delivery_picked_up",
    "delivery_in_transit",
    "delivery_arrived_dropoff",
  ];
  for (const eventType of expected) {
    assertContains(
      stateMachine,
      `notifyDeliveryEvent(ctx, "${eventType}"`,
      `state machine must send ${eventType}`,
    );
  }
});

test("completion, failure, cancellation, rejection and reassignment notify", () => {
  const expected = [
    "delivery_completed",
    "delivery_failed",
    "delivery_cancelled",
    "delivery_rejected",
    "delivery_reassigned",
  ];
  for (const eventType of expected) {
    assertContains(
      stateMachine,
      `notifyDeliveryEvent(ctx, "${eventType}"`,
      `state machine must send ${eventType}`,
    );
  }
});

test("failed delivery notification includes a customer-safe reason", () => {
  assertContains(
    stateMachine,
    `notifyDeliveryEvent(ctx, "delivery_failed", args.deliveryId, {\n      templateData: { reason: args.reason ?? "See your delivery page for details" },\n    })`,
    "failure notification must carry the structured reason (or a customer-safe fallback)",
  );
});

test("dispatch offers notify the target driver", () => {
  assertContains(
    engine,
    `eventType: "delivery_offer"`,
    "dispatch engine must send the driver-facing delivery_offer notification",
  );
  assertContains(
    engine,
    `recipientUserIds: [args.driverId]`,
    "offer notification recipient must be the offer's authoritative driver",
  );
});

test("POD completion notifies the customer via the order's sender", () => {
  assertContains(
    pod,
    `internal.notifications.service.sendDeliveryNotification`,
    "POD completion must send a delivery notification",
  );
  // The POD path resolves the sender server-side from the order.
  const podSection = pod.slice(pod.indexOf("completeDeliveryWithPOD"));
  assertContains(podSection, "order?.senderId", "POD recipient must be the order sender");
});

test("payment confirmation notifies the paying customer", () => {
  assertContains(
    payments,
    `internal.notifications.service.sendPaymentNotification`,
    "payment completion must send a payment notification",
  );
  assertContains(
    payments,
    `eventType: "payment_confirmed"`,
    "payment event must be payment_confirmed",
  );
  assertContains(
    payments,
    `userId: tx.userId`,
    "payment recipient must be the transaction's authoritative payer",
  );
});

// ─── 2. Recipient resolution is server-side ──────────────────────────────────

test("customer recipient is resolved from the authoritative order sender", () => {
  // The helper resolves the sender from the order record, not from args.
  const helper = stateMachine.slice(
    stateMachine.indexOf("async function notifyDeliveryEvent"),
    stateMachine.indexOf("async function notifyDeliveryEvent") + 2500,
  );
  assertContains(helper, "delivery.orderId", "helper must resolve the delivery's order");
  assertContains(helper, "order?.senderId", "helper must resolve the order's sender");
  assertNotContains(
    helper,
    "args.customerId",
    "recipient must never come from client args",
  );
  assertNotContains(
    helper,
    "args.userId",
    "recipient must never come from client args",
  );
});

test("notification fan-out failure never fails the domain transaction", () => {
  const helper = stateMachine.slice(
    stateMachine.indexOf("async function notifyDeliveryEvent"),
    stateMachine.indexOf("async function notifyDeliveryEvent") + 2500,
  );
  assertContains(helper, "try {", "fan-out must be error-isolated");
  assertContains(helper, "catch (error)", "fan-out must catch errors");
});

// ─── 3. Idempotency ──────────────────────────────────────────────────────────

test("eventKey idempotency exists in schema with a unique per-user index", () => {
  assertContains(schema, "eventKey: v.optional(v.string())", "schema needs eventKey");
  assertContains(schema, `.index("by_user_event", ["userId", "eventKey"])`, "schema needs by_user_event index");
});

test("sendDeliveryNotification dedupes on (eventType, deliveryId)", () => {
  assertContains(
    service,
    'const eventKey = `${args.eventType}:${args.deliveryId}`;',
    "eventKey must be derived server-side from event + delivery",
  );
  assertContains(
    service,
    `withIndex("by_user_event"`,
    "dedup check must use the by_user_event index",
  );
  assertContains(
    service,
    "if (existing) {\n        continue;\n      }",
    "existing (user, event) notification must be skipped, not duplicated",
  );
});

test("created notifications persist the eventKey", () => {
  const sendSection = service.slice(
    service.indexOf("export const sendDeliveryNotification"),
    service.indexOf("export const sendPaymentNotification"),
  );
  assertContains(sendSection, "eventKey,", "inserted notification must store eventKey");
});

// ─── 4. Preferences ──────────────────────────────────────────────────────────

test("delivery notifications respect the existing deliveryUpdates preference", () => {
  const sendSection = service.slice(
    service.indexOf("export const sendDeliveryNotification"),
    service.indexOf("export const sendPaymentNotification"),
  );
  assertContains(
    sendSection,
    "!prefs.deliveryUpdates && template.category === \"delivery\"",
    "delivery-category events must honour the deliveryUpdates opt-out",
  );
});

// ─── 5. Cross-user security ──────────────────────────────────────────────────

test("getMyNotifications is session-scoped", () => {
  const q = service.slice(
    service.indexOf("export const getMyNotifications"),
    service.indexOf("export const getUnreadCount"),
  );
  assertContains(q, `withIndex("by_user", (q) => q.eq("userId", user.userId))`, "query must filter by session user");
});

test("markAsRead verifies notification ownership", () => {
  const m = service.slice(
    service.indexOf("export const markAsRead"),
    service.indexOf("export const markAllAsRead"),
  );
  assertContains(m, "if (notification.userId !== user)", "ownership check must compare to session user");
  assertContains(m, 'throw new Error("Access denied")', "foreign notifications must be denied");
});

test("public createNotification ignores client-supplied target userId", () => {
  const m = service.slice(
    service.indexOf("export const createNotification"),
    service.indexOf("createNotification") + 2000,
  );
  // The arg is documented as ignored and the record is written for the session user.
  assertContains(m, "// ignored — kept for API compatibility", "client userId must be explicitly ignored");
  assertContains(m, "userId: user.userId", "notification must target the session user only");
});

// ─── 6. Boundary: no financial internals in customer notifications ───────────

test("no lifecycle path sends financial/settlement notifications", () => {
  // The pre-existing template set contains a settlement_completed entry, but
  // no domain wiring may send it (external payouts do not exist yet).
  for (const [name, src] of [
    ["state machine", stateMachine],
    ["dispatch engine", engine],
    ["pod service", pod],
    ["payments", payments],
  ] as const) {
    assertNotContains(src, "settlement_completed", `${name}: must not send settlement notifications`);
    assertNotContains(src, "invoice_generated", `${name}: must not send invoice notifications`);
    assertNotContains(src, "payment_received", `${name}: wallet credit notifications must not leak to lifecycle wiring`);
  }
});

// ─── 7. Deep links ───────────────────────────────────────────────────────────

test("customer notification deep link targets the customer delivery page", () => {
  assertContains(
    notificationsPage,
    "navigate(`/deliveries/${n.entityId}`)",
    "delivery notifications must deep-link to /deliveries/:deliveryId",
  );
  assertNotContains(
    notificationsPage,
    "/driver/",
    "customer notifications must never link into the driver app",
  );
  assertNotContains(
    notificationsPage,
    "/operations",
    "customer notifications must never link into operations",
  );
});

test("driver home surfaces in-app notifications from the existing query", () => {
  assertContains(
    driverHome,
    "api.notifications.service.getMyNotifications",
    "driver surface must reuse the existing session-scoped query",
  );
  // No separate notification architecture on the driver side.
  assertNotContains(driverHome, "setTimeout", "no browser-side notification fabrication");
  assertNotContains(driverHome, "localStorage", "no browser-only notification state");
});

// ─── 8. No external channels ─────────────────────────────────────────────────

test("no external notification provider is referenced in the notification path", () => {
  for (const [name, src] of [
    ["notifications service", service],
    ["state machine", stateMachine],
    ["dispatch engine", engine],
    ["pod service", pod],
  ] as const) {
    assertNotContains(src, "twilio", `${name}: no Twilio`);
    assertNotContains(src, "sendgrid", `${name}: no SendGrid`);
    assertNotContains(src, "resend", `${name}: no Resend`);
    assertNotContains(src, "firebase", `${name}: no Firebase`);
    assertNotContains(src, "expo-push", `${name}: no Expo push`);
  }
});

test("no polling/websocket/redis realtime infrastructure was introduced", () => {
  for (const [name, src] of [
    ["notifications page", notificationsPage],
    ["driver home", driverHome],
  ] as const) {
    assertNotContains(src, "setInterval", `${name}: no polling loops`);
    assertNotContains(src, "WebSocket", `${name}: no WebSockets`);
  }
});

// ─── Results ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
