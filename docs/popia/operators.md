# Operator and cross-border register

POPIA s20 (operator contracts), s21 (security by operators) and s72 (transfers
outside South Africa). One row per organisation that receives personal
information from Lasha, with the country it processes in and the s72 ground
relied on.

Maintained by the Information Officer. **No agreement is marked signed here
until a countersigned copy exists** — this file is the register, not a wish list.
When an operator is added, update this file **and** `OPERATORS` in
`src/lib/legal.ts` (the public Privacy Notice renders from it).

## Operators (process on Lasha's behalf)

| Operator | Service | Personal information | Processing country | s72 ground | Agreement status | Security evidence |
|---|---|---|---|---|---|---|
| Convex, Inc. | Application database, file storage, server functions | All platform data: accounts, orders, deliveries, POD, drivers, payments, audit | United States | s72(1)(a) binding agreement incorporating POPIA conditions | **Unsigned** — Information Officer | SOC 2 Type II (obtain current report); encryption at rest; role-scoped deployment keys |
| Vly / Freebuff | Application hosting, authentication issuer (`freebuff.com`), integration gateway | Account identifiers, session data, outbound email content, integration request bodies | United States | s72(1)(a) | **Unsigned** — Information Officer | Platform DPA to obtain; hosting region to confirm |
| Paystack | Card and instant-EFT payment processing | Name, email, amount, reference; card data entered directly with Paystack | South Africa / Nigeria | s72(1)(a); PCI DSS scope is Paystack's | **Unsigned** — Information Officer | PCI DSS Level 1 (obtain attestation) |
| Resend | Transactional email delivery (password reset, delivery notices) | Email address, name, message content | United States | s72(1)(a) | **Unsigned** — Information Officer | DPA available from Resend; confirm retention and sub-processors |
| Google Ireland / Google LLC | Places API (address search), Routes API (journey calculation) | Address text, coordinates | Ireland / United States | s72(1)(a); Google Cloud DPA | **Unsigned** — Information Officer | Google Cloud DPA + SCCs; confirm which entity contracts |
| OpenStreetMap Foundation / FOSSGIS e.V. | Nominatim geocoding and OSRM routing (fallback) | Address text, coordinates | European Union | s72(1)(a) — public instance usage policy does not create an operator agreement; **consider self-hosting** | **Not an operator contract** — replace or self-host before launch | Public demo services; no SLA, no DPA |

### Actions before launch

1. Send each operator the s21 checklist (confidentiality, security safeguards,
   breach notification to Lasha, sub-processor approval, deletion on
   termination, audit rights, POPIA-compliant onward transfer).
2. Record the countersignature date in this table. A row without a date is an
   open finding.
3. Replace the public OSM/OSRM demo endpoints (`src/convex/http.ts`,
   `src/convex/routing/actions.ts`) with a contracted provider or self-hosted
   instances. Address data is personal information and the demo servers carry no
   operator obligations.
4. Confirm where the Convex deployment physically stores data and backups, and
   record it above. "United States" is the working assumption.

## Recipients who are not operators

These receive personal information but decide their own purposes, so they are
not operators. Disclose them in the Privacy Notice (done) and share only what is
required:

| Recipient | What is shared | Why |
|---|---|---|
| The assigned driver | Recipient name, phone, addresses, instructions | To perform the delivery |
| Banks | Driver name, account number, amount | To pay earnings |
| SARS, courts, SAPS, the Information Regulator | Records specified in a lawful request | Legal obligation |
| Insurer / claims handler | Delivery and POD records for a claim | Establish or defend a claim |
| Accountant / auditor | Invoices and payment records | Statutory financial records |

## Cross-border transfer summary

| Country | Information | Ground | Special / children's information? |
|---|---|---|---|
| United States | Account, delivery, POD, driver, payment metadata, audit, email content | s72(1)(a) contract | No |
| Ireland | Address and coordinate data (Google) | s72(1)(a) contract | No |
| Nigeria | Payment metadata (Paystack processing) | s72(1)(a) contract | No |
| European Union | Address and coordinate data (OSM/OSRM fallback) | s72(1)(a) contract — currently no contract, see action 3 | No |

No special personal information or children's personal information is
transferred across borders. If that changes, prior authorisation from the
Information Regulator is required (s57(1)(d)) before the transfer.

## Access by staff

Operators are external. Internal access is role-scoped in Convex: Operations see
dispatch and delivery data, Super Admin sees platform administration, Company
Admins see only their own business. Privacy requests are visible to Operations
and Super Admin only. Every status change on a privacy request is audit-logged
with the actor.
