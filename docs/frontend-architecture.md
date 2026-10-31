# Lasha — Frontend Architecture

> Status: implemented. This document describes the role-separated frontend
> structure introduced by the frontend architecture refactor.

## Overview

The Lasha frontend is a **single Vite + React + TypeScript application**, but
it is organized into **four role-specific application experiences**:

| Area | Purpose | Home route |
|------|---------|-----------|
| Customer Portal | Customer/business delivery functionality | `/dashboard` |
| Driver App | Driver/courier workflow (assignments, POD, GPS) | `/driver` |
| Operations Centre | Dispatch and operational monitoring | `/operations` |
| Admin | Platform administration | `/admin/driver-approvals` |

Admin is a separate permission (`admin:access`) inside the staff login realm.
`company_admin` is a Lasha staff administrator, not a customer/business role.
Customers have no admin portal. Operations and Fleet Manager are staff, but do
not automatically receive Admin access.

## What the audit found (before the refactor)

- Every page embedded its own copy of the app chrome: `dash-topnav` header,
  `dash-app` body, mobile overlay, and a `Sidebar` instance — 14 copies of the
  same shell markup.
- A single global navigation list (`Sidebar.tsx`) mixed customer entries
  (Wallet, Invoices, Make Payment) with the driver's "Active Delivery" entry,
  and `useDashboardNav.ts` mapped all labels to all routes.
- The only route guard was `RequireAuth` (authentication only). RBAC existed in
  the Convex backend (`src/convex/schema.ts`: `ROLES`, `ROLE_PERMISSIONS`) but
  the frontend never used it.
- Driver Active Delivery and the Operations Centre were reachable from the same
  customer-facing sidebar — driver features appeared conceptually inside the
  customer dashboard.

**Important:** ownership was assigned by feature purpose and the backend
authorization model, NOT by current UI location (which was the problem being
fixed).

## New structure

```
src/components/shells/
├── navigation.ts       # APP_AREAS + per-area navigation configs (pure data)
├── roleAccess.ts       # roleToArea(), canAccessArea(), homeRouteForRole()
├── RoleGate.tsx        # Role-aware route guard (layers on RequireAuth)
├── AppShell.tsx        # Single implementation of the Lasha chrome
├── CustomerShell.tsx   # area="customer"
├── DriverShell.tsx     # area="driver"
├── OperationsShell.tsx # area="operations"
└── AdminShell.tsx      # area="admin"
```

### Shells

`AppShell` renders the top navigation + `dash-app` body + mobile overlay +
`Sidebar` exactly once. Each role shell is a thin wrapper passing its area:

- The sidebar receives **only** its area's navigation entries — a Driver shell
  physically cannot render customer entries and vice versa.
- Visual styling is unchanged: the same `dashboard.css` classes, the same
  Lasha design system, the same responsive behaviour.
- `Sidebar.tsx` (shared) now takes an `items` prop instead of a hardcoded
  global list; icons are resolved from a label registry to keep navigation
  configs pure data.

### Role → area mapping (`roleAccess.ts`)

| Role | Realm | Area | Rationale |
|------|-------|------|-----------|
| `customer` | Customer | Customer Portal | Delivery requester |
| `driver` | Driver | Driver App | Courier workflow |
| `operations` | Staff | Operations Centre | Dispatch/ops permissions |
| `fleet_manager` | Staff | Operations Centre | Internal fleet operations |
| `company_admin` | Staff | Admin | Internal Lasha administrator |
| `super_admin` | Staff | Admin | Internal platform administrator |
| unknown/missing | Customer default | Customer Portal | Safe default; Convex still authorizes data |

Area access (`canAccessArea`) is realm-exclusive:

- **customer** — `customer` (and roleless new sign-ups, before provisioning)
- **driver** — `driver` only
- **operations** — `operations`, `fleet_manager`
- **admin** — roles holding `admin:access` (`company_admin`, `super_admin`)

There is no cross-area walk-in and no test elevation. A user who opens another
area is redirected to their own home. The backend enforces the same boundaries
with `requireStaff()` and `requireAdmin()`.

### Route guard (`RoleGate`)

```
<RoleGate area={APP_AREAS.DRIVER}>
  <DriverActiveDelivery />
</RoleGate>
```

- Wraps (does not replace) the existing `RequireAuth`: unauthenticated users
  still go to `/auth?returnTo=<path>` with the intended path preserved.
- A signed-in user whose role cannot access the area is redirected to
  `homeRouteForRole(role)` — e.g. a customer hitting `/driver` lands on
  `/dashboard`, a driver hitting `/dashboard` lands on `/driver`.
- **The frontend is a UX boundary, not a security boundary.** Convex queries
  and mutations remain the authoritative authorization layer: every domain
  function resolves the authenticated user server-side and enforces RBAC there.
  No authorization logic was moved out of Convex.

## Routes

| Area | Routes |
|------|--------|
| — (public) | `/`, `/auth`, `/post-auth` |
| Customer Portal | `/dashboard`, `/request-delivery`, `/checkout/:orderId`, `/track-delivery`, `/deliveries/:deliveryId`, `/wallet`, `/past-deliveries`, `/invoices`, `/notifications`, `/settings`, `/help`, `/disputes`, `/legal`, `/downloads` |
| Driver App | `/driver`, `/driver/offers`, `/driver/history`, `/driver/history/:deliveryId`, `/driver/profile`, `/driver/active-delivery` |
| Operations Centre | `/operations` |
| Admin | `/admin/driver-approvals`, `/admin/driver-roster`, `/admin/pricing-rules`, `/admin/platform-health`, `/admin/audit-log`, `/admin/accounts` |

Backwards compatibility: `/make-payment` forwards old Paystack references to
`/checkout/:orderId` (and otherwise redirects to `/dashboard`); the standalone
page was removed in favour of order-scoped checkout. `/driver/active-delivery`
keeps its original path.

## Role-aware routing after sign-in

1. `Auth.tsx` honours `?returnTo=` (set by `RequireAuth`/`RoleGate`) so deep
   links survive authentication.
2. Without a `returnTo`, sign-in lands on `/post-auth`, where
   `PostAuthRedirect.tsx` resolves the user's role via the existing
   `useAuth()` hook and redirects to the area home: customer → `/dashboard`,
   driver → `/driver`, operations/fleet_manager → `/operations`,
   company_admin/super_admin → `/admin/driver-approvals`.

## Navigation separation

Navigation configs are per-area pure data in `navigation.ts`:

- `customerNavigation` — 13 entries: Activity Center, Past Deliveries,
  Request Delivery, Track Delivery, Address Book, Invoices, Wallet,
  Notifications, Help, Disputes, Legal, Downloads, Settings. Payment is not a
  top-level destination; it lives inside the order-scoped Checkout.
- `driverNavigation` — Delivery Offers, Active Delivery, Delivery History,
  Earnings, Driver Application and Profile. No customer/Operations/Admin links.
- `operationsNavigation` — Operations Centre, Disputes, Privacy Requests. No
  Driver App or Admin Portal link.
- `adminNavigation` — Driver Approvals, Driver Roster, Pricing Rules, Platform
  Health, Audit Log and Accounts. No Operations or Customer links.

There is no global nav list, no cross-area access point and no test elevation.
Separation is enforced by the route architecture + area-scoped shells, not by
CSS hiding.

## Preserved functionality

- Customer pages: unchanged UI/logic, only the duplicated shell markup was
  replaced by `CustomerShell`.
- Driver Active Delivery: delivery state handling, Convex mutations, tracking
  queries, continuous GPS tracking hook, POD workflow, and error handling are
  untouched — the page now renders inside `DriverShell`.
- POD remains driver-only; customers have no POD submission controls.
- Operations Centre: unchanged, now inside `OperationsShell`.
- Authentication: Convex Auth (email + password) for customer/driver; staff
  realm and Admin permission implemented, with Zitadel SSO/MFA pending
  credentials (see `docs/zitadel-setup.md`).
- Backend: **zero changes** to Convex domain logic, pricing, dispatch, delivery
  state transitions, POD authorization, or tracking validation.

## Tests

`src/components/shells/roleAccess.test.ts` covers:

- role → area mapping for all six roles + unknown/missing fallback
- the full realm-exclusive area-access matrix (allow + deny cases per area)
- `admin:access` held only by `company_admin` and `super_admin`
- home routes per role
- navigation separation (no customer/driver/operations/admin cross-links)

Run: `bunx tsx src/components/shells/roleAccess.test.ts`

## Driver Offer Workflow (dispatch ↔ Driver App)

> Status: implemented. See `src/pages/DriverOffers.tsx` and
> `src/convex/dispatch/engine.ts`.

### Offer lifecycle

```
Delivery created (requested → pending_dispatch)
  → dispatch.engine.dispatchDelivery: discovers eligible drivers, scores them
    (scoring_service), creates pending dispatch_offers with 2-minute expiry
  → driver sees offer on /driver/offers (reactive query getMyDispatchOffers)
  → driver accepts  → acceptAssignment: ASSIGNED → DRIVER_ACCEPTED, driver set
                      as courier, competing pending offers cancelled
  → driver rejects  → rejectAssignment: offer → rejected; dispatch/reassignment
                      logic operates as designed (reassignDelivery, ops-side)
  → no response     → offer expires (expiresAt) / processExpiredOffers (ops)
  → accepted        → Active Delivery workflow (state machine → POD → complete)
```

### Backend operations reused (no second dispatch system)

| Operation | Role in the workflow |
|---|---|
| `dispatch.engine.getMyDispatchOffers` | Reactive offer list for the authenticated driver (resolves identity server-side) |
| `dispatch.engine.acceptAssignment` | Accept: role check → offer ownership → pending/expiry validation → atomic concurrency re-check → state transition → cancel competing offers → tracking event |
| `dispatch.engine.rejectAssignment` | Reject: role check → ownership → pending validation (reason optional; UI sends none) |
| `dispatch.scoring_service` | Candidate discovery/ranking/expiry duration — untouched |
| `deliveries.state_machine.*` | Everything after acceptance — untouched |

### Accept / reject workflow (client)

`DriverOffers` is a display layer over the backend:

- **Accept** calls `acceptAssignment({ offerId })`. On success the driver is
  navigated to `/driver/active-delivery`, which reactively loads the newly
  accepted delivery. All buttons lock while any submission is in flight
  (duplicate-submission prevention).
- **Reject** calls `rejectAssignment({ offerId })` with no reason (the backend
  makes it optional; the UI does not invent one).
- **Errors are surfaced verbatim** in a `driver-error` banner — including
  "already been claimed by another driver (concurrent acceptance)",
  "Offer has expired", "Offer does not belong to this driver", and
  "not pending". The reactive query then removes the stale offer. The UI never
  fabricates a successful assignment.

### Expiry handling

- Offers expire after 2 minutes (`scoring_service` `offerExpiryMs`).
- The UI shows a live countdown and disables Accept/Reject once
  `expiresAt <= now`. This is display logic only — the backend re-validates
  expiry inside `acceptAssignment` (throws "Offer has expired"), so an expired
  offer can never be successfully accepted through the UI.
- **Known gap:** `getMyDispatchOffers` returns pending offers without filtering
  `expiresAt`; expired offers remain visible until the reactive query refreshes
  or ops runs `processExpiredOffers`. Handled client-side (filter + disabled
  buttons) without creating a second expiry system; the backend remains the
  correctness boundary.

### Concurrency

The engine documents its own protection: an atomic delivery re-read immediately
before assignment prevents two drivers claiming the same delivery — only one
`acceptAssignment` succeeds; the other throws and the UI shows the backend's
message and refreshes. The frontend adds no optimistic assignment logic.

### Handoff to Active Delivery

Successful acceptance transitions the delivery to `driver_accepted` and sets
`courierId`. `DriverActiveDelivery` uses `tracking.queries.getMyCurrentDelivery`,
which reactively picks up the delivery — no state is passed between pages, no
duplication of the workflow. State transitions, GPS tracking, and POD continue
exactly as before.

### Tests

`src/pages/driverOffers.test.ts` (19 assertions): expiry boundary/filtering,
countdown formatting, accept/reject gating (duplicate-submission prevention),
backend error contract surfaced verbatim, `ASSIGNED → DRIVER_ACCEPTED` state
transition consistency, backend offer-status vocabulary, and the no-invented-
rejection-reason policy.

Run: `bunx tsx src/pages/driverOffers.test.ts`

## Driver Delivery History

> Status: implemented. See `src/pages/DriverHistory.tsx`,
> `src/pages/DriverDeliveryDetail.tsx` and
> `deliveries.state_machine.getMyDeliveryHistory`.

### Route & authorization

- `/driver/history` — list (Driver App area, `RoleGate` guarded)
- `/driver/history/:deliveryId` — detail

The list is served by a new **driver-scoped** Convex query,
`getMyDeliveryHistory` (in `src/convex/deliveries/state_machine.ts`):

- **Identity is resolved server-side** via `getCurrentAuthUser` — the query
  accepts no driver ID from the client and only returns deliveries where
  `courierId ===` the authenticated driver. There is no React-side filtering of
  a global list.
- Non-drivers are refused (`"Only drivers have a delivery history"`).
- Detail views reuse the existing driver-authorized queries:
  `state_machine.getDelivery` (throws "Access denied: not your delivery" for a
  URL-manipulated foreign delivery), `tracking.queries.getDeliveryTracking`,
  and `pod.service.getPODForDelivery` (driver branch of `canAccessPOD`).

### Scope, filters and pagination

- **Historical statuses** — terminal states only, existing terminology:
  `delivered`, `failed`, `cancelled`. Rejected *offers* live in
  `dispatch_offers`, not `deliveries`, and are therefore not part of delivery
  history (documented limitation, no fabricated records).
- **Filters (server-side)** — status (via the `by_courier_status` index) and
  date window (last 7/30/90 days) applied in Convex before paging.
- **Pagination (server-side cursor)** — page size 20 (clamped 1–100);
  `nextCursor` continuation + Previous/Next controls. No unbounded history in
  the browser.
- Displayed fields all exist in the backend: tracking number, route cities,
  package size/type, order price, historical timestamps. **No earnings, fees,
  distances or ratings are shown** (not part of the data model / this task).

### Historical detail

Shows final status, pickup/dropoff coordinates, timeline (assigned → accepted →
started → completed, rejected for cancellations), route history from existing
tracking events, and POD information. Customer/admin-only data is not rendered.

### POD viewing

Completed deliveries open their stored POD through the existing
`getPODForDelivery` — the assigned driver retains read access via
`canAccessPOD`; nothing about POD storage or submission changed. Deliveries
without POD show an explicit empty state.

### Tests

`src/pages/driverHistory.test.ts` (18 assertions): session-derived identity,
foreign-delivery refusal, role gate, historical-status vocabulary (terminal,
no invented states), status/date filters, cursor pagination (resume, end,
clamping), timestamp precedence, and the POD authorization branches.

Run: `bunx tsx src/pages/driverHistory.test.ts`

## Driver Profile

> Status: implemented. See `src/pages/DriverProfile.tsx`. Built entirely on
> existing backend operations — **zero backend changes**.

### Route & data source

- `/driver/profile` — Driver App area, `RoleGate` guarded.
- Reads: `users.currentUser` (session-derived profile) and
  `users.businessProfile.getMyBusiness` (session-derived company association).
- Writes: `users.updateMyProfile` — the existing secure mutation whose
  identity always comes from the auth session (no client user IDs) and whose
  args structurally exclude privileged fields. Changes are audit-logged
  (`user.updated` with before/after snapshots).

### Editable vs read-only

| Editable (backend whitelist `PROFILE_EDITABLE_FIELDS`) | Read-only |
|---|---|
| Name (validated, max 100 chars) | Email (managed by OTP sign-in) |
| Phone (validated, max 20 chars; empty clears it) | Role, email verification state |
| | Business association (`businessId` is protected) |
| | Profile image, GPS fields, account creation date |

Validation is mirrored client-side (from `users/profileValidation.ts`) for fast
feedback; the backend remains authoritative and re-validates before patching.
The Save button is disabled when the form is untouched; saving/success/error
states are shown, and the profile re-renders reactively from Convex after a
successful mutation.

### Status / business / security sections

- **Account status** — role, email-verification state, and member-since date
  are displayed read-only. Operational/verification statuses cannot be changed
  from this page (no such mutation exists).
- **Company affiliation** — displayed read-only when the driver has a
  `businessId`; a driver profile is not a business administration page.
- **Account security** — sign-in is OTP-based (email verification code, no
  password); the page states this accurately and shows no fake password
  controls.
- **Logout** lives in the DriverShell sidebar; the profile page does not
  duplicate it.

### Avatar

The `users.image` field exists but is listed in `PROTECTED_USER_FIELDS` and **no
image-upload mutation/flow exists in the backend**. The avatar is therefore
display-only (image if present, otherwise an initial-letter fallback). Building
a storage flow was explicitly out of scope — documented as a limitation.

### Tests

`src/pages/driverProfile.test.ts` (15 assertions): session-derived identity,
editable whitelist exactly `{name, phone}`, protected-field coverage
(role/businessId/email/verification/image/GPS), business reassignment
prevention, validation rules (name/phone formats and limits), persistence
semantics (trimming, phone clearing, empty-patch short-circuit), and audit
logging shape.

Run: `bunx tsx src/pages/driverProfile.test.ts`

## Remaining gaps (intentionally not built here)

1. **Admin pages** — driver approvals, roster, pricing, health, audit and the
   account inventory exist. Further admin surfaces (user management, business
   management) still need explicit backend operations and permissions.
2. **Driver App depth** — Delivery Offers, Active Delivery, Delivery History,
   and Profile exist. Earnings/Wallet and Safety/SOS need both backend queries
   and pages before they get navigation entries.
3. **Operations ↔ Admin distinction** — the areas are now separated in the
   frontend and Admin requires `admin:access`. Some legacy backend queries
   still use broader staff role lists (especially shared operations reads);
   those are being tightened as each Admin surface is migrated.
4. **Customer POD viewing** — explicitly out of scope for the driver POD task
   and this refactor; can be added to the Customer Portal later.
