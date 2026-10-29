# Lasha Logistics — response to counterparty due diligence questions

**Prepared:** 29 October 2026  
**Applies to:** the Lasha platform published at `lasha.freebuff.app` (source of truth for the controls described here)  
**Questions answered:** KYC collection, enhanced due diligence, acceptable use, payment flow, dispute handling

This document answers the five questions in the order received. Each answer describes what the platform
actually does, names the document or screen that evidences it, and states the limits plainly — a due
diligence answer that overstates a control is worse than one that names the gap.

The responsible party is **CLADOGRAM**, a private company registered with the CIPC under
**2024/063751/07**, trading as **Lasha**, with its registered office at 333 Main Street,
Lemoenkloof, Paarl, Western Cape, 7646.

---

## 1. What KYC information do you collect from people who sign up?

Lasha has two populations, and the collection is deliberately different for each.

### 1.1 Customers (people and businesses sending parcels)

| Collected at | Data | Why |
|---|---|---|
| Sign-up (`/auth`) | Email address, password (hashed by Convex Auth), email verification and password-reset codes | Account, authentication, security notices |
| Customer onboarding (`/onboarding/customer`) | Full name, mobile number | Contact for the collection and delivery |
| Business details (business accounts) | Business legal name, business type, CIPC registration number, business phone, registered business address | Contracting party, invoicing, legal service |
| Address book | Collection and delivery addresses, contact name and phone for the recipient | Performing the delivery |
| Payments | Name, email, amount, payment reference (sent to Paystack) | Taking payment; card data never reaches Lasha |

Customer KYC is **not** full FICA-style onboarding. Lasha is a logistics platform, not a bank or
insurer: the customer pays for a service before it is performed, so the risk being managed is
fraudulent ordering and chargebacks, not deposit-taking. The controls for that risk are verified email
and password authentication, a verified Paystack transaction before dispatch, the 7-day claims window,
and the audit trail on every order and delivery.

**Not collected from customers:** SA ID number, passport, proof of address, bank statements, tax
number, source of funds, biometric data.

### 1.2 Drivers (people who carry parcels)

A driver account is created with an email and password. Before the account can be dispatched work, the
driver must submit an application in the Driver App (`/driver/apply`) containing:

| Category | Data collected |
|---|---|
| Identity | First name, surname, 13-digit South African ID number, mobile number |
| Identity documents | A copy of the identity document (JPG, PNG, WebP or PDF) |
| Driving licence | Licence class (e.g. "B Code 08"), licence number, and a copy of the driving licence |
| Vehicle | Make, model, year, load capacity (kg), registration/licence plate, handling capabilities (fragile, express, flammable, trailer) |

The ID number is validated server-side before it is stored: exactly 13 digits, a plausible YYMMDD
birth date, and a valid Luhn checksum. Names, cell number and capacity are validated too. Documents are
held in Convex file storage with a 10 MB per-file limit and a photo/PDF content-type allowlist; only the
storage ids are attached to the application, and reviewers receive short-lived signed URLs.

**Not collected from drivers:** proof of address, tax number, bank statements, source of funds,
biometrics/liveness, criminal record check, credit report.

---

## 2. What enhanced due diligence do you carry out on individuals who sign up?

Enhanced due diligence is **manual, recorded and gated**. A driver is never dispatchable on the strength
of self-declared data alone.

### 2.1 The gate

1. The applicant submits identity, licence, vehicle and document copies.
2. The application enters the admin review queue (`/admin/driver-approvals`) as `pending`.
3. A reviewer opens both documents, checks them against the captured identity, licence and vehicle
   registration, and runs three screens: **sanctions/watchlist**, **politically exposed person (PEP)**,
   and **adverse media**.
4. The reviewer ticks all six checks and writes a screening note naming the result and the source.
5. Only then does the Accept button unlock. The server refuses approval if any document is missing, any
   check is unticked, or the note is shorter than 10 characters.
6. Approval provisions the driver profile and active vehicle; dispatch will not consider a driver
   without them.
7. The reviewer's identity, the six check results, the note and the timestamp are stored on the
   application and written to the audit log.

### 2.2 Risk factors that stop or escalate an application

- Identity document does not match the captured name, ID number or date of birth.
- Licence class does not cover the declared vehicle, or the licence is expired/suspended.
- Vehicle registration does not match the licence disc, or the vehicle is not roadworthy/insured.
- A sanctions or PEP match, or material adverse media (violence, theft, fraud, prohibited-goods
  trafficking).
- Duplicate identity or vehicle details already attached to another account.

A stopped application is rejected with a reason and can be resubmitted; a rejection does not delete the
review record.

### 2.3 Ongoing monitoring

Every delivery is tracked with timestamped status events and proof of delivery. Customer disputes,
driver-conduct reports, failed deliveries and settlement anomalies are recorded against the driver, and
operations can suspend a driver. A resubmission after rejection clears the previous screening record so
old checks cannot be reused to approve new documents.

### 2.4 Limits — stated plainly

- Screening is performed by a human against an external source and the result is recorded. It is **not**
  an automated sanctions/PEP API integration, and there is no continuous re-screening feed.
- There is no biometric/liveness check and no independent credit bureau or bank-account verification.
- Driver payout bank details are not held in the platform database; they are collected and verified by
  finance during payout onboarding (see §4.5).

If a counterparty requires automated screening or biometric verification, that is a scoped addition, not
something already in place.

---

## 3. Do you have an Acceptable Use Policy? Please share it.

**Yes.** It is published, versioned, public (no login), and linked from the footer, the legal hub and the
sign-up consent.

- **URL:** `/acceptable-use` on the platform
- **Version:** 1.0
- **Effective:** 29 October 2026
- **Source:** `src/pages/legal/AcceptableUse.tsx`

It covers:

1. **Scope** — every customer, business user, recipient and driver, and every Lasha account.
2. **Prohibited goods** — illegal goods and drugs, firearms/ammunition/explosives without permits,
   hazardous materials under the Hazardous Substances Act 15 of 1973, human remains/tissue outside an
   approved medical-courier agreement, CITES/biodiversity-protected wildlife, cash and bearer
   instruments, exploitative material, and anything unsafe to carry.
3. **Restricted goods** — alcohol/tobacco, prescription medicines, lithium batteries, perishables and
   goods over R10 000, each with the condition for carriage (declaration, packaging, insurance, proof of
   delivery).
4. **Account rules** — accurate registration details, no credential sharing, no money laundering, tax or
   customs evasion, no probing or scraping the platform, no fraudulent claims, no harassment.
5. **Driver and vehicle rules** — valid licence and roadworthy insured vehicle, no impairment, no
   subcontracting, no opening or diverting parcels, truthful proof of delivery, no discrimination or
   harassment.
6. **Declarations and inspections** — Lasha may request permits/invoices, inspect a parcel on reasonable
   suspicion, refuse/hold/dispose at the sender's cost, and report offences to SAPS or SARS.
7. **Enforcement** — warning, booking refusal, account suspension, immediate driver suspension, holding
   settlement while an investigation is open, account closure, recovery of losses and criminal referral,
   with a right to respond before a permanent restriction.
8. **Reporting** — `info@lasha.co.za` for abuse, `security@lasha.co.za` for vulnerabilities, and the
   in-platform `/disputes` route for delivery claims.

The policy operates alongside the Terms of Service (`/terms`), which contain the claims and refund
rules, and the Privacy Notice (`/privacy`), which contains the POPIA processing terms.

---

## 4. How does the payment flow work between Lasha, the client, the driver and Paystack?

### 4.1 Who is who

- **CLADOGRAM (trading as Lasha)** is the merchant of record and the counterparty to the customer. It sets the price,
  performs the delivery (through approved drivers) and bears the customer refund obligation.
- **The client/customer** pays Lasha for the delivery.
- **The driver** is paid by Lasha for performing the delivery. The driver is **not** a Paystack merchant
  and never receives customer card data.
- **Paystack** processes the customer's card or instant-EFT payment and settles the collected funds to
  Lasha's Paystack balance/bank account.

There is no Paystack split, subaccount, marketplace or transfer arrangement in the current integration:
Paystack sees one merchant (Lasha) and one charge per order.

### 4.2 Customer payment, step by step

```
Customer                    Lasha (Convex)                       Paystack
   |                              |                                  |
   |-- choose order ------------->|                                  |
   |                              | price read from the order        |
   |                              | (never from the browser)         |
   |                              |-- initialize transaction ------->|
   |<--------- checkout URL ------|                                  |
   |-- pays on Paystack checkout ------------------------------------>|
   |                              |<------ webhook (signed) ---------|
   |                              | verify HMAC-SHA512, then verify  |
   |                              | the transaction server-to-server |
   |                              | mark payment completed           |
   |<---- order paid / dispatched-|                                  |
```

Controls:

- The amount is read server-side from the order's stored price. The client cannot submit an amount.
- Initialisation is idempotent: one order has one deterministic checkout reference, and a retry reuses
  the pending transaction rather than creating a second charge.
- Success is never taken from the browser. A redirect back to the app triggers server-side
  verification, and the webhook independently verifies the transaction with Paystack.
- The webhook is authenticated with Paystack's HMAC-SHA512 signature over the raw body, compared in
  constant time. An unsigned or mismatched request is rejected.
- Card data is entered on Paystack's checkout. Lasha stores only the amount, method, reference and
  provider transaction id. PAN/CVV are never received or stored.
- `PAYSTACK_SECRET_KEY` lives only in Convex server-side environment variables, never in the client
  bundle or logs.
- Payment state supports `pending → processing → completed | failed` and a `refunded` terminal state.
  Refunds themselves are not automated (see §4.4).

### 4.3 What the driver is paid

A completed delivery creates a **settlement** from the stored quote, never from a recalculation:

```
deliveryFee (what the customer paid for delivery)
  = platformFee (Lasha's margin)
  + driverEarnings (the driver's share)
```

The settlement starts `pending`. An operations user can move it to `processing` and then `completed`
only if the payout-eligibility gate passes:

1. the delivery is `delivered`;
2. exactly one settlement exists and it belongs to that delivery;
3. the settlement amount matches the stored quote;
4. the customer payment is verified as paid and reconciliation raises no anomaly;
5. the settlement is still payable (not already paid, failed or disputed).

Completing a settlement credits the driver's Lasha wallet ledger and writes a transaction record keyed to
the settlement. Drivers cannot mark their own settlement paid; that requires the `settlement:manage`
permission, held by company admins and the platform owner, not by drivers or customers.

### 4.4 Refunds

A refund is a decision recorded on a dispute (see §5), not an automatic reversal. Finance executes the
refund in Paystack against the original transaction reference and records the amount and date against the
dispute reference. The platform records the approved outcome and amount; it does not currently call
Paystack's refund API itself. Approved refunds are paid to the original payment method within 5–10
business days, consistent with the Terms of Service.

### 4.5 Driver payouts

Settlement completion credits an internal wallet ledger — it is **not** an external bank transfer. Payout
of accumulated earnings is made by EFT from Lasha's business bank account, on the finance payout cycle,
against the settlement ledger. Paystack is not involved in paying drivers.

Bank details are not stored in the application database. They are collected and verified by finance
during payout onboarding (account holder must match the verified driver identity). A payout-destination
model inside the platform is a planned control, not a current one; this is the main payment-flow gap in
this document and is listed in §6.

### 4.6 What a reviewer can inspect

- `/make-payment` — customer payment status per order.
- Payment transaction records — amount, method, reference, provider transaction id, timestamps.
- Settlement records — delivery fee, platform fee, driver earnings, status, idempotency key.
- Audit log (`/admin/audit-log`) — payment, settlement and dispute events with actor and timestamp.
- Reconciliation reads — `docs/payment-settlement-reconciliation.md`.

---

## 5. How do you manage disputes from customers?

### 5.1 How a customer raises a dispute

- In the customer portal at **`/disputes`** (also linked from Help and the legal pages).
- Only the person who booked the delivery, or an admin of the booking business, can raise it; identity
  is taken from the session, never from the request.
- The claim must be raised within **7 days** of completion (or of a failed/cancelled delivery), matching
  the claims clause in the Terms of Service. Older deliveries are refused by the server, with a route to
  email `info@lasha.co.za`.
- The customer chooses a category — not delivered, damaged in transit, late, wrong item, incorrect
  charge, driver conduct, other — and describes what happened (20–2,000 characters).
- One open dispute per customer per delivery. A double submit returns the existing reference instead of
  creating a duplicate claim.
- The customer receives a reference (`DSP-2026-XXXXXX`) and a **7-day response target**.

### 5.2 What happens internally

1. The dispute appears in the operations queue (`/admin/disputes`) with the customer, delivery, driver,
   order value, linked settlement and due date.
2. Operations opens it and marks it `investigating` (recorded against the staff member).
3. Operations reviews the tracking events, proof of delivery, payment record and driver account, and
   contacts the customer or driver where needed.
4. To close it, operations must record:
   - an outcome — **full refund, partial refund, redelivery at our cost, goodwill credit, or no action**;
   - the amount, for a partial refund or goodwill credit, capped at the amount charged for the order;
   - a written note explaining the decision (this is sent to the customer); and
   - an explicit decision on the driver's settlement — **release** or **withhold**.
5. The customer sees the status and resolution note on `/disputes`.

### 5.3 The financial control

Raising a dispute **automatically holds the linked driver settlement** by moving it to `disputed`. The
payout-eligibility gate blocks `disputed` settlements, so the driver cannot be paid while the claim is
open — even if an operator tries to process it.

On closure:

- **Release** restores the settlement to the state it held before the dispute, and it must still pass the
  payout gate.
- **Withhold** marks the settlement `failed` with the dispute reference and outcome as the reason, which
  permanently blocks that payout.

Every raise, review and resolution is written to the audit log with the actor, before/after state and
reference.

### 5.4 Escalation

If the customer disagrees with the outcome, the response asks them to reply to the resolution or email
`info@lasha.co.za`; unresolved consumer complaints can be taken to the **National Consumer Commission**
under the Consumer Protection Act 68 of 2008. Privacy complaints go to the Information Regulator (see
`/privacy#complaints`). A false claim can lead to account restrictions under the Acceptable Use Policy.

### 5.5 Limits — stated plainly

- The platform records the refund decision and amount; it does not initiate the Paystack refund. Finance
  executes it and marks the dispute resolved.
- There is no automated evidence upload inside the dispute form yet; photographs and documents are
  requested and handled by email during investigation.
- There is no external ombudsman membership claim in this document.

---

## 6. Known gaps and the plan

These are the honest gaps a reviewer should see. None of them is disguised by the answers above.

| Gap | Impact | Planned control |
|---|---|---|
| Automated sanctions/PEP/adverse-media screening | Manual screening depends on the reviewer | Integrate a screening provider; store the result on the application |
| Bank-account verification for driver payouts | Finance verifies out of band; payout details not in the platform | Payout-destination model with verification status and masked display |
| Automated refunds and driver payouts | Manual finance step, slower and less auditable | Paystack refund API + payout provider or bank file |
| Document retention automation | KYC files are deleted through the documented manual retention process | Extend the retention sweep to delete storage objects |
| Independent penetration test / SOC 2 | No third-party assurance report yet | Commission an annual penetration test before enterprise onboarding |

## 7. Items only Lasha can supply

1. **Bank confirmation letter** and the account that receives Paystack settlements.
2. **Paystack merchant/business ID**, if the reviewer needs to match the integration.
3. **Information Officer** appointment confirmation (registered with the Information Regulator).
4. **Business telephone number** — confirm the number published on the site is a monitored line.

## 8. Evidence index

| Claim | Evidence |
|---|---|
| AUP published and versioned | `/acceptable-use`, `src/pages/legal/AcceptableUse.tsx` |
| Terms claims/refund window | `/terms` §6–7 |
| Driver identity validation | `src/convex/users/profileValidation.ts`, `driverApplications.ts` |
| KYC document capture and signing | Driver App `/driver/apply`; Convex file storage; reviewer links in `/admin/driver-approvals` |
| Recorded EDD gate | `acceptDriverApplication` (six checks + note required) |
| Payment initiation/verification | `src/convex/payments/actions.ts`, `src/convex/http.ts` |
| Webhook signature checking | `src/convex/payments/_provider.ts` |
| Settlement and payout gate | `src/convex/pricing/service.ts`, `src/convex/payments/payoutEligibility.ts` |
| Dispute workflow | `src/convex/disputes/service.ts`, `/disputes`, `/admin/disputes` |
| Retention and POPIA records | `docs/popia/`, `src/convex/privacy/retention.ts` |
| Audit trail | `/admin/audit-log`, `src/convex/audit/service.ts` |
