# Lasha Audit Logging and Traceability System

## Overview

The Lasha audit logging system provides a production-grade, immutable audit trail for all important system actions. It answers: **Who did what, when, to which object, and what changed?**

---

## Architecture

```
Domain Operations (State Machine, Dispatch, POD, Pricing)
                    ↓
            Internal Mutations
                    ↓
          ┌─────────┴─────────┐
          │   audit_events    │
          │   (Immutable)     │
          └─────────┬─────────┘
                    ↓
              Queries
                    ↓
         Operations Centre
         Delivery History
         Security Auditing
```

---

## Data Model

### audit_events Table

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `actorId` | ID\<users\> | ✅ | Who performed the action |
| `actorRole` | string | ✅ | Role of actor at time of action |
| `actorEmail` | string | ❌ | Email for audit readability |
| `category` | enum | ✅ | Event classification |
| `action` | string | ✅ | Specific action performed |
| `entityType` | string | ✅ | Type of entity affected |
| `entityId` | string | ✅ | ID of entity affected |
| `before` | string | ❌ | JSON snapshot of state before |
| `after` | string | ❌ | JSON snapshot of state after |
| `metadata` | string | ❌ | Additional context as JSON |
| `deliveryId` | ID\<deliveries\> | ❌ | Denormalized for fast queries |
| `orderId` | ID\<orders\> | ❌ | Denormalized for fast queries |
| `timestamp` | number | ✅ | Immutable event timestamp |

### Indexes

| Index | Fields | Purpose |
|-------|--------|---------|
| `by_actor` | actorId, timestamp | User activity logs |
| `by_category` | category, timestamp | Category-filtered queries |
| `by_entity` | entityType, entityId, timestamp | Entity audit trail |
| `by_delivery` | deliveryId, timestamp | Delivery history |
| `by_order` | orderId, timestamp | Order history |
| `by_timestamp` | timestamp | Global recent events |
| `by_action` | action, timestamp | Action-specific queries |

---

## Audit Event Categories

### Delivery Events (14 actions)

`delivery.created`, `delivery.dispatched`, `delivery.assigned`, `delivery.accepted`, `delivery.rejected`, `delivery.en_route`, `delivery.arrived_pickup`, `delivery.picked_up`, `delivery.in_transit`, `delivery.arrived_dropoff`, `delivery.completed`, `delivery.failed`, `delivery.cancelled`, `delivery.reassigned`

### Dispatch Events (7 actions)

`dispatch.started`, `dispatch.driver_matched`, `dispatch.offer_sent`, `dispatch.offer_accepted`, `dispatch.offer_rejected`, `dispatch.offer_expired`, `dispatch.reassigned`

### Pricing Events (4 actions)

`pricing.quote_created`, `pricing.rule_created`, `pricing.rule_deactivated`, `pricing.rule_changed`

### Payment Events (8 actions)

`payment.initiated`, `payment.confirmed`, `payment.failed`, `payment.refunded`, `settlement.created`, `settlement.processed`, `settlement.completed`, `settlement.failed`

### POD Events (4 actions)

`pod.created`, `pod.evidence_added`, `pod.completed`, `pod.failed`

---

## Integration Points

### Delivery State Machine

Every state transition records an audit event with before/after snapshots:

```typescript
await ctx.runMutation(internal.audit.service.recordDeliveryTransition, {
  actorId: user,
  actorRole: userRole,
  deliveryId: args.deliveryId,
  orderId: delivery.orderId,
  action: AUDIT_ACTIONS.DELIVERY_COMPLETED,
  fromStatus: delivery.status,
  toStatus: DELIVERY_STATUS.DELIVERED,
});
```

### Proof of Delivery

- `pod.created` — POD record created
- `pod.evidence_added` — File evidence attached
- `pod.completed` — Delivery completed with POD
- `pod.failed` — Failed delivery recorded

### Pricing

- `pricing.quote_created` — Quote calculated
- `pricing.rule_created` — New rule created
- `pricing.rule_deactivated` — Rule deactivated

---

## API

### Internal Mutations

| Mutation | Purpose |
|----------|---------|
| `recordEvent` | Generic audit event |
| `recordDeliveryTransition` | Delivery state change (with before/after) |
| `recordDispatchEvent` | Dispatch operation |
| `recordPricingEvent` | Pricing operation |
| `recordPaymentEvent` | Payment/settlement |
| `recordPODEvent` | POD operation |
| `recordGenericEvent` | User/driver/vehicle/company event |

### Queries

| Query | Purpose | Access |
|-------|---------|--------|
| `getAuditEventsForDelivery` | Delivery audit trail | Operations, admins, assigned driver/customer |
| `getAuditEventsForOrder` | Order audit trail | Operations, admins, order owner |
| `getRecentAuditEvents` | Global recent events | Operations, admins only |
| `getAuditEventsForEntity` | Entity-specific trail | Operations, admins only |
| `getAuditEventsByActor` | User activity log | Self or operations/admins |
| `getAuditEventsByAction` | Action-specific events | Operations, admins only |
| `getAuditStats` | Dashboard statistics | Operations, admins only |

---

## Authorization Matrix

| Operation | Customer | Driver | Operations | Company Admin | Super Admin |
|-----------|----------|--------|------------|---------------|-------------|
| View own audit | ✅ | ✅ | ✅ | ✅ | ✅ |
| View delivery audit | ✅ (own) | ✅ (assigned) | ✅ | ✅ | ✅ |
| View order audit | ✅ (own) | ❌ | ✅ | ✅ | ✅ |
| View global audit | ❌ | ❌ | ✅ | ✅ | ✅ |
| View entity audit | ❌ | ❌ | ✅ | ✅ | ✅ |
| View audit stats | ❌ | ❌ | ✅ | ✅ | ✅ |

---

## Event Examples

### Delivery Completed

```json
{
  "actorId": "driver123",
  "actorRole": "driver",
  "category": "delivery",
  "action": "delivery.completed",
  "entityType": "delivery",
  "entityId": "delivery456",
  "before": "{\"status\":\"at_dropoff\",\"courierId\":\"driver123\"}",
  "after": "{\"status\":\"delivered\",\"courierId\":\"driver123\"}",
  "deliveryId": "delivery456",
  "orderId": "order789",
  "timestamp": 1694000000000
}
```

### Assignment Rejected

```json
{
  "actorId": "driver123",
  "actorRole": "driver",
  "category": "delivery",
  "action": "delivery.rejected",
  "entityType": "delivery",
  "entityId": "delivery456",
  "before": "{\"status\":\"assigned\",\"courierId\":\"driver123\"}",
  "after": "{\"status\":\"reassignment_required\",\"courierId\":null}",
  "metadata": "{\"reason\":\"Vehicle breakdown\"}",
  "deliveryId": "delivery456",
  "orderId": "order789",
  "timestamp": 1694000000000
}
```

---

## Security

1. **Immutability** — Audit events cannot be modified after creation
2. **Authorization** — All queries enforce server-side role checks
3. **Actor Resolution** — Actor info resolved server-side, never trusted from client
4. **No Sensitive Data** — No passwords, tokens, or unnecessary PII

---

## Files

| File | Purpose |
|------|---------|
| `src/convex/schema.ts` | `audit_events` table definition |
| `src/convex/audit/service.ts` | Internal mutations + queries |
| `src/convex/audit/audit.test.ts` | Validation tests |
| `docs/audit-logging.md` | This documentation |

### Modified Files

| File | Changes |
|------|---------|
| `src/convex/deliveries/state_machine.ts` | Audit calls on every state transition |
| `src/convex/pod/service.ts` | Audit calls on POD operations |
| `src/convex/pricing/service.ts` | Audit calls on pricing operations |
