import { Link } from "react-router";
import LegalLayout, { type LegalSection } from "@/pages/legal/LegalLayout";
import {
  CROSS_BORDER_COUNTRIES,
  INFORMATION_OFFICER,
  LEGAL_ENTITY,
  OPERATORS,
  PRIVACY_CONTACT,
  PRIVACY_NOTICE_EFFECTIVE_DATE,
  PRIVACY_POLICY_VERSION,
  REGULATOR,
} from "@/lib/legal";

const SECTIONS: LegalSection[] = [
  { id: "purpose", label: "Purpose of this manual" },
  { id: "contact", label: "Contact details" },
  { id: "guide", label: "The PAIA guide" },
  { id: "automatic", label: "Records available without a request" },
  { id: "legislation", label: "Records held under other laws" },
  { id: "records", label: "Records we hold" },
  { id: "how-to-request", label: "How to request access" },
  { id: "fees", label: "Fees" },
  { id: "refusal", label: "Grounds for refusal" },
  { id: "remedies", label: "If you are refused" },
  { id: "popia", label: "Processing of personal information" },
];

export default function PaiaManual() {
  const contactRows: { label: string; value: React.ReactNode }[] = [
    { label: "Private body", value: LEGAL_ENTITY.legalName },
    {
      label: "Registration number",
      value: LEGAL_ENTITY.registrationNumber || "Available from the Information Officer on request",
    },
    {
      label: "Physical address",
      value: LEGAL_ENTITY.physicalAddress || "Available from the Information Officer on request",
    },
    { label: "Website", value: LEGAL_ENTITY.website },
    {
      label: INFORMATION_OFFICER.title,
      value: "The person responsible for this manual and for POPIA compliance (appointed under s55)",
    },
    {
      label: "Privacy desk",
      value: (
        <>
          <a href={`mailto:${INFORMATION_OFFICER.email}`}>{INFORMATION_OFFICER.email}</a>
          {" · "}
          {INFORMATION_OFFICER.phone}
        </>
      ),
    },
  ];

  return (
    <LegalLayout
      title="PAIA Manual"
      subtitle="How to request access to records held by Lasha, prepared under section 51 of the Promotion of Access to Information Act 2 of 2000 (PAIA)."
      effectiveDate={PRIVACY_NOTICE_EFFECTIVE_DATE}
      version={PRIVACY_POLICY_VERSION}
      sections={SECTIONS}
      highlight={
        <>
          <strong>Requesting a record?</strong> Send a completed PAIA Form 2 to our
          Information Officer at{" "}
          <a href={`mailto:${PRIVACY_CONTACT.email}`}>{PRIVACY_CONTACT.email}</a>. For
          your own personal information, the faster route is{" "}
          <Link to="/privacy-rights">Your Privacy Rights</Link>, which is free and
          answered within 30 days.
        </>
      }
    >
      <h2 id="purpose">1. Purpose of this manual</h2>
      <p>
        This manual explains how to ask Lasha for access to records we hold, what
        records we keep, and how we process personal information. It is published
        under section 51 of PAIA and is available free of charge on this page. A
        copy can be sent to you on request from the Information Officer.
      </p>
      <p>
        PAIA gives effect to the constitutional right of access to information. It
        applies to records that are needed to exercise or protect a right, subject
        to the grounds for refusal in Chapter 4 of PAIA. Requests for your own
        personal information are usually better made under POPIA, through{" "}
        <Link to="/privacy-rights">Your Privacy Rights</Link>.
      </p>

      <h2 id="contact">2. Contact details</h2>
      <table>
        <tbody>
          {contactRows.map((row) => (
            <tr key={row.label}>
              <th>{row.label}</th>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 id="guide">3. The PAIA guide</h2>
      <p>
        The Information Regulator publishes a guide on how to use PAIA, including how
        to request records and how to complain. It is available from the Regulator
        and on its website. Our Information Officer will give you a copy on request,
        free of charge.
      </p>
      <table>
        <tbody>
          <tr>
            <th>Regulator</th>
            <td>{REGULATOR.name}</td>
          </tr>
          <tr>
            <th>Address</th>
            <td>{REGULATOR.address}</td>
          </tr>
          <tr>
            <th>Telephone</th>
            <td>
              {REGULATOR.phone} · toll free {REGULATOR.tollFree}
            </td>
          </tr>
          <tr>
            <th>Email</th>
            <td>
              <a href={`mailto:${REGULATOR.email}`}>{REGULATOR.email}</a>
            </td>
          </tr>
          <tr>
            <th>Website</th>
            <td>
              <a href={REGULATOR.website} target="_blank" rel="noreferrer">
                {REGULATOR.website}
              </a>
            </td>
          </tr>
        </tbody>
      </table>

      <h2 id="automatic">4. Records available without a request</h2>
      <p>
        The following are already public and do not need a PAIA request:
      </p>
      <ul>
        <li>
          This manual, our <Link to="/privacy">Privacy Notice</Link>,{" "}
          <Link to="/cookies">Cookie Notice</Link> and{" "}
          <Link to="/terms">Terms of Service</Link>.
        </li>
        <li>Service descriptions, pricing information and product documentation published on {LEGAL_ENTITY.website}.</li>
        <li>Marketing material, brochures and press information.</li>
      </ul>

      <h2 id="legislation">5. Records held under other legislation</h2>
      <p>
        We hold records because the following laws require or permit us to keep them.
        Other legislation may also apply depending on the record and the customer.
      </p>
      <ul>
        <li>Companies Act 71 of 2008 — company records, registers and resolutions.</li>
        <li>
          Tax Administration Act 28 of 2011 and Value-Added Tax Act 89 of 1991 —
          invoices, tax records and supporting documents.
        </li>
        <li>
          Labour Relations Act 66 of 1995 and Basic Conditions of Employment Act 75
          of 1997 — records for people we employ.
        </li>
        <li>
          Electronic Communications and Transactions Act 25 of 2002 — electronic
          transaction records.
        </li>
        <li>Consumer Protection Act 68 of 2008 — customer agreements and complaints.</li>
      </ul>

      <h2 id="records">6. Subjects and categories of records we hold</h2>
      <table>
        <thead>
          <tr>
            <th>Subject</th>
            <th>Categories of records</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Company secretarial</td>
            <td>Registration documents, registers, resolutions, contracts</td>
          </tr>
          <tr>
            <td>Finance and tax</td>
            <td>Financial statements, invoices, payment records, tax returns, reconciliations</td>
          </tr>
          <tr>
            <td>Customers</td>
            <td>
              Account and business details, orders, delivery records, proof of
              delivery, invoices, support correspondence
            </td>
          </tr>
          <tr>
            <td>Drivers and contractors</td>
            <td>
              Applications, identity and licence records, vehicle records, payout
              records, ratings and performance records
            </td>
          </tr>
          <tr>
            <td>Operators and suppliers</td>
            <td>Operator agreements, service contracts, invoices, security assessments</td>
          </tr>
          <tr>
            <td>Information technology</td>
            <td>
              System documentation, access records, audit logs, security policies and
              incident records
            </td>
          </tr>
          <tr>
            <td>Marketing</td>
            <td>Consent records, campaign records, opt-out records, demo enquiries</td>
          </tr>
          <tr>
            <td>Privacy</td>
            <td>Privacy requests, our responses, consent history, PAIA request register</td>
          </tr>
        </tbody>
      </table>

      <h2 id="how-to-request">7. How to request access</h2>
      <ol>
        <li>
          Complete the prescribed request form — PAIA Form 2 for a private body. Ask
          our Information Officer for a copy if you cannot download it from the
          Regulator’s website.
        </li>
        <li>
          Send it to the Information Officer at{" "}
          <a href={`mailto:${PRIVACY_CONTACT.email}`}>{PRIVACY_CONTACT.email}</a>. If
          you prefer to deliver it in person, ask the Information Officer for our
          physical address first.
        </li>
        <li>Provide proof of identity, and proof of authority if you are acting for someone else.</li>
        <li>
          Say which right you want to exercise or protect, and why the record is
          needed for that.
        </li>
        <li>
          Pay the prescribed request fee, if one applies, before we process the
          request. We will tell you the amount and how to pay.
        </li>
      </ol>
      <p>
        We decide within 30 days of receiving a complete request and the fee. Where
        the request is for a large volume of records or needs consultation with
        someone else, we may extend that period once by a further 30 days and will
        tell you in writing why. If we need clarification, the clock stops until we
        receive it.
      </p>
      <p>
        Requests about your own personal information do not need a PAIA form — use{" "}
        <Link to="/privacy-rights">Your Privacy Rights</Link>. We can also answer
        many questions by pointing you to records that are already public.
      </p>

      <h2 id="fees">8. Fees</h2>
      <p>
        PAIA prescribes request and access fees for private bodies. The current
        amounts are set in the PAIA Regulations and published by the Information
        Regulator; we do not set them. We will confirm the fee that applies to your
        request before you pay it. Confirming whether we hold your personal
        information is free (POPIA s23(1)(a)), and we do not charge for correction or
        deletion requests under s24. Fees are waived where the law requires it, for
        example where the requester is unable to pay and the record is needed to
        exercise a right.
      </p>

      <h2 id="refusal">9. Grounds for refusal</h2>
      <p>
        We may refuse access to a record where PAIA allows it. The grounds include
        protecting:
      </p>
      <ul>
        <li>The personal information and privacy of a third party, including a deceased person.</li>
        <li>Commercial information of a third party, such as trade secrets or pricing.</li>
        <li>Confidential information of a third party.</li>
        <li>The safety of individuals and the security of property.</li>
        <li>Records privileged from production in legal proceedings.</li>
        <li>Research information of a third party or of ours.</li>
        <li>Records whose disclosure would prejudice a lawful investigation or a court process.</li>
      </ul>
      <p>
        If we refuse a request, we will tell you in writing which ground we relied
        on, the reasons, and how to challenge the decision. We will give you the
        parts of a record that can be released, even if other parts are refused.
      </p>

      <h2 id="remedies">10. If you are refused, or we do not respond</h2>
      <p>
        For a private body there is no internal appeal. You may:
      </p>
      <ul>
        <li>
          Complain to the Information Regulator using PAIA Form 5, emailed to{" "}
          <a href={`mailto:${REGULATOR.paiaComplaintsEmail}`}>
            {REGULATOR.paiaComplaintsEmail}
          </a>
          , or lodge the complaint through the Regulator’s eServices portal.
        </li>
        <li>Apply to a court for an order requiring access to the record.</li>
      </ul>
      <p>
        We would rather resolve it directly first. Write to the Information Officer
        and we will reconsider, explain the decision or release what we can.
      </p>

      <h2 id="popia">11. Processing of personal information (POPIA section 51(1)(c))</h2>
      <p>
        This section summarises the processing described in full in our{" "}
        <Link to="/privacy">Privacy Notice</Link>.
      </p>
      <h3>Purpose of processing</h3>
      <ul>
        <li>Creating and operating customer and driver accounts.</li>
        <li>Quoting, booking, dispatching, delivering, tracking and proving delivery.</li>
        <li>Payments, invoicing, wallet balances and driver payouts.</li>
        <li>Driver onboarding, identity verification and safety.</li>
        <li>Service notifications, support and claims handling.</li>
        <li>Security, fraud prevention, audit and legal compliance.</li>
        <li>Marketing email, only where a person has opted in.</li>
      </ul>
      <h3>Data subjects and categories of information</h3>
      <p>
        Customers, their staff, recipients, drivers, business contacts, website
        visitors and applicants. Categories are: identifying and contact details,
        business details, delivery and address information, location during an active
        delivery, proof of delivery, driver identity and licence details, banking
        details for payouts, payment records (never card numbers), support
        correspondence, consent records, and security and audit logs.
      </p>
      <h3>Recipients and operators</h3>
      <p>
        Information is shared with the assigned driver, with the operators listed
        below, and with authorities where the law requires it.{" "}
        <strong>We do not sell personal information.</strong>
      </p>
      <table>
        <thead>
          <tr>
            <th>Operator</th>
            <th>Service</th>
            <th>Country</th>
          </tr>
        </thead>
        <tbody>
          {OPERATORS.map((operator) => (
            <tr key={operator.name}>
              <td>{operator.name}</td>
              <td>{operator.service}</td>
              <td>{operator.country}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Transfers outside South Africa</h3>
      <p>
        Some operators process information in {CROSS_BORDER_COUNTRIES.join(", ")}.
        Transfers rely on a binding agreement requiring protection substantially
        similar to POPIA (section 72(1)(a)); special personal information and
        children’s information are not transferred to countries without an adequate
        level of protection without prior authorisation from the Regulator.
      </p>
      <h3>Security measures</h3>
      <p>
        Encryption in transit and at rest, server-side authorisation on every read
        and write, role-based least privilege, hashed passwords, audit logging with
        personal information redacted, operator due diligence, and scheduled deletion
        at the end of the retention period. A security compromise is
        reported to the Regulator and affected people as required by section 22.
      </p>
      <h3>Access, correction and objection</h3>
      <p>
        A data subject may ask what we hold, ask for a copy, ask for correction or
        deletion, object to processing, withdraw consent and complain to the
        Regulator. Use <Link to="/privacy-rights">Your Privacy Rights</Link> or email{" "}
        <a href={`mailto:${PRIVACY_CONTACT.email}`}>{PRIVACY_CONTACT.email}</a>. We
        answer within 30 days.
      </p>
    </LegalLayout>
  );
}
