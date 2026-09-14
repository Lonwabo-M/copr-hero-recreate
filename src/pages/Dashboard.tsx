import { useState, useEffect } from "react";
import { Link } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import CustomerShell from "@/components/shells/CustomerShell";
import { Loader2, Package } from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/pages.css";

// Order type that matches what the dashboard components expect
interface DashboardOrder {
  id: string;
  deliveryId: string; // real Convex _id — used for the detail-page link
  status: "In Transit" | "Pending";
  pickup: { name: string; address: string; date: string; time: string };
  dropoff: { name: string; address: string };
  vehicle: { registration: string; capacity: string; breaking: string; express: string; flammable: string; trailer: string; time: string };
  driver: { name: string; license: string; phone: string; rating: string; trips: string };
  customer: { name: string; company: string; email: string; phone: string };
}

function transformDeliveryToOrder(delivery: any, order: any): DashboardOrder {
  return {
    id: `#${delivery.trackingNumber}`,
    deliveryId: delivery._id,
    status: delivery.status === "in_transit" ? "In Transit" : "Pending",
    pickup: {
      name: "Pickup Location",
      address: delivery.pickupLat ? `${delivery.pickupLat.toFixed(4)}, ${delivery.pickupLng?.toFixed(4)}` : "N/A",
      date: delivery.assignedAt ? new Date(delivery.assignedAt).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" }) : "N/A",
      time: delivery.assignedAt ? new Date(delivery.assignedAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "N/A",
    },
    dropoff: {
      name: "Dropoff Location",
      address: delivery.dropoffLat ? `${delivery.dropoffLat.toFixed(4)}, ${delivery.dropoffLng?.toFixed(4)}` : "N/A",
    },
    vehicle: {
      registration: "N/A",
      capacity: "N/A",
      breaking: "N/A",
      express: "N/A",
      flammable: "N/A",
      trailer: "N/A",
      time: "N/A",
    },
    driver: {
      name: "Unassigned",
      license: "N/A",
      phone: "N/A",
      rating: "N/A",
      trips: "N/A",
    },
    customer: {
      name: "Customer",
      company: "N/A",
      email: "N/A",
      phone: "N/A",
    },
  };
}

export default function Dashboard() {
  const [selectedOrder, setSelectedOrder] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeDetailTab, setActiveDetailTab] = useState("Vehicle Details");
  const [detailsOpen, setDetailsOpen] = useState(false);

  // Fetch deliveries from Convex
  const deliveries = useQuery(api.deliveries.state_machine.getMyDeliveries, {});

  // Transform deliveries into the format the dashboard expects
  const orders: DashboardOrder[] = deliveries?.map((d: any) => transformDeliveryToOrder(d, null)) ?? [];

  const selectedOrderData = orders.find((o) => o.id === selectedOrder);

  // Reset detail tab when order changes
  useEffect(() => {
    setActiveDetailTab("Vehicle Details");
  }, [selectedOrder]);

  // Close details panel on resize to desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 1024) {
        setDetailsOpen(false);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Auto-select first order
  useEffect(() => {
    if (orders.length > 0 && !selectedOrder) {
      setSelectedOrder(orders[0].id);
    }
  }, [orders, selectedOrder]);

  const handleSelectOrder = (id: string) => {
    setSelectedOrder(id);
    // On mobile, open the details panel
    if (window.innerWidth <= 1024) {
      setDetailsOpen(true);
    }
  };

  return (
    <CustomerShell activeItem="Activity Center">
      {/* Workspace */}
      <div className="dash-workspace">
        {/* Loading state */}
        {deliveries === undefined ? (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", gridColumn: "1 / -1" }}>
            <Loader2 size={24} className="animate-spin" style={{ color: "#999" }} />
          </div>
        ) : orders.length === 0 ? (
          /* One centered empty-state unit: icon, heading, copy all share the
             same axis. No inner wrapper — it stretched the icon tile full-width. */
          <div
            className="empty-state"
            style={{
              gridColumn: "1 / -1",
              flex: 1,
              height: "100%",
              width: "100%",
            }}
          >
            <div className="empty-state-icon"><Package size={24} /></div>
            <div className="empty-state-title">No deliveries yet</div>
            <div className="empty-state-desc">Create your first delivery to get started.</div>
          </div>
        ) : (
          <>
            {/* Order panel */}
            <div className="dash-order-panel">
              <div className="dash-search-bar">
                <input
                  type="text"
                  placeholder="Search orders..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="dash-search-input"
                />
              </div>
              <div className="dash-order-filters">
                {["All", "Pending", "In Transit"].map((f) => (
                  <button
                    key={f}
                    className={`dash-filter-btn ${activeFilter === f ? "active" : ""}`}
                    onClick={() => setActiveFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="dash-order-list">
                {orders
                  .filter((o) => {
                    const matchesFilter = activeFilter === "All" ||
                      (activeFilter === "Pending" && o.status === "Pending") ||
                      (activeFilter === "In Transit" && o.status === "In Transit");
                    const matchesSearch = o.id.toLowerCase().includes(searchQuery.toLowerCase());
                    return matchesFilter && matchesSearch;
                  })
                  .map((order) => (
                    <Link
                      key={order.id}
                      to={`/deliveries/${order.deliveryId}`}
                      className={`dash-order-card ${selectedOrder === order.id ? "active" : ""}`}
                      style={{ textDecoration: "none", color: "inherit", display: "block" }}
                      onClick={() => handleSelectOrder(order.id)}
                    >
                      <div className="dash-order-card-header">
                        <span className="dash-order-id">{order.id}</span>
                        <span className={`dash-order-status ${order.status === "In Transit" ? "transit" : "pending"}`}>
                          {order.status}
                        </span>
                      </div>
                      <div className="dash-order-card-route">
                        <span>{order.pickup.name}</span>
                        <span style={{ color: "#999" }}>→</span>
                        <span>{order.dropoff.name}</span>
                      </div>
                    </Link>
                  ))}
              </div>
            </div>

            {/* Details panel */}
            {selectedOrderData && (
              <div className={`dash-details-panel ${detailsOpen ? "open" : ""}`}>
                <div className="dash-order-header">
                  <span className="dash-order-header-label">Order:</span>
                  <span className="dash-order-header-id">{selectedOrderData.id}</span>
                </div>
                <div style={{ padding: 16 }}>
                  <p style={{ fontSize: 13, color: "#666" }}>Status: {selectedOrderData.status}</p>
                  <p style={{ fontSize: 13, color: "#666", marginTop: 8 }}>Pickup: {selectedOrderData.pickup.address}</p>
                  <p style={{ fontSize: 13, color: "#666" }}>Dropoff: {selectedOrderData.dropoff.address}</p>
                  <p style={{ fontSize: 13, color: "#666", marginTop: 8 }}>Driver: {selectedOrderData.driver.name}</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </CustomerShell>
  );
}
