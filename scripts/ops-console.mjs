// ─── Ops manual-completion console for the last stuck deliveries ────────────
// These 4 deliveries' pricing/pickup geometry is too remote for candidate
// scoring (50 km cap). Operations completes them via the real manual path:
// PENDING_DISPATCH → ASSIGNED (manual assignment via the existing
// assignDriver mutation used by the Operations Centre), then the assigned
// driver runs the lifecycle and POD as usual.
import {
  AgentClient,
  gpsFix,
  recordFailure,
  summarizeFailures,
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

// Ops resolves each driver's profile + vehicle via the roster (real query).
const roster = (await ops.query("users/driverApplications:getDriverRoster", {})) ?? [];
const assignable = roster.filter((r) => r.hasProfile && r.vehicle);
console.log(`  assignable drivers: ${assignable.length}`);

const raceLost = (err) =>
  /claimed|already been assigned|not pending|expired|cancelled|state/i.test(
    err?.message ?? String(err)
  );

let completed = 0;
const all = await ops.query("deliveries/state_machine:getAllDeliveriesForOps", { limit: 500 });
const stuck = (all ?? []).filter((d) =>
  ["pending_dispatch", "assigned", "reassignment_required"].includes(d.status)
);
console.log(`  stuck deliveries: ${stuck.length}`);

// Ops confirms the 13 REQUESTED leftovers (ops holds the requested→
// pending_dispatch transition permission) before manual completion.
for (const delivery of (all ?? []).filter((d) => d.status === "requested")) {
  await ops.mutateSoft(
    "deliveries/state_machine:dispatchDelivery",
    { deliveryId: delivery._id },
    "opsConfirmRequested",
    raceLost
  );
}
const refreshed = (await ops.query("deliveries/state_machine:getAllDeliveriesForOps", { limit: 500 })) ?? [];
const dispatchable = refreshed.filter((d) =>
  ["pending_dispatch", "assigned", "reassignment_required"].includes(d.status)
);
console.log(`  dispatchable after confirm: ${dispatchable.length}`);

// Agent drivers only — the roster also holds real staff accounts from earlier
// manual testing, which have no agent client to drive them.
const agentAssignable = assignable.filter((r) => /agent\.driver\d+@/.test(r.email ?? ""));
console.log(`  agent assignable drivers: ${agentAssignable.length}`);

for (const delivery of dispatchable) {
  // Pick a driver round-robin and resolve their REAL vehicle id via their own
  // driver-app query (the roster's vehicle is a display projection without _id).
  const pick = agentAssignable[completed % agentAssignable.length];
  if (!pick) break;
  const driverClient = drivers.find(
    (d) => d.i + 1 === Number(pick.email?.match(/driver(\d+)@/)?.[1] ?? 0)
  );
  if (!driverClient) continue;
  const profile = await driverClient.client.query("users/driverApplications:getMyDispatchIdentity", {});
  const vehicleId = profile?.vehicle?._id;
  if (!vehicleId) {
    console.log(`  · skip ${delivery.trackingNumber} (driver has no active vehicle)`);
    continue;
  }

  // 1. Reset to PENDING_DISPATCH if needed (reassignDelivery also clears dead offers).
  if (delivery.status !== "pending_dispatch") {
    await ops.mutateSoft(
      "dispatch/engine:reassignDelivery",
      { deliveryId: delivery._id, reason: "Ops manual completion — dispatch geometry out of range" },
      "manualReassign",
      raceLost
    );
  }

  // 2. Manual assignment (the Operations Centre's own mutation):
  //    PENDING_DISPATCH → ASSIGNED with driver + vehicle.
  const assigned = await ops.mutateSoft(
    "deliveries/state_machine:assignDriver",
    {
      deliveryId: delivery._id,
      driverId: pick.driverId,
      vehicleId,
    },
    "manualAssign",
    raceLost
  );
  if (!assigned) {
    console.log(`  · skip ${delivery.trackingNumber} (assignment rejected)`);
    continue;
  }

  // 3. The driver runs the lifecycle. It's assigned via offer-less manual
  //    flow, so the driver uses the state-machine transitions directly
  //    (acceptAssignment on the delivery, not the offer).
  const driver = drivers.find((d) => d.i + 1 === Number(pick.email?.match(/driver(\d+)@/)?.[1] ?? 0));
  const d = driver?.client;
  if (!d) continue;

  const accepted = await d.mutateSoft(
    "deliveries/state_machine:acceptAssignment",
    { deliveryId: delivery._id },
    "manualAccept",
    raceLost
  );
  if (!accepted) continue;

  for (const fn of [
    "deliveries/state_machine:startEnRouteToPickup",
    "deliveries/state_machine:arriveAtPickup",
    "deliveries/state_machine:pickupPackage",
    "deliveries/state_machine:startTrip",
    "deliveries/state_machine:arriveAtDropoff",
  ]) {
    const ok = await d.mutateSoft(fn, { deliveryId: delivery._id }, fn.split(":")[1], raceLost);
    if (!ok) break;
  }
  await d.mutate("pod/service:createPOD", {
    deliveryId: delivery._id,
    outcome: "delivered",
    recipientName: delivery.details?.recipientName ?? "Recipient",
    deliveryNotes: "Ops manual completion — agent-submitted POD",
    latitude: delivery.dropoffLat,
    longitude: delivery.dropoffLng,
  });
  const done = await d.mutateSoft(
    "deliveries/state_machine:completeDelivery",
    { deliveryId: delivery._id },
    "manualComplete",
    raceLost
  );
  if (done) completed++;
  await sleep(400);
}

console.log(`  manually completed: ${completed}`);

// ─── Final platform verification ─────────────────────────────────────────────
console.log("\n  ── FINAL PLATFORM STATE ──");
const finalAll = await ops.query("deliveries/state_machine:getAllDeliveriesForOps", { limit: 500 });
const byStatus = {};
for (const d of finalAll ?? []) byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
console.log("  deliveries by status:", JSON.stringify(byStatus));

// Driver economics after all settlements.
const rosterAfter = (await ops.query("users/driverApplications:getDriverRoster", {})) ?? [];
const totalTrips = rosterAfter.reduce((s, r) => s + (r.totalTrips ?? 0), 0);
console.log(`  fleet total trips (from settlements): ${totalTrips}`);

const failureCount = summarizeFailures("OPS MANUAL PASS");
process.exit(failureCount === 0 ? 0 : 1);
