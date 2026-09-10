# Lasha Observability Guide

## Architecture Overview

Lasha runs on **Convex** as a serverless backend. This means:

- **No Redis** — Convex handles caching, real-time subscriptions, and connection management internally.
- **No separate WebSocket server** — Convex manages WebSocket connections for reactive queries.
- **Database performance** — Convex optimizes query execution, indexing, and caching automatically.
- **No process management** — Convex manages function execution, scaling, and cold starts.

Observability is achieved through:
1. **Structured logging** with correlation IDs
2. **Metrics collection** via the `metrics_storage` table
3. **Health check endpoints** via Convex HTTP actions
4. **Audit event logging** for compliance and traceability
5. **Convex Dashboard** for native database and function monitoring

---

## 1. Structured Logging

### Location
`src/convex/logging/service.ts`

### Usage
Every domain operation should use the structured logger:

```typescript
import { createLogger, LOG_CATEGORIES } from "../logging/service";

const log = createLogger(LOG_CATEGORIES.DELIVERY);

// Info-level log
log.info("Delivery created", {
  operation: "createDelivery",
  entityId: deliveryId,
  metadata: { orderId, packageSize },
});

// Error with correlation
log.error("Delivery transition failed", {
  operation: "pickupDelivery",
  entityId: deliveryId,
  error: { name: "InvalidState", message: "Cannot pickup from delivered state" },
});

// Track operation with timing
await log.trackOperation(
  "calculateRoute",
  "delivery",
  deliveryId,
  async () => {
    return await calculateRoute(origin, destination);
  },
  { origin, destination }
);

// External service call with fallback
const route = await log.callExternalService(
  "google-maps",
  "getRoute",
  () => fetchGoogleRoute(args),
  () => getOSRMRoute(args),  // fallback
  { origin, destination }
);
```

### Log Format
Every log entry contains:
```
[LEVEL][CATEGORY][CORRELATION_ID] Message {"metadata": {...}}
```

Example:
```
[INFO][delivery][lash-a1b2c3-delivery] Delivery created {"operation":"createDelivery","entityId":"d_123"}
```

### Correlation IDs
Format: `lash-{timestamp36}-{random6}`
- Unique per operation
- Propagated across function calls
- Visible in Convex logs for tracing

### Categories
| Category | Use Case |
|----------|----------|
| `delivery` | Delivery lifecycle events |
| `dispatch` | Driver assignment and matching |
| `tracking` | GPS updates and location tracking |
| `pricing` | Quote calculation and pricing rules |
| `payment` | Transactions and settlements |
| `pod` | Proof of delivery operations |
| `notification` | Notification delivery |
| `routing` | Map/routing API calls |
| `auth` | Authentication events |
| `offline_sync` | Offline queue synchronization |
| `system` | System-level events |

---

## 2. Metrics Collection

### Location
`src/convex/metrics/service.ts`

### Schema
The `metrics_storage` table stores aggregated metrics in 5-minute windows:

| Field | Description |
|-------|-------------|
| `metricName` | Dot-notation metric name (e.g., `delivery.completed`) |
| `metricType` | `counter`, `gauge`, or `histogram` |
| `value` | Aggregated value |
| `dimensions` | Optional key-value pairs for slicing |
| `periodStart` | Window start (5-minute aligned) |
| `periodEnd` | Window end |
| `sampleCount` | Number of data points in the aggregation |

### Metric Types

**Counter** — Monotonically increasing count:
```typescript
await ctx.runMutation(internal.metrics.service.incrementCounter, {
  metricName: METRICS.DELIVERY_COMPLETED,
  dimensions: { status: "delivered" },
});
```

**Histogram** — Distribution of values (for latency, duration):
```typescript
await ctx.runMutation(internal.metrics.service.recordHistogram, {
  metricName: METRICS.DISPATCH_LATENCY,
  value: latencyMs,
  dimensions: { zone: "johannesburg" },
});
```

**Gauge** — Point-in-time value:
```typescript
await ctx.runMutation(internal.metrics.service.setGauge, {
  metricName: METRICS.TRACKING_SESSION_ACTIVE,
  value: activeSessions,
});
```

### Available Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `delivery.created` | counter | New delivery requests |
| `delivery.completed` | counter | Successfully delivered |
| `delivery.cancelled` | counter | Cancelled deliveries |
| `delivery.failed` | counter | Failed deliveries |
| `delivery.duration` | histogram | Delivery time (ms) |
| `dispatch.started` | counter | Dispatch attempts |
| `dispatch.completed` | counter | Successful dispatches |
| `dispatch.latency` | histogram | Time to assign driver (ms) |
| `dispatch.offer_accepted` | counter | Driver accepted offers |
| `dispatch.offer_rejected` | counter | Driver rejected offers |
| `dispatch.no_candidates` | counter | No available drivers |
| `tracking.gps_update` | counter | GPS updates received |
| `tracking.gps_throttled` | counter | Throttled GPS updates |
| `tracking.gps_invalid` | counter | Invalid GPS coordinates |
| `notification.sent` | counter | Notifications sent |
| `notification.failed` | counter | Notification failures |
| `routing.request` | counter | Routing API requests |
| `routing.success` | counter | Successful routes |
| `routing.failed` | counter | Failed routing calls |
| `routing.fallback` | counter | Fallback routing used |
| `pricing.quote_calculated` | counter | Pricing quotes generated |
| `pod.submitted` | counter | POD submissions |
| `pod.failed` | counter | POD failures |
| `payment.initiated` | counter | Payments started |
| `payment.completed` | counter | Payments confirmed |
| `payment.failed` | counter | Payment failures |
| `settlement.completed` | counter | Driver settlements |
| `auth.login_success` | counter | Successful logins |
| `auth.login_failed` | counter | Failed login attempts |
| `offline.sync_started` | counter | Sync attempts |
| `offline.sync_completed` | counter | Successful syncs |
| `offline.sync_conflict` | counter | Sync conflicts |
| `system.error` | counter | System errors |

### Querying Metrics

**For the Operations Centre:**
```typescript
const metrics = await useQuery(api.metrics.service.getDashboardMetrics, {
  sinceMs: Date.now() - 24 * 60 * 60 * 1000,
});
```

**For specific metric trends:**
```typescript
const trend = await useQuery(api.metrics.service.getMetrics, {
  metricName: "delivery.completed",
  sinceMs: Date.now() - 7 * 24 * 60 * 60 * 1000,
});
```

---

## 3. Health Check Endpoints

### Endpoints

| Endpoint | Purpose | Auth Required |
|----------|---------|---------------|
| `GET /health` | Full health check with subsystem verification | No |
| `GET /health/live` | Liveness probe (is the server running?) | No |
| `GET /health/ready` | Readiness probe (is the server ready?) | No |

### Full Health Check Response

```json
{
  "status": "healthy | degraded | unhealthy",
  "timestamp": 1693000000000,
  "version": "1.0.0",
  "uptime": 3600000,
  "checks": {
    "convex": { "status": "healthy", "message": "Convex runtime operational" },
    "routing": { "status": "healthy", "latencyMs": 245, "message": "OSRM available (fallback)" },
    "notifications": { "status": "healthy", "message": "In-app notifications operational" }
  }
}
```

### Status Codes
| Status | HTTP Code | Meaning |
|--------|-----------|---------|
| `healthy` | 200 | All subsystems operational |
| `degraded` | 200 | Some subsystems degraded but core operational |
| `unhealthy` | 503 | Critical subsystem failure |

### Load Balancer Configuration
```
Health Check URL: /health/live
Interval: 30s
Timeout: 5s
Healthy threshold: 2
Unhealthy threshold: 3
```

---

## 4. External Service Monitoring

### Routing Provider (Google Maps / OSRM)

**Failure handling:**
- Google Maps unavailable → Falls back to OSRM (free, no API key)
- OSRM unavailable → Returns straight-line distance with warning
- All routing failed → Delivery creation continues with estimated distance

**Monitoring:**
- `routing.request` counter tracks total requests
- `routing.failed` counter tracks failures
- `routing.fallback` counter tracks fallback usage
- Health check verifies routing provider availability

### Notification System

**Failure handling:**
- In-app notification creation failure → Logged as error, delivery continues
- SMS/notification provider failure → Delivery completion succeeds without notification
- All notification channels down → Delivery state updates proceed normally

**Key principle:** Notification failures must NEVER block delivery operations.

---

## 5. Convex Dashboard Monitoring

The Convex dashboard provides native monitoring:

### Function Logs
- View structured logs from mutations and queries
- Filter by correlation ID to trace complete operations
- Search by category and severity

### Database Performance
- Query execution times
- Index usage statistics
- Document counts per table
- Storage consumption

### Real-time Metrics
- Active WebSocket connections
- Function execution counts
- Error rates
- Cold start frequency

### Access
URL: `https://dashboard.convex.dev/t/freebuff/{deployment-id}`

---

## 6. Alerting Recommendations

### Critical Alerts (Immediate)
- Health check returns `unhealthy` for > 2 minutes
- Delivery completion rate drops below 90%
- Database errors exceed 5 per minute
- Authentication failures spike (> 10 in 5 minutes)

### Warning Alerts (15 minutes)
- Routing fallback usage exceeds 20% of requests
- GPS invalid updates exceed 5% of total
- Notification failure rate exceeds 10%
- Offline sync conflict rate exceeds 5%

### Info Alerts (Daily)
- Delivery volume anomaly (> 2x standard deviation)
- New driver registrations
- Pricing rule changes
- Configuration changes

---

## 7. Log Retention

| Data Type | Retention | Storage |
|-----------|-----------|---------|
| Convex console logs | 7 days | Convex internal |
| Audit events | Indefinite | `audit_events` table |
| Metrics data | 30 days | `metrics_storage` table |
| Critical events | Indefinite | `audit_events` (bridged) |

### Cleanup
Metrics older than 30 days should be archived or deleted:
```typescript
// Run periodically via Convex cron or action
const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
const oldMetrics = await ctx.db
  .query("metrics_storage")
  .withIndex("by_timestamp", (q) => q.lt("timestamp", cutoff))
  .collect();

for (const metric of oldMetrics) {
  await ctx.db.delete(metric._id);
}
```

---

## 8. Security Considerations

- Health endpoints are unauthenticated (required for load balancers)
- Logging never includes sensitive data (passwords, tokens, full payment details)
- Correlation IDs are non-guessable (timestamp + random)
- Metrics contain no personally identifiable information
- Audit events include actor ID but not credentials
- External API keys are never logged

---

## 9. Troubleshooting

### High Latency
1. Check Convex dashboard for slow queries
2. Review routing provider latency in health checks
3. Monitor dispatch latency metric
4. Check for GPS update throttling

### Delivery Failures
1. Query `delivery.failed` metric with dimensions
2. Review audit events for the specific delivery
3. Check driver availability metrics
4. Review notification failure logs

### Offline Sync Issues
1. Check `offline.sync_conflict` metric
2. Review pending operation queue size
3. Verify idempotency key generation
4. Check for expired operations

### Routing Degradation
1. Check health endpoint for routing status
2. Monitor `routing.fallback` counter
3. Verify Google Maps API key validity
4. Check OSRM service status
