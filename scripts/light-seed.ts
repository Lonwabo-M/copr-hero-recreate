/**
 * Light Data Pass — Lasha platform
 *
 * Recreates a small, realistic demo dataset on the user's own Convex
 * deployment by driving the platform's REAL public API mutations (the same
 * ones the UI and the earlier agent runs used). No direct database writes,
 * no agent-swarm behaviour: strictly sequential, tiny volumes, throttled.
 *
 *   bun scripts/light-seed.ts
 *
 * Safety characteristics:
 *  - Sequential, one HTTP call at a time (no concurrency, no swarm).
 *  - Small fixed volumes (5 businesses, 12 drivers, 20 deliveries).
 *  - 200 ms delay between calls (slow, human-paced).
 *  - New accounts only — it never touches existing rows.
 *
 * Requires: JWT_PRIVATE_KEY / JWKS set on the deployment (sign-in must work),
 * plus the dev-only provisioning mutation in src/convex/dev/seed_accounts.ts.
 */

// ─── Configuration ───────────────────────────────────────────────────────────

const DEPLOYMENT_URL =
  process.env.LASHA_CONVEX_URL ?? "https://incredible-warbler-335.convex.cloud";
// Demo password for the accounts this pass creates. Never hardcoded: the same
// credential signs in to the seeded staff accounts, so it belongs in the
// deployment's env (DEMO_ACCOUNTS_PASSWORD), not in the repository.
const DEV_PASSWORD = process.env.DEMO_ACCOUNTS_PASSWORD ?? "";
// Must match the deployment's SEED_ACCESS_KEY — the role-provisioning mutation
// is disabled without it.
const SEED_ACCESS_KEY = process.env.SEED_ACCESS_KEY ?? "";
const RUN_ID = Date.now().toString(36);

/** Gentle pacing: delay between every HTTP call. */
const CALL_DELAY_MS = 200;

/** Small volumes — a light pass, not a stress test. */
const PLAN = {
  businesses: 5,
  drivers: 12,
  deliveries: 20,
  /** Target status mix across the 20 deliveries (sums to 20). "deliver"
   *  is the remainder: 20 − (2+1+1+2+2+4) = 8. */
  mix: {
    delivered: 8,
    inTransit: 4,
    enRoute: 2,
    accepted: 2,
    assigned: 1,
    pendingDispatch: 1,
    cancelled: 2, // placed first so they can be cancelled from requested
  },
} as const;

// ─── Western Cape fixture data ───────────────────────────────────────────────

const BUSINESSES = [
  { name: "Cape Spaza Collective", type: "retail", contact: "Naledi Khumalo" },
  { name: "Boland Fresh Produce", type: "agriculture", contact: "Willem van Zyl" },
  { name: "V&A Pharmacy Group", type: "healthcare", contact: "Pravin Naidoo" },
  { name: "Atlantis Textiles", type: "manufacturing", contact: "Fatima Adams" },
  { name: "Stellenbosch Cellars", type: "agriculture", contact: "Anri du Plessis" },
];

const DRIVER_NAMES = [
  "Thabo Mokoena", "Sipho Dlamini", "Lerato Maseko", "Johan Pretorius",
  "Ayanda Ndlovu", "Pieter Botha", "Zanele Ngcobo", "Kagiso Sithole",
  "Nomvula Zulu", "Riaan Venter", "Bongani Mahlangu", "Elsie September",
];

// Deterministic, valid 13-digit SA ID (passes the Luhn checksum) for a
// simulated driver index, e.g. 8501155008085.
function seedDriverIdNumber(index: number): string {
  const base = `8501${String(5 + (index % 5))}${String(10 + index).padStart(2, "0")}089`;
  let sum = 0;
  for (let pos = 0; pos < base.length; pos++) {
    let d = Number(base[base.length - 1 - pos]);
    if (pos % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return `${base}${(10 - (sum % 10)) % 10}`;
}

const RECIPIENTS = [
  "M. Jacobs", "T. Nkosi", "S. Petersen", "A. Fourie", "D. Mthembu",
  "K. Abrahams", "P. Molefe", "R. Davids",
];

const PICKUP_SPOTS = [
  { street: "12 Bree Street, Cape Town CBD", lat: -33.9189, lng: 18.4233 },
  { street: "88 Long Street, Cape Town CBD", lat: -33.9249, lng: 18.4194 },
  { street: "5 Vaalfontein Road, Montague Gardens", lat: -33.8630, lng: 18.4926 },
  { street: "240 Main Road, Sea Point", lat: -33.9152, lng: 18.3861 },
  { street: "31 Stellenbosch Arterial, Bellville", lat: -33.9022, lng: 18.6341 },
];

const DROPOFF_SPOTS = [
  { street: "7 Church Street, Stellenbosch", lat: -33.9321, lng: 18.8602 },
  { street: "42 Voortrekker Road, Bellville", lat: -33.9022, lng: 18.6341 },
  { street: "3 Marine Drive, Somerset West", lat: -34.0847, lng: 18.8486 },
  { street: "19 Kommetjie Road, Fish Hoek", lat: -34.1360, lng: 18.4502 },
  { street: "56 Durban Road, Paarl", lat: -33.7318, lng: 18.9721 },
  { street: "9 Main Road, Kalk Bay", lat: -34.1299, lng: 18.4494 },
];

const PARCEL_TYPES = ["documents", "parcels", "fragile", "perishables"];
const EXPEDITION_TYPES = ["standard", "standard", "express"];

const VEHICLES = [
  { make: "Toyota", model: "Quantum", capacity: 1000 },
  { make: "Nissan", model: "NV350", capacity: 1200 },
  { make: "Hyundai", model: "H1", capacity: 800 },
];

// ─── Convex HTTP API helpers ─────────────────────────────────────────────────

interface Tokens { token: string; refreshToken: string }

let callsMade = 0;

async function call(
  kind: "action" | "mutation" | "query",
  path: string,
  args: unknown,
  token?: string,
): Promise<any> {
  const res = await fetch(`${DEPLOYMENT_URL}/api/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ path, args, format: "json" }),
  });

  const bodyText = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    throw new Error(`Non-JSON response from ${path}: ${bodyText.slice(0, 200)}`);
  }

  if (parsed.status === "success") return parsed.value;
  const errText =
    parsed.errorMessage ?? parsed.error ?? JSON.stringify(parsed).slice(0, 300);
  throw new Error(`${kind} ${path} failed: ${errText}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function throttle() {
  callsMade++;
  await sleep(CALL_DELAY_MS);
}

async function signIn(email: string, password: string): Promise<Tokens> {
  await throttle();
  const value = await call("action", "auth:signIn", {
    provider: "password",
    params: { flow: "signIn", email, password },
  });
  return value.tokens;
}

/** Real sign-up (password flow) — creates a user, then names the account. */
async function signUp(email: string, password: string, name: string): Promise<Tokens> {
  await throttle();
  const value = await call("action", "auth:signIn", {
    provider: "password",
    params: { flow: "signUp", email, password },
  });
  const tokens = value.tokens;
  await throttle();
  await call("mutation", "users:updateMyProfile", { name }, tokens.token);
  return tokens;
}

/** Dev-only role provisioning (shipped with this pass). */
async function provisionRole(token: string, role: string) {
  await throttle();
  await call(
    "mutation",
    "dev/seed_accounts:provisionSeedAccountRole",
    { role, seedKey: SEED_ACCESS_KEY },
    token,
  );
}

// ─── Accounts ────────────────────────────────────────────────────────────────

interface DriverContext { email: string; tokens: Tokens; userId: string; vehicleId: string }

async function createCustomer(index: number): Promise<{ email: string; tokens: Tokens }> {
  const email = `seed.cust${index}.${RUN_ID}@seed.lasha.test`;
  const biz = BUSINESSES[index % BUSINESSES.length];
  const tokens = await signUp(email, DEV_PASSWORD, biz.contact);
  await provisionRole(tokens.token, "customer");

  // Business + default collection address through the app's own onboarding.
  const spot = PICKUP_SPOTS[index % PICKUP_SPOTS.length];
  await throttle();
  await call("mutation", "users/onboarding:completeCustomerOnboarding", {
    businessName: biz.name,
    businessType: biz.type,
    businessPhone: `+27 21 ${String(400 + index).padStart(3, "0")} ${String(1000 + index * 7).padStart(4, "0")}`,
    businessAddress: spot.street,
    fullName: biz.contact,
    phone: `+27 82 ${String(100 + index).padStart(3, "0")} ${String(2000 + index * 13).padStart(4, "0")}`,
    addressLabel: "Main warehouse",
    street: spot.street,
    city: "Cape Town",
    province: "Western Cape",
    postalCode: "8001",
  }, tokens.token);
  return { email, tokens };
}

async function createDriver(index: number, adminTokens: Tokens): Promise<DriverContext> {
  const email = `seed.driver${index}.${RUN_ID}@seed.lasha.test`;
  const fullName = DRIVER_NAMES[index % DRIVER_NAMES.length];
  const [seedFirst, ...seedRest] = fullName.split(" ");
  const seedSurname = seedRest.join(" ") || "Driver";
  const tokens = await signUp(email, DEV_PASSWORD, fullName);
  await provisionRole(tokens.token, "driver");

  const veh = VEHICLES[index % VEHICLES.length];
  await throttle();
  const applyResult = await call("mutation", "users/driverApplications:submitMyDriverApplication", {
    // Valid Luhn-checksummed 13-digit SA ID derived from the driver index.
    firstName: seedFirst,
    surname: seedSurname,
    idNumber: seedDriverIdNumber(index),
    cellNumber: `0${7 + (index % 2)}${String(10000000 + index * 137).slice(0, 8)}`,
    licenseClass: "C1",
    licenseNumber: `L-${RUN_ID}-${String(index).padStart(3, "0")}`,
    vehicleMake: veh.make,
    vehicleModel: veh.model,
    vehicleYear: 2019 + (index % 5),
    vehicleCapacityKg: veh.capacity,
    vehicleRegistration: `CA${String(100000 + RUN_ID.length * 7919 + index * 137)}`,
    vehicleBreaking: index % 2 === 0,
    vehicleExpress: index % 2 === 1,
    vehicleFlammable: false,
    vehicleTrailer: index % 4 === 0,
  }, tokens.token);

  // Application review requires an admin (COMPANY_ADMIN / SUPER_ADMIN).
  await throttle();
  await call("mutation", "users/driverApplications:acceptDriverApplication", {
    applicationId: applyResult.applicationId,
  }, adminTokens.token);

  const me = await call("query", "users:currentUser", {}, tokens.token);
  const identity = await call("query", "users/driverApplications:getMyDispatchIdentity", {}, tokens.token);
  if (!identity?.vehicle?._id) {
    throw new Error("driver vehicle was not provisioned by application acceptance");
  }
  return { email, tokens, userId: me._id, vehicleId: identity.vehicle._id };
}

// ─── Delivery placement ──────────────────────────────────────────────────────

interface DeliveryContext {
  deliveryId: string;
  customerTokens: Tokens;
  customerIndex: number;
}

async function placeDelivery(
  customer: { tokens: Tokens; index: number },
): Promise<DeliveryContext> {
  const i = customer.index;
  const pickup = PICKUP_SPOTS[i % PICKUP_SPOTS.length];
  const dropoff = DROPOFF_SPOTS[i % DROPOFF_SPOTS.length];
  const biz = BUSINESSES[i % BUSINESSES.length];

  await throttle();
  const result = await call("mutation", "deliveries/state_machine:createOrderAndDelivery", {
    orderName: `${biz.type === "agriculture" ? "Fresh produce" : biz.type === "healthcare" ? "Medical supplies" : "Retail stock"} consignment #${i + 1}`,
    parcelType: PARCEL_TYPES[i % PARCEL_TYPES.length],
    expeditionType: EXPEDITION_TYPES[i % EXPEDITION_TYPES.length],
    width: 40,
    height: 30,
    weight: 8 + (i % 5) * 6,
    pickupAddress: pickup.street,
    pickupLat: pickup.lat,
    pickupLng: pickup.lng,
    dropoffAddress: dropoff.street,
    dropoffLat: dropoff.lat,
    dropoffLng: dropoff.lng,
    recipientName: RECIPIENTS[i % RECIPIENTS.length],
    recipientPhone: `+27 71 ${String(300 + i).padStart(3, "0")} ${String(4000 + i * 11).padStart(4, "0")}`,
  }, customer.tokens.token);

  return { deliveryId: result.deliveryId, customerTokens: customer.tokens, customerIndex: i };
}

// ─── Main pass ───────────────────────────────────────────────────────────────

function log(msg: string) {
  console.log(`[light-seed ${new Date().toISOString().slice(11, 19)}] ${msg}`);
}

async function main() {
  const started = Date.now();
  log(`Light data pass → ${DEPLOYMENT_URL} (run ${RUN_ID})`);
  log(`Plan: ${PLAN.businesses} businesses, ${PLAN.drivers} drivers, ${PLAN.deliveries} deliveries — sequential, ${CALL_DELAY_MS}ms pacing`);

  // 0. Sanity: ops + admin must sign in before any writes (proves the JWT
  // chain works end-to-end).
  const opsTokens = await signIn("agent.ops@lasha.test", DEV_PASSWORD);
  const adminTokens = await signIn("agent.admin@lasha.test", DEV_PASSWORD);
  log("Ops + admin sign-in OK — auth chain healthy");

  // 1. Drivers first — they must exist as dispatch candidates.
  log(`Creating ${PLAN.drivers} driver accounts (apply + ops approval)…`);
  const drivers: DriverContext[] = [];
  for (let i = 0; i < PLAN.drivers; i++) {
    drivers.push(await createDriver(i, adminTokens));
    log(`  driver ${i + 1}/${PLAN.drivers}: ${DRIVER_NAMES[i % DRIVER_NAMES.length]}`);
  }

  // 2. Customers with businesses.
  log(`Creating ${PLAN.businesses} customer accounts with businesses…`);
  const customers: Array<{ email: string; tokens: Tokens; index: number }> = [];
  for (let i = 0; i < PLAN.businesses; i++) {
    const c = await createCustomer(i);
    customers.push({ ...c, index: i });
    log(`  business ${i + 1}/${PLAN.businesses}: ${BUSINESSES[i].name}`);
  }

  // 3. Deliveries through the real flow, advanced to a target status mix.
  log(`Placing ${PLAN.deliveries} deliveries through the real dispatch flow…`);

  const mix = PLAN.mix;
  const buckets: Record<string, number> = {
    delivered: 0, in_transit: 0, en_route_to_pickup: 0, driver_accepted: 0,
    assigned: 0, pending_dispatch: 0, cancelled: 0,
  };

  function targetFor(i: number): string {
    // First cancel, then pending_dispatch, assigned, accepted, enroute,
    // transit, delivered (i ascending → buckets fill in listed order).
    const c0 = 0;
    const c1 = c0 + mix.cancelled;
    const c2 = c1 + mix.pendingDispatch;
    const c3 = c2 + mix.assigned;
    const c4 = c3 + mix.accepted;
    const c5 = c4 + mix.enRoute;
    const c6 = c5 + mix.inTransit;
    if (i < c1) return "cancel";
    if (i < c2) return "pending_dispatch";
    if (i < c3) return "assign";
    if (i < c4) return "accept";
    if (i < c5) return "enroute";
    if (i < c6) return "transit";
    return "deliver";
  }

  let opsDispatchIdentity: { userId: string; vehicleId: string } | null = null;

  for (let i = 0; i < PLAN.deliveries; i++) {
    const customer = customers[i % customers.length];
    const target = targetFor(i);
    let d: DeliveryContext;
    try {
      d = await placeDelivery(customer);
    } catch (err) {
      log(`  ✗ delivery ${i + 1}: place failed: ${(err as Error).message}`);
      continue;
    }

    try {
      switch (target) {
        case "cancel": {
          // REQUESTED → CANCELLED by the owning customer.
          await throttle();
          await call("mutation", "deliveries/state_machine:cancelDelivery", {
            deliveryId: d.deliveryId,
            reason: "Customer cancelled — seeded demo data",
          }, d.customerTokens.token);
          buckets.cancelled++;
          break;
        }
        case "pending_dispatch": {
          await throttle();
          await call("mutation", "deliveries/state_machine:dispatchDelivery", {
            deliveryId: d.deliveryId,
          }, d.customerTokens.token);
          buckets.pending_dispatch++;
          break;
        }
        case "assign":
        case "accept":
        case "enroute":
        case "transit":
        case "deliver": {
          // Customer advances REQUESTED → PENDING_DISPATCH first (both the
          // direct-assign and the offer-dispatch paths require it).
          await throttle();
          await call("mutation", "deliveries/state_machine:dispatchDelivery", {
            deliveryId: d.deliveryId,
          }, d.customerTokens.token);

          if (target === "assign") {
            // Direct ops assignment (PENDING_DISPATCH → ASSIGNED).
            const driver = drivers[i % drivers.length];
            await throttle();
            await call("mutation", "deliveries/state_machine:assignDriver", {
              deliveryId: d.deliveryId,
              driverId: driver.userId,
              vehicleId: driver.vehicleId,
            }, opsTokens.token);
            buckets.assigned++;
            break;
          }

          // Ops triggers offer dispatch (PENDING_DISPATCH → ASSIGNED + offers).
          await throttle();
          const offerResult = await call("mutation", "dispatch/engine:dispatchDelivery", {
            deliveryId: d.deliveryId,
            maxOffers: 3,
          }, opsTokens.token);

          if (!offerResult.success || offerResult.offersSent === 0) {
            log(`  delivery ${i + 1}: no candidates — left in assigned`);
            buckets.assigned++;
            break;
          }

          // The highest-ranked pending offer's driver accepts it (all
          // available drivers are seed drivers, so it is always one of ours).
          await throttle();
          const offers = await call("query", "dispatch/engine:getDispatchOffers", {
            deliveryId: d.deliveryId,
          }, opsTokens.token);
          const pending = offers.filter((o: any) => o.status === "pending");
          const offer = pending[0];
          const driver = drivers.find((dr) => dr.userId === offer?.driverId);
          if (!offer || !driver) {
            log(`  delivery ${i + 1}: no pending offer for a seed driver — left in assigned`);
            buckets.assigned++;
            break;
          }
          await throttle();
          await call("mutation", "dispatch/engine:acceptAssignment", {
            offerId: offer._id,
          }, driver.tokens.token);

          if (target === "accept") { buckets.driver_accepted++; break; }

          await throttle();
          await call("mutation", "deliveries/state_machine:startEnRouteToPickup", {
            deliveryId: d.deliveryId,
          }, driver.tokens.token);
          if (target === "enroute") { buckets.en_route_to_pickup++; break; }

          await throttle();
          await call("mutation", "deliveries/state_machine:arriveAtPickup", {
            deliveryId: d.deliveryId,
          }, driver.tokens.token);
          await throttle();
          await call("mutation", "deliveries/state_machine:pickupPackage", {
            deliveryId: d.deliveryId,
          }, driver.tokens.token);
          await throttle();
          await call("mutation", "deliveries/state_machine:startTrip", {
            deliveryId: d.deliveryId,
          }, driver.tokens.token);

          if (target === "transit") {
            // IN_TRANSIT — the tracking point below keeps it there.
            buckets.in_transit++;
            // One gentle tracked movement per in-transit delivery.
            const dropoff = DROPOFF_SPOTS[d.customerIndex % DROPOFF_SPOTS.length];
            await throttle();
            await call("mutation", "tracking/mutations:updateDeliveryLocation", {
              deliveryId: d.deliveryId,
              location: {
                lat: dropoff.lat + 0.02,
                lng: dropoff.lng + 0.01,
                timestamp: Date.now(),
                accuracy: 12,
              },
            }, driver.tokens.token);
            break;
          }

          // target === "deliver": IN_TRANSIT → AT_DROPOFF, then POD + completion
          // (the server requires the AT_DROPOFF state and a POD record).
          const dropoff = DROPOFF_SPOTS[d.customerIndex % DROPOFF_SPOTS.length];
          await throttle();
          await call("mutation", "deliveries/state_machine:arriveAtDropoff", {
            deliveryId: d.deliveryId,
          }, driver.tokens.token);
          await throttle();
          await call("mutation", "pod/service:completeDeliveryWithPOD", {
            deliveryId: d.deliveryId,
            recipientName: RECIPIENTS[d.customerIndex % RECIPIENTS.length],
            deliveryNotes: "Left with recipient — seeded demo data",
            latitude: dropoff.lat,
            longitude: dropoff.lng,
          }, driver.tokens.token);
          buckets.delivered++;
          break;
        }
      }
      log(`  delivery ${i + 1}/${PLAN.deliveries}: ${target} ✓`);
    } catch (err) {
      log(`  ✗ delivery ${i + 1} (${target}): ${(err as Error).message}`);
    }
  }

  // 4. Verify via the dev counts query.
  await throttle();
  const counts = await call("query", "debug/counts:getTableCounts", {}, opsTokens.token);
  log("─── Table counts after pass ───");
  for (const [table, count] of Object.entries(counts)) {
    log(`  ${table.padEnd(22)} ${count}`);
  }
  log("─── Delivery status mix ───");
  for (const [status, count] of Object.entries(buckets)) {
    log(`  ${status.padEnd(22)} ${count}`);
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  log(`Done in ${seconds}s across ${callsMade} API calls (all real, authenticated mutations).`);
  log("Open /auth → dev quick sign-in (Operations) to browse the seeded data.");
}

main().catch((err) => {
  console.error("[light-seed] fatal:", err);
  process.exit(1);
});
