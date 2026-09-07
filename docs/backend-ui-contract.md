# Lasha Backend ↔ UI Contract

**Version:** 1.0 · **Date:** 2026-09-07 · **Status:** Source of truth for backend function names, entity shapes, statuses, and UI access rules.

This contract binds the Lasha frontend (React dashboard + landing) to the backend function surface. Any backend change that breaks a name, shape, status value, or access rule listed here is a **breaking change** and requires a contract version bump.

---

## Table of contents

1. [Scope](#1-scope)
2. [Entities](#2-entities)
3. [Function API](#3-function-api)
4. [Realtime events](#4-realtime-events)
5. [Roles & access rules](#5-roles--access-rules)
6. [Conventions](#6-conventions)
7. [Known gaps & risks](#7-known-gaps--risks)

---

## 1. Scope

The contract covers the entities and function APIs the current UI consumes:

- **Activity Center** (`/dashboard`) — order list, filters, detail tabs (Order/Vehicle/Driver/Customer), route visualization.
- **Request Delivery** (`/request-delivery`) — parcel intake form.
- **Track Delivery** (`/track-delivery`) — public tracking by code, stepper, route, driver card.
- **Wallet** (`/wallet`) — balance, quick actions, transaction history.
- **Invoices** (`/invoices`), **Make Payment** (`/make-payment`) — billing surfaces.
- **Past Deliveries** (`/past-deliveries`) — delivery history table.
- **Notifications** (`/notifications`) — inbox.
- **Help / Legal / Downloads** — static content backed by documents.
- **Settings** (`/settings`) — profile, business, notifications, security.

## 2. Entities

Shapes are camelCase, matching the current `src/convex/schema.ts` and `src/data/orders.ts`.

### 2.1 users

| Field | Type | Notes |
|---|---|---|
| `id` | id | Convex ID |
| `email` | string | unique |
| `emailVerified` | boolean | |
| `name` | string | display name |
| `phone` | string? | |
| `role` | `"admin" \| "user" \| "member" \| "business" \| "courier"` | |
| `imageUrl` | string? | |
| `createdAt` | number | epoch ms |

### 2.2 addresses

| Field | Type | Notes |
|---|---|---|
| `id` | id | Convex ID |
| `userId` | id | owner |
| `label` | string | e.g. "Home", "Warehouse B" |
| `addressLine1` | string | |
| `addressLine2` | string? | |
| `city` | string | |
| `province` | string | |
| `postalCode` | string | |
| `country` | string | default `"ZA"` |
| `lat`, `lng` | number? | geocoded point |
| `isDefault` | boolean | one per user |

### 2.3 orders

| Field | Type | Notes |
|---|---|---|
| `id` | id | |
| `trackingId` | string | unique, human-friendly (`HY257845U4`) |
| `senderId` | id | users.id |
| `businessId` | id? | businesses.id |
| `pickupAddress` | object | snapshot (name, address, date, time) |
| `dropoffAddress` | object | snapshot |
| `status` | canonical enum | see §6 |
| `amountCents` | number | quoted total |
| `expeditionType` | `"standard" \| "express"` | |
| `createdAt` | number | epoch ms |

### 2.4 deliveries

| Field | Type | Notes |
|---|---|---|
| `id` | id | |
| `orderId` | id | orders.id |
| `courierId` | id? | users.id of driver |
| `vehicleId` | id? | vehicles.id (see §7.2) |
| `status` | canonical enum | |
| `pickedUpAt`, `completedAt` | number? | epoch ms |

### 2.5 vehicles

| Field | Type | Notes |
|---|---|---|
| `id` | id | |
| `registration` | string | unique (`FR35C0 GP`) |
| `make`, `model` | string | |
| `capacityKg` | number | |
| `hasBrakes`, `isExpress`, `isFlammable`, `hasTrailer` | boolean | spec grid |
| `imageUrl` | string? | |

### 2.6 driver_profiles

| Field | Type | Notes |
|---|---|---|
| `id` | id | |
| `userId` | id | users.id, unique |
| `licenseNumber` | string | |
| `rating` | number | 0–5, one decimal |
| `totalDeliveries` | number | |
| `isAvailable` | boolean | live state may come from Redis |

### 2.7 wallets / transactions / invoices

| Entity | Key fields |
|---|---|
| `wallets` | `id`, `userId` (unique), `balanceCents`, `currency: "ZAR"` |
| `transactions` | `id`, `walletId`, `type: "credit" \| "debit"`, `amountCents`, `status: "pending" \| "completed" \| "failed"`, `reference`, `description`, `createdAt` |
| `invoices` | `id`, `invoiceNumber` (unique), `orderId?`, `businessId?`, `amountCents`, `status: "paid" \| "pending" \| "cancelled"`, `dueDate` |

### 2.8 notifications / notification_preferences

| Entity | Key fields |
|---|---|
| `notifications` | `id`, `userId`, `type`, `title`, `body`, `isRead`, `createdAt` |
| `notification_preferences` | `id`, `userId` (unique), `emailEnabled`, `smsEnabled`, `pushEnabled`, `deliveryUpdates`, `marketingEmails` |

### 2.9 tracking_events

| Field | Type | Notes |
|---|---|---|
| `id` | id | |
| `orderId` | id | |
| `trackingId` | string | denormalized code for public lookup |
| `status` | milestone label | `order_placed`, `picked_up`, `in_transit`, `delivered` |
| `label` | string | display text |
| `lat`, `lng` | number? | event location |
| `createdAt` | number | epoch ms |

### 2.10 proof_of_delivery

| Field | Type | Notes |
|---|---|---|
| `id` | id | |
| `deliveryId` | id | deliveries.id, unique |
| `recipientName` | string | |
| `signatureUrl` | string? | object ref |
| `photoUrl` | string? | object ref |
| `lat`, `lng` | number | capture location |
| `completedAt` | number | epoch ms |

### 2.11 businesses / documents / support_tickets / reviews

| Entity | Key fields |
|---|---|
| `businesses` | `id`, `name`, `industry`, `registrationNumber`, `verificationStatus`, `ownerId` |
| `documents` | `id`, `title`, `category: "legal" \| "rates" \| "forms" \| "api"`, `fileUrl`, `fileSizeBytes`, `uploadedAt` |
| `support_tickets` | `id`, `userId`, `subject`, `message`, `status: "open" \| "in_progress" \| "resolved"`, `createdAt` |
| `reviews` | `id`, `orderId` (unique), `courierId`, `rating: 1–5`, `comment?`, `createdAt` |

## 3. Function API

Function names are the RPC surface. Modules map onto them (see `docs/architecture.md` §9).

| Function | Type | Auth | Notes |
|---|---|---|---|
| `users.currentUser` | query | signed-in | profile + role |
| `users.getProfile` | query | signed-in | full profile |
| `users.updateProfile` | mutation | signed-in | self only |
| `addresses.list` | query | signed-in | own addresses |
| `orders.list` | query | signed-in | scoped: sender or courier |
| `orders.get` | query | signed-in | sender/courier/admin |
| `orders.create` | mutation | signed-in | creates order + quote |
| `orders.searchByTracking` | query | public | by tracking code |
| `deliveries.getByOrder` | query | signed-in | assignment + vehicle + driver |
| `deliveries.getByCourier` | query | courier | courier's active/history |
| `vehicles.getByDelivery` | query | signed-in | specs for delivery |
| `driver_profiles.getByDelivery` | query | signed-in | driver for delivery |
| `wallets.getBalance` | query | signed-in | own balance |
| `wallets.topUp` | mutation | signed-in | creates payment intent |
| `transactions.list` | query | signed-in | own ledger |
| `invoices.list` | query | signed-in | own/business invoices |
| `notifications.list` | query | signed-in | own inbox |
| `notifications.unreadCount` | query | signed-in | badge count |
| `notifications.markRead` | mutation | signed-in | own notifications |
| `notification_preferences.get` | query | signed-in | own toggles |
| `notification_preferences.update` | mutation | signed-in | own toggles |
| `tracking_events.list` | query | public | by order |
| `tracking_events.getByTrackingId` | query | public | by tracking code |
| `proof_of_delivery.create` | mutation | courier | after upload |
| `proof_of_delivery.getByDelivery` | query | signed-in | sender/courier/admin |
| `documents.list` | query | public | download catalog |
| `support_tickets.list` | query | signed-in | own tickets |
| `support_tickets.create` | mutation | signed-in | creates ticket |

## 4. Realtime events

| Event | Channel | Payload | Consumer |
|---|---|---|---|
| `order.statusChanged` | `order:{id}` | `{orderId, status}` | customer dashboard |
| `delivery.locationUpdated` | `order:{id}` | `{orderId, lat, lng, heading, speed, ts}` | customer map, dispatch |
| `delivery.completed` | `order:{id}` | `{orderId, completedAt}` | customer dashboard |
| `notification.created` | `user:{id}` | notification snapshot | inbox badge |
| `invoice.statusChanged` | `user:{id}` | `{invoiceId, status}` | invoices list |
| `wallet.balanceChanged` | `user:{id}` | `{balanceCents}` | wallet page |

## 5. Roles & access rules

### 5.1 RBAC matrix

| Capability | admin | business | member | courier | user | anonymous |
|---|---|---|---|---|---|---|
| `orders.list` (own) | ✓ (all) | ✓ | ✓ | ✓ | ✓ | ✗ |
| `orders.create` | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ |
| `orders.cancel` | ✓ | ✓ | ✓ | ✗ | ✓ | ✗ |
| `deliveries.getByOrder` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `deliveries.getByCourier` | ✓ | — | — | ✓ | — | ✗ |
| `wallets.*` | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ |
| `proof_of_delivery.create` | ✗ | ✗ | ✗ | ✓ | ✗ | couriers only |
| `documents.list` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### 5.2 Ownership rules

- A `user`/`member` reads only orders where `senderId == actor`.
- A `business` role reads orders where `sender.businessId` ∈ actor's memberships.
- A `courier` reads orders where `courierId == actor` (current or historical).
- `admin` reads everything.
- Wallet, notifications, settings are always actor-scoped.

## 6. Conventions

- **Money:** integer ZAR cents (`1545000` = R15 450.00). The UI formats for display; the API never sends floats.
- **Timestamps:** epoch milliseconds.
- **IDs:** opaque; the UI never parses them.
- **Tracking codes** (`HY257845U4`) and invoice numbers (`INV-2024-001`) are human-friendly, separate from IDs.
- **Statuses:** one canonical enum — `pending`, `confirmed`, `picking_up`, `in_transit`, `delivered`, `cancelled` — used by orders, deliveries, and the UI. Track Delivery stepper labels (`order_placed`, `picked_up`, `in_transit`, `delivered`) are display milestones derived from tracking events, not a second status enum.
- **Event naming:** `<aggregate>.<camelCasePastVerb>` (e.g., `delivery.locationUpdated`).
- **Pagination:** cursor-based, newest-first.

## 7. Known gaps & risks

1. **§10.1 status mismatch** — resolved by the single canonical enum in §6; stepper labels are milestones.
2. **`deliveries.vehicleId` missing** — the production `deliveries` table (Dispatch module) must carry `vehicle_id`; Fleet validates ownership.
3. **Guest bypass** (`?dev=true`, sessionStorage `lasha_guest`) is a **dev-only affordance**; replace with anonymous auth before production.
4. **Money as float in UI mocks** — mocks use `15450` (rand display); backend always stores cents.
5. **`support_tickets`** exists in schema but has no UI yet.
6. **Offline sync** for the driver app is specified in `docs/architecture.md` §12 but not implemented.
