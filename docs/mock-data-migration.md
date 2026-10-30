# Mock Data Migration

## Overview

This document catalogs all mock/hardcoded data sources in the Lasha UI, their Convex replacements, and their current migration status.

---

## Removed Mock Sources

### 1. `src/data/orders.ts` — DELETED

| Detail | Value |
|--------|-------|
| **Mock type** | 4 hardcoded delivery orders with fake driver/vehicle/customer data |
| **Replaced by** | `api.deliveries.state_machine.getMyDeliveries` query |
| **Page** | Dashboard |
| **Status** | ✅ Removed |

The dashboard `DashboardOrder` interface is now defined inline in `Dashboard.tsx` and populated by the Convex query. Shared types for dashboard sub-components moved to `src/types/dashboard.ts`.

### 2. `src/pages/Dashboard.tsx` — Mock orders removed

| Detail | Value |
|--------|-------|
| **Mock type** | Hardcoded `orders` array imported from `src/data/orders.ts` |
| **Replaced by** | `useQuery(api.deliveries.state_machine.getMyDeliveries, {})` |
| **Status** | ✅ Connected to Convex |

`transformDeliveryToOrder()` converts Convex delivery documents to the `DashboardOrder` shape expected by dashboard sub-components. Includes loading (`undefined`) and empty-state handling.

### 3. `src/pages/Notifications.tsx` — Mock notifications removed

| Detail | Value |
|--------|-------|
| **Mock type** | Hardcoded `notifications` array with fake delivery/payment/alert entries |
| **Replaced by** | `useQuery(api.notifications.service.getMyNotifications, {})` |
| **Status** | ✅ Connected to Convex |

Also wired up `markAsRead` and `markAllAsRead` mutations. Includes loading and empty states.

### 4. `src/pages/Wallet.tsx` — Mock wallet/transactions removed

| Detail | Value |
|--------|-------|
| **Mock type** | Hardcoded `balance` number and `transactions` array |
| **Replaced by** | `useQuery(api.users.getWallet)` and `useQuery(api.users.getTransactions, {})` |
| **Status** | ✅ Connected to Convex |

Currency formatting uses `Intl.NumberFormat` with ZAR. Balance displayed in rand (amounts stored in cents). The top-up modal now starts a Paystack hosted checkout and the returned reference is verified server-side before the wallet is credited.

### 5. `src/pages/PastDeliveries.tsx` — Mock deliveries removed

| Detail | Value |
|--------|-------|
| **Mock type** | Hardcoded `pastDeliveries` array |
| **Replaced by** | `useQuery(api.users.getPastDeliveries)` |
| **Status** | ✅ Connected to Convex |

Includes loading and empty states. Shows tracking number, date, driver name, and status badge.

### 6. `src/pages/Invoices.tsx` — Mock invoices removed

| Detail | Value |
|--------|-------|
| **Mock type** | Hardcoded `invoices` array |
| **Replaced by** | `useQuery(api.users.getInvoices)` |
| **Status** | ✅ Connected to Convex |

Filter tabs (All/Paid/Pending/Cancelled) preserved. Loading and empty states added.

### 7. `src/pages/TrackDelivery.tsx` — Mock tracking data removed

| Detail | Value |
|--------|-------|
| **Mock type** | Hardcoded `trackingData` object with fake sender/receiver/driver info |
| **Replaced by** | `useQuery(api.deliveries.state_machine.getDeliveryByTracking, ...)` |
| **Status** | ✅ Connected to Convex |

Search-by-tracking-number preserved. Progress stepper generated dynamically from delivery status. Copy-to-clipboard preserved.

### 8. `src/components/RequireAuth.tsx` — Dev bypass removed

| Detail | Value |
|--------|-------|
| **Mock type** | Dev bypass: `if (true)` returning `devUser` without authentication |
| **Replaced by** | Proper Convex Auth check via `useConvexAuth()` |
| **Status** | ✅ Removed |

Auth flow now properly:
1. Checks if user is authenticated
2. Redirects to `/auth?returnTo=...` if not
3. Resolves redirect after auth via Convex user lookup

---

## Intentionally Retained for Development

### 1. `src/pages/Settings.tsx` — Hardcoded form values

| Detail | Value |
|--------|-------|
| **Mock type** | Hardcoded initial values: "Lusanda Miya", email, phone, address, company info |
| **Reason retained** | No Convex mutations for profile/business updates implemented yet |
| **Future replacement** | `api.users.updateProfile`, `api.businesses.updateBusiness` |
| **Status** | 🟡 Pending (requires settings mutations) |

The form is functional (values can be edited locally) but changes are not persisted. The "Save" button currently shows "Saved!" for 2 seconds without making a server call.

### 2. `src/pages/OperationsCentre.tsx` — Partial mock data

| Detail | Value |
|--------|-------|
| **Mock type** | Stat counters, activity feed |
| **Reason retained** | Connected to Convex queries but aggregate stats need implementation |
| **Status** | 🟡 Partially connected |

Deliveries and notifications are fetched from Convex. Stat cards (Active Deliveries, Pending Dispatch, etc.) need dedicated aggregation queries.

---

## Dashboard Sub-Components — Types Extracted

The following components previously imported types from `src/data/orders.ts`. Types were extracted to `src/types/dashboard.ts`:

| Component | Import Changed |
|-----------|---------------|
| `OrderPanel.tsx` | `import type { Order } from "@/types/dashboard"` |
| `DetailsPanel.tsx` | `import type { Order } from "@/types/dashboard"` |
| `OrderCard.tsx` | `import type { Order } from "@/types/dashboard"` |
| `OrderDetailsTab.tsx` | `import type { Order } from "@/types/dashboard"` |
| `CustomerDetailsTab.tsx` | `import type { CustomerInfo } from "@/types/dashboard"` |
| `DriverDetailsTab.tsx` | `import type { DriverInfo } from "@/types/dashboard"` |
| `VehiclePanel.tsx` | `import type { VehicleInfo } from "@/types/dashboard"` |

---

## Files Created During Migration

| File | Purpose |
|------|---------|
| `src/types/dashboard.ts` | Shared dashboard domain types (Order, PickupInfo, DropoffInfo, VehicleInfo, DriverInfo, CustomerInfo) |
| `src/convex/users.ts` (extended) | Added `getWallet`, `getTransactions`, `getPastDeliveries`, `getInvoices` queries |

---

## Files Modified During Migration

| File | Changes |
|------|---------|
| `src/pages/Dashboard.tsx` | Replaced mock orders with Convex query, added loading/empty states |
| `src/pages/Notifications.tsx` | Replaced mock notifications with Convex queries/mutations |
| `src/pages/Wallet.tsx` | Replaced mock balance/transactions with Convex queries |
| `src/pages/PastDeliveries.tsx` | Replaced mock past deliveries with Convex query |
| `src/pages/Invoices.tsx` | Replaced mock invoices with Convex query |
| `src/pages/TrackDelivery.tsx` | Replaced mock tracking data with Convex query, fixed missing fields |
| `src/components/RequireAuth.tsx` | Removed dev bypass, implemented proper auth flow |
| `src/components/dashboard/OrderPanel.tsx` | Updated import path |
| `src/components/dashboard/DetailsPanel.tsx` | Updated import path |
| `src/components/dashboard/OrderCard.tsx` | Updated import path |
| `src/components/dashboard/OrderDetailsTab.tsx` | Updated import path |
| `src/components/dashboard/CustomerDetailsTab.tsx` | Updated import path |
| `src/components/dashboard/DriverDetailsTab.tsx` | Updated import path |
| `src/components/dashboard/VehiclePanel.tsx` | Updated import path |

---

## Files Deleted During Migration

| File | Reason |
|------|--------|
| `src/data/orders.ts` | All mock order data removed; types extracted to `src/types/dashboard.ts` |

---

## Convex Queries Added

| Query | Module | Purpose |
|-------|--------|---------|
| `getWallet` | `users.ts` | Returns current user's wallet balance |
| `getTransactions` | `users.ts` | Returns current user's transactions |
| `getPastDeliveries` | `users.ts` | Returns completed/cancelled deliveries for current user |
| `getInvoices` | `users.ts` | Returns invoices for current user's company |

---

## Summary

| Category | Count |
|----------|-------|
| Mock sources removed | 8 |
| Files deleted | 1 |
| Files created | 1 |
| Files modified | 14 |
| Convex queries added | 4 |
| Pages still using local state | 1 (Settings — pending mutations) |

---

*Last updated: September 2026*
