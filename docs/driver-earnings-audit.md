# Lasha — Driver Earnings Readiness Audit

> Status: audit only. No earnings UI, settlement engine, or financial code was
> written in this task. Every claim below was verified against the repository
> (2026-09-12).
>
> **UPDATE:** The settlement activation described in the audit's recommended
> next step has since been implemented — see `docs/driver-earnings-settlement.md`.
> Classification below reflects the state **before** that activation.

---

## 1. Current Architecture

The financial flow that **actually exists today**:

```
Customer Order  (state_machine.createDelivery — price starts at 0)
  → Pricing     (internal.pricing.service.calculateAndStoreQuote — mandatory;
                 failure rolls back the whole mutation, no price:0 delivery)
      → delivery_quotes row written (totalCharge, platformFee, driverEarnings)
      → orders.price patched to quote.totalCharge
  → Delivery    (state machine → dispatch offer → accept → pickup → transit)
  → Payment     (✗ DOES NOT EXIST — no provider, no payment mutations)
  → Completion  (completeDelivery: POD-gated → DELIVERED; ❗ no financial effects)
  → Settlement  (⚠ MECHANISM EXISTS BUT IS NEVER INVOKED — see §2)
  → Payout      (⚠ partially coded inside completeSettlement, never invoked)
```

Only Order → Pricing → Quote → Delivery → Completion exist as *executing*
stages. Settlement/payout exist as dormant code paths that nothing triggers.

---

## 2. Existing Financial Data

| Data | Exists? | Location | Authoritative? | Notes |
|---|---|---|---|---|
| Customer charge | ✅ | `orders.price` + `delivery_quotes.totalCharge` | ✅ | Set once at creation by `calculateAndStoreQuote`; public `calculateQuote` mutation can re-quote, but no app code calls it |
| Driver earnings (calculated) | ✅ | `delivery_quotes.driverEarnings` | ✅ (as a calculation) | `driverEarnings = deliveryFee − platformFee`, stored per order at creation |
| Platform fee | ✅ | `delivery_quotes.platformFee` | ✅ (as a calculation) | Percentage or flat, from the matched `pricing_rules` row |
| Settlement record | ⚠️ Schema+mutation exist | `settlements` table; `pricing.service.createSettlement` (internalMutation) | ❌ **Never invoked** | No caller anywhere: not `completeDelivery`, not POD completion, no cron, no action. Zero rows will ever be created by running the app |
| Payout | ⚠️ Coded but dead | `pricing.service.completeSettlement` credits `wallets.balance` + inserts a `transactions` credit | ❌ **Never invoked** | `processSettlement`/`completeSettlement` are public mutations gated by `settlement:manage`; nothing calls them |
| Driver balance | ⚠️ Table exists | `wallets` (per user, ZAR cents); `users.getWallet` auto-returns a zero shape when absent | ❌ | No wallet is ever created or credited by app code; driver wallet balance is always the fallback zero |
| Payment status | ⚠️ Schema only | `payment_transactions` table (status/provider/idempotencyKey) | ❌ **Never written or read** | No Paystack/PayFast/Stripe integration, no payment mutation exists at all |
| Payment reference | ⚠️ Schema only | `payment_transactions.providerTransactionId` | ❌ | Table is unused |
| Refund status | ⚠️ Schema only | `payment_transactions.status` includes `"refunded"`; `AUDIT_ACTIONS.PAYMENT_REFUNDED` constant exists | ❌ | No refund logic anywhere |
| Delivery completion | ✅ | `deliveries.completedAt` (state machine) | ✅ | POD-gated; **creates no financial records** |
| Driver earnings aggregate | ⚠️ | `driver_profiles.totalEarnings` | ❌ | Only incremented by dead `createSettlement`; otherwise permanently 0 |
| Driver earnings query | ⚠️ | `pricing.service.getDriverEarnings` | ❌ Vacuously correct | Reads `settlements` — always empty; would report 0/0 if called today |
| Ledger / reconciliation | ❌ | — | — | Nothing exists beyond the dormant pieces above |

Key finding: `delivery_quotes.driverEarnings` **does** store earnings, and the
`settlements` → `wallets` → `transactions` chain **is coded** — but the chain
has no trigger. This is exactly the trap the prompt warns about: the existence
of `driverEarnings` in a pricing calculation does **not** mean settlement exists.

---

## 3. Driver Earnings Readiness

**Classification: NOT READY** (closest to "PARTIAL — calculation exists,
settlement does not", but the payment stage upstream of settlement is also
entirely absent, and the settlement that exists is dead code).

Why:

1. **No settlement is ever created.** `createSettlement` is an internal
   mutation with no caller. A driver completing 100 deliveries today produces
   zero settlement rows — the authoritative per-delivery payable record does
   not come into existence.
2. **No payment reconciliation.** `payment_transactions` is never written;
   whether the customer actually paid is unknown to the system.
3. **No wallet lifecycle.** Wallets are never created; `completeSettlement`'s
   credit path silently skips drivers without a wallet (`if (wallet)`).
4. **No payout processing** — `processSettlement`/`completeSettlement` are
   operational mutations with no integration (no cron, no ops UI, no flow).

What *is* safe: the pricing calculation itself is solid — mandatory at order
creation (repair from the earlier pricing task), stored immutably in
`delivery_quotes`, quote-linked, rule-versioned.

---

## 4. Missing Components

Verified missing (not assumed):

1. **Settlement trigger** — `createSettlement` must be invoked on delivery
   completion (inside/alongside `completeDelivery`) and on failure/cancel
   policy decisions.
2. **Payment integration** — real or wallet-only; `payment_transactions` must
   be written by something.
3. **Payment ↔ settlement reconciliation** — nothing links customer payment
   state to driver payable state.
4. **Wallet creation** — ensure a `wallets` row exists before crediting
   (or create lazily in `completeSettlement` — currently silently skipped).
5. **Payout processing integration** — callers for
   `processSettlement`/`completeSettlement` (ops flow or scheduled job).
6. **Cancellation/failure compensation policy** — `cancelDelivery` and
   `failDelivery` create no financial records; whether a driver is owed
   anything for partial work is undefined.
7. **Refund/reversal handling** — no code path reverses a settlement or wallet
   credit.
8. **Driver Earnings UI** — not built (correctly, per this audit).
9. **Financial reporting queries** — only `getDriverEarnings` exists (and is
   vacuous until settlements are created).

---

## 5. Recommended Architecture

The existing stack can carry settlement; no microservice is justified.

```
React (Driver App)
  → Convex queries (driver-scoped earnings read)
  → Convex mutations
      completeDelivery (state machine)
        └─ internal.pricing.service.createSettlement   ← wire this (exists)
      ops/scheduled payout flow
        └─ processSettlement → completeSettlement       ← wire these (exist)
             └─ ensure wallet exists → credit → transactions row
  → Convex database (existing tables only)
```

Principles:

- **Reuse `settlements` as the ledger.** It already has the right shape
  (`quoteId`, `deliveryFee`, `platformFee`, `driverEarnings`,
  `idempotencyKey`, `by_idempotency` + `by_delivery` indexes).
- **Derive, never re-calculate.** Settlement copies amounts from the stored
  quote; the quote is the single pricing source of truth.
- **Fix idempotency key weakness** (see §6) when wiring the trigger.
- **Payment later, settlement first.** Settlement-on-completion is valid even
  before real payments exist if the business treats platform-recorded charges
  as receivable; reconciliation connects the two afterwards.

---

## 6. Data Integrity Risks

1. **Dead settlement chain (critical)** — coded settlement with no trigger
   gives the *appearance* of a working earnings system while producing no
   records. Worst kind of gap: silent.
2. **Idempotency key is time-based** — `createSettlement` uses
   `` `settlement-${deliveryId}-${now}` `` — two concurrent completions at
   different ms produce different keys. The pre-check on `by_delivery` saves
   it *within one transaction* (Convex mutations are serializable, so this
   holds), but the key itself is misleading; key should be
   `settlement-${deliveryId}` so the `by_idempotency` index means what it says.
3. **Wallet credit silently skipped** — `completeSettlement` does
   `if (wallet) { ...credit... }` — a driver without a wallet row would be
   marked `completed` with no money credited and no transaction record.
   Must create-or-fail when wiring payout.
4. **`driver_profiles.totalEarnings` incremented at creation, not payout** —
   it's incremented in `createSettlement` (pending) while the wallet credit
   happens only on `completeSettlement`. Two different "totals" can disagree;
   `totalEarnings` should be treated as earned-to-date, never as payable.
5. **Mutable-quote risk (low today)** — public `calculateQuote` can re-quote an
   order and insert a *second* `delivery_quotes` row (no uniqueness on
   `orderId`), and `orders.price` would be patched. Settlement reads
   `order("desc").first()` so it would take the newest — currently unreached
   code, but if UI ever calls `calculateQuote` post-assignment, earned amounts
   could change after dispatch. Recommendation: restrict re-quoting to
   pre-dispatch states when wiring settlement.
6. **Cancellation/failure ambiguity** — no policy for driver compensation on
   `failed` (work partially done) or late `cancelled` (driver already en
   route). Undefined today; must be decided before the trigger is wired.
7. **No refund path** — if a customer payment were refunded after settlement,
   nothing reverses the driver credit.
8. **Date filtering is in JS, not the index** — `getDriverEarnings` filters
   `startDate/endDate` in memory after `.collect()` on `by_driver`; fine at
   current scale, unbounded at scale.

---

## 7. Implementation Sequence

Justified by the audit (each step depends on the previous):

1. **Settlement finalization trigger** — call the existing
   `internal.pricing.service.createSettlement` from delivery completion
   (`completeDelivery` / POD completion path), fix the idempotency key to
   `settlement-${deliveryId}`, and define the failure/cancellation
   compensation policy first.
2. **Wallet lifecycle hardening** — create-or-fail wallet handling in
   `completeSettlement` (remove the silent skip); treat
   `driver_profiles.totalEarnings` as earned-to-date only.
3. **Payment integration + reconciliation** — real provider or wallet-only
   top-ups writing `payment_transactions`; link payment state to settlement
   (`payment_transactions.orderId` already exists for this).
4. **Driver financial queries** — driver-scoped earnings summary/pagination
   reading real `settlements` (extend `getDriverEarnings`; add index-based
   date filtering when needed).
5. **Driver Earnings UI** — `/driver/earnings` in the Driver App reading only
   driver-scoped queries; no estimated-as-actual display.
6. **Payout processing** — ops flow or scheduled job calling
   `processSettlement` → `completeSettlement`; reconciliation reporting last.

---

## 8. Historical Data Requirements — Current Answerability

| Question | Classification | Basis |
|---|---|---|
| How much has this driver earned? | **MISSING** (vacuously 0) | Only `getDriverEarnings` over never-populated `settlements` |
| Which deliveries generated those earnings? | **MISSING** | `settlements.deliveryId` exists; no rows are ever created |
| Which deliveries were completed? | **COMPLETE** | `deliveries` by_courier + status + `completedAt` (Driver History already uses this) |
| Which amounts are pending? | **MISSING** | Depends on settlement rows that never exist |
| Which amounts were paid? | **MISSING** | Same + `completeSettlement` never invoked |
| Which amounts failed/cancelled? | **MISSING** | `settlements.status` supports `failed`/`disputed`; no writer |
| When was a driver paid? | **MISSING** | `settlements.completedAt` exists; no rows |
| What platform fee was retained? | **PARTIAL** | Calculated and stored per quote (`delivery_quotes.platformFee`) — accurate *per order*, but no realized-fee report (that would come from settlements) |

---

## 9. Security Review

Checked: `getDriverEarnings`, `getQuoteForOrder`, `getWallet`,
`getTransactions`, `processSettlement`, `completeSettlement`,
`getMyDeliveryHistory` (new), POD queries.

Findings:

- ✅ `getDriverEarnings`: driver role **cannot** pass another `driverId`
  (explicit ownership check); operations/super_admin may query others —
  consistent with the existing RBAC pattern.
- ✅ `getWallet`/`getTransactions` (`users.ts`): scoped by `requireAuth`'s
  session user — no cross-driver exposure.
- ✅ `processSettlement`/`completeSettlement`: gated by
  `requirePermission(ctx, "settlement:manage")` — correctly restricted to
  company_admin/super_admin per `ROLE_PERMISSIONS` (operations explicitly
  lacks `settlement:manage`; covered by `authorization.test.ts`).
- ✅ `getQuoteForOrder`: customers blocked from other users' quotes. Drivers /
  fleet managers are not explicitly checked — a driver could read a quote by
  order ID. **Minor** (quotes are pricing metadata, not personal/financial
  account data), documented rather than changed mid-audit; tighten when
  building the earnings queries.
- ✅ No financial query returns global wallet balances or customer payment
  details.
- ✅ Driver History / Driver Profile expose no earnings or financial fields.

**No clear existing vulnerability requiring an immediate fix was found.**

---

## 10. Verified Evidence Index

- Pricing math + storage: `src/convex/pricing/service.ts`
  (`calculatePricingBreakdown` L~85-140: `driverEarnings = deliveryFee −
  platformFee`; `calculateAndStoreQuote` L445; `createSettlement` L526;
  `processSettlement` L591; `completeSettlement` L615; `getDriverEarnings` L206)
- Order creation pricing gate: `src/convex/deliveries/state_machine.ts` L176-233
- Completion without financial effects: `state_machine.completeDelivery` L1020-1105
- Dormant tables: `src/convex/schema.ts` — `settlements` L695,
  `payment_transactions` L729, `wallets` L528, `transactions` L539
- Wallet read fallback: `src/convex/users.ts` L124-143
- RBAC tests: `src/convex/auth/authorization.test.ts` L181-187
- Pricing tests: `src/convex/pricing/pricing.test.ts` (19 passing, incl.
  duplicate-settlement prevention and settlement state transitions)
