# Lasha — Driver Earnings Settlement

> Status: implemented (layer 2 of the financial model). This document describes
> the settlement activation wired into delivery completion on 2026-09-12.
> **A settlement is NOT a payment.** Driver payouts remain future work.

---

## 1. Settlement Lifecycle

The financial flow now implemented:

```
Customer Order (createOrderAndDelivery)
  → Pricing (internal.pricing.service.calculateAndStoreQuote — mandatory;
    failure aborts order/delivery creation, no price: 0 fallback)
  → Quote stored (delivery_quotes — authoritative amounts, locked at creation)
  → Delivery lifecycle (state machine: ASSIGNED → … → AT_DROPOFF)
  → POD required (server-enforced gate before completion)
  → DELIVERED (completeDelivery OR completeDeliveryWithPOD)
  → Settlement created (internal.pricing.service.createSettlement)
      status: "pending"   ← payable, NOT paid
  → [FUTURE] Payment/Payout (processSettlement → completeSettlement)
```

Layers, explicitly distinguished:

| Layer | What it means | Where it lives | Status |
|---|---|---|---|
| 1. Pricing calculation | What the customer is charged, how the fee splits | `delivery_quotes` | Authoritative, immutable in practice |
| 2. Settlement / payable | The driver is **owed** money for a delivery | `settlements` (status `pending`) | **Implemented this task** |
| 3. Payment to driver | Money actually credited to the driver | `wallets` + `transactions` | Operations exist (`processSettlement`/`completeSettlement`) but are **not yet triggered by any automated flow** |

---

## 2. Compensation Policy

### Delivered

A `DELIVERED` delivery creates **exactly one** settlement, with the amounts
from the stored quote:

- `driverEarnings` = stored quote's `driverEarnings`
- `platformFee` = stored quote's `platformFee`
- `deliveryFee` = stored quote's `deliveryFee`
- `quoteId` = the authoritative quote record

Trigger points (both are the only paths that reach `DELIVERED`):

1. `deliveries.state_machine.completeDelivery` (POD-gated completion)
2. `pod.service.completeDeliveryWithPOD` (POD + completion in one call)

Both run settlement creation **inside the same mutation transaction** as the
state transition. Consequences:

- If settlement creation throws (e.g. missing quote), the completion mutation
  fails — a delivery can never appear completed while its settlement is
  missing. (`delivery = delivered, settlement = missing` is unrepresentable.)
- Conversely, settlement creation only happens after the `DELIVERED` patch has
  succeeded in the same transaction, so `settlement = created,
  delivery = not completed` cannot occur either.

### Failed

**Zero compensation — explicit.** `failDelivery` creates **no** settlement.
There is no partial-compensation business rule anywhere in the repository, so
zero is encoded deliberately (with an inline comment at the code path) rather
than left to accidental behaviour.

> ⚠️ **Unresolved business policy.** Whether failed runs should earn partial
> pay is a business decision that has not been made. If the business later
> decides failed deliveries deserve compensation, that is a new policy decision
> requiring a new code path — it must not be backfilled silently.

### Cancelled

**Zero compensation — explicit.** `cancelDelivery` creates **no** settlement.
Cancellations are only permitted in pre-pickup states (`REQUESTED`,
`PENDING_DISPATCH`, `ASSIGNED`, `DRIVER_ACCEPTED`, `EN_ROUTE_TO_PICKUP`,
`AT_PICKUP`), so no delivery work has been performed and nothing is owed. The
same unresolved-policy caveat applies if the business ever wants pre-pickup
cancellation fees.

---

## 3. Settlement Record

Schema terminology (`settlements` table, `src/convex/schema.ts`):

| Field | Value | Notes |
|---|---|---|
| `idempotencyKey` | `` settlement-${deliveryId} `` | Deterministic per delivery — the settlement identity |
| `deliveryId` | The completed delivery | One delivery ⇔ one settlement (`by_delivery` index) |
| `orderId` | The delivery's order | `by_order` index |
| `driverId` | The delivery's **authoritative assigned courier** | Never a client-supplied ID; resolved from `delivery.courierId` inside the completion transaction |
| `quoteId` | The stored quote used | Provenance of the amounts |
| `deliveryFee`, `platformFee`, `driverEarnings` | Copied from the quote | Cents (ZAR); **never recalculated** |
| `status` | `pending` → `processing` → `completed` (or `failed` / `disputed`) | `pending` = payable, **not** paid |
| `createdAt` / `processedAt` / `completedAt` | Lifecycle timestamps | |
| `failureReason` | Optional | For `failed` settlements |

Indexes: `by_driver`, `by_delivery`, `by_order`, `by_status`,
`by_idempotency`, `by_driver_status`.

---

## 4. Wallet Policy

**Wallets are created automatically, and idempotently, at credit time.**

When `completeSettlement` (settlement:manage) completes a settlement:

1. The driver's wallet is looked up via the `by_user` index.
2. If it does not exist, it is created (balance `0`, `ZAR`, active) — the
   previous silent `if (wallet)` skip is removed. A settlement can no longer
   appear financially complete while the driver's wallet is missing.
3. The credit is applied and a `transactions` record (`type: "credit"`,
   `status: "completed"`, reference `SET-{settlementId}`) is inserted.

Wallet creation is idempotent because the insert only happens inside the
missing-wallet guard and every wallet lookup is scoped to one `userId` — there
can never be two wallets for the same driver.

> Note: settlement **creation** (`pending`) does not touch wallets. Only
> settlement **completion** (payment) does — and that is still an
> operations-initiated action, not an automated payout.

---

## 5. Idempotency

- **Settlement identity**: `settlement-${deliveryId}` — deterministic, no time
  component. The previous time-suffixed key (`settlement-${deliveryId}-${now}`)
  would have minted a different key per retry; it is removed.
- **Double-check on create**: `createSettlement` first resolves the
  deterministic key via `by_idempotency`, then falls back to `by_delivery`
  (covers any legacy rows). Either hit returns the existing settlement with
  `alreadyExists: true` and inserts nothing.
- **Retry safety**: retried completion mutations, double completion attempts,
  and concurrent settlement creation cannot produce duplicate settlements.
  Convex mutations are serializable and each completion path runs settlement
  creation once, inside its transaction, behind the deterministic-key check.
- **Wallet credits** are guarded by the settlement state gate
  (`completeSettlement` requires `processing`), so repeated completion calls
  cannot double-credit a wallet.

---

## 6. Payment Boundary

**Creating a settlement does NOT mean the driver has been paid.**

- `pending` settlement = the driver is *owed* the amount (payable).
- Only `completeSettlement` moves money (wallet credit + transaction), and it
  requires the `settlement:manage` permission (operations / super admin —
  drivers explicitly lack it) and a prior `processSettlement` transition.
- There is still **no customer payment provider integration**
  (`payment_transactions` remains unwritten), no payout processing automation,
  and no reconciliation. Customer payment and driver payout remain separate,
  future work.

Do not display settlement amounts to drivers as "paid earnings" — payable vs
paid are distinct states in `getDriverEarnings` (`pendingEarnings` vs
`totalEarnings` from `completed` settlements).

---

## Driver Earnings Query

`pricing.service.getDriverEarnings` already reads real settlements, scoped:

- Drivers can only view their **own** earnings (`driverId !== user.userId` →
  access denied for the driver role).
- `totalEarnings` = sum of `completed` settlements (actually paid).
- `pendingEarnings` = sum of `pending` + `processing` settlements (owed).
- With settlements now being created automatically on delivery, this query
  returns real data. No Earnings UI has been built (explicitly out of scope).

---

## Authorization Summary

| Operation | Permission | Notes |
|---|---|---|
| `createSettlement` | internal only (`internalMutation`) | Triggered inside completion transactions; unreachable from React |
| `processSettlement` | `settlement:manage` | Driver role does **not** have it |
| `completeSettlement` | `settlement:manage` | Driver role does **not** have it |
| Driver identity | `delivery.courierId` | Authoritative assignment, never client input |

Audit events (`audit_events`, category `pricing`/`payment`):
`settlement.created` (amounts + parties), `settlement.completed` (amount +
wallet). No secrets or payment credentials are logged.

---

## Test Coverage

`src/convex/testing/settlement.test.ts` (24 assertions, run with
`bunx tsx src/convex/testing/settlement.test.ts`) covers: deterministic key,
legacy-key removal, index alignment, dual idempotency checks, authoritative
amount source (no recalculation), loud failure on missing quote, both
completion-path wirings, explicit zero policy for failed/cancelled, wallet
ensure policy + idempotency, credit amount provenance, permission gates,
driver-role exclusion, state gates, internal-only creation, audit logging,
payment separation, and driver-scoped earnings.

---

## Remaining Gaps (future tasks)

1. **Payout automation** — nothing calls `processSettlement`/`completeSettlement`.
2. **Customer payment integration** — `payment_transactions` is unused; no
   reconciliation between customer payment and driver settlement.
3. **Refund/reversal handling** — no flow reverses a settlement.
4. **Failed/cancelled compensation policy** — unresolved business decision
   (currently explicit zero).
5. **Driver Earnings UI** — deliberately not built yet.
