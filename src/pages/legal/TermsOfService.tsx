import { Link } from "react-router";
import LegalLayout, { type LegalSection } from "@/pages/legal/LegalLayout";
import {
  LEGAL_ENTITY,
  PRIVACY_CONTACT,
  PRIVACY_NOTICE_EFFECTIVE_DATE,
  PRIVACY_POLICY_VERSION,
} from "@/lib/legal";

const SECTIONS: LegalSection[] = [
  { id: "who", label: "Who we are" },
  { id: "service", label: "The service" },
  { id: "accounts", label: "Accounts and security" },
  { id: "acceptable-use", label: "Acceptable use" },
  { id: "pricing", label: "Bookings, pricing and payment" },
  { id: "delivery", label: "Delivery, risk and claims" },
  { id: "refunds", label: "Cancellation and refunds" },
  { id: "drivers", label: "Drivers" },
  { id: "ip", label: "Intellectual property" },
  { id: "liability", label: "Liability" },
  { id: "termination", label: "Suspension and termination" },
  { id: "privacy", label: "Privacy" },
  { id: "law", label: "Governing law" },
];

export default function TermsOfService() {
  return (
    <LegalLayout
      title="Terms of Service"
      subtitle="The agreement between you and Lasha for the use of the delivery platform."
      effectiveDate={PRIVACY_NOTICE_EFFECTIVE_DATE}
      version={PRIVACY_POLICY_VERSION}
      sections={SECTIONS}
    >
      <h2 id="who">1. Who we are</h2>
      <p>
        These terms are an agreement between you and {LEGAL_ENTITY.legalName}{" "}
        (“Lasha”, “we”, “us”). By creating an account, booking a delivery or applying
        to drive, you accept them. If you use Lasha for a business, you confirm that
        you may accept them for that business.
      </p>

      <h2 id="service">2. The service</h2>
      <p>
        Lasha is a logistics platform. It quotes and books deliveries, matches them to
        approved independent drivers, tracks progress, records proof of delivery,
        issues invoices and processes payment. Lasha coordinates the delivery; the
        driver performs it.
      </p>
      <p>
        The platform is provided as it is and as available. We work to keep it
        running, but we do not promise uninterrupted access — maintenance, network
        faults and third-party outages happen.
      </p>

      <h2 id="accounts">3. Accounts and security</h2>
      <ul>
        <li>Give accurate, current information and keep it up to date.</li>
        <li>
          Keep your password confidential. You are responsible for activity under
          your account until you tell us it has been compromised.
        </li>
        <li>
          One person per login. Do not share credentials or let anyone else use your
          account.
        </li>
        <li>
          Tell us immediately at{" "}
          <a href={`mailto:${PRIVACY_CONTACT.email}`}>{PRIVACY_CONTACT.email}</a> if
          you suspect unauthorised access.
        </li>
      </ul>

      <h2 id="acceptable-use">4. Acceptable use and prohibited items</h2>
      <p>You may not use Lasha to send:</p>
      <ul>
        <li>hazardous, flammable, explosive or radioactive materials;</li>
        <li>illegal substances or goods, or anything that infringes another person’s rights;</li>
        <li>firearms, ammunition or weapons;</li>
        <li>cash, negotiable instruments, precious metals or stones;</li>
        <li>live animals, human remains or biological samples requiring specialised handling;</li>
        <li>
          perishable goods without packaging that keeps them safe for the journey;
        </li>
        <li>anything prohibited by South African law or by the destination country.</li>
      </ul>
      <p>
        You also may not attempt to access another customer’s data, probe or bypass
        the platform’s security, scrape it, or use it to send unlawful or unsolicited
        messages. We may refuse or stop a delivery that breaches this section and
        report it where the law requires.
      </p>

      <h2 id="pricing">5. Bookings, pricing and payment</h2>
      <p>
        A quote is calculated from the pricing rules in force at the time, using
        distance, service level, parcel size and weight, and any surcharges shown
        before you confirm. A booking is confirmed when you accept the quote and
        payment is authorised or your wallet has sufficient credit.
      </p>
      <p>
        Payments are processed by Paystack. Lasha never receives or stores card
        numbers. Amounts are in South African rand and include VAT where applicable.
        Invoices are available in your account.
      </p>
      <p>
        If a parcel’s actual size or weight differs materially from what was declared,
        we may re-price the delivery and tell you before it is dispatched.
      </p>

      <h2 id="delivery">6. Delivery, risk and claims</h2>
      <p>
        Delivery windows are estimates based on distance, traffic and weather. They
        are not guaranteed times unless we confirm a guaranteed service in writing.
      </p>
      <p>
        Risk passes to the recipient when the parcel is handed over and proof of
        delivery is recorded. Our liability for loss or damage is limited to the
        declared value of the parcel, subject to our claims process. Declare the true
        value — an under-declared parcel is compensated at the declared value.
      </p>
      <p>
        Claims must be lodged with the tracking number, photographs where available
        and a description of the loss or damage, within 7 days of the delivery or of
        the date the delivery should have arrived. We investigate with the driver and
        respond in writing.
      </p>
      <p>
        We are not liable for loss caused by prohibited items, inadequate packaging,
        incorrect addresses or contact details supplied to us, or a recipient who
        refuses the parcel.
      </p>

      <h2 id="refunds">7. Cancellation and refunds</h2>
      <p>
        You may cancel a booking before it is dispatched at no charge. After dispatch,
        the completed legs of the journey are charged and the remainder is refunded.
      </p>
      <p>
        Refund requests must be submitted within 7 days of delivery completion.
        Approved refunds are processed within 5 to 10 business days to the original
        payment method. Wallet credits are applied immediately on approval. Nothing in
        this section limits your rights under the Consumer Protection Act 68 of 2008.
      </p>

      <h2 id="drivers">8. Drivers</h2>
      <p>
        Drivers on Lasha are independent contractors, not employees, agents or
        partners of Lasha. They are responsible for their own tax affairs, vehicle,
        insurance and compliance with traffic law. Drivers must hold a valid licence,
        the required permits and a roadworthy vehicle, and must treat customers and
        parcels with care.
      </p>
      <p>
        Driver applications are reviewed against our onboarding requirements. We may
        decline or suspend a driver who fails those requirements, who breaches these
        terms or whose conduct puts people or parcels at risk.
      </p>

      <h2 id="ip">9. Intellectual property</h2>
      <p>
        The Lasha name, logo, software, designs and documentation belong to us or our
        licensors. We grant you a limited, non-exclusive, non-transferable right to
        use the platform for its intended purpose while your account is active. You
        may not copy, resell, reverse engineer or create derivative works from it
        without our written permission. You keep ownership of the content you upload
        and grant us the right to use it to provide the service.
      </p>

      <h2 id="liability">10. Liability</h2>
      <p>
        To the extent the law allows, Lasha is not liable for indirect or
        consequential loss, loss of profit, loss of business or loss of data. Our
        total liability for a delivery is limited to the declared value of that
        parcel, and for any other claim to the fees you paid us in the three months
        before the event.
      </p>
      <p>
        Nothing in these terms excludes or limits liability that cannot lawfully be
        excluded, including under the Consumer Protection Act 68 of 2008, or liability
        for fraud or wilful misconduct.
      </p>

      <h2 id="termination">11. Suspension and termination</h2>
      <p>
        You may close your account at any time. We may suspend or close an account
        that breaches these terms, creates a security or fraud risk, or is used
        unlawfully. Where it is reasonable to do so, we will tell you why and give you
        a chance to respond. Closing an account does not cancel amounts already due,
        and records we must keep by law are retained as described in the{" "}
        <Link to="/privacy">Privacy Notice</Link>.
      </p>

      <h2 id="privacy">12. Privacy</h2>
      <p>
        We process personal information as described in our{" "}
        <Link to="/privacy">Privacy Notice</Link>. You can exercise your rights at{" "}
        <Link to="/privacy-rights">Your Privacy Rights</Link>. Where you give us
        another person’s details — a recipient, for example — you confirm that you may
        do so and that they know their information will be used to deliver the parcel.
      </p>

      <h2 id="law">13. Changes, governing law and contact</h2>
      <p>
        We may update these terms as the service changes. The version and effective
        date at the top of this page show the current version; material changes are
        announced in the platform or by email before they take effect. These terms are
        governed by South African law, and the courts of South Africa have
        jurisdiction.
      </p>
      <p>
        Questions about these terms:{" "}
        <a href={`mailto:${PRIVACY_CONTACT.email}`}>{PRIVACY_CONTACT.email}</a> or{" "}
        {PRIVACY_CONTACT.phone} ({PRIVACY_CONTACT.hours}). See also our{" "}
        <Link to="/paia">PAIA Manual</Link> and{" "}
        <Link to="/cookies">Cookie Notice</Link>.
      </p>
    </LegalLayout>
  );
}
