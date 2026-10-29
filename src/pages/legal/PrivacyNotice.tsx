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
  { id: "who-we-are", label: "Who we are" },
  { id: "scope", label: "Who this notice covers" },
  { id: "information", label: "What we collect" },
  { id: "why", label: "Why we process it" },
  { id: "mandatory", label: "Must you give it to us?" },
  { id: "sharing", label: "Who we share it with" },
  { id: "cross-border", label: "Transfers outside South Africa" },
  { id: "marketing", label: "Direct marketing" },
  { id: "cookies", label: "Cookies and tracking" },
  { id: "automated", label: "Automated decisions" },
  { id: "retention", label: "How long we keep it" },
  { id: "security", label: "How we protect it" },
  { id: "rights", label: "Your rights" },
  { id: "children", label: "Children" },
  { id: "changes", label: "Changes to this notice" },
  { id: "complaints", label: "Contact and complaints" },
];

export default function PrivacyNotice() {
  return (
    <LegalLayout
      title="Privacy Notice"
      subtitle="How Lasha collects, uses and protects personal information, and the rights you have over it under the Protection of Personal Information Act 4 of 2013 (POPIA)."
      effectiveDate={PRIVACY_NOTICE_EFFECTIVE_DATE}
      version={PRIVACY_POLICY_VERSION}
      sections={SECTIONS}
      highlight={
        <>
          <strong>In one paragraph:</strong> we collect what a delivery needs and
          nothing more, we do not sell your information, we share it only with the
          operators that run the platform, and you can ask us what we hold, fix it
          or delete it at any time. Use{" "}
          <Link to="/privacy-rights">Your Privacy Rights</Link> or email{" "}
          <a href={`mailto:${PRIVACY_CONTACT.email}`}>{PRIVACY_CONTACT.email}</a>.
        </>
      }
    >
      <h2 id="who-we-are">1. Who we are</h2>
      <p>
        Lasha Logistics is the trading name of CLADOGRAM, a private company
        registered in South Africa (<strong>“Lasha”</strong>, “we”, “us”). CLADOGRAM
        is the responsible party for the personal information described in this
        notice. We operate the Lasha delivery platform: quoting, booking, dispatch,
        tracking, proof of delivery, invoicing and payment.
      </p>
      <table>
        <tbody>
          <tr>
            <th>Responsible party</th>
            <td>{LEGAL_ENTITY.legalName}</td>
          </tr>
          {LEGAL_ENTITY.registrationNumber ? (
            <tr>
              <th>Registration number</th>
              <td>{LEGAL_ENTITY.registrationNumber}</td>
            </tr>
          ) : null}
          {LEGAL_ENTITY.physicalAddress ? (
            <tr>
              <th>Physical address</th>
              <td>{LEGAL_ENTITY.physicalAddress}</td>
            </tr>
          ) : null}
          <tr>
            <th>Website</th>
            <td>{LEGAL_ENTITY.website}</td>
          </tr>
          <tr>
            <th>{INFORMATION_OFFICER.title}</th>
            <td>
              <a href={`mailto:${INFORMATION_OFFICER.email}`}>{INFORMATION_OFFICER.email}</a>
              {" · "}
              {INFORMATION_OFFICER.phone}
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        Our Information Officer is responsible for POPIA compliance at Lasha and is
        the person to contact about anything in this notice, including requests about
        your own information. The appointment is made under section 55 of POPIA; ask
        the desk above for the current registration details.
      </p>

      <h2 id="scope">2. Who this notice covers</h2>
      <p>This notice applies to personal information we process about:</p>
      <ul>
        <li>
          <strong>Customers</strong> — businesses and the people who use them to
          book deliveries, including account holders and their staff.
        </li>
        <li>
          <strong>Drivers</strong> — independent drivers and couriers who apply to,
          or deliver on, the platform.
        </li>
        <li>
          <strong>Recipients</strong> — the people named to receive a parcel. We
          receive their details from the customer.
        </li>
        <li>
          <strong>Business contacts</strong> — people at suppliers, operators and
          prospective customers we deal with. POPIA also protects juristic persons,
          so company information is treated the same way.
        </li>
        <li>
          <strong>Visitors</strong> — people who browse the website, book a demo or
          contact support.
        </li>
      </ul>
      <p>
        It applies to {LEGAL_ENTITY.website} and to every Lasha application: the
        customer portal, the Driver App, the Operations Centre and the Admin Portal.
      </p>

      <h2 id="information">3. What we collect and where it comes from</h2>
      <p>
        Most information comes directly from you. Customers give us their own
        details and the recipient’s details. Drivers give us their onboarding
        documents. We also generate records as deliveries happen.
      </p>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>What it includes</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Account</td>
            <td>
              Name, email address, mobile number, password (stored only as a
              cryptographic hash), role, business name and delivery preferences
            </td>
            <td>You, at sign-up and in settings</td>
          </tr>
          <tr>
            <td>Delivery</td>
            <td>
              Sender and recipient names, email addresses, mobile numbers, street
              addresses and coordinates, parcel description, declared value, special
              instructions
            </td>
            <td>You, when booking</td>
          </tr>
          <tr>
            <td>Proof of delivery</td>
            <td>
              Recipient signature or photograph, name of the person who accepted,
              timestamp and delivery location
            </td>
            <td>Generated during delivery</td>
          </tr>
          <tr>
            <td>Driver onboarding</td>
            <td>
              Identity number, driver’s licence, vehicle registration and make,
              banking details for payouts, contact details, application documents
            </td>
            <td>You, when applying to drive</td>
          </tr>
          <tr>
            <td>Payment and billing</td>
            <td>
              Amounts, payment references, Paystack transaction codes, invoices,
              wallet balance. We never receive or store card numbers.
            </td>
            <td>You and Paystack</td>
          </tr>
          <tr>
            <td>Location</td>
            <td>
              Driver location while a delivery is active, and route information used
              to track and estimate arrival
            </td>
            <td>Driver App during an active delivery</td>
          </tr>
          <tr>
            <td>Support and sales</td>
            <td>Messages, demo requests, complaint details and our replies</td>
            <td>You</td>
          </tr>
          <tr>
            <td>Security and audit</td>
            <td>
              Sign-in events, IP address, browser and device information, and an
              audit trail of actions taken in the platform
            </td>
            <td>Generated automatically when you use Lasha</td>
          </tr>
          <tr>
            <td>Consent</td>
            <td>
              Which permissions you gave or withdrew, the exact wording you saw, and
              when
            </td>
            <td>You, when you tick or untick a consent box</td>
          </tr>
        </tbody>
      </table>
      <p>
        A South African identity number contains a date of birth, sex and
        citizenship indicator. We collect it only from drivers, only because we must
        verify who is delivering and who is entitled to a payout. We do not collect
        identity numbers from customers.
      </p>

      <h2 id="why">4. Why we process it, and our lawful basis</h2>
      <p>
        Every purpose below has a basis in section 11(1) of POPIA. We do not use
        your information for anything else without checking that the new purpose is
        compatible with the original one (s15) or asking for your consent.
      </p>
      <table>
        <thead>
          <tr>
            <th>Purpose</th>
            <th>Information used</th>
            <th>Lawful basis</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Create and operate your account, sign you in, support you</td>
            <td>Account and support information</td>
            <td>s11(1)(b) — performance of our contract with you</td>
          </tr>
          <tr>
            <td>Quote, book, dispatch, deliver and track parcels</td>
            <td>Account, delivery, location and proof-of-delivery information</td>
            <td>s11(1)(b) — performance of our contract</td>
          </tr>
          <tr>
            <td>Handle claims, disputes and insurance recoveries</td>
            <td>Delivery and proof-of-delivery records</td>
            <td>s11(1)(f) — our legitimate interest in defending and pursuing claims</td>
          </tr>
          <tr>
            <td>Take payment, invoice and keep financial records</td>
            <td>Payment, billing and account information</td>
            <td>
              s11(1)(b) contract; s11(1)(c) legal obligation under tax legislation
            </td>
          </tr>
          <tr>
            <td>Onboard drivers, verify identity and pay earnings</td>
            <td>Driver onboarding and banking information</td>
            <td>
              s11(1)(b) contract; s11(1)(c) legal obligation; s11(1)(f) safety of
              people and cargo
            </td>
          </tr>
          <tr>
            <td>Keep the platform secure, prevent fraud and abuse</td>
            <td>Security, audit and device information</td>
            <td>s11(1)(f) — legitimate interest in a safe, secure service</td>
          </tr>
          <tr>
            <td>Send service messages about your deliveries</td>
            <td>Contact details and delivery records</td>
            <td>s11(1)(b) — performance of our contract</td>
          </tr>
          <tr>
            <td>Answer your privacy requests</td>
            <td>Request details and correspondence</td>
            <td>s11(1)(c) — legal obligation under POPIA sections 23 to 25</td>
          </tr>
          <tr>
            <td>Send marketing email — only if you opt in</td>
            <td>Name, email address and consent record</td>
            <td>s11(1)(a) — consent, read with s69</td>
          </tr>
          <tr>
            <td>Optional product analytics — only if you opt in</td>
            <td>Usage events, browser and device information</td>
            <td>s11(1)(a) — consent</td>
          </tr>
        </tbody>
      </table>
      <p>
        We do not make decisions about you based on special personal information
        such as health, religion, race, political beliefs, trade union membership,
        biometrics, sex life or criminal behaviour (s26). If a driver tells us about
        an injury or a medical condition so that we can keep them safe, we use it
        only for that purpose.
      </p>

      <h2 id="mandatory">5. Is providing information voluntary or mandatory?</h2>
      <p>
        You choose whether to open an account, book a delivery or apply to drive.
        Once you do, some fields are required: without an email address we cannot
        create an account, and without a delivery address we cannot deliver. Required
        fields are marked on the form; everything else is optional and labelled as
        such.
      </p>
      <p>
        If you do not give us required information, we cannot provide that part of
        the service — for example, a booking without a recipient address cannot be
        dispatched.
      </p>
      <p>
        We do not need a specific law to collect most of what is described above;
        we collect it to perform our contract with you. Where a law does require us
        to keep records, it is the tax legislation: the Tax Administration Act 28 of
        2011 and the Value-Added Tax Act 89 of 1991 require us to keep invoices and
        payment records for five years, and the Companies Act 71 of 2008 requires
        company records.
      </p>

      <h2 id="sharing">6. Who we share it with</h2>
      <p>
        <strong>We do not sell your personal information</strong> and we do not share
        it for anyone else’s marketing. We share it only with:
      </p>
      <ul>
        <li>
          <strong>The driver</strong> assigned to your delivery — name, phone number,
          addresses and delivery instructions, so the parcel can be collected and
          handed over.
        </li>
        <li>
          <strong>Our operators</strong> — companies that process information on our
          behalf under contractual terms requiring confidentiality, security and
          POPIA-compliant handling (s20, s21).
        </li>
        <li>
          <strong>Authorities</strong> — a regulator, court, SAPS or SARS where the
          law requires it, or where we must establish or defend a legal claim.
        </li>
        <li>
          <strong>A buyer or investor</strong> — if the business is sold or
          restructured, information may transfer as part of it, on the same terms as
          this notice.
        </li>
      </ul>
      <table>
        <thead>
          <tr>
            <th>Operator</th>
            <th>Service</th>
            <th>Information shared</th>
            <th>Country</th>
          </tr>
        </thead>
        <tbody>
          {OPERATORS.map((operator) => (
            <tr key={operator.name}>
              <td>{operator.name}</td>
              <td>{operator.service}</td>
              <td>{operator.data}</td>
              <td>{operator.country}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 id="cross-border">7. Transfers outside South Africa</h2>
      <p>
        Some operators process information outside South Africa, in{" "}
        {CROSS_BORDER_COUNTRIES.join(", ")}. We transfer personal information only on
        a ground in section 72(1) of POPIA. Our default ground is a binding written
        agreement that requires the recipient to protect the information to a
        standard substantially similar to POPIA, including limits on onward
        transfers. The legal protection in the destination country may differ from
        South African law.
      </p>
      <p>
        Where a transfer involves special personal information or children’s
        personal information, we do not transfer it to a country without an adequate
        level of protection unless the Information Regulator has authorised it
        (s57(1)(d)).
      </p>

      <h2 id="marketing">8. Direct marketing</h2>
      <p>
        We send marketing email only if you opt in. The marketing box is unticked by
        default and is never bundled into creating an account or booking a delivery.
        We do not rely on the existing-customer exception in s69(3) — a customer who
        has not opted in will not be marketed to.
      </p>
      <p>
        Every marketing message identifies Lasha and explains how to stop receiving
        it. You can also withdraw consent at any time on{" "}
        <Link to="/privacy-rights">Your Privacy Rights</Link>, and the withdrawal
        takes effect immediately for future messages. Opting out is never treated as
        consent, and it never affects your deliveries.
      </p>

      <h2 id="cookies">9. Cookies and tracking</h2>
      <p>
        The platform uses strictly necessary cookies to keep you signed in. We do not
        use analytics, advertising pixels or cross-site tracking, and we do not load
        anything optional unless you opt in. The full list, with names and
        durations, is in the <Link to="/cookies">Cookie Notice</Link>.
      </p>
      <p>
        Driver location is collected only while a delivery is active on the Driver
        App, so customers can see progress and operations can dispatch safely. It is
        not tracked between deliveries.
      </p>

      <h2 id="automated">10. Automated decisions</h2>
      <p>
        Lasha automatically ranks available drivers for a delivery using distance,
        capacity and performance signals, and automatically expires an offer that is
        not accepted in time. These are operational routing decisions, not decisions
        with legal consequences for you.
      </p>
      <p>
        We do not make decisions that have legal consequences, or that affect you to
        a substantial degree, based solely on automated processing (s71). A person
        can review any dispatch or account decision: operations staff can reassign a
        delivery, and you can ask us to explain and review a decision by emailing{" "}
        <a href={`mailto:${PRIVACY_CONTACT.email}`}>{PRIVACY_CONTACT.email}</a>.
      </p>

      <h2 id="retention">11. How long we keep it</h2>
      <p>
        We keep personal information only as long as we need it for the purpose it
        was collected for, or as long as a law requires. After that we delete,
        destroy or de-identify it so it cannot be reconstructed (s14(4), s14(5)).
        Backups expire on their normal cycle.
      </p>
      <table>
        <thead>
          <tr>
            <th>Information</th>
            <th>How long</th>
            <th>Counted from</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Account and profile</td>
            <td>While the account is open, then 30 days</td>
            <td>Account closure</td>
          </tr>
          <tr>
            <td>Orders, invoices and payment records</td>
            <td>5 years</td>
            <td>End of the tax year the record belongs to</td>
          </tr>
          <tr>
            <td>Delivery records and proof of delivery</td>
            <td>24 months, then de-identified</td>
            <td>Delivery completion</td>
          </tr>
          <tr>
            <td>Driver identity, licence and vehicle records</td>
            <td>12 months after the engagement ends</td>
            <td>Last delivery or end of the driver agreement</td>
          </tr>
          <tr>
            <td>Location pings during delivery</td>
            <td>90 days, then deleted or aggregated</td>
            <td>Delivery completion</td>
          </tr>
          <tr>
            <td>Audit and security logs</td>
            <td>24 months</td>
            <td>Event date</td>
          </tr>
          <tr>
            <td>Consent records</td>
            <td>3 years after withdrawal or account closure</td>
            <td>Withdrawal or closure</td>
          </tr>
          <tr>
            <td>Privacy requests and our response</td>
            <td>24 months after the request is closed</td>
            <td>Resolution</td>
          </tr>
          <tr>
            <td>Demo and sales enquiries that do not become customers</td>
            <td>12 months</td>
            <td>Last contact</td>
          </tr>
          <tr>
            <td>Support messages</td>
            <td>24 months</td>
            <td>Last message in the thread</td>
          </tr>
        </tbody>
      </table>

      <h2 id="security">12. How we protect it</h2>
      <p>
        We take reasonable technical and organisational measures to protect personal
        information (s19). These include:
      </p>
      <ul>
        <li>
          Encryption in transit (HTTPS) and encryption at rest through our hosting
          provider.
        </li>
        <li>
          Server-side authorisation on every read and write. The frontend is a
          convenience boundary only; the database refuses unauthorised access even
          if the client is tampered with.
        </li>
        <li>
          Role-based least privilege for staff, so operations staff see what dispatch
          needs and not the whole platform.
        </li>
        <li>Passwords stored only as a memory-hard hash, never in plain text.</li>
        <li>
          An audit trail of sensitive actions, with personal information redacted
          from application logs.
        </li>
        <li>
          Operator due diligence, and a register of every operator and the country it
          processes in.
        </li>
        <li>
          Scheduled deletion of records that have reached the end of their retention
          period.
        </li>
      </ul>
      <p>
        If we have reasonable grounds to believe your personal information has been
        accessed or acquired by an unauthorised person, we will notify the
        Information Regulator and you as soon as reasonably possible (s22). Our
        breach procedure is documented, with a responsible owner and a notification
        template.
      </p>

      <h2 id="rights">13. Your rights</h2>
      <p>Under POPIA you may:</p>
      <ul>
        <li>
          <strong>Ask whether we hold your information</strong> and request a copy of
          it (s23).
        </li>
        <li>
          <strong>Ask us to correct or delete</strong> information that is inaccurate,
          irrelevant, excessive, out of date, incomplete, misleading or unlawfully
          obtained (s24).
        </li>
        <li>
          <strong>Object</strong> to processing based on legitimate interests, and to
          direct marketing at any time (s11(3)).
        </li>
        <li>
          <strong>Withdraw consent</strong> you have given, without affecting
          processing that already happened (s11(2)(b)).
        </li>
        <li>
          <strong>Ask for an explanation</strong> of an automated decision and for a
          person to review it (s71).
        </li>
        <li>
          <strong>Complain</strong> to the Information Regulator (s5, s74).
        </li>
      </ul>
      <p>
        Use <Link to="/privacy-rights">Your Privacy Rights</Link> or email{" "}
        <a href={`mailto:${PRIVACY_CONTACT.email}`}>{PRIVACY_CONTACT.email}</a>. We
        acknowledge a request within 2 business days and answer within 30 days. If we
        need longer because a request is complex, we will tell you why before the 30
        days are up. There is no charge for making a request or for the first copy of
        your information.
      </p>
      <p>
        We may ask you to prove that you are the person the information belongs to
        before we release or change it. We ask for the minimum needed and delete the
        proof once the request is closed.
      </p>
      <p>
        Some records cannot be deleted immediately because the law requires us to
        keep them — invoices and payment records, for example. When that happens we
        explain which records are kept, for how long and why, and we delete or
        de-identify everything else.
      </p>

      <h2 id="children">14. Children</h2>
      <p>
        Lasha is a business service and is not intended for children. We do not
        knowingly collect personal information of anyone under 18. A recipient may be
        a minor — for example, a parcel delivered to a school — but we collect only a
        name and the fact of receipt. If we learn that we hold a child’s information
        without the consent of a competent person, we will delete it unless another
        ground in s35 applies. A parent or guardian can contact our Information
        Officer to review or remove it.
      </p>

      <h2 id="changes">15. Changes to this notice</h2>
      <p>
        We review this notice when we change what we collect, who we share it with or
        how long we keep it — and at least once a year. The version and effective
        date at the top of this page always reflect the current notice. If a change
        is material, we will tell account holders by email or in the platform before
        it takes effect, and re-collect consent where the law requires it.
      </p>

      <h2 id="complaints">16. Contact and complaints</h2>
      <p>
        Start with our Information Officer — most issues are resolved quickly:{" "}
        <a href={`mailto:${PRIVACY_CONTACT.email}`}>{PRIVACY_CONTACT.email}</a>,{" "}
        {PRIVACY_CONTACT.phone}, {PRIVACY_CONTACT.hours}.
      </p>
      <p>
        If you are not satisfied, you may complain to the Information Regulator. A
        PAIA complaint uses Form 5; a POPIA complaint can be lodged through the
        Regulator’s eServices portal.
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
              {" · PAIA complaints: "}
              <a href={`mailto:${REGULATOR.paiaComplaintsEmail}`}>
                {REGULATOR.paiaComplaintsEmail}
              </a>
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
      <p>
        You can also read our <Link to="/paia">PAIA Manual</Link> for how to request
        records we hold, and our <Link to="/terms">Terms of Service</Link> for the
        contract that governs the service.
      </p>
    </LegalLayout>
  );
}
