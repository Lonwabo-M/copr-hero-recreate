import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import CustomerShell from "@/components/shells/CustomerShell";
import OrderPanel from "@/components/dashboard/OrderPanel";
import DetailsPanel from "@/components/dashboard/DetailsPanel";
import { Loader2, Package } from "lucide-react";
import type { Order } from "@/types/dashboard";
import "@/styles/dashboard.css";
import "@/styles/pages.css";

// ─── Activity Centre (dashboard) ─────────────────────────────────────────────
// Renders the customer's deliveries through the shared dashboard components:
// OrderPanel (search by order number + status filter pills + route cards with
// the pickup → drop-off line) and DetailsPanel (Order / Vehicle / Driver /
// Customer detail tabs). The Operations Centre entry in the sidebar is the
// access point into the Operations area (see AppShell handleNav).

// Local row: the shared Order display shape plus the real Convex delivery id
// used by the Track Order action.
type ActivityOrder = Order & { deliveryId: string };

function transformDeliveryToOrder(delivery: any): ActivityOrder {
  // Human-readable addresses come from the server-resolved `details` (order +
  // address records). Coordinates are never shown to customers.
  const details = delivery.details ?? {};
  const when = details.scheduledTime ?? details.createdAt ?? delivery.assignedAt ?? null;
  return {
    id: `#${delivery.trackingNumber}`,
    deliveryId: delivery._id,
    status: delivery.status === "in_transit" ? "In Transit" : "Pending",
    pickup: {
      name: "Pickup Point",
      address: details.pickupAddress ?? "Address on file",
      date: when ? new Date(when).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" }) : "—",
      time: when ? new Date(when).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "",
    },
    dropoff: {
      name: "Drop-off Point",
      address: details.dropoffAddress ?? "Address on file",
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
      name: details.recipientName ?? "Not specified",
      company: details.description ?? "—",
      email: details.expeditionType?.replace(/_/g, "-") ?? "standard",
      phone: details.recipientPhone ?? "N/A",
    },
  };
}

export default function Dashboard() {
  const [selectedOrder, setSelectedOrder] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeDetailTab, setActiveDetailTab] = useState("Vehicle Details");
  const [detailsOpen, setDetailsOpen] = useState(false);

  const navigate = useNavigate();

  // Fetch deliveries from Convex (server-resolved details included)
  const deliveries = useQuery(api.deliveries.state_machine.getMyDeliveries, {});

  const orders: ActivityOrder[] = deliveries?.map(transformDeliveryToOrder) ?? [];

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
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100%", width: "100%" }}>
            <Loader2 size={24} className="animate-spin" style={{ color: "#999" }} />
          </div>
        ) : orders.length === 0 ? (
          /* One centered empty-state unit: icon, heading, copy all share the
             same axis. */
          <div
            className="empty-state"
            style={{
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
            {/* Order panel — search + filters + route cards */}
            <OrderPanel
              orders={orders}
              selectedId={selectedOrder}
              searchQuery={searchQuery}
              activeFilter={activeFilter}
              onSearchChange={setSearchQuery}
              onFilterChange={setActiveFilter}
              onSelectOrder={handleSelectOrder}
              onTrack={(order) => navigate(`/deliveries/${order.deliveryId}`)}
            />

            {/* Details panel */}
            {selectedOrderData && (
              <DetailsPanel
                order={selectedOrderData}
                activeTab={activeDetailTab}
                onTabChange={setActiveDetailTab}
                isOpen={detailsOpen}
                onClose={() => setDetailsOpen(false)}
              />
            )}
          </>
        )}
      </div>
    </CustomerShell>
  );
}
