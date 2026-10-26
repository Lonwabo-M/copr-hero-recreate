# Security compromise (breach) response plan

POPIA s22 requires Lasha to notify the Information Regulator and affected data
subjects **as soon as reasonably possible** after discovering that personal
information has been accessed or acquired by an unauthorised person. POPIA does
not set a 72-hour statutory deadline (that is GDPR); **our internal target is 72
hours to a decision**, not a legal deadline. The legal standard is "as soon as
reasonably possible", and delay must be justified.

Owner: Information Officer. Incident lead: the engineer on call. Recorder: the
privacy desk.

## 1. Recognise and report

Anything that may be a compromise is reported to `security@lasha.co.za` and the
Information Officer immediately. Examples:

- A public or wrongly scoped Convex query or mutation exposing another user's or
  business's data.
- A leaked deployment key, integration key, `SEED_ACCESS_KEY`,
  `TEST_ACCESS_EMAILS` misconfiguration, or a seeded account with a known
  password.
- A compromised staff or driver account; a phishing success.
- A misdirected email or notification containing another person's details.
- A lost or stolen laptop or phone holding an export, POD photos or driver
  documents.
- A database provider incident affecting the deployment.
- A vulnerability report (see `public/.well-known/security.txt`).

Do **not** investigate alone in production. Do not delete evidence. Do not
discuss the incident in public channels or with the affected person before the
Information Officer approves the message.

## 2. First hour — contain

1. Open an incident record: reference, time discovered, who found it, what is
   known, what is not.
2. Stop the exposure:
   - revoke and rotate the exposed key or token;
   - disable the affected account or mutation;
   - take the affected route or feature offline (a feature switch or a temporary
     guard is acceptable; record what changed and revert it deliberately);
   - if credentials are involved, force sign-out and password reset for affected
     accounts.
3. Preserve evidence: export relevant `audit_events`, provider logs and database
   rows **before** cleaning up. Store them in a restricted location, not in the
   repository.
4. Confirm the fix works with a test that would have caught the issue.

## 3. Assess (within 24 hours)

Answer these, in writing:

| Question | Why |
|---|---|
| What categories of personal information were involved? | Drives severity and the notification content |
| How many data subjects, and which groups (customers, recipients, drivers, staff)? | Drives notification scope |
| Was any special personal information or children's information involved? | Highest severity; consider Regulator engagement |
| Was the data accessed, or only exposed? Any evidence of exfiltration? | Risk assessment |
| Is the data still accessible? | Containment completeness |
| Could it identify a person, directly or in combination? | Identifiability |
| Is there a risk of harm: identity theft, fraud, physical safety (home addresses), reputational or financial loss? | s22 trigger |
| Who else must be told (operator, customer, insurer, SAPS)? | Contractual and legal duties |

Record the decision and its reasoning either way. A decision **not** to notify
must be documented with the same care as a notification.

## 4. Notify the Regulator (s22(1)(a))

Use the Information Regulator's eServices portal and the prescribed form. Include:

- Lasha's details and the Information Officer's contact;
- when the compromise was discovered and when it is believed to have occurred;
- a description of the personal information and the categories of data subjects;
- the number of data subjects affected, or an estimate;
- the possible consequences and the measures taken or proposed;
- whether the data subjects have been notified.

If the full facts are not yet known, notify with what is known and supplement
later. Do not wait for a perfect report.

## 5. Notify data subjects (s22(1)(b))

Notify directly (email, and SMS or phone where email may not be read) unless a
public announcement is more effective because contact details are unavailable.
Include, in plain language:

- what happened, and when;
- what information was involved;
- what we have done to contain it;
- what the person should do (change password, watch for phishing, be alert to
  unexpected contact);
- who to contact at Lasha, and how to complain to the Regulator;
- that we are sorry, without speculation or admission of liability beyond the
  facts.

Do not include unnecessary personal information in the notification itself.

### Template

> **Subject: Important security notice from Lasha**
>
> Dear [name],
>
> We are writing to tell you about a security incident that affected some of your
> personal information held by Lasha. We discovered it on [date] and contained it
> on [date].
>
> **What happened.** [One or two factual sentences: for example, "A
> misconfiguration in one of our internal data queries allowed a person who was
> signed in to view another customer's delivery list."]
>
> **What information was involved.** [For example: "Names, email addresses,
> phone numbers and delivery addresses for [number] deliveries between [dates].
> No passwords, card numbers or identity numbers were involved."]
>
> **What we have done.** [Revoked access / fixed the query / forced sign-out /
> reported to the Information Regulator on [date].]
>
> **What you can do.** [Change your password / be alert to emails or calls
> referencing this delivery / contact us if you see unusual activity.]
>
> We have reported this to the Information Regulator (South Africa). If you are
> not satisfied with our response, you can complain to the Regulator at
> https://inforegulator.org.za or 010 023 5200.
>
> We are sorry this happened. For questions, contact our Information Officer at
> privacy@lasha.co.za or +27 10 123 4567.
>
> [Name], Information Officer, Lasha Logistics

## 6. After the incident (within 14 days)

1. Close the incident record with the root cause and the timeline.
2. Add a regression test or guard that would have prevented it.
3. Update `docs/popia/ropa.md`, `operators.md` or the retention schedule if the
   incident revealed a gap.
4. If an operator caused or was affected, notify them and review the agreement.
5. Hold a short review with everyone involved; record actions with owners and
   dates.
6. Report the outcome to the Information Officer and, where relevant, to affected
   customers.

## 7. Evidence to keep

- Incident record and timeline.
- Copies of notifications sent (Regulator and data subjects).
- Decision log, including a decision not to notify.
- The fix (commit reference, before/after behaviour, test).
- Correspondence with the Regulator and operators.

Keep incident records for 5 years, restricted to the Information Officer, the
incident lead and legal counsel.
