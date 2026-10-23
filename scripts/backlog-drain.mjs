// ─── Backlog drain: real confirmations + dispatch for stranded requests ─────
// The early waves left a backlog of `requested` deliveries (created before the
// customer-confirm step was handled by the harness) plus whatever the latest
// waves left in `pending_dispatch`. This script:
//   1. Signs in as every agent customer account (real sign-ins — also verifies
//      every account is live) and confirms their REQUESTED deliveries.
//   2. Time-budgeted dispatch loop: ops broadcasts each pending_dispatch
//      delivery, drivers sweep + complete the lifecycle with POD.
// Re-run until it reports nothing left. All progress via the real API.
import {
  AgentClient,
  summarizeFailures,
  pick,
  SA_CITIES,
} from "./agent-harness.mjs";

const PASSWORD = process.env.DEMO_ACCOUNTS_PASSWORD ?? "";
if (!PASSWORD) {
  console.error("DEMO_ACCOUNTS_PASSWORD is not set — export it before running this script.");
  process.exit(1);
}
const EMAIL_DOMAIN = "lasha.test";
const CUSTOMER_COUNT = Number(process.env.CUSTOMER_COUNT ?? 280);
const DRIVER_COUNT = Number(process.env.DRIVER_COUNT ?? 25);
const CONFIRM_ONLY = process.env.DRAIN_MODE === "confirm";
const BUDGET_MS = Number(process.env.BUDGET_MS ?? 420_000);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now();
const left = () => BUDGET_MS - (Date.now() - t0);

console.log(`\n═══ BACKLOG DRAIN (customers=${CUSTOMER_COUNT} drivers=${DRIVER_COUNT} mode=${CONFIRM_ONLY ? "confirm" : "confirm+dispatch"}) ═══\n`);

const ops = new AgentClient();
await ops.signUp(`agent.ops@${EMAIL_DOMAIN}`, PASSWORD, "Lasha Operations");

// ─── 1. Confirm REQUESTED deliveries via their owning customers ─────────────
let confirmed = 0;
let customerSignins = 0;
const CHUNK = 20;
for (let start = 0; start < CUSTOMER_COUNT; start += CHUNK) {
  if (left() < 30_000) break;
  const batch = Array.from({ length: Math.min(CHUNK, CUSTOMER_COUNT - start) }, (_, k) => start + k);
  await Promise.all(
    batch.map(async (idx) => {
      const c = new AgentClient();
      try {
        await c.signUp(`agent.customer${idx + 1}@${EMAIL_DOMAIN}`, PASSWORD, "re-login");
      } catch {
        return; // account gap — fine
      }
      customerSignins++;
      const mine = await c.query("deliveries/state_machine:getMyDeliveries", {});
      for (const d of mine ?? []) {
        if (d.status !== "requested" || left() < 20_000) continue;
        const res = await c.mutateSoft(
          "deliveries/state_machine:dispatchDelivery",
          { deliveryId: d._id },
          "confirmRequested",
          (err) => /state|expected/i.test(err?.message ?? "")
        );
        if (res) confirmed++;
      }
    })
  );
  process.stdout.write(`  · confirmed ${confirmed} (signed in ${customerSignins}/${CUSTOMER_COUNT})\r`);
}
console.log(`\n  ✓ ${customerSignins} customer sign-ins, ${confirmed} request(s) confirmed`);

if (CONFIRM_ONLY) {
  summarizeFailures("DRAIN (confirm)");
  process.exit(0);
}

// ─── 2. Drivers on-air (deterministic home bases) ────────────────────────────
const drivers = [];
for (let d = 1; d <= DRIVER_COUNT; d++) {
  const a = new AgentClient();
  try {
    await a.signUp(`agent.driver${d}@${EMAIL_DOMAIN}`, PASSWORD, "re-login");
    drivers.push({ i: d - 1, client: a });
  } catch {
    // driver account gap — skip
  }
}
for (const { i, client } of drivers) {
  const city = pick(SA_CITIES, i);
  await client.mutateSoft(
    "tracking/mutations:updateDriverLocation",
    { location: { lat: city.lat + (Math.random() - 0.5) * 0.05, lng: city.lng + (Math.random() - 0.5) * 0.05, timestamp: Date.now(), accuracy: 8, speed: 0 } },
    "driverHomeBase",
    (err) => /km\/h|speed|frequency/i.test(err?.message ?? "")
  );
}
console.log(`  ✓ ${drivers.length} driver(s) signed in and on-air`);

// ─── 3. Dispatch loop (time-budgeted) ────────────────────────────────────────
const stats = { dispatched: 0, delivered: 0, noEligible: 0 };

async function runLifecycle(driver, offer) {
  const deliveryId = offer.deliveryId;
  const d = driver.client;
  const raceLost = (err) => /claimed|not pending|expired|cancelled|state/i.test(err?.message ?? "");
  const accepted = await d.mutateSoft("dispatch/engine:acceptAssignment", { offerId: offer._id }, "acceptAssignment", raceLost);
  if (!accepted) return false;
  for (const fn of [
    "deliveries/state_machine:startEnRouteToPickup",
    "deliveries/state_machine:arriveAtPickup",
    "deliveries/state_machine:pickupPackage",
    "deliveries/state_machine:startTrip",
    "deliveries/state_machine:arriveAtDropoff",
  ]) {
    const ok = await d.mutateSoft(fn, { deliveryId }, fn.split(":")[1], raceLost);
    if (!ok) return false;
  }
  await d.mutate("pod/service:createPOD", {
    deliveryId,
    outcome: "delivered",
    recipientName: "Backlog Recipient",
    deliveryNotes: "Backlog drain POD",
    latitude: -26.1,
    longitude: 28.05,
  });
  const done = await d.mutateSoft("deliveries/state_machine:completeDelivery", { deliveryId }, "completeDelivery", raceLost);
  return Boolean(done);
}

let pass = 0;
while (left() > 45_000) {
  pass++;
  const pendingList = await ops.query("deliveries/state_machine:getAllDeliveriesForOps", { limit: 500 });
  const pending = (pendingList ?? []).filter((d) => d.status === "pending_dispatch").slice(0, 40);
  if (pending.length === 0) {
    console.log("  ✓ no pending_dispatch deliveries left");
    break;
  }
  for (const delivery of pending) {
    if (left() < 30_000) break;
    const res = await ops.mutate("dispatch/engine:dispatchDelivery", { deliveryId: delivery._id });
    if (!res || !res.success) {
      stats.noEligible++;
      continue;
    }
    stats.dispatched++;
    // Immediate sweep: first driver with an offer completes the delivery.
    for (const driver of drivers) {
      const offers = await driver.client.query("dispatch/engine:getMyDispatchOffers", {});
      const offer = (offers ?? []).find((o) => o.deliveryId === delivery._id);
      if (offer) {
        if (await runLifecycle(driver, offer)) stats.delivered++;
        break;
      }
    }
  }
  console.log(`  pass ${pass}: dispatched=${stats.dispatched} delivered=${stats.delivered} noEligible=${stats.noEligible} (${Math.round(left() / 1000)}s left)`);
}

// ─── 4. Final status snapshot ────────────────────────────────────────────────
const finalList = await ops.query("deliveries/state_machine:getAllDeliveriesForOps", { limit: 500 });
const byStatus = {};
for (const d of finalList ?? []) byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
console.log("\n  platform delivery status counts:", JSON.stringify(byStatus));
console.log(`  DRAIN RESULT: confirmed=${confirmed} dispatched=${stats.dispatched} delivered=${stats.delivered} noEligible=${stats.noEligible}`);

summarizeFailures("DRAIN");
process.exit(0);
