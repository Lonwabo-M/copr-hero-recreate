import { Link } from "react-router";
import LegalLayout, { type LegalSection } from "@/pages/legal/LegalLayout";
import {
  LEGAL_ENTITY,
  PRIVACY_CONTACT,
  PRIVACY_NOTICE_EFFECTIVE_DATE,
  PRIVACY_POLICY_VERSION,
} from "@/lib/legal";

const SECTIONS: LegalSection[] = [
  { id: "what", label: "What cookies are" },
  { id: "choices", label: "Your choices" },
  { id: "necessary", label: "Strictly necessary storage" },
  { id: "offline", label: "Driver App offline storage" },
  { id: "optional", label: "Analytics and marketing" },
  { id: "manage", label: "Managing cookies" },
  { id: "contact", label: "Contact" },
];

export default function CookieNotice() {
  return (
    <LegalLayout
      title="Cookie Notice"
      subtitle="The cookies and browser storage Lasha uses, why each one exists, and how to control them."
      effectiveDate={PRIVACY_NOTICE_EFFECTIVE_DATE}
      version={PRIVACY_POLICY_VERSION}
      sections={SECTIONS}
      highlight={
        <>
          <strong>Short version:</strong> Lasha uses only the storage needed to keep
          you signed in and to make an active delivery work offline. There are no
          analytics, advertising or cross-site tracking cookies, so no consent banner
          is shown.
        </>
      }
    >
      <h2 id="what">1. What cookies are</h2>
      <p>
        Cookies are small files a website stores on your device. Similar technologies
        — local storage, session storage and IndexedDB — work in the same way. Some
        are set by us; others are set by a service we use. Information collected
        through them can be personal information, so it is covered by our{" "}
        <Link to="/privacy">Privacy Notice</Link>.
      </p>
      <p>
        This notice applies to {LEGAL_ENTITY.website} and to the Lasha customer
        portal, Driver App, Operations Centre and Admin Portal.
      </p>

      <h2 id="choices">2. Your choices</h2>
      <ul>
        <li>
          <strong>Strictly necessary</strong> storage is always on. The service cannot
          work without it — no sign-in, no delivery tracking.
        </li>
        <li>
          <strong>Analytics and marketing</strong> storage is off by default. Nothing
          optional loads until you opt in, and the opt-in is a separate, unticked
          choice — never bundled into creating an account.
        </li>
        <li>
          Withdrawing consent is as easy as giving it. You can change your choice at
          any time on <Link to="/privacy-rights">Your Privacy Rights</Link>.
        </li>
      </ul>

      <h2 id="necessary">3. Strictly necessary storage</h2>
      <p>
        These are set by Lasha through Convex Auth. They keep you signed in, protect
        the sign-in flow against tampering, and disappear when they are no longer
        needed.
      </p>
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Purpose</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <code>__convexAuthJWT</code>
            </td>
            <td>Your signed-in session token. Without it you would be signed out on every page.</td>
            <td>30 days, or until you sign out</td>
          </tr>
          <tr>
            <td>
              <code>__convexAuthRefreshToken</code>
            </td>
            <td>Renews the session token before it expires so you are not interrupted.</td>
            <td>30 days, or until you sign out</td>
          </tr>
          <tr>
            <td>
              <code>__convexAuthOAuthVerifier</code>
            </td>
            <td>
              Short-lived value that verifies a third-party sign-in attempt came from
              your browser. Email-and-password sign-in does not set it.
            </td>
            <td>Up to 15 minutes</td>
          </tr>
          <tr>
            <td>
              <code>__convexAuthServerStateFetchTime</code>
            </td>
            <td>Short-lived record of the server clock, used to judge token expiry accurately.</td>
            <td>Session</td>
          </tr>
        </tbody>
      </table>
      <p>
        These cookies contain session and security values, not your password. Lasha
        never stores your password in a cookie or in readable form on the server.
      </p>

      <h2 id="offline">4. Driver App offline storage</h2>
      <p>
        The Driver App keeps the active delivery — addresses, contact numbers, parcel
        and proof-of-delivery details — in your browser’s local storage and IndexedDB
        while you are on a delivery. That is what lets you complete a delivery in a
        dead spot and sync when you reconnect. The data belongs to that delivery, is
        removed when the delivery is completed and synced, and is not used to track
        you between deliveries.
      </p>

      <h2 id="optional">5. Analytics and marketing</h2>
      <p>
        <strong>We currently use none.</strong> There is no Google Analytics, no
        advertising pixel, no session recorder and no cross-site tracker on the
        platform. If we add optional measurement later, it will:
      </p>
      <ul>
        <li>load only after you opt in to the analytics consent purpose;</li>
        <li>appear in the table above with its name, provider, purpose and duration;</li>
        <li>
          offer “Accept all” and “Reject all” with equal prominence, and no
          pre-ticked boxes; and
        </li>
        <li>stop loading as soon as you withdraw consent.</li>
      </ul>

      <h2 id="manage">6. Managing cookies</h2>
      <p>
        You can clear or block cookies in your browser settings. Blocking the
        strictly necessary cookies will sign you out and prevent delivery tracking
        from working, but you can still read this notice and the public pages.
      </p>
      <p>
        Clearing site data in your browser also clears the Driver App&apos;s offline
        copy of an active delivery, so only do that once the delivery has synced.
      </p>
      <p>
        Some cookie providers process information outside South Africa; see
        “Transfers outside South Africa” in the{" "}
        <Link to="/privacy">Privacy Notice</Link>. We review this list whenever we add
        or remove a tool, and at least once a year.
      </p>

      <h2 id="contact">7. Contact</h2>
      <p>
        Questions about cookies or this notice:{" "}
        <a href={`mailto:${PRIVACY_CONTACT.email}`}>{PRIVACY_CONTACT.email}</a>. For
        anything about your personal information, start with{" "}
        <Link to="/privacy-rights">Your Privacy Rights</Link>.
      </p>
    </LegalLayout>
  );
}
