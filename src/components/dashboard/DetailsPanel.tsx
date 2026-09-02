import DetailTabs from "./DetailTabs";
import VehiclePanel from "./VehiclePanel";
import OrderDetailsTab from "./OrderDetailsTab";
import DriverDetailsTab from "./DriverDetailsTab";
import CustomerDetailsTab from "./CustomerDetailsTab";
import type { Order } from "@/data/orders";

interface DetailsPanelProps {
  order: Order;
  activeTab: string;
  onTabChange: (tab: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function DetailsPanel({
  order,
  activeTab,
  onTabChange,
  isOpen,
  onClose,
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

      {/* Order header */}
      <div className="dash-order-header">
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
