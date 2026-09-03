import { useState, useEffect } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import Sidebar from "@/components/dashboard/Sidebar";
import { Package, CreditCard, AlertTriangle } from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/pages.css";

const notifications = [
  { id: 1, type: "delivery" as const, title: "Delivery Completed", desc: "Order #55667 has been successfully delivered to Fourways Mall.", time: "2 min ago", unread: true },
  { id: 2, type: "payment" as const, title: "Payment Received", desc: "R1,450.00 has been credited to your Lasha Wallet from INV-2024-003.", time: "1 hour ago", unread: true },
  { id: 3, type: "delivery" as const, title: "Driver Assigned", desc: "Lusanda Miya has been assigned to order #55668 for pickup at Sammy's Kitchen.", time: "3 hours ago", unread: false },
  { id: 4, type: "alert" as const, title: "Delivery Delayed", desc: "Order #55660 is experiencing a 30-minute delay due to traffic on the N1.", time: "5 hours ago", unread: false },
  { id: 5, type: "payment" as const, title: "Invoice Generated", desc: "INV-2024-007 for R2,340.00 has been generated and is awaiting payment.", time: "Yesterday", unread: false },
  { id: 6, type: "delivery" as const, title: "Pickup Scheduled", desc: "Your pickup at Sandton City has been scheduled for tomorrow at 09:00 AM.", time: "Yesterday", unread: false },
];

const iconMap = { delivery: Package, payment: CreditCard, alert: AlertTriangle };

export default function Notifications() {
  const { signOut } = useAuthActions();
  const [activeSidebarItem, setActiveSidebarItem] = useState("Notifications");
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
              <h1 className="page-title">Notifications</h1>
              <p className="page-subtitle">Stay updated on your deliveries and account activity</p>
            </div>
            <div className="notification-list">
              {notifications.map((n) => {
                const Icon = iconMap[n.type];
                return (
                  <div key={n.id} className={`notification-item ${n.unread ? "unread" : ""}`}>
                    <div className={`notification-icon ${n.type}`}><Icon size={20} /></div>
                    <div className="notification-content">
                      <div className="notification-title">{n.title}</div>
                      <div className="notification-desc">{n.desc}</div>
                    </div>
                    <div className="notification-time">{n.time}</div>
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
