import { Link } from "react-router";
import { ArrowUpRight, FileText, ShieldCheck } from "lucide-react";
import CustomerShell from "@/components/shells/CustomerShell";
import {
  PRIVACY_CONTACT,
  PRIVACY_NOTICE_EFFECTIVE_DATE,
  PRIVACY_POLICY_VERSION,
} from "@/lib/legal";
import "@/styles/dashboard.css";
import "@/styles/pages.css";

/**
 * Legal hub (customer portal).
 *
 * The documents themselves are public pages at /privacy, /paia, /cookies,
 * /terms and /privacy-rights — a notice behind a login is not a notice. This
 * page is the in-app entry point that keeps the existing "Legal" navigation
 * working and points people at the right document.
 */

const DOCUMENTS = [
  {
    path: "/privacy",
    title: "Privacy Notice",
    description:
      "What we collect, why, who we share it with, how long we keep it and the rights you have under POPIA.",
  },
  {
    path: "/privacy-rights",
    title: "Your Privacy Rights",
    description:
      "Ask for a copy of your information, correct or delete it, object to processing, or stop marketing.",
  },
  {
    path: "/paia",
    title: "PAIA Manual",
    description:
      "How to request access to records we hold, the records available without a request, fees and grounds for refusal.",
  },
  {
    path: "/terms",
    title: "Terms of Service",
    description:
      "The contract for using Lasha: bookings, pricing, delivery, claims, refunds and liability.",
  },
  {
    path: "/acceptable-use",
    title: "Acceptable Use Policy",
    description:
      "What may not be sent through Lasha, how accounts and vehicles may be used, and how breaches are enforced.",
  },
  {
    path: "/cookies",
    title: "Cookie Notice",
    description:
      "The strictly necessary cookies that keep you signed in, and the optional measurement we do not use.",
  },
];

export default function Legal() {
  return (
    <CustomerShell activeItem="Legal">
      <div className="dash-workspace" style={{ overflow: "auto" }}>
        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">Legal &amp; privacy</h1>
            <p className="page-subtitle">
              Notice version {PRIVACY_POLICY_VERSION} · effective {PRIVACY_NOTICE_EFFECTIVE_DATE}
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
              padding: "16px 18px",
              borderRadius: 12,
              border: "1px solid #e6e3d8",
              background: "#f8f6ef",
              marginBottom: 22,
            }}
          >
            <ShieldCheck size={18} style={{ flexShrink: 0, marginTop: 2, color: "#0A7C42" }} />
            <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
              Lasha processes personal information under the Protection of Personal
              Information Act 4 of 2013. Our Information Officer answers questions and
              handles requests at{" "}
              <a href={`mailto:${PRIVACY_CONTACT.email}`} style={{ color: "var(--lasha-cyan)", fontWeight: 600 }}>
                {PRIVACY_CONTACT.email}
              </a>{" "}
              — within 30 days, at no charge.
            </p>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {DOCUMENTS.map((doc) => (
              <Link
                key={doc.path}
                to={doc.path}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "16px 18px",
                  borderRadius: 12,
                  border: "1px solid #e6e3d8",
                  background: "#ffffff",
                  textDecoration: "none",
                  color: "inherit",
                }}
              >
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 10,
                    background: "rgba(7,148,181,0.1)",
                    color: "var(--lasha-cyan)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                  }}
                >
                  <FileText size={18} />
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14.5 }}>{doc.title}</p>
                  <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "#777", lineHeight: 1.5 }}>
                    {doc.description}
                  </p>
                </div>
                <ArrowUpRight size={16} style={{ color: "#9A9A9A", flexShrink: 0 }} />
              </Link>
            ))}
          </div>

          <p style={{ fontSize: 12, color: "#8a8a8a", marginTop: 20, lineHeight: 1.6 }}>
            PDF copies of these documents are not provided: the published web pages are
            the authoritative version, so a downloaded copy can never fall out of date.
          </p>
        </div>
      </div>
    </CustomerShell>
  );
}
