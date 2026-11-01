/**
 * Access-control regressions.
 *
 * Pins the controls added after the security review so they cannot silently
 * come back:
 *
 *   1. Production test-area elevation has been removed entirely.
 *   2. Seed-time role provisioning requires a deployment secret.
 *   3. Demo account credentials are never committed, and deployment bootstrap
 *      refuses to run without an operator-supplied password.
 *   4. Tracking-by-code is authenticated and entitlement-scoped.
 *   5. Table-count telemetry is staff-only.
 *   6. Paystack webhook signatures are compared in constant time.
 *
 * Run with: bun test src/convex/auth/accessControls.test.ts
 */

import { existsSync, readFileSync } from "fs";
import { join } from "path";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`${name}: ${msg}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${msg}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ─── 1. Test-access removal ──────────────────────────────────────────────────

console.log("\nTest-access removal");

test("production test-access elevation endpoint is absent", () => {
  assert(
    !existsSync(join(ROOT, "src/convex/users/testAccess.ts")),
    "testAccess endpoint must not exist in the production source tree",
  );
});

test("legacy test elevations are inert until restored", () => {
  const schema = read("src/convex/schema.ts");
  assert(
    schema.includes("export function effectiveRoleForUser"),
    "must resolve an effective role instead of trusting the stored role",
  );
  assert(
    schema.includes("if (user.testElevated === true) {") &&
      schema.includes("return user.testPreviousRole ?? ROLES.CUSTOMER"),
    "marked accounts must fall back to their pre-test role",
  );

  const authz = read("src/convex/auth/authorization.ts");
  assert(
    (authz.match(/effectiveRoleForUser\(userDoc\)/g) ?? []).length >= 4,
    "all DB-role authorization checks must use the effective role",
  );

  const users = read("src/convex/users.ts");
  assert(
    users.includes("effectiveRoleForUser(user)"),
    "currentUser must not expose a legacy elevated role to the client router",
  );

  const authHook = read("src/hooks/use-auth.ts");
  assert(
    authHook.includes("effectiveRoleForUser(userDoc)"),
    "client auth state must apply the same effective role before a backend deploy",
  );

  const auth = read("src/convex/auth.ts");
  assert(
    auth.includes("isStaffRole(effectiveRoleForUser(user))"),
    "ZITADEL linking must also reject a legacy-elevated non-staff account",
  );
});

// ─── 2. Seed-time provisioning ──────────────────────────────────────────────

console.log("\nSeed-time provisioning");

test("provisionSeedAccountRole requires the deployment seed key", () => {
  const src = read("src/convex/dev/seed_accounts.ts");
  assert(src.includes("SEED_ACCESS_KEY"), "must read the deployment secret");
  assert(src.includes("safeEqual(args.seedKey, expectedKey)"), "must compare the seed key");
  const keyCheck = src.indexOf("safeEqual(args.seedKey, expectedKey)");
  const patch = src.indexOf("ctx.db.patch(userId, { role: args.role })");
  assert(keyCheck > 0 && keyCheck < patch, "key check must precede the role write");
});

// ─── 3. Committed credentials ───────────────────────────────────────────────

console.log("\nCommitted credentials");

test("bootstrap takes the demo password from the deployment env", () => {
  const src = read("src/convex/bootstrap.ts");
  assert(src.includes("DEMO_ACCOUNTS_PASSWORD"), "must read the env var");
  assert(!/const DEV_PASSWORD = "/.test(src), "must not hardcode the password");
  const guard = src.indexOf("DEMO_ACCOUNTS_PASSWORD");
  const hash = src.indexOf("new Scrypt().hash");
  assert(guard > 0 && guard < hash, "must resolve the password before hashing");
});

test("the auth page reads the demo password from the build env", () => {
  const src = read("src/pages/Auth.tsx");
  assert(src.includes("import.meta.env.VITE_DEMO_PASSWORD"), "must read the build env");
  assert(!/const DEV_PASSWORD = "/.test(src), "must not hardcode the password");
  assert(
    src.includes("if (import.meta.env.PROD || !DEV_PASSWORD)"),
    "panel must be hidden in production and without a password",
  );
});

test("no app source file ships the demo account password", () => {
  const files = [
    "src/convex/bootstrap.ts",
    "src/convex/dev/seed_accounts.ts",
    "src/pages/Auth.tsx",
    "scripts/light-seed.ts",
    "scripts/agent-sim.mjs",
    "scripts/pressure-test.mjs",
    "scripts/verify-platform.mjs",
  ];
  const offenders = files.filter((f) => read(f).includes("Lasha!Pump2026"));
  assert(offenders.length === 0, `hardcoded demo password in: ${offenders.join(", ")}`);
});

// ─── 4. Tracking lookup ────────────────────────────────────────────────────

console.log("\nTracking lookup authorization");

test("getDeliveryByTracking requires a session and checks entitlement first", () => {
  const src = read("src/convex/deliveries/state_machine.ts");
  const start = src.indexOf("export const getDeliveryByTracking");
  const block = src.slice(start, start + 2600);
  assert(start > 0, "query not found");
  assert(block.includes('"Authentication required"'), "must reject anonymous callers");
  assert(block.includes("order.senderId === user.userId"), "customer must own the order");
  assert(block.includes("delivery.courierId === user.userId"), "driver must be assigned");
  assert(block.includes("ROLES.COMPANY_ADMIN"), "owning business must be admitted");
  const gate = block.indexOf("if (!isStaff && !isOwningBusiness && !isCourier && !isSender)");
  const details = block.indexOf("resolveDeliveryDetails");
  assert(gate > 0, "entitlement gate missing");
  assert(gate < details, "gate must run before details are assembled");
});

// ─── 5. Diagnostics ────────────────────────────────────────────────────────

console.log("\nDiagnostics");

test("getTableCounts is staff-only and bounded", () => {
  const src = read("src/convex/debug/counts.ts");
  assert(src.includes("Authentication required"), "must require a session");
  assert(src.includes("ROLES.OPERATIONS"), "must require a staff role");
  assert(src.includes(".take(MAX_COUNTED_ROWS)"), "must bound each scan");
  assert(!src.includes(".collect()"), "must not collect whole tables");
});

// ─── 6. Payment webhook ────────────────────────────────────────────────────

console.log("\nPayment webhook");

test("Paystack signature comparison is constant time", () => {
  const http = read("src/convex/http.ts");
  const provider = read("src/convex/payments/_provider.ts");
  assert(http.includes("timingSafeEqual"), "webhook must use the constant-time compare");
  assert(!/expected !== signatureHeader/.test(http), "no early-exit string comparison");
  assert(provider.includes("export function timingSafeEqual"), "helper must exist");
});

// ─── Summary ───────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(64)}`);
console.log(`Access-control tests: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("\nFailures:");
  for (const f of failures) console.log(`  - ${f}`);
  process.exit(1);
}
