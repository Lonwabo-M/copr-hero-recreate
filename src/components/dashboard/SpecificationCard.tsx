import { Weight, Settings, Zap, Flame, Container, Clock } from "lucide-react";

interface SpecificationCardProps {
  label: string;
  value: string;
  icon: typeof Weight;
}

export default function SpecificationCard({ label, value, icon: Icon }: SpecificationCardProps) {
  return (
    <div className="dash-spec-card">
      <div className="dash-spec-icon">
        <Icon size={18} strokeWidth={1.5} />
      </div>
      <div className="dash-spec-info">
        <span className="dash-spec-label">{label}</span>
        <span className="dash-spec-value">{value}</span>
      </div>
    </div>
  );
}
