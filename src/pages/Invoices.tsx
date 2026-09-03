import { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import { useDashboardNav } from "@/hooks/useDashboardNav";
import "@/styles/dashboard.css";
import "@/styles/pages.css";

const invoices = [
  { id: "INV-2024-001", date: "30 Aug 2025", client: "TechCorp SA", amount: "R4,250.00", status: "paid" },
  { id: "INV-2024-002", date: "28 Aug 2025", client: "FreshMart Logistics", amount: "R1,890.00", status: "pending" },
  { id: "INV-2024-003", date: "25 Aug 2025", client: "UrbanDelivery Co", amount: "R3,120.00", status: "paid" },
  { id: "INV-2024-004", date: "22 Aug 2025", client: "MediExpress", amount: "R2,680.00", status: "pending" },
  { id: "INV-2024-005", date: "20 Aug 2025", client: "QuickShip PTY", amount: "R5,400.00", status: "paid" },
  { id: "INV-2024-006", date: "18 Aug 2025", client: "GreenRoute", amount: "R950.00", status: "cancelled" },
];

export default function Invoices() {
  const { handleSidebarNavigation } = useDashboardNav();
  const [activeSidebarItem, setActiveSidebarItem] = useState("Invoices");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [filter, setFilter] = useState("All");

  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 1024) setSidebarOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onSidebarNav = (item: string) => {
    setActiveSidebarItem(item);
    handleSidebarNavigation(item);
  };

  const filtered = filter === "All" ? invoices : invoices.filter((i) => i.status === filter.toLowerCase());

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
              <h1 className="page-title">Invoices</h1>
              <p className="page-subtitle">Manage and track your invoices</p>
            </div>
            <div className="filter-tabs">
              {["All", "Paid", "Pending", "Cancelled"].map((f) => (
                <button key={f} className={`filter-tab ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>{f}</button>
              ))}
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice ID</th>
                  <th>Date</th>
                  <th>Client</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 600 }}>{inv.id}</td>
                    <td>{inv.date}</td>
                    <td>{inv.client}</td>
                    <td style={{ fontWeight: 600 }}>{inv.amount}</td>
                    <td><span className={`status-badge ${inv.status}`}>{inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}</span></td>
                    <td><button className="download-btn">Download</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
