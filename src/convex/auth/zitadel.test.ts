/**
 * Zitadel staff-auth tests
 *
 * These are source-level regression checks. The important security invariants
 * are that Zitadel accounts cannot self-provision, cannot acquire a role from
 * the client/profile, and cannot authenticate a customer/driver account.
 *
 * No Zitadel credentials are used or printed.
 */
import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { join } from "node:path";

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

const authTs = read("src/convex/auth.ts");
const staffPage = read("src/pages/StaffLogin.tsx");
const staffPasswordPage = read("src/pages/StaffPassword.tsx");
const staffSetupPage = read("src/pages/StaffSetup.tsx");
const setupTs = read("src/convex/admin/setup.ts");
const mainTsx = read("src/main.tsx");
const authPage = read("src/pages/Auth.tsx");

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error instanceof Error ? error.message : String(error)}`);
    console.log(`  ✗ ${name}`);
  }
}

console.log("Zitadel staff authentication");

test("Zitadel is registered as an OIDC provider", () => {
  assert.ok(authTs.includes("Zitadel("), "Zitadel provider is registered");
  assert.ok(authTs.includes('type: "oidc"') || authTs.includes("@auth/core/providers/zitadel"), "provider is OIDC");
});

test("client secret is read only from the Convex environment", () => {
  assert.ok(authTs.includes("process.env.ZITADEL_CLIENT_SECRET"), "secret comes from deployment env");
  assert.ok(!staffPage.includes("ZITADEL_CLIENT_SECRET"), "secret is not in client staff page");
  assert.ok(!authPage.includes("ZITADEL_CLIENT_SECRET"), "secret is not in client auth page");
});

test("unknown Zitadel users are rejected before an account can be used", () => {
  assert.ok(authTs.includes("existingUserId === null"), "new users are rejected");
  assert.ok(
    authTs.includes("isStaffRole(effectiveRoleForUser(user))"),
    "linked user must be staff after legacy elevations are neutralized",
  );
  assert.ok(authTs.includes('profile.emailVerified !== true'), "email must be verified");
});

test("staff sign-in is separate from customer/driver password sign-in", () => {
  assert.ok(staffPage.includes('signIn("zitadel"'), "staff page starts the Zitadel flow");
  assert.ok(!staffPage.includes('signIn("password"'), "staff page does not expose password sign-in");
  assert.ok(mainTsx.includes('path="/staff-login"'), "staff route is registered");
  assert.ok(authPage.includes("to={staffLoginHref}"), "customer auth page links to staff sign-in");
  assert.ok(authPage.includes("staffLoginHref"), "customer auth staff link preserves the return path");
});

test("staff password bootstrap is separate and staff-role checked", () => {
  assert.ok(
    staffPasswordPage.includes('signIn("password"'),
    "bootstrap page uses the password provider",
  );
  assert.ok(
    staffPasswordPage.includes("isStaffRole(role)"),
    "bootstrap page rejects customer and driver sessions",
  );
  assert.ok(mainTsx.includes('path="/staff-password"'), "bootstrap route is registered");
  assert.ok(
    staffPage.includes("/staff-password?returnTo="),
    "staff login links to the bootstrap, not customer /auth",
  );
});

test("first administrator setup is one-time and server-gated", () => {
  assert.ok(mainTsx.includes('path="/staff-setup"'), "setup route is registered");
  assert.ok(
    staffSetupPage.includes("api.admin.setup.getSetupStatus") &&
      staffSetupPage.includes("claimFirstAdmin"),
    "setup page reads status and claims through the backend",
  );
  assert.ok(
    setupTs.includes("hasActiveAdmin") &&
      setupTs.includes("ROLES.SUPER_ADMIN") &&
      setupTs.includes("getAuthUserId"),
    "claim requires auth and promotes only to super admin",
  );
  const guard = setupTs.indexOf("if (await hasActiveAdmin(ctx))");
  const patch = setupTs.indexOf("await ctx.db.patch(userId");
  assert.ok(
    guard > 0 && guard < patch,
    "the no-admin guard runs before the promotion",
  );
  assert.ok(
    staffPage.includes('to="/staff-setup"'),
    "staff login points to first-admin setup",
  );
});

test("Zitadel email is normalized before account linking", () => {
  assert.ok(
    authTs.includes("profile.email.trim().toLowerCase()"),
    "verified Zitadel email is normalized to the staff-record format",
  );
});

test("staff login does not bounce a customer session into the customer app", () => {
  assert.ok(staffPage.includes("isStaffRole(role)"), "existing sessions are role-checked");
  assert.ok(staffPage.includes("nonStaffSession"), "non-staff sessions get a switch notice");
  assert.ok(!staffPage.includes("useAuthToken"), "redirect is not based on token presence alone");
});

test("staff login does not claim MFA before the Zitadel policy is tested", () => {
  assert.ok(!staffPage.includes("MFA"), "staff page must not advertise MFA yet");
  assert.ok(!staffPage.includes("Passkeys"), "staff page must not advertise passkeys yet");
});

test("the role guard accepts only server-assigned staff roles", () => {
  assert.ok(!authTs.includes("params.role"), "role is never accepted from sign-in params");
  assert.ok(!authTs.includes("profile.role"), "role is never accepted from the OIDC profile");
});

console.log(`\nZitadel tests: ${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exitCode = 1;
}
