import { Circle, MapPin, Truck } from "lucide-react";
import type { Order } from "@/types/dashboard";

interface OrderCardProps {
  order: Order;
  isActive: boolean;
  onClick: () => void;
}

export default function OrderCard({ order, isActive, onClick }: OrderCardProps) {
  return (
    <div
      className={`dash-order-card ${isActive ? "active" : ""}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      aria-label={`Order ${order.id}`}
      aria-selected={isActive}
    >
      {/* Header: Order ID + Status */}
      <div className="dash-order-card-header">
        <span className="dash-order-id">{order.id}</span>
        <span
          className={`dash-order-status ${
            order.status === "In Transit" ? "in-transit" : "pending"
          }`}
        >
          {order.status}
        </span>
      </div>

      {/* Pickup */}
      <div className="dash-order-route">
        <div className="dash-order-point">
          <Circle
            size={18}
            className="dash-order-point-icon"
            strokeWidth={1.5}
            style={{ color: isActive ? "#FFFFFF" : "var(--text-muted)" }}
          />
          <div className="dash-order-point-content">
            <div className="dash-order-point-label">Pickup Point</div>
            <div className="dash-order-point-date">
              {order.pickup.date} {order.pickup.time}
            </div>
            <div className="dash-order-point-address">{order.pickup.address}</div>
          </div>
        </div>

        {/* Route visualization */}
        <div className="dash-route-line">
          <div className="dash-route-dot" />
          <div className="dash-route-dash" />
          <div className="dash-route-truck">
            <Truck
              size={16}
              strokeWidth={1.5}
              style={{ color: isActive ? "#FFFFFF" : "var(--primary)" }}
            />
          </div>
          <div className="dash-route-dash" />
          <div className="dash-route-dot" />
        </div>

        {/* Dropoff */}
        <div className="dash-order-point">
          <MapPin
            size={18}
            className="dash-order-point-icon"
            strokeWidth={1.5}
            style={{ color: isActive ? "#FFFFFF" : "var(--text-muted)" }}
          />
          <div className="dash-order-point-content">
            <div className="dash-order-point-label">Drop-off Point</div>
            <div className="dash-order-point-address">{order.dropoff.address}</div>
          </div>
        </div>
      </div>

      {/* Track Order button */}
      <button
        className={`dash-track-btn ${isActive ? "active" : "inactive"}`}
        onClick={(e) => e.stopPropagation()}
      >
        Track Order
      </button>
    </div>
  );
}
