# Lasha — Payment ↔ Settlement Reconciliation Audit & Design

> Status: **audit/design only** (2026-09-12). No reconciliation engine, Earnings
> UI, payout automation, or refund workflow was implemented. One minimal
> security correction was made (documented in §10). Every claim below was
> verified against the repository code.

---

## 1. Current Financial Architecture

Both flows are now live and authoritative:

```
CUSTOMER SIDE
Order (createOrderAndDelivery)
  → Quote (delivery_quotes: totalCharge / deliveryFee / platformFee / driverEarnings)
  → orders.price = totalCharge
  → Paystack (initiate → hosted checkout)
  → payment_transactions (pending → completed | failed)

DRIVER SIDE
Order
  → Delivery (state machine)
  → POD gate
  → DELIVERED (completeDelivery | completeDeliveryWithPOD)
  → Settlement created (pending = payable)          [settlement-${deliveryId}]
  → [dead code until invoked] processSettlement → completeSettlement
      → wallet credited + transactions row (SET-{settlementId})
```

**Where reconciliation is missing today:** there is no financial event that
relates `payment_transactions` to `settlements`. Nothing answers "is this order
financially settled end-to-end?", nothing blocks a settlement payout on
(un)paid customer payment, and nothing links a refund back to a settlement.
The two flows meet only implicitly, through the shared `orderId`.

---

## 2. Financial Records Matrix

| Record | Exists | Authoritative | Linked To | Current State | Notes |
|---|---|---|---|---|---|
| `delivery_quotes` | ✅ | ✅ (amounts locked at creation) | order (`by_order`) | written at creation, immutable in practice | `driverEarnings = deliveryFee − platformFee` |
| `orders.price` | ✅ | ✅ (mirrors quote total) | quote (indirect) | set once at creation | the customer-charge source of truth |
| `payment_transactions` | ✅ | ✅ (only from verified provider evidence) | order (`by_order`), user (`by_user`), provider ref (`by_provider`) | pending → completed/failed | idempotencyKey = Paystack reference; **no link to settlements** |
| `settlements` | ✅ | ✅ (amounts copied from quote) | delivery (`by_delivery`), order, driver, quote (`quoteId`), idempotency | created at DELIVERED, starts `pending` | **no link to payment_transactions** |
| `wallets` | ✅ (table) | balance only | user (`by_user`) | created lazily at first `completeSettlement` | balance is mutable state, not a ledger |
| `transactions` | ✅ (table) | append-only rows, but ⚠️ see §7 | wallet (`by_wallet`), order (optional) | only written by `completeSettlement` | `reference: SET-{settlementId}` is the only settlement linkage |
| Platform fee | ✅ (fields on quote/settlement) | ✅ | quote + settlement | stored, never "accounted" anywhere | no revenue record exists |
| Payout | ❌ | — | — | absent | no bank destination, no payout record, no automation |

---

## 3. Reconciliation Model (proposed, not implemented)

Relationships today (verified):

- **payment_transactions ⇄ order** — direct FK (`orderId`).
- **settlement ⇄ delivery** — direct FK (`deliveryId`), one-to-one enforced.
- **settlement ⇄ order** — direct FK (`orderId`).
- **payment_transactions ⇄ settlement** — **indirect only**, via shared
  `orderId`. Absent as a first-class relationship.
- **platform revenue** — calculated: `totalCharge − driverEarnings` (=
  `platformFee` on the quote). No stored revenue record.

**Recommended minimal model — derive, don't duplicate.** Both records already
carry `orderId`; reconciliation can be computed per order:

```
For order O:
  payment = latest payment_transactions where orderId = O
  settle  = unique settlements where orderId = O        (by_order index)

  customerPaid   = payment?.status === "completed" && payment.amount === O.price
  driverEntitled = settle != null                        (settle.driverEarnings)
  platformRevenue = O.price − settle.driverEarnings      (when settle exists)
  settledPaid    = settle?.status === "completed"

  RECONCILED ⇔ customerPaid ∧ (settle != null) ∧ settledPaid
  (i.e. both facts verified; payable-to-paid cycle closed)
```

This answers all reconciliation questions with existing indexes — **no new
table is required**. If durable per-order state is later needed (e.g. for
payout batching at scale), the smallest addition would be optional fields on
`settlements` (e.g. `reconciledPaymentId`, `releasedAt`) — not a new table.

### The payout gate rule (proposed)

`completeSettlement` (the actual driver payment) should be permitted only when
`customerPaid` is true for its order — **Model B** below. The gate belongs at
the payout boundary; settlement *creation* stays uncoupled from payment.

---

## 4. Settlement Eligibility

Three models were considered:

- **Model A** — payable immediately on DELIVERED, regardless of customer payment.
- **Model B** — settlement created at DELIVERED, payout blocked until customer payment verified.
- **Model C** — settlement created only after customer payment.

**Current implemented behaviour = Model A**: `createSettlement` is wired to
delivery completion only (see `completeDelivery` / `completeDeliveryWithPOD` in
the state machine and POD service). Customer payment plays no role — that is
the architecture this repo deliberately built (payment and settlement were
explicitly separated in `docs/driver-earnings-settlement.md` §6).

**Which model is intended:** the repository establishes *facts* (settlement on
completion; payment via provider verification) but contains **no explicit
business rule deciding payout timing relative to customer payment**. Choosing
A/B/C as *policy* is therefore classified as an **unresolved business
decision**. The audit's recommendation (not a decision): Model B is the only
model consistent with the existing architecture without rewriting the
settlement trigger — keep creation at DELIVERED (already implemented), add the
customer-payment gate at the `completeSettlement` boundary (one check, one
place, reversible by policy change).

---

## 5. Edge Cases (current behaviour + required future policy)

| Edge case | Current behaviour (verified) | Required future policy |
|---|---|---|
| **Payment before delivery completes** | Possible — nothing blocks paying an order in any state; the money sits as a completed `payment_transactions` row | Accepted prepayment model is fine for prepaid logistics; document that a completed payment is a *customer* fact only |
| **…then delivery fails** | Settlement is **not** created (explicit zero-compensation policy); payment stays `completed` | Needs policy: auto-refund? credit? currently money collected with no delivery — **unresolved** |
| **…then delivery cancelled** | Same as failed: no settlement, payment untouched | Same unresolved policy |
| **…delivery never starts** | Same as cancelled (no settlement path ever triggers) | Same unresolved policy |
| **Delivery completes before payment** | Possible and expected — DELIVERED creates settlement `pending`; payment may still be unpaid | Model B gate at payout would make this state safe (settlement payable but not payable-*out*) |
| **Payment fails after delivery** | Settlement remains `pending`/payable; payment `failed`. Driver entitlement and customer non-payment coexist | Under Model B, payout stays blocked — correct. Escalation (retry payment / cancel) needs ops tooling |
| **Refund after successful payment** | Schema has a `refunded` literal; nothing enters it. No effect on settlement/wallet today | Requires full policy: payment → refunded; wallet claw-back if settlement already `completed`; settlement reversal handling. **Unresolved** |
| **Partial payment** | **Unsupported** — Paystack is initialized for the full charge; `completePaymentTransaction` refuses any provider amount ≠ stored charge | Explicitly: partial payments are unsupported until a policy and amount-tracking model exist |
| **Duplicate payment** | Safe (verified): one deterministic reference per order; second init returns `alreadyPaid`; amount-mismatch and provider-ID-mismatch guards; completion short-circuits `alreadyCompleted` | Two *different* references cannot both complete for one order because reference 1 completing makes the latest-payment check return `alreadyPaid` before a second checkout is created. Webhook replays are no-ops |
| **Duplicate settlement** | Safe (verified): `settlement-${deliveryId}` deterministic key, `by_idempotency` + `by_delivery` double-check, completion gated by `processing` state | — |

---

## 6. Driver Earnings Readiness

Classification: **PARTIAL.**

The system can already answer *safely* (driver-scoped, `getDriverEarnings`):
- earnings per delivery → `settlements.driverEarnings` (created, real)
- payable → `pending + processing` settlements
- actually paid → `completed` settlements

Why not READY:
1. **No payout flow has ever run** — `completed` settlements require
   operations to manually call `processSettlement`/`completeSettlement`; no
   business process exists to do that, so "paid" will be permanently zero in
   practice.
2. **Payout gate undefined** — without the Model B decision, "payable" may
   include orders the customer never paid.
3. **No reconciliation state** — cannot distinguish "settlement pending
   because delivery done" from "settlement pending because customer hasn't
   paid".

The *data* exists; the *meaning* of the statuses is not yet fully defined.

## 7. Payout Readiness

Classification: **NOT READY.**

Verified missing:
- payable settlement records exist, but no eligibility rule (§4 unresolved)
- **payout destination** — no bank account / recipient model anywhere
- payout state, payout reference, payout records — absent entirely
- payout failure handling — absent
- payout reversal / claw-back — absent (critical: wallets are mutable balances)
- no payout provider integration (Paystack Transfers or otherwise)
- settlement lifecycle itself is manual dead code (`processSettlement` has no
  caller)

---

## 8. Missing Components (verified only)

1. Reconciliation *state* (derivable today; durable fields optional later)
2. Customer-payment gate at the payout boundary (Model B) — pending business decision
3. Refund / reversal policy + flow (payment, settlement, wallet claw-back)
4. Payout destination model (bank accounts / recipients)
5. Payout processing (provider Transfers integration, references, retries)
6. Payout failure/reversal handling
7. Automated settlement lifecycle (who calls `processSettlement`/`completeSettlement`, when)
8. Platform revenue record (currently only calculable, never stored/derived)
9. Payment-before-failed-delivery money policy (refund/credit)

## 9. Recommended Implementation Sequence

Smallest safe path from the current state:

1. **Reconciliation read model** — a privileged query deriving per-order
   `customerPaid / driverEntitled / reconciled` from existing indexes (§3).
   Pure read; no risk; unblocks everything below.
2. **Business decision: settle-eligibility model (A/B/C)** — required sign-off;
   recommend Model B (gate at `completeSettlement`).
3. **Payout gate** — implement the decision as a single check inside
   `completeSettlement` (customer payment verified + amount match).
4. **Driver Earnings query (real)** — extend `getDriverEarnings` to expose
   payable vs paid with the gate semantics; safe driver scoping already exists.
5. **Driver Earnings UI** — reads only the query from step 4.
6. **Payout destination model** — driver bank/recipient records (privileged writes).
7. **Payout processing** — provider Transfers integration with payout
   references, idempotency, failure states.
8. **Refund/reversal policy + implementation** — including wallet claw-back.
9. **Payout reconciliation** — link payouts ↔ settlements ↔ payments.

Nothing in this document implements steps 1–9; they are sequenced, not built.

---

## 10. Security Review

Reviewed: payment overview (driver/operations branches return no data ✅),
verification ownership (payer or super admin ✅), settlement management
(`settlement:manage`; drivers lack it ✅), wallet reads (`by_user`, session ✅),
provider references (server-side only; client receives only its own
reference/URL ✅), webhook (signature-gated, `internalAction` ✅).

**Vulnerability found and fixed (minimal change):**
`pricing.service.getQuoteForOrder` allowed **any authenticated driver or fleet
manager** to read the full quote breakdown (including `driverEarnings` and
platform fee) for *any* order by supplying an `orderId` — cross-user financial
exposure. Correction (smallest possible): drivers and fleet managers can now
read a quote only when a delivery for that order is assigned to them
(`by_order` lookup, `courierId` check). Customers and privileged roles were
already handled. No other financial query exposed cross-user data.

---

## 11. Ledger Integrity (§7 of the audit spec)

`wallets` + `transactions` are a **balance implementation with an
append-only-ish transaction log**, not a true ledger:

- **Good:** transaction rows are never updated or deleted (only inserted);
  wallet lookups are session-scoped.
- **Weaknesses (verified):**
  1. **No settlement FK** — `transactions` links to `settlements` only via the
     free-text `reference: "SET-{settlementId}"`; there is no
     `settlementId`/`by_settlement` index or uniqueness guard.
  2. **No dedup key** — a transaction's identity is its `_id`; a bug that
     double-invokes a credit would create two rows (balance would double).
     The current single-caller + state gate mitigates but doesn't structurally
     prevent it.
  3. **Balance is mutable truth** — `wallets.balance` is patched in place;
     an audit cannot reconstruct balance from `transactions` alone being
     guaranteed-consistent (sum(rows) is not enforced against balance).
  4. **No direction completeness** — `type: credit|debit` exists, but nothing
     records *why* beyond a description string.

A future reconciliation event *can* be audited via `audit_events` (payment +
settlement lifecycle events already recorded), but **not** structurally via
`transactions`. Recommended (not implemented): add an optional
`settlementId` field + `by_settlement` unique-able index on `transactions`, and
treat sum-of-transactions as the source of truth with balance as a cache.

---

## 12. Reconciliation Read Model (implemented)

**Status: implemented as a pure read model** —
`src/convex/payments/reconciliation.ts` → `getOrderReconciliation`.
Nothing is persisted; there is no reconciliation table.

### What it is

A **privileged, read-only** query that derives the current financial
relationship for one order from the existing authoritative records:

| Source | Used for | Index |
|---|---|---|
| `orders.price` | authoritative customer charge | `get` |
| `delivery_quotes` (newest by `calculatedAt`) | pricing breakdown, consistency checks | `by_order` |
| `payment_transactions` | server-verified customer payments | `by_order` |
| `settlements` | driver entitlement + lifecycle | `by_order` |
| `deliveries` | context (status, courier reference) | `by_order` |

### Authorization

Gated by the existing **`settlement:view`** permission (operations,
company_admin, super_admin). Drivers and customers structurally cannot call it
— their roles lack the permission. The query accepts **`orderId` only**; no
driver/settlement/payment IDs or amounts are accepted as input.

### Reconciliation states (derived, never persisted)

| State | Meaning |
|---|---|
| `RECONCILED` | customer payment verified (completed + amount = `orders.price`) AND settlement exists AND settlement `completed` |
| `UNPAID` | no completed payment, no settlement |
| `PAID_NO_SETTLEMENT` | customer paid; no settlement (delivery not completed, or failed/cancelled per compensation policy) |
| `SETTLEMENT_PENDING` | settlement `pending`/payable (with or without payment — both map here via the matrix) |
| `SETTLEMENT_PROCESSING` | settlement marked `processing` by an authorized operator |
| `ANOMALY` | records disagree (see below) — surfaced with diagnostics, never auto-corrected |

State precedence: any anomaly → `ANOMALY`; otherwise the payment × settlement
matrix; `RECONCILED` requires settlement `completed` specifically — `pending`
is **never** reinterpreted as paid. A `failed`/`disputed` settlement on a paid
order is an anomaly for operator attention.

### Anomaly detection

The query checks and reports (without modifying anything):

1. completed payment `amount` vs `orders.price`
2. `orders.price` vs quote `totalCharge`
3. settlement `driverEarnings` vs quote `driverEarnings`
4. multiple completed payments for one order (possible duplicate charge —
   never silently collapsed)
5. multiple settlements for one order (idempotency violation)
6. order not found; multiple quotes (informational)

### Customer payment determination

`customerPaid` ⇔ exactly one completed `payment_transactions` row whose
`amount` equals `orders.price`. Failed/pending attempts never count; attempts
are never summed. Provider confirmation must already be server-verified (the
payment layer guarantees this).

### Platform revenue

`platformRevenue = quote.totalCharge − quote.driverEarnings`, derived from the
**stored quote only** — no pricing recalculation. The result is explicitly
labelled *derived* revenue: it is **not** recognized accounting revenue and
**not** a payout.

### Explicit limits

> **`RECONCILED` does NOT mean the platform has completed accounting, and it
> does NOT mean a driver payout has occurred.** Settlement `completed` records
> the wallet-credit event from the settlement lifecycle; the payout-eligibility
> rule (Model A/B/C) remains an unresolved business decision (§4). This read
> model moves no money, credits no wallet, completes no settlement, and
> initiates no payout.

### Response shape

Structured object: `order` / `quote` / `customerPayment` / `settlement` /
`reconciliation` (state, customerPaid, driverEntitled, platformRevenue,
anomalies) / `delivery` / `actorRole` / `derivedAt`. Only safe stored
references are exposed (payment idempotency key = Paystack reference,
provider transaction ID, `SET-{settlementId}` wallet-transaction reference
format). No secrets, no card data, no wallet state.

### Tests

`src/convex/testing/reconciliation.test.ts` (18 assertions) covers the source
indexes, no-write invariants, permission gating (driver/customer exclusion),
`orderId`-only args, paid/failed rules, duplicate-payment anomaly, all
settlement statuses, the full state matrix, all anomaly checks, revenue
derivation, and reference hygiene. Run:
`bunx tsx src/convex/testing/reconciliation.test.ts`.

---

## 13. Payout Eligibility Policy (implemented)

> **Policy status: current implementation policy pending business sign-off.**
> Model B was chosen because it is the only model consistent with the existing
> architecture (settlement creation at DELIVERED is already wired and was not
> changed). It is **not** a business-confirmed rule — §4's unresolved decision
> still requires product/finance sign-off before it should be treated as final.

### Current policy (Model B)

A settlement is **payout-eligible** only when ALL of the following hold:

1. **Delivery** exists and is in the `DELIVERED` terminal state.
2. **Settlement** exists, is the unique settlement for its order, and its
   identity matches the settlement being evaluated.
3. **Settlement status** is `pending` (payable) or `processing` (payout
   already in progress by an authorized operator — re-checking eligibility
   must not flip an in-flight lifecycle to ineligible). `completed` →
   already paid; `failed`/`disputed` → blocked.
4. **Settlement amount** equals the stored quote's `driverEarnings`.
5. **Customer payment** is verified: a `completed` `payment_transactions`
   row whose amount equals `orders.price` (the same `customerPaid` rule the
   reconciliation model uses).
6. **Zero reconciliation anomalies** (amount mismatches, duplicate completed
   payments, duplicate settlements, disputed states). `ANOMALY` always blocks.

### Rejected conditions → reason codes

`ELIGIBLE` · `DELIVERY_MISSING` · `DELIVERY_NOT_COMPLETED` · `NO_SETTLEMENT` ·
`SETTLEMENT_NOT_PAYABLE` · `SETTLEMENT_ALREADY_PAID` ·
`CUSTOMER_PAYMENT_PENDING` · `PAYMENT_FAILED` · `PAYMENT_AMOUNT_MISMATCH` ·
`FINANCIAL_ANOMALY`. One reason per evaluation; first blocking check wins
(delivery → settlement → payment → anomalies). Anomalies are reported, never
auto-corrected, and no record is ever chosen arbitrarily.

### Relationship to reconciliation (single source of truth)

The financial interpretation was extracted into
`src/convex/payments/_reconcile.ts` (`evaluateOrderFinancials`) — a plain
module shared by:

- the reconciliation read model (`payments/reconciliation.ts`),
- the eligibility gate (`payments/payoutEligibility.ts`), and
- the hardened settlement lifecycle (`pricing/service.ts`).

There is no duplicated payment/settlement/anomaly logic anywhere; the helper
imports nothing from function modules, so there are no circular dependencies.
Both read models remain pure reads.

### The eligibility operation

`checkSettlementPayoutEligibility` (`payments/payoutEligibility.ts`):
- **Query, read-only** — accepts `settlementId` only; resolves every financial
  fact server-side; never moves money, never creates payout records, never
  touches settlement status, wallets, or transactions.
- **Authorization**: `settlement:view` (operations / company_admin /
  super_admin). Drivers and customers cannot invoke it. A duplicate
  `evaluateInternal` internal query serves the settlement lifecycle mutations
  and is unreachable from React.
- Returns: `eligible`, `reason`, `settlementId`, `orderId`, `deliveryId`,
  `driverId`, `settlementAmount`, `customerPaymentAmount`,
  `reconciliationState`, `anomalies`, timestamps.

### Settlement completion hardening

`processSettlement` and `completeSettlement` now invoke the eligibility gate
(via `evaluateInternal`) before advancing the lifecycle. The system can no
longer mark a settlement `completed` while the customer payment is unpaid,
verification failed, amounts mismatch, or reconciliation is anomalous — the
mutation throws with the reason code and anomaly diagnostics. Existing state
gates (`pending` → `processing` → `completed`) and idempotency are preserved:
a repeated completion attempt still throws before any wallet credit, and the
gate classifies completed settlements as `SETTLEMENT_ALREADY_PAID`.

### Wallet interpretation (documented, unchanged)

Crediting the driver's Lasha wallet in `completeSettlement` moves the amount
from *payable* to **paid into the driver's internal balance**. It does **NOT**
represent an external bank payout — no payout provider exists. Any future
external payout layer must be built on top of this boundary and reconcile
against the transactions ledger.

### Eligibility ≠ payout

Payout eligibility is a **precondition**, not an event. An eligible settlement
is still `pending`/`processing`; nothing has been paid, no wallet credited, no
bank transfer initiated. Actual payout remains the (now gated, still manual)
`processSettlement`/`completeSettlement` lifecycle until a payout provider is
integrated.

### Tests

`src/convex/testing/payoutEligibility.test.ts` (20 assertions) covers the full
reason matrix, Model B wiring, shared-helper reuse (no duplicated rules, no
circular imports), read-only invariants, lifecycle hardening ordering
(state gate → eligibility gate → credit), authorization exclusion, and the
structured result shape. Run:
`bunx tsx src/convex/testing/payoutEligibility.test.ts`.
