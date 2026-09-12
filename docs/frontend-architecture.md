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
| Admin | Platform administration (no pages yet — reserved) | `/operations`* |

\* No admin-only pages exist yet. Admin-role users (`company_admin`,
`super_admin`) are routed to the Operations Centre, which their role already
has access to. When the first admin page is built it gets the `/admin` route
inside `AdminShell` and the first `adminNavigation` entry.

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
└── AdminShell.tsx      # area="admin" (reserved)
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

| Role | Area | Rationale |
|------|------|-----------|
| `customer` | Customer Portal | Delivery requester |
| `driver` | Driver App | Courier workflow |
| `operations` | Operations Centre | Dispatch/ops permissions |
| `fleet_manager` | Operations Centre | fleet:view/manage permissions |
| `company_admin` | Admin (→ Operations for now) | user:manage, business:manage |
| `super_admin` | Admin (→ Operations for now) | all permissions |
| unknown/missing | Customer Portal | Safe default; Convex still authorizes data |

Area access (`canAccessArea`):

- **customer** — all authenticated roles (backend scopes every query per-user)
- **driver** — `driver`, `super_admin`
- **operations** — `operations`, `fleet_manager`, `company_admin`, `super_admin`
- **admin** — `company_admin`, `super_admin` only

These mirror the backend's own checks (e.g. `users.ts` grants cross-user
visibility to `SUPER_ADMIN || OPERATIONS`); no new permissions were invented.

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
| Customer Portal | `/dashboard`, `/request-delivery`, `/track-delivery`, `/wallet`, `/make-payment`, `/past-deliveries`, `/invoices`, `/notifications`, `/settings`, `/help`, `/legal`, `/downloads` |
| Driver App | `/driver`, `/driver/offers`, `/driver/active-delivery` |
| Operations Centre | `/operations` |
| Admin | *(none yet — `/admin` reserved)* |

Backwards compatibility: all pre-existing customer routes are unchanged, and
`/driver/active-delivery` keeps its original path.

## Role-aware routing after sign-in

1. `Auth.tsx` honours `?returnTo=` (set by `RequireAuth`/`RoleGate`) so deep
   links survive authentication.
2. Without a `returnTo`, sign-in lands on `/post-auth`, where
   `PostAuthRedirect.tsx` resolves the user's role via the existing
   `useAuth()` hook and redirects to the area home: customer → `/dashboard`,
   driver → `/driver`, operations/fleet_manager → `/operations`,
   company_admin/super_admin → `/operations` (until admin pages exist).

## Navigation separation

Navigation configs are per-area pure data in `navigation.ts`:

- `customerNavigation` — 12 entries: Activity Center, Past Deliveries,
  Request Delivery, Track Delivery, Invoices, Wallet, Make Payment,
  Notifications, Help, Legal, Downloads, Settings
- `driverNavigation` — Delivery Offers and Active Delivery (the driver pages
  that exist; Earnings/History/Profile/Safety are future work and are NOT
  stubbed)
- `operationsNavigation` — Operations Centre
- `adminNavigation` — empty until admin pages exist

There is no global nav list, and separation is enforced by the route
architecture + area-scoped shells, not by CSS hiding.

## Preserved functionality

- Customer pages: unchanged UI/logic, only the duplicated shell markup was
  replaced by `CustomerShell`.
- Driver Active Delivery: delivery state handling, Convex mutations, tracking
  queries, continuous GPS tracking hook, POD workflow, and error handling are
  untouched — the page now renders inside `DriverShell`.
- POD remains driver-only; customers have no POD submission controls.
- Operations Centre: unchanged, now inside `OperationsShell`.
- Authentication: unchanged Convex Auth (email OTP) via `@convex-dev/auth`.
- Backend: **zero changes** to Convex domain logic, pricing, dispatch, delivery
  state transitions, POD authorization, or tracking validation.

## Tests

`src/components/shells/roleAccess.test.ts` (55 assertions) covers:

- role → area mapping for all six roles + unknown/missing fallback
- the full area-access matrix (allow + deny cases per area)
- home routes per role (including the documented admin→operations gap)
- navigation separation (driver nav has no customer entries or routes;
  customer nav has no driver/operations entries; admin nav empty)

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

## Remaining gaps (intentionally not built here)

1. **Admin pages** — no user/pricing/business admin UI exists yet. `AdminShell`
   and the `admin` RoleGate area are ready; `/admin` is not registered as a
   route until real admin pages exist.
2. **Driver App depth** — Delivery Offers and Active Delivery exist.
   Earnings/Wallet, Delivery History, Driver Profile, and Safety/SOS need both
   backend queries and pages before they get navigation entries.
3. **Operations ↔ Admin distinction** — with the current RBAC there is
   meaningful overlap (both see all deliveries; `company_admin` ⊃ operations
   permissions). The roles were kept as-is and the ambiguity is documented
   rather than inventing a new permission model.
4. **Customer POD viewing** — explicitly out of scope for the driver POD task
   and this refactor; can be added to the Customer Portal later.
