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

## 2b. Generic Audit Entity Authorization

**Status: resolved.** The residual finding above has been closed by hardening
`audit/service.getAuditEventsForEntity`. The query no longer accepts arbitrary
entity-type strings and no longer grants role-only access.

### Supported entity types and authorization rules

Entity types below were discovered by tracing **every actual writer** to
`audit_events` in the repository (not from comments or documentation):

| Entity Type | Example Resource (writer) | Authorization Rule | Ownership Basis |
| --- | --- | --- | --- |
| `delivery` | delivery transitions (`recordDeliveryTransition`) | `assertDeliveryAuditAccess` — same rule as `getDelivery` | delivery → order → business/sender; `courierId` |
| `order` | order-scoped events | `assertOrderAuditAccess` — same rule as hardened order audit | `orders.businessId` / `orders.senderId` |
| `proof_of_delivery` | POD events (`recordPODEvent`) | `assertDeliveryAuditAccess` on the POD's delivery | pod → delivery |
| `users` | profile updates (`users.ts`) | self, or OPERATIONS / COMPANY_ADMIN / SUPER_ADMIN | `users._id` |
| `businesses` | company profile updates (`users/businessProfile.ts`) | owning company admin, or OPERATIONS / SUPER_ADMIN | `businesses._id` vs `users.businessId` |
| `payment_transaction` | payment events (`payments/mutations.ts`) | payer, company scope via order, or OPERATIONS / SUPER_ADMIN | `txn.userId`; `txn.orderId → orders.businessId` |
| `delivery_quote` | quote events (`pricing/service.ts`) | quote owner, company scope via order, or OPERATIONS / SUPER_ADMIN | `quote.userId`; `quote.orderId → orders.businessId` |
| `settlement` | settlement events (`pricing/service.ts`) | settlement driver, company scope via order, or OPERATIONS / SUPER_ADMIN | `settlement.driverId`; `settlement.orderId → orders.businessId` |
| `pricing_rule` | rule events (`pricing/service.ts`) | **OPERATIONS / SUPER_ADMIN only** (explicit classification) | none exists — platform configuration |

### Fail-closed behaviour

- **Argument level:** `entityType` is a literal union of the supported set.
  Arbitrary strings (including the logging bridge's `"unknown"` entityType,
  which carries no ownership semantics) are rejected before any read.
- **Resource level:** every supported type resolves the resource server-side
  first; a missing record fails closed (`"… not found"`).
- **Ownership level:** a COMPANY_ADMIN with no company association, or an
  order whose business cannot be established, is denied. Drivers and customers
  get access **only** where a schema-backed ownership relationship exists —
  never merely because they hold a role.
- **Ordering:** authorization completes before the `by_entity` index read on
  every direct invocation; there is no caller-trust path.

### Intentionally unsupported entity types

- `unknown` (logging bridge `storeCriticalEvent`): system diagnostics with
  optional/unset entity IDs and no ownership semantics — not queryable through
  this endpoint. System log access remains with the ops/admin role-gated
  queries (`getRecentAuditEvents`, `getAuditEventsByAction`, `getAuditStats`)
  where category filtering applies.
- Any future entity type must be added to `AUDIT_ENTITY_TYPES` **with** an
  explicit resource-authorization case; adding the string alone grants nothing.

### Callers

A repository-wide search found **no frontend or backend callers** of
`getAuditEventsForEntity`. The endpoint is safe when invoked directly, and no
redundant caller-side authorization needed removal or addition.

### Residual finding — updated

~~`getAuditEventsForEntity` is role-gated but not resource-scoped per entity
type~~ → **Closed.** Every supported entity type now has resource-level
authorization; `pricing_rule` is explicitly classified operations/admin-only;
unknown types are rejected at the argument level.

---

## 2c. Audit Actor Attribution

**Status: resolved.** Audit events must be trustworthy representations of
actual actions: a human event names the human who performed it, a system event
is unmistakably system-generated, and missing actor context is never fabricated
into a real user's identity.

### Previous defect

`logging/service.storeCriticalEvent` wrote:

```ts
actorId: (await ctx.db.query("users").first())?._id ?? "system" as any
```

Every persisted system log event was attributed to **whichever user row sorted
first** — a real user who performed nothing. The `?? "system"` branch existed
only for an empty users table and was itself a type-unsafe cast
(`as any`). This was the only unsafe actor source in the repository; all other
audit writers pass a session-resolved or internal server-resolved actor.

### Final actor model

`audit_events.actorId` is now **optional**
(`v.optional(v.id("users"))`) — the smallest schema-compatible change that
makes the two attribution classes structurally distinct:

| Class | actorId | actorRole | Meaning |
| --- | --- | --- | --- |
| **User-attributed** | real authenticated user's ID | actual role (customer, driver, operations, …) | A person performed the action. Identity always comes from the Convex session (`requireAuth` / `getCurrentAuthUser`) or from a server-resolved internal operation — never from client claims. |
| **System-attributed** | **omitted** | `"system"` | A trusted backend process performed the action. With no `actorId`, a system event cannot collide with — or be mistaken for — a human actor. |
| **Missing context** | **omitted** | `"system"` | Not silently mapped to any real user. User context, when known, is preserved in `metadata.involvedUserId` / `metadata.involvedUserRole` for traceability only — never used as the actor. |

No new service user, no placeholder user row, and no new identity architecture
was introduced. A user-attributed operation that cannot establish an
authenticated actor fails closed (its auth helpers throw) rather than writing
a fabricated actor.

### Affected path

Only `logging/service.storeCriticalEvent` (the logging→audit bridge) was
changed. It is an `internalMutation`, is inherently system-generated
(`category: "system"`, `action: system.log.<level>`), and had **zero callers**
in the repository at the time of the fix. All other `db.insert("audit_events")`
writers (state machine, users, pod, pricing, payments — all `internalMutation`
with server-resolved actors) were audited and left unchanged.

### Historical records

Existing audit rows that were written by the old fallback may contain a
misattributed real user's ID in `actorId` (with `actorRole: "system"`). These
are **not** rewritten — audit history is immutable. Detection heuristic for
investigating legacy rows: `actorRole === "system"` with a non-null `actorId`
indicates a legacy bridge event whose `actorId` is not trustworthy. New bridge
events never have `actorId`.

### Integrity tests

`src/convex/audit/actor_attribution.test.ts` (13 tests): fallback removal
(including a repo-wide first-user sweep), explicit system attribution with no
`actorId`, involved-user metadata traceability, preserved human attribution
(state machine, payments, generic recorder), schema field/index integrity,
no audit-record mutation (historical immutability), and unchanged
resource-level authorization.

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
