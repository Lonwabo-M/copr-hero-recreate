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
  entityId?: string,
  createdAt: number,
}
```

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

## Integration Points

### Delivery State Machine

```typescript
// In state_machine.ts completeDelivery mutation
await ctx.runMutation(api.notifications.service.sendDeliveryNotification, {
  deliveryId: args.deliveryId,
  eventType: "delivery_completed",
  recipientUserIds: [order.senderId],
  templateData: {},
});
```

### Dispatch Engine

```typescript
// In dispatch/engine.ts when offer is sent
await ctx.runMutation(api.notifications.service.sendDeliveryNotification, {
  deliveryId: args.deliveryId,
  eventType: "delivery_assigned",
  recipientUserIds: [order.senderId],
  templateData: { driverName: driver.name },
});
```

### Pricing Service

```typescript
// In pricing/service.ts when settlement completes
await ctx.runMutation(api.notifications.service.sendPaymentNotification, {
  userId: driverId,
  eventType: "settlement_completed",
  templateData: { amount: (earnings / 100).toFixed(2) },
});
```

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
