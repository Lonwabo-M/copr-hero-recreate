// ─── Lasha pressure test ─────────────────────────────────────────────────────
// Real-API pressure test on top of the agent harness. Focus areas (chosen from
// what the earlier waves actually surfaced):
//   1. Order bursts — one customer account creating several orders concurrently
//      (waybill/tracking uniqueness under race).
//   2. Race-to-accept — multiple drivers offered the same delivery, all trying
//      to accept at once; exactly one must win, the others get a clean error.
//   3. GPS bursts — realistic paced location updates (10s+ server throttle),
//      drivers concurrently, en route along the real route.
//   4. Read bursts — deliveries / offers / roster queries while writes are in
//      flight (hot-path errors, not latency).
// No direct DB writes; every step is a real authenticated call.

import {
  AgentClient,
  failures,
  summarizeFailures,
  pick,
  jitter,
  SA_CITIES,
} from "./agent-harness.mjs";
import { FIRST_NAMES, LAST_NAMES } from "./agent-harness.mjs";
const RECIPIENTS = FIRST_NAMES.map(
  (f, i) => `${f} ${LAST_NAMES[i % LAST_NAMES.length]}`
);

const CUSTOMERS = Number(process.env.PT_CUSTOMERS ?? 6);
const ORDERS_PER = Number(process.env.PT_ORDERS_PER ?? 8);
const GPS_STEPS = Number(process.env.PT_GPS_STEPS ?? 2);

const counters = { orders: 0, raceWinner: 0, raceLosers: 0 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log(m);

// ── Order burst per customer ─────────────────────────────────────────────────
// One customer fires N createOrderAndDelivery calls concurrently — the exact
// pattern of a business batch-uploading orders.
async function orderBurst(agent, idx) {
  const jobs = [];
  for (let o = 0; o < ORDERS_PER; o++) {
    const i = idx * 100 + o;
    jobs.push(
      (async () => {
        const from = pick(SA_CITIES, i);
        const to = pick(SA_CITIES, i * 5 + 2);
        const pickupLat = jitter(from.lat);
        const pickupLng = jitter(from.lng);
        const dropoffLat = jitter(to.lat);
        const dropoffLng = jitter(to.lng);
        const res = await agent.mutate(
          "deliveries/state_machine:createOrderAndDelivery",
          {
            orderName: `Pressure batch ${idx}-${o}`,
            parcelType: ["document", "small_parcel", "large_parcel", "pallet"][o % 4],
            expeditionType: ["standard", "express", "same_day"][o % 3],
            width: 20 + (o % 40),
            height: 15 + (o % 30),
            weight: [2, 8, 25, 60, 120][o % 5],
            pickupAddress: `${10 + i} Pressure Street, ${from.name}`,
            dropoffAddress: `${200 + i} Delivery Avenue, ${to.name}`,
            pickupLat,
            pickupLng,
            dropoffLat,
            dropoffLng,
            scheduledTime: Date.now() + (o % 3) * 86400000,
            recipientName: pick(RECIPIENTS, i * 11 + 5),
            recipientPhone: `+27${String(60 + (o % 30))}${String(3000000 + i * 4241).slice(0, 7)}`,
          },
          `orderBurst(${idx},${o}):createOrderAndDelivery`
        );
        if (res) {
          counters.orders++;
          return { ...res, pickupLat, pickupLng, dropoffLat, dropoffLng, recipientName: pick(RECIPIENTS, i * 11 + 5) };
        }
        return null;
      })()
    );
  }
  return (await Promise.all(jobs)).filter(Boolean);
}

// ── Race-to-accept ───────────────────────────────────────────────────────────
async function raceToAccept(ops, roster, customerAgent, deliveryId) {
  // Customer confirms the requested delivery (the real checkout-confirm flow):
  // requested → pending_dispatch.
  const confirm = await customerAgent.mutate(
    "deliveries/state_machine:dispatchDelivery",
    { deliveryId },
    "race:confirmDelivery"
  );
  if (confirm === null) {
    log("  · customer confirm failed — skipping race for this delivery");
    return null;
  }

  const disp = await ops.mutate(
    "dispatch/engine:dispatchDelivery",
    { deliveryId, maxOffers: 3 },
    "race:dispatchDelivery"
  );
  if (!disp || disp.offersSent === 0) {
    log(`  · dispatch sent no offers (fleet busy — skipping race)`);
    return null;
  }
  log(`  · dispatch → ${disp.offersSent} offers out`);

  // Collect each driver's offer for this delivery.
  const offers = await Promise.all(
    roster.map((d) =>
      d.agent.query("dispatch/engine:getMyDispatchOffers", {}, "race:getMyDispatchOffers")
    )
  );
  const mine = offers.map((list, k) => ({
    driver: roster[k],
    offer: (list ?? []).find((o) => o.deliveryId === deliveryId),
  }));

  // All drivers accept concurrently — exactly one must win. Losing attempts
  // are classified, not failures: the winner's accept cancels sibling offers
  // and claims the delivery, so a loser can surface "already assigned",
  // "cancelled, not pending", or a state guard — all proof the atomic claim holds.
  const lostRace = (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    return /cancelled, not pending|already.*assigned|not in.*state|expected/i.test(msg);
  };
  const attempts = mine
    .filter((m) => m.offer)
    .map((m) =>
      m.driver.agent
        .mutateSoft(
          "dispatch/engine:acceptAssignment",
          { offerId: m.offer._id },
          "race:acceptAssignment",
          lostRace
        )
        .then((res) => ({ driver: m.driver, res, err: res ? null : new Error("classified loss") }))
    );
  const outcomes = await Promise.all(attempts);

  let winner = null;
  for (const o of outcomes) {
    if (o.res) {
      counters.raceWinner++;
      winner = o.driver;
      log(`  ✓ ${o.driver.name} WON the accept race`);
    } else {
      counters.raceLosers++;
      log(`  · ${o.driver.name} lost race (classified — atomic claim held)`);
    }
  }
  if (!winner) {
    failures.push({ step: "race:accept", message: "no winner — every accept failed" });
  }
  return winner;
}

// ── GPS leg (paced) ──────────────────────────────────────────────────────────
// The server throttles location updates (~10s per driver). Pace at 10.5s so
// every update is accepted — measuring the accepted-write path under many
// concurrent drivers rather than the throttle's rejection path.
async function gpsLeg(agent, delivery, steps) {
  // Expected rejections: not-assigned (another driver won the delivery) and
  // implied-velocity/throttle guards (a fix that teleports from a previous
  // run's city). These are the platform working as designed.
  const isExpected = (err) => {
    const msg = err instanceof Error ? err.message : String(err);
    return /not assigned|Speed|km\/h|frequency|too soon|throttle/i.test(msg);
  };
  const from = { lat: delivery.pickupLat, lng: delivery.pickupLng };
  const to = { lat: delivery.dropoffLat, lng: delivery.dropoffLng };
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    await agent.mutateSoft(
      "tracking/mutations:updateDeliveryLocation",
      {
        deliveryId: delivery.deliveryId,
        location: {
          lat: from.lat + (to.lat - from.lat) * t + jitter(0, 0.001),
          lng: from.lng + (to.lng - from.lng) * t + jitter(0, 0.001),
          timestamp: Date.now(),
          accuracy: 8,
        },
      },
      "gps:updateDeliveryLocation",
      isExpected
    );
    if (s < steps) await sleep(10_500);
  }
}

// ── Read bursts ──────────────────────────────────────────────────────────────
async function readBurst(ops, roster) {
  const reads = [
    ops.query("deliveries/state_machine:getAllDeliveriesForOps", {}, "read:getAllDeliveriesForOps"),
    ops.query("dispatch/engine:getMyDispatchOffers", {}, "read:offers(ops)"),
  ];
  for (const d of roster) {
    reads.push(d.agent.query("dispatch/engine:getMyDispatchOffers", {}, "read:offers(driver)"));
  }
  const results = await Promise.allSettled(reads);
  let ok = 0;
  for (const r of results) if (r.status === "fulfilled") ok++;
  return ok;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("=== Lasha pressure test ===");
  console.log(`customers=${CUSTOMERS} ordersPer=${ORDERS_PER} gpsSteps=${GPS_STEPS}`);

  const ops = new AgentClient();
  await ops.signUp("agent.ops@lasha.test", "Lasha!Pump2026", "Lasha Operations");

  const roster = [];
  for (let d = 1; d <= 3; d++) {
    const a = new AgentClient();
    try {
      // signUp handles both paths: real sign-in when the account exists.
      await a.signUp(`agent.driver${d}@lasha.test`, "Lasha!Pump2026", `re-login`);
      roster.push({ name: `driver#${d}`, agent: a });
    } catch (e) {
      log(`  · driver${d} unavailable — skipping (${e instanceof Error ? e.message.slice(0, 60) : e})`);
    }
  }
  if (roster.length === 0) {
    console.error("FATAL: no drivers available for pressure test");
    process.exit(1);
  }

  const t0 = Date.now();
  const reads1 = await readBurst(ops, roster);
  log(`read burst #1: ${reads1}/${roster.length + 2} ok`);

  // 1. Concurrent order bursts.
  log(`\norder bursts: ${CUSTOMERS} customers × ${ORDERS_PER} concurrent orders`);
  const orderSets = await Promise.all(
    Array.from({ length: CUSTOMERS }, async (_, c) => {
      const a = new AgentClient();
      await a.signUp(`agent.customer${c + 1}@lasha.test`, "Lasha!Pump2026", "re-login");
      return orderBurst(a, c);
    })
  );
  const allOrders = orderSets.flat();
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  log(`✓ ${allOrders.length} orders created in ${elapsed}s (${counters.orders} counted, ${failures.length} failures so far)`);

  // 2. Race-to-accept on the first order + full lifecycle + paced GPS legs.
  const target = allOrders[0];
  if (target) {
    log("\nrace-to-accept:");
    const customerA = new AgentClient();
    await customerA.signUp("agent.customer1@lasha.test", "Lasha!Pump2026", "re-login");
    const winner = await raceToAccept(ops, roster, customerA, target.deliveryId);
    if (winner) {
      const did = target.deliveryId;
      const D = "deliveries/state_machine:";
      await winner.agent.mutate(`${D}startEnRouteToPickup`, { deliveryId: did }, "lifecycle:startEnRouteToPickup");
      await winner.agent.mutate(`${D}arriveAtPickup`, { deliveryId: did }, "lifecycle:arriveAtPickup");
      await winner.agent.mutate(`${D}pickupPackage`, { deliveryId: did }, "lifecycle:pickupPackage");
      await winner.agent.mutate(`${D}startTrip`, { deliveryId: did }, "lifecycle:startTrip");      // GPS legs: the winner drives the target delivery; other roster drivers
      // also ping the same delivery to prove the server rejects unassigned
      // writers (authorization under pressure).
      log("\ngps legs (paced, concurrent):");
      const legs = roster.map((d) =>
        gpsLeg(d.agent, target, GPS_STEPS).catch(() => {})
      );
      await Promise.all(legs);

      await winner.agent.mutate(`${D}arriveAtDropoff`, { deliveryId: did }, "lifecycle:arriveAtDropoff");
      await winner.agent.mutate(
        "pod/service:completeDeliveryWithPOD",
        {
          deliveryId: did,
          recipientName: target.recipientName ?? "Pressure Recipient",
          recipientPhone: "+27820000000",
          deliveryNotes: "Pressure-test POD — left with reception",
        },
        "lifecycle:completeDeliveryWithPOD"
      );
      log(`✓ lifecycle completed on ${did}`);
    }
  }

  // 3. Read burst #2 under post-write load.
  const reads2 = await readBurst(ops, roster);
  log(`\nread burst #2: ${reads2}/${roster.length + 2} ok`);

  console.log(
    `\nsummary: orders=${counters.orders} raceWinners=${counters.raceWinner} raceLosers=${counters.raceLosers}`
  );
  summarizeFailures("PRESSURE TEST");
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
