# Zitadel Cloud — staff identity provider (Phase 1)

> Status: **provider wired; activation pending a Zitadel Web application and
> deployment environment values.** The staff realm, Admin permission, Zitadel
> provider and staff-only account guard are implemented. Staff can still use
> the existing local password path until the Web application client secret is
> configured. No secrets belong in this repository.
>
> The Convex CLI must target the active deployment
> (`incredible-warbler-335`), not the paused `keen-octopus-299` deployment.
> Freebuff stores the key as `CONVEX_DEPLOY_KEY_LIVE`; the CLI needs an alias
> named `CONVEX_DEPLOY_KEY`. See [convex-deployment.md](convex-deployment.md).

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
- Admin → Accounts shows the account inventory, can restore any legacy
  test-elevated account, and can prepare staff emails for SSO linking.
- The frontend has no cross-area navigation or role switching; each role lands
  in its own area.
- `/staff-login` starts the Zitadel flow. Customer and driver sign-in remains
  on `/auth`.
- Zitadel identities are rejected unless they link to an existing internal
  staff account. A Zitadel user is never self-provisioned.

## Remaining setup (needs the Zitadel account)

### 1. Create the staff project and application

1. Create a Zitadel Cloud instance/organisation for Lasha.
2. Create a project, e.g. `Lasha Staff`.
3. Add a **Web** OpenID Connect application, e.g. `Lasha Staff Portal`.
   Do **not** use a User Agent application: Convex Auth exchanges the code on
   the server and its OIDC handler requires a client secret. A User Agent app
   is a public client and cannot complete that exchange.
4. Choose the **Code** authentication method (client ID + client secret) and
   keep authorization-code flow enabled. Convex Auth also sends a PKCE
   challenge; do not enable implicit flow.
5. Configure the callback URL. The callback belongs to the Convex deployment,
   not to the React route:
   - Current deployment:
     `https://incredible-warbler-335.convex.site/api/auth/callback/zitadel`
     (backend: `https://incredible-warbler-335.convex.cloud`)
   - Production stays on the deployment's `*.convex.site` host. A future
     `ops.lasha.co.za` or `admin.lasha.co.za` host does not change this unless
     `CUSTOM_AUTH_SITE_URL` is introduced deliberately.
   - Post-login destination is handled by the app: `/staff-login` starts the
     flow, then continues to `/post-auth` (or the original `returnTo` path).
   - Post-logout URI: `https://lasha.freebuff.app/staff-login`
6. Copy the **Client ID** and **Client Secret**. To find the issuer, open the
   application's left sidebar and click **URLs**. The page lists endpoints such
   as Authorization and Token; the issuer is their **shared base URL**, not one
   of the full endpoint paths. For example, if the Authorization Endpoint is
   `https://example.zitadel.cloud/oauth/v2/authorize`, the issuer is
   `https://example.zitadel.cloud`. Alternatively, click the **discovery
   endpoint** link in the blue banner and use the JSON `issuer` value. For the
   current instance, the confirmed issuer is
   `https://lasha-staff-xjjjze.eu1.zitadel.cloud` (note the three `j`s in
   `xjjjze`).

   Do not derive the issuer from the browser's `/ui/console/...` address.
   Before wiring, open the exact discovery endpoint and confirm it returns
   JSON. If it returns `Instance not found`, the instance/domain is not ready
   (or the console URL is not the instance domain); use the link from **URLs**
   rather than guessing. Convex Auth validates the ID token; do not add a
   second JWT provider or expose the client secret through a `VITE_*`
   variable.

### 2. Add the deployment configuration

When the values exist, add them to the Convex deployment environment (never to
a committed `.env` file):

| Variable | Purpose |
|---|---|
| `ZITADEL_ISSUER` | Base URL of the app's **URLs → Discovery Endpoint**, without `/.well-known/openid-configuration` |
| `ZITADEL_CLIENT_ID` | Staff Web application client ID |
| `ZITADEL_CLIENT_SECRET` | Staff Web application client secret; server-side only |

`https://incredible-warbler-335.convex.site` is the app's own Convex Auth
issuer, used for its session JWTs. It is **not** the Zitadel issuer. Never set
`ZITADEL_ISSUER` to the Convex site URL; doing so points the Zitadel provider
at the app itself and staff login cannot complete.

The provider is already registered in `src/convex/auth.ts`; the values must be
set on the **active** Convex deployment `incredible-warbler-335` (use the
project's Keys/API keys UI, never a committed `.env` file). Until the secret is
present, `/staff-login` will report that SSO is unavailable; customer and
driver password auth is unaffected.

Before deploying, confirm the CLI target with
`bunx convex dev --once`; it must name `incredible-warbler-335`, not
`keen-octopus-299`. The permanent target setup is in
[convex-deployment.md](convex-deployment.md).

### 3. Account linking and staff guard

Convex Auth stores the Zitadel subject as an `authAccounts` provider account and
links it to an existing internal user only when the email is verified. The
staff integration then applies this guard in `src/convex/auth.ts`:

- the Zitadel email claim must be verified;
- a new Convex Auth user is rejected, so there is no self-provisioning;
- the linked user must have a staff role (`fleet_manager`, `operations`,
  `company_admin` or `super_admin`);
- the role comes from the existing Convex user record, never from a client or
  from the Zitadel group claim;
- a customer or driver account with the same email is rejected, not elevated.

Password-era staff records may not have an email-verification marker. Open
Admin → Accounts and use **Prepare staff SSO** before the first Zitadel login;
it marks only unique staff emails and never touches customer/driver accounts.
Staff without an email, or with duplicate emails, are skipped and must be fixed
in the account inventory first.

### 4. Enforce MFA and admin policy in Zitadel

- Require MFA for every staff user.
- Prefer passkeys/security keys; allow an authenticator app as fallback.
- For `super_admin`, require a stronger method and shorter session lifetime.
- Keep customer and driver accounts out of the Zitadel organisation.
- Roles stay on the existing Convex user records. Zitadel groups may later be
  used as an input to a server-side role sync, but a group or client value must
  never be accepted directly as the Lasha role.

### 5. Cutover

1. Create staff accounts in Zitadel with the same verified email addresses as
   the existing internal users.
2. Verify the Admin account inventory: every staff account is in the Staff
   realm; no customer/driver accounts remain in staff roles.
3. Open Admin → Accounts and use **Prepare staff SSO**; fix any skipped
   accounts that have no email or duplicate emails.
4. Add `ZITADEL_ISSUER`, `ZITADEL_CLIENT_ID` and `ZITADEL_CLIENT_SECRET` to
   the active Convex deployment, confirm `bunx convex dev --once` names
   `incredible-warbler-335`, then run it.
5. Sign in through `/staff-login` with a test Operations account and a test
   Admin account. Confirm each lands in the correct area.
6. Test that a Zitadel staff token cannot call customer/driver endpoints and
   that a customer token cannot call staff endpoints.
7. Force a sign-out of the old shared session, disable legacy staff passwords,
   and keep the customer/driver password path unchanged.
8. Roll back by disabling the Zitadel provider; do not delete the customer
   auth path during the first cutover.

## Security rules for the integration

- Never accept a role from the client.
- Never merge identities by email across realms.
- Never expose a staff signup form.
- Never put Zitadel secrets in `VITE_*` variables or client code.
- Never allow a Zitadel identity to create a Convex Auth user.
- Never claim MFA is enforced until the Zitadel policy is active and tested.
- Keep the Admin permission server-side; hiding the sidebar is not a control.
