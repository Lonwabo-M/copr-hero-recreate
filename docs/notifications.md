# Lasha Notifications Architecture

## Overview

Lasha implements a server-side notification system using Convex. Notifications are created by domain operations (delivery state changes, payments, etc.) and read by React via reactive queries.

**Key principles:**
- Notifications are created server-side, never by React
- React only reads notifications via Convex queries
- Real-time updates via Convex reactive subscriptions
- User preferences control notification delivery
- Notifications are categorized for UI display

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Domain Operations                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐│
│  │ State Machine│  │ Dispatch    │  │ Pricing         ││
│  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘│
│         │                │                   │          │
│  ┌──────┴────────────────┴───────────────────┴────────┐│
│  │           Notification Service                      ││
│  │  • Template resolution                              ││
│  │  • Preference checking                              ││
│  │  • Recipient resolution                             ││
│  └──────────────────────┬─────────────────────────────┘│
└─────────────────────────┼───────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────┐
│                    Convex                               │
│  ┌──────────────────────┴─────────────────────────────┐│
│  │              Notifications Table                    ││
│  │  • userId                                          ││
│  │  • type (delivery/payment/alert/system/security)   ││
│  │  • title                                           ││
│  │  • description                                     ││
│  │  • isRead                                          ││
│  │  • entityId                                        ││
│  │  • createdAt                                       ││
│  └──────────────────────┬─────────────────────────────┘│
│                         │                               │
│  ┌──────────────────────┴─────────────────────────────┐│
│  │         Notification Preferences                    ││
│  │  • emailNotifications                              ││
│  │  • smsNotifications                                ││
│  │  • pushNotifications                               ││
│  │  • deliveryUpdates                                 ││
│  │  • marketingEmails                                 ││
│  └────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────┐
│                    React UI                             │
│  ┌──────────────────────┴─────────────────────────────┐│
│  │              Reactive Queries                       ││
│  │  • useQuery(getMyNotifications)                     ││
│  │  • useQuery(getUnreadCount)                         ││
│  │  • useMutation(markAsRead)                          ││
│  │  • useMutation(markAllAsRead)                       ││
│  └────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

---

## Data Model

### Notifications

```typescript
notifications: {
  userId: v.id("users"),
  type: "delivery" | "payment" | "alert" | "system" | "security",
  title: string,
  description: string,
  isRead: boolean,
  // Idempotency: `${eventType}:${deliveryId}` — unique per (userId, eventKey).
  eventKey?: string,
  entityId?: string,
  createdAt: number,
}
```

Indexes: `by_user`, `by_user_unread`, `by_user_event` (idempotency lookup).

### Notification Preferences

```typescript
notification_preferences: {
  userId: v.id("users"),
  emailNotifications: boolean,
  smsNotifications: boolean,
  pushNotifications: boolean,
  deliveryUpdates: boolean,
  marketingEmails: boolean,
}
```

---

## Notification Events

### Delivery Events

| Event | Title | Recipients |
|-------|-------|------------|
| `delivery_created` | Delivery Requested | Customer |
| `delivery_assigned` | Driver Assigned | Customer |
| `delivery_accepted` | Assignment Accepted | Operations |
| `delivery_rejected` | Assignment Rejected | Operations |
| `delivery_en_route_pickup` | Driver En Route | Customer |
| `delivery_arrived_pickup` | Driver Arrived | Customer |
| `delivery_picked_up` | Package Picked Up | Customer |
| `delivery_in_transit` | In Transit | Customer |
| `delivery_arrived_dropoff` | Arrived at Destination | Customer |
| `delivery_completed` | Delivery Completed | Customer |
| `delivery_failed` | Delivery Failed | Customer, Operations |
| `delivery_cancelled` | Delivery Cancelled | Customer, Driver |
| `delivery_reassigned` | Delivery Reassigned | Customer, Driver |

### Payment Events

| Event | Title | Recipients |
|-------|-------|------------|
| `payment_received` | Payment Received | Customer |
| `payment_failed` | Payment Failed | Customer |
| `invoice_generated` | Invoice Generated | Customer |
| `settlement_completed` | Settlement Completed | Driver |

### System Events

| Event | Title | Recipients |
|-------|-------|------------|
| `account_updated` | Account Updated | User |
| `security_alert` | Security Alert | User |
| `system_maintenance` | System Maintenance | All users |

---

## API Reference

### Queries

| Query | Description | Auth |
|-------|-------------|------|
| `getMyNotifications` | Get user's notifications | authenticated |
| `getUnreadCount` | Get unread count | authenticated |
| `getMyPreferences` | Get notification preferences | authenticated |

### Mutations

| Mutation | Description | Auth |
|----------|-------------|------|
| `createNotification` | Create a notification | authenticated |
| `markAsRead` | Mark notification as read | owner |
| `markAllAsRead` | Mark all as read | authenticated |
| `deleteNotification` | Delete a notification | owner |
| `updatePreferences` | Update preferences | authenticated |

### Internal Mutations

| Mutation | Description | Used By |
|----------|-------------|---------|
| `sendDeliveryNotification` | Send delivery notification | State machine |
| `sendPaymentNotification` | Send payment notification | Pricing |
| `sendSystemNotification` | Send system notification | Admin |

---

## React Integration

### Notifications Page

```typescript
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

function NotificationsPage() {
  const notifications = useQuery(api.notifications.service.getMyNotifications, {
    limit: 50,
  });
  
  const markAsRead = useMutation(api.notifications.service.markAsRead);
  const markAllAsRead = useMutation(api.notifications.service.markAllAsRead);
  
  return (
    <div>
      <button onClick={() => markAllAsRead()}>Mark all as read</button>
      {notifications?.map((n) => (
        <div 
          key={n._id} 
          className={n.isRead ? "" : "unread"}
          onClick={() => markAsRead({ notificationId: n._id })}
        >
          <h3>{n.title}</h3>
          <p>{n.description}</p>
        </div>
      ))}
    </div>
  );
}
```

### Unread Badge

```typescript
function NotificationBadge() {
  const unreadCount = useQuery(api.notifications.service.getUnreadCount);
  
  return (
    <div className="notification-badge">
      {unreadCount > 0 && <span>{unreadCount}</span>}
    </div>
  );
}
```

### Preferences

```typescript
function NotificationSettings() {
  const preferences = useQuery(api.notifications.service.getMyPreferences);
  const updatePreferences = useMutation(api.notifications.service.updatePreferences);
  
  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={preferences?.deliveryUpdates}
          onChange={(e) => updatePreferences({ deliveryUpdates: e.target.checked })}
        />
        Delivery Updates
      </label>
    </div>
  );
}
```

---

## Preference Logic

### Notification Filtering

```typescript
// Check if notification should be sent
if (prefs && !prefs.deliveryUpdates && category === "delivery") {
  // Skip this notification
  return;
}

if (prefs && !prefs.marketingEmails && category === "marketing") {
  // Skip marketing notifications
  return;
}
```

### Default Preferences

When a user has no preferences record:
- All notifications enabled
- Marketing emails disabled

---

## Integration Points (implemented)

The notification lifecycle is wired into the authoritative domain operations. All senders are **internal mutations** (`internal.notifications.service.*`) invoked from server-side domain code — never from React, and never with client-supplied recipients.

### Delivery State Machine (all delivery lifecycle events)

Every customer-facing transition in `src/convex/deliveries/state_machine.ts` fans out through one error-isolated helper, `notifyDeliveryEvent`, which resolves the recipient **server-side** from the authoritative order sender and delegates to `sendDeliveryNotification`:

| Domain event (audit action) | Notification type | Recipient (server-resolved) |
|---|---|---|
| order + delivery created (both creation paths) | `delivery_created` | order sender |
| `assignDriver` | `delivery_assigned` (+ `{driverName}`) | order sender |
| `acceptDelivery` | `delivery_accepted` | order sender |
| `rejectDelivery` | `delivery_rejected` | order sender |
| `startDelivery` (en route to pickup) | `delivery_en_route_pickup` | order sender |
| `arriveAtPickup` | `delivery_arrived_pickup` | order sender |
| `confirmPickup` | `delivery_picked_up` | order sender |
| `startTransit` | `delivery_in_transit` | order sender |
| `arriveAtDropoff` | `delivery_arrived_dropoff` | order sender |
| `completeDelivery` | `delivery_completed` | order sender |
| `cancelDelivery` | `delivery_cancelled` (+ `{reason}` when provided) | order sender |
| `failDelivery` | `delivery_failed` (+ `{reason}` or customer-safe fallback) | order sender |
| `reassignDelivery` | `delivery_reassigned` | order sender |

Notification failure is caught and logged — it can never fail the delivery transaction itself.

```typescript
// state_machine.ts — helper used by every transition
async function notifyDeliveryEvent(ctx, eventType, deliveryId, extra?) {
  try {
    const delivery = await ctx.db.get(deliveryId);
    if (!delivery) return;
    const recipientUserIds = extra?.recipientUserIds ?? [];
    if (extra?.recipientUserIds === undefined) {
      const order = await ctx.db.get(delivery.orderId);
      if (order?.senderId) recipientUserIds.push(order.senderId);
    }
    if (recipientUserIds.length === 0) return;
    await ctx.runMutation(internal.notifications.service.sendDeliveryNotification, {
      deliveryId, eventType, recipientUserIds, templateData: extra?.templateData,
    });
  } catch (error) {
    console.error(`[notifyDeliveryEvent] ...`, error);
  }
}
```

### Dispatch Engine (driver-facing)

`createDispatchOfferInternal` (the single offer-creation point used by dispatch and re-dispatch) notifies the offer's authoritative target driver:

```typescript
await ctx.runMutation(internal.notifications.service.sendDeliveryNotification, {
  deliveryId: args.deliveryId,
  eventType: "delivery_offer",
  recipientUserIds: [args.driverId],
});
```

The notification is idempotent per (event, delivery, driver), so re-dispatch to the same driver never duplicates the notification.

### POD Completion (customer)

`completeDeliveryWithPOD` (`pod/service.ts`) notifies the customer (order sender) after the delivery is marked delivered and the settlement is created. Uses `delivery_completed` — the same idempotency key as the state-machine completion path, so a customer who completes via POD gets exactly one completion notification.

### Payment Confirmation (customer)

`completePaymentTransaction` (`payments/mutations.ts`, internal, provider-evidence-driven) notifies the transaction's authoritative payer with `payment_confirmed`. Customer-safe wording only — no settlement, earnings, or platform-fee internals.

Financial notifications that are **not** wired (deliberately): `settlement_completed`, `invoice_generated`, `payment_received` (wallet credit). No external payout or withdrawal system exists; wallet-credit events are not part of the delivery lifecycle. These templates remain defined but unused.

---

## Idempotency

Domain transitions can be retried (client retries, provider webhooks). Duplicate notifications are prevented structurally:

- `notifications.eventKey` stores `${eventType}:${deliveryId}` (derived server-side, never from the client).
- The `by_user_event` index (`userId`, `eventKey`) backs an existence check before insert; a retried transition finds the existing record and skips it.
- `sendPaymentNotification` is only invoked from already-idempotent internal payment mutations (`completePaymentTransaction` is a no-op for an already-`completed` transaction).

---

## Role / Resource Security

- **Recipients are resolved server-side** from authoritative relationships (order sender, assigned courier, transaction payer, offer driver). No mutation accepts a recipient user ID from the client.
- **Reading** is session-scoped: `getMyNotifications` filters by the authenticated user; `markAsRead`/`deleteNotification` verify ownership and deny foreign records.
- **Creation boundaries**: the only public mutation, `createNotification`, ignores its legacy `userId` argument and always targets the authenticated session user — one user cannot generate notifications for another.
- **Customer/driver boundary**: customers receive delivery + payment-confirmation events only; drivers receive `delivery_offer` events only. No customer sees dispatch/earnings internals; no driver sees customer payment-provider details.

## Deep Links

Delivery notifications carry `entityId` = the delivery ID (written server-side). The customer Notifications page navigates to the customer tracking page `/deliveries/:deliveryId` when a delivery notification is opened (and marks it read). Payment/system notifications stay in place — no separate payment-detail route exists. Driver notifications currently surface on the Driver Home page (recent items + unread count) via the same session-scoped query; opening the Driver Offers / Active Delivery pages shows the underlying state. No links cross role boundaries.

## External Channels

**Not implemented by this system.** SMS, email, push (FCM/Web-push/Twilio/Resend/etc.) are not sent anywhere. The preference flags `emailNotifications`/`smsNotifications`/`pushNotifications` exist in the schema but no external transport consumes them. The lifecycle is strictly in-app: domain event → Convex notification record → reactive query → UI.

---

## Security Considerations

1. **Ownership** - Users can only modify their own notifications
2. **Server-Side Creation** - Notifications created only by mutations
3. **Preference Enforcement** - Preferences checked before creation
4. **No Sensitive Data** - Notifications contain no credentials or secrets

---

## File Structure

```
src/convex/
├── notifications/
│   ├── service.ts              # Queries, mutations, internal mutations
│   └── notifications.test.ts   # Tests
└── schema.ts                   # Schema with notification tables

docs/
└── notifications.md            # This document
```

---

## Future Enhancements

1. **Email Integration** - Send emails via Convex actions
2. **SMS Integration** - Send SMS via Twilio/Telnyx
3. **Push Notifications** - Web push via service workers
4. **Notification Groups** - Batch notifications
5. **Scheduled Notifications** - Delayed delivery
6. **Notification Templates** - Admin-configurable templates
7. **Analytics** - Track notification open rates
