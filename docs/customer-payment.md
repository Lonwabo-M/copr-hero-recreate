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

**Payment state machine** (`payment_transactions.status`, from the schema):

| Status | Meaning | Entered by |
|---|---|---|
| `pending` | Checkout created, awaiting provider confirmation | Initiation |
| `processing` | Reserved by the schema; not currently used by the flow | — |
| `completed` | Server-verified success (the authoritative "paid") | Provider evidence only (verify `success` / webhook `charge.success`) |
| `failed` | Provider reported failure | Provider evidence only |
| `refunded` | Minimal representation; no refund workflow yet | Not currently entered |

A checkout URL is **not** success. Only provider evidence moves the record to
`completed`.

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
| `provider` | `paystack` |
| `providerTransactionId` | Paystack transaction ID, attached at verification |
| `status` | State machine above |
| `createdAt` / `completedAt` | Lifecycle timestamps |
| `metadata` | Attempt counter / failure reason (no credentials, no card data) |

Indexes: `by_order`, `by_user`, `by_status`, `by_idempotency`, `by_provider`.

---

## 4. Security

**Credential handling.** `PAYSTACK_SECRET_KEY` is read only inside
`payments/actions.ts` (a Convex action) and the webhook route. It is never
returned to the client, never logged, never stored in records or audit events.
The client receives only `{ alreadyPaid, reference, authorizationUrl }`.

**Card-data boundary.** Card details are collected only by Paystack's hosted
checkout. The public payment surface has no card/OTP fields, no direct
`/charge`/`/submitOTP` calls, and no action args carrying PAN, expiry, CVV, or
bank codes. Only the server-side secret key can initialize or verify a payment.

**Amount integrity.** The charge is read server-side from the stored order
(`internal.payments.queries.getAuthorizedOrderForPayment` → `order.price`).
The initiation action takes `orderId` plus an optional legacy `"card"` literal
(kept only for compatibility with the already-deployed action); amount and
recorded method are resolved server-side. There is no amount input in Checkout.
If Paystack's verification reports an amount differing from the stored charge,
completion is refused. Payment is refused server-side for cancelled orders,
cancelled/failed deliveries, refunded payments, and non-positive amounts.
Checkout reads payment state from `payments.queries.getMyPaymentOverview`,
which returns the latest
`payment_transactions` row for each of the customer's orders; Checkout selects
the row for the order being paid. Payment state is never inferred from delivery
status.

**Authorization.** Identity always resolves from the authenticated session:
- Initiation: the order's sender (or super admin); drivers, fleet managers and
  operations are explicitly rejected.
- Verification: the payer of the transaction (or super admin).
- Payment-status queries: customers see their own orders, company admins their
  business's; drivers/operations get no customer payment data.
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

**Currently implemented:** the `refunded` status literal exists in the schema
(minimal state representation). Nothing enters or processes it.

**Future rules to establish (not yet decided — no amounts or policy fabricated):**

1. A verified refund must transition `payment_transactions → refunded` from
   provider evidence (webhook `refund.processed` / verify), never client input.
2. Order financial state after refund (re-chargeable? cancelled?) needs an
   explicit business rule.
3. If a refund lands on an order whose settlement is `completed` (driver
   already paid), the payout side needs a claw-back policy. This is exactly
   why reconciliation is deliberately deferred.
4. Refunds must be audited (`PAYMENT_REFUNDED` action already exists).

---

## Idempotency Summary

- One order → one deterministic reference (attempt-scoped after failures).
- Transaction creation re-checks `by_idempotency` before inserting.
- Completion/failure mutations short-circuit on their existing terminal state;
  duplicate webhooks and repeated verifies cannot double-complete.
- A `failed` transaction cannot be resurrected by a late success event; the
  retry path mints a fresh reference instead.
- An already-paid order refuses re-initiation (`alreadyPaid: true`).

## Testing

`src/convex/testing/payment.test.ts` — 33 assertions covering the model,
authorization, amount integrity, state machine, idempotency, webhook security,
settlement/delivery separation, credential hygiene, and UI integrity. Run:
`bunx tsx src/convex/testing/payment.test.ts`.

## Remaining Limitations

- `processing` status is reserved but unused by the current flow.
- Wallet payments are implemented for delivery checkout: the stored order
  amount is debited from the Lasha wallet in the same mutation that records the
  completed payment.
- Wallet top-ups use Paystack hosted checkout. Provider verification or a
  signature-verified webhook credits the wallet exactly once.
- Wallet-to-wallet transfers and external withdrawals are not implemented.
- No standalone payment-history page: payment state appears on the order
  Checkout and delivery tracking. A customer-wide payment ledger is future work.
- Reconciliation between customer payments and driver settlements is a
  deliberately separate future task.
