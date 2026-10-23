// ─── Final recovery + verification pass ──────────────────────────────────────
// Signs back in as EVERY agent account (real sign-ins verify the accounts
// exist and sessions work), drains every stuck delivery through the real
// dispatch loop with paced re-broadcasts, then verifies each role's data via
// its own product queries.
import {
  AgentClient,
  gpsFix,
  recordFailure,
  summarizeFailures,
  pick,
  jitter,
  SA_CITIES,
} from "./agent-harness.mjs";

const PASSWORD = process.env.DEMO_ACCOUNTS_PASSWORD ?? "";
if (!PASSWORD) {
  console.error("DEMO_ACCOUNTS_PASSWORD is not set — export it before running this script.");
  process.exit(1);
}
const EMAIL_DOMAIN = "lasha.test";
const CUSTOMER_COUNT = Number(process.env.CUSTOMER_COUNT ?? 155);
const DRIVER_COUNT = Number(process.env.DRIVER_COUNT ?? 15);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log("\n═══ FINAL RECOVERY + VERIFICATION ═══\n");

// ─── 1. Sign in as every account (verifies all real accounts) ────────────────
const customers = new Map();
let signInOk = 0;
for (let i = 0; i < CUSTOMER_COUNT; i++) {
  const c = new AgentClient();
  try {
    await c.signUp(`agent.customer${i + 1}@${EMAIL_DOMAIN}`, PASSWORD, "re-login");
    customers.set(i + 1, c);
    signInOk++;
  } catch (err) {
    recordFailure("customer re-login", err, { i: i + 1 });
  }
}
console.log(`  ✓ ${signInOk}/${CUSTOMER_COUNT} customer accounts signed in`);

const drivers = [];
let driverOk = 0;
for (let i = 0; i < DRIVER_COUNT; i++) {
  const d = new AgentClient();
  try {
    await d.signUp(`agent.driver${i + 1}@${EMAIL_DOMAIN}`, PASSWORD, "re-login");
    drivers.push({ i, client: d });
    driverOk++;
  } catch (err) {
    recordFailure("driver re-login", err, { i: i + 1 });
  }
}
console.log(`  ✓ ${driverOk}/${DRIVER_COUNT} driver accounts signed in`);

const ops = new AgentClient();
await ops.signUp(`agent.ops@${EMAIL_DOMAIN}`, PASSWORD, "Lasha Operations");
await ops.mutate("users/testAccess:claimTestAreaAccess", { area: "operations" });

const admin = new AgentClient();
await admin.signUp(`agent.admin@${EMAIL_DOMAIN}`, PASSWORD, "Lasha Admin");
await admin.mutate("users/testAccess:claimTestAreaAccess", { area: "admin" });

// ─── 2. Drivers resume at their home base ────────────────────────────────────
for (const { i, client } of drivers) {
  const city = pick(SA_CITIES, i);
  await client.mutateSoft(
    "tracking/mutations:updateDriverLocation",
    { location: gpsFix(jitter(city.lat, 0.05), jitter(city.lng, 0.05), { accuracy: 8, speed: 0 }) },
    "driverHomeBase",
    (err) => /km\/h|speed|10s apart/i.test(err?.message ?? "")
  );
}

// ─── 3. Lifecycle helpers (same as scale wave) ───────────────────────────────
const raceLost = (err) =>
  /claimed|already been assigned|not pending|expired|cancelled|pending_dispatch|assigned" state/i.test(
    err?.message ?? String(err)
  );

async function runLifecycle(driver, offer, order) {
  const deliveryId = offer.deliveryId;
  const d = driver.client;
  const accepted = await d.mutateSoft(
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
    const ok = await d.mutateSoft(fn, { deliveryId }, fn.split(":")[1], raceLost);
    if (!ok) return "lost";
  }
  await d.mutate("pod/service:createPOD", {
    deliveryId,
    outcome: "delivered",
    recipientName: order?.recipientName ?? "Recipient",
    deliveryNotes: "Recovery pass — agent-submitted proof of delivery",
    latitude: order?.dropoffLat,
    longitude: order?.dropoffLng,
  });
  const done = await d.mutateSoft(
    "deliveries/state_machine:completeDelivery",
    { deliveryId },
    "completeDelivery",
    raceLost
  );
  return done ? "delivered" : "lost";
}

// ─── 4. Drain loop: paced re-broadcast + immediate sweep ─────────────────────
let drained = 0;
for (let round = 0; round < 12; round++) {
  const all = await ops.query("deliveries/state_machine:getAllDeliveriesForOps", { limit: 500 });
  const active = (all ?? []).filter((d) =>
    ["pending_dispatch", "assigned", "driver_accepted", "en_route_to_pickup", "reassignment_required"].includes(d.status)
  );
  console.log(`  round ${round + 1}: ${active.length} active/unassigned delivery(ies)`);

  if (active.length === 0) break;

  // Customers confirm any still-REQUESTED deliveries first.
  const requested = (all ?? []).filter((d) => d.status === "requested");
  for (const delivery of requested.slice(0, 5)) {
    // Find the owning customer by sender match on the delivery details.
    const senderEmail = delivery.details?.senderEmail;
    if (!senderEmail?.includes("agent.customer")) continue;
    const idx = Number(senderEmail.match(/agent\.customer(\d+)@/)?.[1] ?? 0) - 1;
    const owner = customers.get(idx + 1);
    if (owner) {
      await owner.mutateSoft(
        "deliveries/state_machine:dispatchDelivery",
        { deliveryId: delivery._id },
        "customerConfirm",
        (err) => /state/i.test(err?.message ?? "")
      );
    }
  }

  // Re-dispatch up to 4 stuck deliveries this round (paced, within offer window).
  const batch = active.slice(0, 4);
  for (const delivery of batch) {
    const res =
      delivery.status === "pending_dispatch"
        ? await ops.mutateSoft(
            "dispatch/engine:dispatchDelivery",
            { deliveryId: delivery._id },
            "redispatch",
            raceLost
          )
        : await ops.mutateSoft(
            "dispatch/engine:reassignDelivery",
            { deliveryId: delivery._id, reason: "Final recovery re-dispatch" },
            "recoveryReassign",
            raceLost
          );
    if (!res?.success) continue;

    // Immediate sweep across the whole fleet.
    let claimed = false;
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
        });
        if (result === "delivered") drained++;
        claimed = true;
        break;
      }
    }
    if (!claimed) await sleep(1200); // pace within the 2-minute offer window
  }
  await sleep(800);
}

// ─── 5. Verification via each role's own product queries ────────────────────
console.log("\n  ── verification ──");

// Ops view: final status counts.
const finalAll = await ops.query("deliveries/state_machine:getAllDeliveriesForOps", { limit: 500 });
const byStatus = {};
for (const d of finalAll ?? []) byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
console.log("  deliveries by status:", JSON.stringify(byStatus));

// Driver roster: every driver has profile + vehicle + availability.
const roster = await ops.query("users/driverApplications:getDriverRoster", {});
const withProfile = (roster ?? []).filter((r) => r.hasProfile && r.vehicle).length;
console.log(`  driver roster: ${roster?.length ?? 0} drivers, ${withProfile} with profile+vehicle`);

// Admin view: application pipeline fully processed.
const stillPending = await admin.query("users/driverApplications:getApplicationsForReview", { status: "pending" });
const approved = await admin.query("users/driverApplications:getApplicationsForReview", { status: "approved" });
console.log(`  applications: ${approved?.length ?? 0} approved, ${stillPending?.length ?? 0} still pending`);

// Customer view: a sample customer's own delivery list + onboarding state.
const sample = customers.get(42);
if (sample) {
  const mine = await sample.query("deliveries/state_machine:getMyDeliveries", {});
  const status = await sample.query("users/onboarding:getOnboardingStatus", {});
  console.log(
    `  customer#42: ${mine?.length ?? 0} deliveries visible, onboarding complete = ${status?.complete}`
  );
}

// Driver view: a sample driver's application status.
const sampleDriver = drivers[0];
if (sampleDriver) {
  const app = await sampleDriver.client.query("users/driverApplications:getMyDriverApplication", {});
  console.log(`  driver#1: application = ${app?.status}`);
}

// Public tracking: a delivered delivery resolves by tracking number.
const deliveredSample = (finalAll ?? []).find((d) => d.status === "delivered");
if (deliveredSample) {
  const track = await ops.query("deliveries/state_machine:getDeliveryByTracking", {
    trackingNumber: deliveredSample.trackingNumber,
  });
  console.log(
    `  tracking: ${deliveredSample.trackingNumber} → ${track?.status}, milestones present = ${Array.isArray(track?.milestones)}`
  );
}

const failureCount = summarizeFailures("FINAL PASS");
console.log(`\n  DRAINED: ${drained} recovered delivery(ies) delivered this pass`);
process.exit(failureCount === 0 ? 0 : 1);
