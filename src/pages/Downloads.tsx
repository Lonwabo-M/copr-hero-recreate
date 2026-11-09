import { Link } from "react-router";
import CustomerShell from "@/components/shells/CustomerShell";
import { CONTACT_EMAIL } from "@/lib/legal";
import { FileText, ArrowUpRight } from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/pages.css";

// Legal documents are published as web pages so the version a customer reads is
// always the current one. They used to appear here as fixed-size PDFs that did
// not exist; the authoritative copies now live at /privacy, /terms, /paia and
// /cookies.
const legalDocuments = [
  { path: "/privacy", name: "Privacy Notice", meta: "POPIA notice · always current" },
  { path: "/terms", name: "Terms of Service", meta: "Service contract · always current" },
  {
    path: "/acceptable-use",
    name: "Acceptable Use Policy",
    meta: "Prohibited goods and conduct · always current",
  },
  { path: "/paia", name: "PAIA Manual", meta: "Access to records · always current" },
  { path: "/cookies", name: "Cookie Notice", meta: "Cookies and storage · always current" },
];

export default function Downloads() {
  return (
    <CustomerShell activeItem="Downloads">
      <div className="dash-workspace" style={{ overflow: "auto" }}>
        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">Downloads</h1>
            <p className="page-subtitle">Read the current legal and privacy documents</p>
          </div>

          <p
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#8a8a8a",
              margin: "4px 0 10px",
            }}
          >
            Legal &amp; privacy
          </p>
          <div className="download-list" style={{ marginBottom: 24 }}>
            {legalDocuments.map((doc) => (
              <div key={doc.path} className="download-item">
                <div className="download-info">
                  <div className="download-icon">
                    <FileText size={22} />
                  </div>
                  <div>
                    <div className="download-name">{doc.name}</div>
                    <div className="download-meta">{doc.meta}</div>
                  </div>
                </div>
                <Link to={doc.path} className="download-btn" style={{ textDecoration: "none" }}>
                  <ArrowUpRight size={14} style={{ marginRight: 6 }} />
                  Open
                </Link>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 24, padding: 20, background: "#f8f8f8", borderRadius: 10, border: "1px solid #e8e8e8" }}>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: "#202020", marginBottom: 5 }}>
              Need an insurance certificate, rate card or invoice template?
            </div>
            <div style={{ fontSize: 13.5, color: "#666", lineHeight: 1.6 }}>
              Email{" "}
              <a href={`mailto:${CONTACT_EMAIL}?subject=Document%20request`} style={{ color: "#087f9c", fontWeight: 600 }}>
                {CONTACT_EMAIL}
              </a>{" "}
              and we will send you the current version for your account.
            </div>
          </div>
        </div>
      </div>
    </CustomerShell>
  );
}
