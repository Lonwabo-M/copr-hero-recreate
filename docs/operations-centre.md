# Lasha Operations Centre

This document describes the **live operations workflow** of the Lasha Operations
Centre: how it consumes Convex realtime data, which backend domain operations it
exposes, and the boundaries it deliberately does not cross.

---

## 1. Operations Architecture

```
Operations Centre (src/pages/OperationsCentre.tsx)
        │  useQuery / useMutation (reactive subscriptions)
        ▼
Convex backend (authoritative)
        ├── deliveries/state_machine.ts   → active deliveries, history, state actions
        ├── dispatch/engine.ts            → dispatch, offers, reassignment
        ├── tracking/queries.ts           → live driver locations, per-delivery tracking
        ├── pod/service.ts                → proof-of-delivery records, POD completion
        └── auth / RBAC helpers           → server-side authorization on every call
```

- The frontend holds **no copies** of financial, delivery, or tracking state.
  Every panel is a direct `useQuery` subscription; Convex pushes updates when
  drivers accept offers, change state, move, or submit POD.
- No polling loops, WebSockets, Redis, or a second realtime provider are used.
  Convex reactivity is the only realtime mechanism.
- The page is wrapped in `RoleGate area={APP_AREAS.OPERATIONS}` so the route is
  protected in addition to every backend mutation/query re-checking RBAC.

### Tabs

| Tab | Purpose | Primary queries |
| --- | --- | --- |
| Overview | High-level counts and activity | `getActiveDeliveries`, `getAvailableDriverLocations` |
| Dispatch | Pending-dispatch + reassignment queue, offers | `getActiveDeliveries`, `getDispatchOffers`, `dispatchDelivery`, `reassignDelivery` |
| Live | Tactical map + live delivery list + detail panel | `getActiveDeliveries`, `getAvailableDriverLocations`, `getDeliveryTracking`, `getPODForDelivery` |
| Drivers | Active driver inspection | `getAvailableDriverLocations` |
| Exceptions | Attention items derived from real data | derived from the live queries |
| History | Terminal-status delivery history (ops-scoped) | `getOperationalDeliveryHistory` |

---

## 2. Live Tracking

### Location source

Driver positions come **only** from the existing continuous GPS tracking
backend:

- `api.tracking.queries.getAvailableDriverLocations` — latest known position for
  available/active drivers (server-authorized: operations, company admin,
  super admin).
- `api.tracking.queries.getDeliveryTracking` — per-delivery driver location plus
  route history (`routeHistory`) used for the operational timeline.

The operations browser **never** generates GPS data; it only renders stored
records. There is no second location table and no new tracking backend.

### Tracking freshness

The frontend derives freshness from stored `lastLocationUpdate` timestamps using
the backend's own configured thresholds (`src/convex/tracking/config.ts`):

| State | Condition | Meaning |
| --- | --- | --- |
| **Live** | updated < 10 s (`MIN_UPDATE_INTERVAL_MS` cadence) | Position is current |
| **Recently updated** | updated < 60 s | Acceptable; slight lag |
| **Stale** | ≥ 60 s (`MAX_STALENESS_MS`) | GPS may be off / driver idle |
| **No recent location** | no timestamp at all | Tracking unavailable |

The 60 s staleness boundary is **reused from the backend**
(`MAX_STALENESS_MS`), not invented by the UI. Backend tracking validation was
not changed to support the Operations Centre.

Stale/offline drivers are rendered with a distinct color/dot on the map and in
the driver list, and surface in the Exceptions tab (`stale_gps`).

---

## 3. Operational Actions

Only actions with **existing authorized backend mutations** are exposed. The UI
never invents state transitions and there is no generic
`updateDeliveryStatus` mutation.

| UI action | Backend operation | Where exposed |
| --- | --- | --- |
| Dispatch pending delivery | `deliveries/state_machine.dispatchDelivery` | Dispatch tab (status `PENDING_DISPATCH`) |
| Reassign delivery (re-dispatch) | `dispatch/engine.reassignDelivery` | Dispatch tab (status `REASSIGNMENT_REQUIRED`) and Exceptions tab (`reassignment_required`) |
| Fail delivery | `deliveries/state_machine.failDelivery` | Exceptions tab (mid-flight statuses only) |
| Cancel delivery | `deliveries/state_machine.cancelDelivery` | Exceptions tab (`ASSIGNED`) |
| Complete delivery via POD | `pod/service.completeDeliveryWithPOD` | Exceptions tab (`AT_DROPOFF`) |

Notes:

- Reassign moves a stuck/exception delivery back through dispatch (clears the
  assignment, sets `REASSIGNMENT_REQUIRED` → re-offers). Dispatch sends
  `PENDING_DISPATCH` deliveries to the offer engine. They are distinct flows
  with distinct state gates.
- All mutations enforce their own RBAC **on the server**. A UI rejection is
  logged to the console; the backend remains the single source of truth.
- Every mutation that changes delivery/assignment state continues to write the
  existing **audit events** through the backend domain operations. No parallel,
  frontend-only audit record is created, and operations users cannot modify
  audit history.

---

## 4. Authorization

**Reassignment authorization (hardened):**

`dispatch/engine.reassignDelivery` and `deliveries/state_machine.requestReassignment`
are company-ownership scoped for `COMPANY_ADMIN`, using the **same authoritative
rule as `dispatchDelivery`**:

- The actor's identity, role, and company come **only** from the Convex session
  (`getCurrentAuthUser` → users table `businessId`). No client-supplied
  company/business/user/driver ID is ever accepted as an authorization source.
- The delivery's company is resolved from the authoritative record chain
  `deliveries.orderId → orders.businessId`. Ownership is never inferred from
  drivers, couriers, locations, or customer names.
- **`SUPER_ADMIN`** — may reassign any delivery (existing super-admin authority).
- **`OPERATIONS`** — may reassign any delivery (existing operations authority).
- **`COMPANY_ADMIN`** — may reassign only deliveries whose order belongs to
  their own company (`order.businessId === user.businessId`). A company admin
  with no company association, or a delivery whose company ownership cannot be
  established, is denied — the check **fails closed**.
- **Other roles** (drivers, customers, fleet manager, …) — denied; drivers
  remain limited to requesting reassignment of their own assigned delivery via
  the state machine (`requestReassignment`, courier-scoped).
- The ownership check runs **before any write** (offer cancellation, delivery
  patch, offer creation), so an unauthorized attempt fails atomically: no
  partial assignment change, no state change, and no misleading successful
  audit record. Existing audit behaviour is preserved for successful
  reassignments.

**Frontend visibility is not the authorization boundary.** The React UI only
hides actions the current role cannot perform; the Convex mutation re-checks
authentication, role, and company ownership server-side on every call.

Frontend and backend layers:

1. **Route**: `RoleGate area={APP_AREAS.OPERATIONS}` blocks unauthorized roles
   from rendering the Operations Centre.
2. **Queries**: each query re-checks role server-side
   (e.g. `getActiveDeliveries` → `OPERATIONS`, `SUPER_ADMIN` only;
   `getAvailableDriverLocations` → also `COMPANY_ADMIN`;
   `getOperationalDeliveryHistory` → operations only).
3. **Mutations**: `dispatchDelivery`, `reassignDelivery`, `failDelivery`,
   `cancelDelivery`, `completeDeliveryWithPOD` each validate role + delivery
   state server-side and remain authoritative. `COMPANY_ADMIN` scoping is
   enforced inside `dispatchDelivery` for company-owned deliveries.

The frontend does not bypass, mask, or duplicate any of these checks; it only
hides actions the current role cannot perform and logs server rejections.

---

## 5. Exceptions

The Exceptions tab derives attention items **only from real records** (no
mock data, no invented predictive ETA):

| Exception | Derived from |
| --- | --- |
| No assigned driver (unassignable) | delivery status + `courierId === undefined` |
| Reassignment required | delivery status `REASSIGNMENT_REQUIRED` |
| Stale GPS | driver `lastLocationUpdate` older than `MAX_STALENESS_MS` (60 s) |
| Tracking unavailable | no location record for an assigned driver |
| Delivery failed | delivery status `FAILED` while still unresolved operationally |

Documented thresholds: the only time-based threshold is the backend's
`MAX_STALENESS_MS` (60 s). No arbitrary delay thresholds are used anywhere.

---

## 6. Financial Boundary

**Financial settlement/payment systems are deliberately separate from
operational monitoring.**

The Operations Centre does **not** include:

- driver earnings dashboards
- driver payouts or bank transfers
- customer payment dashboards
- payout eligibility or settlement processing
- reconciliation views

The detail panel shows POD state (outcome, recipient, failure reason, evidence
file count, signature presence) for operational verification only — it never
exposes settlement internals, payment credentials, or provider secrets.
Customer personal information is limited to what logistics operations require
(e.g. recipient name on a POD record).

---

## Remaining operational limitations

- No predictive ETA exists in the backend, so none is displayed.
- History is bounded (`limit`, default 50, max 200) rather than paginated
  infinitely.
