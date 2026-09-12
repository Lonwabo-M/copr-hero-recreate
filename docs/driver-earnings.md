# Lasha — Driver Earnings

> Status: implemented. A read-only Driver Earnings experience for the Driver App,
> backed by authoritative settlement/payment/reconciliation records. No external
> payout integration, no wallet cash-out, no settlement mutation exposed to the
> driver.
>
> **A settlement being created or completed does NOT mean the driver has been
> externally paid.** There is no external payout integration yet.

---

## 1. Earnings Sources

Every amount shown on the Driver Earnings page comes from authoritative stored
records, never from recalculated pricing or invented values:

| Displayed value | Source | Notes |
|-----------------|--------|-------|
| Earned from completed deliveries | `settlements.driverEarnings` for `status = completed` | Sum of stored settlement amounts |
| Payable / pending | `settlements.driverEarnings` for `status = pending` or `processing` | Payable now, not yet paid out |
| Eligible for payout | `settlements.driverEarnings` where `getSettlementDriverEligibility` returns `eligible: true` | Model B gate (delivery completed + customer paid + no anomaly) |
| Paid out | **Not available** — shown as "No external payouts recorded" | No external payout integration exists |

Amounts also use the stored `delivery_quotes.driverEarnings` for cross-checks
(quote vs settlement consistency), but the **authoritative earning amount is
always `settlements.driverEarnings`**.

The page does not recalculate pricing, platform fees, or distances in React. It
does not compute earnings from `orders.price` or `orders.amount` directly.

## 2. Financial Terminology

The UI and backend use the following distinctions consistently. These are NOT
interchangeable:

- **Earned** — the driver earned this amount from a completed delivery, recorded
  as `settlements.driverEarnings` for a `completed` settlement.
- **Payable** — a settlement exists in `pending` or `processing` status; the
  driver is entitled to it internally but it has not been externally paid.
- **Payout eligible** — the settlement satisfies the payout-eligibility gate
  (delivery completed, customer payment verified, no financial anomaly). This is
  a backend evaluation, not a guarantee that payout will occur.
- **Settlement completed** — the internal settlement record has reached
  `completed` status (wallet credited internally by `completeSettlement`). This
  is **not** the same as an external bank payout.
- **Paid out** — the driver has received external funds. **This state is not yet
  implemented.** The Driver Earnings page always shows "No external payouts
  recorded" for this category.

The page deliberately never uses terms like "Paid", "Withdrawn", "Cash received",
or "Bank payment" for anything other than actual external payouts, which do not
exist yet.

## 3. Current Payout Limitation

There is **no external driver payout integration** in the current system.

What exists:

- `settlements` with `pending` / `processing` / `completed` / `failed` /
  `disputed` states
- `completeSettlement`, which credits the driver's internal wallet and inserts a
  `transactions` credit record
- `checkSettlementPayoutEligibility` (privileged, `settlement:view`) and the
  driver-safe `getSettlementDriverEligibility` wrapper
- `getOrderReconciliation` (privileged, `settlement:view`)

What does **not** exist:

- Paystack Transfers integration
- bank payout / EFT / cash-out
- withdrawal requests
- payout destinations / bank accounts on file
- any automated flow that calls `processSettlement` / `completeSettlement` for
  external payout
- refund / reversal handling

The `completed` settlement status represents **internal settlement completion**
(wallet credit), not external payment. Until an external payout integration
exists, the Driver Earnings page presents completed settlements as "Settlement
completed", never as "Paid".

## 4. Driver Authorization

Driver identity is **always resolved server-side** from the authenticated Convex
session.

- `getDriverEarnings` — rejects non-drivers; derives `driverId` from
  `getCurrentAuthUser(ctx).userId`; no `driverId` accepted from the client.
- `getDriverEarningsSummary` — same pattern.
- `getSettlementDriverEligibility` — driver only; enforces
  `settlement.driverId === user.userId`; a driver inspecting another driver's
  settlement receives a safe "Not found" rather than a denial that leaks
  existence.

A driver cannot access another driver's earnings by manipulating the URL, query
parameters, or client state. The backend is the security boundary; Convex
authorization is authoritative.

## 5. Relationship to Reconciliation

The Driver Earnings page **consumes** authoritative financial data but does **not
alter** it.

- Earnings amounts are derived from `settlements` + stored `delivery_quotes`.
- Payout eligibility is derived from `evaluateOrderFinancials` (the same shared
  financial evaluation used by the privileged reconciliation and payout-eligibility
  operations), using the Model B rule.
- The driver-facing eligibility wrapper (`getSettlementDriverEligibility`)
  exposes only a simple label (`Eligible` / `Not yet eligible` / `Not payable` /
  `Already settled` / `Not available`) and a safe reason — never reconciliation
  diagnostics, provider references, platform revenue, or internal settlement IDs.

The page does not:

- create, patch, or complete settlements
- credit wallets
- trigger payouts
- modify payment state
- expose privileged reconciliation diagnostics

## 6. UI Architecture

- Route: `/driver/earnings` — protected by the `DRIVER` `RoleGate`.
- Shell: `DriverShell` with `activeItem="Earnings"`.
- Navigation: added to `driverNavigation` as `{ label: "Earnings", route: "/driver/earnings" }`.
- Sidebar icon: `TrendingUp` (via the central `ICONS` registry in `Sidebar.tsx`).
- Page layout:
  - Summary band: Total earned / Payable / Eligible for payout / Paid out
    (Paid out always shows "No external payouts recorded").
  - Earnings list: each item shows delivery reference, earning amount, settlement
    status label, payout eligibility label, and date.
  - Clicking an item navigates to the existing `/driver/history/:deliveryId` page
    for detail (no separate earnings-detail route is registered).
- Filters: status (All / Payable / Settled / Not payable) and date window
  (Any time / Last 7 / 30 / 90 days), both server-side, both reset cursor
  pagination.
- Pagination: server-side cursor via `getDriverEarnings` (page size 20).

## 7. Settlement Status Presentation

The page translates internal settlement statuses into clear driver-facing labels
without changing their meaning:

| Internal status | Driver-facing label |
|-----------------|---------------------|
| `pending` | Payable |
| `processing` | Processing |
| `completed` | Settlement completed |
| `failed` | Not payable (failed) |
| `disputed` | Not payable (disputed) |

"Payable" and "Processing" describe the current state of an internal settlement
record. They do **not** mean the driver has been paid.

## 8. Payout Eligibility Presentation

Where the backend can determine it, the page shows payout eligibility using the
driver-safe wrapper. The driver sees:

- **Eligible** — the settlement satisfies the Model B gate.
- **Not yet eligible** — awaiting customer payment, payment failed, amount
  mismatch, delivery not completed, or financial review required.
- **Not payable** — settlement failed, disputed, or amount mismatch.
- **Already settled** — settlement is `completed`.
- **Not available** — financial data unavailable.

The page never exposes the underlying reason code verbatim where it would reveal
internal diagnostics, and never shows provider references, platform revenue, or
internal settlement IDs.

## 8.1. Payout Eligibility Policy (current implementation)

The driver-facing eligibility uses **Model B** (the recommended policy from
`docs/payment-settlement-reconciliation.md`):

A settlement is payout-eligible only when:

- the delivery is `delivered`
- a verified completed customer payment exists with amount matching `orders.price`
- the settlement exists, belongs to that delivery/driver, and is in a payable
  status (`pending` or `processing`)
- no reconciliation anomaly exists (payment amount mismatch, quote/order mismatch,
  settlement amount mismatch, multiple completed payments, multiple settlements,
  etc.)

This policy is implemented in `getSettlementDriverEligibility` by reusing
`evaluateOrderFinancials` and is marked **provisional / pending business sign-off**
in the reconciliation docs. Do not treat it as a finalized business rule.

## 9. Wallet Interpretation

The driver's wallet (when it exists) represents an **internal payable balance**
credited by `completeSettlement`. It is **not**:

- a bank balance
- cash in bank
- an external payout

The Driver Earnings page does not treat wallet balance as an external payout. The
"paid out" category is always "No external payouts recorded".

## 10. Read-Only Guarantee

The first Driver Earnings implementation is **read-only**.

The page uses only Convex queries:

- `api.driver_earnings.getDriverEarnings`
- `api.driver_earnings.getDriverEarningsSummary`
- `api.driver_earnings.getSettlementDriverEligibility` (per-item eligibility,
  used reactively)

No Convex mutations are exposed to the driver from this page.

## 11. Relationship to Driver History

The Driver Earnings page complements `/driver/history` rather than duplicating it.

- Earnings list items link to `/driver/history/:deliveryId` for detail.
- No separate `/driver/earnings/:deliveryId` route exists.
- The page reuses the same design language (`driver.css`) and driver shell.

## 12. Remaining Limitations

- No external payout integration (Paystack Transfers, bank payouts, cash-out).
- No payout destination / bank account management.
- No withdrawal requests.
- No refund / reversal handling.
- "Paid out" is always "No external payouts recorded".
- Payout eligibility policy is Model B and provisional.
- The page shows the page-level summary over the current page's items plus the
  authoritative summary query; a lifetime total across all pages would require
  either accumulating pages or a separate aggregate query (the authoritative
  summary query covers this).
