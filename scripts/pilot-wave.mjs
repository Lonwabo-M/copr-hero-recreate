// ─── Pilot wave: 3 customers + 1 driver, full lifecycle ─────────────────────
import {
  AgentClient,
  customerOnboard,
  customerCreateOrder,
  driverClaimRole,
  driverSubmitApplication,
  adminClaimRole,
  recordFailure,
  summarizeFailures,
  pick,
  jitter,
  gpsFix,
  FIRST_NAMES,
  LAST_NAMES,
  SA_CITIES,
} from "./agent-harness.mjs";

const PASSWORD = "Lasha!Pump2026";

// ─── 1. Three customer agents: real sign-up → onboarding → order ────────────
const customers = [];
for (let i = 0; i < 3; i++) {
  const email = `agent.customer${i + 1}@lasha.test`;
  const c = new AgentClient();
  const name = `${pick(FIRST_NAMES, i)} ${pick(LAST_NAMES, i * 3 + 1)}`;
  try {
    await c.signUp(email, PASSWORD, name);
    const ob = await customerOnboard(c, i);
    if (ob) console.log(`  ✓ customer${i + 1} onboarded (${name})`);
    const order = await customerCreateOrder(c, i);
    if (order) {
      console.log(
        `  ✓ customer${i + 1} order ${order.trackingNumber} R${(order.price / 100).toFixed(2)}`
      );
    }
    customers.push({ i, client: c, order });
  } catch (err) {
    recordFailure("pilot customer setup", err, { email });
    customers.push({ i, client: c, order: null });
  }
}

// ─── 2. Driver agent: sign-up → claim driver role → apply ───────────────────
const driver = new AgentClient();
const driverEmail = "agent.driver1@lasha.test";
await driver.signUp(driverEmail, PASSWORD, "Sipho Mokoena");
await driverClaimRole(driver);
const app = await driverSubmitApplication(driver, 0);
if (app) console.log("  ✓ driver1 application submitted");

// ─── 3. Admin agent: claim admin, review, approve ────────────────────────────
const admin = new AgentClient();
await admin.signUp("agent.admin@lasha.test", PASSWORD, "Lasha Admin");
await adminClaimRole(admin);

const pending = await admin.query(
  "users/driverApplications:getApplicationsForReview",
  { status: "pending" }
);
if (pending && pending.length > 0) {
  const target = pending[0];
  const approve = await admin.mutate(
    "users/driverApplications:acceptDriverApplication",
    { applicationId: target._id }
  );
  if (approve) console.log(`  ✓ admin approved ${target.applicantName}`);
} else {
  console.log("  ! no pending applications found for admin review");
}

// ─── 4. Ops agent: dispatch the customers' deliveries ────────────────────────
const ops = new AgentClient();
await ops.signUp("agent.ops@lasha.test", PASSWORD, "Lasha Operations");
await ops.mutate("users/testAccess:claimTestAreaAccess", { area: "operations" });

// Place the driver near the first pickup via the real tracking mutation
// (candidates must be within 100 km of pickup).
const withOrder = customers.filter((c) => c.order);
if (withOrder.length > 0) {
  const first = withOrder[0].order;
  await driver.mutate("tracking/mutations:updateDriverLocation", {
    location: gpsFix(jitter(first.pickupLat, 0.01), jitter(first.pickupLng, 0.01), { accuracy: 10, speed: 0 }),
  });
}

// Customer confirms its request (REQUESTED → PENDING_DISPATCH), ops dispatches.
for (const { client, order } of withOrder) {
  await client.mutate("deliveries/state_machine:dispatchDelivery", {
    deliveryId: order.deliveryId,
  });
  const res = await ops.mutate("dispatch/engine:dispatchDelivery", {
    deliveryId: order.deliveryId,
  });
  if (res) {
    console.log(
      `  ✓ dispatch ${order.trackingNumber}: ${res.message} (evaluated ${res.candidatesEvaluated})`
    );
  }
}

// ─── 5. Driver agent: check offers, accept, run the lifecycle ───────────────
const offers = await driver.query("dispatch/engine:getMyDispatchOffers", {});
console.log(`  driver sees ${offers?.length ?? 0} pending offer(s)`);

// Accept ONLY an offer belonging to this run's deliveries — stale pending
// offers from earlier runs linger until the expiry cron closes them.
const myDeliveryIds = new Set(withOrder.map((c) => c.order.deliveryId));
const offer = offers?.find((o) => myDeliveryIds.has(o.deliveryId));

if (offer) {
  const accepted = await driver.mutate("dispatch/engine:acceptAssignment", {
    offerId: offer._id,
  });
  if (accepted) console.log("  ✓ driver accepted offer");

  const deliveryId = offer.deliveryId;
  const order = withOrder[0].order;

  const lifecycle = [
    "deliveries/state_machine:startEnRouteToPickup",
    "deliveries/state_machine:arriveAtPickup",
    "deliveries/state_machine:pickupPackage",
    "deliveries/state_machine:startTrip",
    "deliveries/state_machine:arriveAtDropoff",
  ];
  for (const fn of lifecycle) {
    await driver.mutate(fn, { deliveryId });
  }
  // Note: no mid-trip updateDeliveryLocation here — the server throttles
  // delivery-location updates to ≥10s apart (by design), and the driver's GPS
  // position plus the tracking event log already carry the breadcrumb trail.
  // Scale waves space delivery-location fixes naturally across dispatch cycles.

  // POD then completion (server requires a POD before DELIVERED).
  const pod = await driver.mutate("pod/service:createPOD", {
    deliveryId,
    outcome: "delivered",
    recipientName: order.recipientName ?? "Recipient",
    deliveryNotes: "Pilot wave — agent-submitted proof of delivery",
    latitude: order.dropoffLat,
    longitude: order.dropoffLng,
  });
  if (pod) console.log("  ✓ POD recorded");
  const done = await driver.mutate("deliveries/state_machine:completeDelivery", {
    deliveryId,
  });
  if (done) console.log("  ✓ delivery completed (settlement created)");
}

// ─── 6. Data sanity via real queries ─────────────────────────────────────────
const firstTracking = withOrder[0]?.order?.trackingNumber;
if (firstTracking) {
  const sanity = await ops.query("deliveries/state_machine:getDeliveryByTracking", {
    trackingNumber: firstTracking,
  });
  console.log(
    "sanity:",
    sanity ? `delivery status = ${sanity.status}` : "no delivery returned"
  );
}

// ─── Done ────────────────────────────────────────────────────────────────────
const failureCount = summarizeFailures("PILOT WAVE");
console.log(
  failureCount === 0 ? "\nPILOT PASSED" : `\nPILOT HAD FAILURES: ${failureCount}`
);
process.exit(failureCount === 0 ? 0 : 1);
