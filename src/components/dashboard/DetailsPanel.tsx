import { ArrowLeft } from "lucide-react";
import DetailTabs from "./DetailTabs";
import VehiclePanel from "./VehiclePanel";
import OrderDetailsTab from "./OrderDetailsTab";
import DriverDetailsTab from "./DriverDetailsTab";
import CustomerDetailsTab from "./CustomerDetailsTab";
import type { Order } from "@/types/dashboard";

interface DetailsPanelProps {
  order: Order;
  activeTab: string;
  onTabChange: (tab: string) => void;
  isOpen: boolean;
  onClose: () => void;
  /** Return to the overview (default) view. */
  onBack: () => void;
}

export default function DetailsPanel({
  order,
  activeTab,
  onTabChange,
  isOpen,
  onClose,
  onBack,
}: DetailsPanelProps) {
  const renderTabContent = () => {
    switch (activeTab) {
      case "Vehicle Details":
        return <VehiclePanel vehicle={order.vehicle} />;
      case "Order Details":
        return <OrderDetailsTab order={order} />;
      case "Driver Details":
        return <DriverDetailsTab driver={order.driver} />;
      case "Customer Details":
        return <CustomerDetailsTab customer={order.customer} />;
      default:
        return <VehiclePanel vehicle={order.vehicle} />;
    }
  };

  return (
    <div className={`dash-details-panel ${isOpen ? "open" : ""}`}>
      {/* Mobile back button */}
      {isOpen && (
        <button
          className="dash-mobile-toggle"
          onClick={onClose}
          style={{ marginBottom: 12, display: "none" }}
          aria-label="Close details"
        >
          ← Back
        </button>
      )}

      {/* Order header — with a return path to the overview */}
      <div className="dash-order-header">
        <button
          onClick={onBack}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            fontFamily: "\"Inter\", sans-serif",
            fontSize: 13,
            fontWeight: 600,
            color: "var(--primary-dark)",
            cursor: "pointer",
            padding: "6px 10px",
            marginLeft: -10,
            borderRadius: 8,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--primary-light)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          aria-label="Back to overview"
        >
          <ArrowLeft size={15} />
          Overview
        </button>
        <span style={{ flex: 1 }} />
        <span className="dash-order-header-label">Order:</span>
        <span className="dash-order-header-id">{order.id}</span>
      </div>

      {/* Detail tabs */}
      <DetailTabs activeTab={activeTab} onTabChange={onTabChange} />

      {/* Tab content */}
      {renderTabContent()}
    </div>
  );
}
