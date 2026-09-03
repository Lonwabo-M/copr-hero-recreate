import { useState, useEffect } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import { useDashboardNav } from "@/hooks/useDashboardNav";
import { CreditCard, Wallet, Building2, Smartphone } from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/pages.css";

export default function MakePayment() {
  const { handleSidebarNavigation } = useDashboardNav();
  const [activeSidebarItem, setActiveSidebarItem] = useState("Make Payment");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [method, setMethod] = useState("card");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 1024) setSidebarOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onSidebarNav = (item: string) => {
    setActiveSidebarItem(item);
    handleSidebarNavigation(item);
  };

  const methods = [
    { id: "card", label: "Credit / Debit Card", icon: CreditCard },
    { id: "eft", label: "EFT Bank Transfer", icon: Building2 },
    { id: "wallet", label: "Lasha Wallet", icon: Wallet },
    { id: "snapscan", label: "SnapScan", icon: Smartphone },
  ];

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
              <h1 className="page-title">Make a Payment</h1>
              <p className="page-subtitle">Pay for deliveries, top up your wallet, or settle invoices</p>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, maxWidth: 700 }}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#202020", display: "block", marginBottom: 10 }}>Payment Method</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {methods.map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setMethod(m.id)}
                        style={{
                          display: "flex", alignItems: "center", gap: 12, padding: "16px 18px",
                          borderRadius: 10, border: `1px solid ${method === m.id ? "#42b4d0" : "#e8e8e8"}`,
                          background: method === m.id ? "#f0fbfd" : "#fff", cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                        }}
                      >
                        <div style={{
                          width: 40, height: 40, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                          background: method === m.id ? "#42b4d0" : "#f4f4f4", color: method === m.id ? "#fff" : "#666",
                        }}>
                          <Icon size={20} />
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 500, color: method === m.id ? "#0794b5" : "#202020" }}>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#202020", display: "block", marginBottom: 8 }}>Amount (ZAR)</label>
                <div style={{ position: "relative" }}>
                  <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 16, fontWeight: 600, color: "#999" }}>R</span>
                  <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
                    style={{ width: "100%", padding: "14px 16px 14px 36px", borderRadius: 10, border: "1px solid #e8e8e8", fontSize: 16, fontWeight: 600, color: "#202020", outline: "none", boxSizing: "border-box" }} />
                </div>
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: "#202020", display: "block", marginBottom: 8 }}>Reference (optional)</label>
                <input type="text" placeholder="Invoice number or description"
                  style={{ width: "100%", padding: "14px 16px", borderRadius: 10, border: "1px solid #e8e8e8", fontSize: 14, color: "#202020", outline: "none", boxSizing: "border-box" }} />
              </div>

              <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
                <button style={{
                  width: "100%", padding: "14px 24px", borderRadius: 10, border: "none", background: "#42b4d0",
                  color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", transition: "background 0.15s",
                }}>Confirm Payment</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
