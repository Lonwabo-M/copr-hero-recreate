// ─── Drain the final 4 stuck deliveries + complete cross-role verification ──
// The 4 remaining pending_dispatch deliveries failed candidate scoring
// because on-air drivers sat >50 km from their pickups. This pass places the
// FULL fleet on-air next to each delivery's pickup (drivers relocate via the
// real GPS mutation — plausible: drivers drive to jobs), then dispatches.
import {
  AgentClient,
  gpsFix,
  recordFailure,
  summarizeFailures,
  pick,
  jitter,
  SA_CITIES,
} from "./agent-harness.mjs";

const PASSWORD = "Lasha!Pump2026";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const ops = new AgentClient();
await ops.signUp("agent.ops@lasha.test", PASSWORD, "Lasha Operations");
await ops.mutate("users/testAccess:claimTestAreaAccess", { area: "operations" });

const drivers = [];
for (let i = 0; i < 15; i++) {
  const d = new AgentClient();
  try {
    await d.signUp(`agent.driver${i + 1}@lasha.test`, PASSWORD, "re-login");
    drivers.push({ i, client: d });
  } catch (err) {
    recordFailure("driver re-login", err, {});
  }
}

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
  for (const fn of [
    "deliveries/state_machine:startEnRouteToPickup",
    "deliveries/state_machine:arriveAtPickup",
    "deliveries/state_machine:pickupPackage",
    "deliveries/state_machine:startTrip",
    "deliveries/state_machine:arriveAtDropoff",
  ]) {
    const ok = await d.mutateSoft(fn, { deliveryId }, fn.split(":")[1], raceLost);
    if (!ok) return "lost";
  }
  await d.mutate("pod/service:createPOD", {
    deliveryId,
    outcome: "delivered",
    recipientName: order?.recipientName ?? "Recipient",
    deliveryNotes: "Final repositioning pass — agent-submitted POD",
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

let drained = 0;
for (let round = 0; round < 6; round++) {
  const all = await ops.query("deliveries/state_machine:getAllDeliveriesForOps", { limit: 500 });
  const active = (all ?? []).filter((d) =>
    ["pending_dispatch", "assigned", "reassignment_required"].includes(d.status)
  );
  console.log(`  round ${round + 1}: ${active.length} stuck`);
  if (active.length === 0) break;

  // Drivers reposition NEXT TO the first stuck pickup (plausible: driving to
  // the job). Implied velocity is satisfied because these are fresh waves.
  const target = active[0];
  for (const { i, client } of drivers.slice(0, 8)) {
    await client.mutateSoft(
      "tracking/mutations:updateDriverLocation",
      {
        location: gpsFix(
          jitter(target.pickupLat ?? -26.2, 0.03),
          jitter(target.pickupLng ?? 28.04, 0.03),
          { accuracy: 9, speed: 0 }
        ),
      },
      "reposition",
      (err) => /km\/h|10s apart/i.test(err?.message ?? "")
    );
    await sleep(250);
  }

  for (const delivery of active.slice(0, 2)) {
    const res =
      delivery.status === "pending_dispatch"
        ? await ops.mutateSoft("dispatch/engine:dispatchDelivery", { deliveryId: delivery._id }, "redispatch", raceLost)
        : await ops.mutateSoft(
            "dispatch/engine:reassignDelivery",
            { deliveryId: delivery._id, reason: "Repositioning recovery" },
            "recoveryReassign",
            raceLost
          );
    if (!res?.success) continue;
    for (const driver of drivers.slice(0, 8)) {
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
        break;
      }
    }
    await sleep(800);
  }
}

// ─── Complete cross-role verification ────────────────────────────────────────
console.log("\n  ── FULL PLATFORM VERIFICATION ──");
const finalAll = await ops.query("deliveries/state_machine:getAllDeliveriesForOps", { limit: 500 });
const byStatus = {};
for (const d of finalAll ?? []) byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
console.log("  deliveries by status:", JSON.stringify(byStatus));

// Driver economics: earnings reflect settlements from completions.
const d1 = drivers[0];
if (d1) {
  const summary = await d1.client.query("driver_earnings:getDriverEarningsSummary", {});
  console.log(
    `  driver#1 earnings: trips=${summary?.totalTrips ?? summary?.stats?.totalTrips ?? "?"} earnings=R${((summary?.totalEarnings ?? summary?.stats?.totalEarnings ?? 0) / 100).toFixed(2)}`
  );
  const history = await d1.client.query("deliveries/state_machine:getMyDeliveryHistory", { limit: 5 });
  console.log(`  driver#1 history entries: ${history?.length ?? 0}`);
}

// Ops: driver roster with GPS coverage.
const roster = await ops.query("users/driverApplications:getDriverRoster", {});
const gpsOn = (roster ?? []).filter((r) => r.hasGps).length;
console.log(`  roster: ${roster?.length ?? 0} drivers, ${gpsOn} with live GPS`);

// Ops: orders aggregation is queryable (searchable).
const ordersSearch = await ops.query("deliveries/state_machine:getAllDeliveriesForOps", {
  search: "LSH",
  limit: 10,
});
console.log(`  ops search "LSH": ${ordersSearch?.length ?? 0} hits`);

const failureCount = summarizeFailures("REPOSITIONING DRAIN");
console.log(`\n  DRAINED: ${drained}`);
process.exit(failureCount === 0 ? 0 : 1);
