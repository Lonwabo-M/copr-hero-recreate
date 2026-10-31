# Zitadel Cloud — staff identity provider (Phase 1)

> Status: **selected, not yet wired.** The staff realm and Admin permission are
> implemented in the codebase, but the staff login still uses the existing
> local password path. Zitadel cannot be connected until the staff application
> exists and its issuer/client ID are available. No secrets belong in this
> repository.

## Why Zitadel Cloud Free

The current budget is R0/month, so the staff provider must be genuinely free
and must include MFA:

- Zitadel Cloud Free: $0, no credit card, 100 daily active users, unlimited
  stored users, MFA/passkeys, OIDC.
- Microsoft Entra ID Free: $0 for the tier, but requires an Azure subscription
  with a payment method; security-defaults MFA.
- Google Cloud Identity Free: $0 for 50 users, but SAML-first and more setup.
- Auth0 Free: no MFA on the free plan.
- WorkOS AuthKit: free user management/MFA, but enterprise SSO is paid.

The free Zitadel tier has real limits: one administrator, no custom domain
(the login URL is on `*.zitadel.cloud`), and one day of login audit history.
Application-level audit events in Convex remain available for sensitive
actions. Revisit the provider if the team grows beyond the free tier or needs
a custom login domain.

Before relying on it for staff, confirm Zitadel's terms permit internal
workforce use on the free tier. If not, the documented fallback is Entra ID
Free (card required) or Google Cloud Identity Free.

## What is already implemented

- Three logical realms: customer, driver, staff.
- `company_admin`, `operations`, `fleet_manager` and `super_admin` are staff.
- `company_admin` is an internal Lasha administrator, never a customer role.
- Admin Portal access is the separate `admin:access` permission, held by
  `company_admin` and `super_admin`.
- `requireStaff()` and `requireAdmin()` enforce the realm and Admin permission
  server-side.
- Test-area role elevation (`users.testAccess`) has been removed.
- Admin → Accounts shows the account inventory and can restore any legacy
  test-elevated account.
- The frontend has no cross-area navigation or role switching; each role lands
  in its own area.

## Remaining setup (needs the Zitadel account)

### 1. Create the staff project and application

1. Create a Zitadel Cloud instance/organisation for Lasha.
2. Create a project, e.g. `Lasha Staff`.
3. Add a **User Agent** (single-page app) OpenID Connect application, e.g. `Lasha Staff Portal`. Do not choose **Web** for the React SPA; that type expects a client secret.
4. Enable authorization-code flow with PKCE. Do not enable implicit flow.
5. Configure redirect URIs after the subdomains exist:
   - `https://ops.lasha.co.za/auth/callback`
   - `https://admin.lasha.co.za/auth/callback`
   - Add the current preview/staging callback separately if staff login is
     tested before the subdomains are live.
6. Ensure the application emits a signed JWT that Convex can validate. Confirm
   the exact token type (ID token vs JWT access token) and audience during
   integration; do not guess.

### 2. Add the deployment configuration

When the values exist, add them to the Convex deployment environment (never to
a committed `.env` file):

| Variable | Purpose |
|---|---|
| `ZITADEL_ISSUER` | Zitadel instance issuer, e.g. `https://<instance>.zitadel.cloud` |
| `ZITADEL_CLIENT_ID` | Staff application client ID (the JWT audience) |

`src/convex/auth.config.ts` cannot reference a missing environment variable:
Convex validates every referenced env var at deploy time. That is why the
Zitadel provider is **not** added yet. Add the provider only after both values
are configured, then run `bunx convex dev --once`.

### 3. Add the principal resolver

Convex Auth's `getAuthUserId()` assumes the token subject is an internal
`users` document ID. A Zitadel `sub` is not that ID. The staff integration must:

- validate the Zitadel issuer and audience;
- look up the staff account by a stable external identity key
  (`issuer` + `subject`), not by email alone;
- reject unknown staff immediately (no self-provisioning);
- attach the internal role from an explicit server-side mapping or a trusted
  Zitadel group claim;
- never auto-link a Zitadel identity to a customer account by email.

This resolver is deliberately not being written before the token shape and
claims are confirmed.

### 4. Enforce MFA and admin policy in Zitadel

- Require MFA for every staff user.
- Prefer passkeys/security keys; allow an authenticator app as fallback.
- For `super_admin`, require a stronger method and shorter session lifetime.
- Keep customer and driver accounts out of the Zitadel organisation.
- Use Zitadel groups or a server-side allowlist to assign
  `operations`/`fleet_manager`/`company_admin`/`super_admin`; a client must
  never choose its role.

### 5. Cutover

1. Create staff accounts in Zitadel and map them to existing internal users.
2. Verify the Admin account inventory: every staff account is in the Staff
   realm; no customer/driver accounts remain in staff roles.
3. Enable the Zitadel provider and staff login route.
4. Test that a Zitadel token cannot call customer/driver endpoints and that a
   customer token cannot call staff endpoints.
5. Force a sign-out of the old shared session, disable legacy staff passwords,
   and keep the customer/driver password path unchanged.
6. Roll back by disabling the Zitadel provider; do not delete the customer
   auth path during the first cutover.

## Security rules for the integration

- Never accept a role from the client.
- Never merge identities by email across realms.
- Never expose a staff signup form.
- Never put Zitadel secrets in `VITE_*` variables or client code.
- Never claim MFA is enforced until the Zitadel policy is active and tested.
- Keep the Admin permission server-side; hiding the sidebar is not a control.
