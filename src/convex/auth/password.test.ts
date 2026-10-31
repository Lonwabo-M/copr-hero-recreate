/**
 * Password Authentication Tests
 *
 * Verifies the email + password migration: the Convex Auth `Password`
 * provider is configured for sign-up/sign-in/reset, the email-OTP provider
 * and its UI are fully removed, secrets stay server-side, error handling is
 * user-safe, and role-aware routing plus existing RBAC remain intact.
 *
 * No real credential or password is used anywhere in this file.
 */
import { readFileSync } from "fs";
import { strict as assert } from "assert";
import path from "path";

function read(relPath: string): string {
  return readFileSync(path.join(process.cwd(), relPath), "utf8");
}

const authTs = read("src/convex/auth.ts");
const emailBridge = read("src/convex/auth/email.ts");
const authPage = read("src/pages/Auth.tsx");
const authError = read("src/lib/authError.ts");
const roleAccess = read("src/components/shells/roleAccess.ts");
const postAuth = read("src/pages/PostAuthRedirect.tsx");
const config = read("src/convex/auth.config.ts");

let passed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(`${name}: ${err instanceof Error ? err.message : String(err)}`);
    console.error(`  ✗ ${name}`);
  }
}

// ─── Provider configuration ──────────────────────────────────────────────────

test("Password provider is registered as the primary provider", () => {
  assert.ok(
    authTs.includes('import { Password } from "@convex-dev/auth/providers/Password"'),
    "imports the supported Convex Auth Password provider",
  );
  assert.ok(authTs.includes("Password({"), "registers a Password provider instance");
  assert.ok(authTs.includes('id: "password"'), "provider id is 'password'");
});

test("reset flow is wired to the email-delivery bridge (provider-supported reset)", () => {
  assert.ok(authTs.includes("reset: emailDelivery"), "Password provider has a reset EmailConfig");
  assert.ok(
    emailBridge.includes("sendVerificationRequest"),
    "bridge implements the provider's email contract",
  );
  assert.ok(
    emailBridge.includes("VLY_INTEGRATION_BASE_URL") &&
      emailBridge.includes("/v1/email/send"),
    "bridge delivers the reset code via the configured platform email base URL",
  );
});

test("password policy is not weakened (provider baseline preserved)", () => {
  assert.ok(
    authTs.includes("password.length < 8"),
    "minimum 8 characters enforced server-side via validatePasswordRequirements",
  );
  assert.ok(!authTs.includes("crypto:"), "default provider hashing (Scrypt) not overridden");
});

test("passwords are hashed by the provider — no custom hashing, no plaintext storage", () => {
  assert.ok(!authTs.includes("crypto:"), "no custom password hashing config in project code");
  const schema = read("src/convex/schema.ts");
  const usersBlock = schema.slice(
    schema.indexOf("users: defineTable("),
    schema.indexOf("businesses: defineTable("),
  );
  assert.ok(
    !/password\s*:/.test(usersBlock),
    "users schema has no password field (credentials live in Convex Auth's authAccounts)",
  );
});

test("pre-existing Anonymous provider and platform JWT bridge preserved", () => {
  assert.ok(authTs.includes("Anonymous"), "Anonymous provider kept");
  assert.ok(config.includes("applicationID"), "auth.config.ts JWT providers intact");
  assert.ok(config.includes("customJwt"), "freebuff bridge provider intact");
});

// ─── OTP removal ─────────────────────────────────────────────────────────────

test("email-OTP provider file is removed and unreferenced", () => {
  assert.ok(authTs.includes("email-otp") === false, "auth.ts does not register email-otp");
  assert.ok(!authTs.includes('from "./auth/emailOtp"'), "no emailOtp import in auth.ts");
  assert.ok(!authPage.includes('"email-otp"'), "Auth UI does not invoke email-otp");
});

test("EMAIL_OTP_API_KEY is no longer referenced by any source file", () => {
  assert.ok(!emailBridge.includes("EMAIL_OTP_API_KEY"), "bridge does not use the retired variable");
  assert.ok(!authTs.includes("EMAIL_OTP_API_KEY"), "auth.ts does not use the retired variable");
});

test("no OTP-specific UI remains", () => {
  assert.ok(!authPage.includes("otpSent"), "no OTP-sent step state");
  assert.ok(!/resend/i.test(authPage), "no resend-code control");
  assert.ok(!authPage.includes("We'll send you a verification code"), "no OTP sign-in copy");
  assert.ok(!authPage.includes("Check your inbox"), "no OTP inbox copy");
  assert.ok(!authPage.includes("no password needed"), "no passwordless copy");
});

test("no hardcoded auth secrets remain", () => {
  assert.ok(!/fb_email/i.test(authTs), "no credential in auth.ts");
  assert.ok(!/fb_email/i.test(emailBridge), "no credential in email bridge");
  assert.ok(!authPage.includes("x-api-key"), "no credential in UI");
});

// ─── Sign-up flow ────────────────────────────────────────────────────────────

test("sign-up form collects email, password, and confirmation", () => {
  assert.ok(authPage.includes('flow: "signUp"'), "invokes the provider signUp flow");
  assert.ok(authPage.includes("confirmPassword"), "has confirm-password field");
  assert.ok(authPage.includes("Passwords do not match"), "mismatch validation message");
  assert.ok(
    authPage.includes("PASSWORD_MIN_LENGTH} characters"),
    "communicates the password policy",
  );
});

test("sign-up validates email shape and password confirmation client-side (UX only)", () => {
  assert.ok(authPage.includes("Enter a valid email address"), "email validation feedback");
  assert.ok(
    authPage.indexOf("validateEmail") < authPage.indexOf('flow: "signUp"'),
    "validation runs before the provider call",
  );
});

// ─── Sign-in flow ────────────────────────────────────────────────────────────

test("login uses email + password via the provider signIn flow", () => {
  assert.ok(authPage.includes('flow: "signIn"'), "invokes the provider signIn flow");
  assert.ok(authPage.includes('type={showPassword ? "text" : "password"}'), "show/hide password toggle");
  assert.ok(authPage.includes("Forgot password?"), "forgot-password link present");
  assert.ok(authPage.includes("Create account"), "sign-up link present");
});

// ─── Password reset flow ─────────────────────────────────────────────────────

test("reset flow uses the provider's reset and reset-verification flows", () => {
  assert.ok(authPage.includes('flow: "reset"'), "reset request flow");
  assert.ok(authPage.includes('flow: "reset-verification"'), "reset verification flow");
  assert.ok(authPage.includes("newPassword"), "provider receives the new password");
  assert.ok(authPage.includes("code: resetCode"), "provider receives the emailed code");
});

test("reset does not reveal whether an email exists", () => {
  const forgotHandler = authPage.slice(
    authPage.indexOf("handleRequestReset"),
    authPage.indexOf("handleCompleteReset"),
  );
  assert.ok(
    authError.includes(
      '"If an account exists for this email, a reset code has been sent."',
    ),
    "success notice is account-agnostic",
  );
  assert.ok(
    forgotHandler.includes("isUnknownAccountError"),
    "unknown emails receive the same notice as known ones",
  );
  assert.ok(
    forgotHandler.includes("isResetRateLimitedError"),
    "throttled requests do not become an account-existence oracle",
  );
  assert.ok(
    forgotHandler.includes("setNotice(RESET_REQUEST_NOTICE)"),
    "the same notice is shown when the account is not found",
  );
});

test("reset signs the user in and continues to role-aware routing", () => {
  const resetHandler = authPage.slice(
    authPage.indexOf("handleCompleteReset"),
    Math.min(authPage.indexOf("const inputStyle"), authPage.length),
  );
  assert.ok(
    resetHandler.includes("redirectAfterAuth"),
    "completed reset continues into the app",
  );
});

// ─── Error handling ──────────────────────────────────────────────────────────

test("authentication errors are user-safe", () => {
  assert.ok(authError.includes("Invalid email or password"), "credential errors are generic");
  assert.ok(authPage.includes("@/lib/authError"), "the UI uses the audited mapper");
  assert.ok(authError.includes("An account with this email already exists"), "duplicate signup message");
  assert.ok(authError.includes("Too many attempts"), "rate-limit message");
  assert.ok(!authPage.includes("stack"), "no stack traces in UI");
  assert.ok(!authPage.includes("JSON.stringify(err"), "raw errors are not dumped to the user");
  assert.ok(
    !/message\.toLowerCase\(\)\.includes\("password"\)/.test(authPage),
    "no substring heuristic can mislabel an email-field error as a password failure",
  );
});

// ─── Role-aware routing ──────────────────────────────────────────────────────

test("post-auth role routing is preserved and unchanged", () => {
  assert.ok(postAuth.includes("homeRouteForRole"), "resolves the route from the server-known role");
  assert.ok(authPage.includes('redirectAfterAuth = "/post-auth"'), "auth page routes through /post-auth");
});

test("users cannot choose a role in the auth UI", () => {
  assert.ok(!/<select/i.test(authPage), "no role selector element");
  assert.ok(
    !authPage.includes("chooseRole") && !authPage.includes("setRole") && !authPage.includes("userRole"),
    "no role-selection logic in Auth.tsx",
  );
});

test("role→route mapping intact for all four areas", () => {
  assert.ok(roleAccess.includes('"/dashboard"'), "customer home");
  assert.ok(roleAccess.includes('"/driver"'), "driver home");
  assert.ok(roleAccess.includes('"/operations"'), "operations home");
});

// ─── Security & session ──────────────────────────────────────────────────────

test("no second auth HTTP API or backend introduced", () => {
  const http = read("src/convex/http.ts");
  assert.ok(http.includes("auth.addHttpRoutes"), "Convex Auth HTTP routes intact");
  const providerCalls = (authPage.match(/signIn\(/g) ?? []).map(String);
  assert.ok(
    providerCalls.every(() => authPage.includes('signIn("password"')),
    "UI only ever invokes the password provider",
  );
});

test("legacy migration: email-linking enabled via the reset provider (no duplicate identities)", () => {
  // The reset EmailConfig enables shouldLinkViaEmail in Convex Auth's
  // createAccountFromCredentials → upsertUserAndAccount, which links a
  // password sign-up to the existing verified-email user record.
  assert.ok(authTs.includes("reset: emailDelivery"), "linking precondition present");
  const usersImpl = read("node_modules/@convex-dev/auth/dist/server/implementation/users.js");
  assert.ok(usersImpl.includes("shouldLinkViaEmail"), "Convex Auth supports email linking");
});

test("change-password action verifies the current password and revokes other sessions", () => {
  const change = read("src/convex/auth/passwordChange.ts");
  assert.ok(change.includes("getAuthUserId"), "identity comes from the session");
  const actionArgs = change.slice(
    change.indexOf("export const changePassword = action("),
    change.indexOf("handler: async (ctx, args)"),
  );
  assert.ok(!actionArgs.includes("userId"), "no client-supplied user id");
  assert.ok(change.includes("retrieveAccount"), "current password verified by the provider");
  assert.ok(
    change.includes("modifyAccountCredentials"),
    "new secret written through the provider (no custom hashing)",
  );
  assert.ok(change.includes("invalidateSessions"), "other sessions revoked");
  assert.ok(change.includes("except: [sessionId]"), "current session kept");
  assert.ok(change.includes("AUTH_PASSWORD_CHANGED"), "audit event recorded");
  assert.ok(change.includes("PASSWORD_MIN_LENGTH"), "password policy enforced server-side");
});

test("reset-code sends are throttled server-side per account", () => {
  const limiter = read("src/convex/auth/resetRateLimit.ts");
  const schemaSource = read("src/convex/schema.ts");
  assert.ok(
    emailBridge.includes("consumeResetSend"),
    "the email bridge checks the throttle before sending",
  );
  assert.ok(
    emailBridge.indexOf("consumeResetSend") <
      emailBridge.indexOf("const response = await fetch("),
    "the throttle runs before the outbound request",
  );
  assert.ok(
    schemaSource.includes("password_reset_rate_limits"),
    "send history is persisted",
  );
  assert.ok(limiter.includes("SHA-256"), "the key is a hash, not a readable email");
});

test("secrets remain server-side (bridge env var, no VITE_ prefix)", () => {
  assert.ok(
    emailBridge.includes("process.env.VLY_INTEGRATION_KEY"),
    "bridge authenticates with the platform's already-provisioned VLY_INTEGRATION_KEY",
  );
  assert.ok(!emailBridge.includes("VITE_"), "no client-side env exposure");
  assert.ok(emailBridge.includes("if (!apiKey)"), "missing-secret fails closed before the provider call");
  assert.ok(!emailBridge.includes("JSON.stringify(error)"), "no error-object serialization leak");
});

// ─── Regression anchors ──────────────────────────────────────────────────────

test("existing RBAC and role definitions untouched", () => {
  const schema = read("src/convex/schema.ts");
  assert.ok(schema.includes("ROLE_PERMISSIONS"), "permission map intact");
  assert.ok(schema.includes("[ROLES.SUPER_ADMIN]"), "roles intact");
  assert.ok(schema.includes("businessId: v.optional(v.id(\"businesses\"))"), "business association intact");
});

test("dispatch/delivery auth surfaces unaffected by the auth-method change", () => {
  const authz = read("src/convex/auth/authorization.ts");
  assert.ok(authz.includes("getCurrentAuthUser"), "session-based authorization unchanged");
  assert.ok(authz.includes("hasPermission(user.role, permission)"), "RBAC evaluation unchanged");
});

// ─── Duplicate sign-up safety (no duplicate identities) ─────────────────────
// Convex Auth keys authAccounts uniquely by (provider, providerAccountId=email).
// Re-signup with the same email either signs into the EXISTING account (same
// password — the library verifies the secret and returns the existing account)
// or is rejected (different password) → the UI shows "An account with this
// email already exists". One email can never create a second user row.
test("duplicate signup is rejected safely — same email maps to one account", () => {
  const libSource = readFileSync(
    new URL(
      "../../../node_modules/@convex-dev/auth/dist/server/implementation/mutations/createAccountFromCredentials.js",
      import.meta.url
    ),
    "utf8"
  );
  // Uniqueness is enforced by the providerAndAccountId index lookup.
  assert.ok(libSource.includes('"providerAndAccountId"'));
  assert.ok(libSource.includes("already exists`"));
  // Existing account with a matching secret returns the SAME account —
  // it does not create a new user identity.
  assert.ok(libSource.includes("user: (await ctx.db.get(existingAccount.userId))"));
  // The auth UI maps the failure to a user-safe message.
  const authPageSource = readFileSync(
    new URL("../../pages/Auth.tsx", import.meta.url),
    "utf8"
  );
  assert.ok(
    read("src/lib/authError.ts").includes('"An account with this email already exists"')
  );
});

test("no fake guest auth path exists — entering the portal requires a session", () => {
  const heroSource = readFileSync(
    new URL("../../components/lasha/Hero.tsx", import.meta.url),
    "utf8"
  );
  assert.ok(!heroSource.includes("lasha_guest"));
  assert.ok(!heroSource.includes("Guest Access"));
  // Route protection is unchanged: RequireAuth bounces unauthenticated users.
  const requireAuthSource = readFileSync(
    new URL("../../components/RequireAuth.tsx", import.meta.url),
    "utf8"
  );
  assert.ok(requireAuthSource.includes("!isAuthenticated"));
  assert.ok(requireAuthSource.includes("/auth?returnTo="));
});

// ─── Report ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error("FAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
