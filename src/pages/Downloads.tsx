import CustomerShell from "@/components/shells/CustomerShell";
import { FileText, Table, File, Download } from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/pages.css";

const downloads = [
  { icon: FileText, name: "Terms of Service", meta: "PDF · 2.4 MB · Updated 15 Aug 2025" },
  { icon: FileText, name: "Privacy Policy", meta: "PDF · 1.8 MB · Updated 15 Aug 2025" },
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
