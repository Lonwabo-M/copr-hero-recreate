/**
 * Email OTP Secret-Hygiene Tests
 *
 * Verifies the B3 fix: the email-OTP provider credential lives only in the
 * server-side Convex environment (`EMAIL_OTP_API_KEY`) — never hardcoded,
 * never logged, never returned to the client, and never embedded in thrown
 * error messages (the previous code serialized raw axios errors, whose
 * `config.headers` contain the key, toward the client sign-in flow).
 *
 * No real credential is used anywhere in this file.
 */
import { readFileSync, readdirSync } from "fs";
import { strict as assert } from "assert";
import path from "path";

function read(relPath: string): string {
  return readFileSync(path.join(process.cwd(), relPath), "utf8");
}

const otpSource = read("src/convex/auth/emailOtp.ts");

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

// ─── Secret removal ──────────────────────────────────────────────────────────

test("no hardcoded email-OTP credential remains in source", () => {
  // The removed key's unique prefix — matches any copy of it, redacted or not.
  assert.ok(!otpSource.includes("fb_email"), "fb_email_* key absent from emailOtp.ts");
  assert.ok(!/fb_email/i.test(read("src/convex/http.ts")), "absent from http.ts");
  assert.ok(!/fb_email/i.test(read("src/convex/auth.ts")), "absent from auth.ts");
});

test("repo-wide: removed credential appears in no source-controlled code file", () => {
  // Recursively scan every non-test file under src (the entire application
  // source). Test files are skipped: they may reference the removed key's
  // redacted prefix in assertions but must never contain the credential.
  const srcDir = path.join(process.cwd(), "src");
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (!entry.name.includes(".test.") && readFileSync(full, "utf8").includes("fb_email")) {
        hits.push(full);
      }
    }
  };
  walk(srcDir);
  assert.equal(hits.length, 0, `files containing the removed credential: ${hits.join(", ")}`);
});

test("no long key-shaped literal remains in the authentication module", () => {
  const keyShaped = otpSource.match(/"[A-Za-z0-9_]{25,}"/g) ?? [];
  assert.equal(keyShaped.length, 0, `key-shaped literals found: ${keyShaped.join(", ")}`);
});

// ─── Environment-variable access ─────────────────────────────────────────────

test("credential is read from the EMAIL_OTP_API_KEY environment variable", () => {
  assert.ok(
    otpSource.includes("process.env.EMAIL_OTP_API_KEY"),
    "reads the server-only env var",
  );
  assert.ok(
    !otpSource.includes("VITE_"),
    "no Vite/client-side env prefix — secret stays server-side",
  );
  // Missing-configuration check happens before the provider request.
  const envCheckPos = otpSource.indexOf("process.env.EMAIL_OTP_API_KEY");
  const requestPos = otpSource.indexOf("axios.post");
  assert.ok(envCheckPos !== -1 && requestPos !== -1 && envCheckPos < requestPos,
    "missing-secret check executes before any provider call");
});

test("missing configuration fails safely with a clear, named error", () => {
  assert.ok(
    otpSource.includes("if (!apiKey)"),
    "explicit missing-secret guard",
  );
  assert.ok(
    otpSource.includes("Email OTP provider is not configured"),
    "clear server-side configuration error (no fallback key, no empty string, no silent skip)",
  );
  // The config error names the variable but must not contain any credential material.
  const errorMsg = otpSource.slice(
    otpSource.indexOf("Email OTP provider is not configured"),
    otpSource.indexOf("Email OTP provider is not configured") + 200,
  );
  assert.ok(!/fb_email/i.test(errorMsg), "error message contains no secret material");
});

// ─── Error-path hygiene (the second defect fixed) ────────────────────────────

test("raw axios errors are never serialized into thrown errors", () => {
  assert.ok(
    !otpSource.includes("JSON.stringify(error)"),
    "the previous JSON.stringify(error) leak vector is gone (axios errors embed config.headers, i.e. the API key)",
  );
  assert.ok(
    otpSource.includes("Failed to send verification email"),
    "generic delivery-failure message thrown instead",
  );
});

test("no secret is logged anywhere in the module", () => {
  assert.ok(
    !otpSource.includes("console.") && !otpSource.includes("createLogger"),
    "no logging calls in the OTP bridge",
  );
});

// ─── Flow preservation ───────────────────────────────────────────────────────

test("OTP semantics unchanged (provider, TTL, generation, request shape)", () => {
  assert.ok(otpSource.includes('id: "email-otp"'), "same provider id");
  assert.ok(otpSource.includes("maxAge: 60 * 15"), "15-minute token TTL unchanged");
  assert.ok(otpSource.includes("generateRandomString(random, alphabet, 6)"), "6-digit numeric OTP unchanged");
  assert.ok(otpSource.includes("https://auth.freebuff.app/send_otp"), "same provider endpoint");
  assert.ok(otpSource.includes("to: email"), "recipient unchanged");
  assert.ok(otpSource.includes("otp: token"), "token unchanged");
  assert.ok(otpSource.includes("appName:"), "appName metadata unchanged");
  assert.ok(otpSource.includes('"x-api-key": apiKey'), "key delivered via the same x-api-key header, now from env");
});

test("frontend auth flow untouched (no secret in client code)", () => {
  const authHook = read("src/hooks/use-auth.ts");
  assert.ok(!authHook.includes("process.env.EMAIL_OTP_API_KEY"), "env var not referenced client-side");
  assert.ok(!/fb_email/i.test(authHook), "no credential client-side");
});

// ─── Regression anchors ──────────────────────────────────────────────────────

test("payments module env convention unchanged (PAYSTACK_SECRET_KEY pattern preserved)", () => {
  const payments = read("src/convex/payments/actions.ts");
  assert.ok(payments.includes("process.env.PAYSTACK_SECRET_KEY"), "payments still reads its env var");
  assert.ok(payments.includes("Payment provider is not configured"), "payments missing-secret convention intact");
});

test("RBAC and role definitions untouched by this change", () => {
  const schema = read("src/convex/schema.ts");
  assert.ok(schema.includes("ROLE_PERMISSIONS"), "role permission map intact");
  assert.ok(schema.includes("[ROLES.SUPER_ADMIN]"), "roles intact");
});

// ─── Report ──────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error("FAILURES:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
