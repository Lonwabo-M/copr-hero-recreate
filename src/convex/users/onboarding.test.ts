/**
 * Customer Onboarding Tests
 *
 * Verifies the onboarding backend contract and integration points:
 * - deterministic completeness (no client-asserted flags, no localStorage)
 * - session-derived identity (no client userId/businessId arguments)
 * - role boundary (customer-only onboarding)
 * - validation runs before any write (fail-closed, atomic)
 * - idempotent completion (no duplicate businesses/addresses)
 * - audit events use existing actions and valid categories
 * - post-auth routing gates customers on onboarding; other roles unchanged
 *
 * The repo's backend mutations require a live Convex session, so this suite
 * follows the repository's established source-verification pattern (see
 * dispatch/reassignment_authz.test.ts, auth/password.test.ts): assertions run
 * against the real function sources and the pure completeness logic is
 * exercised directly.
 *
 * Run: bunx tsx src/convex/users/onboarding.test.ts
 */

import { readFileSync } from "fs";
import { strict as assert } from "assert";
import { ROLES } from "../schema";
import {
  isOnboardingComplete,
  getOnboardingStatus,
  completeCustomerOnboarding,
} from "./onboarding";

// ─── Tiny assertion harness (mirrors existing repo tests) ────────────────────
let passed = 0;
let failed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push(`${name}: ${(e as Error).message}`);
  }
}

// ─── Source under test (loaded once) ────────────────────────────────────────
const onboardingSource = readFileSync(new URL("./onboarding.ts", import.meta.url), "utf8");

// ─── 1. Deterministic completeness logic (pure function) ─────────────────────

const user = (over: Partial<{ name: string; phone: string; businessId: string }> = {}) => ({
  name: "Thabo Mokoena",
  phone: "+27821234567",
  businessId: "biz123" as any,
  ...over,
});
const business = (over: Record<string, unknown> = {}) => ({ _id: "biz123", name: "Acme", ...over }) as any;
const address = (over: Record<string, unknown> = {}) =>
  ({ _id: "addr1", isDefault: true, ...over }) as any;

test("complete profile → complete", () => {
  assert.ok(isOnboardingComplete(user(), business(), address()));
});
test("missing name → incomplete", () => {
  assert.ok(!isOnboardingComplete(user({ name: "" }), business(), address()));
});
test("missing phone → incomplete", () => {
  assert.ok(!isOnboardingComplete(user({ phone: "" }), business(), address()));
});
test("no linked business → incomplete", () => {
  assert.ok(!isOnboardingComplete(user({ businessId: undefined }), null, address()));
});
test("no default address → incomplete", () => {
  assert.ok(!isOnboardingComplete(user(), business(), null));
});
test("non-default addresses are filtered at resolution time", () => {
  // isOnboardingComplete receives the RESOLVED default address (isDefault
  // filtering happens in the shared resolver) — verify the source filters.
  const src = onboardingSource.slice(
    onboardingSource.indexOf("async function resolveOnboardingData"),
    onboardingSource.indexOf("// ─── Status Query")
  );
  assert.ok(src.includes('a.isDefault === true'));
});

// ─── 2. Backend source contract: session-derived identity ────────────────────

const statusSource = getOnboardingStatus;
const completeSource = completeCustomerOnboarding;

test("status query takes no client arguments (identity from session only)", () => {
  assert.ok(statusSource && typeof statusSource === "function");
  const src = onboardingSource;
  const statusBlock = src.slice(
    src.indexOf("export const getOnboardingStatus"),
    src.indexOf("export const completeCustomerOnboarding")
  );
  assert.ok(statusBlock.includes("args: {}"));
  // Identity is session-derived: the unauthenticated window returns an
  // explicit placeholder (never data); once a session exists the query
  // resolves the user id server-side.
  assert.ok(statusBlock.includes("getAuthUserId(ctx)"));
  assert.ok(statusBlock.includes("unauthenticated: true"));
  assert.ok(!statusBlock.includes("args.userId"));
  // No client-supplied identity selectors anywhere in the module.
  assert.ok(!src.includes("args.userId"));
  assert.ok(!src.includes("args.businessId"));
  assert.ok(!src.includes("args.customerId"));
  assert.ok(!src.includes("args.addressId"));
});

test("status query exposes a deterministic `complete` flag", () => {
  const statusBlock = onboardingSource.slice(
    onboardingSource.indexOf("export const getOnboardingStatus"),
    onboardingSource.indexOf("export const completeCustomerOnboarding")
  );
  assert.ok(statusBlock.includes("complete: isOnboardingComplete("));
});

test("completion mutation is customer-only (role boundary)", () => {
  const src = onboardingSource;
  const block = src.slice(
    src.indexOf("export const completeCustomerOnboarding"),
    src.indexOf("// ─── Server-side validation")
  );
  assert.ok(block.includes('role !== ROLES.CUSTOMER'));
  assert.ok(block.includes("onboarding is only available to customer accounts"));
  assert.ok(block.includes("requireAuth(ctx)"));
});

test("completion is idempotent — already-complete returns early before writes", () => {
  const block = onboardingSource.slice(
    onboardingSource.indexOf("export const completeCustomerOnboarding"),
    onboardingSource.indexOf("const now = Date.now()")
  );
  const idx = block.indexOf("alreadyComplete: true");
  assert.ok(idx > -1, "has an alreadyComplete early return");
  // The idempotency check must run before the first db write.
  assert.ok(block.indexOf("alreadyComplete: true") < onboardingSource.indexOf('ctx.db.insert("businesses"'));
  // And before validation would have any effect anyway — it precedes validation.
  assert.ok(
    block.indexOf("alreadyComplete: true") < block.indexOf("─── Server-side validation")
  );
});

test("validation runs before ANY write (atomicity)", () => {
  const block = onboardingSource.slice(
    onboardingSource.indexOf("export const completeCustomerOnboarding")
  );
  // All validation throws precede the first write (the user profile patch).
  const firstWrite = block.indexOf("ctx.db.patch(userId");
  assert.ok(firstWrite > -1);
  const validationEnd = block.indexOf("// ─── Writes (all validation passed)");
  assert.ok(validationEnd > -1 && validationEnd < firstWrite);
  // The idempotency early-return also precedes every write.
  assert.ok(block.indexOf("alreadyComplete: true") < firstWrite);
});

test("no duplicate business identities — update-in-place when one is linked", () => {
  const block = onboardingSource.slice(
    onboardingSource.indexOf("export const completeCustomerOnboarding")
  );
  assert.ok(block.includes('existing?.business && user.businessId === existing.business._id'));
  assert.ok(block.includes('ctx.db.insert("businesses"'));
  assert.ok(block.includes('ctx.db.insert("addresses"'));
  // The default address is updated in place when it exists.
  assert.ok(block.includes("existing?.defaultAddress"));
});

test("business linking uses the session user as owner", () => {
  const block = onboardingSource.slice(
    onboardingSource.indexOf("export const completeCustomerOnboarding")
  );
  assert.ok(block.includes("ownerUserId: userId"));
});

test("audit events use existing actions with valid categories", () => {
  const block = onboardingSource.slice(
    onboardingSource.indexOf("export const completeCustomerOnboarding")
  );
  assert.ok(block.includes("AUDIT_ACTIONS.COMPANY_CREATED"));
  assert.ok(block.includes("AUDIT_ACTIONS.COMPANY_UPDATED"));
  assert.ok(block.includes("AUDIT_ACTIONS.USER_UPDATED"));
  assert.ok(block.includes('category: "company"'));
  assert.ok(block.includes('category: "user"'));
  assert.ok(block.includes("customer_onboarding"));
});

test("server-side validation mirrors the client fields", () => {
  const block = onboardingSource.slice(
    onboardingSource.indexOf("export const completeCustomerOnboarding"),
    onboardingSource.indexOf("const now = Date.now()")
  );
  for (const fn of ["validateBusinessName", "validateName", "validatePhone"]) {
    assert.ok(block.includes(fn), `uses ${fn}`);
  }
  assert.ok(block.includes("Business legal name") === false); // no invented labels server-side
  assert.ok(block.includes('"Phone number is required"'));
  assert.ok(block.includes('"Postal code"'));
});

// ─── 3. Frontend integration contract ────────────────────────────────────────

const postAuthSource = readFileSync(
  new URL("../../pages/PostAuthRedirect.tsx", import.meta.url),
  "utf8"
);

test("post-auth routes customers with incomplete onboarding to onboarding", () => {
  assert.ok(postAuthSource.includes("api.users.onboarding.getOnboardingStatus"));
  assert.ok(postAuthSource.includes('"/onboarding/customer"'));
  assert.ok(postAuthSource.includes('"/dashboard"'));
});

test("post-auth preserves driver/operations/admin routing", () => {
  assert.ok(postAuthSource.includes("homeRouteForRole(role)"));
  assert.ok(postAuthSource.includes("isCustomerExperience"));
});

test("onboarding page persists via the backend mutation and redirects only on success", () => {
  const pageSource = readFileSync(
    new URL("../../pages/CustomerOnboarding.tsx", import.meta.url),
    "utf8"
  );
  assert.ok(pageSource.includes("api.users.onboarding.completeCustomerOnboarding"));
  // Navigate only after a confirmed server success, inside try after await.
  const handleComplete = pageSource.slice(
    pageSource.indexOf("const handleComplete"),
    pageSource.indexOf("const inputStyle")
  );
  const awaitIdx = handleComplete.indexOf("await completeOnboarding");
  const navIdx = handleComplete.indexOf('navigate("/dashboard"');
  assert.ok(awaitIdx > -1 && navIdx > awaitIdx, "redirect happens after the awaited save");
  // Failed save → error state, no navigation, not marked complete.
  const catchBlock = handleComplete.slice(handleComplete.indexOf("catch"));
  assert.ok(catchBlock.includes("setError"));
  assert.ok(!catchBlock.includes('navigate("/dashboard"'));
});

test("onboarding route is registered behind the customer RoleGate", () => {
  const mainSource = readFileSync(new URL("../../main.tsx", import.meta.url), "utf8");
  assert.ok(mainSource.includes('path="/onboarding/customer"'));
  const routeBlock = mainSource.slice(
    mainSource.indexOf('path="/onboarding/customer"') - 200,
    mainSource.indexOf('path="/onboarding/customer"') + 400
  );
  assert.ok(routeBlock.includes("APP_AREAS.CUSTOMER"));
  assert.ok(routeBlock.includes("CustomerOnboarding"));
});

test("onboarding page never uses localStorage as the onboarding store", () => {
  const pageSource = readFileSync(
    new URL("../../pages/CustomerOnboarding.tsx", import.meta.url),
    "utf8"
  );
  assert.ok(!pageSource.includes("localStorage"));
  assert.ok(!pageSource.includes("sessionStorage"));
});

test("customer role remains canonical", () => {
  assert.equal(ROLES.CUSTOMER, "customer");
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log(`\ncustomer-onboarding: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  for (const f of failures) console.error(`  FAIL ${f}`);
  process.exit(1);
}
