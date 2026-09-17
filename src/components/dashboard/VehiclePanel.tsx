import { Download, Weight, Calendar, Zap, Flame, Container, Car } from "lucide-react";
import SpecificationCard from "./SpecificationCard";
import type { VehicleInfo } from "@/types/dashboard";

// ─── Vehicle Panel (Activity Centre · Vehicle Details tab) ───────────────────
// Real fleet data for the assigned vehicle: identity (brand, model, year,
// license plate) and handling capabilities. Before a driver is assigned the
// panel shows the capability requirements instead — the fields still describe
// a vehicle, not the delivery's service options.

interface VehiclePanelProps {
  vehicle: VehicleInfo;
}

function YesNoChip({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ size?: number | string; strokeWidth?: number | string }> }) {
  const isYes = value === "Yes";
  return (
    <div className="dash-info-card">
      <div className="dash-info-label">{label}</div>
      <div
        className="dash-info-value"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          color: value === "N/A" ? "var(--lasha-text-muted, #7a8a99)" : isYes ? "#0A7C42" : "#6e7a86",
        }}
      >
        <Icon size={14} strokeWidth={1.8} />
        {value}
      </div>
    </div>
  );
}

export default function VehiclePanel({ vehicle }: VehiclePanelProps) {
  const hasVehicle =
    vehicle.make !== "N/A" && vehicle.model !== "N/A";

  return (
    <div className="dash-vehicle-panel">
      {/* Vehicle image area */}
      <div className="dash-vehicle-image-wrap">
        <img
          src="/assets/van-fleet.jpg"
          alt="Lasha fleet vehicle"
          className="dash-vehicle-image"
          loading="lazy"
        />
        <button className="dash-vehicle-download" aria-label="Download vehicle info">
          <Download size={20} strokeWidth={1.5} />
        </button>
      </div>

      {/* Registration — license plate */}
      <div className="dash-vehicle-reg">{vehicle.registration}</div>

      {/* Identity grid */}
      <div className="dash-specs-grid">
        <SpecificationCard label="Vehicle Brand" value={vehicle.make} icon={Car} />
        <SpecificationCard label="Vehicle Model" value={vehicle.model} icon={Car} />
        <SpecificationCard label="Capacity" value={vehicle.capacity} icon={Weight} />
        <SpecificationCard label="Year" value={vehicle.year} icon={Calendar} />
      </div>

      {/* Handling capabilities */}
      <div className="dash-info-grid" style={{ marginTop: 12 }}>
        <YesNoChip label="Breaking / Fragile Goods" value={vehicle.breaking} icon={Weight} />
        <YesNoChip label="Express Service" value={vehicle.express} icon={Zap} />
        <YesNoChip label="Flammable Goods" value={vehicle.flammable} icon={Flame} />
        <YesNoChip label="Trailer Equipped" value={vehicle.trailer} icon={Container} />
      </div>

      {!hasVehicle && (
        <p
          style={{
            marginTop: 12,
            fontSize: 12.5,
            color: "var(--lasha-text-muted, #7a8a99)",
            textAlign: "center",
          }}
        >
          Vehicle details appear once a driver is assigned to this delivery.
        </p>
      )}
    </div>
  );
}
