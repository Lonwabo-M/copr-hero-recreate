# Lasha Authentication

## Current state: separate logical realms, staff migration pending

Lasha now has three logical auth realms:

| Realm | Accounts | Status |
|---|---|---|
| Customer | `customer` | Email + password (current) |
| Driver | `driver` | Email + password (current); invite-only enrollment still to be enforced |
| Staff | `fleet_manager`, `operations`, `company_admin`, `super_admin` | Staff realm and Admin permission implemented; Zitadel SSO/MFA wiring pending credentials |

`company_admin` is **Lasha staff**, not a customer business administrator.
Customers have no admin portal. Fleet managers are internal staff too.

Important distinction:

- The **logical realm boundary** is implemented server-side: customer/driver
  roles cannot call staff functions, and staff roles cannot enter the Driver
  App. Admin is a separate `admin:access` permission.
- The **staff identity provider** is not switched yet. Staff still use the
  existing local password path until a Zitadel Cloud application is created
  and its issuer/client ID are configured. See `docs/zitadel-setup.md`.

## Customer and driver authentication method

**Email + password** via Convex Auth's supported `Password` provider
(`@convex-dev/auth`):

- Sign up: email + password (+ confirmation)
- Sign in: email + password
- Forgot password: email → reset code → new password

There is no OTP, magic-link, social, phone, or MFA in this local password
path. The previous email-OTP provider has been removed entirely. Staff MFA is
an IdP responsibility and is not implemented by the local password provider.

## Provider Configuration

`src/convex/auth.ts`:

```ts
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      id: "password",
      reset: emailDelivery,          // enables "reset"/"reset-verification" flows
      validatePasswordRequirements(password) {
        if (!password || password.length < 8) {
          throw new Error("Password must be at least 8 characters");
        }
      },
    }),
    Anonymous, // pre-existing platform provider (guest/bridge) — not used by the app UI
  ],
});
```

- **Password handling**: hashed with Scrypt by the provider. Plaintext
  passwords never touch the database, logs, query responses, or error
  messages. The client-supplied confirmation is a UI-only check; the
  provider's server-side validation (minimum 8 characters) is authoritative.
- **The pre-existing `Anonymous` provider** remains registered for the
  platform bridge; the application UI only ever invokes `"password"`.

## Sign-Up

`/auth?mode=signup` (`src/pages/Auth.tsx`):

1. Email + password + confirm password, with immediate client-side feedback
   (invalid email, missing/short password, confirmation mismatch).
2. `signIn("password", { email, password, flow: "signUp" })` creates the
   account (Convex Auth hashes the password and creates the user + account
   records).
3. On success the user is authenticated and routed to `/post-auth`.

Duplicate emails are rejected safely by the provider ("Account … already
exists"), surfaced as "An account with this email already exists".

## Sign-In

`/auth`:

1. Email + password (show/hide toggle).
2. `signIn("password", { email, password, flow: "signIn" })`.
3. Invalid credentials produce "Invalid email or password" — the error does
   not reveal whether the email exists. Failed attempts are rate-limited by
   Convex Auth's built-in mechanism ("Too many attempts").

## Changing a password (signed in)

Settings → **Security** posts to the `auth.passwordChange.changePassword`
action:

1. The user id comes from the session (`getAuthUserId`), never from the
   client, and the stored email is read from that user's own row.
2. `retrieveAccount` verifies the current password with the provider's Scrypt
   hash and the library's failed-attempt limiter — the same path as sign-in.
3. `modifyAccountCredentials` writes the new hash; hashing stays in the
   provider configuration.
4. `invalidateSessions` signs out every other session, keeping the current one.
5. An `auth.password_changed` audit event is written without password material.

Expected failures are returned as data (`INVALID_CURRENT_PASSWORD`,
`TOO_MANY_ATTEMPTS`, `WEAK_PASSWORD`, `SAME_PASSWORD`, `NO_PASSWORD_ACCOUNT`,
`UPDATE_FAILED`) so the UI shows fixed copy. Policy: at least 8 characters,
at most 128, and different from the current password.

## Password Reset

Provider-supported flow (no custom reset-token system):

1. **Forgot form** (`/auth` → "Forgot password?") — email submission.
2. `signIn("password", { email, flow: "reset" })` emails a 6-digit code via
   the email-delivery bridge. The page does not reveal whether the email
   exists: Convex Auth throws `InvalidAccountId` for an address with no
   password account, and a throttled address is indistinguishable on screen —
   both receive the same neutral notice (`src/lib/authError.ts`). A genuine
   delivery failure is still reported.
3. **Reset form** — code + new password + confirmation.
4. `signIn("password", { email, code, newPassword, flow: "reset-verification" })`
   verifies the code, replaces the hashed password, invalidates other
   sessions, and signs the user in.
5. On success the user continues to `/post-auth` (role-aware destination).

### Reset-request rate limit

Convex Auth rate-limits failed password guesses but **not** reset-code
requests, so the reset email bridge enforces a per-account throttle before
sending:

| Window | Maximum codes |
|---|---|
| 1 minute | 1 |
| 1 hour | 5 |
| 24 hours | 10 |

The send is recorded in `password_reset_rate_limits` (SHA-256 of the normalised
email plus recent send times — no readable address) before the email leaves.
A blocked request throws `RESET_RATE_LIMITED:<seconds>`. The reset page
**hides** that distinction and shows the same neutral notice as an unknown
email, because the throttle only applies to accounts that exist; the limit is
stated on the form instead. Emails with no password account never reach this
point, so the table cannot be used to discover addresses. Denied attempts are
not recorded — otherwise repeated clicking would keep pushing the cooldown
forward. Rows idle for 48 hours are removed by the POPIA retention sweep.

Error copy is an allowlist keyed by flow — a reset never shows password-policy
wording, because that step has no password field. Convex wraps failures in a
message containing a stack trace, and the previous substring check matched the
`Password.ts` frame, misreporting a missing account as "Password does not meet
requirements". Provider text is never rendered directly.

## Email Delivery

Password-reset codes are delivered through the **platform email API**
(`POST https://integrations.vly.ai/v1/email/send` — the same endpoint the
platform's own `@vly-ai/integrations` email client uses), authenticated with
the deployment's already-provisioned `VLY_INTEGRATION_KEY` (server-only
Convex environment). No separate email provider or additional key is
required.

| | |
|---|---|
| Endpoint | `${VLY_INTEGRATION_BASE_URL}/v1/email/send` (default `https://integrations.vly.ai`; the key is scoped to the host it was issued for) |
| Auth | `Authorization: Bearer VLY_INTEGRATION_KEY` — server-only; provided by the platform's deployment, or set manually (checklist below) |
| Sender | `noreply@project.freebuff.dev` (platform default) |
| Required for | Password-reset code delivery only — primary sign-up/sign-in needs no email delivery |
| Missing behaviour | Fails closed with a clear server-side configuration error; no fallback key, no silent skip, no fake success |
| Error hygiene | Provider failures throw a generic "Failed to send email"; HTTP error bodies/headers are never serialized into thrown errors |

### Deployment environment checklist

The platform injects these into its own deployment. A self-managed Convex
deployment (the app's `VITE_CONVEX_URL` target) needs all of them set in
Convex → Deployment → Settings → Environment Variables before password reset
can deliver:

| Variable | Purpose | Symptom when missing |
|---|---|---|
| `SITE_URL` | Base URL Convex Auth uses to build the reset destination (`https://<published-domain>`) | "Missing environment variable SITE_URL" → reset always fails |
| `VLY_INTEGRATION_KEY` | Bearer key for the platform email API | "Email delivery is not configured" |
| `VLY_INTEGRATION_BASE_URL` | Gateway host the key belongs to (the platform sets it per project) | A valid key is rejected by the wrong host → "Email delivery is temporarily unavailable" |
| `JWT_PRIVATE_KEY`, `JWKS` | Session token signing (generated by the Convex Auth CLI setup) | Sign-in fails, not just reset |

The reset page maps both configuration failures to "Password reset is
temporarily unavailable" — the underlying message names env vars and is never
rendered to the visitor. Changing env values needs no redeploy; Convex applies
them to the next function run.

## Legacy OTP Accounts

Accounts created under the previous email-OTP flow are stored in the
`authAccounts` table under the provider id `"email-otp"` (no password
secret), with their `users` row email already verified by the OTP sign-in.

**Migration behaviour — link on password sign-up:**

- The `Password` provider is configured with `reset: emailDelivery`, which
  enables email-linking during sign-up (`shouldLinkViaEmail`).
- A legacy OTP user who attempts password **sign-up** with their existing
  email is linked to their **existing user record** — same user ID, role,
  `businessId`, name, phone, and profile — with the new password attached.
  No duplicate user is created, roles are unchanged, and business
  associations are untouched.
- Until they do this, legacy accounts **cannot sign in with a password**
  (they have no password credential). The sign-in form's honest error is
  "Invalid email or password"; the recovery path is "Create account" with
  the same email, or password reset.

**Not done (deliberately):** no bulk migration, no automatic password
assignment, no deletion or modification of existing users/roles/businesses.

## Role Assignment

Roles remain **server-controlled** and are never accepted from the client:

- New users are provisioned manually (dashboard) exactly as before — the
  auth UI has no role selector, and no role field is passed through
  `signIn`.
- Unprovisioned users default to the customer experience via
  `getCurrentAuthUser`; Convex authorization (`RoleGate` → server RBAC)
  remains authoritative regardless of UI routing.
- `src/convex/schema.ts` maps every role to exactly one realm. Staff roles
  are `fleet_manager`, `operations`, `company_admin` and `super_admin`.
- `admin:access` is a separate permission held by `company_admin` and
  `super_admin`; Operations and Fleet Manager do not receive it automatically.

## Role-Aware Routing

After sign-in/sign-up/reset the app navigates to `/post-auth`, which resolves
the user's home route from their server-known role (`homeRouteForRole`):

- customer → `/dashboard`
- driver → `/driver`
- operations / fleet_manager → `/operations`
- company_admin / super_admin → `/admin/driver-approvals`

Deep links keep their `?returnTo=` target. Users never choose a role in the
auth UI. There is no cross-area navigation and no role-switching elevation:
entering another area redirects to the account's own home.

## Security

- Passwords: hashed (Scrypt) by Convex Auth; never in plaintext, logs,
  responses, or error messages. Client-side validation is UX only.
- Sessions: issued and managed entirely by Convex Auth (existing
  `auth.addHttpRoutes()` in `src/convex/http.ts` — no second auth HTTP API).
- Secrets: `VLY_INTEGRATION_KEY` is server-only (never `VITE_`-prefixed,
  never logged, never returned). No authentication secret exists in client
  code.
- Protected routes: `RequireAuth`/`RoleGate` guards; backend RBAC remains
  authoritative for every query/mutation.
- Realm checks: `requireStaff` rejects customer/driver accounts; `requireAdmin`
  requires the staff realm and the explicit `admin:access` permission.
- Removed: production `users.testAccess` role elevation. The old test-access
  mutation and its cross-area UI are gone. The Admin account inventory exposes
  any legacy `testElevated` records and a safe restore action.
- Abuse protection: Convex Auth's built-in sign-in rate limiting applies to
  password attempts (no custom rate-limiting service).
- Staff MFA: not implemented in the local password path. It must be enforced by
  the Zitadel application when staff SSO is wired; do not claim MFA is active
  before that cutover.

## Removed

- `src/convex/auth/emailOtp.ts` (OTP provider) — deleted.
- `EMAIL_OTP_API_KEY` dependency — no code references it; the previously
  exposed OTP bridge credential can be retired/rotated with the provider
  after legacy migration.
- All OTP UI: code entry, resend, countdown, "check your inbox" sign-in copy.

## Testing

`src/convex/auth/password.test.ts` verifies provider configuration, secret
removal, flow wiring (`signUp`/`signIn`/`reset`/`reset-verification`),
password-policy preservation, user-safe error mapping, legacy linking
behaviour, OTP-UI removal, and role-routing preservation.

`src/convex/auth/accessControls.test.ts` verifies the retired test-elevation
endpoint is absent, seed-time provisioning remains gated, demo credentials are
never committed, and tracking/diagnostics remain protected.

`src/components/shells/roleAccess.test.ts` verifies realm-exclusive area
access, the explicit Admin permission, home routes and navigation separation.
