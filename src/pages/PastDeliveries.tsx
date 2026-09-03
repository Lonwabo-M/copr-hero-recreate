import { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import { useDashboardNav } from "@/hooks/useDashboardNav";
import "@/styles/dashboard.css";
import "@/styles/pages.css";

const pastDeliveries = [
  { id: "ORD-54321", date: "28 Aug 2025", from: "Sandton City", to: "Rosebank Mall", status: "completed", driver: "Sipho M.", amount: "R145.00" },
  { id: "ORD-54298", date: "26 Aug 2025", from: "Melrose Arch", to: "Menlyn Park", status: "completed", driver: "Thabo K.", amount: "R210.00" },
  { id: "ORD-54265", date: "24 Aug 2025", from: "V&A Waterfront", to: "Canal Walk", status: "completed", driver: "Lusanda M.", amount: "R89.00" },
  { id: "ORD-54230", date: "22 Aug 2025", from: "Gateway Mall", to: "uMhlanga Ridge", status: "cancelled", driver: "N/A", amount: "R0.00" },
  { id: "ORD-54198", date: "20 Aug 2025", from: "Eastgate Mall", to: "Bedford Centre", status: "completed", driver: "Pieter V.", amount: "R67.50" },
  { id: "ORD-54155", date: "18 Aug 2025", from: "Brooklyn Mall", to: "Hatfield Plaza", status: "completed", driver: "Sipho M.", amount: "R52.00" },
];

export default function PastDeliveries() {
  const { handleSidebarNavigation } = useDashboardNav();
  const [activeSidebarItem, setActiveSidebarItem] = useState("Past Deliveries");
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
              <h1 className="page-title">Past Deliveries</h1>
              <p className="page-subtitle">View your delivery history and details</p>
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Date</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Driver</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pastDeliveries.map((d) => (
                  <tr key={d.id}>
                    <td style={{ fontWeight: 600 }}>{d.id}</td>
                    <td>{d.date}</td>
                    <td>{d.from}</td>
                    <td>{d.to}</td>
                    <td>{d.driver}</td>
                    <td>{d.amount}</td>
                    <td><span className={`status-badge ${d.status}`}>{d.status.charAt(0).toUpperCase() + d.status.slice(1)}</span></td>
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
