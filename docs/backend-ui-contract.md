# Lasha Backend–UI Contract

**Status:** Canonical specification for backend implementation phases
**Date:** 2026-09-03
**Platform:** Convex (serverless) + React/TypeScript frontend
**Stack:** Convex functions, Convex Auth (email-otp + anonymous), Convex Realtime

---

## 1. Existing Frontend Architecture

### 1.1 Application Routes

| Route | Page Component | Auth Required | Purpose |
|---|---|---|---|
| `/` | `Landing.tsx` | No | Marketing landing page |
| `/auth` | `Auth.tsx` | No | Email OTP sign-in/sign-up |
| `/dashboard` | `Dashboard.tsx` | Yes | Activity Center — order management + tracking |
| `/request-delivery` | `RequestDelivery.tsx` | Yes | Create new delivery request |
| `/track-delivery` | `TrackDelivery.tsx` | Yes | Track shipment by tracking ID |
| `/wallet` | `Wallet.tsx` | Yes | Wallet balance, transactions, top-up |
| `/past-deliveries` | `PastDeliveries.tsx` | Yes | Historical delivery table |
| `/invoices` | `Invoices.tsx` | Yes | Invoice management with filters |
| `/make-payment` | `MakePayment.tsx` | Yes | Payment method selection + amount |
| `/notifications` | `Notifications.tsx` | Yes | Notification feed |
| `/help` | `Help.tsx` | Yes | Help center topic cards |
| `/legal` | `Legal.tsx` | Yes | Static legal content |
| `/downloads` | `Downloads.tsx` | Yes | Downloadable documents |
| `/settings` | `Settings.tsx` | Yes | Profile, business, notifications, security tabs |

### 1.2 Component Hierarchy

```
Landing Page
├── Navbar (sticky)
├── Hero (background image, CTAs)
├── WhyLasha (benefits)
├── WhoWeServe (B2B/B2C audience cards)
├── HowItWorks (4-step interactive)
├── About (editorial)
├── SectorIntelligence (4 industry cards)
├── FAQ (accordion)
├── FinalCTA
└── Footer (newsletter, links, social)

Dashboard Shell (shared by all authenticated pages)
├── TopNavigation (logo, nav links, profile button)
├── Sidebar (12 nav items + logout)
└── Workspace (page-specific content)
```

### 1.3 State Management

All state is local React `useState`. No global state management library (Redux, Zustand, etc.) is used. Convex handles server state via reactive queries.

### 1.4 Existing Convex Auth

- **Providers:** `email-otp` (6-digit code via freebuff.app SMTP), `Anonymous`
- **JWT:** Custom JWT for freebuff.com federation (`vly-convex` applicationID)
- **Session:** Convex Auth manages session tokens automatically
- **Bypass:** `sessionStorage.setItem("lasha_guest", "true")` for dev/guest access

---

## 2. Existing Data Models (Convex Schema)

### 2.1 Schema Tables Currently Defined

```typescript
// FROM src/convex/schema.ts

users: {
  name?: string
  image?: string
  email?: string
  emailVerificationTime?: number
  isAnonymous?: boolean
  role?: "admin" | "user" | "member" | "business" | "courier"
  phone?: string
  businessId?: Id<"businesses">
}
// Index: email

businesses: {
  name: string
  ownerUserId: Id<"users">
  industry?: string
  phone?: string
  address?: string
  createdAt: number
}
// Index: by_owner

addresses: {
  userId: Id<"users">
  label: string          // "Home", "Office", "Warehouse"
  street: string
  city: string
  state?: string
  zip: string
  lat?: number
  lng?: number
  isDefault?: boolean
}
// Index: by_user

orders: {
  senderId: Id<"users">
  businessId?: Id<"businesses">
  pickupAddressId: Id<"addresses">
  dropoffAddressId: Id<"addresses">
  status: "pending" | "confirmed" | "picking_up" | "in_transit" | "delivered" | "cancelled"
  description?: string
  packageSize: "small" | "medium" | "large"
  price: number
  scheduledTime?: number
  createdAt: number
  updatedAt: number
}
// Indexes: by_sender, by_status, by_business

deliveries: {
  orderId: Id<"orders">
  courierId?: Id<"users">
  status: "pending" | "confirmed" | "picking_up" | "in_transit" | "delivered" | "cancelled"
  pickupLat?: number
  pickupLng?: number
  dropoffLat?: number
  dropoffLng?: number
  estimatedArrival?: number
  actualArrival?: number
  startedAt?: number
  completedAt?: number
}
// Indexes: by_order, by_courier

reviews: {
  orderId: Id<"orders">
  reviewerId: Id<"users">
  courierId: Id<"users">
  rating: number          // 1-5
  comment?: string
  createdAt: number
}
// Indexes: by_order, by_courier
```

### 2.2 Roles Defined

| Role | Purpose |
|---|---|
| `admin` | Platform administrators |
| `user` | Default customer role |
| `member` | Team member within a business |
| `business` | Business account owner |
| `courier` | Taxi driver / delivery agent |

---

## 3. Required Backend Entities (NOT YET IN SCHEMA)

The following tables are implied by the UI but do not exist in the Convex schema. Each is mapped to the specific UI screen that requires it.

### 3.1 `vehicles`

**Required by:** Dashboard → Vehicle Details tab, Order card vehicle display

```
vehicles: {
  registration: string       // "FR35C0 GP"
  ownerId: Id<"users">       // courier who drives this vehicle
  type: string               // "minibus", "sedan", "bakkie"
  capacityKg: number         // 859
  capacityM3?: number
  image?: string             // URL to vehicle photo
  hasBrakes: boolean         // "Breaking" field in UI
  isExpress: boolean
  carriesFlammable: boolean
  hasTrailer: boolean
  isAvailable: boolean
  createdAt: number
}
// Indexes: by_owner, by_registration
```

### 3.2 `driver_profiles`

**Required by:** Dashboard → Driver Details tab, Track Delivery → Driver card

```
driver_profiles: {
  userId: Id<"users">
  licenseClass: string       // "B Code 08", "C Code 10"
  licenseNumber: string
  phone: string
  rating: number             // average 1-5
  totalTrips: number
  isAvailable: boolean
  currentLat?: number
  currentLng?: number
  avatar?: string
  createdAt: number
}
// Indexes: by_user
```

### 3.3 `wallets`

**Required by:** Wallet page — balance display, top-up

```
wallets: {
  userId: Id<"users">
  balance: number            // in ZAR cents (1545000 = R15,450.00)
  currency: string           // "ZAR"
  isActive: boolean
  createdAt: number
  updatedAt: number
}
// Indexes: by_user (unique)
```

### 3.4 `transactions`

**Required by:** Wallet page — transaction history, Make Payment

```
transactions: {
  walletId: Id<"wallets">
  type: "credit" | "debit"
  amount: number             // in ZAR cents
  description: string        // "Wallet Top-Up", "Delivery #ORD-55667"
  reference?: string         // "TOP-20260901-001"
  status: "completed" | "pending" | "failed"
  orderId?: Id<"orders">     // linked delivery if debit
  paymentMethod?: string     // "card", "eft", "wallet", "snapscan"
  createdAt: number
}
// Indexes: by_wallet, by_order, by_status
```

### 3.5 `invoices`

**Required by:** Invoices page

```
invoices: {
  businessId?: Id<"businesses">
  userId: Id<"users">
  invoiceNumber: string      // "INV-2024-001"
  amount: number             // in ZAR cents
  status: "paid" | "pending" | "cancelled"
  description: string
  orderId?: Id<"orders">
  dueDate?: number
  paidAt?: number
  createdAt: number
}
// Indexes: by_business, by_user, by_status
```

### 3.6 `notifications`

**Required by:** Notifications page, sidebar badge

```
notifications: {
  userId: Id<"users">
  type: "delivery" | "payment" | "alert"
  title: string
  description: string
  isRead: boolean
  orderId?: Id<"orders">
  createdAt: number
}
// Indexes: by_user, by_user_unread
```

### 3.7 `tracking_events`

**Required by:** Track Delivery page — progress stepper, route visualization

```
tracking_events: {
  orderId: Id<"orders">
  deliveryId: Id<"deliveries">
  trackingId: string         // "HY257845U4" — public tracking code
  status: "order_placed" | "picked_up" | "in_transit" | "delivered"
  label: string              // "Order placed", "Picked up", etc.
  lat?: number
  lng?: number
  timestamp: number
}
// Indexes: by_order, by_tracking_id
```

### 3.8 `proof_of_delivery`

**Required by:** Delivery completion workflow (implied by tracking)

```
proof_of_delivery: {
  deliveryId: Id<"deliveries">
  orderId: Id<"orders">
  recipientName: string
  recipientSignature?: string   // base64 or URL
  photoUrl?: string
  lat?: number
  lng?: number
  completedAt: number
}
// Indexes: by_delivery, by_order
```

### 3.9 `notification_preferences`

**Required by:** Settings → Notifications tab

```
notification_preferences: {
  userId: Id<"users">
  emailNotifications: boolean
  smsNotifications: boolean
  pushNotifications: boolean
  deliveryUpdates: boolean
  marketingEmails: boolean
}
// Indexes: by_user (unique)
```

### 3.10 `support_tickets`

**Required by:** Help → Contact Support button

```
support_tickets: {
  userId: Id<"users">
  subject: string
  message: string
  status: "open" | "in_progress" | "resolved" | "closed"
  category: string            // "delivery", "payment", "account", "other"
  createdAt: number
  updatedAt: number
}
// Indexes: by_user, by_status
```

### 3.11 `documents`

**Required by:** Downloads page — downloadable files

```
documents: {
  name: string                // "Terms of Service"
  category: string            // "legal", "rates", "forms", "api"
  fileUrl: string
  fileSize: number            // bytes
  fileType: string            // "pdf", "xlsx"
  updatedAt: number
}
// Indexes: by_category
```

---

## 4. Required API Endpoints (Convex Functions)

### 4.1 Queries (read)

| Function | Source UI | Input | Output |
|---|---|---|---|
| `orders.list` | Dashboard order panel | `{ status?, search?, businessId? }` | `Order[]` with nested pickup/dropoff addresses |
| `orders.get` | Details panel | `{ orderId }` | Full order with vehicle, driver, customer |
| `orders.searchByTracking` | Track Delivery | `{ trackingId }` | Order + tracking events + driver |
| `deliveries.getByOrder` | Details panel | `{ orderId }` | Delivery record with courier |
| `deliveries.getByCourier` | Driver's own view | `{ courierId }` | Active deliveries |
| `vehicles.get` | Vehicle Details tab | `{ vehicleId }` | Full vehicle specs |
| `vehicles.getByCourier` | Vehicle Details tab | `{ courierId }` | Vehicle assigned to courier |
| `driver_profiles.get` | Driver Details tab | `{ userId }` | Driver profile with rating |
| `driver_profiles.getByOrder` | Track Delivery driver card | `{ orderId }` | Assigned driver info |
| `wallets.getBalance` | Wallet page | `{ userId }` | Current balance |
| `transactions.list` | Wallet transaction history | `{ walletId, type?, limit? }` | `Transaction[]` |
| `invoices.list` | Invoices page | `{ userId, status?, businessId? }` | `Invoice[]` |
| `notifications.list` | Notifications page | `{ userId, unreadOnly? }` | `Notification[]` |
| `notifications.unreadCount` | Sidebar badge | `{ userId }` | `number` |
| `addresses.list` | Request Delivery dropdown | `{ userId }` | `Address[]` |
| `tracking_events.list` | Track Delivery stepper | `{ orderId }` | `TrackingEvent[]` sorted by timestamp |
| `tracking_events.getByTrackingId` | Track Delivery search | `{ trackingId }` | Tracking data with order + driver |
| `users.currentUser` | All authenticated pages | `{}` | Current user with role |
| `users.getProfile` | Settings profile tab | `{ userId }` | Full user profile |
| `businesses.get` | Settings business tab | `{ businessId }` | Business details |
| `notification_preferences.get` | Settings notifications tab | `{ userId }` | Preferences |
| `documents.list` | Downloads page | `{ category? }` | `Document[]` |
| `support_tickets.list` | Help page | `{ userId }` | `SupportTicket[]` |
| `reviews.getByOrder` | (future) Order rating | `{ orderId }` | `Review` |

### 4.2 Mutations (write)

| Function | Source UI | Input | Side Effects |
|---|---|---|---|
| `orders.create` | Request Delivery form | `{ senderId, pickupAddressId, dropoffAddressId, packageSize, description, scheduledTime, ... }` | Creates order + delivery record + tracking event |
| `orders.updateStatus` | (admin/courier) | `{ orderId, status }` | Updates order + delivery + creates tracking event + notification |
| `orders.cancel` | (customer) | `{ orderId, userId }` | Sets status=cancelled, creates refund transaction |
| `addresses.create` | (future) Saved locations | `{ userId, label, street, city, ... }` | Creates address |
| `addresses.update` | (future) Edit address | `{ addressId, ... }` | Updates address |
| `addresses.delete` | (future) Remove address | `{ addressId }` | Soft/hard delete |
| `wallets.topUp` | Wallet top-up modal | `{ userId, amount, paymentMethod }` | Creates transaction, updates balance |
| `wallets.debit` | Order payment | `{ walletId, amount, orderId }` | Creates debit transaction, updates balance |
| `transactions.create` | (internal) | `{ walletId, type, amount, description, ... }` | Creates transaction record |
| `invoices.create` | (admin) | `{ userId, businessId?, amount, ... }` | Creates invoice |
| `invoices.markPaid` | (payment flow) | `{ invoiceId }` | Updates status, creates wallet debit |
| `notifications.create` | (internal) | `{ userId, type, title, description, orderId? }` | Creates notification |
| `notifications.markRead` | (user action) | `{ notificationId }` | Sets isRead=true |
| `notifications.markAllRead` | (user action) | `{ userId }` | Marks all as read |
| `notification_preferences.update` | Settings toggles | `{ userId, preferences }` | Updates preferences |
| `users.updateProfile` | Settings profile save | `{ userId, name, phone, address }` | Updates user |
| `users.updateAvatar` | Settings avatar edit | `{ userId, imageUrl }` | Updates user image |
| `businesses.update` | Settings business save | `{ businessId, ... }` | Updates business |
| `driver_profiles.update` | (driver app) | `{ userId, ... }` | Updates driver profile |
| `vehicles.create` | (driver onboarding) | `{ ownerId, ... }` | Creates vehicle |
| `vehicles.update` | (driver) | `{ vehicleId, ... }` | Updates vehicle |
| `tracking_events.create` | (internal) | `{ orderId, deliveryId, status, lat?, lng? }` | Creates tracking event |
| `proof_of_delivery.create` | (courier delivery complete) | `{ deliveryId, recipientName, photoUrl?, ... }` | Creates POD, updates delivery status |
| `reviews.create` | (future) Post-delivery | `{ orderId, courierId, rating, comment? }` | Creates review, updates driver rating |
| `support_tickets.create` | Help contact support | `{ userId, subject, message, category }` | Creates ticket |
| `documents.create` | (admin) | `{ name, category, fileUrl, ... }` | Creates document record |

### 4.3 Actions (server-side logic)

| Function | Purpose | External Calls |
|---|---|---|
| `actions.payment.processTopUp` | Process wallet top-up via payment gateway | Stripe/Yoco API |
| `actions.payment.processOrderPayment` | Charge for delivery | Payment gateway |
| `actions.payment.processRefund` | Refund cancelled delivery | Payment gateway |
| `actions.notification.sendEmail` | Send email notifications | SMTP / email API |
| `actions.notification.sendSms` | Send SMS for critical updates | SMS gateway (e.g., Clickatell, BulkSMS) |
| `actions.tracking.generateTrackingId` | Generate unique tracking code | — |
| `actions.dispatch.matchDriver` | Find available courier for order | Internal matching logic |
| `actions.dispatch.notifyDriver` | Push notification to matched driver | Push notification service |
| `actions.documents.generateInvoicePdf` | Generate invoice PDF | PDF library |
| `actions.documents.generateStatementPdf` | Generate wallet statement | PDF library |

---

## 5. Required Real-Time Events

Convex queries are reactive by default. The following subscriptions need real-time updates:

| Event | Subscribers | Trigger |
|---|---|---|
| `order.statusChanged` | Customer dashboard, driver dashboard | Status mutation |
| `delivery.locationUpdated` | Track Delivery page | GPS ping from driver |
| `delivery.assigned` | Customer notifications, driver dashboard | Dispatch matching |
| `delivery.completed` | Customer dashboard, notifications | Proof of delivery submitted |
| `notification.created` | Notifications page, sidebar badge | Any notification mutation |
| `transaction.created` | Wallet page balance + list | Wallet mutation |
| `invoice.statusChanged` | Invoices page | Payment/void mutation |

---

## 6. Required Authentication & Authorization Rules

### 6.1 Role-Based Access

| Resource | Customer (`user`/`business`) | Courier (`courier`) | Admin (`admin`) |
|---|---|---|---|
| Create order | ✅ | ❌ | ✅ |
| View own orders | ✅ | ❌ | ✅ |
| View assigned deliveries | ❌ | ✅ | ✅ |
| Update delivery status | ❌ | ✅ | ✅ |
| View wallet | ✅ | ✅ | ✅ |
| Top up wallet | ✅ | ✅ | ✅ |
| View invoices | ✅ | ❌ | ✅ |
| View all users | ❌ | ❌ | ✅ |
| Manage drivers | ❌ | ❌ | ✅ |
| Manage vehicles | ❌ | ✅ (own) | ✅ |
| Update notification prefs | ✅ | ✅ | ✅ |
| Create support ticket | ✅ | ✅ | ✅ |

### 6.2 Access Rules (Convex)

```
// Orders: sender can read own, courier can read assigned, admin reads all
orders.read: senderId === userId OR courierId === userId OR role === "admin"

// Deliveries: courier reads own, customer reads linked order's delivery
deliveries.read: courierId === userId OR order.senderId === userId OR role === "admin"

// Wallets: owner only
wallets.read/write: userId === wallet.userId

// Transactions: wallet owner only
transactions.read: wallet.userId === userId

// Notifications: recipient only
notifications.read/write: userId === notification.userId

// Business data: owner or member
businesses.read: ownerUserId === userId OR user.businessId === businessId

// Driver profiles: own profile or admin
driver_profiles.read/write: userId === profile.userId OR role === "admin"
```

### 6.3 Guest Access

The frontend currently supports a `sessionStorage`-based guest bypass (`lasha_guest`). This should be replaced with proper anonymous auth or removed before production.

---

## 7. Required Database Relationships

```
users ──────────┬── businesses (1:N via ownerUserId)
                ├── addresses (1:N via userId)
                ├── orders (1:N via senderId)
                ├── wallets (1:1 via userId)
                ├── driver_profiles (1:1 via userId)
                ├── vehicles (1:N via ownerId)
                ├── notifications (1:N via userId)
                ├── notification_preferences (1:1 via userId)
                ├── reviews (1:N via reviewerId)
                ├── invoices (1:N via userId)
                ├── support_tickets (1:N via userId)
                └── sessions (managed by Convex Auth)

businesses ─────┬── users (N:1 via ownerUserId)
                ├── orders (1:N via businessId)
                └── invoices (1:N via businessId)

orders ─────────┬── addresses (2x N:1 via pickupAddressId, dropoffAddressId)
                ├── deliveries (1:1 via orderId)
                ├── tracking_events (1:N via orderId)
                ├── transactions (1:N via orderId)
                ├── invoices (1:N via orderId)
                ├── reviews (1:1 via orderId)
                └── proof_of_delivery (1:1 via orderId)

deliveries ─────┬── users (N:1 via courierId)
                ├── vehicles (N:1 via vehicleId — TODO: add to schema)
                ├── tracking_events (1:N via deliveryId)
                └── proof_of_delivery (1:1 via deliveryId)

vehicles ──────── users (N:1 via ownerId)

wallets ───────── transactions (1:N via walletId)
```

---

## 8. Required External Integrations

### 8.1 Payment Gateway

**Needed by:** Wallet top-up, Make Payment, Order pricing, Invoices

| Service | Purpose | Priority |
|---|---|---|
| **Yoco** | South African card payments, EFT | High |
| **PayFast** | EFT, SnapScan, SCode | High |
| **Ozow** | Instant EFT | Medium |

**Env vars needed:** `YOCO_SECRET_KEY`, `PAYFAST_MERCHANT_ID`, `PAYFAST_MERCHANT_KEY`

### 8.2 SMS Gateway

**Needed by:** OTP fallback, delivery notifications, driver alerts

| Service | Purpose | Priority |
|---|---|---|
| **Clickatell** | SMS for South Africa | High |
| **BulkSMS** | Alternative SMS provider | Medium |

**Env vars needed:** `CLICKATELL_API_KEY`

### 8.3 Email Service

**Needed by:** OTP delivery (currently via freebuff.app), invoices, marketing

| Service | Purpose | Priority |
|---|---|---|
| **freebuff.app** | Current OTP sender (already configured) | Active |
| **Resend** | Transactional emails (invoices, receipts) | High |

**Env vars needed:** `RESEND_API_KEY`

### 8.4 Maps & Geocoding

**Needed by:** Address autocomplete, route visualization, driver tracking, pricing

| Service | Purpose | Priority |
|---|---|---|
| **Google Maps Platform** | Geocoding, directions, distance matrix | High |
| **Mapbox** | Alternative mapping | Medium |

**Env vars needed:** `GOOGLE_MAPS_API_KEY`

### 8.5 Push Notifications

**Needed by:** Real-time driver alerts, delivery status, notifications page

| Service | Purpose | Priority |
|---|---|---|
| **Firebase Cloud Messaging** | Web push notifications | High |

**Env vars needed:** `FIREBASE_VAPID_KEY`, `FIREBASE_CONFIG`

### 8.6 File Storage

**Needed by:** Vehicle images, driver avatars, proof of delivery photos, documents

| Service | Purpose | Priority |
|---|---|---|
| **Convex File Storage** | Built-in, sufficient for MVP | High |
| **Cloudinary** | Image optimization (optional) | Low |

### 8.7 Pricing Engine

**Needed by:** Request Delivery quote, invoice generation

| Component | Purpose | Priority |
|---|---|---|
| **Internal pricing function** | Distance-based + weight-based + expedition tier | High |
| **Rate cards** | Standard vs Express pricing per km/kg | High |

---

## 9. Existing Mocks That Must Be Replaced

### 9.1 `src/data/orders.ts` — FULL REPLACEMENT NEEDED

Currently exports 4 hardcoded orders with nested pickup, dropoff, vehicle, driver, and customer data. Every dashboard component reads from this file.

**Current interfaces:**
```typescript
Order {
  id: string
  status: "In Transit" | "Pending"
  pickup: { name, address, date, time }
  dropoff: { name, address }
  vehicle: { registration, capacity, breaking, express, flammable, trailer, time }
  driver: { name, license, phone, rating, trips }
  customer: { name, company, email, phone }
}
```

**Replacement:** Convex query `orders.list` returning joined data from orders + addresses + vehicles + driver_profiles + users.

### 9.2 `TrackDelivery.tsx` trackingData — REPLACEMENT NEEDED

Hardcoded `trackingData` record with tracking ID `HY257845U4`, steps, sender/receiver, driver, and package details.

**Replacement:** Convex query `tracking_events.getByTrackingId` + `orders.get` + `driver_profiles.getByOrder`.

### 9.3 `Wallet.tsx` transactions — REPLACEMENT NEEDED

Hardcoded 6-item transaction array with inline balance.

**Replacement:** Convex queries `wallets.getBalance` + `transactions.list`.

### 9.4 `Wallet.tsx` balance — REPLACEMENT NEEDED

Hardcoded `balance = 15450`.

**Replacement:** Convex query `wallets.getBalance`.

### 9.5 `Invoices.tsx` invoices — REPLACEMENT NEEDED

Hardcoded 6-item invoice array.

**Replacement:** Convex query `invoices.list`.

### 9.6 `Notifications.tsx` notifications — REPLACEMENT NEEDED

Hardcoded 6-item notification array.

**Replacement:** Convex query `notifications.list`.

### 9.7 `Downloads.tsx` documents — REPLACEMENT NEEDED

Hardcoded 8-item document array.

**Replacement:** Convex query `documents.list`.

### 9.8 `Help.tsx` helpTopics — STATIC (acceptable)

Hardcoded 6 help topic cards. These are marketing content and can remain static.

### 9.9 `Legal.tsx` content — STATIC (acceptable)

Static legal text. Can remain as-is or be moved to CMS.

### 9.10 `Settings.tsx` form values — REPLACEMENT NEEDED

Hardcoded profile/business/notification/security values. User edits are local state only with no persistence.

**Replacement:** Convex queries for initial data + mutations for save.

### 9.11 `PastDeliveries.tsx` data — REPLACEMENT NEEDED

Hardcoded 6-row delivery history table.

**Replacement:** Convex query `orders.list` filtered by status=delivered + senderId.

### 9.12 `RequestDelivery.tsx` form — REPLACEMENT NEEDED

Form captures data but `onSubmit` is `e.preventDefault()` — no backend call.

**Replacement:** Convex mutation `orders.create` with validation.

### 9.13 `MakePayment.tsx` — REPLACEMENT NEEDED

Payment method selection + amount input with no backend integration.

**Replacement:** Action `actions.payment.processTopUp` or `actions.payment.processOrderPayment`.

### 9.14 `VehiclePanel.tsx` image — REPLACEMENT NEEDED

Uses Unsplash placeholder image. Needs real vehicle images from `vehicles.image`.

---

## 10. Technical Inconsistencies & Architectural Risks

### 10.1 Status Enum Mismatch

**Risk: HIGH**

The Convex schema defines statuses as:
```
"pending" | "confirmed" | "picking_up" | "in_transit" | "delivered" | "cancelled"
```

The frontend mock data uses:
```
"In Transit" | "Pending"
```

The Track Delivery stepper uses:
```
"order_placed" | "picked_up" | "in_transit" | "delivered"
```

**Action needed:** Define a single canonical status enum shared between frontend and backend. The schema version is the most complete and should be the source of truth. Frontend display labels should map from schema values.

### 10.2 Missing `vehicleId` on Deliveries

**Risk: HIGH**

The UI shows vehicle details per order, but the `deliveries` table has no `vehicleId` field. The vehicle is currently hardcoded in mock data.

**Action needed:** Add `vehicleId: v.optional(v.id("vehicles"))` to the `deliveries` table.

### 10.3 No Wallet Table

**Risk: HIGH**

The Wallet page displays balance and transactions, but no `wallets` table exists in the schema. No mechanism exists to track user funds.

**Action needed:** Create `wallets` and `transactions` tables.

### 10.4 No Invoice Table

**Risk: HIGH**

The Invoices page filters by status, but no `invoices` table exists.

**Action needed:** Create `invoices` table.

### 10.5 No Notification Table

**Risk: MEDIUM**

The Notifications page and sidebar badge require a notifications table. The `hasNotif: true` flag on the sidebar is hardcoded.

**Action needed:** Create `notifications` table + reactive unread count query.

### 10.6 No Tracking Events Table

**Risk: HIGH**

The Track Delivery page shows a 4-step progress stepper with timestamps. This requires a `tracking_events` table linked to orders.

**Action needed:** Create `tracking_events` table with `trackingId` index.

### 10.7 No Proof of Delivery

**Risk: MEDIUM**

The tracking workflow implies delivery completion requires recipient confirmation. No POD mechanism exists.

**Action needed:** Create `proof_of_delivery` table.

### 10.8 Price is Static

**Risk: MEDIUM**

The `orders.price` field exists in the schema but no pricing engine or rate calculation is implemented. The Request Delivery form doesn't calculate or display a quote.

**Action needed:** Implement distance/weight-based pricing calculation as a Convex action.

### 10.9 No Payment Integration

**Risk: HIGH**

Wallet top-up, Make Payment, and order payment all lack backend payment processing. The "Continue" button in the top-up modal is a no-op.

**Action needed:** Integrate Yoco or PayFast for ZAR payments.

### 10.10 Business Registration Number Not Validated

**Risk: LOW**

Settings business tab stores a registration number (`2024/123456/07`) with no CIPC validation.

**Action needed:** Optional — validate against CIPC API or format regex.

### 10.11 No Email/SMS Sending for Notifications

**Risk: MEDIUM**

Settings has toggles for email, SMS, and push notifications, but no sending infrastructure exists beyond the OTP email via freebuff.app.

**Action needed:** Integrate Resend (email), Clickatell (SMS), and FCM (push).

### 10.12 Guest Access Bypass

**Risk: LOW (dev only)**

`sessionStorage("lasha_guest")` bypasses auth entirely. This must be removed or replaced with proper anonymous auth before production.

**Action needed:** Either remove guest bypass or gate it behind `process.env.NODE_ENV === "development"`.

### 10.13 No Driver App / Mobile View

**Risk: MEDIUM**

The current UI is a customer/business dashboard. Couriers need a separate mobile-optimized interface for accepting deliveries, updating status, capturing POD, and sharing location.

**Action needed:** Plan courier-facing mobile web app or PWA in a future phase.

### 10.14 No Admin Panel

**Risk: MEDIUM**

The `admin` role exists in the schema but no admin interface is built. Admin needs: user management, driver approval, order oversight, pricing configuration, document management.

**Action needed:** Plan admin dashboard in a future phase.

### 10.15 `deliveries` Table Lacks `vehicleId`

**Risk: HIGH**

Already noted in 10.2 but worth emphasizing: the vehicle details shown in the dashboard detail panel have no foreign key to link a delivery to its vehicle. This is a schema migration that must happen before the backend is wired up.

### 10.16 No Geo-Indexing

**Risk: MEDIUM**

Address coordinates (`lat`/`lng`) exist on the `addresses` table but there's no spatial index for proximity queries (finding nearby drivers, route optimization).

**Action needed:** Convex doesn't natively support geo-indexing. Implement a bounding-box query pattern or use a separate geospatial service.

### 10.17 Currency Handling

**Risk: LOW**

The Wallet page formats as ZAR with `Intl.NumberFormat`. All monetary amounts should be stored in ZAR cents (integer) to avoid floating-point issues. The schema `orders.price` is `v.number()` which is fine but must be documented as cents.

**Action needed:** Document that all `price`/`amount`/`balance` fields store cents.

---

## Appendix A: Mock-to-Backend Mapping Matrix

| UI Component | Current Mock Source | Required Backend |
|---|---|---|
| `Dashboard → OrderPanel` | `src/data/orders.ts` | `orders.list` query |
| `Dashboard → OrderCard` | `src/data/orders.ts` | `orders.list` with joined addresses |
| `Dashboard → DetailsPanel` | `src/data/orders.ts` | `orders.get` + `vehicles.get` + `driver_profiles.get` |
| `Dashboard → VehiclePanel` | `src/data/orders.ts` → `vehicle` | `vehicles.get` |
| `Dashboard → DriverDetailsTab` | `src/data/orders.ts` → `driver` | `driver_profiles.get` |
| `Dashboard → CustomerDetailsTab` | `src/data/orders.ts` → `customer` | `users.getProfile` |
| `Dashboard → OrderDetailsTab` | `src/data/orders.ts` | `orders.get` with addresses |
| `RequestDelivery → form` | Local state, no submit | `orders.create` mutation |
| `TrackDelivery → trackingResult` | Inline `trackingData` | `tracking_events.getByTrackingId` |
| `TrackDelivery → driver card` | Inline `trackingData` | `driver_profiles.getByOrder` |
| `Wallet → balance` | `balance = 15450` | `wallets.getBalance` query |
| `Wallet → transactions` | Inline `transactions[]` | `transactions.list` query |
| `Wallet → top-up modal` | No-op onClick | `wallets.topUp` mutation |
| `Invoices → table` | Inline `invoices[]` | `invoices.list` query |
| `Notifications → list` | Inline `notifications[]` | `notifications.list` query |
| `Notifications → badge` | Hardcoded `hasNotif: true` | `notifications.unreadCount` query |
| `PastDeliveries → table` | Inline `pastDeliveries[]` | `orders.list` (status=delivered) |
| `Settings → profile` | Hardcoded form values | `users.getProfile` + `users.updateProfile` |
| `Settings → business` | Hardcoded form values | `businesses.get` + `businesses.update` |
| `Settings → notifications` | Hardcoded toggles | `notification_preferences.get` + `.update` |
| `Settings → security` | No-op password form | Convex Auth password methods (TBD) |
| `Downloads → list` | Inline `downloads[]` | `documents.list` query |
| `Help → topics` | Inline `helpTopics[]` | Static (acceptable) |
| `Legal → content` | Inline JSX | Static (acceptable) |
| `MakePayment → form` | No-op confirm button | `actions.payment.process*` |

---

## Appendix B: Implementation Phase Recommendations

### Phase 1: Core Data Layer (Week 1-2)
- Add missing schema tables: `vehicles`, `driver_profiles`, `wallets`, `transactions`, `invoices`, `notifications`, `tracking_events`, `notification_preferences`, `documents`
- Add `vehicleId` to `deliveries` table
- Define canonical status enum
- Implement Convex queries for all read operations
- Implement Convex mutations for all write operations
- Replace all mock data with live Convex queries

### Phase 2: Order Lifecycle (Week 2-3)
- `orders.create` mutation with validation
- `orders.updateStatus` with state machine logic
- `tracking_events.create` on status change
- `notifications.create` on key events
- Request Delivery form → backend integration
- Dashboard → live order data
- Track Delivery → live tracking data

### Phase 3: Payments & Wallet (Week 3-4)
- Wallet creation on user registration
- Payment gateway integration (Yoco/PayFast)
- Wallet top-up flow
- Order payment deduction
- Invoice generation
- Transaction history

### Phase 4: Real-Time & Notifications (Week 4-5)
- Real-time order status updates via Convex reactivity
- Notification delivery (email, SMS, push)
- Unread notification badge
- Notification preferences persistence
- Settings save functionality

### Phase 5: Courier Features (Week 5-6)
- Driver profile management
- Vehicle registration
- Delivery acceptance/decline
- Status update workflow
- GPS location sharing
- Proof of delivery capture

### Phase 6: Admin & Operations (Week 6-8)
- Admin dashboard
- User/driver management
- Order oversight
- Pricing configuration
- Document management
- Support ticket system
- Analytics/reporting

---

*This document is the canonical source of truth for Lasha backend implementation. Update it as architectural decisions are made or requirements evolve.*
