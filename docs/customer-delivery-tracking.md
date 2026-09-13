# Customer Delivery Tracking

Customer-facing live delivery tracking for the Lasha Customer Portal.

## Customer Tracking Architecture

```
Customer Portal (/deliveries/:deliveryId)
  → Convex reactive queries (useQuery)
      → deliveries.state_machine.getDelivery
      → tracking.queries.getDeliveryTracking
      → pod.service.getPODForDelivery
  → authorized delivery / tracking / POD records
```

The page consumes three **existing, server-authorized queries**. No new backend,
tables, or tracking mechanisms were introduced. Convex reactive subscriptions
are the realtime layer: the page updates automatically when delivery state
changes, driver GPS updates, tracking events are added, or the delivery
completes/fails. No polling, WebSockets, or external providers.

## Authorization

The backend is authoritative. The route param `:deliveryId` is only a locator —
ownership is never accepted from the client:

- `getDelivery` — resolves the authenticated user via `getCurrentAuthUser`
  (session). CUSTOMER role is allowed only when the delivery's order
  (`deliveries.orderId → orders.senderId`) equals the session user. Throws
  `Access denied` otherwise.
- `getDeliveryTracking` — same ownership rule via `authorizeTrackingAccess`
  (customer must be `orders.senderId`).
- `getPODForDelivery` — `canAccessPOD` resolves ownership through the order
  (customer must be `orders.senderId`; driver must be the assigned courier;
  company admin must own the order's business).

A customer manipulating the URL to another customer's delivery ID receives the
backend's thrown error for all three queries. The page renders a generic
"Delivery not found / no access" state with wording identical to the
not-found case, so unauthorized probing learns nothing.

Related hardening done in this change (minimal fixes to real gaps found while
auditing, each covered by tests):

1. **`getMyDeliveries` customer branch** previously returned *all* deliveries to
   any customer (an intermediate implementation discarded its orders lookup).
   It now resolves only deliveries reached through the customer's own orders
   (`by_sender` → `by_order` indexes).
2. **`canAccessPOD`** previously returned `true` for any CUSTOMER /
   COMPANY_ADMIN ("will be filtered by order ownership in query" — no filter
   existed). It now resolves ownership through the order and fails closed.

## Live Tracking

- **Location source:** the existing continuous GPS records on the `users`
  table (`currentLat`, `currentLng`, `lastLocationUpdate`) as surfaced by
  `getDeliveryTracking.driverLocation`. The customer's browser never provides
  location data.
- **Freshness thresholds** (mirroring `src/convex/tracking/config.ts`,
  `MAX_STALENESS_MS = 60_000`): `Live` < 10s · `Recently updated` < 60s ·
  `Stale` ≥ 60s · `Tracking unavailable` when there is no location or the
  delivery is terminal. The backend's own `isStale` flag (same 60s threshold)
  backs the stale state.
- **Stale behaviour:** the driver marker stays visible but the freshness pill
  turns red and the last-update timestamp is shown. No ETA is displayed — the
  backend has no predictive ETA, and none is invented.
- Driver location is hidden for terminal deliveries (delivered/failed/
  cancelled): there is nothing live to track.

## Customer/Driver Boundary

The customer is a consumer of delivery state, not an operator. The page
contains **no mutations at all**: no accept/reject, no delivery state
transitions, no GPS update controls, no POD submission, no dispatch,
reassignment, cancel, or fail actions. It renders only `useQuery`
subscriptions. It is distinct from `/driver/active-delivery`, which contains
the driver's operational controls, and from the Operations Centre, whose
tactical view is never exposed to customers.

## Timeline

A customer-friendly stepper maps the actual `DELIVERY_STATUS` values (no
invented states): Delivery requested → Dispatched → Driver assigned → Driver
accepted → Heading to pickup → Package picked up → On the way → At
destination → Delivered. Exception states (`failed`, `cancelled`,
`reassignment_required`) render the customer-safe status copy and a
"could not be completed / contact support" notice instead of a fabricated
milestone. A detailed timeline section lists real `tracking_events`
(non-location events, newest first) with their actual timestamps.

## POD

After a delivery reaches `delivered`, the page reads
`pod.service.getPODForDelivery` under the **existing** POD authorization
(unchanged submission path; customers can only read PODs for their own
deliveries). Shown: outcome, recipient name, delivery time, and evidence-file
count. Full evidence files and internal POD diagnostics are not rendered.
If a POD does not exist yet the page shows "Not yet available".

## Files

- `src/pages/DeliveryTracking.tsx` — the customer tracking page
- `src/main.tsx` — route registration (`/deliveries/:deliveryId`, RoleGate
  CUSTOMER area, RequireAuth preserved)
- `src/pages/Dashboard.tsx` — order cards now link to the detail page
  (minimal change; no dashboard redesign)
- `src/convex/deliveries/state_machine.ts` — `getMyDeliveries` customer
  scoping fix only
- `src/convex/pod/service.ts` — `canAccessPOD` ownership fix only
- `src/convex/deliveries/customer_tracking.test.ts` — focused tests
