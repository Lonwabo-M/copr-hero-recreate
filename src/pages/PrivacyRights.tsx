import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { CheckCircle2, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import LegalLayout, { type LegalSection } from "@/pages/legal/LegalLayout";
import {
  DSAR_RESPONSE_DAYS,
  PRIVACY_REQUEST_LABELS,
  PRIVACY_REQUEST_TYPES,
  type PrivacyRequestType,
} from "@/convex/privacy/policy";
import {
  PRIVACY_CONTACT,
  PRIVACY_NOTICE_EFFECTIVE_DATE,
  PRIVACY_POLICY_VERSION,
} from "@/lib/legal";

/**
 * POPIA privacy centre.
 *
 * Two jobs, in one public page:
 *  1. Anyone — signed in or not — can lodge a data subject request (s23 access,
 *     s24 correction/deletion, s11(3) objection, s69 opt-out, complaint). The
 *     form is the intake the DSAR runbook refers to; it returns a reference and
 *     the 30-day due date.
 *  2. A signed-in person can see and change their consent decisions, and see
 *     the requests they have lodged.
 *
 * Nothing here is an authorization boundary: the backend scopes reads to the
 * caller and stamps consent wording itself.
 */

const SECTIONS: LegalSection[] = [
  { id: "what-you-can-ask", label: "What you can ask for" },
  { id: "request", label: "Lodge a request" },
  { id: "consent", label: "Your consent choices" },
  { id: "my-requests", label: "Your requests" },
  { id: "what-happens-next", label: "What happens next" },
];

const STATUS_LABEL: Record<string, string> = {
  received: "Received",
  in_progress: "In progress",
  completed: "Completed",
  refused: "Refused",
};

function formatDate(value: number | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 13px",
  fontSize: 14,
  fontFamily: "Inter, sans-serif",
  color: "var(--lasha-navy)",
  backgroundColor: "#ffffff",
  border: "1px solid var(--lasha-border-light)",
  borderRadius: 10,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "var(--lasha-muted)",
  marginBottom: 6,
};

export default function PrivacyRights() {
  const submitRequest = useMutation(api.privacy.mutations.submitPrivacyRequest);
  const recordConsent = useMutation(api.privacy.mutations.recordConsent);
  const withdrawConsent = useMutation(api.privacy.mutations.withdrawConsent);

  // getMyConsents returns null when signed out, so one read answers both
  // "who is this" and "what did they choose" without a separate auth hook.
  const consents = useQuery(api.privacy.queries.getMyConsents, {});
  const myRequests = useQuery(api.privacy.queries.getMyPrivacyRequests, {});
  const signedOut = consents === null;

  const [form, setForm] = useState({
    type: "access" as PrivacyRequestType,
    name: "",
    email: "",
    phone: "",
    details: "",
  });
  // Honeypot: visually hidden, never announced. Bots fill it; we drop the row.
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<{ reference: string; dueAt: number } | null>(null);
  const [busyPurpose, setBusyPurpose] = useState<string | null>(null);
  const [consentError, setConsentError] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await submitRequest({
        type: form.type,
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        details: form.details,
        companyWebsite: honeypot,
      });
      if (result.spam) {
        setReceipt({ reference: "", dueAt: 0 });
      } else {
        setReceipt({ reference: result.reference, dueAt: result.dueAt });
        setForm({ type: "access", name: "", email: "", phone: "", details: "" });
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Could not send the request. Email ${PRIVACY_CONTACT.email} instead.`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const changeConsent = async (purpose: "marketing" | "analytics", granted: boolean) => {
    setConsentError("");
    setBusyPurpose(purpose);
    try {
      if (granted) {
        await recordConsent({
          purpose,
          granted: true,
          source: "privacy-centre",
          policyVersion: consents?.policyVersion ?? PRIVACY_POLICY_VERSION,
        });
      } else {
        await withdrawConsent({ purpose, source: "privacy-centre" });
      }
    } catch (err) {
      setConsentError(
        err instanceof Error ? err.message : "Could not save your choice. Please try again.",
      );
    } finally {
      setBusyPurpose(null);
    }
  };

  const marketing = consents?.consents.find((entry) => entry.purpose === "marketing");
  const analytics = consents?.consents.find((entry) => entry.purpose === "analytics");

  return (
    <LegalLayout
      title="Your Privacy Rights"
      subtitle="Ask what we hold, correct it, delete it, object to processing, or stop marketing. No account is needed to make a request."
      effectiveDate={PRIVACY_NOTICE_EFFECTIVE_DATE}
      version={PRIVACY_POLICY_VERSION}
      sections={SECTIONS}
      highlight={
        <>
          <Lock size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          We answer within <strong>{DSAR_RESPONSE_DAYS} days</strong> of a complete
          request. Prefer email? Write to{" "}
          <a href={`mailto:${PRIVACY_CONTACT.email}`}>{PRIVACY_CONTACT.email}</a>.
          Read the <a href="/privacy">Privacy Notice</a> first if you are unsure what
          we hold.
        </>
      }
    >
      <h2 id="what-you-can-ask">1. What you can ask for</h2>
      <table>
        <thead>
          <tr>
            <th>Right</th>
            <th>What it means</th>
            <th>POPIA</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Access</td>
            <td>Confirm whether we hold your personal information and get a copy of it.</td>
            <td>s23</td>
          </tr>
          <tr>
            <td>Correction</td>
            <td>Fix information that is inaccurate, incomplete, misleading or out of date.</td>
            <td>s24</td>
          </tr>
          <tr>
            <td>Deletion</td>
            <td>
              Delete information that is irrelevant, excessive or unlawfully held, or
              close your account. Records the law requires us to keep are explained in
              our reply.
            </td>
            <td>s24</td>
          </tr>
          <tr>
            <td>Objection</td>
            <td>Object to processing based on our legitimate interests.</td>
            <td>s11(3)</td>
          </tr>
          <tr>
            <td>Marketing opt-out</td>
            <td>Stop marketing email immediately. Your deliveries are unaffected.</td>
            <td>s69</td>
          </tr>
          <tr>
            <td>Complaint</td>
            <td>Tell us we got it wrong. If we do not fix it, complain to the Regulator.</td>
            <td>s5, s74</td>
          </tr>
        </tbody>
      </table>

      <h2 id="request">2. Lodge a request</h2>
      {receipt ? (
        <div
          style={{
            border: "1px solid rgba(10, 124, 66, 0.35)",
            background: "rgba(10, 124, 66, 0.06)",
            borderRadius: 12,
            padding: "18px 20px",
            marginBottom: 22,
          }}
        >
          <p style={{ fontWeight: 700, marginBottom: 6, display: "flex", gap: 8, alignItems: "center" }}>
            <CheckCircle2 size={16} color="#0A7C42" /> Request received
          </p>
          {receipt.reference ? (
            <>
              <p style={{ marginBottom: 4 }}>
                Your reference is <strong>{receipt.reference}</strong>. Quote it in any
                follow-up.
              </p>
              <p style={{ marginBottom: 8 }}>
                We will respond by <strong>{formatDate(receipt.dueAt)}</strong>, and we
                will acknowledge within 2 business days.
              </p>
              <button
                type="button"
                onClick={() => setReceipt(null)}
                style={{
                  background: "none",
                  border: "none",
                  padding: 0,
                  color: "var(--lasha-cyan)",
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "Inter, sans-serif",
                }}
              >
                Lodge another request
              </button>
            </>
          ) : (
            <p>Thank you — we have recorded your request.</p>
          )}
        </div>
      ) : (
        <form onSubmit={handleSubmit} style={{ marginBottom: 8 }}>
          <label style={labelStyle} htmlFor="privacy-request-type">
            What do you want to do?
          </label>
          <select
            id="privacy-request-type"
            value={form.type}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                type: event.target.value as PrivacyRequestType,
              }))
            }
            style={{ ...fieldStyle, marginBottom: 16 }}
          >
            {PRIVACY_REQUEST_TYPES.map((type) => (
              <option key={type} value={type}>
                {PRIVACY_REQUEST_LABELS[type]}
              </option>
            ))}
          </select>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={labelStyle} htmlFor="privacy-name">
                Your name
              </label>
              <input
                id="privacy-name"
                value={form.name}
                onChange={(event) => setForm((c) => ({ ...c, name: event.target.value }))}
                required
                maxLength={120}
                autoComplete="name"
                style={fieldStyle}
              />
            </div>
            <div>
              <label style={labelStyle} htmlFor="privacy-email">
                Email
              </label>
              <input
                id="privacy-email"
                type="email"
                value={form.email}
                onChange={(event) => setForm((c) => ({ ...c, email: event.target.value }))}
                required
                maxLength={200}
                autoComplete="email"
                placeholder="you@example.co.za"
                style={fieldStyle}
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={labelStyle} htmlFor="privacy-phone">
              Phone (optional)
            </label>
            <input
              id="privacy-phone"
              value={form.phone}
              onChange={(event) => setForm((c) => ({ ...c, phone: event.target.value }))}
              maxLength={40}
              autoComplete="tel"
              style={fieldStyle}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <label style={labelStyle} htmlFor="privacy-details">
              Tell us what you need
            </label>
            <textarea
              id="privacy-details"
              value={form.details}
              onChange={(event) => setForm((c) => ({ ...c, details: event.target.value }))}
              required
              minLength={10}
              maxLength={4000}
              rows={5}
              placeholder="For access or deletion, tell us the email address on the account, or a tracking number, so we can find the right records."
              style={{ ...fieldStyle, resize: "vertical" }}
            />
          </div>

          {/* Honeypot — hidden from people, filled by bots. */}
          <div aria-hidden="true" style={{ position: "absolute", left: -9999, top: "auto" }}>
            <label htmlFor="privacy-website">Company website</label>
            <input
              id="privacy-website"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(event) => setHoneypot(event.target.value)}
            />
          </div>

          {error ? (
            <p
              role="alert"
              style={{
                marginTop: 14,
                padding: "10px 12px",
                borderRadius: 8,
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                fontSize: 13,
              }}
            >
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            style={{
              marginTop: 18,
              padding: "12px 22px",
              borderRadius: 10,
              border: "none",
              background: "var(--lasha-navy)",
              color: "var(--lasha-ivory)",
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "Inter, sans-serif",
              cursor: submitting ? "wait" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
            {submitting ? "Sending…" : "Send request"}
          </button>
          <p style={{ fontSize: 12, color: "var(--lasha-muted)", marginTop: 10 }}>
            We use these details only to answer this request. See the{" "}
            <a href="/privacy">Privacy Notice</a> for how long we keep them.
          </p>
        </form>
      )}

      <h2 id="consent">3. Your consent choices</h2>
      {signedOut ? (
        <p>
          <a href="/auth">Sign in</a> to see and change your consent choices. The
          service itself does not depend on optional consent: we will not send
          marketing or load analytics unless you opt in.
        </p>
      ) : !consents ? (
        <p style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Loader2 size={14} className="animate-spin" /> Loading your choices…
        </p>
      ) : (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "center",
              padding: "14px 0",
              borderBottom: "1px solid var(--lasha-border-light)",
            }}
          >
            <div>
              <p style={{ margin: 0, fontWeight: 600 }}>Account and deliveries</p>
              <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--lasha-muted)" }}>
                Required to run your account and deliver parcels. Based on our contract
                with you, not on consent.
              </p>
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--lasha-lime-ink)" }}>
              Required
            </span>
          </div>

          {[
            {
              purpose: "marketing" as const,
              title: "Marketing email",
              description:
                "Product news and offers by email. Unticked unless you choose it; withdrawing stops future messages immediately.",
              granted: marketing?.granted ?? false,
            },
            {
              purpose: "analytics" as const,
              title: "Optional analytics",
              description:
                "Usage measurement to improve the platform. Nothing is collected today; this gates anything added later.",
              granted: analytics?.granted ?? false,
            },
          ].map((option) => (
            <div
              key={option.purpose}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                alignItems: "center",
                padding: "14px 0",
                borderBottom: "1px solid var(--lasha-border-light)",
              }}
            >
              <div>
                <p style={{ margin: 0, fontWeight: 600 }}>{option.title}</p>
                <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "var(--lasha-muted)" }}>
                  {option.description}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={option.granted}
                aria-label={option.title}
                disabled={busyPurpose !== null}
                onClick={() => void changeConsent(option.purpose, !option.granted)}
                style={{
                  flexShrink: 0,
                  width: 46,
                  height: 26,
                  borderRadius: 999,
                  border: "1px solid var(--lasha-border-light)",
                  background: option.granted ? "var(--lasha-navy)" : "#e7e5dc",
                  cursor: busyPurpose !== null ? "wait" : "pointer",
                  position: "relative",
                  transition: "background 0.15s",
                }}
              >
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    left: option.granted ? 23 : 3,
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    background: "#ffffff",
                    transition: "left 0.15s",
                  }}
                />
              </button>
            </div>
          ))}
          {consentError ? (
            <p role="alert" style={{ color: "#b91c1c", fontSize: 13, marginTop: 12 }}>
              {consentError}
            </p>
          ) : null}
          <p style={{ fontSize: 12, color: "var(--lasha-muted)", marginTop: 12 }}>
            Notice version {consents.policyVersion}. Every decision is recorded with the
            wording you saw, so we can show what you agreed to.
          </p>
        </div>
      )}

      <h2 id="my-requests">4. Your requests</h2>
      {signedOut ? (
        <p>
          <a href="/auth">Sign in</a> to see requests you lodged while signed in. A
          request sent from this form without an account is answered by email at the
          address you gave.
        </p>
      ) : myRequests === undefined ? (
        <p style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Loader2 size={14} className="animate-spin" /> Loading your requests…
        </p>
      ) : myRequests.length === 0 ? (
        <p>No requests yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Type</th>
              <th>Status</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {myRequests.map((request) => (
              <tr key={request._id}>
                <td>
                  <code>{request.reference}</code>
                </td>
                <td>{PRIVACY_REQUEST_LABELS[request.type]}</td>
                <td>{STATUS_LABEL[request.status] ?? request.status}</td>
                <td>{formatDate(request.dueAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 id="what-happens-next">5. What happens next</h2>
      <ol>
        <li>
          <strong>We acknowledge.</strong> Within 2 business days you get a reply with
          your reference and, if we need it, a request for proof of identity.
        </li>
        <li>
          <strong>We verify.</strong> We confirm you are the person the information
          belongs to before releasing or changing it. We ask for the minimum needed and
          delete the proof afterwards.
        </li>
        <li>
          <strong>We answer within {DSAR_RESPONSE_DAYS} days.</strong> If a request is
          complex we tell you why and agree a new date before the deadline.
        </li>
        <li>
          <strong>If you disagree,</strong> ask us to reconsider. You may also complain
          to the Information Regulator — see the{" "}
          <a href="/privacy#complaints">Privacy Notice</a>.
        </li>
      </ol>
      <p style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13 }}>
        <ShieldCheck size={15} style={{ flexShrink: 0, marginTop: 2 }} />
        Our Information Officer owns this process. Internal procedures: DSAR runbook
        (30-day clock, verification, deletion holds) and the breach-response plan.
      </p>
    </LegalLayout>
  );
}
