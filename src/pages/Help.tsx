import { useState } from "react";
import { Link } from "react-router";
import CustomerShell from "@/components/shells/CustomerShell";
import { CONTACT_EMAIL } from "@/lib/legal";
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
  const [query, setQuery] = useState("");
  const search = query.trim().toLowerCase();
  const filteredTopics = helpTopics.filter(
    (topic) =>
      !search ||
      topic.title.toLowerCase().includes(search) ||
      topic.desc.toLowerCase().includes(search),
  );

  return (
    <CustomerShell activeItem="Help">
      <div className="dash-workspace" style={{ overflow: "auto" }}>
        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">Help Center</h1>
            <p className="page-subtitle">Find answers to common questions and get support</p>
          </div>
          <div style={{ marginBottom: 28 }}>
            <label htmlFor="help-search" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#4a4a4a", marginBottom: 8 }}>
              Search help topics
            </label>
            <input
              id="help-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Try “tracking”, “payment” or “insurance”"
              style={{ width: "100%", maxWidth: 480, padding: "12px 16px", borderRadius: 10, border: "1px solid #d6d6d6", fontSize: 14, color: "#202020", outline: "none" }}
            />
            <p aria-live="polite" style={{ fontSize: 12.5, color: "#777", marginTop: 8 }}>
              {search
                ? `${filteredTopics.length} ${filteredTopics.length === 1 ? "topic" : "topics"} matching “${query.trim()}”`
                : "Browse the topics below or email our support team."}
            </p>
          </div>
          {filteredTopics.length > 0 ? (
            <div className="help-grid">
              {filteredTopics.map((topic) => {
                const Icon = topic.icon;
                return (
                  <article key={topic.title} className="help-card">
                    <div className="help-card-icon"><Icon size={22} /></div>
                    <h2 className="help-card-title">{topic.title}</h2>
                    <p className="help-card-desc">{topic.desc}</p>
                  </article>
                );
              })}
            </div>
          ) : (
            <div style={{ padding: 24, border: "1px solid #e8e8e8", borderRadius: 10, background: "#fff" }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "#202020", marginBottom: 4 }}>
                No help topics match that search.
              </p>
              <p style={{ fontSize: 13.5, color: "#666" }}>
                Try a shorter phrase, or email{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#087f9c", fontWeight: 600 }}>
                  {CONTACT_EMAIL}
                </a>.
              </p>
            </div>
          )}
          <div
            style={{
              marginTop: 28,
              padding: 24,
              background: "#f8f6ef",
              borderRadius: 12,
              border: "1px solid #e6e3d8",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 18,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#202020", marginBottom: 4 }}>
                Something went wrong with a delivery?
              </div>
              <div style={{ fontSize: 13.5, color: "#666" }}>
                Raise a dispute within 7 days and track the answer. The driver&apos;s payout is
                held while we investigate.
              </div>
            </div>
            <Link
              to="/disputes"
              style={{
                padding: "10px 18px",
                borderRadius: 10,
                background: "var(--lasha-navy)",
                color: "var(--lasha-ivory)",
                fontSize: 13.5,
                fontWeight: 600,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              Open a dispute
            </Link>
          </div>
          <div style={{ marginTop: 18, padding: 24, background: "#f8f8f8", borderRadius: 10, border: "1px solid #e8e8e8" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#202020", marginBottom: 6 }}>Still need help?</div>
            <div style={{ fontSize: 14, color: "#666", marginBottom: 14 }}>
              Email our support team at {CONTACT_EMAIL}. We reply within 24 hours on business days.
            </div>
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Help%20with%20my%20Lasha%20account`}
              style={{ display: "inline-block", padding: "10px 24px", borderRadius: 10, border: "1px solid #42b4d0", background: "#fff", color: "#087f9c", fontSize: 14, fontWeight: 600, textDecoration: "none" }}
            >
              Email support
            </a>
          </div>
        </div>
      </div>
    </CustomerShell>
  );
}
