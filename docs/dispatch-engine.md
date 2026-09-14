# Lasha Dispatch Engine

## Overview

The Lasha Dispatch Engine is a configurable system for matching delivery requests with available drivers and vehicles. It uses a deterministic scoring algorithm to rank candidates and supports atomic assignment offers to prevent race conditions.

### Design Principles

1. **Separation of Concerns**: Scoring logic is decoupled from dispatch operations
2. **Configurability**: All weights and thresholds are configurable
3. **Atomicity**: Assignment offers are processed atomically to prevent concurrent acceptance
4. **Testability**: Scoring is pure and stateless
5. **Extensibility**: Can be replaced with ML optimization without changing the delivery domain

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Dispatch Engine                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │ Candidate        │    │ Scoring         │                │
│  │ Discovery        │───▶│ Service         │                │
│  │                  │    │                 │                │
│  │ • Driver lookup  │    │ • Proximity     │                │
│  │ • Vehicle match  │    │ • Availability  │                │
│  │ • Proximity      │    │ • Capacity      │                │
│  │   filter         │    │ • Rating        │                │
│  │ • Workload check │    │ • Workload      │                │
│  └─────────────────┘    │ • Route compat  │                │
│                          └────────┬────────┘                │
│                                   │                         │
│                                   ▼                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  Assignment Flow                     │   │
│  │                                                      │   │
│  │  1. Create offer (atomic)                           │   │
│  │  2. Send to driver                                  │   │
│  │  3. Driver accepts/rejects                          │   │
│  │  4. Accept: atomic claim (prevent race condition)   │   │
│  │  5. Cancel other offers                             │   │
│  │  6. Update delivery status                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Scoring Algorithm

### Overview

Each candidate driver is evaluated against six scoring dimensions:

| Dimension | Weight | Description |
|-----------|--------|-------------|
| **Proximity** | 35% | Distance from driver to pickup location |
| **Availability** | 15% | Driver availability and pending offers |
| **Capacity** | 20% | Vehicle capacity vs package requirements |
| **Rating** | 15% | Driver's historical performance rating |
| **Workload** | 10% | Current number of active assignments |
| **Route Compatibility** | 5% | How well the driver's route aligns with delivery |

### Scoring Formula

```
Total Score = Σ (component_score × weight) / Σ weights
```

Each component score is normalized to 0-100.

### Component Details

#### 1. Proximity Score (35%)

**Purpose**: Prefer drivers closer to the pickup location.

**Algorithm**:
```
distance = haversineDistance(driver.location, delivery.pickup)
score = linearScore(distance, 0, maxProximityDistance)
```

**Adjustments**:
- Stale location data (>15 minutes): Score × 0.5
- No location data: Neutral score (50)

**Configuration**:
- `maxProximityDistance`: 50 km (drivers beyond this get 0 score)
- `locationStalenessThresholdMs`: 15 minutes

#### 2. Availability Score (15%)

**Purpose**: Prefer available drivers with capacity for new assignments.

**Algorithm**:
```
baseScore = 60 (if available)
workloadScore = linearScore(activeCount / maxAssignments, 0, 1)
totalScore = baseScore × 0.5 + workloadScore × 50
penalty = 1 - pendingOffers × 0.15
```

**Hard Requirements**:
- Driver must be available
- Vehicle must be active

#### 3. Capacity Score (20%)

**Purpose**: Ensure vehicle can handle the package.

**Algorithm**:
```
if vehicleCapacity < packageWeight: return 0
capabilityScore = 100 - penalties for missing capabilities
headroomScore = linearScore(weight / capacity, 0, 1)
score = capabilityScore × 0.6 + headroomScore × 40
```

**Capability Checks**:
- Breaking capability (if required)
- Flammable handling (if required)
- Trailer (if required)

#### 4. Rating Score (15%)

**Purpose**: Prefer historically reliable drivers.

**Algorithm**:
```
score = (rating / 5) × 100
```

**Bonus**: Experience noted in reason string.

#### 5. Workload Score (10%)

**Purpose**: Prefer drivers with lighter workloads.

**Algorithm**:
```
score = linearScore(activeCount / maxAssignments, 0, 1)
```

#### 6. Route Compatibility Score (5%)

**Purpose**: Prefer drivers whose route aligns with the delivery.

**Algorithm**:
```
detour = (distToPickup + directDistance) - distToDropoff
score = linearScore(max(0, detour), 0, maxProximityDistance)
```

---

## Eligibility Requirements

Before scoring, candidates must meet these hard requirements:

| Requirement | Threshold |
|-------------|-----------|
| Driver available | `isAvailable = true` |
| Vehicle active | `isActive = true` |
| Minimum rating | 3.0 |
| Minimum trips | 5 |
| Max active assignments | 3 |
| Max pending offers | 2 |
| Vehicle capacity | ≥ package weight |

---

## Assignment Flow

### 1. Dispatch Request

```
Operations/Admin triggers dispatch for a delivery
    ↓
Validate delivery is in PENDING_DISPATCH state
    ↓
Create DeliveryContext with order data
    ↓
Discover eligible candidates
    ↓
Score and rank candidates
    ↓
Select top N candidates (default: 3)
```

### 2. Offer Creation

For each top candidate:
```
Create DispatchOffer record (status: "pending")
    ↓
Set expiration time (default: 2 minutes)
    ↓
Driver receives notification
```

### 3. Driver Response

#### Acceptance (Atomic)

```
Driver taps "Accept" on offer
    ↓
Verify offer is still "pending"
    ↓
Verify offer hasn't expired
    ↓
Verify delivery is still "assigned"
    ↓
Atomic check: delivery.courierId === driverId OR null
    ↓
Update offer status to "accepted"
    ↓
Update delivery:
  - status → DRIVER_ACCEPTED
  - courierId → driverId
  - vehicleId → offer.vehicleId
  - acceptedAt → now
    ↓
Cancel all other pending offers for this delivery
    ↓
Create tracking event
```

#### Rejection

```
Driver taps "Reject" on offer
    ↓
Verify offer is still "pending"
    ↓
Update offer status to "rejected"
    ↓
Record rejection reason
```

### 4. Expiration

```
Scheduled pass (every minute, see "Automated Offer Expiry" below)
    ↓
Find all offers where expiresAt < now AND status = "pending"
    ↓
Update status to "expired"
    ↓
Delivery becomes eligible for reassignment via the existing reassignment
flows (manual Operations re-dispatch or `requestReassignment`); the
Operations Centre surfaces `offer_expired` as an attention item.
```

---

## Assignment Authorization

All operations that assign or re-dispatch a driver to a delivery enforce a
consistent authorization model. The backend is authoritative — React UI
visibility is never the authorization boundary:

```
React → Convex mutation → session authentication → RBAC permission →
COMPANY_ADMIN company ownership (session-derived) → assignment
```

### Role Matrix

| Operation | SUPER_ADMIN | OPERATIONS | COMPANY_ADMIN | FLEET_MANAGER | DRIVER | CUSTOMER |
|---|---|---|---|---|---|---|
| `dispatchDelivery` (engine) | ✅ | ✅ | ✅ own company only | ✅ | ❌ | ❌ |
| `assignDriver` (state machine) | ✅ | ✅ | ✅ own company only | ❌ | ❌ | ❌ |
| `reassignDelivery` (engine) | ✅ | ✅ | ✅ own company only | ❌ | ❌ | ❌ |
| `requestReassignment` (state machine) | ✅ | ✅ | ✅ own company only | ❌ | ✅ own assignment only | ❌ |
| `acceptAssignment` / `rejectAssignment` | — | ❌ | ❌ | ❌ | ✅ session driver only | ❌ |

`FLEET_MANAGER` holds fleet/driver-management permissions but not
`delivery:assign`; it is unchanged by the authorization hardening.

### COMPANY_ADMIN Ownership Rule

The authoritative ownership chain is `delivery.orderId → orders.businessId`,
compared against `users.businessId` of the **session** user:

- The actor's company is resolved server-side from the authenticated session
  — never from client-supplied company/business/user/driver IDs.
- The delivery's company is resolved from its order record — never inferred
  from the assigned courier, pickup/drop-off location, or driver metadata.
- **Fail closed:** a COMPANY_ADMIN with no company association, a missing
  order, or an order whose business cannot be established is denied. Both
  sides of the comparison must exist; an `undefined !== undefined` comparison
  alone would fail open and is explicitly guarded against in every check.

### Authorization Ordering

The ownership check executes **before any write** — before assignment
patches, offer cancellation/creation, tracking events, success audit events,
or notifications. An unauthorized COMPANY_ADMIN request therefore produces
no assignment change, no state change, no offer change, and no successful
audit event, and the mutation remains atomic (authorization failures throw
before the first `db.patch`).

### Assignment Target Validation

The target driver is normal business input, not proof of authority. Existing
target validation is preserved: the driver must exist, have an available
driver profile, and the vehicle must belong to that driver. Note that the
dispatch model treats drivers as a **platform-wide courier pool**
(`driver_profiles` has no company relationship, and `dispatchDelivery` offers
any available driver to any company's delivery); a company-scoped driver
restriction would contradict the dispatch engine and invent a new fleet
model, so it is intentionally not enforced.

---

## Concurrency Protection

### Race Condition Prevention

The critical race condition is: **Two drivers accepting the same delivery simultaneously.**

**Solution**: Atomic document operations in Convex.

```typescript
// 1. Read delivery (atomic in Convex)
const delivery = await ctx.db.get(deliveryId);

// 2. Validate state (still assigned?)
if (delivery.status !== "assigned") {
  throw new Error("Delivery already claimed");
}

// 3. Validate driver (still this driver?)
if (delivery.courierId && delivery.courierId !== driverId) {
  throw new Error("Already assigned to another driver");
}

// 4. Update delivery (atomic in Convex)
await ctx.db.patch(deliveryId, {
  status: "driver_accepted",
  courierId: driverId,
});
```

**Why this works**:
- Convex mutations are serialized per document
- Two concurrent accept attempts will be processed sequentially
- The second attempt will see the updated status and fail

### Offer Exclusivity

Only one active offer per delivery at a time:

```typescript
const existingOffer = await ctx.db
  .query("dispatch_offers")
  .withIndex("by_delivery_status", (q) =>
    q.eq("deliveryId", deliveryId).eq("status", "pending")
  )
  .unique();

if (existingOffer) {
  throw new Error("Delivery already has an active offer");
}
```

---

## Reassignment Flow

When a driver rejects or an offer expires:

```
1. Cancel all pending offers for the delivery
2. Reset delivery to PENDING_DISPATCH
3. Clear courierId and vehicleId
4. Re-run dispatch process
5. Send new offers to next batch of candidates
```

### Reassignment Authorization

`reassignDelivery` (and the state-machine `requestReassignment`) enforce the
same company-ownership rule as `dispatchDelivery`:

| Role | Authority |
| --- | --- |
| `SUPER_ADMIN` | May reassign any delivery. |
| `OPERATIONS` | May reassign any delivery. |
| `COMPANY_ADMIN` | May reassign only deliveries whose order belongs to their own company (`orders.businessId === users.businessId`). |
| Other roles | Denied (drivers may request reassignment of their **own** assigned delivery via the state machine, courier-scoped). |

Enforcement details:

- Identity, role, and company are resolved **server-side** from the Convex
  session (`getCurrentAuthUser`). No client-supplied company/business/user/driver
  ID is accepted as an authorization source.
- The delivery's company is resolved from `deliveries.orderId → orders.businessId`.
- The check **fails closed**: a company admin with no company association, or a
  delivery whose company ownership cannot be established, is denied.
- The ownership check runs **before any write** (offer cancellation, delivery
  patch, offer creation), so an unauthorized attempt fails atomically — no
  state change and no misleading successful audit record.

**Frontend visibility is not the authorization boundary**: React → Convex
mutation → server-side authentication → RBAC → company ownership → reassignment.

---

## Automated Offer Expiry

The production-readiness audit (B1) identified that `processExpiredOffers`
had no automatic invocation — expired offers left deliveries stuck in
`assigned` until Operations manually re-dispatched. A Convex cron now runs
the existing expiry logic on a fixed schedule.

### Schedule & Invocation Path

| | |
|---|---|
| Cron definition | `src/convex/crons.ts` (Convex-native `cronJobs` — no external scheduler) |
| Schedule | Every 1 minute (`crons.interval("expire dispatch offers", { minutes: 1 }, ...)`) |
| Target | `internal.dispatch.engine.processExpiredOffersCron` (internal mutation — not reachable from clients) |
| Shared core | `processExpiredOffersInternal` in `dispatch/engine.ts` — the *same* function the manual operations mutation invokes. There is one expiry implementation, not two. |

**Why 1 minute:** the dispatch configuration expires offers after 2 minutes
(`offerExpiryMs` in `scoring_service.ts`). A 1-minute interval processes an
abandoned offer within ~1 minute of expiry, so a delivery is stuck in
`assigned` for at most ~3 minutes end-to-end. The job performs one bounded
indexed lookup per run (typically zero rows), so the frequency carries no
meaningful load. This is scheduled cleanup, **not** exact real-time expiry.

### What the Expiry Pass Does

1. Range-scans `dispatch_offers` by the `by_expires` index for offers past
   their `expiresAt`, filtering to `status === "pending"` in memory (Convex
   index ranges require equality fields as the index prefix, so `status`
   cannot be equality-filtered inside a range on `expiresAt`).
2. Re-checks each offer inside the write loop: only offers still `pending`
   and past expiry are closed (`status: "expired"`, `respondedAt` stamped).
3. **Delivery state is never modified by the expiry pass.** Closing the last
   pending offer makes the delivery eligible for reassignment through the
   existing flows: manual Operations re-dispatch (`dispatchDelivery` /
   `reassignDelivery`) or `requestReassignment`. The Operations Centre
   surfaces these as `offer_expired` attention items.

### Concurrency & Idempotency

- The predicate `status === "pending" && expiresAt < now` can never match an
  accepted, rejected, cancelled, or already-expired offer, so the cron cannot
  interfere with a driver who accepted or invalidate a deliberate response.
- The per-item re-check inside the write loop closes the race between the
  index scan and the write: an acceptance/rejection/cancellation that lands
  mid-pass is respected on the next read.
- Already-expired offers no longer match, so repeated or overlapping runs
  (cron, manual trigger, or both) are idempotent — no double-processing.
- Repeated passes cannot regress terminal deliveries: the pass does not touch
  `deliveries` at all, and `delivered`/`failed`/`cancelled` remain terminal in
  the state machine.

### Manual Operational Recovery

The cron is automation, not a replacement for operator intervention. The
manual, operations-authorized `processExpiredOffers` mutation keeps its exact
existing boundary (authentication + OPERATIONS/COMPANY_ADMIN/SUPER_ADMIN
roles) and remains available for immediate on-demand sweeps. It is safe to
run immediately before or after a scheduled pass (idempotent core).

### Observability & Failure Handling

- Uses the existing structured logging service (`LOG_CATEGORIES.DISPATCH`).
- A per-offer summary is logged when work occurred: counts of expired offers
  and per-item failures. No offer/delivery/driver identifiers or sensitive
  values are logged in the summary; per-item error logs include offer,
  delivery, and driver IDs strictly for diagnosis.
- Per-item error isolation: a single problematic offer is logged and skipped
  (staying `pending` for the next pass) instead of terminating the run.
  Failures are never silently swallowed.

### Notifications & Audit

No new notification or audit behaviour was introduced for expiry. Offer
creation notifications (`delivery_offer`) fire at dispatch time, not expiry;
the expiry pass only closes offers. Existing dispatch/reassignment audit
behaviour is unchanged.

### Tests

`src/convex/dispatch/expiry_cron.test.ts` covers: cron wiring and interval,
internal-only invocation, shared-core delegation (no second implementation),
predicate safety for accepted/rejected/cancelled/expired offers, the
concurrency re-check, per-item error isolation, observability, terminal-state
integrity, and manual-recovery availability.

---

## Configuration

### Scoring Config

```typescript
const config = {
  weights: {
    proximity: 0.35,
    availability: 0.15,
    capacity: 0.20,
    rating: 0.15,
    workload: 0.10,
    routeCompatibility: 0.05,
  },
  maxProximityDistance: 50,        // km
  maxActiveAssignments: 3,
  maxPendingOffers: 2,
  offerExpiryMs: 120000,          // 2 minutes
  minDriverRating: 3.0,
  minDriverTrips: 5,
  locationStalenessThresholdMs: 900000, // 15 minutes
};
```

### Custom Configuration

```typescript
const customService = createScoringService({
  weights: {
    proximity: 0.5,    // Increase proximity importance
    availability: 0.1,
    capacity: 0.2,
    rating: 0.1,
    workload: 0.05,
    routeCompatibility: 0.05,
  },
  maxProximityDistance: 30,  // Reduce search radius
});
```

---

## Future Enhancements

### 1. Machine Learning Optimization

Replace the scoring service with an ML model:

```typescript
class MLScoringService implements ScoringService {
  async rankCandidates(candidates, delivery) {
    // Call ML model API
    const predictions = await this.model.predict(candidates, delivery);
    return predictions;
  }
}
```

### 2. Real-Time Route Data

Integrate with mapping services for actual route compatibility:

```typescript
function scoreRouteCompatibility(candidate, delivery, routeData) {
  // Use actual route data from Google Maps / Mapbox
  const detour = routeData.getDetourDistance(candidate.location, delivery);
  return linearScore(detour, 0, maxDetour);
}
```

### 3. Batch Dispatch Optimization

For high-volume scenarios, optimize batch assignments:

```typescript
function optimizeBatchAssignments(deliveries, candidates) {
  // Use OR-Tools or similar for optimal assignment
  // Maximizes total satisfaction across all deliveries
}
```

### 4. Dynamic Pricing Integration

Factor in pricing incentives for driver selection:

```typescript
function scoreWithPricing(candidate, delivery, pricingEngine) {
  const baseScore = scoreCandidate(candidate, delivery);
  const priceMultiplier = pricingEngine.getDriverIncentive(candidate);
  return baseScore * priceMultiplier;
}
```

---

## Data Model

### Dispatch Offers

```typescript
dispatch_offers: {
  deliveryId: Id<"deliveries">,
  driverId: Id<"users">,
  vehicleId: Id<"vehicles">,
  score: number,           // Composite score
  status: "pending" | "accepted" | "rejected" | "expired" | "cancelled",
  offeredAt: number,       // Timestamp
  expiresAt: number,       // Timestamp
  respondedAt?: number,
  rejectionReason?: string,
}
```

### Indexes

- `by_delivery`: Find offers for a delivery
- `by_driver`: Find offers for a driver
- `by_delivery_status`: Find active offers for a delivery
- `by_expires`: Find expired offers for cleanup

---

## Testing

### Unit Tests

Run scoring service tests:
```bash
bun run src/convex/dispatch/scoring_service.test.ts
```

### Test Coverage

| Area | Tests |
|------|-------|
| Eligibility | 7 tests |
| Scoring Components | 5 tests |
| Candidate Ranking | 2 tests |
| Configuration | 3 tests |
| Edge Cases | 3 tests |
| Utilities | 2 tests |

### Race Condition Testing

The concurrency protection is tested through:
1. Atomic operation validation
2. State transition validation
3. Offer exclusivity validation

---

## API Reference

### Mutations

| Mutation | Auth | Description |
|----------|------|-------------|
| `dispatchDelivery` | ops/admin | Dispatch a delivery and send offers |
| `acceptAssignment` | driver | Accept an assignment offer |
| `rejectAssignment` | driver | Reject an assignment offer |
| `reassignDelivery` | ops/admin | Cancel and re-dispatch |
| `processExpiredOffers` | ops/admin | Expire overdue offers |

### Queries

| Query | Auth | Description |
|-------|------|-------------|
| `getDispatchOffers` | ops/admin | Get offers for a delivery |
| `getMyDispatchOffers` | driver | Get pending offers for driver |

---

## Summary

The Lasha Dispatch Engine provides:

1. **Configurable scoring** with 6 weighted dimensions
2. **Atomic assignment offers** preventing race conditions
3. **Eligibility validation** ensuring only qualified drivers receive offers
4. **Automatic expiration** for stale offers
5. **Reassignment flow** for rejected/expired offers
6. **Extensible architecture** allowing ML replacement

The system is designed to handle the core dispatch requirements while remaining simple enough to understand and maintain. Future enhancements can be added without changing the fundamental architecture.
