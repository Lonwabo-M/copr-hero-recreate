import { Link } from "react-router";
import { AlertTriangle } from "lucide-react";
import LegalLayout, { type LegalSection } from "./LegalLayout";
import { SECURITY_CONTACT } from "@/lib/legal";

/**
 * Acceptable Use Policy.
 *
 * The enforceable rules for what may be sent through Lasha, how accounts and
 * vehicles may be used, and what happens when those rules are broken. It is
 * the document payment providers, insurers and corporate customers ask for
 * when they review the platform, so it is written as an operative policy —
 * not marketing copy — and cross-references the Terms of Service.
 */

const EFFECTIVE_DATE = "29 October 2026";
const VERSION = "1.0";

const SECTIONS: LegalSection[] = [
  { id: "scope", label: "Scope" },
  { id: "prohibited-goods", label: "Prohibited goods" },
  { id: "restricted-goods", label: "Restricted goods" },
  { id: "accounts", label: "Account rules" },
  { id: "drivers", label: "Driver and vehicle rules" },
  { id: "declarations", label: "Declarations and inspections" },
  { id: "enforcement", label: "Enforcement" },
  { id: "report", label: "Report abuse" },
];

export default function AcceptableUse() {
  return (
    <LegalLayout
      title="Acceptable Use Policy"
      subtitle="What you may and may not send through Lasha, how accounts and vehicles may be used, and what happens when these rules are broken. This policy applies to every customer, business user, recipient and driver on the platform."
      effectiveDate={EFFECTIVE_DATE}
      version={VERSION}
      sections={SECTIONS}
      highlight={
        <span style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>
            If you are unsure whether a parcel is allowed, ask before booking at{" "}
            <a href="mailto:hello@lasha.co.za">hello@lasha.co.za</a>. A booking
            does not make a prohibited item acceptable, and a false declaration
            is a breach of this policy and of the{" "}
            <Link to="/terms">Terms of Service</Link>.
          </span>
        </span>
      }
    >
      <h2 id="scope">1. Scope</h2>
      <p>
        This policy forms part of your agreement with Lasha Logistics
        (&ldquo;Lasha&rdquo;). It applies to everyone who books, sends, receives
        or carries a parcel through the platform, and to every person who holds
        a Lasha account, including business and fleet accounts.
      </p>
      <p>
        Where this policy and the <Link to="/terms">Terms of Service</Link>{" "}
        differ, the stricter rule applies to the specific conduct described
        here. South African law always overrides both.
      </p>

      <h2 id="prohibited-goods">2. Prohibited goods</h2>
      <p>
        Lasha does not carry the following, and you may not book them or declare
        them as something else:
      </p>
      <ul>
        <li>
          <strong>Illegal goods and substances</strong> — narcotics and
          dependence-producing drugs, unregistered medicines, stolen or
          counterfeit goods, and anything whose possession or transport is an
          offence.
        </li>
        <li>
          <strong>Weapons and ammunition</strong> — firearms, ammunition,
          explosives, detonators, and firearm parts, except where a licensed
          dealer holds the permits required by the Firearms Control Act 60 of
          2000 and Lasha has agreed in writing in advance.
        </li>
        <li>
          <strong>Dangerous and hazardous materials</strong> — flammable
          liquids and gases, corrosives, oxidisers, toxic or infectious
          substances, radioactive material, and any substance regulated by the
          Hazardous Substances Act 15 of 1973 that has not been declared and
          accepted in writing as a dangerous-goods consignment.
        </li>
        <li>
          <strong>Human remains, tissue, organs or blood</strong> outside an
          approved medical-courier agreement, and live animals (other than
          approved livestock movements arranged directly with Lasha).
        </li>
        <li>
          <strong>Wildlife and wildlife products</strong> — including species
          listed under CITES or the National Environmental Management:
          Biodiversity Act 10 of 2004.
        </li>
        <li>
          <strong>Cash, bearer instruments and high-value valuables</strong> —
          banknotes, coin, uncut gemstones, bullion, and negotiable instruments,
          unless declared and separately insured in writing.
        </li>
        <li>
          <strong>Pornographic or exploitative material</strong>, and any
          material that sexualises minors.
        </li>
        <li>
          <strong>Items that cannot be carried safely</strong> — anything that
          is wet, leaking, infested, excessively odorous, or that could damage
          other parcels or the vehicle.
        </li>
      </ul>

      <h2 id="restricted-goods">3. Restricted goods</h2>
      <p>
        The following may be carried only when you declare them accurately at
        booking, package them to the standard the goods require, and Lasha
        accepts the booking:
      </p>
      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Condition</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Alcohol and tobacco</td>
            <td>Lawful for the recipient to possess; declared; not sent to a minor.</td>
          </tr>
          <tr>
            <td>Prescription medicines</td>
            <td>Lawful prescription for the named recipient; original packaging; declared.</td>
          </tr>
          <tr>
            <td>Lithium batteries and electronics</td>
            <td>Declared; original packaging or approved battery packaging; no damaged or recalled cells.</td>
          </tr>
          <tr>
            <td>Perishables and chilled goods</td>
            <td>Booked on a service that meets the temperature and transit-time requirement; packed by the sender.</td>
          </tr>
          <tr>
            <td>High-value goods (over R10 000)</td>
            <td>Declared value stated; additional insurance arranged; signature and photographic proof of delivery required.</td>
          </tr>
        </tbody>
      </table>
      <p>
        Undeclared restricted goods are treated as prohibited goods for
        enforcement purposes. The sender remains liable for any loss, damage,
        fine, seizure or cleanup cost the consignment causes.
      </p>

      <h2 id="accounts">4. Account rules</h2>
      <ul>
        <li>
          Give accurate registration details and keep them current. Accounts
          registered with false names, false addresses or someone else&rsquo;s
          identity will be closed.
        </li>
        <li>
          Do not share login credentials or let another person use your account.
          You are responsible for bookings made on your account until you report
          the compromise to us.
        </li>
        <li>
          Do not use the platform to send unsolicited bulk goods, to launder
          money, to evade tax or customs duties, or to move goods across a border
          without the required declaration.
        </li>
        <li>
          Do not attempt to access another user&rsquo;s account, probe or bypass
          platform security, scrape the service, reverse engineer the tracking
          system, or interfere with dispatch, pricing or payment systems.
        </li>
        <li>
          Do not submit false claims, inflated values or fraudulent refund
          requests. Claims are investigated and false claims are pursued.
        </li>
        <li>
          Do not use the platform to harass our staff, drivers or other users,
          or to send threatening or unlawful material.
        </li>
      </ul>

      <h2 id="drivers">5. Driver and vehicle rules</h2>
      <p>
        Drivers are held to the standards in their onboarding agreement and the
        following minimum rules:
      </p>
      <ul>
        <li>
          Hold a valid South African driver&rsquo;s licence for the vehicle
          class, and keep the vehicle licensed, roadworthy and insured for
          commercial use.
        </li>
        <li>
          Never drive under the influence of alcohol, drugs or any substance that
          impairs driving, and never use a hand-held phone while driving.
        </li>
        <li>
          Carry only the parcels assigned to you, keep them secure, and do not
          open, inspect, substitute, divert or dispose of a parcel. Report
          damaged or leaking parcels to operations before delivery.
        </li>
        <li>
          Do not subcontract a delivery, allow an unregistered person to drive
          your vehicle on a Lasha job, or use a vehicle other than the one on
          your approved profile.
        </li>
        <li>
          Capture proof of delivery truthfully. Falsifying a signature,
          photograph, recipient name or delivery time is grounds for immediate
          removal and may be reported to the police.
        </li>
        <li>
          Treat customers and recipients with respect. Discrimination,
          intimidation, sexual harassment and theft are prohibited.
        </li>
      </ul>

      <h2 id="declarations">6. Declarations and inspections</h2>
      <p>
        When you book, you confirm that the goods are accurately described, are
        not prohibited, and are packed and labelled lawfully. Lasha may:
      </p>
      <ul>
        <li>ask for a description, invoice, permit or licence before accepting a booking;</li>
        <li>
          inspect or open a parcel where there is a reasonable suspicion of
          prohibited goods, a safety risk, or a legal requirement to do so — where
          practicable, in the sender&rsquo;s presence or with the sender
          informed;
        </li>
        <li>
          refuse, hold, return or dispose of a consignment at the sender&rsquo;s
          cost where this policy is breached; and
        </li>
        <li>
          report suspected offences to the South African Police Service, the
          South African Revenue Service, or another regulator, and cooperate with
          lawful investigations.
        </li>
      </ul>

      <h2 id="enforcement">7. Enforcement</h2>
      <p>
        Enforcement is proportionate to the risk and is recorded. Depending on
        the breach, Lasha may:
      </p>
      <ol>
        <li>issue a written warning and require corrective action;</li>
        <li>remove the offending listing, refuse the booking or suspend the account;</li>
        <li>
          suspend a driver immediately — including removing them from dispatch —
          while an allegation of theft, assault, falsified proof of delivery or
          prohibited-goods transport is investigated;
        </li>
        <li>
          hold settlement of affected earnings while a dispute or investigation
          is open, and withhold them where the investigation confirms the
          conduct;
        </li>
        <li>
          close the account and terminate the agreement; and
        </li>
        <li>
          recover losses, report the matter to a regulator or the police, and
          take legal action.
        </li>
      </ol>
      <p>
        Urgent suspensions take effect immediately. Before a permanent
        restriction, the affected person is told the substance of the allegation
        and given a reasonable opportunity to respond, unless doing so would
        compromise an investigation or put someone at risk.
      </p>

      <h2 id="report">8. Report abuse</h2>
      <p>
        Report a prohibited consignment, a security problem or driver
        misconduct to{" "}
        <a href="mailto:hello@lasha.co.za">hello@lasha.co.za</a>. Report a
        vulnerability in the platform to{" "}
        <a href={`mailto:${SECURITY_CONTACT.email}`}>{SECURITY_CONTACT.email}</a>.
        A delivery dispute is raised in the platform under{" "}
        <Link to="/disputes">Disputes</Link>, or by email if you cannot sign in.
      </p>
      <p>
        Reports are handled confidentially. We will not disclose the identity of
        a reporter unless the law requires it or the reporter agrees.
      </p>
    </LegalLayout>
  );
}
