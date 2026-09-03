import { useState, useEffect } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import Sidebar from "@/components/dashboard/Sidebar";
import "@/styles/dashboard.css";
import "@/styles/pages.css";

export default function Legal() {
  const { signOut } = useAuthActions();
  const [activeSidebarItem, setActiveSidebarItem] = useState("Legal");
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
              <h1 className="page-title">Legal</h1>
              <p className="page-subtitle">Terms of service, privacy policy, and legal information</p>
            </div>
            <div className="legal-section">
              <h3>Terms of Service</h3>
              <p>Welcome to Lasha Logistics. By accessing or using our platform, you agree to be bound by these Terms of Service. Lasha provides logistics infrastructure services including parcel delivery, tracking, and fleet management solutions.</p>
              <p>All deliveries are subject to our standard terms of carriage. Lasha accepts liability for loss or damage to parcels up to the declared value, subject to our claims process. Delivery timeframes are estimates and may vary based on location, weather, and traffic conditions.</p>
              <p>Users are responsible for ensuring that parcels comply with all applicable laws and regulations. Prohibited items include hazardous materials, illegal substances, and perishable goods without appropriate packaging.</p>
            </div>
            <div className="legal-section">
              <h3>Privacy Policy</h3>
              <p>Lasha collects personal information necessary to provide our logistics services, including your name, email address, phone number, and delivery addresses. We use this information solely for order processing, delivery coordination, and account management.</p>
              <p>We do not sell your personal information to third parties. Location data collected during deliveries is used exclusively for real-time tracking and route optimization, and is retained for 90 days after delivery completion.</p>
              <p>You may request access to, correction of, or deletion of your personal information at any time by contacting our privacy team at privacy@lasha.co.za.</p>
            </div>
            <div className="legal-section">
              <h3>Cookie Policy</h3>
              <p>Lasha uses essential cookies to maintain your session and preferences. Analytics cookies help us improve our platform. You can manage cookie preferences through your browser settings.</p>
            </div>
            <div className="legal-section">
              <h3>Refund Policy</h3>
              <p>Refund requests must be submitted within 7 days of delivery completion. Approved refunds are processed within 5-10 business days to the original payment method. Wallet credits are applied immediately upon approval.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
