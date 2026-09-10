# Lasha Production Runbook

## Quick Reference

| Service | URL | Status |
|---------|-----|--------|
| Application | `{deployment-url}` | Health: `/health` |
| Convex Dashboard | `https://dashboard.convex.dev/t/freebuff/{deployment-id}` | — |
| Health Check | `{deployment-url}/health` | Unauthenticated |
| Liveness Probe | `{deployment-url}/health/live` | Unauthenticated |

---

## 1. Health Check Procedures

### Basic Health Check
```bash
curl -s https://{deployment-url}/health | jq .
```

Expected response when healthy:
```json
{
  "status": "healthy",
  "checks": {
    "convex": { "status": "healthy" },
    "routing": { "status": "healthy", "latencyMs": 245 },
    "notifications": { "status": "healthy" }
  }
}
```

### Liveness Check
```bash
curl -s https://{deployment-url}/health/live | jq .
```

### Readiness Check
```bash
curl -s https://{deployment-url}/health/ready | jq .
```

---

## 2. Incident Response

### 2.1 Application Unresponsive

**Symptoms:**
- Health check returns 503 or times out
- Users cannot access the application
- React app shows blank page

**Immediate Actions:**
1. Check Convex dashboard for deployment status
2. Verify `convex dev` is running (if using development)
3. Check for TypeScript compilation errors:
   ```bash
   bunx convex dev --once
   bunx tsc -b --noEmit
   ```
4. Review Convex function logs for errors

**Resolution:**
- If deployment failed: Re-deploy with `bunx convex dev --once`
- If TypeScript error: Fix the compilation error
- If Convex service issue: Check status.convex.dev

### 2.2 Delivery Failures Spike

**Symptoms:**
- `delivery.failed` metric increases rapidly
- Customers report delivery failures
- Operations Centre shows multiple failed deliveries

**Investigation:**
1. Check recent audit events for failure reasons:
   ```
   Operations Centre → Exceptions tab
   ```
2. Review delivery state machine logs
3. Check driver availability metrics
4. Verify routing provider is operational

**Common Causes:**
- No available drivers in area
- Routing provider degraded
- Driver GPS validation failures
- Offline sync conflicts

**Resolution:**
- Deploy additional drivers to affected area
- Switch routing provider if degraded
- Clear GPS validation issues
- Resolve sync conflicts

### 2.3 Routing Provider Failure

**Symptoms:**
- `routing.failed` metric increasing
- Health check shows routing degraded
- Delivery quotes fail or use fallback

**Investigation:**
1. Check health endpoint for routing status
2. Verify API key validity (Google Maps)
3. Check external service status pages

**Resolution:**
- If Google Maps down: System automatically falls back to OSRM
- If OSRM down: Delivery creation continues with straight-line estimates
- If API key expired: Update key in Convex environment variables

**Graceful Degradation:**
The system is designed to continue operating without routing:
- Delivery creation: Uses straight-line distance estimate
- ETA calculation: Returns unavailable
- Dispatch: Continues without route optimization

### 2.4 Notification Failures

**Symptoms:**
- `notification.failed` metric increasing
- Users not receiving delivery updates

**Investigation:**
1. Check notification service logs
2. Verify notification preferences
3. Check user accounts exist

**Resolution:**
- In-app notifications: Check `notifications` table
- If notification provider down: Delivery operations continue unaffected
- Notifications are NOT critical path — delivery state updates proceed normally

### 2.5 GPS/Tracking Issues

**Symptoms:**
- `tracking.gps_invalid` metric increasing
- Driver locations not updating
- Tracking page shows stale data

**Investigation:**
1. Check GPS validation logs
2. Review driver location update frequency
3. Verify tracking configuration

**Resolution:**
- Invalid GPS: Usually caused by poor mobile signal — wait for recovery
- Throttled updates: Normal behavior, system rate-limits excessive updates
- Stale tracking: Check WebSocket connection status

### 2.6 Payment Failures

**Symptoms:**
- `payment.failed` metric increasing
- Transactions not completing
- Wallet balances incorrect

**Investigation:**
1. Check payment transaction logs
2. Verify payment provider status
3. Review audit events for payment operations

**Resolution:**
- Payment provider down: Retry logic handles transient failures
- Duplicate charge: Check idempotency keys
- Balance discrepancy: Review settlement records

**Critical:** Never manually adjust balances without audit trail.

---

## 3. Operational Procedures

### 3.1 View Active Deliveries
```
Operations Centre → Live Deliveries tab
```

### 3.2 View Driver Activity
```
Operations Centre → Drivers tab
```

### 3.3 Handle Exceptions
```
Operations Centre → Exceptions tab
→ Review failed/reassigned deliveries
→ Take corrective action
```

### 3.4 Review Audit Trail
```
Operations Centre → History tab
→ Filter by entity type, actor, or time range
```

### 3.5 Check Metrics
```
Operations Centre → Overview tab
→ View key performance indicators
```

---

## 4. Maintenance Procedures

### 4.1 Update Pricing Rules
1. Go to Operations Centre
2. Navigate to pricing configuration
3. Create new rule with effective date
4. Verify old rules are deactivated
5. Test quote calculation with new rules

### 4.2 Driver Management
1. Onboard new driver: Create user account with `driver` role
2. Add vehicle: Link vehicle to driver profile
3. Deactivate: Set driver `isAvailable: false`
4. Remove: Delete driver profile (preserves delivery history)

### 4.3 Configuration Changes
All configuration changes are:
- Logged in audit events
- Version-controlled in Convex schema
- Reversible through Convex dashboard

---

## 5. Monitoring Queries

### Delivery Status Summary
```typescript
// In Convex dashboard or via query
const activeDeliveries = await ctx.db
  .query("deliveries")
  .withIndex("by_status")
  .collect();

// Group by status
const summary = activeDeliveries.reduce((acc, d) => {
  acc[d.status] = (acc[d.status] || 0) + 1;
  return acc;
}, {} as Record<string, number>);
```

### Driver Availability
```typescript
const availableDrivers = await ctx.db
  .query("driver_profiles")
  .withIndex("by_available", (q) => q.eq("isAvailable", true))
  .collect();
```

### Recent Errors
```typescript
const recentErrors = await ctx.db
  .query("audit_events")
  .withIndex("by_category", (q) => q.eq("category", "system"))
  .order("desc")
  .take(50);
```

### Performance Metrics
```typescript
const metrics = await ctx.db
  .query("metrics_storage")
  .withIndex("by_name_time", (q) =>
    q.eq("metricName", "delivery.duration")
      .gte("timestamp", Date.now() - 24 * 60 * 60 * 1000)
  )
  .collect();
```

---

## 6. Backup and Recovery

### Convex Data
- Convex automatically backs up all data
- No manual backup procedures required
- Point-in-time recovery available via Convex dashboard

### Configuration
- Schema changes are version-controlled in Git
- Environment variables managed through Convex dashboard
- Pricing rules stored in database with versioning

### Recovery Procedures
1. **Data Loss:** Contact Convex support for point-in-time recovery
2. **Schema Migration:** Roll back to previous schema version
3. **Configuration Loss:** Restore from Git repository

---

## 7. Scaling Considerations

### Current Capacity
- Convex handles auto-scaling for function execution
- Database scales with document count
- WebSocket connections managed by Convex

### Performance Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| Delivery completion rate | < 95% | < 90% |
| Average dispatch latency | > 30s | > 60s |
| GPS update success rate | < 95% | < 90% |
| Notification delivery rate | < 90% | < 80% |
| Health check latency | > 5s | > 10s |

### Scaling Actions
- **High delivery volume:** Convex auto-scales, monitor function execution times
- **Geographic expansion:** Add new delivery zones in pricing rules
- **Driver capacity:** Onboard drivers through operations workflow

---

## 8. Security Incident Response

### Suspicious Activity
1. Check `auth.login_failed` metric
2. Review recent audit events for unauthorized access attempts
3. Verify user accounts haven't been compromised
4. Check for unusual delivery patterns

### Data Breach
1. Immediately rotate all API keys
2. Review access logs in Convex dashboard
3. Contact Convex support
4. Notify affected users
5. Document incident in audit trail

### Payment Fraud
1. Review recent transactions
2. Check for duplicate charges
3. Verify idempotency keys are unique
4. Suspend affected accounts if needed
5. Initiate refunds through payment provider

---

## 9. Contact Information

| Role | Contact | When to Escalate |
|------|---------|-----------------|
| Operations Team | Internal channel | Delivery exceptions, driver issues |
| Engineering Team | Internal channel | Code errors, system failures |
| Convex Support | support@convex.dev | Platform issues, data recovery |
| Payment Provider | Provider dashboard | Payment failures, fraud |
| Routing Provider | Provider dashboard | API key issues, service outage |

---

## 10. Changelog

| Date | Change | Author |
|------|--------|--------|
| 2026-09-09 | Initial runbook created | Buffy |
