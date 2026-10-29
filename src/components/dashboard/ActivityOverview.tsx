import {
  Package,
  Truck,
  Clock,
  CheckCircle2,
  ChevronRight,
} from "lucide-react";
import type { Order } from "@/types/dashboard";
import { orderStatusTone } from "@/lib/orderStatus";

// ─── Activity Overview ───────────────────────────────────────────────────────
// The Activity Centre's default (no-order-selected) view. Mirrors the
// Operations Centre overview grammar — stat cards on top, summary list below —
// scoped to the customer's shipments. Selecting an order swaps this panel for
// the four-tab details view.

interface ActivityOverviewProps {
  orders: Order[];
  onSelectOrder: (id: string) => void;
  onRequestDelivery: () => void;
}

export default function ActivityOverview({
  orders,
  onSelectOrder,
  onRequestDelivery,
}: ActivityOverviewProps) {
  const inTransit = orders.filter((o) => o.status === "In Transit").length;
  const pending = orders.filter((o) => o.status === "Pending").length;
  const delivered = orders.filter((o) => o.status === "Delivered").length;
  const total = orders.length;

  const stats = [
    { icon: <Package size={22} />, label: "Total Orders", value: total, color: "#42B4D0" },
    { icon: <Truck size={22} />, label: "In Transit", value: inTransit, color: "#0A7C42" },
    { icon: <Clock size={22} />, label: "Pending", value: pending, color: "#856404" },
    { icon: <CheckCircle2 size={22} />, label: "Delivered", value: delivered, color: "#666666" },
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
              const tone = orderStatusTone(order.status);
              return (
                <button key={order.id} className="dash-recent-row" onClick={() => onSelectOrder(order.id)}>
                  <div className={`dash-recent-icon ${tone}`}>
                    <Package size={16} />
                  </div>
                  <div className="dash-recent-main">
                    <span className="dash-recent-id">{order.id}</span>
                    <span className="dash-recent-route">
                      {order.pickup.address} → {order.dropoff.address}
                    </span>
                  </div>
                  <span className={`dash-order-status ${tone}`}>{order.status}</span>
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
