# Lasha Real-Time Tracking Architecture

## Overview

Lasha's real-time tracking system uses Convex's reactive architecture to provide live driver location updates to customers and operations. The system is designed around three core principles:

1. **Reactive by Default**: React components subscribe to queries and automatically re-render when data changes
2. **Data Minimization**: Each query returns only the data needed for its specific use case
3. **Server-Side Validation**: All location updates are validated server-side before being stored

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Components                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │ Customer         │    │ Operations      │                │
│  │ Tracking UI      │    │ Dashboard       │                │
│  │                  │    │                 │                │
│  │ useQuery(        │    │ useQuery(       │                │
│  │   getDelivery    │    │   getAvailable  │                │
│  │   Tracking)      │    │   DriverLocs)   │                │
│  └────────┬────────┘    └────────┬────────┘                │
│           │                       │                         │
│           └───────────┬───────────┘                         │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Convex Reactive Queries                 │   │
│  │                                                      │   │
│  │  • getDeliveryTracking - customer view               │   │
│  │  • getDriverLocation - single driver                 │   │
│  │  • getAvailableDriverLocations - operations view     │   │
│  │  • getMyCurrentDelivery - driver app                 │   │
│  └─────────────────────────────────────────────────────┘   │
│                       │                                     │
│                       ▼                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Convex Database                         │   │
│  │                                                      │   │
│  │  users (currentLat, currentLng, lastLocationUpdate)  │   │
│  │  tracking_events (deliveryId, lat, lng, timestamp)   │   │
│  │  deliveries (courierId, status)                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Current Location (users table)

Stores the driver's most recent GPS coordinates.

```typescript
users: {
  // ... other fields
  currentLat?: number,      // Latest latitude
  currentLng?: number,      // Latest longitude
  lastLocationUpdate?: number, // Timestamp of last update
}
```

**Update Frequency**: Every 10-30 seconds (configurable)

**Read Pattern**: Real-time subscription via `useQuery(getDriverLocation)`

### Historical Location (tracking_events table)

Stores location history for deliveries.

```typescript
tracking_events: {
  deliveryId: Id<"deliveries">,
  type: "location_update" | "status_change" | "order_placed" | "picked_up" | "in_transit" | "delivered",
  lat?: number,
  lng?: number,
  timestamp: number,
  metadata?: string, // JSON string with additional data
}
```

**Index**: `by_delivery_time` - Efficient queries for delivery timeline

### Delivery Status (deliveries table)

Links driver to delivery with current status.

```typescript
deliveries: {
  courierId?: Id<"users">,
  status: DeliveryStatus,
  // ... other fields
}
```

---

## Update Frequency Strategy

### Current Location Updates

| Scenario | Frequency | Rationale |
|----------|-----------|-----------|
| Active delivery | 5-10 seconds | Customer needs real-time tracking |
| No active delivery | 30-60 seconds | For dispatch proximity matching |
| Stale detection | 1 minute | Driver considered offline |

### Downsampled Historical Data

| Timeframe | Resolution | Rationale |
|-----------|------------|-----------|
| Last 24 hours | Every update | Detailed route replay |
| 24h - 7 days | 5-minute intervals | Trend analysis |
| 7 - 30 days | 15-minute intervals | Historical records |
| > 30 days | Deleted | Cost optimization |

### Implementation

```typescript
// Downsample logic in mutations.ts
const DOWNSAMPLE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const lastEvent = await ctx.db
  .query("tracking_events")
  .withIndex("by_delivery_time", (q) => q.eq("deliveryId", deliveryId))
  .order("desc")
  .first();

const shouldRecord = !lastEvent ||
  (timestamp - lastEvent.timestamp) >= DOWNSAMPLE_INTERVAL_MS;
```

---

## Validation Layers

All location updates pass through these validation layers:

### 1. Authentication

```typescript
const userId = await requireAuth(ctx);
if (!userId) throw new Error("Authentication required");
```

### 2. Authorization

- **Driver**: Can only update location for assigned deliveries
- **Customer**: Can only view tracking for their own deliveries
- **Operations**: Can view all tracking data

### 3. Coordinate Validity

```typescript
// Latitude: -90 to 90
// Longitude: -180 to 180
if (lat < -90 || lat > 90) throw new Error("Invalid latitude");
if (lng < -180 || lng > 180) throw new Error("Invalid longitude");
```

### 4. Timestamp Validity

```typescript
// Must be within last 5 minutes
// Must not be in the future (30s tolerance)
const MAX_AGE_MS = 5 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 30 * 1000;
```

### 5. Update Frequency

```typescript
// Minimum 10 seconds between updates
const MIN_UPDATE_INTERVAL_MS = 10_000;
```

### 6. Movement Reasonableness

```typescript
// Maximum speed: 200 km/h (covers all vehicles)
const MAX_SPEED_KMH = 200;

// Calculate speed from distance and time
const speedKmh = (distance / timeDiffSeconds) * 3600;
if (speedKmh > MAX_SPEED_KMH) throw new Error("Unreasonable speed");
```

---

## React Integration

### Subscribing to Tracking Data

```typescript
import { useQuery } from "convex/react";
import { api } from "../convex/_generated/api";

// Customer tracking view
function DeliveryTracking({ deliveryId }) {
  const tracking = useQuery(api.tracking.queries.getDeliveryTracking, {
    deliveryId,
  });

  if (tracking === undefined) return <Loading />;
  if (tracking === null) return <NotFound />;

  return (
    <Map
      driverLocation={tracking.driverLocation}
      routeHistory={tracking.routeHistory}
      destination={tracking.delivery}
    />
  );
}
```

### Operations Dashboard

```typescript
function OperationsDashboard() {
  const driverLocations = useQuery(
    api.tracking.queries.getAvailableDriverLocations
  );

  return (
    <Map
      markers={driverLocations?.map(loc => ({
        lat: loc.lat,
        lng: loc.lng,
        isStale: loc.isStale,
      }))}
    />
  );
}
```

### Driver App

```typescript
function DriverApp() {
  const currentDelivery = useQuery(
    api.tracking.queries.getMyCurrentDelivery
  );

  // Send location updates
  const updateLocation = useMutation(
    api.tracking.mutations.updateDeliveryLocation
  );

  useEffect(() => {
    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        updateLocation({
          deliveryId: currentDelivery.delivery.id,
          location: {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            timestamp: Date.now(),
            speed: position.coords.speed,
            heading: position.coords.heading,
          },
        });
      }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [currentDelivery?.delivery?.id]);

  return <NavigationUI />;
}
```

---

## Authorization Rules

### Who Can See What

| User Type | Can View | Cannot View |
|-----------|----------|-------------|
| **Customer** | Own deliveries only | Other customers' deliveries, driver locations without delivery |
| **Driver** | Assigned deliveries, own location | Other drivers' locations |
| **Operations** | All driver locations, all deliveries | - |
| **Company Admin** | Company drivers, company deliveries | Other companies' data |
| **Super Admin** | Everything | - |

### Implementation

```typescript
// In queries.ts
async function authorizeTrackingAccess(ctx, user, delivery) {
  // Operations/Admin can track any delivery
  const adminRoles = [ROLES.OPERATIONS, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN];
  if (adminRoles.includes(user.role)) {
    // Company admin can only track their company's deliveries
    if (user.role === ROLES.COMPANY_ADMIN) {
      const order = await ctx.db.get(delivery.orderId);
      if (order.businessId !== user.businessId) {
        throw new Error("Access denied");
      }
    }
    return;
  }

  // Driver can track their assigned deliveries
  if (user.role === ROLES.DRIVER) {
    if (delivery.courierId !== user.userId) {
      throw new Error("Access denied");
    }
    return;
  }

  // Customer can track their own deliveries
  if (user.role === ROLES.CUSTOMER) {
    const order = await ctx.db.get(delivery.orderId);
    if (order.senderId !== user.userId) {
      throw new Error("Access denied");
    }
    return;
  }

  throw new Error("Access denied");
}
```

---

## Reconnection Handling

Convex handles reconnection automatically:

1. **WebSocket Disconnection**: Convex SDK automatically reconnects
2. **Query Rehydration**: Queries are re-executed on reconnect
3. **Optimistic Updates**: Local mutations are replayed on reconnect
4. **State Synchronization**: Client state is synchronized with server

### No Manual Polling Required

Convex's reactive architecture means:
- No `setInterval` polling
- No manual WebSocket management
- No reconnection logic in React components
- Automatic state synchronization

---

## Data Retention

### High-Resolution Data (24 hours)

- Every 5-10 second update is stored
- Used for real-time tracking and route replay
- Indexed by delivery and timestamp

### Downsampled Data (30 days)

- Reduced to 5-minute intervals
- Used for analytics and historical records
- Automatically downsampled by retention job

### Cleanup Process

```typescript
// Called periodically (e.g., every hour)
export const cleanupTrackingData = mutation({
  handler: async (ctx) => {
    const now = Date.now();
    const highResCutoff = now - 24 * 60 * 60 * 1000;
    const lowResCutoff = now - 30 * 24 * 60 * 60 * 1000;

    // 1. Downsample high-res data older than 24h
    // 2. Delete low-res data older than 30 days
  },
});
```

---

## Client-Side Continuous GPS (Driver App)

The Driver Active Delivery workflow reports location continuously via the
browser Geolocation API — no new backend, schema, or tracking service.
All updates flow through the existing `tracking.mutations.updateDeliveryLocation`
mutation, which remains the authoritative validator.

### Hook: `useDriverLocationTracking`

Location: `src/hooks/useDriverLocationTracking.ts`

| Aspect | Behaviour |
|--------|-----------|
| Watcher | `navigator.geolocation.watchPosition()` (high accuracy) |
| Start condition | Authenticated driver + delivery in a trackable state |
| Stop conditions | Delivery completed/failed/rejected, no longer trackable, or page unmount (`clearWatch()`) |
| Duplicate watchers | Prevented via a watcher-ID ref + single-effect lifecycle |
| Send path | `updateDeliveryLocation({ deliveryId, location })` (existing mutation) |
| Permission requests | Only while a trackable delivery is active; never on pages without one |

### Throttling & Staleness Guards

Browser fixes are NOT sent on every event:

| Constant | Value | Purpose |
|----------|-------|---------|
| `SEND_INTERVAL_MS` | 15s | Minimum interval between Convex updates (above the backend's 10s `MIN_UPDATE_INTERVAL_MS`) |
| `HEARTBEAT_INTERVAL_MS` | 45s | Stationary heartbeat, keeps the driver below the backend's 60s `MAX_STALENESS_MS` |
| `MIN_DISTANCE_METERS` | 20m | Movements smaller than this are skipped until the heartbeat is due |

First fix after a session start is always sent. The server re-validates
every update (coordinates, timestamp, frequency, movement, assignment).

### Driver-Facing Status UI

The Active Delivery page shows a small status row (no map):

| State | Copy | Dot |
|--------|------|-----|
| `idle` | Location tracking off | grey |
| `starting` | Location tracking starting… | pulsing |
| `waiting` | Location tracking active | green |
| `sent` | Location update sent | green |
| `denied` | Location permission denied | red |
| `error` | GPS unavailable (+ reason) | red |
| `unsupported` | Location not supported on this device | grey |

Last successful update time is shown next to the status. GPS errors are
non-fatal: they change only the tracking status, never delivery state, and
the watcher stays live so subsequent fixes retry normally.

### Permission Failure Behaviour

| Scenario | Behaviour |
|----------|-----------|
| Permission denied | `denied` status; no repeated prompts; delivery state unaffected |
| GPS unavailable / timeout | `error` status with reason; watcher stays live |
| Browser without geolocation | `unsupported` status; no requests attempted |
| Page without active delivery | No watcher and no permission request at all |

---

## Performance Considerations

### Query Optimization

1. **Index Usage**: All queries use appropriate indexes
2. **Data Minimization**: Queries return only needed fields
3. **Pagination**: Large result sets are paginated
4. **Caching**: Convex handles query caching automatically

### Write Optimization

1. **Downsampling**: Reduces write frequency for historical data
2. **Batch Operations**: Multiple updates can be batched
3. **Async Processing**: Heavy operations are async

### Scale Considerations

| Metric | Current | At Scale |
|--------|---------|----------|
| Location updates/sec | ~100 | ~10,000 |
| Active drivers | ~50 | ~5,000 |
| Concurrent tracking views | ~100 | ~10,000 |

Convex handles this scale automatically through:
- Horizontal scaling
- Connection pooling
- Query optimization
- CDN caching

---

## Testing

### Unit Tests

Run validation tests:
```bash
bun run src/convex/tracking/tracking.test.ts
```

Client-side tracking decision logic (throttling, heartbeat, movement
filtering, GPS error mapping):
```bash
bunx tsx src/hooks/useDriverLocationTracking.test.ts
```

### Test Coverage

| Area | Tests |
|------|-------|
| Coordinate validation | 6 tests |
| Timestamp validation | 5 tests |
| Update frequency | 3 tests |
| Haversine distance | 3 tests |
| Movement validation | 4 tests |
| Driver authorization | 3 tests |
| Delivery trackable | 2 tests |
| Configuration | 3 tests |

### Integration Testing

Test real-time updates with:
1. Multiple concurrent drivers
2. Network disconnection/reconnection
3. High-frequency updates
4. Authorization edge cases

---

## API Reference

### Mutations

| Mutation | Description |
|----------|-------------|
| `updateDriverLocation` | Update driver's current location (not delivery-specific) |
| `updateDeliveryLocation` | Update location during active delivery (with downsampling) |
| `updateDeliveryStatusWithLocation` | Update delivery status with optional location |
| `cleanupTrackingData` | Remove old/downsample tracking data |

### Queries

| Query | Description |
|-------|-------------|
| `getDriverLocation` | Get single driver's current location |
| `getAvailableDriverLocations` | Get all available drivers' locations |
| `getDeliveryTracking` | Get delivery tracking data (status, driver location, route) |
| `getMyCurrentDelivery` | Get driver's current active delivery |
| `getDriverDeliveryHistory` | Get driver's delivery history with tracking data |
| `getTrackingStats` | Get tracking data volume statistics |

---

## Future Enhancements

### 1. Geofencing

Add server-side geofence checks:
- Auto-detect arrival at pickup/dropoff
- Trigger status updates based on location
- Alert on route deviations

### 2. ETA Calculation

Implement dynamic ETA based on:
- Current traffic conditions
- Route optimization
- Historical delivery times

### 3. Batch Location Processing

For high-scale scenarios:
- Buffer location updates
- Process in batches
- Reduce database writes

### 4. Analytics Dashboard

Track metrics:
- Average delivery time
- Driver utilization
- Route efficiency
- Customer satisfaction

---

## Summary

The Lasha real-time tracking system provides:

1. **Reactive Updates**: Automatic UI updates via Convex subscriptions
2. **Server-Side Validation**: Comprehensive location validation
3. **Authorization**: Role-based access control
4. **Data Efficiency**: Downsampling and retention policies
5. **Scalability**: Convex's automatic scaling

The system is designed to work without Redis or external caching, leveraging Convex's built-in reconnection handling and query optimization.
