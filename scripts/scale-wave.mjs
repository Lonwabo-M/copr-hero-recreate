// ─── Scale waves: 25 customers + 3 drivers, then 100 customers + 10 drivers ─
// Agents drive the real product flows concurrently:
//   customer sign-up → onboarding → orders (pricing, waybills)
//   driver sign-up → driver role → application → admin approval
//   ops dispatch broadcast → driver offer sweeps (2-min expiry) → accept
//   full state machine → GPS breadcrumb → POD → delivered (settlement)
//   + exception flows (declines → reassignment, cancellations) + recovery pass
import {
  AgentClient,
  customerOnboard,
  customerCreateOrder,
  driverClaimRole,
  driverSubmitApplication,
  adminClaimRole,
  gpsFix,
  recordFailure,
  summarizeFailures,
  pick,
  jitter,
  FIRST_NAMES,
  LAST_NAMES,
  SA_CITIES,
} from "./agent-harness.mjs";

const PASSWORD = process.env.DEMO_ACCOUNTS_PASSWORD ?? "";
if (!PASSWORD) {
  console.error("DEMO_ACCOUNTS_PASSWORD is not set — export it before running this script.");
  process.exit(1);
}
const CUSTOMERS_TOTAL = Number(process.env.CUSTOMERS ?? 25);
const DRIVERS_TOTAL = Number(process.env.DRIVERS ?? 3);
const ONBOARD_CONCURRENCY = Number(process.env.CONCURRENCY ?? 6);
const EMAIL_DOMAIN = process.env.EMAIL_DOMAIN ?? "lasha.test";
// Start index so wave 3 continues after wave 2 without email collisions.
const CUSTOMER_START = Number(process.env.CUSTOMER_START ?? 0);
const DRIVER_START = Number(process.env.DRIVER_START ?? 0);
// Complete lifecycles (vs leave orders in flight)? Wave 3 sets WAVE_MODE=full.
const COMPLETE_ALL = process.env.WAVE_MODE === "full";
// Exception-flow probability (declines/cancels) in full mode.
const DECLINE_RATE = 0.15;
const CANCEL_RATE = 0.1;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Shared agents ───────────────────────────────────────────────────────────
console.log(`\n═══ WAVE: ${CUSTOMERS_TOTAL} customers + ${DRIVERS_TOTAL} drivers (start c${CUSTOMER_START}/d${DRIVER_START}, mode=${COMPLETE_ALL ? "full" : "flight"}) ═══\n`);

const admin = new AgentClient();
await admin.signUp(`agent.admin@${EMAIL_DOMAIN}`, PASSWORD, "Lasha Admin");
await adminClaimRole(admin);

const ops = new AgentClient();
await ops.signUp(`agent.ops@${EMAIL_DOMAIN}`, PASSWORD, "Lasha Operations");
await ops.mutate("users/testAccess:claimTestAreaAccess", { area: "operations" });

// ─── 1. Driver agents: sign-up → claim → apply ──────────────────────────────
const drivers = [];
for (let i = 0; i < DRIVERS_TOTAL; i++) {
  const idx = DRIVER_START + i;
  const email = `agent.driver${idx + 1}@${EMAIL_DOMAIN}`;
  const d = new AgentClient();
  const name = `${pick(FIRST_NAMES, idx * 3 + 7)} ${pick(LAST_NAMES, idx * 5 + 2)}`;
  await d.signUp(email, PASSWORD, name);
  await driverClaimRole(d);
  await driverSubmitApplication(d, idx);
  drivers.push({ i: idx, client: d, email });
}
console.log(`  ✓ ${drivers.length} driver application(s) submitted`);

// ─── 2. Admin agent approves every pending application ──────────────────────
{
  const pending = await admin.query("users/driverApplications:getApplicationsForReview", { status: "pending" });
  let approved = 0;
  for (const app of pending ?? []) {
    const res = await admin.mutate("users/driverApplications:acceptDriverApplication", { applicationId: app._id });
    if (res) approved++;
  }
  console.log(`  ✓ admin approved ${approved} application(s)`);
}

// ─── 3. Customer agents: sign-up → onboarding (pooled concurrency) ──────────
const customers = [];
const queue = Array.from({ length: CUSTOMERS_TOTAL }, (_, k) => CUSTOMER_START + k);
async function onboardWorker() {
  while (queue.length > 0) {
    const idx = queue.shift();
    const email = `agent.customer${idx + 1}@${EMAIL_DOMAIN}`;
    const c = new AgentClient();
    const name = `${pick(FIRST_NAMES, idx)} ${pick(LAST_NAMES, idx * 7 + 3)}`;
    try {
      await c.signUp(email, PASSWORD, name);
      await customerOnboard(c, idx);
      const order = await customerCreateOrder(c, idx);
      customers.push({ idx, client: c, order });
    } catch (err) {
      recordFailure("customer setup", err, { email });
      customers.push({ idx, client: c, order: null });
    }
  }
}
await Promise.all(Array.from({ length: ONBOARD_CONCURRENCY }, onboardWorker));
const withOrders = customers.filter((c) => c.order);
const totalRevenue = withOrders.reduce((s, c) => s + c.order.price, 0);
console.log(`  ✓ ${customers.filter((c) => !c.order).length === 0 ? CUSTOMERS_TOTAL : customers.length} customers onboarded, ${withOrders.length} orders created (R${(totalRevenue / 100).toFixed(2)} quoted)`);

// ─── 4. Drivers go on-air at their deterministic home base ──────────────────
// Each driver keeps a fixed home city across runs — the server's implied-
// velocity check (≤200 km/h between fixes) correctly rejects teleporting a
// driver across the country between waves.
for (const { i, client } of drivers) {
  const city = pick(SA_CITIES, i);
  const res = await client.mutateSoft(
    "tracking/mutations:updateDriverLocation",
    { location: gpsFix(jitter(city.lat, 0.05), jitter(city.lng, 0.05), { accuracy: 8, speed: 0 }) },
    "driverHomeBase",
    (err) => /km\/h|speed/i.test(err?.message ?? "")
  );
  if (res) console.log(`  ✓ driver${i + 1} on-air at ${city.name}`);
}

// ─── 5. Dispatch loop: one delivery at a time, immediate offer sweep ────────
// Offers expire 2 minutes after broadcast and the per-driver pending-offer
// cap (2) plus active-assignment cap (3) bound the pool, so ops broadcasts
// ONE delivery and sweeps before the next — the realistic dispatch cadence.
const stats = { delivered: 0, inFlight: 0, declined: 0, cancelled: 0, failed: 0, noEligible: 0 };

async function runLifecycle(driver, offer, order, outcome) {
  const deliveryId = offer.deliveryId;
  const d = driver.client;
  const soft = (fn, args, label, isExpected) => d.mutateSoft(fn, args, label, isExpected);
  const raceLost = (err) => /claimed|already been assigned|not pending|expired|cancelled|pending_dispatch|assigned\" state/i.test(err?.message ?? String(err));

  const accepted = await soft(
    "dispatch/engine:acceptAssignment",
    { offerId: offer._id },
    "acceptAssignment",
    raceLost
  );
  if (!accepted) return "lost";

  const steps = [
    "deliveries/state_machine:startEnRouteToPickup",
    "deliveries/state_machine:arriveAtPickup",
    "deliveries/state_machine:pickupPackage",
    "deliveries/state_machine:startTrip",
    "deliveries/state_machine:arriveAtDropoff",
  ];
  for (const fn of steps) {
    const ok = await soft(fn, { deliveryId }, fn.split(":")[1], raceLost);
    if (!ok) return "lost";
  }
  // No per-delivery GPS breadcrumb here: the server throttles delivery-
  // location updates to ≥10s per driver and caps implied velocity at 200 km/h,
  // so rapid-fire completions legitimately reject fixes. The state-machine
  // transitions already write the tracking-event timeline; scale waves rely
  // on that plus each driver's on-air home-base fix.

  if (outcome === "fail") {
    const res = await soft(
      "deliveries/state_machine:failDelivery",
      { deliveryId, reason: "Agent role-play: recipient unreachable at dropoff" },
      "failDelivery",
      raceLost
    );
    return res ? "failed" : "lost";
  }

  await d.mutate("pod/service:createPOD", {
    deliveryId,
    outcome: "delivered",
    recipientName: order.recipientName ?? "Recipient",
    deliveryNotes: "Agent-submitted proof of delivery",
    latitude: order.dropoffLat,
    longitude: order.dropoffLng,
  });
  const done = await soft(
    "deliveries/state_machine:completeDelivery",
    { deliveryId },
    "completeDelivery",
    raceLost
  );
  return done ? "delivered" : "lost";
}

for (let k = 0; k < withOrders.length; k++) {
  const { client, order } = withOrders[k];

  // Customer confirms the request (REQUESTED → PENDING_DISPATCH).
  await client.mutate("deliveries/state_machine:dispatchDelivery", {
    deliveryId: order.deliveryId,
  });

  // Ops broadcasts offers.
  const res = await ops.mutate("dispatch/engine:dispatchDelivery", {
    deliveryId: order.deliveryId,
  });
  if (res && !res.success) {
    stats.noEligible++;
    continue;
  }

  // Immediate offer sweep: every driver checks and reacts.
  const sweepers = drivers.map(async (driver) => {
    const offers = await driver.client.query("dispatch/engine:getMyDispatchOffers", {});
    for (const offer of offers ?? []) {
      if (offer.deliveryId !== order.deliveryId) continue; // offer for another delivery
      const roll = Math.random();
      if (roll < DECLINE_RATE) {
        const rejected = await driver.client.mutateSoft(
          "dispatch/engine:rejectAssignment",
          { offerId: offer._id, reason: "Agent role-play: vehicle capacity already committed" },
          "declineOffer",
          (err) => /not pending|expired/i.test(err?.message ?? "")
        );
        if (rejected) stats.declined++;
        continue;
      }
      const outcome = roll > 0.97 ? "fail" : "delivered";
      const result = await runLifecycle(driver, offer, order, outcome);
      if (result === "delivered") stats.delivered++;
      else if (result === "failed") stats.failed++;
      else stats.inFlight++;
    }
  });
  await Promise.all(sweepers);

  if ((k + 1) % 10 === 0) {
    console.log(`  ${k + 1}/${withOrders.length} dispatched: ${stats.delivered} delivered / ${stats.declined} declined / ${stats.noEligible} no-eligible`);
  }
}

// ─── 6. Recovery pass: stuck deliveries (expired offers, declines) ──────────
const all = await ops.query("deliveries/state_machine:getAllDeliveriesForOps", { limit: 500 });
const stuck = (all ?? []).filter((d) =>
  ["pending_dispatch", "assigned", "driver_accepted", "en_route_to_pickup", "reassignment_required"].includes(d.status)
);
console.log(`  recovery pass: ${stuck.length} stuck delivery(ies)`);

// Customers still own un-confirmed requests: confirm those first.
const customerByOrder = new Map(withOrders.map((c) => [c.order.orderId, c]));
for (const delivery of stuck.filter((d) => d.status === "requested")) {
  const owner = customerByOrder.get(delivery.orderId);
  if (owner) {
    await owner.client.mutate("deliveries/state_machine:dispatchDelivery", {
      deliveryId: delivery._id,
    });
  }
}

for (const delivery of stuck.filter((d) => d.status !== "requested").slice(0, 25)) {
  // reassignDelivery handles every stuck state: it cancels dead offers,
  // resets the delivery to pending_dispatch, and re-broadcasts in one call.
  const res = await ops.mutateSoft(
    "dispatch/engine:reassignDelivery",
    { deliveryId: delivery._id, reason: "Agent recovery: re-dispatch after expiry/decline" },
    "recoveryReassign",
    (err) => /state|not authorized/i.test(err?.message ?? "")
  );
  if (res?.success) {
    // Immediate sweep — offers live 2 minutes.
    for (const driver of drivers) {
      const offers = await driver.client.query("dispatch/engine:getMyDispatchOffers", {});
      const offer = (offers ?? []).find((o) => o.deliveryId === delivery._id);
      if (offer) {
        const result = await runLifecycle(driver, offer, {
          pickupLat: delivery.pickupLat,
          pickupLng: delivery.pickupLng,
          dropoffLat: delivery.dropoffLat,
          dropoffLng: delivery.dropoffLng,
          recipientName: delivery.details?.recipientName,
        }, "delivered");
        if (result === "delivered") stats.delivered++;
        break;
      }
    }
  }
}// ─── 7. Customer cancellations while still pre-dispatch ─────────────────────
// Cancels only deliveries that are genuinely pre-dispatch (REQUESTED/PENDING)
// — the state machine correctly rejects cancelling a delivered order.
if (COMPLETE_ALL) {
  const finalForCancel = await ops.query("deliveries/state_machine:getAllDeliveriesForOps", { limit: 500 });
  const cancellable = (finalForCancel ?? []).filter((d) =>
    ["requested", "pending_dispatch", "assigned"].includes(d.status)
  );
  const target = Math.ceil(cancellable.length * CANCEL_RATE);
  const customerByOrder = new Map(withOrders.map((c) => [c.order.orderId, c]));
  for (const delivery of cancellable.slice(0, target)) {
    const owner = customerByOrder.get(delivery.orderId);
    if (!owner) continue;
    const res = await owner.client.mutateSoft(
      "deliveries/state_machine:cancelDelivery",
      { deliveryId: delivery._id, reason: "Agent role-play: customer changed requirements" },
      "cancelDelivery",
      (err) => /state/i.test(err?.message ?? "") // raced into pickup — expected
    );
    if (res) stats.cancelled++;
  }
  console.log(`  cancelled ${stats.cancelled} pre-dispatch delivery(ies)`);
}

// ─── 8. Wave summary from real queries ──────────────────────────────────────
const finalAll = await ops.query("deliveries/state_machine:getAllDeliveriesForOps", { limit: 500 });
const byStatus = {};
for (const d of finalAll ?? []) byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
console.log("\n  platform delivery status counts:", JSON.stringify(byStatus));

const failureCount = summarizeFailures(`WAVE c${CUSTOMER_START}+${CUSTOMERS_TOTAL}/d${DRIVER_START}+${DRIVERS_TOTAL}`);
console.log(`\n  WAVE RESULT: delivered=${stats.delivered} inFlight=${stats.inFlight} declined=${stats.declined} cancelled=${stats.cancelled} failed=${stats.failed} noEligible=${stats.noEligible}`);
process.exit(failureCount === 0 ? 0 : 1);
