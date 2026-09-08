# Lasha Delivery State Machine

## Overview

The Lasha delivery state machine manages the complete lifecycle of a delivery from request to completion. It ensures that all state transitions are authorized, validated, and recorded.

## States

| State | Description | Authoritative |
|-------|-------------|---------------|
| `requested` | Customer has created a delivery request | ✅ |
| `pending_dispatch` | Delivery is awaiting driver assignment | ✅ |
| `assigned` | Driver has been assigned but hasn't accepted yet | ✅ |
| `driver_accepted` | Driver has accepted the assignment | ✅ |
| `en_route_to_pickup` | Driver is heading to pickup location | ✅ |
| `at_pickup` | Driver has arrived at pickup location | ✅ |
| `picked_up` | Package has been picked up | ✅ |
| `in_transit` | Package is in transit to dropoff | ✅ |
| `at_dropoff` | Driver has arrived at dropoff location | ✅ |
| `delivered` | Delivery completed successfully | ✅ |
| `cancelled` | Delivery was cancelled | ✅ |
| `failed` | Delivery failed | ✅ |
| `reassignment_required` | Driver rejected or failed, needs new assignment | ✅ |

## State Transitions

```
requested → pending_dispatch
    ↓
pending_dispatch → assigned
    ↓
assigned → driver_accepted (driver accepts)
assigned → reassignment_required (driver rejects)
assigned → cancelled (customer/ops cancels)
    ↓
driver_accepted → en_route_to_pickup
    ↓
en_route_to_pickup → at_pickup
    ↓
at_pickup → picked_up
    ↓
picked_up → in_transit
    ↓
in_transit → at_dropoff
    ↓
at_dropoff → delivered
    ↓
delivered → (terminal state)
```

### Exceptional Transitions

```
en_route_to_pickup → reassignment_required (driver fails)
at_pickup → reassignment_required (driver fails)
picked_up → failed (delivery failed in transit)
in_transit → failed (delivery failed in transit)
at_dropoff → failed (delivery failed at dropoff)
```

### Cancellation Transitions

```
requested → cancelled (customer/ops)
pending_dispatch → cancelled (customer/ops)
assigned → cancelled (customer/ops)
driver_accepted → cancelled (customer/ops)
en_route_to_pickup → cancelled (customer/ops)
at_pickup → cancelled (customer/ops)
```

## Authorization Rules

### By Operation

| Operation | Allowed Roles | Notes |
|-----------|---------------|-------|
| Create Delivery | customer, company_admin | Must be authenticated |
| Assign Driver | operations, company_admin, super_admin | Must have assignment data |
| Accept Assignment | driver | Must be assigned driver |
| Reject Assignment | driver | Must be assigned driver |
| Arrive at Pickup | driver | Must be assigned driver |
| Pick Up Package | driver | Must be assigned driver |
| Start Trip | driver | Must be assigned driver |
| Arrive at Dropoff | driver | Must be assigned driver |
| Complete Delivery | driver | Must be assigned driver |
| Cancel Delivery | customer, operations, company_admin, super_admin | Owner or admin only |
| Request Reassignment | driver, operations | Assigned driver or ops |

### Ownership & Isolation

1. **Customer Isolation**: Customers can only access their own deliveries
2. **Driver Isolation**: Drivers can only modify deliveries assigned to them
3. **Company Isolation**: Company admins can only access their company's deliveries
4. **Admin Override**: Operations and super_admin can access all deliveries

## Business Rules

### Concurrent Acceptance Protection

When a driver accepts an assignment:
1. System checks delivery is in `assigned` state
2. System checks delivery is assigned to the accepting driver
3. System atomically transitions to `driver_accepted`
4. If two drivers try to accept simultaneously, only one succeeds

### State Validation

Every mutation validates:
1. User is authenticated
2. User has required role
3. User has access to the delivery (ownership/company/driver)
4. Current state allows the transition
5. Required data is present (e.g., location for location updates)
6. No duplicate requests (idempotency)

### Audit Trail

Every state transition creates a `tracking_events` entry with:
- `eventType`: The transition that occurred
- `deliveryId`: The delivery being modified
- `timestamp`: When the transition occurred
- `metadata`: Additional context (e.g., driver ID, cancellation reason)

## Implementation

### File Structure

```
src/convex/deliveries/
├── state_machine.ts      # State machine logic
├── state_machine.test.ts # Tests
├── mutations.ts          # Public mutations
└── queries.ts            # Public queries
```

### Mutation Pattern

```typescript
export const mutateDelivery = mutation({
  args: {
    deliveryId: v.id("deliveries"),
    // ... additional args
  },
  handler: async (ctx, args) => {
    // 1. Authenticate
    const userId = await requireAuth(ctx);
    
    // 2. Authorize
    const user = await requireRole(ctx, "driver");
    await requireDriverAccess(ctx, userId, args.deliveryId);
    
    // 3. Validate state
    const delivery = await ctx.db.get(args.deliveryId);
    validateState(delivery.status, "at_pickup");
    
    // 4. Validate data
    validateRequiredData(args);
    
    // 5. Transition state
    await ctx.db.patch(args.deliveryId, {
      status: "picked_up",
      pickedUpAt: now,
    });
    
    // 6. Record event
    await ctx.db.insert("tracking_events", {
      eventType: "picked_up",
      deliveryId: args.deliveryId,
      timestamp: now,
    });
    
    return { success: true };
  },
});
```

## Testing

The state machine includes comprehensive tests covering:

1. **State Transition Tests**: Verify all valid transitions
2. **Invalid Transition Tests**: Verify invalid transitions are rejected
3. **Authorization Tests**: Verify correct roles can perform operations
4. **Ownership Tests**: Verify isolation between customers, drivers, and companies
5. **Concurrent Acceptance Tests**: Verify only one driver can accept
6. **Idempotency Tests**: Verify duplicate requests are handled gracefully
7. **Audit Trail Tests**: Verify tracking events are created
8. **Edge Case Tests**: Verify handling of missing data, invalid states, etc.

Run tests:
```bash
bun run src/convex/deliveries/state_machine.test.ts
```

## Future Enhancements

1. **Webhook Integration**: Trigger external notifications on state changes
2. **SLA Monitoring**: Track delivery time against commitments
3. **Automated Reassignment**: Auto-reassign after timeout
4. **Driver Rating**: Factor driver rating into assignment decisions
5. **Multi-stop Deliveries**: Support deliveries with multiple dropoffs
6. **Scheduled Deliveries**: Support future delivery times
7. **Real-time Tracking**: Push location updates during transit
