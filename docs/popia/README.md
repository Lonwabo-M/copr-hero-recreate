# POPIA compliance pack

Engineering and organisational records for Lasha Logistics under the Protection
of Personal Information Act 4 of 2013 (POPIA) and the Promotion of Access to
Information Act 2 of 2000 (PAIA).

This pack is written for the Information Officer, the engineers who change the
platform, and a lawyer reviewing the position. **It is not legal advice.** Have
the published notices, the PAIA manual and the operator agreements reviewed by a
South African privacy attorney before relying on them.

Law considered current to October 2026. Re-verify time-sensitive items (fees,
form numbers, Regulator contact details) before publication.

## Where the public documents live

| Document | Route | Source |
|---|---|---|
| Privacy Notice | `/privacy` | `src/pages/legal/PrivacyNotice.tsx` |
| Your Privacy Rights (DSAR intake + consent) | `/privacy-rights` | `src/pages/PrivacyRights.tsx` |
| PAIA Manual | `/paia` | `src/pages/legal/PaiaManual.tsx` |
| Cookie Notice | `/cookies` | `src/pages/legal/CookieNotice.tsx` |
| Terms of Service | `/terms` | `src/pages/legal/TermsOfService.tsx` |

Company details, the Information Officer's contact desk and the operator list
are centralised in `src/lib/legal.ts`. Consent wording and the notice version are
centralised in `src/convex/privacy/policy.ts`. Change facts there, not in the
page bodies, and bump `PRIVACY_POLICY_VERSION` when purposes, sharing or
retention change.

## What is implemented in the platform

| Control | Where | Notes |
|---|---|---|
| Notice at collection (s18) | `/privacy`, linked from the sign-up form, footer, `/legal` and downloads | Public; no login required |
| Acknowledgement at sign-up | `src/pages/Auth.tsx` → `privacy.mutations.recordConsent` | Required box for terms + notice; marketing is a separate unticked box |
| Consent registry | `consent_records` table, append-only | Stores purpose, decision, wording, notice version, source, time. No IP or device data |
| Marketing opt-in (s69) | Footer form → `privacy.mutations.subscribeToMarketing`, `marketing_subscriptions` | Unticked, provable, idempotent. Nothing is sent yet |
| Consent withdrawal | `/privacy-rights` → `withdrawConsent` | Effective immediately; history kept |
| DSAR intake (s23–s24, s11(3)) | `/privacy-rights`, `privacy_requests` | Public; returns reference + 30-day due date; honeypot + rate limit |
| Staff handling + audit | `/admin/privacy-requests` → `updatePrivacyRequestStatus` | Operations and Super Admin only; status change audit-logged |
| Retention automation (s14) | `src/convex/privacy/retention.ts`, `crons.ts` weekly | Resolved DSARs after 24 months, unconverted demo leads after 12 months, withdrawn consent history after 36 months |
| Log hygiene (s19) | `src/convex/logging/redact.ts` + logger | Masks emails, phones, SA IDs, cards, JWTs, keys, sensitive metadata keys |
| Server-side authorisation | Convex functions throughout | Frontend is a convenience boundary only |
| Security disclosure route | `public/.well-known/security.txt` | `security@lasha.co.za` |
| Regression scan | `.github/workflows/popia-scan.yml` | POPIA scanner on push/PR |

## What still needs a human

These cannot be completed in code and are **not** done:

1. **Register the Information Officer** with the Information Regulator
   (eServices portal, s55). The published notices name the role and desk, not a
   person, until the appointment is registered.
2. **Complete the legal entity fields** in `src/lib/legal.ts`: company
   registration number and physical address. The PAIA manual renders "available
   from the Information Officer on request" until they are filled.
3. **Sign operator agreements** (s20/s21) with every operator in
   `docs/popia/operators.md`, including the s72 cross-border clauses, and record
   the signature dates in that register.
4. **Adopt the PAIA manual formally** and publish it as PAIA requires (website +
   availability for inspection). Confirm whether any exemption applies.
5. **Legal review** of the Privacy Notice, Terms and PAIA manual.
6. **Work the manual retention items** (delivery records, driver documents,
   location pings, audit logs) — see `docs/popia/retention-schedule.md`.
7. **Exercise the breach plan** once, as a table-top test, and record the date.
8. **Assign the privacy desk mailbox** (`privacy@lasha.co.za`) to a monitored
   inbox with an owner.

## Documents in this pack

- `ropa.md` — record of processing activities, by data set and table.
- `operators.md` — operator and cross-border register (s20, s21, s72).
- `retention-schedule.md` — what is kept, for how long, and who deletes it.
- `dsar-runbook.md` — how a request is verified, answered and recorded.
- `breach-response.md` — s22 notification plan and template.
- `scan-triage.md` — the baseline POPIA scanner findings and their disposition.
