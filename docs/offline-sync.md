# Lasha Offline Synchronization Architecture

## Overview

Lasha implements offline-resilient synchronization for the driver/logistics workflows. When the browser loses connectivity, drivers can continue performing critical delivery operations. Pending operations are queued locally and synchronized with Convex when connectivity returns.

**Key principle:** Convex remains the authoritative source of truth. Browser-local state is never authoritative.

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│                  React UI                        │
│  ┌─────────────┐  ┌──────────────────────────┐  │
│  │ useOffline   │  │ useOfflineMutation        │  │
│  │ useGPS       │  │ useConnectivity           │  │
│  └──────┬──────┘  └────────────┬─────────────┘  │
│         │                      │                 │
│  ┌──────┴──────────────────────┴─────────────┐  │
│  │         Offline Service Layer              │  │
│  │  ┌────────────┐  ┌───────────────────┐    │  │
│  │  │ Operations  │  │ GPS Buffer        │    │  │
│  │  │ Queue       │  │                   │    │  │
│  │  └──────┬─────┘  └────────┬──────────┘    │  │
│  │         │                 │                │  │
│  │  ┌──────┴─────────────────┴──────────┐    │  │
│  │  │     IndexedDB Persistence          │    │  │
│  │  └────────────────────────────────────┘    │  │
│  └──────────────────┬─────────────────────────┘  │
│                     │                            │
│  ┌──────────────────┴─────────────────────────┐  │
│  │         Sync Engine                         │  │
│  │  • Connectivity detection                   │  │
│  │  • Idempotent operation replay              │  │
│  │  • Conflict detection                       │  │
│  │  • Exponential backoff retry                │  │
│  └──────────────────┬─────────────────────────┘  │
│                     │                            │
│  ┌──────────────────┴─────────────────────────┐  │
│  │         Convex Backend                      │  │
│  │  • Validates every operation                │  │
│  │  • Rejects stale/conflicting operations     │  │
│  │  • Returns structured sync results          │  │
│  └─────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

---

## What Works Offline

> **Safety correction (authoritative model — see `docs/offline-driver.md`):**
> an earlier revision of this table listed offer accept/reject, delivery state
> transitions, and POD as queueable. Those operations are concurrency-
> sensitive or state-machine-authoritative; queueing them could replay an
> invalid transition against the delivery's CURRENT server state. They are
> **blocked offline** and never queued. The only queueable operation is
> buffered GPS.

| Operation | Offline Behavior | Sync Strategy |
|-----------|-----------------|---------------|
| View assigned delivery | ✅ Cached in IndexedDB | Refresh on reconnect |
| GPS location updates | ✅ Buffered in IndexedDB | Replay oldest-first through `updateDeliveryLocation` on reconnect |
| Accept assignment | ❌ Requires connectivity | Blocked in UI (concurrency-sensitive) |
| Reject assignment | ❌ Requires connectivity | Blocked in UI |
| Arrive at pickup | ❌ Requires connectivity | Blocked in UI |
| Pick up package | ❌ Requires connectivity | Blocked in UI |
| Start trip | ❌ Requires connectivity | Blocked in UI |
| Arrive at dropoff | ❌ Requires connectivity | Blocked in UI |
| Complete delivery | ❌ Requires connectivity | Blocked in UI (server must confirm) |
| Cancel delivery | ❌ Requires connectivity | Blocked in UI |
| Proof of delivery submission | ❌ Requires connectivity | Prepared locally, submitted online only |

## What Does NOT Work Offline

| Operation | Reason |
|-----------|--------|
| Request new delivery | Requires real-time order validation |
| View other drivers' locations | Requires real-time Convex subscription |
| Dispatch/assign drivers | Requires real-time availability check |
| View analytics/reports | Requires aggregated data |
| Payment processing | Requires external API connectivity |
| Send notifications | Requires external service |

---

## Local Persistence Strategy

### IndexedDB Database: `lasha-offline`

| Store | Purpose | Max Size |
|-------|---------|----------|
| `pending_operations` | Queued operations awaiting sync (GPS only) | 100 per delivery / 300 global |
| `gps_buffer` | Raw GPS diagnostics buffer | 100 locations |
| `cached_deliveries` | Delivery data for offline viewing | 50 deliveries |
| `metadata` | App state (last sync time, etc.) | Unlimited |

### Operation Schema

```typescript
interface StoredOperation {
  operationId: string;       // UUID - idempotency key
  operationType: string;     // e.g., "acceptAssignment"
  entityId: string;          // Delivery ID
  payload: Record<string, any>;  // Operation-specific data
  clientCreatedAt: number;   // Client timestamp
  status: "pending" | "syncing" | "synced" | "failed" | "expired";
  retryCount: number;        // Incremented on each attempt
  lastError?: string;        // Last error message
  lastAttemptAt?: number;    // Timestamp of last attempt
  syncedAt?: number;         // Timestamp when synced
}
```

---

## Synchronization Protocol

### 1. Connectivity Detection

```
States:
  ONLINE    → Connected and reachable
  DEGRADED  → Connected but unreliable
  OFFLINE   → No connectivity
  SYNCING   → Currently synchronizing
```

Detection uses:
- `navigator.onLine` for basic connectivity
- Active HTTP probe to Convex for reachability verification
- 30-second periodic health checks

### 2. Operation Queueing

When offline, operations are queued:

```
User action → queueOperation() → IndexedDB → Return operationId
```

The UI shows: **"Saved locally — waiting for connection"**

### 3. Synchronization Cycle

```
Connectivity restored → SyncEngine triggered → Get pending operations
→ Mark as "syncing" → Execute against Convex → Handle response
→ Update status → Repeat for remaining operations
```

### 4. Operation Execution

Each operation is executed against the appropriate Convex mutation:

| Operation | Convex Mutation |
|-----------|----------------|
| `acceptAssignment` | `deliveries.state_machine.acceptAssignment` |
| `arriveAtPickup` | `deliveries.state_machine.arriveAtPickup` |
| `pickupDelivery` | `deliveries.state_machine.pickupPackage` |
| `startTrip` | `deliveries.state_machine.startTrip` |
| `arriveAtDropoff` | `deliveries.state_machine.arriveAtDropoff` |
| `completeDelivery` | `deliveries.state_machine.completeDelivery` |
| `cancelDelivery` | `deliveries.state_machine.cancelDelivery` |
| `updateDeliveryStatus` | `tracking.mutations.updateDeliveryStatusWithLocation` |
| `updateLocation` | `tracking.mutations.updateDeliveryLocation` |

---

## Idempotency

Every queued operation has a unique client-generated `operationId` (UUID).

The Convex backend receives this ID and can detect:
- **Duplicate submissions** — Same operation submitted twice
- **Retry vs new operation** — Different operation IDs = different operations

### Duplicate Handling

```
Client sends operation with ID "abc-123"
→ Convex processes successfully
→ Client sends same operation with ID "abc-123" (retry)
→ Convex recognizes duplicate → Returns DUPLICATE status
→ Client marks as synced (no harm done)
```

---

## Conflict Resolution

### Server-Side Validation

Every replayed operation is validated against current state:

```
Offline queue: "completeDelivery" for delivery #123
Meanwhile: Another user cancelled delivery #123
Replay: Convex validates → delivery is already "cancelled"
Result: CONFLICT rejection
Client: Marks operation as failed, notifies user
```

### Sync Result Types

| Result | Meaning | Client Action |
|--------|---------|---------------|
| `SUCCESS` | Operation applied | Mark as synced |
| `DUPLICATE` | Already processed | Mark as synced |
| `CONFLICT` | State changed | Mark as failed, notify user |
| `INVALID` | Operation invalid | Mark as failed, notify user |
| `EXPIRED` | Too old | Discard, notify user |
| `ERROR` | Transient failure | Retry on next cycle |

### Conflict Scenarios

1. **Delivery already completed** — Another driver completed while offline
2. **Delivery cancelled** — Customer cancelled while driver was offline
3. **Already assigned** — Another driver accepted the same delivery
4. **State mismatch** — Delivery moved past the expected state

---

## Retry Strategy

| Attempt | Delay | Behavior |
|---------|-------|----------|
| 1st | Immediate | Try sync |
| 2nd | 1 second | Exponential backoff starts |
| 3rd | 2 seconds | |
| 4th | 4 seconds | |
| 5th | 8 seconds | |
| 6th+ | 30 seconds (max) | Up to 5 retries |
| Failed | - | Marked as failed, requires manual intervention |

### Retry Conditions

- Network errors → Retry
- Convex timeout → Retry
- Server 5xx error → Retry
- CONFLICT → Do not retry
- INVALID → Do not retry
- EXPIRED → Do not retry
- DUPLICATE → Mark as synced

---

## GPS Buffering Strategy

### Design Principles

1. **Bounded buffer** — 100 points per delivery / 300 global (see `docs/offline-driver.md`)
2. **Intelligent sampling** — Don't store every GPS point
3. **Distance-based** — Skip if moved < 20 meters
4. **Time-based** — Minimum 15 seconds between samples
5. **Age retention** — Points older than 5 minutes are pruned (server would reject them)

### Buffer Management

```
GPS point received
→ Check sampling rules
→ If should sample:
  → If online: Send to Convex directly
  → If offline: Add to IndexedDB buffer
  → If buffer full: Trim oldest points
→ Return { buffered, sampled }
```

### Sampling Rules

```typescript
const GPS_CONFIG = {
  maxBufferSize: 500,           // Maximum stored locations
  minSampleInterval: 5000,      // 5 seconds minimum
  minDistanceMeters: 10,        // 10 meters minimum movement
  maxAge: 24 * 60 * 60 * 1000, // 24 hours max age
  syncBatchSize: 50,            // Upload 50 at a time
};
```

### Sync Strategy

When connectivity returns:
1. Get up to 50 buffered locations
2. Send to Convex in batch
3. Clear synced locations from buffer
4. Repeat until buffer is empty

---

## React Integration

### Connectivity State

```typescript
import { useConnectivity } from "@/hooks/use-offline";

const { state, isOnline, isOffline, isDegraded } = useConnectivity();
```

### Offline-Aware Mutations

```typescript
import { useOfflineMutation } from "@/hooks/use-offline";

const { execute, isExecuting } = useOfflineMutation();

// Execute with offline fallback
await execute(
  "arriveAtPickup",
  deliveryId,
  {},
  () => convexMutation(api.deliveries.state_machine.arriveAtPickup, { deliveryId })
);
```

### Status Display

```typescript
import { useOfflineStatus } from "@/hooks/use-offline";

const { message, type, showSyncButton } = useOfflineStatus();
// Returns human-readable status like:
// "Saved locally — waiting for connection"
// "Connected"
// "Syncing 3 pending changes..."
```

### GPS Tracking

```typescript
import { useGPSTracking } from "@/hooks/use-offline";

const { isTracking, bufferCount, startTracking, stopTracking } = useGPSTracking();
```

---

## Security Considerations

1. **No sensitive data in localStorage** — Only operation metadata stored
2. **Convex auth required** — All replayed operations require valid auth
3. **Server-side validation** — Backend validates every operation
4. **No privilege escalation** — Operations checked against user role
5. **Operation expiry** — Old operations discarded (24 hours)
6. **Encrypted at rest** — IndexedDB follows browser security model

---

## Data Retention

| Data Type | Retention | Cleanup |
|-----------|-----------|---------|
| Synced operations | 24 hours after sync | Automatic |
| Failed operations | 7 days | Manual review |
| GPS buffer | Until synced | Automatic after sync |
| Cached deliveries | 7 days | Automatic |
| Metadata | Indefinite | Manual |

---

## Failure Scenarios

### Tab Closure During Sync
- Pending operations remain in IndexedDB
- Next session picks up from where it left off
- Operation IDs prevent duplicates

### Browser Refresh During Sync
- IndexedDB persists across refreshes
- Sync engine restarts on next load
- In-progress operations reset to "pending"

### Convex Rejection
- Operation marked as failed with reason
- User notified of conflict/invalid state
- Manual intervention may be required

### Storage Quota Exceeded
- GPS buffer trimmed to max size
- Operations oldest-first cleanup
- User notified of storage issues

---

## File Structure

```
src/
├── lib/offline/
│   ├── db.ts              # IndexedDB persistence layer
│   ├── operations.ts      # Operation queue management
│   ├── connectivity.ts    # Network detection
│   ├── sync.ts            # Synchronization engine
│   └── gps.ts             # GPS buffering
├── hooks/
│   └── use-offline.ts     # React hooks for offline features
└── convex/offline/
    └── validation.ts      # Server-side operation validation
```
