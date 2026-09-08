# Lasha Pricing Requirements

## Executive Summary

This document captures the pricing and financial requirements for Lasha based on inspection of the existing codebase.

---

## Existing Implementation

### Schema (Already Implemented)

| Table | Status | Notes |
|-------|--------|-------|
| `pricing_rules` | ✅ Exists | Base pricing structure defined |
| `orders.price` | ✅ Exists | Stores price in cents (ZAR) |
| `wallets` | ✅ Exists | User wallet balances |
| `transactions` | ✅ Exists | Financial transaction history |
| `invoices` | ✅ Exists | Invoice management |

### Pricing Rules Structure

```typescript
pricing_rules: {
  name: string,
  packageSize: "small" | "medium" | "large",
  parcelType?: "document" | "small_parcel" | "large_parcel" | "pallet",
  expeditionType: "standard" | "express" | "same_day",
  basePrice: number,        // cents
  pricePerKm: number,       // cents
  pricePerKg: number,       // cents
  minimumPrice: number,     // cents
  isActive: boolean,
  createdAt: number,
}
```

### What Exists vs What's Missing

| Component | Status | Notes |
|-----------|--------|-------|
| Pricing rules table | ✅ Exists | Basic structure |
| Order price field | ✅ Exists | Stores final price |
| Price calculation logic | ❌ Missing | No server-side calculation |
| Driver earnings | ❌ Missing | No earnings tracking |
| Platform fees | ❌ Missing | No fee structure |
| Settlement system | ❌ Missing | No settlement logic |
| Financial state machine | ❌ Missing | No payment states |

---

## Business Model

### Revenue Structure

```
Customer Charge
    │
    ├── Delivery Fee (based on pricing_rules)
    │   ├── Base Price
    │   ├── Distance Fee (pricePerKm × km)
    │   ├── Weight Fee (pricePerKg × kg)
    │   └── Minimum Price (floor)
    │
    ├── Platform Fee (Lasha commission)
    │
    └── Additional Fees (optional)
        ├── Express surcharge
        ├── Same-day surcharge
        └── Special handling

Customer Charge = Delivery Fee + Platform Fee + Additional Fees

Driver Earnings = Delivery Fee - Platform Fee
```

### Pricing Variables

| Variable | Source | Description |
|----------|--------|-------------|
| `packageSize` | Order | small/medium/large |
| `parcelType` | Order | document/small_parcel/large_parcel/pallet |
| `expeditionType` | Order | standard/express/same_day |
| `distance` | Calculated | Pickup to dropoff in km |
| `weight` | Order | Package weight in kg |
| `numberOfStops` | Order | Intermediate stops |

---

## Missing Business Rules (To Be Defined)

### Platform Fee

**Not currently defined in the codebase.**

Questions to answer:
- What percentage does Lasha take?
- Is it a flat fee or percentage?
- Does it vary by delivery type?
- Are there different rates for B2B vs B2C?

### Additional Fees

**Not currently defined in the codebase.**

Questions to answer:
- Express surcharge amount?
- Same-day surcharge amount?
- Fuel surcharge?
- Remote area surcharge?

### Driver Earnings

**Not currently defined in the codebase.**

Questions to answer:
- How is driver pay calculated?
- Is there a minimum per delivery?
- Are there bonuses for performance?
- How are tips handled?

### Settlement

**Not currently defined in the codebase.**

Questions to answer:
- When is a driver paid?
- Is there a holding period?
- What triggers settlement?
- How are disputes handled?

---

## Recommended Pricing Model

Based on the existing schema, here's a recommended implementation:

### 1. Pricing Rules Enhancement

Add missing fields to `pricing_rules`:

```typescript
pricing_rules: {
  // Existing fields...
  
  // New fields
  platformFeeType: "percentage" | "flat",
  platformFeeValue: number,        // percentage (0-100) or cents
  
  expressSurcharge: number,        // cents
  sameDaySurcharge: number,        // cents
  
  // Driver earnings
  driverEarningsType: "percentage" | "fixed",
  driverEarningsValue: number,     // percentage or cents
  
  // Versioning
  version: number,
  effectiveFrom: number,
  effectiveTo?: number,
}
```

### 2. Delivery Quotes

Create a `delivery_quotes` table:

```typescript
delivery_quotes: {
  orderId: v.id("orders"),
  pricingRuleId: v.id("pricing_rules"),
  
  // Breakdown
  basePrice: number,
  distanceFee: number,
  weightFee: number,
  subtotal: number,
  
  // Surcharges
  expressSurcharge: number,
  sameDaySurcharge: number,
  additionalFees: number,
  
  // Totals
  deliveryFee: number,
  platformFee: number,
  totalCharge: number,
  
  // Driver
  driverEarnings: number,
  
  // Metadata
  distanceKm: number,
  weightKg: number,
  calculatedAt: number,
}
```

### 3. Settlement Records

Create a `settlements` table:

```typescript
settlements: {
  driverId: v.id("users"),
  deliveryId: v.id("deliveries"),
  orderId: v.id("orders"),
  
  // Amounts
  deliveryFee: number,
  platformFee: number,
  driverEarnings: number,
  
  // State
  status: "pending" | "processing" | "completed" | "disputed",
  
  // Timestamps
  createdAt: number,
  processedAt?: number,
  completedAt?: number,
}
```

---

## Implementation Priorities

### Phase 1: Core Pricing (Required)

1. **Enhance pricing_rules** with platform fee structure
2. **Create pricing calculation service** in Convex
3. **Create delivery_quotes** table for audit trail
4. **Connect RequestDelivery form** to pricing service

### Phase 2: Settlement (Required)

1. **Create settlements** table
2. **Implement settlement trigger** on delivery completion
3. **Add driver earnings** to driver_profiles
4. **Update Wallet page** with real data

### Phase 3: Advanced (Nice to Have)

1. **Dynamic pricing** based on demand
2. **Zone-based pricing** for different areas
3. **Bulk pricing** for B2B customers
4. **Loyalty discounts**

---

## Authorization Requirements

| Action | Customer | Driver | Operations | Super Admin |
|--------|----------|--------|------------|-------------|
| View own quotes | ✅ | ❌ | ✅ | ✅ |
| View own charges | ✅ | ❌ | ✅ | ✅ |
| View own earnings | ❌ | ✅ | ✅ | ✅ |
| View all settlements | ❌ | ❌ | ✅ | ✅ |
| Manage pricing rules | ❌ | ❌ | ✅ | ✅ |
| Process settlements | ❌ | ❌ | ✅ | ✅ |

---

## Testing Requirements

### Pricing Tests

- Normal pricing calculation
- Different package sizes
- Different expedition types
- Distance-based pricing
- Weight-based pricing
- Minimum price enforcement
- Maximum price limits
- Pricing rule changes (historical)
- Invalid pricing inputs

### Settlement Tests

- Normal settlement flow
- Duplicate completion events
- Concurrent settlement attempts
- Failed payment handling
- Refund processing
- Dispute handling

### Authorization Tests

- Customer viewing other customer's quotes
- Driver modifying pricing rules
- Unauthorized settlement processing

---

## Open Questions

1. **What is Lasha's commission percentage?**
   - Recommendation: Start with 15-20%

2. **How are express/same-day surcharges calculated?**
   - Recommendation: Fixed percentage uplift

3. **When are drivers paid?**
   - Recommendation: Weekly settlement cycle

4. **What payment providers should be integrated?**
   - Recommendation: Start with PayFast (South Africa)

5. **How are refunds handled?**
   - Recommendation: Credit back to customer wallet
