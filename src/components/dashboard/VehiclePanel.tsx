import { Download, Weight, Settings, Zap, Flame, Container, Clock } from "lucide-react";
import SpecificationCard from "./SpecificationCard";
import type { VehicleInfo } from "@/data/orders";

interface VehiclePanelProps {
  vehicle: VehicleInfo;
}

export default function VehiclePanel({ vehicle }: VehiclePanelProps) {
  const specs = [
    { label: "Capacity", value: vehicle.capacity, icon: Weight },
    { label: "Breaking", value: vehicle.breaking, icon: Settings },
    { label: "Express", value: vehicle.express, icon: Zap },
    { label: "Flammable", value: vehicle.flammable, icon: Flame },
    { label: "Trailer", value: vehicle.trailer, icon: Container },
    { label: "Time", value: vehicle.time, icon: Clock },
  ];

  return (
    <div className="dash-vehicle-panel">
      {/* Vehicle image area */}
      <div className="dash-vehicle-image-wrap">
        <img
          src="https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=600&q=80"
          alt="Toyota Quantum minibus taxi"
          className="dash-vehicle-image"
          loading="lazy"
        />
        <button className="dash-vehicle-download" aria-label="Download vehicle info">
          <Download size={20} strokeWidth={1.5} />
        </button>
      </div>

      {/* Registration */}
      <div className="dash-vehicle-reg">{vehicle.registration}</div>

      {/* Specifications grid */}
      <div className="dash-specs-grid">
        {specs.map((spec) => (
          <SpecificationCard
            key={spec.label}
            label={spec.label}
            value={spec.value}
            icon={spec.icon}
          />
        ))}
      </div>
    </div>
  );
}
