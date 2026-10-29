# Retention schedule

POPIA s14: personal information must not be kept longer than necessary for the
purpose, unless a law requires it. This schedule is the published commitment (the
Privacy Notice §11 renders the same periods). **Automated** rows are enforced by
`src/convex/privacy/retention.ts` on a weekly cron; **manual** rows need a person
and are the open operational gap.

Data sets follow the order of `ropa.md`; the # column is this schedule's own reference.

| # | Data set | Retention | Counted from | Method at end | Enforcement |
|---|---|---|---|---|---|
| 1 | Customer account and profile | Account open + 30 days | Account closure | Delete account record; keep only records required by #4, #10, #11 | **Manual** — there is no self-service hard delete. A deletion request is handled by the DSAR runbook |
| 2 | Business profile | 5 years after last transaction | Last invoice | Archive; delete | Manual |
| 3 | Delivery addresses | 24 months after last use | Last delivery using the address | De-identify (blank street/contact, keep suburb for statistics) | Manual |
| 4 | Orders and delivery records | 5 years for the financial record; 24 months for delivery detail | End of tax year / delivery completion | Delete delivery detail; retain invoice-linked minimum | Manual |
| 5 | Proof of delivery (signature, photo, GPS) | 24 months | Delivery completion | Delete files in `pod_files` and the record in `proof_of_delivery` | Manual |
| 6 | Driver application (declined) | 12 months | Decision | Delete application and documents | Manual |
| 7 | Driver profile and vehicle | Engagement + 12 months; financial records 5 years | Last delivery / end of agreement | Delete profile and documents; keep settlement and tax records | Manual |
| 8 | Location pings | 90 days | Delivery completion | Delete or aggregate to route-level statistics | Manual |
| 9 | Payment records | 5 years | End of tax year | Delete after the tax hold | Manual |
| 10 | Invoices | 5 years | End of tax year | Delete after the tax hold (Tax Administration Act 28 of 2011; VAT Act 89 of 1991) | Manual |
| 11 | Notifications | 90 days | Created | Delete | Manual (candidate for automation) |
| 12 | Email outbox | 30 days | Sent | Delete body, keep delivery status | Manual |
| 13 | Reviews | 24 months | Created | De-identify reviewer, keep rating | Manual |
| 14 | Demo leads (unconverted) | 12 months | Last contact | Delete | **Automated** — weekly sweep, statuses new / contacted / closed |
| 15 | Audit and security logs | 24 months | Event date | Delete, except records under investigation or litigation hold | Manual |
| 16 | Consent records | Latest decision retained while the account exists; history 3 years after a withdrawal | Withdrawal / closure | Delete the user/purpose history once the latest decision is a withdrawal older than 36 months | **Automated** — weekly sweep |
| 17 | Privacy requests | 24 months | Resolution (`resolvedAt`) | Delete the request and resolution note | **Automated** — weekly sweep for `completed` / `refused` |
| 18 | Marketing subscriptions | Until withdrawal; the withdrawal record is kept 3 years | Withdrawal | Delete subscription rows; keep the withdrawal as evidence | Manual |
| 19 | Test and seed accounts | Not applicable | — | Remove before any production export | Manual |
| 20 | Password-reset send throttle (`password_reset_rate_limits`) | 48 hours | Last reset-code send | Delete row; it holds only a SHA-256 hash of the email, never the address | **Automated** — weekly sweep |
| 21 | Disputes and claims | 5 years | Resolution (`resolvedAt`) | Delete the claim, resolution and note after the financial record hold; keep the linked order/invoice | Manual |

## How the automated sweep works

`privacy.retention.purgeExpiredPersonalInformation` runs weekly (see
`src/convex/crons.ts`). It is bounded to 400 deletions per category per run, so a
large backlog drains over several runs rather than in one unbounded operation.
It returns counts, which appear in the Convex logs — check them after a release
that changes retention periods.

What it deliberately does **not** touch: invoices, orders, payment records,
delivery and POD records, driver documents, location pings, audit logs, support
threads. Deleting those needs a human judgement about legal holds (tax, claims,
litigation) and, for POD files, storage deletion as well as database rows.

## Legal holds

If litigation, an investigation or a Regulator enquiry is reasonably anticipated:

1. The Information Officer records the matter and the data sets in scope.
2. Deletion of those data sets stops, including the automated sweep for affected
   privacy requests.
3. The hold is reviewed every 6 months and lifted in writing when the matter
   ends.

The current automated sweep cannot see holds. Before relying on it during a
dispute, disable the cron entry for the affected period and record why.

## Backups

Backups follow the hosting provider's cycle and expire on their normal schedule.
A deletion performed today may persist in a backup until that cycle completes;
restores must not reintroduce deleted records into the live system without the
Information Officer's approval.

## Verification

Each quarter the Information Officer samples:

- 5 closed privacy requests — deleted after 24 months where eligible;
- the count of `demo_requests` older than 12 months that are not qualified
  (should trend to zero after a sweep);
- the count of `consent_records` for purposes withdrawn more than 36 months ago;
- one manual row from this schedule, with evidence it was actually deleted.

Record the date, the sample and the result in the privacy desk log. These are the
s19(2)(c) "regular verification" evidence.
