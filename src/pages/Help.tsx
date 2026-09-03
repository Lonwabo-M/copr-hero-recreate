import { useState, useEffect } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import Sidebar from "@/components/dashboard/Sidebar";
import { Package, MapPin, CreditCard, Clock, Shield, Users } from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/pages.css";

const helpTopics = [
  { icon: Package, title: "Getting Started", desc: "Learn how to create your first delivery request and set up your account." },
  { icon: MapPin, title: "Tracking Deliveries", desc: "How to track your shipments in real time and share tracking links." },
  { icon: CreditCard, title: "Payments & Billing", desc: "Understand payment methods, invoices, and wallet top-ups." },
  { icon: Clock, title: "Delivery Times", desc: "Standard and express delivery timeframes for different areas." },
  { icon: Shield, title: "Safety & Insurance", desc: "Package insurance options and safety protocols for your deliveries." },
  { icon: Users, title: "Business Accounts", desc: "Managing team access, bulk orders, and business invoicing." },
];

export default function Help() {
  const { signOut } = useAuthActions();
  const [activeSidebarItem, setActiveSidebarItem] = useState("Help");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 1024) setSidebarOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleSidebarNavigation = (item: string) => {
    setActiveSidebarItem(item);
    const routes: Record<string, string> = {
      "Activity Center": "/dashboard",
      "Past Deliveries": "/past-deliveries",
      "Request Delivery": "/request-delivery",
      "Track Delivery": "/track-delivery",
      "Invoices": "/invoices",
      "Wallet": "/wallet",
      "Make Payment": "/make-payment",
      "Notifications": "/notifications",
      "Help": "/help",
      "Legal": "/legal",
      "Downloads": "/downloads",
      "Settings": "/settings",
    };
    if (item === "Log out") {
      sessionStorage.removeItem("lasha_guest");
      signOut();
      return;
    }
    const route = routes[item];
    if (route) window.location.href = route;
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
        <Sidebar activeItem={activeSidebarItem} onItemChange={handleSidebarNavigation} isOpen={sidebarOpen} />

        <div className="dash-workspace" style={{ overflow: "auto" }}>
          <div className="page-container">
            <div className="page-header">
              <h1 className="page-title">Help Center</h1>
              <p className="page-subtitle">Find answers to common questions and get support</p>
            </div>
            <div style={{ marginBottom: 28 }}>
              <input type="text" placeholder="Search for help topics..."
                style={{ width: "100%", maxWidth: 480, padding: "14px 18px", borderRadius: 10, border: "1px solid #999", fontSize: 14, color: "#202020", outline: "none" }} />
            </div>
            <div className="help-grid">
              {helpTopics.map((topic) => {
                const Icon = topic.icon;
                return (
                  <div key={topic.title} className="help-card">
                    <div className="help-card-icon"><Icon size={22} /></div>
                    <div className="help-card-title">{topic.title}</div>
                    <div className="help-card-desc">{topic.desc}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 36, padding: 24, background: "#f8f8f8", borderRadius: 10, border: "1px solid #e8e8e8" }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#202020", marginBottom: 6 }}>Still need help?</div>
              <div style={{ fontSize: 14, color: "#666", marginBottom: 14 }}>Contact our support team and we'll get back to you within 24 hours.</div>
              <button style={{ padding: "10px 24px", borderRadius: 10, border: "1px solid #42b4d0", background: "#fff", color: "#42b4d0", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Contact Support</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
