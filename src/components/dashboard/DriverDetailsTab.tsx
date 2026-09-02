import type { DriverInfo } from "@/data/orders";

interface DriverDetailsTabProps {
  driver: DriverInfo;
}

export default function DriverDetailsTab({ driver }: DriverDetailsTabProps) {
  return (
    <div className="dash-tab-content">
      <div className="dash-info-grid">
        <div className="dash-info-card">
          <div className="dash-info-label">Driver Name</div>
          <div className="dash-info-value">{driver.name}</div>
        </div>
        <div className="dash-info-card">
          <div className="dash-info-label">License Class</div>
          <div className="dash-info-value muted">{driver.license}</div>
        </div>
        <div className="dash-info-card">
          <div className="dash-info-label">Phone</div>
          <div className="dash-info-value muted">{driver.phone}</div>
        </div>
        <div className="dash-info-card">
          <div className="dash-info-label">Rating</div>
          <div className="dash-info-value muted">{driver.rating} ★</div>
        </div>
        <div className="dash-info-card">
          <div className="dash-info-label">Total Trips</div>
          <div className="dash-info-value muted">{driver.trips}</div>
        </div>
      </div>
    </div>
  );
}
