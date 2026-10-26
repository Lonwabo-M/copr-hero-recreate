# Data subject request (DSAR) runbook

How Lasha handles a request under POPIA s23 (access), s24 (correction and
deletion), s11(3) (objection), s69 (marketing opt-out) and s71 (automated
decisions). Owner: the Information Officer. Operators: the privacy desk and
Operations.

**Service level: acknowledge within 2 business days, answer within 30 days.**
`dueAt` on the request row is the 30-day deadline; the Admin Portal shows overdue
requests in red.

## 1. Intake

| Channel | Entry point | Who picks it up |
|---|---|---|
| Web form | `/privacy-rights` → `privacy.mutations.submitPrivacyRequest` | Operations / Super Admin queue at `/admin/privacy-requests`; every staff account also gets a notification |
| Email | `privacy@lasha.co.za` | Privacy desk creates the request manually in the Admin Portal queue (or asks the person to use the form) |
| Post / in person | Information Officer's address | Privacy desk captures the same fields |

The public form stores: type, name, email, optional phone, the person's own
description, `submittedAt`, `dueAt` and a reference (`PRIV-YYYY-XXXXXX`). It
attaches `userId` only when the submitter is signed in. It never reveals whether
an email has an account.

The form is rate-limited (one submission per email per 10 minutes, maximum 5 open
requests per email) and honeypotted. If the limit blocks a genuine person, tell
them to reply to the existing thread instead of opening a new request.

## 2. Triage (day 0–2)

1. Read the request in `/admin/privacy-requests`. Do not paste its contents into
   Slack, email or tickets; refer to the reference.
2. Classify: access · correction · deletion · objection · marketing opt-out ·
   complaint.
3. Set status to **In progress** and add a note with what you are doing.
4. Check whether the person is also raising a service complaint. If so, handle
   the service issue separately — a POPIA request is not a complaint about a
   delivery.

## 3. Verify identity (day 1–5)

Verify before releasing or changing anything. Ask for the **minimum**:

- For an account holder: reply from the email address on the account, plus one
  fact already on the account (last tracking number or the account's business
  name).
- If the request comes from a different address: ask for the account email and a
  tracking number, or a copy of an ID document with everything except name,
  photo and ID number redacted.
- For someone acting for another person: written authority (power of attorney,
  or a signed note plus a copy of their ID).
- Never ask for a password, OTP, full card number or bank details.

Record *that* verification happened in the resolution note, not the evidence
itself. Delete any ID copy sent to you as soon as the request closes.

If identity cannot be established, refuse in writing, explain why, and say what
would be needed to proceed.

## 4. Fulfil each request type

### Access (s23)

1. Find the person: match the account email in `users`, then their
   `businesses`, `orders`, `deliveries`, `invoices`, `payment_transactions`,
   `consent_records`, `privacy_requests`, `notifications` and `reviews`.
2. Export as a readable PDF or CSV: account details, orders and deliveries
   (tracking numbers, dates, statuses), invoices and payments, consent history,
   privacy requests, and a list of what is **not** included (other people's
   information, internal security records, legally privileged material).
3. Do not include another data subject's information — redact recipient details
   that belong solely to someone else unless the requester supplied them.
4. Explain any record withheld and the ground (s23(4), PAIA grounds applied via
   s23(5)).
5. Send securely (password-protected archive with the password sent separately,
   or a time-limited link). Never attach an export to a notification.

### Correction (s24)

1. Identify the inaccurate field(s). Ask for evidence where the correction is
   not self-evident (for example a corrected address vs. a disputed delivery).
2. Correct in the source table, not by adding a note. Preserve the audit trail
   the system already keeps.
3. If a field cannot be changed because it is a historical record (an invoice
   already issued), explain that and record the correct value in the resolution
   note.
4. Tell anyone who received the incorrect information, where that is reasonably
   possible (s24(3)).

### Deletion / account closure (s24)

1. Confirm the scope: whole account, or specific data.
2. Apply legal holds. **Do not delete** records required by:
   - Tax Administration Act 28 of 2011 and VAT Act 89 of 1991 — invoices,
     payment records, 5 years;
   - an active claim, investigation or litigation hold.
3. Delete or de-identify in this order: notifications and email outbox → POD
   files and POD rows → tracking events and location → deliveries and orders
   (except invoice-linked minimum) → addresses → reviews → driver profile and
   documents → consent rows for purposes still live (keep the deletion decision
   as evidence) → user record and auth credentials.
4. Close the account in Convex Auth so the credentials cannot be used.
5. Reply listing what was deleted, what was kept, for how long and why.
6. Do not delete the `privacy_requests` row — it is the evidence the request was
   handled; it is purged 24 months after resolution by the retention sweep.

### Objection (s11(3))

Assess the objection against the legitimate interest relied on. If the objection
is upheld, stop the processing and record what changed. If it is refused, explain
the compelling legitimate grounds in writing. Objections to direct marketing are
always upheld.

### Marketing opt-out (s69)

1. Signed-in user: they can withdraw on `/privacy-rights`; the consent record is
   written immediately and future sends must read the latest decision.
2. Footer subscriber: insert an `unsubscribed` row in `marketing_subscriptions`
   for the email (the list is append-only; the latest row wins). If a mail tool
   is added later, it must also suppress the address there.
3. Confirm in writing. Opt-out is effective immediately and is never treated as
   consent.

### Complaint (s5, s74)

1. Acknowledge and investigate like any other request.
2. If the complaint is upheld, say what went wrong and what changed.
3. Tell the person they may also complain to the Information Regulator
   (`https://inforegulator.org.za`, eServices portal; PAIA Form 5 for PAIA
   complaints, `PAIAComplaints@inforegulator.org.za`).

## 5. Refusing a request

You may refuse where POPIA or PAIA allows, for example: releasing another
person's information, legally privileged records, a request that is manifestly
unfounded or excessive, or identity that cannot be verified.

A refusal must be in writing and must state the ground, the facts relied on, and
how to challenge it. Set status **Refused**, record the reason, and keep the
correspondence. When in doubt, escalate to the Information Officer rather than
refusing.

## 6. Closing

1. Send the outcome in writing.
2. Set status **Completed** (or **Refused**) and write a resolution note:
   what was sent, when, to which address, and what was withheld.
3. The status change is audit-logged automatically with your staff user.
4. The row is deleted 24 months after `resolvedAt` by the retention sweep.

## 7. What to do when the 30 days are at risk

The deadline can be extended only with a good reason (complex or voluminous
request, need to consult a third party). Tell the person **before** day 30, in
writing, with the reason and a new date. Do not let a request go overdue
silently: overdue rows are visible to every operator in the Admin Portal.

## 8. Monthly review (Information Officer)

- All open requests and their deadlines.
- Any refusal in the last month, and whether it was justified.
- Any request that took longer than 30 days, and why.
- Themes worth fixing in the product (for example repeated requests to correct an
  address field that has no edit path).
- Sample one closed request for completeness of the resolution note.
