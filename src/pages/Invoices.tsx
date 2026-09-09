import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Sidebar from "@/components/dashboard/Sidebar";
import { useDashboardNav } from "@/hooks/useDashboardNav";
import { Loader2, FileText } from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/pages.css";

export default function Invoices() {
  const { handleSidebarNavigation } = useDashboardNav();
  const [activeSidebarItem, setActiveSidebarItem] = useState("Invoices");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filter, setFilter] = useState("All");

  const invoices = useQuery(api.users.getInvoices);

  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 1024) setSidebarOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onSidebarNav = (item: string) => {
    setActiveSidebarItem(item);
    handleSidebarNavigation(item);
  };

  const filtered = filter === "All"
    ? invoices
    : invoices?.filter((i: any) => i.status === filter.toLowerCase());

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      minimumFractionDigits: 2,
    }).format(amount / 100);
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
              <h1 className="page-title">Invoices</h1>
              <p className="page-subtitle">Manage and track your invoices</p>
            </div>
            <div className="filter-tabs">
              {["All", "Paid", "Pending", "Cancelled"].map((f) => (
                <button key={f} className={`filter-tab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>{f}</button>
              ))}
            </div>

            {invoices === undefined ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
                <Loader2 size={24} className="animate-spin" style={{ color: "#999" }} />
              </div>
            ) : !filtered || filtered.length === 0 ? (
              <div className="empty-state" style={{ padding: 60 }}>
                <div className="empty-state-icon"><FileText size={24} /></div>
                <div className="empty-state-title">No invoices</div>
                <div className="empty-state-desc">Your invoices will appear here.</div>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv: any) => (
                    <tr key={inv._id}>
                      <td style={{ fontWeight: 600 }}>{inv.invoiceNumber}</td>
                      <td>{formatDate(inv.createdAt)}</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(inv.amount)}</td>
                      <td>
                        <span className={`status-badge ${inv.status}`}>
                          {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
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
