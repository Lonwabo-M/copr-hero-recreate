# Lasha — Customer Payment

> Status: implemented. Customer payment lifecycle built on the existing Convex
> financial architecture (2026-09-12). **A successful customer payment does NOT
> pay the driver and does NOT complete a delivery.**

---

## 1. Payment Lifecycle

```
Order created (createOrderAndDelivery)
  → Authoritative charge stored (orders.price ← delivery_quotes.totalCharge)
  → Customer opens the order-scoped Checkout (/checkout/:orderId), directly
    after creation or later from delivery tracking
  → Payment initiated (payments.actions.initiateOrderPayment)
      → pending payment_transactions record (deterministic reference)
      → Paystack transaction/initialize → checkout URL
  → Customer pays on Paystack's hosted page, or pays from their Lasha wallet
  → Return to /checkout/:orderId?reference=…
      → payments.actions.verifyOrderPayment (server-side Paystack verify)
  → AND/OR Paystack webhook → /payments/paystack/webhook
      → signature verified → processWebhookEvent (internalAction)
  → payment_transactions = completed | failed | pending
```

There is no standalone Make Payment page. Payment belongs to one order, and
the same Checkout is the resumable path for an unpaid delivery (linked from
delivery tracking). The wallet is a payment method inside Checkout, not a
separate payment destination.

Both verification paths converge on the same guarded internal mutations, so the
webhook and the customer's return-verify are mutually idempotent.

### Cross-method lock (card + wallet)

Only **one completed payment per order** is authoritative, regardless of method
or provider reference. The shared policy lives in
`payments/_paymentAttempts.ts` and is enforced inside Convex mutations:

- A wallet debit is refused while any `pending`/`processing` card attempt can
  still succeed. Its oldest open attempt is verified with Paystack first:
  - provider `success` → the card is completed; the wallet is not debited;
  - provider `failed` / `abandoned` / `reversed` → that attempt is closed and
    the wallet may proceed;
  - `ongoing` / `pending` / unknown status → the wallet is blocked.
- A card attempt cannot be created after any payment has completed (including
  a wallet payment).
- A provider success for a second attempt is quarantined as a duplicate: the
  attempt is written as `failed` with `duplicatePayment`, `refundRequired`,
  and `duplicateOf` metadata. It is **not** credited or counted as a second
  completion. The same transaction writes one `payment_refunds` row and
  schedules an automatic Paystack refund for the full quarantined amount.
- An already-open card attempt that succeeds after the order's payment was
  refunded is quarantined the same way (`paymentAfterRefund`, `refundRequired`)
  and enters the same automatic-refund path. A refunded order must not become
  paid again through a checkout opened before the refund.
- `refundRequired` clears only when Paystack reports `refund.processed` (or an
  existing processed refund is found for the transaction). A refund that is
  pending, rejected, or cannot be requested stays flagged for manual review.
  Payout eligibility remains blocked while the flag is present.

**Payment state machine** (`payment_transactions.status`, from the schema):

| Status | Meaning | Entered by |
|---|---|---|
| `pending` | Checkout created, awaiting provider confirmation | Initiation |
| `processing` | Reserved by the schema; not currently used by the flow | — |
| `completed` | Server-verified success (the authoritative "paid") | Provider evidence only (verify `success` / webhook `charge.success`) |
| `failed` | Provider reported failure | Provider evidence only |
| `refunded` | General refund/reversal terminal state | Reserved; automatic duplicate refunds keep the duplicate as `failed` and track their own `payment_refunds` row, so the original completed payment stays authoritative |

A checkout URL is **not** success. Only provider evidence moves the record to
`completed`. A record previously marked `failed` may still become `completed`
when a later verification or webhook proves the provider actually charged it.
Provider success is authoritative; otherwise a customer could remain charged
while the order stays unpaid. The completed guard keeps replayed events safe.

---

## 2. Provider — Paystack

Paystack was selected because the repository was already architected for it:
`docs/architecture.md` designates Paystack as the payment gateway (§6.3 action
pattern with `transaction/initialize`, §12.1 services map, `PAYSTACK_SECRET_KEY`
in §16.3). The schema's `payment_transactions` table (provider, cents-amounts,
`by_provider` index) matches its model. No new payment dependency was added —
the integration uses plain `fetch` against `api.paystack.co`, consistent with
the existing action pattern.

Endpoints used:
- `POST /transaction/initialize` — amount in kobo (= our stored cents), ZAR,
  deterministic `reference`; returns Paystack's hosted checkout URL
- `GET /transaction/verify/{reference}` — authoritative status check
- Webhook `POST /payments/paystack/webhook` (Convex HTTP route) —
  `charge.success` / `charge.failed`

**Paystack dashboard webhook URL.** Paystack must call the backend's
`.convex.site` route, not the frontend `SITE_URL`:

```
https://incredible-warbler-335.convex.site/payments/paystack/webhook
```

The path is implemented by `src/convex/http.ts`. The dashboard configuration is
separate from `SITE_URL` (which only controls where the customer returns after
hosted checkout). No application code change is needed when the dashboard
already points at that URL.

**Card data never enters Lasha.** The customer enters card details on
Paystack's hosted page. There is no direct `/charge` call, no OTP relay, and no
public action accepting a card number, expiry, CVV, or bank OTP. This keeps the
application out of card-data scope; Paystack remains responsible for collecting
and tokenising the instrument.

---

## 3. Internal Payment Record

Existing `payment_transactions` table — reused, not re-created:

| Field | Value |
|---|---|
| `idempotencyKey` | `pay-{orderId}` (retry attempts: `pay-{orderId}-r{n}`) — also the Paystack `reference` |
| `orderId` | The order being paid |
| `userId` | The authenticated payer, resolved server-side |
| `amount` | Copied from the authoritative `orders.price` (cents ZAR) |
| `currency` | `ZAR` |
| `method` | `card` (hosted checkout) \| `wallet` (the server sets this; the client cannot choose it) |
| `provider` | `paystack` for card; `lasha_wallet` for wallet |
| `providerTransactionId` | Paystack transaction ID, attached at verification |
| `status` | State machine above |
| `createdAt` / `completedAt` | Lifecycle timestamps |
| `metadata` | Attempt counter / failure reason / duplicate-refund flag (no credentials, no card data) |

Indexes: `by_order`, `by_user`, `by_status`, `by_idempotency`, `by_provider`.

---

## 4. Security

**Credential handling.** `PAYSTACK_SECRET_KEY` is read only inside
`payments/actions.ts` (a Convex action) and the webhook route. It is never
returned to the client, never logged, never stored in records or audit events.
The client receives only payment-safe fields (`alreadyPaid`, `reference`,
`authorizationUrl`, or the wallet result) — never the secret key or provider
internals.

**Card-data boundary.** Card details are collected only by Paystack's hosted
checkout. The public payment surface has no card/OTP fields, no direct
`/charge`/`/submitOTP` calls, and no action args carrying PAN, expiry, CVV, or
bank codes. Only the server-side secret key can initialize or verify a payment.

**Amount integrity.** The charge is read server-side from the stored order
(`internal.payments.queries.getAuthorizedOrderForPayment` → `order.price`).
The initiation action takes `orderId` plus an optional legacy `"card"` literal
(kept only for compatibility with the already-deployed action); amount and
recorded method are resolved server-side. There is no amount input in Checkout.
If Paystack's verification reports a missing, non-integer, or differing amount,
completion is refused. Payment is refused server-side for cancelled orders,
cancelled/failed deliveries, refunded payments, and non-positive amounts.
Checkout reads payment state from `payments.queries.getMyPaymentOverview`,
which returns authoritative order-level `paid` and `refunded` facts (derived
from any attempt), the latest attempt for labelling, and
`hasOpenCardCheckout`. A newer failed duplicate-charge quarantine must never
make an already-paid order look unpaid. Payment state is never inferred from
delivery status.

The customer-facing quote projection also withholds the internal 30/70 split:
`getQuoteForOrder` returns the delivery charge and breakdown to the sender, but
`platformFee` and `driverEarnings` are only returned to operations/admin
roles. Checkout does not display a platform-fee line; the split is deducted
from the delivery fee internally and is never added on top.

**Authorization.** Identity always resolves from the authenticated session:
- Initiation: the order's sender (or a super admin resolving the order). The
  Customer Portal is open to every authenticated role and order creation only
  requires a session, so a sender's role is not a payment restriction. A
  non-owner is rejected by the same server-side ownership check.
- Verification: the payer of the transaction (or super admin).
- Payment-status queries: every role sees payment state for orders they sent;
  company admins additionally see their business's orders. No cross-customer
  payment data is returned, regardless of role.
- All payment record mutations are `internalMutation`s — there is no public
  mutation accepting `{ paymentSuccessful: true }`.

**Webhook security.** The route verifies `x-paystack-signature` (HMAC-SHA512 of
the raw body with the secret key) **before** any processing; invalid signatures
get `401` with zero state changes. The internal transaction is resolved by the
payload `reference` (our idempotency key) — payload order IDs are never
trusted. `processWebhookEvent` is an `internalAction`, not publicly invokable.
Unknown references are acknowledged (200) but ignored.

---

## 5. Financial Boundary

These are distinct financial events:

```
1. Customer charge      → orders.price / delivery_quotes.totalCharge
2. Customer payment     → payment_transactions  (completed = customer paid)
3. Driver settlement    → settlements            (pending = driver is owed)
4. Driver payout        → wallets/transactions   (future task)
```

Explicitly **not** implemented, by design:

- Successful customer payment does **not** call `processSettlement` or
  `completeSettlement`. A paid order and a paid driver are different facts;
  connecting them is a future reconciliation-policy decision.
- Successful payment does **not** change delivery or order state. The delivery
  state machine is untouched by the payment layer.
- Driver Earnings UI and payout automation remain unbuilt (per task scope).

Layer 2 (settlement) documentation: see `docs/driver-earnings-settlement.md`.

---

## 6. Refund / Reversal

**Implemented — automatic duplicate-charge refunds:** a verified duplicate
charge (or a charge that succeeds after the order was refunded) is quarantined
and a `payment_refunds` row is created in the same mutation. A scheduled
action checks Paystack for an existing refund before calling the refund API,
so retries and a finance refund already made in the dashboard cannot create a
second refund. Only `refund.processed` clears `refundRequired`, writes the
`payment.refunded` audit event, and notifies the customer. The quarantined
payment stays `failed`; it is not promoted to the authoritative payment.

Paystack refund requests are at-most-once. A failure, ambiguous response, or
stuck request hands the charge to manual review instead of retrying blindly.
The `payment_refunds` row records status, provider refund id/reference, amount,
attempt count, and failure reason for finance. An hourly backfill finds
quarantined charges that have no refund row (including charges created before
this path existed) and queues them through the same idempotent processor.

**General refunds remain manual:** the `refunded` status literal is still
reserved for a full refund/reversal of the authoritative payment. Dispute
refunds, partial refunds, cancellation refunds, and wallet/settlement
claw-backs are policy decisions, not automatic. Their future rules:

1. A verified general refund must transition `payment_transactions → refunded`
   from provider evidence (webhook `refund.processed` / verify), never client
   input.
2. Order financial state after refund (re-chargeable? cancelled?) needs an
   explicit business rule.
3. If a refund lands on an order whose settlement is `completed` (driver
   already paid), the payout side needs a claw-back policy.
4. General refunds must be audited. Automatic duplicate refunds already use
   `PAYMENT_REFUND_REQUESTED`, `PAYMENT_REFUNDED`, and `PAYMENT_REFUND_FAILED`.

---

## Idempotency Summary

- One order → one deterministic reference (attempt-scoped after failures).
- Transaction creation re-checks `by_idempotency` before inserting.
- Completion/failure mutations short-circuit on their existing terminal state;
  duplicate webhooks and repeated verifies cannot double-complete.
- A later verified provider success may recover a `failed` attempt; the
  completed guard prevents duplicate credit on replayed events.
- An already-paid order refuses re-initiation and wallet debit
  (`alreadyPaid: true`), including when the latest attempt is a failed
  duplicate-charge record.
- A second verified provider success is quarantined as `failed` with
  `refundRequired` rather than becoming a second completion; one
  `payment_refunds` row is created and the automatic Paystack refund is
  scheduled.
- Existing Paystack refunds are checked before a new refund is requested, and
  only a queued refund can be claimed, so an action retry cannot double-refund.

## Testing

`src/convex/testing/payment.test.ts` — 35 assertions covering the model,
authorization, amount integrity, state machine, idempotency, webhook security,
settlement/delivery separation, credential hygiene, and UI integrity.
`src/convex/testing/paymentRace.test.ts` — 19 pure policy tests for the
card/wallet locks, duplicate completion quarantine, late failure recovery,
provider status classification, and refund-flag semantics.
`src/convex/testing/refund.test.ts` — 18 assertions covering the refund model,
at-most-once claim, existing-refund adoption, status transitions, webhook
authority, and reconciliation behavior.
`src/convex/testing/refundProvider.test.ts` — 5 mocked Paystack contract tests
for the refund lookup/create endpoints, amount normalisation, and failure
handling. Run:
`bunx tsx src/convex/testing/payment.test.ts`,
`bunx tsx src/convex/testing/paymentRace.test.ts`,
`bunx tsx src/convex/testing/refund.test.ts`, and
`bunx tsx src/convex/testing/refundProvider.test.ts`.

## Remaining Limitations

- `processing` status is reserved but unused by the current flow.
- Wallet payments are implemented for delivery checkout: the stored order
  amount is debited from the Lasha wallet in the same mutation that records the
  completed payment.
- Wallet top-ups use Paystack hosted checkout. Provider verification or a
  signature-verified webhook credits the wallet exactly once. A top-up marked
  failed may still be credited by a later verified provider success, so a late
  successful charge is not stranded.
- Automatic refunds cover duplicate/post-refund quarantines only. General,
  partial, cancellation, and dispute refunds — including settlement/wallet
  claw-backs — remain manual policy decisions.
- A duplicate refund that Paystack rejects, cannot be requested, or leaves in
  an ambiguous state stays flagged for manual refund review.
- Wallet-to-wallet transfers and external withdrawals are not implemented.
- No standalone payment-history page: payment state appears on the order
  Checkout and delivery tracking. A customer-wide payment ledger is future work.
- Reconciliation between customer payments and driver settlements is a
  deliberately separate future task.
