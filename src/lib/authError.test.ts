/**
 * Auth error mapping tests — the regression that made password reset report
 * "Password does not meet requirements" for an email field.
 *
 * The fixture is the real error string Convex returned for a reset request on
 * an address with no account (request ID and line numbers trimmed). Its stack
 * names Password.ts, which the previous substring heuristic mistook for a
 * password-policy failure.
 *
 * Run with: bunx tsx src/lib/authError.test.ts
 */

import {
  RESET_REQUEST_NOTICE,
  authErrorDetail,
  isResetRateLimitedError,
  isUnknownAccountError,
  safeAuthError,
} from "./authError";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push(name);
    console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// ─── Fixtures ───────────────────────────────────────────────────────────────

const UNKNOWN_ACCOUNT = `[Request ID: ffeb1f6546aebbe4] Server Error
Uncaught Error: InvalidAccountId
    at retrieveAccount (../../node_modules/@convex-dev/auth/src/server/implementation/index.ts:602:9)
    at async authorize [as authorize] (../../node_modules/@convex-dev/auth/src/providers/Password.ts:170:10)
    at async handler (../../node_modules/@convex-dev/auth/src/server/implementation/index.ts:416:26)
`;

const WRONG_PASSWORD = `[Request ID: a1] Server Error
Uncaught Error: Invalid credentials
    at async authorize (../../node_modules/@convex-dev/auth/src/providers/Password.ts:162:13)
`;

const WEAK_PASSWORD = `[Request ID: b2] Server Error
Uncaught Error: Password must be at least 8 characters
    at async handler (../../src/convex/auth.ts:36:11)
`;

const EMAIL_UNCONFIGURED = `[Request ID: c3] Server Error
Uncaught Error: Email delivery is not configured. Add VLY_INTEGRATION_KEY in the project's API keys settings.
    at async sendVerificationRequest (../../src/convex/auth/email.ts:47:13)
`;

const RATE_LIMITED = `[Request ID: d4] Server Error
Uncaught Error: TooManyFailedAttempts
    at async handler (../../node_modules/@convex-dev/auth/src/server/implementation/index.ts:416:26)
`;

const RESET_THROTTLED = `[Request ID: e6] Server Error
Uncaught Error: RESET_RATE_LIMITED:240
    at async sendVerificationRequest (../../src/convex/auth/email.ts:70:13)
`;

const RESET_FALLBACK = "We couldn't send the reset email. Please try again in a moment.";

// ─── Extraction ─────────────────────────────────────────────────────────────

test("reads only the error line, not the wrapped stack", () => {
  assert(authErrorDetail(UNKNOWN_ACCOUNT) === "InvalidAccountId", "extracts the error line");
  assert(
    !authErrorDetail(UNKNOWN_ACCOUNT).includes("Password.ts"),
    "stack frames are excluded",
  );
});

test("handles plain messages, empty values and non-errors", () => {
  assert(authErrorDetail(new Error("Invalid code")) === "Invalid code", "plain Error");
  assert(authErrorDetail("Account already exists") === "Account already exists", "string");
  assert(authErrorDetail(null) === "", "null");
  assert(authErrorDetail(undefined) === "", "undefined");
  assert(authErrorDetail({}) === "", "object without message");
});

// ─── The regression ─────────────────────────────────────────────────────────

test("unknown email on reset is detected as an account-existence signal", () => {
  assert(isUnknownAccountError(UNKNOWN_ACCOUNT), "InvalidAccountId recognised");
  assert(!isUnknownAccountError(WRONG_PASSWORD), "wrong password is not unknown account");
});

test("reset failure never claims the email failed a password policy", () => {
  const message = safeAuthError(UNKNOWN_ACCOUNT, "reset", RESET_FALLBACK);
  assert(message === RESET_FALLBACK, `got: ${message}`);
  assert(!/password/i.test(RESET_REQUEST_NOTICE), "neutral notice does not mention passwords");
});

test("even a password-worded provider error cannot leak into the reset step", () => {
  assert(
    safeAuthError(WEAK_PASSWORD, "reset", RESET_FALLBACK) === RESET_FALLBACK,
    "reset step has no password input",
  );
});

// ─── Sign-in ────────────────────────────────────────────────────────────────

test("wrong password maps to the generic credential message", () => {
  assert(
    safeAuthError(WRONG_PASSWORD, "signIn", "fallback") === "Invalid email or password",
    "Invalid credentials → generic message",
  );
  assert(
    safeAuthError(UNKNOWN_ACCOUNT, "signIn", "fallback") === "Invalid email or password",
    "unknown account on sign-in does not reveal existence",
  );
});

test("sign-in does not surface raw provider internals", () => {
  assert(
    safeAuthError(new Error("Missing `password` param for `signIn` flow"), "signIn", "fallback") ===
      "fallback",
    "internal argument error falls back",
  );
});

// ─── Password-setting flows ────────────────────────────────────────────────

test("password policy messages are shown only when a password is being set", () => {
  const expected = "Password must be at least 8 characters";
  assert(safeAuthError(WEAK_PASSWORD, "signUp", "fallback") === expected, "sign-up");
  assert(
    safeAuthError(WEAK_PASSWORD, "reset-verification", "fallback") === expected,
    "reset-verification",
  );
});

test("a stack mentioning the password module is not a policy failure", () => {
  const internal = `[Request ID: e5] Server Error
Uncaught Error: Account lookup failed
    at async authorize (../../node_modules/@convex-dev/auth/src/providers/Password.ts:170:10)
`;
  assert(
    safeAuthError(internal, "signUp", "fallback") === "fallback",
    "unrecognised detail falls back instead of guessing",
  );
});

test("duplicate email is only confirmed during sign-up", () => {
  const duplicate = new Error("Account already exists");
  assert(
    safeAuthError(duplicate, "signUp", "fallback") ===
      "An account with this email already exists",
    "sign-up explains the duplicate",
  );
  assert(
    safeAuthError(duplicate, "reset", RESET_FALLBACK) === RESET_FALLBACK,
    "reset never confirms an account exists",
  );
});

// ─── Operational failures ──────────────────────────────────────────────────

test("rate limiting is reported without retrying forever", () => {
  assert(
    safeAuthError(RATE_LIMITED, "reset", RESET_FALLBACK) ===
      "Too many attempts. Please try again later.",
    "rate limit message",
  );
});

test("reset throttle is detectable and reports the remaining wait", () => {
  assert(isResetRateLimitedError(RESET_THROTTLED), "throttle code recognised");
  assert(!isResetRateLimitedError(WRONG_PASSWORD), "other errors are not throttled");
  const message = safeAuthError(RESET_THROTTLED, "reset", RESET_FALLBACK);
  assert(
    message === "Too many reset requests. Please try again in 4 minutes.",
    `got: ${message}`,
  );
  assert(!/password/i.test(message), "throttle copy never mentions a password");

  const shortWait = safeAuthError(
    new Error("RESET_RATE_LIMITED:45"),
    "reset",
    RESET_FALLBACK,
  );
  assert(
    shortWait === "Please wait 45 seconds before requesting another code.",
    `got: ${shortWait}`,
  );
});

test("email configuration details are not exposed to the browser", () => {
  const message = safeAuthError(EMAIL_UNCONFIGURED, "reset", RESET_FALLBACK);
  assert(!message.includes("VLY_INTEGRATION_KEY"), "secret/config guidance withheld");
  assert(
    message === "Email delivery is temporarily unavailable. Please try again later.",
    `got: ${message}`,
  );
});

test("invalid or expired reset code keeps the reset-specific fallback", () => {
  const fallback = "Invalid or expired reset code";
  assert(
    safeAuthError(new Error("Invalid code"), "reset-verification", fallback) === fallback,
    "invalid code",
  );
});

// ─── Report ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`Failures:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
