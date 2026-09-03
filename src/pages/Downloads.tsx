import { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import { useDashboardNav } from "@/hooks/useDashboardNav";
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
  const { handleSidebarNavigation } = useDashboardNav();
  const [activeSidebarItem, setActiveSidebarItem] = useState("Downloads");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 1024) setSidebarOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onSidebarNav = (item: string) => {
    setActiveSidebarItem(item);
    handleSidebarNavigation(item);
  };

  return (
    <div className="dashboard">
      <header className="dash-topnav">
        <div className="dash-topnav-logo">
          <div className="lasha-logo-icon"><span>L</span></div>
          <span className="dash-topnav-logo-text">Lasha</span>
        </div>
        <div className="dash-topnav-links">
          <button className="dash-topnav-link active">Home<span className="dash-topnav-link-underline" /></button>
          <button className="dash-topnav-link">About Us</button>
          <button className="dash-topnav-link">Services</button>
          <button className="dash-topnav-link">Contact US</button>
        </div>
        <div className="dash-topnav-right">
          <button className="dash-mobile-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
          </button>
          <button className="dash-topnav-profile">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
          </button>
        </div>
      </header>

      <div className="dash-app">
        {sidebarOpen && <div className="dash-mobile-overlay visible" onClick={() => setSidebarOpen(false)} />}
        <Sidebar activeItem={activeSidebarItem}          onItemChange={onSidebarNav} isOpen={sidebarOpen} />

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
      </div>
    </div>
  );
}
