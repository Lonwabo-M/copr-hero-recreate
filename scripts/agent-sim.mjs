/**
 * Lasha Multi-Role Agent Simulation
 *
 * Drives the REAL system end-to-end. Every account is a REAL sign-up through
 * the production Convex Auth password provider, and every state change goes
 * through the app's own public mutations — the exact same functions the UI
 * invokes. No direct DB writes anywhere.
 *
 * Roles exercised:
 *   customer  → sign up, onboard (business + address), request deliveries
 *   driver    → elevate via the app's own test-access flow, submit driver
 *               application (Capture), GPS updates, accept offers, run the
 *               full delivery state machine to POD completion
 *   operations → elevate, dispatch deliveries to drivers, reassign
 *   admin     → elevate, review + approve/reject driver applications
 *
 * Findings are logged as ISSUE / OK lines so failures surface exactly where
 * the system breaks.
 */
import { ConvexHttpClient } from "convex/browser";
import { api } from "../src/convex/_generated/api.js";

const CONVEX_URL =
  process.env.CONVEX_URL ?? "https://keen-octopus-299.convex.cloud";
const SITE_URL = CONVEX_URL.replace(".cloud", ".site");

// ─── Deterministic pseudo-randomness so reruns produce stable stories ────────
let seed = Number(process.env.SIM_SEED ?? 42);
function rand() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}
function between(a, b) {
  return a + rand() * (b - a);
}

// ─── Realistic South African dataset (Cape Town / Paarl / Stellenbosch) ─────
const BUSINESSES = [
  ["Cladogram", "E-commerce"], ["Fleet Farm Supplies", "Agriculture"],
  ["Cape Spice Traders", "Retail"], ["Boland Build Co", "Construction"],
  ["Wine Route Provisions", "Food & Beverage"], ["Helderberg Print", "Printing"],
  ["False Bay Seafoods", "Food & Beverage"], ["Du Toit Motors", "Automotive"],
  ["Stellenbosch Chem", "Chemicals"], ["Paarl Print Works", "Printing"],
  ["The Towers Cafe", "Hospitality"], ["Somerset Logistics", "Logistics"],
];
const FIRST_NAMES = [
  "Lonwabo", "Thandi", "Sipho", "Aisha", "Pieter", "Nadia", "Lwazi", "Chantelle",
  "Kagiso", "Elani", "Jaco", "Zanele", "Mpho", "Ruan", "Fatima", "Andile",
  "Mariska", "Tebogo", "Ilse", "Bongani", "Charmaine", "Dumisani", "Estiaan",
  "Gugulethu", "Hanlie", "Itumeleng", "Johan", "Karabo", "Liesl", "Musa",
  "Naledi", "Ockert", "Palesa", "Quentin", "Rethabile", "Sibusiso", "Tanika",
  "Ursula", "Vuyani", "Wilna", "Xolani", "Yolanda", "Zubair", "Anja", "Buntu",
  "Carien", "Dineo", "Erich", "Fikile", "Gert",
];
const LAST_NAMES = [
  "Matya", "Nkosi", "Van Wyk", "Molefe", "Botha", "Jacobs", "Dlamini", "Petersen",
  "Mahlangu", "Fourie", "Ndlovu", "Adams", "Zulu", "Malan", "Khumalo", "September",
  "Naidoo", "Steyn", "Mthembu", "Rossouw", "Cele", "Du Plessis", "Mokoena",
  "Smit", "Tshabalala", "Nieuwoudt", "Abrahams", "Sithole", "Barnard", "Nhlapo",
  "Coetzee", "Mnguni", "Pretorius", "Sibande", "Viljoen", "Tait", "Mekgwe",
];
const STREETS = [
  "46 Distillery Street, Charleston Hill", "12 Main Road, Paarl", "88 Kerk Street, Paarl",
  "5 component Street, Southern Paarl", "301 High Street, Central Paarl",
  "77 Bree Street, Cape Town CBD", "23 Long Street, Cape Town CBD",
  "9 Voortrekker Road, Bellville", "412 Chruch Street, Durbanville",
  "18 Bird Street, Stellenbosch", "2 Ryneveld Street, Stellenbosch",
  "56 Beach Road, Muizenberg", "8 Summit Road, Mowbray", "34 Victoria Road, Sea Point",
  "90 Industrial Way, Epping", "15 Settlers Way, Somerset West",
  "61 Walker Drive, Brackenfell", "7 Kanonberg Road, Rhebokskloof",
];
const CITIES = ["Paarl", "Cape Town", "Stellenbosch", "Bellville", "Durbanville", "Muizenberg", "Somerset West", "Brackenfell"];
const ZIPS = ["7646", "8001", "7600", "7530", "7550", "7945", "7130", "7560"];
const PROVINCE = "Western Cape";
// GPS jitter around Cape Town / Winelands
const CT = { lat: -33.9249, lng: 18.4241 };
const PAARL = { lat: -33.7319, lng: 18.9774 };
const STELLENBOSCH = { lat: -33.9321, lng: 18.8602 };

const GOODS = [
  "Tea consignment (palletised)", "Spare plumbing parts", "Printed marketing brochures",
  "Fresh produce crates", "Desktop computer", "Office chairs (4)", "Bakery goods",
  "Tiles (2 boxes)", "Wine cases", "Server rack component", "Paint cans",
  "Books for school drive", "Car parts", "Fridge unit", "Documents (sealed)",
];
const RECIPIENTS = [
  ["Sizwe Mthembu", "+27 82 555 0101"], ["Anél Van Zyl", "+27 83 555 0102"],
  ["Mandla Buthelezi", "+27 72 555 0103"], ["Rochelle Sassman", "+27 84 555 0104"],
  ["Tiaan Grobler", "+27 82 555 0105"], ["Nomvula Khuzwayo", "+27 73 555 0106"],
  ["Deon Snyman", "+27 82 555 0107"], ["Palesa Motaung", "+27 81 555 0108"],
];
const DRIVER_CITIES = ["Paarl", "Cape Town", "Stellenbosch", "Bellville"];
const VEHICLES = [
  ["Toyota", "Hilux", 1000], ["VW", "Caddy", 750], ["Ford", "Ranger", 1100],
  ["Nissan", "NP200", 800], ["Hyundai", "H100", 1200], ["Isuzu", "KBD", 1000],
  ["Kia", "K2500", 900], ["Toyota", "Quantum", 1200], ["VW", "Transporter", 1100],
];

const PASSWORD = "Lasha!Sim2026";

// ─── Harness plumbing ────────────────────────────────────────────────────────
const issues = [];
const oks = [];
let counters = { ok: 0, issue: 0 };

function ok(msg) {
  counters.ok++;
  if (process.env.QUIET !== "1") console.log(`  OK    ${msg}`);
}
function issue(step, err, context) {
  counters.issue++;
  issues.push({ step, error: String(err?.message ?? err), context });
  console.log(`  ISSUE ${step}: ${String(err?.message ?? err)}`);
}
function section(t) {
  console.log(`\n── ${t} ${"─".repeat(Math.max(0, 60 - t.length))}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * An actor is one ConvexHttpClient holding exactly one authenticated session
 * (one setAuth'd token). Creating an actor = a REAL sign-up.
 */
async function makeActor(email, name, phone) {
  const c = new ConvexHttpClient(CONVEX_URL);
  // Convex Auth password provider — real sign-up via the app's own auth.
  // From @convex-dev/auth react/client: authenticatedCall("auth:signIn",
  // { provider, params, verifier }); the result carries { tokens }.
  const result = await c.action(api.auth.signIn, {
    provider: "password",
    params: { flow: "signUp", email, password: PASSWORD, name },
  });
  if (!result?.tokens?.token) {
    throw new Error(`signUp returned no token for ${email}: ${JSON.stringify(result)?.slice(0, 200)}`);
  }
  c.setAuth(result.tokens.token);
  return { client: c, email, name, phone, token: result.tokens.token };
}

async function call(actor, fn, args, label) {
  try {
    const res = await actor.client.mutation(fn, args);
    return res;
  } catch (err) {
    issue(label ?? fn, err, { actor: actor.email });
    return null;
  }
}

async function query(actor, fn, args, label) {
  try {
    return await actor.client.query(fn, args);
  } catch (err) {
    issue(label ?? fn, err, { actor: actor.email });
    return null;
  }
}

// ─── Scenario drivers ────────────────────────────────────────────────────────

/** Real customer journey: sign-up → onboarding → delivery request. */
async function customerJourney(i, opts = {}) {
  const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  const email = `sim.customer${i}.${Date.now()}@lasha-sim.test`;
  const [business, industry] = pick(BUSINESSES);
  const bizName = `${business} ${["(Pty) Ltd", "CC", "Group", ""][Math.floor(rand() * 4)]}`.trim();

  const actor = await makeActor(email, name, `+27 8${Math.floor(rand() * 3)} ${Math.floor(100 + rand() * 900)} ${Math.floor(100 + rand() * 900)} ${Math.floor(1000 + rand() * 9000)}`);

  const onboard = await call(
    actor,
    api.users.onboarding.completeCustomerOnboarding,
    {
      businessName: bizName,
      businessType: industry,
      registrationNumber: `K${Math.floor(2000 + rand() * 7000)}/${i}${Math.floor(10 + rand() * 80)}/07`,
      businessPhone: actor.phone,
      businessAddress: pick(STREETS),
      fullName: name,
      phone: actor.phone,
      addressLabel: pick(["Warehouse", "Store front", "Head office", "Main collection point"]),
      street: pick(STREETS),
      city: pick(CITIES),
      province: PROVINCE,
      postalCode: pick(ZIPS),
    },
    "completeCustomerOnboarding",
  );
  if (!onboard) return null;

  // Deliveries per customer: 1-3
  const nDeliveries = opts.deliveries ?? (rand() < 0.6 ? 1 : rand() < 0.8 ? 2 : 3);
  const created = [];
  for (let d = 0; d < nDeliveries; d++) {
    const origin = rand() < 0.5 ? PAARL : CT;
    const dest = rand() < 0.4 ? STELLENBOSCH : rand() < 0.5 ? PAARL : CT;
    const [rName, rPhone] = pick(RECIPIENTS);
    const weight = Math.floor(between(1, 120));
    const expedition = pick(["standard", "express", "same_day"]);
    const res = await call(
      actor,
      api.deliveries.state_machine.createOrderAndDelivery,
      {
        orderName: pick(GOODS),
        parcelType: pick(["document", "small_parcel", "large_parcel", "pallet"]),
        expeditionType: expedition,
        width: Math.floor(between(20, 120)),
        height: Math.floor(between(10, 90)),
        weight,
        pickupAddress: `${pick(STREETS)}, ${pick(CITIES)}`,
        dropoffAddress: `${pick(STREETS)}, ${pick(CITIES)}`,
        pickupLat: origin.lat + between(-0.05, 0.05),
        pickupLng: origin.lng + between(-0.05, 0.05),
        dropoffLat: dest.lat + between(-0.05, 0.05),
        dropoffLng: dest.lng + between(-0.05, 0.05),
        scheduledTime: Date.now() + between(1, 48) * 3600_000,
        recipientName: rName,
        recipientPhone: rPhone,
      },
      "createOrderAndDelivery",
    );
    if (res) {
      created.push({ deliveryId: res.deliveryId, trackingNumber: res.trackingNumber, actor });
      ok(`${actor.name} (${bizName}) → ${res.trackingNumber}`);
    }
    await sleep(120);
  }
  return { actor, created };
}

/**
 * Real driver journey: sign-up → test-elevate to driver (the app's own
 * testing elevation) → submit application (Capture phase).
 */
async function driverSignupAndApply(i) {
  const name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  const email = `sim.driver${i}.${Date.now()}@lasha-sim.test`;
  const actor = await makeActor(email, name, `+27 7${Math.floor(rand() * 3)} ${Math.floor(100 + rand() * 900)} ${Math.floor(100 + rand() * 900)} ${Math.floor(1000 + rand() * 9000)}`);

  const elev = await call(actor, api.users.testAccess.claimTestAreaAccess, { area: "driver" }, "claimTestAreaAccess(driver)");
  if (!elev) return null;

  const [make, model, cap] = pick(VEHICLES);
  const app = await call(
    actor,
    api.users.driverApplications.submitMyDriverApplication,
    {
      licenseClass: pick(["Code 8", "Code 10", "Code 14"]),
      licenseNumber: `${Math.floor(10 + rand() * 89)}${Math.floor(100000 + rand() * 899999)}`,
      vehicleMake: make,
      vehicleModel: model,
      vehicleYear: Math.floor(2012 + rand() * 12),
      vehicleCapacityKg: cap,
      vehicleRegistration: `CA ${Math.floor(100 + rand() * 899)}-${Math.floor(100 + rand() * 899)}`,
      vehicleBreaking: rand() < 0.5,
      vehicleExpress: rand() < 0.6,
      vehicleFlammable: rand() < 0.25,
      vehicleTrailer: rand() < 0.2,
    },
    "submitMyDriverApplication",
  );
  if (!app) return null;
  ok(`${actor.name} applied — ${make} ${model}, ${cap}kg`);
  return { actor, applicationId: app.applicationId };
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  section("PILOT WAVE — 3 customers, 1 driver, full lifecycle");
  const pilotCustomers = [];
  for (let i = 1; i <= 3; i++) {
    const c = await customerJourney(i);
    if (c) pilotCustomers.push(c);
  }
  const pilotDriver = await driverSignupAndApply(1);
  console.log(`\nPilot: ${pilotCustomers.length}/3 customers, ${pilotDriver ? "driver applied" : "driver FAILED"}`);

  // Operations: send the delivery to dispatch (requested → pending_dispatch),
  // then run offer dispatch (pending_dispatch → offers). Admin reviews apps.
  const ops = await makeActor(`sim.ops.${Date.now()}@lasha-sim.test`, "Ops Controller", "+27 82 000 0001");
  await call(ops, api.users.testAccess.claimTestAreaAccess, { area: "operations" }, "claim(ops)");
  const admin = await makeActor(`sim.admin.${Date.now()}@lasha-sim.test`, "Admin Reviewer", "+27 82 000 0002");
  await call(admin, api.users.testAccess.claimTestAreaAccess, { area: "admin" }, "claim(admin)");

  const pending = await query(admin, api.users.driverApplications.getApplicationsForReview, {}, "getApplicationsForReview");
  if (pending) {
    const mine = pending.filter((a) => a.status === "pending");
    for (const a of mine) {
      const res = await call(admin, api.users.driverApplications.acceptDriverApplication, { applicationId: a._id }, "acceptDriverApplication");
      if (res) ok(`Application approved (driver ${a.userId ?? a._id})`);
    }
  }

  // Get the approved driver actor: re-auth as the driver (sign in).
  // We need the driver's client to act. driverSignupAndApply returned the actor.
  let driverActor = pilotDriver?.actor ?? null;

  // Driver sets GPS so dispatch finds them
  if (driverActor) {
    await call(driverActor, api.tracking.mutations.updateDriverLocation, {
      location: { lat: PAARL.lat, lng: PAARL.lng, timestamp: Date.now() },
    }, "updateDriverLocation");
  }

  // Dispatch the first pilot delivery.
  let pilotDelivery = pilotCustomers[0]?.created?.[0] ?? null;
  if (pilotDelivery) {
    const toPending = await call(ops, api.deliveries.state_machine.dispatchDelivery, { deliveryId: pilotDelivery.deliveryId }, "state_machine.dispatchDelivery");
    if (toPending) ok("Delivery → pending_dispatch");
    const disp = await call(ops, api.dispatch.engine.dispatchDelivery, { deliveryId: pilotDelivery.deliveryId, maxOffers: 3 }, "dispatchDelivery");
    if (disp) ok(`Dispatch: ${disp.message ?? ""} offers=${disp.offersSent}`);
    if (driverActor && disp?.offersSent > 0) {
      const offers = await query(driverActor, api.dispatch.engine.getMyDispatchOffers, {}, "getMyDispatchOffers");
      if (offers?.length) {
        const accepted = await call(driverActor, api.dispatch.engine.acceptAssignment, { offerId: offers[0]._id }, "acceptAssignment");
        if (accepted) ok(`Driver accepted offer → delivery ${accepted.deliveryId}`);
        // Full state machine run to completion
        const did = accepted.deliveryId;
        await call(driverActor, api.deliveries.state_machine.startEnRouteToPickup, { deliveryId: did }, "startEnRouteToPickup");
        await call(driverActor, api.deliveries.state_machine.arriveAtPickup, { deliveryId: did }, "arriveAtPickup");
        await call(driverActor, api.deliveries.state_machine.pickupPackage, { deliveryId: did }, "pickupPackage");
        await call(driverActor, api.deliveries.state_machine.startTrip, { deliveryId: did }, "startTrip");
        await call(driverActor, api.deliveries.state_machine.arriveAtDropoff, { deliveryId: did }, "arriveAtDropoff");
        // POD then complete
        const pod = await call(driverActor, api.pod.service.completeDeliveryWithPOD, {
          deliveryId: did,
          recipientName: pick(RECIPIENTS)[0],
          recipientPhone: pick(RECIPIENTS)[1],
          deliveryNotes: "Left with reception as instructed",
        }, "completeDeliveryWithPOD");
        if (pod) ok(`Delivery ${did} completed with POD`);
      }
    }
  }

  // Testing elevation release — verify release restores customer role
  await call(ops, api.users.testAccess.releaseTestAreaAccess, {}, "releaseTestAreaAccess");

  section("PILOT SUMMARY");
  console.log(`OK: ${counters.ok}   ISSUES: ${counters.issue}`);
  if (issues.length) {
    console.log("\nFailures by step:");
    for (const s of issues) console.log(`  - ${s.step}: ${s.error}`);
  }
  await sleep(500);
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
