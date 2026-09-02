import { Circle, MapPin, Calendar, Clock } from "lucide-react";
import type { Order } from "@/data/orders";

interface OrderDetailsTabProps {
  order: Order;
}

export default function OrderDetailsTab({ order }: OrderDetailsTabProps) {
  return (
    <div className="dash-tab-content">
      <div className="dash-info-grid">
        <div className="dash-info-card">
          <div className="dash-info-label">Order ID</div>
          <div className="dash-info-value">{order.id}</div>
        </div>
        <div className="dash-info-card">
          <div className="dash-info-label">Status</div>
          <div className="dash-info-value">{order.status}</div>
        </div>
        <div className="dash-info-card">
          <div className="dash-info-label">Pickup Location</div>
          <div className="dash-info-value muted">{order.pickup.address}</div>
        </div>
        <div className="dash-info-card">
          <div className="dash-info-label">Drop-off Location</div>
          <div className="dash-info-value muted">{order.dropoff.address}</div>
        </div>
        <div className="dash-info-card">
          <div className="dash-info-label">Pickup Date</div>
          <div className="dash-info-value muted">{order.pickup.date}</div>
        </div>
        <div className="dash-info-card">
          <div className="dash-info-label">Pickup Time</div>
          <div className="dash-info-value muted">{order.pickup.time}</div>
        </div>
        <div className="dash-info-card">
          <div className="dash-info-label">Pickup Name</div>
          <div className="dash-info-value muted">{order.pickup.name}</div>
        </div>
        <div className="dash-info-card">
          <div className="dash-info-label">Drop-off Name</div>
          <div className="dash-info-value muted">{order.dropoff.name}</div>
        </div>
      </div>
    </div>
  );
}
