# Record of Processing Activities (ROPA)

POPIA s8 (accountability) and s17–s18 (openness). One row per data set: what it
is, why it exists, who it is about, where it lives, the s11 lawful basis, the
retention period, and who receives it.

Maintained by the Information Officer's desk. Update it whenever a schema table,
operator or purpose is added. The numbering is referenced by
`retention-schedule.md` and `operators.md`.

Legend: **LBI** = lawful basis. Personal information of a **juristic person**
is included, because POPIA protects existing juristic persons.

| # | Data set | Data subjects | Personal information | Table(s) | Purpose | LBI | Retention | Recipients |
|---|---|---|---|---|---|---|---|---|
| 1 | Customer account | Account holders, their staff | Name, email, mobile, password hash, role, business link, preferences | `users`, `businesses` | Create and operate the account; authenticate; support | s11(1)(b) contract | Account open + 30 days after closure | Convex (host), Vly (auth issuer) |
| 2 | Business profile | Customer businesses, contacts | Business name, registration number, VAT number, billing email, contact people | `businesses` | Invoice, deliver, contract | s11(1)(b); s11(1)(c) tax | 5 years after last transaction | Convex, Paystack (billing contact) |
| 3 | Delivery addresses | Customers, recipients | Street address, suburb, city, postal code, coordinates, access notes | `addresses` | Collect and deliver; route; estimate arrival | s11(1)(b) | 24 months after last use, then de-identify | Assigned driver; Google / OSM operators |
| 4 | Orders | Customers, recipients | Sender and recipient names, emails, phones, parcel description, declared value, instructions, pricing | `orders` | Book, price, deliver, support, claims | s11(1)(b); s11(1)(f) claims | 5 years (financial record) | Assigned driver; Paystack (amount only) |
| 5 | Deliveries and status history | Customers, recipients, drivers | Assignment, status, timestamps, tracking number, failure reasons | `deliveries`, `tracking_events`, `delivery_quotes` | Fulfilment, tracking, dispute resolution | s11(1)(b); s11(1)(f) | 24 months after completion, then de-identify | Assigned driver; operations staff |
| 6 | Proof of delivery | Recipients | Recipient name, signature image, photo, timestamp, GPS of handover | `proof_of_delivery`, `pod_files` | Prove delivery; defend claims; insurance | s11(1)(b); s11(1)(f) | 24 months after delivery | Customer (their own delivery), insurer on claim |
| 7 | Driver application and KYC | Driver applicants | Name, ID number, cell number, licence class/number, vehicle details, copies of the identity document and driving licence, sanctions/PEP/adverse-media screening result and reviewer note | `driver_applications` (document files in Convex storage) | Verify identity, eligibility, safety; record enhanced due diligence | s11(1)(b); s11(1)(c); s11(1)(f) safety | 12 months after decision if declined; see #8 if approved | Convex (host); operations and admin reviewers |
| 8 | Driver profile and payouts | Drivers | ID number, licence, vehicle registration, rating, earnings | `driver_profiles`, `vehicles`, `settlements`, `transactions` | Assign work, pay earnings, tax records | s11(1)(b); s11(1)(c) tax | Engagement + 12 months; financial records 5 years | Bank (payout), operations |
| 9 | Location during delivery | Drivers | GPS coordinates, timestamps, route | `tracking_events` | Live tracking, dispatch, safety | s11(1)(b); s11(1)(f) safety | 90 days, then delete/aggregate | Customer (their delivery), operations |
| 10 | Payments | Customers | Amount, reference, Paystack transaction code, status, channel, refund status/provider reference | `payment_transactions`, `payment_refunds`, `transactions`, `wallets` | Take payment, reconcile, refund | s11(1)(b); s11(1)(c) tax | 5 years | Paystack; auditors |
| 11 | Invoices | Customer businesses | Billing contact, line items, VAT, amounts | `invoices` | Invoice, tax compliance | s11(1)(c) tax | 5 years from end of tax year | Customer, SARS on lawful request |
| 12 | Notifications | Customers, drivers, staff | Recipient user, title, body (may contain name/address), read state | `notifications`, `notification_preferences`, `email_outbox` | Operate the service; delivery updates | s11(1)(b) | 90 days; email outbox 30 days | Resend (email), Convex |
| 13 | Reviews and ratings | Customers, drivers | Reviewer, subject, rating, comment | `reviews` | Service quality, driver ranking | s11(1)(f) | 24 months | Operations; driver sees rating |
| 14 | Support and sales | Customers, prospects | Name, email, phone, business, message | `demo_requests`, support correspondence (email) | Respond, qualify, support | s11(1)(b); s11(1)(f) | Demo leads 12 months if unconverted; support 24 months | Operations, sales |
| 15 | Security and audit | All users, staff | Actor, role, action, entity, IP address, user agent, metadata, before/after; for reset throttling, a hash of the email and recent send times | `audit_events`, `metrics_storage`, `password_reset_rate_limits` | Security, fraud, accountability, investigation; stop reset-email abuse | s11(1)(f) | 24 months, except records under investigation; reset throttle 48 hours | Operations, Super Admin, Information Officer |
| 16 | Consent registry | All users | User, purpose, grant/withdraw, wording, notice version, source, time | `consent_records` | Prove consent; honour withdrawal (s11, s18, s24) | s11(1)(c) legal obligation | Latest decision + 3 years after withdrawal | Information Officer; auditors |
| 17 | Privacy requests | Requesters (may be non-customers) | Name, email, phone, request type, details, status, resolution note | `privacy_requests` | Answer s23/s24/s11(3) requests; demonstrate compliance | s11(1)(c) | 24 months after resolution | Information Officer, Operations, Super Admin |
| 18 | Marketing subscriptions | Website visitors | Email, status, wording, notice version, source, time | `marketing_subscriptions` | Send opted-in product updates (s69) | s11(1)(a) consent | Until withdrawn + 3 years as evidence | Convex; future email sender |
| 19 | Disputes and claims | Customers, drivers | Claim category, description, delivery/order link, outcome, amount, resolution note, driver payout decision, reviewer | `disputes` | Resolve claims; decide refunds and driver pay; defend legal claims | s11(1)(b); s11(1)(f) | 5 years (financial record) | Operations, Super Admin, finance |
| 20 | Test and seed data | Non-real test accounts | Names and emails on `.test` domains, demo delivery data | several tables | Development and demos | Not applicable (no real data subjects) | Removed before production export | Engineering only |

## Special personal information (s26–s33)

Lasha does **not** process special personal information as part of its service.
Specifically:

- No health, religion, race, political persuasion, trade union, sex life,
  biometric or criminal-record data is collected by any form.
- A South African ID number (drivers only) reveals date of birth, sex and
  citizenship. It is not "special personal information" under s26, but it is
  treated as high-risk: collected only from drivers, shown only to the staff who
  verify onboarding, never logged, and redacted by the logger.
- If a driver volunteers health information for safety reasons, it is used only
  for that purpose and is not added to the driver's general profile.

## Children (s34–s35)

The service is for businesses. No form targets children. Recipient names may
belong to minors (for example a school), but only a name and proof of handover
are recorded. If a child's information is identified, delete it unless a
competent person consents or another s35 ground applies.

## Automated decision-making (s71)

Dispatch ranking and offer expiry are automated operational decisions. They are
not decisions with legal or substantial effect based solely on automated
processing; a person can review and reassign. See the Privacy Notice §10.

## Gaps to close (tracked in README)

- Operator agreements unsigned (s20/s21) — verify before launch.
- No field-level encryption for ID numbers or bank details beyond provider
  encryption at rest.
- Manual retention items still depend on an operator runbook, not code.
