import {
  Package,
  Truck,
  Clock,
  CheckCircle2,
  User,
  Mail,
  Phone,
  Building2,
  ChevronRight,
} from "lucide-react";
import type { Order } from "@/types/dashboard";

// ─── Activity Overview ───────────────────────────────────────────────────────
// The Activity Centre's default (no-order-selected) view. Mirrors the
// Operations Centre overview grammar — stat cards on top, summary list below —
// but centred on the customer: their shipment stats, their account details,
// and their recent orders. Selecting an order swaps this panel for the
// four-tab details view.

interface ActivityOverviewProps {
  orders: Order[];
  customerName: string;
  customerCompany: string;
  customerEmail: string;
  customerPhone: string;
  onSelectOrder: (id: string) => void;
  onRequestDelivery: () => void;
}

function overviewStatus(order: Order): { label: string; tone: "active" | "pending" | "done" } {
  if (order.status === "In Transit") return { label: "In Transit", tone: "active" };
  return { label: "Pending", tone: "pending" };
}

export default function ActivityOverview({
  orders,
  customerName,
  customerCompany,
  customerEmail,
  customerPhone,
  onSelectOrder,
  onRequestDelivery,
}: ActivityOverviewProps) {
  const inTransit = orders.filter((o) => o.status === "In Transit").length;
  const pending = orders.filter((o) => o.status === "Pending").length;
  const total = orders.length;

  const stats = [
    { icon: <Package size={22} />, label: "Total Orders", value: total, color: "#42B4D0" },
    { icon: <Truck size={22} />, label: "In Transit", value: inTransit, color: "#0A7C42" },
    { icon: <Clock size={22} />, label: "Pending", value: pending, color: "#856404" },
    {
      icon: <CheckCircle2 size={22} />,
      label: "Completed",
      value: Math.max(total - inTransit - pending, 0),
      color: "#666666",
    },
  ];

  const recent = orders.slice(0, 5);

  return (
    <div className="dash-overview">
      {/* Stat cards — same grammar as the ops overview */}
      <div className="dash-stats-grid">
        {stats.map((stat) => (
          <div key={stat.label} className="dash-stat-card" style={{ "--stat-accent": stat.color } as React.CSSProperties}>
            <div className="dash-stat-icon" style={{ color: stat.color, background: `${stat.color}14` }}>
              {stat.icon}
            </div>
            <div className="dash-stat-value">{stat.value}</div>
            <div className="dash-stat-label">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Customer account summary */}
      <div className="dash-overview-section">
        <h2 className="dash-overview-title">Account</h2>
        <div className="dash-customer-card">
          <div className="dash-customer-avatar">
            <User size={22} />
          </div>
          <div className="dash-customer-main">
            <div className="dash-customer-name">{customerName}</div>
            <div className="dash-customer-org">
              <Building2 size={13} />
              {customerCompany}
            </div>
          </div>
          <div className="dash-customer-contacts">
            <span className="dash-customer-contact">
              <Mail size={13} />
              {customerEmail}
            </span>
            <span className="dash-customer-contact">
              <Phone size={13} />
              {customerPhone}
            </span>
          </div>
        </div>
      </div>

      {/* Recent orders */}
      <div className="dash-overview-section">
        <div className="dash-overview-head">
          <h2 className="dash-overview-title">Recent Orders</h2>
          <button className="dash-overview-link" onClick={onRequestDelivery}>
            Request delivery <ChevronRight size={14} />
          </button>
        </div>
        {recent.length === 0 ? (
          <div className="dash-placeholder">
            <p className="dash-placeholder-title">No orders yet</p>
            <p className="dash-placeholder-sub">Your deliveries will appear here.</p>
          </div>
        ) : (
          <div className="dash-recent-list">
            {recent.map((order) => {
              const s = overviewStatus(order);
              return (
                <button key={order.id} className="dash-recent-row" onClick={() => onSelectOrder(order.id)}>
                  <div className={`dash-recent-icon ${s.tone}`}>
                    <Package size={16} />
                  </div>
                  <div className="dash-recent-main">
                    <span className="dash-recent-id">{order.id}</span>
                    <span className="dash-recent-route">
                      {order.pickup.address} → {order.dropoff.address}
                    </span>
                  </div>
                  <span className={`dash-order-status ${s.tone === "active" ? "in-transit" : "pending"}`}>
                    {s.label}
                  </span>
                  <ChevronRight size={16} className="dash-recent-chevron" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
