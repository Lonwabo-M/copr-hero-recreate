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
Periodic process checks for expired offers
    ↓
Find all offers where expiresAt < now AND status = "pending"
    ↓
Update status to "expired"
    ↓
(If no accepted offers for delivery, triggers reassignment)
```

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
