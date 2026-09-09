import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Sidebar from "@/components/dashboard/Sidebar";
import { useDashboardNav } from "@/hooks/useDashboardNav";
import { Loader2, Package } from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/pages.css";

export default function PastDeliveries() {
  const { handleSidebarNavigation } = useDashboardNav();
  const [activeSidebarItem, setActiveSidebarItem] = useState("Past Deliveries");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const pastDeliveries = useQuery(api.users.getPastDeliveries);

  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 1024) setSidebarOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onSidebarNav = (item: string) => {
    setActiveSidebarItem(item);
    handleSidebarNavigation(item);
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleDateString("en-ZA", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
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
        <Sidebar activeItem={activeSidebarItem} onItemChange={onSidebarNav} isOpen={sidebarOpen} />

        <div className="dash-workspace" style={{ overflow: "auto" }}>
          <div className="page-container">
            <div className="page-header">
              <h1 className="page-title">Past Deliveries</h1>
              <p className="page-subtitle">View your delivery history and details</p>
            </div>

            {pastDeliveries === undefined ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
                <Loader2 size={24} className="animate-spin" style={{ color: "#999" }} />
              </div>
            ) : pastDeliveries.length === 0 ? (
              <div className="empty-state" style={{ padding: 60 }}>
                <div className="empty-state-icon"><Package size={24} /></div>
                <div className="empty-state-title">No past deliveries</div>
                <div className="empty-state-desc">Your completed and cancelled deliveries will appear here.</div>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tracking #</th>
                    <th>Date</th>
                    <th>Driver</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pastDeliveries.map((d: any) => (
                    <tr key={d._id}>
                      <td style={{ fontWeight: 600 }}>{d.trackingNumber}</td>
                      <td>{formatDate(d.completedAt)}</td>
                      <td>{d.driverName}</td>
                      <td>
                        <span className={`status-badge ${d.status}`}>
                          {d.status.charAt(0).toUpperCase() + d.status.slice(1).replace(/_/g, " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
