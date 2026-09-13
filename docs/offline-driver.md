# Lasha Offline-First Driver Resilience

## Offline Architecture

The architecture remains strictly:

```
Driver App
→ local resilience layer (IndexedDB queue + connectivity observer)
→ Convex (existing mutations/queries)
→ Convex database
```

**Convex remains the sole authoritative source of truth.** Local storage is
temporary resilience state only — it is never treated as authoritative domain
state, and it is cleared on logout.

Implementation modules:

| Module | Responsibility |
|---|---|
| `src/lib/offline/db.ts` | IndexedDB persistence (`lasha-offline` DB): operation queue, raw GPS buffer, cached deliveries, metadata |
| `src/lib/offline/operations.ts` | Queue API, enqueue-time retention/bounds, operation whitelist |
| `src/lib/offline/gps.ts` | GPS sampling, buffering, delivery-scoped sync through the existing tracking mutation |
| `src/lib/offline/sync.ts` | Sync engine: cycle orchestration, backoff, triggers |
| `src/lib/offline/connectivity.ts` | Connectivity state machine (Convex-connection-derived) |
| `src/hooks/use-offline.ts` | React hooks: `useConvexConnectionBridge`, `useSyncEngine`, `useConnectivity`, `useRequireOnline`, `useOfflineGPS`, `useDriverOfflineStatus` |
| `src/components/driver/DriverConnectivityIndicator.tsx` | Non-intrusive status pill in the Driver shell |

> A companion document, `docs/offline-sync.md`, describes the original
> design. Its "What Works Offline" table predates the safety hardening and
> incorrectly listed offers/state transitions/POD as queueable; the
> authoritative model is the one in this document.

## What Works Offline

Only operations that cannot corrupt authoritative state are buffered:

| Capability | Offline behaviour |
|---|---|
| GPS location updates (active delivery) | Buffered locally (bounded), synced on reconnect |
| View active delivery | Last known server state, clearly labelled, read-only |
| Prepare POD fields | Recipient/notes/files held in component state only; nothing submitted |

## What Requires Connectivity

These are concurrency-sensitive or state-machine-authoritative and are
**blocked in the UI** (buttons disabled + handlers refuse) and never queued:

| Operation | Reason |
|---|---|
| Offer accept / reject | Competing drivers, expiry, one-time accept — the server must see current state |
| All delivery state transitions (accept, en-route, arrive, pickup, trip, drop-off, complete, reject assignment) | A delayed replay could be invalid against the delivery's CURRENT state |
| POD submission (upload → POD → evidence → completion) | Completion must be server-confirmed; no local terminal states |
| Any financial action | Never queueable |

The `useRequireOnline` hook re-verifies connectivity at execution time (not
just at render), so a stale render cannot bypass the guard. The backend
authorization and validation remain authoritative regardless.

## GPS Buffer

- **Storage mechanism**: IndexedDB (database `lasha-offline`, operations store
  `pending_operations`), via `src/lib/offline/db.ts`. Not localStorage.
- **Delivery binding**: every entry records its `entityId` (the delivery) at
  enqueue time. A queued point for Delivery A is structurally never replayed
  against Delivery B.
- **Sampling**: mirrors the online throttle (≥15 s and/or ≥20 m movement), so
  buffer density matches the live path.
- **Queue limits / retention** (explicit, enforced at enqueue time):
  - `maxOperationsPerDelivery = 100` — oldest dropped first (FIFO)
  - `maxOperationsGlobal = 300` — absolute ceiling across deliveries
  - `maxOperationAgeMs = 5 min` — matches the backend's
    `validateTimestamp` max age; older points are pruned before sync because
    the server would reject them anyway
  - Queue-full behaviour: oldest points for that delivery are dropped
  - Delivery completed/cancelled/failed while points remain queued: the
    remaining points are discarded (`clearDeliveryOfflineBuffer` on terminal
    state); they are never replayed against another delivery
- **Synchronization**: the sync engine (`useSyncEngine` in `DriverShell`)
  replays points **oldest first** through the **existing**
  `tracking.mutations.updateDeliveryLocation` mutation using the app's
  authenticated Convex client. No second tracking mutation exists.
- **Retry behaviour**: per-delivery locking (no overlapping cycles), bounded
  exponential backoff (30 s doubling, capped at 5 min) after failures, retry
  triggers: connectivity return, tab re-focus, 30 s periodic check, manual tap
  on the indicator.
- **Survives refresh**: IndexedDB persists across reloads; the engine resumes
  automatically on next mount.

### Duplicate / stale protection

- A point is transmitted once and removed on acceptance.
- The backend's own frequency validation and down-sampling make accidental
  replay harmless; the server remains the duplicate arbiter.
- Authoritative server rejections (stale timestamp, unassigned, terminal
  delivery, invalid coordinates) discard the point — retrying could never
  succeed. Transient failures (network) retain it for the next cycle.

## POD

The existing POD flow (upload to Convex File Storage → `createPOD` →
`addPODEvidence` → `completeDelivery`) is unchanged and requires connectivity.
Offline, the driver may **prepare** the recipient name, notes, and selected
files in component state, but the submit button is disabled while offline and
**nothing is claimed as submitted or completed** until Convex confirms each
step. No offline evidence file store was added: a temporary disconnection at
dropoff does not justify persisted file storage, and the server-side POD
validation is untouched.

## Connectivity UI

The driver-facing indicator distinguishes all six states:

| State | Meaning | UI |
|---|---|---|
| `ONLINE` | Convex client WebSocket connected | Hidden (non-intrusive) unless points are pending |
| `OFFLINE` | No network or Convex unreachable | Amber pill: "Offline — location buffered" |
| `RECONNECTING` | Browser back online; Convex not yet re-established | Amber pulsing pill |
| `SYNCING` | A sync cycle is replaying buffered points | Teal pill: "Syncing buffered locations…" |
| `SYNC_COMPLETE` | Last cycle finished, nothing left to retry | Brief green confirmation, fades back |
| `SYNC_ERROR` | Cycle finished with items still pending (recoverable) | Red pill with the last recoverable reason; tap to retry |

The state is **not** `navigator.onLine`: it is derived from the Convex
client's actual connection (`useConvexConnectionState` →
`isWebSocketConnected` / `hasEverConnected`), bridged into the offline module
by `reportConvexConnection`. Before the WebSocket has ever connected, the app
reports OFFLINE rather than a false ONLINE.

Active Delivery additionally shows inline offline/sync banners and labels the
displayed state as the **last known server state**; buffered GPS counts are
surfaced as **pending local action**. Delivery completion is never displayed
locally: `Delivered` appears only from Convex-confirmed state.

## Security

- **Session isolation**: logout calls `clearAllOfflineData()` (all IndexedDB
  stores) **before** `signOut()`, so buffered locations and cached deliveries
  never survive into another session on a shared device.
- **Sensitive data minimization**: the queue stores only GPS operational
  fields (`lat`, `lng`, `timestamp`, `accuracy`, `speed`, `heading`) bound to
  a delivery ID. No authentication tokens, payment credentials, secrets,
  provider keys, or customer financial information are stored locally.
- **No fabricated server state**: offline code paths never write delivery
  state, notifications, earnings, or history.

## Browser Limitations

- IndexedDB is unavailable in some private-browsing modes; buffering then
  degrades to a no-op with an error status (the live path is never blocked).
- `navigator.onLine` / `online` events are heuristics; the Convex WebSocket
  state is the truth source, but neither mechanism can detect captive-portal
  filters that allow handshakes yet block traffic — mitigated by the client's
  own retry behaviour and backoff.
- Background GPS collection is not possible: `navigator.geolocation` watchers
  stop when the tab is backgrounded/closed. Buffered points cover only the
  period the Driver App is open.
- Delivery is best-effort: if the browser is killed before sync, points
  remain queued for the next session within the 5-minute age window (older
  points are pruned — consistent with server validation).

## Testing

`bunx tsx src/lib/offline/offline.test.ts` (42 tests) covers queue bounds,
retention, whitelist enforcement, sync-engine wiring, outcome classification,
delivery binding/isolation, logout cleanup, connectivity model, offline UI
blocking, security minimization, and no-forbidden-infrastructure guarantees.
