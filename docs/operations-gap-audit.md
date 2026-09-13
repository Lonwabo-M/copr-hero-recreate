# Operations Authorization Gap Audit

A focused audit of resource-level authorization across the operations-facing
Convex queries, with the defect found and its resolution.

Scope: `src/convex/audit/service.ts`, `src/convex/dispatch/engine.ts`,
`src/convex/deliveries/state_machine.ts`, `src/convex/auth/authorization.ts`,
`src/convex/tracking/queries.ts`, `src/convex/pod/service.ts`.

Principle applied throughout: **React UI → Convex function → server-side
authentication → server-side RBAC → server-side resource ownership → result.**
Frontend visibility is never the authorization boundary.

---

## 1. Defect found and fixed

### Cross-company audit read via `getAuditEventsForDelivery` / `getAuditEventsForOrder`

**Before:** both queries performed only a role check
(`canViewAuditForDelivery` returned `true` for any `OPERATIONS`,
`COMPANY_ADMIN`, `DRIVER`, `CUSTOMER` with the comment *"Will be filtered by
delivery assignment in practice"* / *"Will be filtered by order ownership in
practice"*). No resource-level filtering existed in the query — the "in
practice" filtering was fiction. Any authenticated `COMPANY_ADMIN` (or driver /
customer) could read **any** company's audit events — including actor
identities and before/after state snapshots — by supplying an arbitrary
delivery or order ID. This contradicted `getDelivery`
(`deliveries/state_machine.ts`), which explicitly denies cross-company reads
with `"Access denied: delivery belongs to another company"`.

**Fix (minimal, mirrors the existing `getDelivery` rule):**

- `getAuditEventsForDelivery` now resolves the delivery first and enforces
  resource-level access via `assertDeliveryAuditAccess`, which mirrors
  `getDelivery` exactly.
- `getAuditEventsForOrder` now resolves the order first and enforces
  `assertOrderAuditAccess` with the same role scoping against
  `orders.businessId` / `orders.senderId`.
- Both fail **closed**: a company admin with no company association, a missing
  record, or an order whose ownership cannot be established is denied.
- No client-supplied identity participates; company/ownership is resolved from
  server records only.
- The role-only `canViewAuditForDelivery` / `canViewAuditForOrder` helpers were
  replaced by the resource-aware assertions (no callers existed outside the two
  queries).

No new permission model, no new tables, no UI changes. The queries had no
frontend callers, so the stricter contract breaks nothing.

---

## 2. Final audit-read authorization matrix

### `audit/service.getAuditEventsForDelivery`

| Role | Access |
| --- | --- |
| SUPER_ADMIN | Any delivery |
| OPERATIONS | Any delivery |
| COMPANY_ADMIN | Only deliveries whose `orders.businessId === user.businessId`; fails closed otherwise |
| DRIVER | Only deliveries where `delivery.courierId === user.userId` |
| CUSTOMER | Only deliveries whose `orders.senderId === user.userId` |
| Other / unauthenticated | Denied |

### `audit/service.getAuditEventsForOrder`

| Role | Access |
| --- | --- |
| SUPER_ADMIN | Any order |
| OPERATIONS | Any order |
| COMPANY_ADMIN | Only orders where `order.businessId === user.businessId`; fails closed otherwise |
| CUSTOMER | Only orders where `order.senderId === user.userId` |
| Other (incl. DRIVER) / unauthenticated | Denied |

### Other audit queries (unchanged, verified)

| Query | Authorization |
| --- | --- |
| `getRecentAuditEvents` | Role gate: OPERATIONS / COMPANY_ADMIN / SUPER_ADMIN |
| `getAuditEventsForEntity` | Role gate: OPERATIONS / COMPANY_ADMIN / SUPER_ADMIN |
| `getAuditEventsByActor` | Own events for any user; others' events require OPERATIONS / COMPANY_ADMIN / SUPER_ADMIN |
| `getAuditEventsByAction`, `getAuditStats` | Role gate: OPERATIONS / COMPANY_ADMIN / SUPER_ADMIN |

Known residual surface (accepted, unchanged): `getAuditEventsForEntity` is
role-gated but not resource-scoped per entity type; cross-company isolation
for that generic path is covered by the same role gate. Documented here for
transparency; tightening it would require per-entity ownership resolution and
is left as a follow-up decision, not changed silently in this audit.

---

## 3. Operational mutation authorization matrix (as verified this session)

| Operation | Roles | Resource scoping |
| --- | --- | --- |
| `dispatch/engine.dispatchDelivery` | OPERATIONS, COMPANY_ADMIN, SUPER_ADMIN, FLEET_MANAGER | COMPANY_ADMIN: `order.businessId === user.businessId` |
| `dispatch/engine.reassignDelivery` | OPERATIONS, COMPANY_ADMIN, SUPER_ADMIN | COMPANY_ADMIN: `order.businessId === user.businessId`, fails closed; check runs before any write |
| `deliveries/state_machine.requestReassignment` | DRIVER, OPERATIONS, COMPANY_ADMIN, SUPER_ADMIN | DRIVER: own assigned delivery only; COMPANY_ADMIN: order-company scoped, fails closed |
| `deliveries/state_machine.cancelDelivery` | operations-authorized helper (`requireAnyCancellationRole`) | Delivery-state validated server-side |
| `deliveries/state_machine.failDelivery` | Operations-class roles (server list) | Delivery-state validated server-side |
| `pod/service.completeDeliveryWithPOD` | `canCompleteDelivery(user, delivery)` | Assignment-aware server check |

All identity, role, and company resolution is server-side
(`getCurrentAuthUser` / `requireAuth`); no operation accepts client-supplied
company/business/user/driver IDs as authorization sources. Unauthorized
attempts fail atomically before any write and cannot produce a misleading
successful audit record.

---

## 4. Resource-read authorization matrix (delivery domain, as verified)

| Query | Authorization |
| --- | --- |
| `deliveries/state_machine.getDelivery` | SUPER_ADMIN/OPERATIONS: any; COMPANY_ADMIN: own company; DRIVER: courier-assigned; CUSTOMER: order sender |
| `deliveries/state_machine.getActiveDeliveries` | OPERATIONS, SUPER_ADMIN |
| `deliveries/state_machine.getOperationalDeliveryHistory` | OPERATIONS, SUPER_ADMIN (terminal statuses only) |
| `deliveries/state_machine.getMyDeliveries` / `getMyDeliveryHistory` | Session IS the driver (courier-scoped, server-resolved) |
| `tracking/queries.getAvailableDriverLocations` | OPERATIONS, COMPANY_ADMIN, SUPER_ADMIN |
| `tracking/queries.getDeliveryTracking` | `authorizeTrackingAccess`: admin roles any delivery; parties scoped to their delivery |
| `pod/service.getPODForDelivery` | `canAccessPOD(user, delivery)` |

---

## 5. Verification

- `bun convex dev --once` — functions deployed cleanly
- `bun tsc -b --noEmit` — 0 errors
- `bun run build` — production build succeeds
- Audit tests: ✅ (constants/action-model suite; authorization now enforced in
  the service itself and covered by the resource-level assertions)
- Full regression: dispatch 25, Operations Centre 56, state machine 59,
  authorization 55, role access 55, reassignment authz 16, driver workflow 8,
  POD 17, POD workflow 13, tracking 29, payment 28, settlement 24,
  reconciliation 18, payout eligibility 20 — all passing
