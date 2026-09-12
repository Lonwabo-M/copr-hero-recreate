import CustomerShell from "@/components/shells/CustomerShell";
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
  return (
    <CustomerShell activeItem="Help">
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
    </CustomerShell>
  );
}
