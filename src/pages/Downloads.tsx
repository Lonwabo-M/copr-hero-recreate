import { Link } from "react-router";
import CustomerShell from "@/components/shells/CustomerShell";
import { FileText, Table, File, Download, ArrowUpRight } from "lucide-react";
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

const downloads = [
  { icon: FileText, name: "Insurance Coverage Guide", meta: "PDF · 3.1 MB · Updated 01 Aug 2025" },
  { icon: Table, name: "Rate Card — Standard Delivery", meta: "PDF · 890 KB · Updated 01 Jul 2025" },
  { icon: Table, name: "Rate Card — Express Delivery", meta: "PDF · 920 KB · Updated 01 Jul 2025" },
  { icon: File, name: "API Documentation", meta: "PDF · 5.2 MB · Updated 20 Aug 2025" },
  { icon: FileText, name: "Business Registration Form", meta: "PDF · 420 KB · Updated 01 Jun 2025" },
  { icon: Table, name: "Tax Invoice Template", meta: "XLSX · 180 KB · Updated 01 Jun 2025" },
];

export default function Downloads() {
  return (
    <CustomerShell activeItem="Downloads">
      <div className="dash-workspace" style={{ overflow: "auto" }}>
        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">Downloads</h1>
            <p className="page-subtitle">Access documents, guides, and resources</p>
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
            Operational documents
          </p>
          <div className="download-list">
            {downloads.map((d) => {
              const Icon = d.icon;
              return (
                <div key={d.name} className="download-item">
                  <div className="download-info">
                    <div className="download-icon"><Icon size={22} /></div>
                    <div>
                      <div className="download-name">{d.name}</div>
                      <div className="download-meta">{d.meta}</div>
                    </div>
                  </div>
                  <button className="download-btn"><Download size={14} style={{ marginRight: 6 }} />Download</button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </CustomerShell>
  );
}
