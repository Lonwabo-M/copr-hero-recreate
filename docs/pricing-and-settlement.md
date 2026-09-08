# Lasha Pricing and Settlement Architecture

## Overview

Lasha implements a server-side pricing and settlement system using Convex. All pricing calculations happen in Convex — React only displays results returned by the backend.

**Key principles:**
- Convex is the authoritative source for all pricing
- React never calculates prices directly
- Historical quotes remain explainable
- Financial operations are idempotent
- Authorization is enforced server-side

---

## Pricing Model

### Revenue Structure

```
Customer Charge
    │
    ├── Delivery Fee
    │   ├── Base Price
    │   ├── Distance Fee (pricePerKm × km)
    │   ├── Weight Fee (pricePerKg × kg)
    │   └── Minimum Price (floor)
    │
    ├── Platform Fee (Lasha commission)
    │   ├── Percentage-based (e.g., 15%)
    │   └── OR Flat fee (e.g., R50)
    │
    └── Additional Fees (optional)
        ├── Express surcharge
        └── Same-day surcharge

Customer Charge = Delivery Fee + Platform Fee
Driver Earnings = Delivery Fee - Platform Fee
```

### Example Calculation

| Component | Amount | Formula |
|-----------|--------|---------|
| Base Price | R50.00 | Fixed |
| Distance (10km × R15/km) | R150.00 | pricePerKm × km |
| Weight (2kg × R2/kg) | R4.00 | pricePerKg × kg |
| **Subtotal** | **R204.00** | base + distance + weight |
| Express Surcharge | R0.00 | Not applicable |
| **Delivery Fee** | **R204.00** | max(subtotal, minimum) |
| Platform Fee (15%) | R30.60 | deliveryFee × 15% |
| **Total Charge** | **R234.60** | deliveryFee + platformFee |
| **Driver Earnings** | **R173.40** | deliveryFee - platformFee |

---

## Data Model

### Pricing Rules

Versioned pricing rules that can change over time without corrupting historical data.

```typescript
pricing_rules: {
  name: string,
  packageSize: "small" | "medium" | "large",
  parcelType?: "document" | "small_parcel" | "large_parcel" | "pallet",
  expeditionType: "standard" | "express" | "same_day",
  
  // Base pricing
  basePrice: number,        // cents
  pricePerKm: number,       // cents
  pricePerKg: number,       // cents
  minimumPrice: number,     // cents
  
  // Platform fee
  platformFeeType: "percentage" | "flat",
  platformFeeValue: number,
  
  // Surcharges
  expressSurcharge?: number,
  sameDaySurcharge?: number,
  
  // Versioning
  version: number,
  effectiveFrom: number,
  effectiveTo?: number,
  isActive: boolean,
  createdAt: number,
}
```

### Delivery Quotes

Stores the pricing breakdown for each delivery for audit trail.

```typescript
delivery_quotes: {
  orderId: v.id("orders"),
  deliveryId?: v.id("deliveries"),
  pricingRuleId: v.id("pricing_rules"),
  userId: v.id("users"),
  
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

### Settlements

Driver settlement records created when deliveries complete.

```typescript
settlements: {
  driverId: v.id("users"),
  deliveryId: v.id("deliveries"),
  orderId: v.id("orders"),
  quoteId: v.id("delivery_quotes"),
  
  // Amounts
  deliveryFee: number,
  platformFee: number,
  driverEarnings: number,
  
  // State
  status: "pending" | "processing" | "completed" | "failed" | "disputed",
  
  // Idempotency
  idempotencyKey: string,
  
  // Timestamps
  createdAt: number,
  processedAt?: number,
  completedAt?: number,
  failureReason?: string,
}
```

---

## Financial State Machine

### Settlement States

```
┌─────────┐     ┌────────────┐     ┌───────────┐
│ pending  │────▶│ processing │────▶│ completed │
└─────────┘     └────────────┘     └───────────┘
     │                │
     │                ▼
     │           ┌────────┐
     └──────────▶│ failed │
                 └────────┘
                      │
                      ▼
                 ┌──────────┐
                 │ disputed │
                 └──────────┘
```

### State Transitions

| From | To | Trigger |
|------|-----|---------|
| `pending` | `processing` | Settlement initiated |
| `processing` | `completed` | Payment confirmed |
| `processing` | `failed` | Payment failed |
| `pending` | `failed` | Invalid settlement |
| `failed` | `disputed` | Driver disputes |
| `disputed` | `completed` | Dispute resolved |
| `disputed` | `failed` | Dispute rejected |

---

## Settlement Lifecycle

### 1. Delivery Completed

```
Driver completes delivery
    ↓
State machine triggers createSettlement()
    ↓
Settlement created with status: "pending"
```

### 2. Settlement Processed

```
Operations initiates settlement
    ↓
Status changes to "processing"
    ↓
Payment provider processes payment
```

### 3. Settlement Completed

```
Payment confirmed by provider
    ↓
Status changes to "completed"
    ↓
Driver's wallet credited
    ↓
Transaction record created
```

---

## API Reference

### Queries

| Query | Description | Auth |
|-------|-------------|------|
| `getActivePricingRules` | Get all active pricing rules | operations/admin |
| `getPricingRule` | Get specific pricing rule | authenticated |
| `getQuoteForOrder` | Get quote for an order | owner/operations |
| `getDriverEarnings` | Get driver's earnings summary | driver (own) / admin (all) |

### Mutations

| Mutation | Description | Auth |
|----------|-------------|------|
| `calculateQuote` | Calculate and store pricing quote | owner/operations |
| `createPricingRule` | Create new pricing rule | pricing:manage |
| `deactivatePricingRule` | Deactivate pricing rule | pricing:manage |
| `processSettlement` | Mark settlement as processing | settlement:manage |
| `completeSettlement` | Complete settlement and credit driver | settlement:manage |

### Internal Mutations

| Mutation | Description | Used By |
|----------|-------------|---------|
| `createSettlement` | Create settlement on delivery completion | State machine |

---

## React Integration

### Request Delivery Page

```typescript
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

function RequestDelivery() {
  const calculateQuote = useMutation(api.pricing.service.calculateQuote);
  
  const handleSubmit = async (orderData) => {
    // Calculate quote (server-side)
    const quote = await calculateQuote({
      orderId: orderData.orderId,
      distanceKm: calculatedDistance,
    });
    
    // Display the quote
    setQuote(quote);
  };
  
  return (
    <div>
      {quote && (
        <div className="price-breakdown">
          <p>Delivery Fee: R{(quote.deliveryFee / 100).toFixed(2)}</p>
          <p>Platform Fee: R{(quote.platformFee / 100).toFixed(2)}</p>
          <p>Total: R{(quote.totalCharge / 100).toFixed(2)}</p>
        </div>
      )}
    </div>
  );
}
```

### Wallet Page

```typescript
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

function Wallet() {
  const earnings = useQuery(api.pricing.service.getDriverEarnings, {});
  
  return (
    <div>
      <h2>Driver Earnings</h2>
      <p>Total: R{(earnings?.totalEarnings / 100).toFixed(2)}</p>
      <p>Pending: R{(earnings?.pendingEarnings / 100).toFixed(2)}</p>
    </div>
  );
}
```

---

## Idempotency

Financial operations are protected against duplicate processing:

### Settlement Idempotency

```typescript
// Check before creating
const existing = await ctx.db
  .query("settlements")
  .withIndex("by_delivery", (q) => q.eq("deliveryId", deliveryId))
  .first();

if (existing) {
  return { settlementId: existing._id, alreadyExists: true };
}
```

### Unique Constraints

```typescript
// Idempotency key prevents duplicates
idempotencyKey: v.string()

// Index ensures uniqueness check is efficient
.index("by_idempotency", ["idempotencyKey"])
```

---

## Authorization

| Action | Customer | Driver | Operations | Super Admin |
|--------|----------|--------|------------|-------------|
| View pricing rules | ❌ | ❌ | ✅ | ✅ |
| Create pricing rule | ❌ | ❌ | ✅ | ✅ |
| View own quotes | ✅ | ❌ | ✅ | ✅ |
| View own charges | ✅ | ❌ | ✅ | ✅ |
| View own earnings | ❌ | ✅ | ✅ | ✅ |
| View all settlements | ❌ | ❌ | ✅ | ✅ |
| Process settlements | ❌ | ❌ | ✅ | ✅ |
| Complete settlements | ❌ | ❌ | ✅ | ✅ |

---

## Failure Handling

### Payment Provider Failures

```
Settlement processing
    ↓
Payment provider call fails
    ↓
Status remains "processing"
    ↓
Retry logic kicks in
    ↓
After max retries → status: "failed"
    ↓
Driver notified
```

### Race Condition Protection

```typescript
// Atomic check before update
const settlement = await ctx.db.get(settlementId);
if (settlement.status !== "pending") {
  throw new Error(`Settlement is ${settlement.status}, not pending`);
}

// Update
await ctx.db.patch(settlementId, { status: "processing" });
```

---

## File Structure

```
src/convex/
├── pricing/
│   ├── service.ts          # Main pricing service
│   └── pricing.test.ts     # Tests
└── schema.ts               # Enhanced with pricing tables

docs/
├── pricing-requirements.md  # Requirements document
└── pricing-and-settlement.md # This document
```

---

## Future Enhancements

1. **Dynamic Pricing** - Adjust prices based on demand
2. **Zone-Based Pricing** - Different rates for different areas
3. **Bulk Pricing** - Discounts for B2B customers
4. **Loyalty Program** - Rewards for frequent users
5. **Payment Provider Integration** - PayFast, Stripe
6. **Automated Settlements** - Scheduled batch processing
7. **Invoice Generation** - PDF invoices for B2B
8. **Tax Calculation** - VAT handling
