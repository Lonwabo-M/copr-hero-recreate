# Lasha Backend-UI Contract

> **Canonical specification** — This document maps every UI feature to the backend capability it requires. All subsequent implementation phases reference this as the source of truth.

---

## Table of Contents

1. [Existing Frontend Architecture](#1-existing-frontend-architecture)
2. [Existing Data Models](#2-existing-data-models)
3. [Required Backend Entities](#3-required-backend-entities)
4. [Required API Endpoints](#4-required-api-endpoints)
5. [Required Real-Time Events](#5-required-real-time-events)
6. [Required Authentication/Authorization Rules](#6-required-authenticationauthorization-rules)
7. [Required Database Relationships](#7-required-database-relationships)
8. [Required External Integrations](#8-required-external-integrations)
9. [Existing Mocks That Must Be Replaced](#9-existing-mocks-that-must-be-replaced)
10. [Technical Inconsistencies & Architectural Risks](#10-technical-inconsistencies--architectural-risks)

---

## 1. Existing Frontend Architecture

### 1.1 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Build | Vite | 7.2.6 |
| UI Framework | React | 19.2.0 |
| Routing | React Router | 7.10.0 |
| Styling | Tailwind CSS | 4.1.17 |
| Components | shadcn/ui + Radix UI | — |
| Animation | Framer Motion | 12.23.25 |
| Icons | Lucide React | 0.555.0 |
| Forms | React Hook Form + Zod | 7.67.0 / 4.1.13 |
| Backend | Convex | 1.30.0 |
| Auth | @convex-dev/auth | 0.0.90 |
| State | Convex queries (reactive) | — |

### 1.2 Route Map

Routes are grouped into role-specific application areas (see
`docs/frontend-architecture.md`): Customer Portal, Driver App, Operations
Centre. Each protected route is wrapped in `RoleGate`, which layers role-aware
area checks on top of `RequireAuth`. Convex remains the authoritative
authorization boundary.

| Route | Area | Page Component | Auth Required | Description |
|-------|------|---------------|---------------|-------------|
| `/` | — | `Landing.tsx` | No | Marketing landing page |
| `/auth` | — | `Auth.tsx` | No | Email OTP sign-in (honours `?returnTo=`) |
| `/post-auth` | — | `PostAuthRedirect.tsx` | Yes | Role-aware post-auth redirect |
| `/dashboard` | Customer | `Dashboard.tsx` | Yes | Activity Center — order management |
| `/request-delivery` | Customer | `RequestDelivery.tsx` | Yes | Create new delivery request |
| `/checkout/:orderId` | Customer | `Checkout.tsx` | Yes | Order-scoped review and payment |
| `/track-delivery` | Customer | `TrackDelivery.tsx` | Yes | Track shipment by ID |
| `/wallet` | Customer | `Wallet.tsx` | Yes | Wallet balance, transactions, top-up |
| `/settings` | Customer | `Settings.tsx` | Yes | Profile, business, notifications, security |
| `/past-deliveries` | Customer | `PastDeliveries.tsx` | Yes | Order history table |
| `/invoices` | Customer | `Invoices.tsx` | Yes | Invoice management |
| `/make-payment` | — | `LegacyPaymentRedirect.tsx` | — | Forwards old Paystack references to `/checkout/:orderId`; otherwise redirects to dashboard |
| `/notifications` | Customer | `Notifications.tsx` | Yes | Notification center |
| `/help` | Customer | `Help.tsx` | Yes | Help center (static) |
| `/legal` | Customer | `Legal.tsx` | Yes | Legal documents (static) |
| `/downloads` | Customer | `Downloads.tsx` | Yes | Document downloads (static) |
| `/driver` | Driver | `DriverHome.tsx` | Yes + driver | Driver App home |
| `/driver/active-delivery` | Driver | `DriverActiveDelivery.tsx` | Yes + driver | Active delivery workflow (incl. POD + GPS tracking) |
| `/operations` | Operations | `OperationsCentre.tsx` | Yes + ops | Dispatch overview, live map, drivers, exceptions |
| `*` | — | `NotFound.tsx` | No | 404 page |

### 1.3 Component Architecture

```
src/
├── main.tsx                    # App bootstrap, ConvexAuthProvider, BrowserRouter
├── components/
│   ├── RequireAuth.tsx         # Auth guard (redirects to /auth?returnTo=...)
│   ├── shells/                 # Role-specific application shells
│   │   ├── navigation.ts       # Area-scoped navigation configs (4 areas)
│   │   ├── roleAccess.ts       # Role→area mapping + access checks
│   │   ├── RoleGate.tsx        # Role-aware route guard (on top of RequireAuth)
│   │   ├── AppShell.tsx        # Shared Lasha chrome (topnav + area sidebar)
│   │   ├── CustomerShell.tsx   # Customer Portal shell
│   │   ├── DriverShell.tsx     # Driver App shell
│   │   ├── OperationsShell.tsx # Operations Centre shell
│   │   └── AdminShell.tsx      # Admin shell (no pages yet — reserved)
│   ├── dashboard/              # Dashboard-specific components
│   │   ├── TopNavigation.tsx   # Top nav bar
│   │   ├── Sidebar.tsx         # Left sidebar navigation
│   │   ├── OrderPanel.tsx      # Order list container
│   │   ├── OrderCard.tsx       # Individual order card
│   │   ├── OrderFilters.tsx    # Status filter tabs
│   │   ├── SearchBar.tsx       # Search input
│   │   ├── DetailsPanel.tsx    # Order details container
│   │   ├── DetailTabs.tsx      # Tab navigation (Vehicle, Driver, Customer)
│   │   ├── OrderDetailsTab.tsx # Order info tab
│   │   ├── VehiclePanel.tsx    # Vehicle details tab
│   │   ├── DriverDetailsTab.tsx # Driver info tab
│   │   ├── CustomerDetailsTab.tsx # Customer info tab
│   │   └── SpecificationCard.tsx # Reusable spec display card
│   ├── lasha/                  # Landing page components
│   │   ├── Navbar.tsx
│   │   ├── Hero.tsx
│   │   ├── WhyLasha.tsx
│   │   ├── WhoWeServe.tsx
│   │   ├── HowItWorks.tsx
│   │   ├── About.tsx
│   │   ├── SectorIntelligence.tsx
│   │   ├── FAQ.tsx
│   │   ├── FinalCTA.tsx
│   │   └── Footer.tsx
│   └── ui/                     # shadcn/ui primitives (50+ components)
├── pages/                      # Route-level page components
├── hooks/
│   ├── use-auth.ts             # Auth hook (Convex auth + user query)
│   ├── use-mobile.ts           # Responsive detection
│   └── useDashboardNav.ts      # Sidebar navigation + sign-out
├── data/
│   └── orders.ts               # MOCK DATA (to be replaced)
├── styles/                     # CSS files
├── lib/
│   └── utils.ts                # cn() utility
└── convex/                     # Backend (Convex)
```

### 1.4 Auth Flow

1. User enters email on `/auth`
2. Convex sends OTP via `auth.freebuff.app`
3. User enters 6-digit code
4. Convex validates and issues JWT
5. `RequireAuth` checks `isAuthenticated` and renders protected route
6. Dev bypass: `?dev=true` or `?guest=true` URL param, or `sessionStorage("lasha_guest")`

---

## 2. Existing Data Models

### 2.1 Convex Schema (Current)

```typescript
// FROM: src/convex/schema.ts

// Auth tables (from @convex-dev/auth)
authTables // Do not modify

// Users
users: {
  name: optional(string)
  image: optional(string)
  email: optional(string)
  emailVerificationTime: optional(number)
  isAnonymous: optional(boolean)
  role: optional(admin | user | member | business | courier)
  phone: optional(string)
  businessId: optional(id("businesses"))
} // Index: email

// Businesses
businesses: {
  name: string
  ownerUserId: id("users")
  industry: optional(string)
  phone: optional(string)
  address: optional(string)
  createdAt: number
} // Index: by_owner

// Addresses
addresses: {
  userId: id("users")
  label: string                    // "Home", "Office", "Warehouse"
  street: string
  city: string
  state: optional(string)
  zip: string
  lat: optional(number)
  lng: optional(number)
  isDefault: optional(boolean)
} // Index: by_user

// Orders
orders: {
  senderId: id("users")
  businessId: optional(id("businesses"))
  pickupAddressId: id("addresses")
  dropoffAddressId: id("addresses")
  status: pending | confirmed | picking_up | in_transit | delivered | cancelled
  description: optional(string)
  packageSize: small | medium | large
  price: number
  scheduledTime: optional(number)
  createdAt: number
  updatedAt: number
} // Indexes: by_sender, by_status, by_business

// Deliveries
deliveries: {
  orderId: id("orders")
  courierId: optional(id("users"))
  status: pending | confirmed | picking_up | in_transit | delivered | cancelled
  pickupLat: optional(number)
  pickupLng: optional(number)
  dropoffLat: optional(number)
  dropoffLng: optional(number)
  estimatedArrival: optional(number)
  actualArrival: optional(number)
  startedAt: optional(number)
  completedAt: optional(number)
} // Indexes: by_order, by_courier

// Reviews
reviews: {
  orderId: id("orders")
  reviewerId: id("users")
  courierId: id("users")
  rating: number                   // 1-5
  comment: optional(string)
  createdAt: number
} // Indexes: by_order, by_courier
```

### 2.2 Role System

```typescript
ROLES = {
  ADMIN: "admin"       // Full system access
  USER: "user"         // Basic customer
  MEMBER: "member"     // Team member within a business
  BUSINESS: "business" // Business account owner
  COURIER: "courier"   // Driver/delivery person
}
```

### 2.3 Order Status Flow

```
pending → confirmed → picking_up → in_transit → delivered
   ↓           ↓          ↓            ↓
cancelled   cancelled  cancelled    cancelled
```

---

## 3. Required Backend Entities

### 3.1 Entities Required by UI

| Entity | Required By | Status | Notes |
|--------|------------|--------|-------|
| `users` | All protected pages | ✅ Exists | Needs profile update mutations |
| `businesses` | Settings (Business tab) | ✅ Exists | Needs CRUD mutations |
| `addresses` | Request Delivery | ✅ Exists | Needs CRUD mutations |
| `orders` | Dashboard, Past Deliveries | ✅ Exists | Needs full CRUD + status transitions |
| `deliveries` | Dashboard, Track Delivery | ✅ Exists | Needs assignment + tracking |
| `reviews` | (Future) | ✅ Exists | Not yet used in UI |
| `vehicles` | Dashboard (Vehicle tab) | ❌ Missing | **Required** |
| `driver_profiles` | Dashboard (Driver tab) | ❌ Missing | **Required** |
| `wallets` | Wallet page | ❌ Missing | **Required** |
| `transactions` | Wallet page | ❌ Missing | **Required** |
| `invoices` | Invoices page | ❌ Missing | **Required** |
| `notifications` | Notifications page | ❌ Missing | **Required** |
| `notification_preferences` | Settings (Notifications) | ❌ Missing | **Required** |
| `tracking_events` | Track Delivery | ❌ Missing | **Required** |
| `driver_locations` | Real-time tracking | ❌ Missing | **Required** |
| `pricing_rules` | Request Delivery | ❌ Missing | **Required** |
| `documents` | Downloads page | ❌ Missing | Static or file storage |
| `support_tickets` | Help page | ❌ Missing | Optional |

### 3.2 New Tables Needed

#### `vehicles`
```typescript
vehicles: {
  id: id("vehicles")
  driverId: id("users")
  registration: string           // "FR35C0 GP"
  make: string                   // "Toyota"
  model: string                  // "Quantum"
  year: optional(number)
  capacity: number               // kg
  breaking: boolean              // has breaking system
  express: boolean               // can do express deliveries
  flammable: boolean             // can carry flammable goods
  trailer: boolean               // has trailer
  isActive: boolean
  createdAt: number
} // Indexes: by_driver, by_registration
```

#### `driver_profiles`
```typescript
driver_profiles: {
  id: id("driver_profiles")
  userId: id("users")
  licenseClass: string           // "B Code 08", "C Code 10"
  licenseNumber: optional(string)
  rating: number                 // 0-5
  totalTrips: number
  isAvailable: boolean
  currentLat: optional(number)
  currentLng: optional(number)
  lastLocationUpdate: optional(number)
  createdAt: number
} // Index: by_user
```

#### `wallets`
```typescript
wallets: {
  id: id("wallets")
  userId: id("users")
  balance: number                // in cents (ZAR)
  currency: string               // "ZAR"
  isActive: boolean
  createdAt: number
  updatedAt: number
} // Index: by_user
```

#### `transactions`
```typescript
transactions: {
  id: id("transactions")
  walletId: id("wallets")
  type: credit | debit
  amount: number                 // in cents
  description: string
  reference: optional(string)    // "TOP-20260901-001"
  status: completed | pending | failed
  orderId: optional(id("orders"))
  createdAt: number
} // Indexes: by_wallet, by_status, by_order
```

#### `invoices`
```typescript
invoices: {
  id: id("invoices")
  businessId: optional(id("businesses"))
  userId: id("users")
  invoiceNumber: string          // "INV-2024-001"
  amount: number                 // in cents
  status: paid | pending | cancelled
  dueDate: optional(number)
  paidAt: optional(number)
  createdAt: number
} // Indexes: by_business, by_user, by_status
```

#### `notifications`
```typescript
notifications: {
  id: id("notifications")
  userId: id("users")
  type: delivery | payment | alert
  title: string
  description: string
  isRead: boolean
  entityId: optional(string)     // related order/invoice ID
  createdAt: number
} // Indexes: by_user, by_user_unread
```

#### `notification_preferences`
```typescript
notification_preferences: {
  id: id("notification_preferences")
  userId: id("users")
  emailNotifications: boolean
  smsNotifications: boolean
  pushNotifications: boolean
  deliveryUpdates: boolean
  marketingEmails: boolean
} // Index: by_user (unique)
```

#### `tracking_events`
```typescript
tracking_events: {
  id: id("tracking_events")
  deliveryId: id("deliveries")
  type: order_placed | picked_up | in_transit | delivered | location_update
  lat: optional(number)
  lng: optional(number)
  timestamp: number
  metadata: optional(string)     // JSON string for extra data
} // Indexes: by_delivery, by_delivery_time
```

#### `pricing_rules`
```typescript
pricing_rules: {
  id: id("pricing_rules")
  name: string
  packageSize: small | medium | large
  expeditionType: standard | express | same_day
  basePrice: number              // in cents
  pricePerKm: number
  pricePerKg: number
  isActive: boolean
  createdAt: number
} // Indexes: by_size_expedition
```

---

## 4. Required API Endpoints

### 4.1 Dashboard (Activity Center)

| Endpoint | Type | Source | Required Data |
|----------|------|--------|---------------|
| `getOrders` | Query | Mock `orders` | Orders list with status, pickup, dropoff |
| `getOrderById` | Query | Mock `orders` | Single order with all details |
| `updateOrderStatus` | Mutation | — | Status transition with validation |
| `searchOrders` | Query | — | Search by ID, customer, location |
| `filterOrders` | Query | — | Filter by status |

### 4.2 Request Delivery

| Endpoint | Type | Source | Required Data |
|----------|------|--------|---------------|
| `createOrder` | Mutation | — | Full order creation |
| `getUserAddresses` | Query | — | Saved addresses for dropdown |
| `calculatePrice` | Query | — | Price quote based on params |
| `getParcelTypes` | Query | — | Parcel type options |
| `getExpeditionTypes` | Query | — | Expedition type options |

**Request Delivery Form Fields:**
```
- orderName: string (required)
- parcelType: document | small_parcel | large_parcel | pallet (required)
- expeditionType: standard | express | same_day (required)
- width: number (cm) (required)
- height: number (cm) (required)
- weight: number (kg) (required)
- pickupLocation: string (required)
- dropoffLocation: string (required)
- scheduleDate: date (required)
- timeFrom: HH:MM (required)
- timeTo: HH:MM (required)
```

### 4.3 Track Delivery

| Endpoint | Type | Source | Required Data |
|----------|------|--------|---------------|
| `getTrackingByNumber` | Query | Mock `trackingData` | Tracking ID lookup |
| `getDeliveryTracking` | Query | — | Full tracking info |
| `getTrackingSteps` | Query | — | Status timeline |
| `getDriverInfo` | Query | — | Assigned driver details |

**Tracking Data Structure:**
```typescript
{
  trackingId: string
  status: string
  steps: Array<{
    label: string
    time: string
    status: "completed" | "active" | "pending"
  }>
  sender: { name, address, city }
  receiver: { name, address, city }
  driver: { name, avatar }
  deliveryType: string
  weight: string
  dimensions: string
  estimatedArrival: string
  lastUpdated: string
}
```

### 4.4 Wallet

| Endpoint | Type | Source | Required Data |
|----------|------|--------|---------------|
| `getWalletBalance` | Query | Mock `balance` | Current balance (ZAR) |
| `getTransactions` | Query | Mock `transactions` | Transaction history |
| `filterTransactions` | Query | — | Filter by credit/debit |
| `topUpWallet` | Mutation | — | Add funds to wallet |
| `getWalletSummary` | Query | — | Balance + recent activity |

**Transaction Structure:**
```typescript
{
  id: string
  type: "credit" | "debit"
  amount: number
  description: string
  date: string
  status: "completed" | "pending" | "failed"
  reference: string
}
```

### 4.5 Settings

| Endpoint | Type | Source | Required Data |
|----------|------|--------|---------------|
| `getUserProfile` | Query | Convex `users` | Profile data |
| `updateUserProfile` | Mutation | — | Profile updates |
| `getBusinessInfo` | Query | Convex `businesses` | Business data |
| `updateBusinessInfo` | Mutation | — | Business updates |
| `getNotificationPreferences` | Query | — | Notification settings |
| `updateNotificationPreferences` | Mutation | — | Notification updates |
| `changePassword` | Action | Convex Auth (`auth.passwordChange`) | currentPassword, newPassword |
| `enableTwoFactor` | Mutation | — | 2FA setup |

**Settings Tabs:**
1. **Profile**: firstName, lastName, email, phone, address, avatar
2. **Business**: companyName, companyEmail, companyPhone, companyAddress, companyReg
3. **Notifications**: emailNotifications, smsNotifications, pushNotifications, deliveryUpdates, marketingEmails
4. **Security**: currentPassword, newPassword, confirmPassword, twoFactor, activeSessions

### 4.6 Past Deliveries

| Endpoint | Type | Source | Required Data |
|----------|------|--------|---------------|
| `getPastDeliveries` | Query | Mock `pastDeliveries` | Order history |
| `getDeliveryDetails` | Query | — | Single delivery details |

**Past Deliveries Structure:**
```typescript
{
  id: string           // "ORD-54321"
  date: string         // "28 Aug 2025"
  from: string         // "Sandton City"
  to: string           // "Rosebank Mall"
  status: "completed" | "cancelled"
  driver: string       // "Sipho M."
  amount: string       // "R145.00"
}
```

### 4.7 Invoices

| Endpoint | Type | Source | Required Data |
|----------|------|--------|---------------|
| `getInvoices` | Query | Mock `invoices` | Invoice list |
| `filterInvoices` | Query | — | Filter by status |
| `getInvoiceById` | Query | — | Single invoice |
| `downloadInvoice` | Action | — | PDF generation |

**Invoice Structure:**
```typescript
{
  id: string           // "INV-2024-001"
  date: string         // "30 Aug 2025"
  client: string       // "TechCorp SA"
  amount: string       // "R4,250.00"
  status: "paid" | "pending" | "cancelled"
}
```

### 4.8 Checkout Payment

Payment is order-scoped at `/checkout/:orderId`; there is no standalone
payment page. Card fields post directly to Paystack with the secret key kept
server-side, or the customer can continue to Paystack hosted checkout. Wallet
payment debits the authenticated customer's Lasha wallet atomically.

| Endpoint | Type | Purpose |
|----------|------|---------|
| `payments.queries.getMyPaymentOverview` | Query | Customer-scoped payment state per order |
| `payments.actions.chargeOrderPaymentWithCard` | Action | Inline card charge (server-side only) |
| `payments.actions.submitPaymentOtp` | Action | Complete a bank OTP challenge |
| `payments.actions.initiateOrderPayment` | Action | Start Paystack hosted checkout |
| `payments.actions.verifyOrderPayment` | Action | Verify the provider return reference |
| `payments.actions.payOrderWithWallet` | Action | Pay the stored order amount from the wallet |

**Payment Methods:**
- Credit/Debit Card (inline or Paystack hosted)
- Lasha Wallet

EFT and SnapScan are not exposed: the previous standalone page listed them
without configuring the corresponding Paystack channels, so they only opened
the same card checkout.

### 4.9 Notifications

| Endpoint | Type | Source | Required Data |
|----------|------|--------|---------------|
| `getNotifications` | Query | Mock `notifications` | Notification list |
| `markAsRead` | Mutation | — | Mark single notification read |
| `markAllAsRead` | Mutation | — | Mark all read |
| `getUnreadCount` | Query | — | Badge count |

**Notification Structure:**
```typescript
{
  id: number
  type: "delivery" | "payment" | "alert"
  title: string
  description: string
  time: string
  unread: boolean
}
```

### 4.10 Static Pages

| Page | Backend Required | Notes |
|------|-----------------|-------|
| Help | No | Static content |
| Legal | No | Static content |
| Downloads | No | Static file links |
| Landing | No | Static marketing |

---

## 5. Required Real-Time Events

### 5.1 Convex Reactive Queries

| Feature | Query | Update Trigger |
|---------|-------|----------------|
| Order status changes | `getOrders` | Status mutation |
| Delivery tracking | `getDeliveryTracking` | Location update |
| Notification badge | `getUnreadCount` | New notification |
| Wallet balance | `getWalletBalance` | Transaction |
| Driver availability | `getAvailableDrivers` | Availability toggle |

### 5.2 Location Updates

```typescript
// Driver reports location
reportLocation: mutation({
  lat: number,
  lng: number,
  deliveryId: optional(id("deliveries"))
})
```

### 5.3 Status Transitions

```typescript
// Order status flow
updateOrderStatus: mutation({
  orderId: id("orders"),
  status: orderStatus  // validated transition
})

// Delivery status flow
updateDeliveryStatus: mutation({
  deliveryId: id("deliveries"),
  status: orderStatus
})
```

---

## 6. Required Authentication/Authorization Rules

### 6.1 Auth Providers

| Provider | Type | Purpose |
|----------|------|---------|
| Email OTP | Primary | 6-digit code via email |
| Anonymous | Guest | Limited access for demo |
| VLY Convex JWT | Federated | Freebuff platform SSO |

### 6.2 Role-Based Access

| Action | User | Business | Member | Courier | Admin |
|--------|------|----------|--------|---------|-------|
| View own orders | ✅ | ✅ | ✅ | ❌ | ✅ |
| Create order | ✅ | ✅ | ✅ | ❌ | ✅ |
| Cancel own order | ✅ | ✅ | ✅ | ❌ | ✅ |
| View all orders | ❌ | ❌ | ❌ | ❌ | ✅ |
| Assign driver | ❌ | ❌ | ❌ | ❌ | ✅ |
| Update delivery status | ❌ | ❌ | ❌ | ✅ (own) | ✅ |
| View wallet | ✅ | ✅ | ✅ | ❌ | ✅ |
| Top up wallet | ✅ | ✅ | ✅ | ❌ | ✅ |
| View invoices | ❌ | ✅ | ✅ | ❌ | ✅ |
| Manage settings | ✅ | ✅ | ✅ | ✅ | ✅ |
| Manage drivers | ❌ | ❌ | ❌ | ❌ | ✅ |
| Manage vehicles | ❌ | ❌ | ❌ | ✅ (own) | ✅ |

### 6.3 Data Access Rules

```typescript
// Users can only access their own data
order.senderId === currentUserId
wallet.userId === currentUserId
notification.userId === currentUserId

// Business members can access business data
user.businessId === businessId

// Couriers can only update their assigned deliveries
delivery.courierId === currentUserId

// Admins can access all data
user.role === "admin"
```

---

## 7. Required Database Relationships

### 7.1 Entity Relationship Map

```
users (1) ──── (N) businesses     [ownerUserId]
users (1) ──── (N) addresses      [userId]
users (1) ──── (N) orders         [senderId]
users (1) ──── (N) deliveries     [courierId]
users (1) ──── (N) reviews        [reviewerId, courierId]
users (1) ──── (N) driver_profiles [userId]
users (1) ──── (N) vehicles       [driverId]
users (1) ──── (1) wallets        [userId]
users (1) ──── (N) transactions   [via walletId]
users (1) ──── (N) notifications  [userId]
users (1) ──── (1) notification_preferences [userId]

businesses (1) ──── (N) orders    [businessId]
businesses (1) ──── (N) invoices  [businessId]

orders (1) ──── (1) deliveries    [orderId]
orders (1) ──── (N) reviews       [orderId]
orders (1) ──── (N) invoices      [orderId]

addresses (1) ──── (N) orders     [pickupAddressId, dropoffAddressId]

deliveries (1) ──── (N) tracking_events [deliveryId]

wallets (1) ──── (N) transactions [walletId]
```

### 7.2 Foreign Key Requirements

| Table | Column | References | Required |
|-------|--------|------------|----------|
| `users` | `businessId` | `businesses._id` | Optional |
| `businesses` | `ownerUserId` | `users._id` | Required |
| `addresses` | `userId` | `users._id` | Required |
| `orders` | `senderId` | `users._id` | Required |
| `orders` | `businessId` | `businesses._id` | Optional |
| `orders` | `pickupAddressId` | `addresses._id` | Required |
| `orders` | `dropoffAddressId` | `addresses._id` | Required |
| `deliveries` | `orderId` | `orders._id` | Required |
| `deliveries` | `courierId` | `users._id` | Optional |
| `reviews` | `orderId` | `orders._id` | Required |
| `reviews` | `reviewerId` | `users._id` | Required |
| `reviews` | `courierId` | `users._id` | Required |
| `vehicles` | `driverId` | `users._id` | Required |
| `driver_profiles` | `userId` | `users._id` | Required |
| `wallets` | `userId` | `users._id` | Required |
| `transactions` | `walletId` | `wallets._id` | Required |
| `transactions` | `orderId` | `orders._id` | Optional |
| `invoices` | `businessId` | `businesses._id` | Optional |
| `invoices` | `userId` | `users._id` | Required |
| `notifications` | `userId` | `users._id` | Required |
| `notification_preferences` | `userId` | `users._id` | Required |
| `tracking_events` | `deliveryId` | `deliveries._id` | Required |

---

## 8. Required External Integrations

### 8.1 Payment Processing

| Provider | Purpose | Priority |
|----------|---------|----------|
| Paystack | Card payments, EFT | High |
| SnapScan | Mobile payments | Medium |
| EFT Bank Transfer | Direct bank transfers | Medium |

### 8.2 Communication

| Provider | Purpose | Priority |
|----------|---------|----------|
| Email OTP (auth.freebuff.app) | Authentication | High |
| SMS Gateway | Delivery notifications | Medium |
| Push Notifications | Real-time alerts | Low |

### 8.3 Mapping & Routing

| Provider | Purpose | Priority |
|----------|---------|----------|
| Google Maps API | Geocoding, routing, distance | High |
| Distance Matrix | Price calculation | High |

### 8.4 File Storage

| Provider | Purpose | Priority |
|----------|---------|----------|
| Convex File Storage | POD photos, signatures | Medium |
| Document Storage | Invoices, receipts | Low |

---

## 9. Existing Mocks That Must Be Replaced

### 9.1 Mock Data Files

| File | Mock Data | Replace With |
|------|-----------|--------------|
| `src/data/orders.ts` | 4 hardcoded orders | Convex query `getOrders` |
| `src/pages/TrackDelivery.tsx` | `trackingData` object | Convex query `getTrackingByNumber` |
| `src/pages/Wallet.tsx` | `transactions` array, `balance` number | Convex queries `getTransactions`, `getWalletBalance` |
| `src/pages/PastDeliveries.tsx` | `pastDeliveries` array | Convex query `getPastDeliveries` |
| `src/pages/Invoices.tsx` | `invoices` array | Convex query `getInvoices` |
| `src/pages/Notifications.tsx` | `notifications` array | Convex query `getNotifications` |
| `src/pages/Settings.tsx` | Hardcoded form values | Convex queries `getUserProfile`, `getBusinessInfo` |

### 9.2 Mock Data Structures

#### Orders (`src/data/orders.ts`)
```typescript
interface Order {
  id: string                    // "#55667"
  status: "In Transit" | "Pending"
  pickup: PickupInfo
  dropoff: DropoffInfo
  vehicle: VehicleInfo
  driver: DriverInfo
  customer: CustomerInfo
}
```

#### Tracking (`src/pages/TrackDelivery.tsx`)
```typescript
interface TrackingData {
  trackingId: string
  status: string
  steps: TrackingStep[]
  sender: { name, address, city }
  receiver: { name, address, city }
  driver: { name, avatar }
  deliveryType: string
  weight: string
  dimensions: string
  estimatedArrival: string
  lastUpdated: string
}
```

#### Wallet (`src/pages/Wallet.tsx`)
```typescript
interface Transaction {
  id: string
  type: "credit" | "debit"
  amount: number
  description: string
  date: string
  status: "completed" | "pending" | "failed"
  reference: string
}
// balance: number (hardcoded 15450)
```

#### Past Deliveries (`src/pages/PastDeliveries.tsx`)
```typescript
{
  id: string
  date: string
  from: string
  to: string
  status: "completed" | "cancelled"
  driver: string
  amount: string
}
```

#### Invoices (`src/pages/Invoices.tsx`)
```typescript
{
  id: string
  date: string
  client: string
  amount: string
  status: "paid" | "pending" | "cancelled"
}
```

#### Notifications (`src/pages/Notifications.tsx`)
```typescript
{
  id: number
  type: "delivery" | "payment" | "alert"
  title: string
  description: string
  time: string
  unread: boolean
}
```

---

## 10. Technical Inconsistencies & Architectural Risks

### 10.1 Current Inconsistencies

| Issue | Location | Risk | Recommendation |
|-------|----------|------|----------------|
| Order ID format mismatch | Mock uses `#55667`, schema uses `id()` | Low | Standardize on Convex IDs |
| Status format mismatch | Mock uses `"In Transit"`, schema uses `in_transit` | Medium | Normalize in queries |
| Missing vehicle data | Dashboard shows vehicles, no table exists | High | Create `vehicles` table |
| Missing driver profiles | Dashboard shows driver info, no table | High | Create `driver_profiles` table |
| Missing wallet/transactions | Wallet page has hardcoded data | High | Create `wallets` + `transactions` tables |
| Missing invoices | Invoices page has hardcoded data | High | Create `invoices` table |
| Missing notifications | Notifications page has hardcoded data | High | Create `notifications` table |
| No price calculation | Request Delivery has no pricing | Medium | Create `pricing_rules` table |
| No real tracking | Track Delivery uses mock data | High | Create `tracking_events` table |
| Currency format | Mock uses `"R145.00"`, no currency field | Low | Store in cents, format in UI |

### 10.2 Architectural Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| All business data is mocked | App is non-functional | Implement Convex queries/mutations |
| No real-time updates | Stale data | Use Convex reactive queries |
| No error handling in mutations | Silent failures | Add try/catch + toast notifications |
| No optimistic updates | Slow perceived performance | Add Convex optimistic updates |
| No pagination | Performance issues | Add cursor-based pagination |
| No search indexing | Slow searches | Add Convex search indexes |
| No offline support | Data loss | Add Convex offline support |

### 10.3 Missing Features

| Feature | Required By | Priority |
|---------|------------|----------|
| Order creation flow | Request Delivery | High |
| Order status transitions | Dashboard | High |
| Driver assignment | Dashboard | High |
| Real-time location tracking | Track Delivery | High |
| Payment processing | Checkout | High |
| Invoice generation | Invoices | Medium |
| Notification system | Notifications | Medium |
| Price calculation | Request Delivery | Medium |
| Proof of delivery | Dashboard | Low |
| Reviews/ratings | Dashboard | Low |

---

## Summary

### Backend Entities Required (12 new tables)

1. `vehicles` — Fleet vehicle management
2. `driver_profiles` — Driver-specific data
3. `wallets` — User wallet balances
4. `transactions` — Financial transaction history
5. `invoices` — Invoice management
6. `notifications` — User notifications
7. `notification_preferences` — Notification settings
8. `tracking_events` — Delivery tracking timeline
9. `driver_locations` — Real-time driver positions
10. `pricing_rules` — Delivery pricing logic
11. `documents` — Downloadable documents
12. `support_tickets` — Help center tickets

### API Endpoints Required (30+ queries/mutations)

- **Dashboard**: 5 endpoints
- **Request Delivery**: 5 endpoints
- **Track Delivery**: 4 endpoints
- **Wallet**: 5 endpoints
- **Settings**: 8 endpoints
- **Past Deliveries**: 2 endpoints
- **Invoices**: 4 endpoints
- **Checkout payments**: 6 endpoints
- **Notifications**: 4 endpoints

### External Integrations Required (6 services)

- Paystack (payments)
- SnapScan (mobile payments)
- SMS Gateway (notifications)
- Google Maps (routing)
- Convex File Storage (documents)
- Email OTP (authentication)

### Mock Data to Replace (7 files)

1. `src/data/orders.ts`
2. `src/pages/TrackDelivery.tsx` (trackingData)
3. `src/pages/Wallet.tsx` (transactions, balance)
4. `src/pages/PastDeliveries.tsx` (pastDeliveries)
5. `src/pages/Invoices.tsx` (invoices)
6. `src/pages/Notifications.tsx` (notifications)
7. `src/pages/Settings.tsx` (hardcoded values)

---

*This document is the canonical specification for backend implementation. All phases reference this as the source of truth.*
