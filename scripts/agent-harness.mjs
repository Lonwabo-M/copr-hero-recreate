// ─── Lasha Agent Simulation Harness ──────────────────────────────────────────
// Agents take on real product roles through the REAL public API surface:
//   - sign-up/sign-in via the same `auth:signIn` action the browser calls
//   - every subsequent action is a real public mutation/query with the
//     session token attached — no direct DB writes, no internal functions.
//
// Failure reporting: every step returns {ok, error} and failures are
// collected into a global ledger the wave scripts dump at the end. The goal
// is to find real breakage, so failures are logged and counted, not thrown.

import { ConvexHttpClient } from "convex/browser";
import { loadEnv } from "vite";

const env = loadEnv("development", process.cwd(), "");
if (!env.VITE_CONVEX_URL) {
  console.error("FATAL: VITE_CONVEX_URL missing");
  process.exit(1);
}

// ─── Failure ledger ──────────────────────────────────────────────────────────
export const failures = [];
export function recordFailure(step, error, context = {}) {
  const message = error instanceof Error ? error.message : String(error);
  failures.push({ step, message, context });
  console.error(`  ✗ [${step}] ${message}`);
}
export function summarizeFailures(label) {
  console.log(`\n=== ${label}: ${failures.length} failure(s) ===`);
  const byStep = {};
  for (const f of failures) {
    byStep[f.step] = (byStep[f.step] ?? 0) + 1;
  }
  for (const [step, count] of Object.entries(byStep)) {
    console.log(`  ${count}×  ${step}: ${failures.find((f) => f.step === step).message.slice(0, 120)}`);
  }
  return failures.length;
}

// ─── Realistic data pools (South African context) ────────────────────────────
export const FIRST_NAMES = [
  "Thabo","Lerato","Sipho","Zanele","Kagiso","Nomvula","Sibusiso","Ayanda",
  "Bongani","Thandiwe","Mpho","Naledi","Tebogo","Palesa","Sipho","Refilwe",
  "Katlego","Boitumelo","Lindiwe","Mandla","Nomsa","Jabulani","Kea","Amo",
  "Sethu","Yolanda","Given","Rea","Lwazi","Ntombi","Vusi","Puleng","Sanele",
  "Buhle","Musa","Karabo","Andile","Zinhle","Lucky","Bongi","Neo","Dineo",
  "Tumi","Hlengiwe","Sandile","Nthabiseng","Tshidiso","Masingita","Nkosi","Fikile",
];
export const LAST_NAMES = [
  "Mokoena","Nkosi","Dlamini","Ndlovu","Khumalo","Mahlangu","Zulu","Maseko",
  "Mabaso","Sithole","Mthembu","Molefe","Tshabalala","Mabunda","Ncube","Mnguni",
  "Buthelezi","Mohlala","Sibiya","Mhlongo","Mthembu","Nkomo","Pretorius","van Wyk",
  "Botha","Naidoo","Pillay","Moodley","Jacobs","Adams","Davids","September",
];
const BUSINESS_TYPES = [
  "Courier","Retail","Food & Beverage","Manufacturing","eCommerce",
  "Wholesale","Pharmacy","Hardware","Groceries","Electronics",
];
export const SA_CITIES = [
  { name: "Johannesburg", lat: -26.2041, lng: 28.0473, zips: ["2000","2001","2049"] },
  { name: "Pretoria", lat: -25.7479, lng: 28.2293, zips: ["0002","0081","0181"] },
  { name: "Centurion", lat: -25.858, lng: 28.1876, zips: ["0157","0169"] },
  { name: "Midrand", lat: -25.9995, lng: 28.1261, zips: ["1682","1685"] },
  { name: "Sandton", lat: -26.1076, lng: 28.0567, zips: ["2196","2146"] },
  { name: "Soweto", lat: -26.2678, lng: 27.8615, zips: ["1804","1868"] },
  { name: "Roodepoort", lat: -26.1625, lng: 27.8725, zips: ["1724","1725"] },
  { name: "Kempton Park", lat: -26.1, lng: 28.23, zips: ["1600","1619"] },
  { name: "Benoni", lat: -26.1885, lng: 28.3206, zips: ["1500","1501"] },
  { name: "Krugersdorp", lat: -26.1015, lng: 27.7759, zips: ["1739","1740"] },
];
const STREETS = [
  "Main Road","Church Street","Nelson Mandela Drive","Jan Shoba Street",
  "Rivonia Road","Katherine Street","Voortrekker Road","Commissioner Street",
  "Hendrik Potgieter Road","Beyers Naudé Drive","O.R. Tambo Street",
  "Solomon Mahlangu Drive","Atterbury Road","Buffelsdrift Road",
];
const GOODS = [
  "Industrial cleaning supplies","Packaged dry goods","Office furniture set",
  "Fresh produce crate","Automotive parts","Pharmaceutical supplies",
  "Retail stock replenishment","Bakery items","Electronics accessories",
  "Construction fittings","Print materials","Catering equipment",
  "Agricultural feed","Textile rolls","Hardware tools",
];
const RECIPIENTS = FIRST_NAMES.map((f, i) => `${f} ${LAST_NAMES[i % LAST_NAMES.length]}`);

export function pick(arr, i) {
  return arr[i % arr.length];
}
export function jitter(base, spreadDeg = 0.02) {
  return base + (Math.random() - 0.5) * spreadDeg;
}

// ─── Agent client (real auth + session token lifecycle) ──────────────────────
export class AgentClient {
  constructor() {
    this.client = new ConvexHttpClient(env.VITE_CONVEX_URL);
    this.userId = null;
  }

  /**
   * Real sign-up (or sign-in when the email already exists) through the same
   * `auth:signIn` action the browser's ConvexAuthProvider issues.
   */
  async signUp(email, password, name) {
    let res = null;
    try {
      res = await this.client.action("auth:signIn", {
        provider: "password",
        params: { email, password, flow: "signUp" },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/exist|duplicate|already/i.test(msg)) {
        // Returning agent — real sign-in path.
        res = await this.client.action("auth:signIn", {
          provider: "password",
          params: { email, password, flow: "signIn" },
        });
      } else {
        throw err;
      }
    }
    if (res.tokens) {
      this.client.setAuth(res.tokens.token);
    }
    // Profile the session: name is what the whole platform displays.
    try {
      await this.client.mutation("users:updateMyProfile", { name });
    } catch (err) {
      recordFailure("users:updateMyProfile (post-signup)", err, { email });
    }
    return res;
  }

  /**
   * Real sign-in for an existing account.
   */
  async signIn(email, password) {
    const res = await this.client.action("auth:signIn", {
      provider: "password",
      params: { email, password, flow: "signIn" },
    });
    if (res.tokens) {
      this.client.setAuth(res.tokens.token);
    }
    return res;
  }

  /** Authenticated mutation with failure capture. */
  async mutate(name, args, label) {
    try {
      return await this.client.mutation(name, args);
    } catch (err) {
      recordFailure(label ?? name, err, {});
      return null;
    }
  }

  /**
   * Mutation with expected-error classification: races the platform handles
   * by design (two drivers claiming one delivery, offer expiry) are logged
   * as informational, never as failures.
   */
  async mutateSoft(name, args, label, isExpected) {
    try {
      return await this.client.mutation(name, args);
    } catch (err) {
      if (isExpected && isExpected(err)) {
        console.log(`  · [${label}] ${err instanceof Error ? err.message : String(err)}`.slice(0, 140));
        return null;
      }
      recordFailure(label ?? name, err, {});
      return null;
    }
  }

  /** Authenticated query with failure capture. */
  async query(name, args, label) {
    try {
      return await this.client.query(name, args);
    } catch (err) {
      recordFailure(label ?? name, err, {});
      return null;
    }
  }

  /** Close the underlying connection. */
  close() {
    this.client.close();
  }
}

// ─── Role behaviour: Customer agent ──────────────────────────────────────────
/** Location fix shape matching tracking/mutations' locationUpdateSchema. */
export function gpsFix(lat, lng, opts = {}) {
  return {
    lat,
    lng,
    timestamp: Date.now(),
    ...(opts.speed !== undefined ? { speed: opts.speed } : {}),
    ...(opts.heading !== undefined ? { heading: opts.heading } : {}),
    ...(opts.accuracy !== undefined ? { accuracy: opts.accuracy } : {}),
  };
}

export async function customerOnboard(agent, i) {
  const first = pick(FIRST_NAMES, i);
  const last = pick(LAST_NAMES, i * 7 + 3);
  const city = pick(SA_CITIES, i);
  const street = pick(STREETS, i * 3 + 1);
  const zip = pick(city.zips, i);

  return await agent.mutate(
    "users/onboarding:completeCustomerOnboarding",
    {
      businessName: `${first} ${last} ${pick(BUSINESS_TYPES, i)} (Pty) Ltd`,
      businessType: pick(BUSINESS_TYPES, i),
      registrationNumber: `K${String(2024 + (i % 2))}${String(100000 + i * 137).slice(0, 6)}`,
      businessPhone: `+27${String(60 + (i % 30))}${String(1000000 + i * 7919).slice(0, 7)}`,
      businessAddress: `${100 + i} ${street}, ${city.name}`,
      fullName: `${first} ${last}`,
      phone: `+27${String(71 + (i % 9))}${String(2000000 + i * 3571).slice(0, 7)}`,
      addressLabel: "Main collection point",
      street: `${12 + i} ${street}`,
      city: city.name,
      province: "Gauteng",
      postalCode: zip,
    },
    "customerOnboarding"
  );
}

export async function customerCreateOrder(agent, i) {
  const from = pick(SA_CITIES, i);
  const to = pick(SA_CITIES, i * 5 + 2);
  const weight = [2, 8, 25, 60, 120][i % 5];
  const pickupLat = jitter(from.lat);
  const pickupLng = jitter(from.lng);
  const dropoffLat = jitter(to.lat);
  const dropoffLng = jitter(to.lng);
  const res = await agent.mutate(
    "deliveries/state_machine:createOrderAndDelivery",
    {
      orderName: pick(GOODS, i),
      parcelType: ["document", "small_parcel", "large_parcel", "pallet"][i % 4],
      expeditionType: ["standard", "express", "same_day"][i % 3],
      width: 20 + (i % 40),
      height: 15 + (i % 30),
      weight,
      pickupAddress: `${10 + i} ${pick(STREETS, i * 2)}, ${from.name}`,
      dropoffAddress: `${200 + i} ${pick(STREETS, i * 3 + 1)}, ${to.name}`,
      pickupLat,
      pickupLng,
      dropoffLat,
      dropoffLng,
      scheduledTime: Date.now() + (i % 3) * 86400000,
      recipientName: pick(RECIPIENTS, i * 11 + 5),
      recipientPhone: `+27${String(60 + (i % 30))}${String(3000000 + i * 4241).slice(0, 7)}`,
    },
    "createOrderAndDelivery"
  );
  // The server returns only ids/price/tracking; the agent keeps the
  // coordinates it requested (needed for GPS placement and POD evidence)
  // plus the recipient it addressed the parcel to.
  const recipientName = pick(RECIPIENTS, i * 11 + 5);
  return res
    ? { ...res, pickupLat, pickupLng, dropoffLat, dropoffLng, recipientName }
    : null;
}

// ─── Role behaviour: Driver agent ────────────────────────────────────────────
export async function driverClaimRole(agent) {
  return await agent.mutate("users/testAccess:claimTestAreaAccess", { area: "driver" }, "driverClaimRole");
}

export async function driverSubmitApplication(agent, i) {
  const makes = [["Toyota", "Quantum"], ["Ford", "Ranger"], ["Nissan", "NP200"], ["Hyundai", "H100"], ["Isuzu", "KBD"]];
  const [make, model] = pick(makes, i);
  // Deterministic valid SA ID (Luhn-checksummed) for the simulated driver.
  const simBase = `8501${String(5 + (i % 5))}${String(10 + i).padStart(2, "0")}089`;
  let simSum = 0;
  for (let pos = 0; pos < simBase.length; pos++) {
    let d = Number(simBase[simBase.length - 1 - pos]);
    if (pos % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    simSum += d;
  }
  const simId = `${simBase}${(10 - (simSum % 10)) % 10}`;
  return await agent.mutate(
    "users/driverApplications:submitMyDriverApplication",
    {
      firstName: `Driver${i}`,
      surname: "Application",
      idNumber: simId,
      cellNumber: `0${7 + (i % 2)}${String(10000000 + i * 137).slice(0, 8)}`,
      licenseClass: ["Code 08", "Code 10", "Code 14"][i % 3],
      licenseNumber: `${String(10000000 + i * 3313)}`,
      vehicleMake: make,
      vehicleModel: model,
      vehicleYear: 2012 + (i % 12),
      vehicleCapacityKg: [800, 1200, 1500, 2500][i % 4],
      vehicleRegistration: `CA${String(100000 + i * 733).slice(0, 6)} GP`,
      vehicleBreaking: i % 2 === 0,
      vehicleExpress: true,
      vehicleFlammable: i % 3 === 0,
      vehicleTrailer: i % 4 === 0,
    },
    "driverSubmitApplication"
  );
}

// ─── Role behaviour: Admin agent ─────────────────────────────────────────────
export async function adminClaimRole(agent) {
  return await agent.mutate("users/testAccess:claimTestAreaAccess", { area: "admin" }, "adminClaimRole");
}
