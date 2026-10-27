# Lasha Authentication

## Authentication Method

**Email + password** via Convex Auth's supported `Password` provider
(`@convex-dev/auth`). Lasha uses one standard account model:

- Sign up: email + password (+ confirmation)
- Sign in: email + password
- Forgot password: email → reset code → new password

There is no OTP, magic-link, social, phone, or MFA authentication. The
previous email-OTP provider has been removed entirely.

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

## Password Reset

Provider-supported flow (no custom reset-token system):

1. **Forgot form** (`/auth` → "Forgot password?") — email submission.
2. `signIn("password", { email, flow: "reset" })` emails a 6-digit code via
   the email-delivery bridge. The page never reveals whether the email exists:
   Convex Auth throws `InvalidAccountId` for an address with no password
   account, and `/auth` turns that into the same neutral notice a known
   address receives (`src/lib/authError.ts`).
3. **Reset form** — code + new password + confirmation.
4. `signIn("password", { email, code, newPassword, flow: "reset-verification" })`
   verifies the code, replaces the hashed password, invalidates other
   sessions, and signs the user in.
5. On success the user continues to `/post-auth` (role-aware destination).

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
| Endpoint | `https://integrations.vly.ai/v1/email/send` (from `src/convex/auth/email.ts`) |
| Auth | `Authorization: Bearer VLY_INTEGRATION_KEY` — already provisioned on this deployment |
| Sender | `noreply@project.freebuff.dev` (platform default) |
| Required for | Password-reset code delivery only — primary sign-up/sign-in needs no email delivery |
| Missing behaviour | Fails closed with a clear server-side configuration error; no fallback key, no silent skip, no fake success |
| Error hygiene | Provider failures throw a generic "Failed to send email"; HTTP error bodies/headers are never serialized into thrown errors |

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

## Role-Aware Routing

Unchanged: after sign-in/sign-up/reset the app navigates to `/post-auth`,
which resolves the user's home route from their server-known role
(`homeRouteForRole`): customer → `/dashboard`, driver → `/driver`,
operations/fleet_manager → `/operations`, company_admin/super_admin →
`/operations`. Deep links keep their `?returnTo=` target. Users never choose
a role in the auth UI.

## Security

- Passwords: hashed (Scrypt) by Convex Auth; never in plaintext, logs,
  responses, or error messages. Client-side validation is UX only.
- Sessions: issued and managed entirely by Convex Auth (existing
  `auth.addHttpRoutes()` in `src/convex/http.ts` — no second auth HTTP API).
- Secrets: `VLY_INTEGRATION_KEY` is server-only (never `VITE_`-prefixed,
  never logged, never returned). No authentication secret exists in client
  code.
- Protected routes: unchanged `RequireAuth`/`RoleGate` guards; backend RBAC
  remains authoritative for every query/mutation.
- Abuse protection: Convex Auth's built-in sign-in rate limiting applies to
  password attempts (no custom rate-limiting service).

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
