import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import CustomerShell from "@/components/shells/CustomerShell";
import OrderPanel from "@/components/dashboard/OrderPanel";
import DetailsPanel from "@/components/dashboard/DetailsPanel";
import ActivityOverview from "@/components/dashboard/ActivityOverview";
import { Loader2 } from "lucide-react";
import type { Order } from "@/types/dashboard";
import { orderStatusFromDelivery } from "@/lib/orderStatus";
import "@/styles/dashboard.css";
import "@/styles/pages.css";

// ─── Activity Centre (dashboard) ─────────────────────────────────────────────
// Renders the customer's deliveries through the shared dashboard components:
// OrderPanel (search by order number + status filter pills + route cards with
// the pickup → drop-off line) and DetailsPanel (Order / Vehicle / Driver /
// Customer detail tabs). The customer sidebar carries product navigation only:
// staff portals (Operations, Driver, Admin) are separate applications opened at
// their own URLs, never linked from the customer-facing product.

// Local row: the shared Order display shape plus the real Convex delivery id
// used by the Track Order action.
type ActivityOrder = Order & { deliveryId: string };

function transformDeliveryToOrder(delivery: any, accountBusinessName?: string): ActivityOrder {
  // Human-readable addresses come from the server-resolved `details` (order +
  // address records). Coordinates are never shown to customers.
  const details = delivery.details ?? {};
  const when = details.scheduledTime ?? details.createdAt ?? delivery.assignedAt ?? null;
  return {
    id: `#${delivery.trackingNumber}`,
    deliveryId: delivery._id,
    status: orderStatusFromDelivery(delivery.status),
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
      registration: details.vehicleRegistration ?? "N/A",
      make: details.vehicleMake ?? "N/A",
      model: details.vehicleModel ?? "N/A",
      year: details.vehicleYear != null ? String(details.vehicleYear) : "N/A",
      capacity: details.vehicleCapacityKg != null ? `${details.vehicleCapacityKg.toLocaleString("en-ZA")} kg` : "N/A",
      breaking: details.vehicleBreaking == null ? "N/A" : details.vehicleBreaking ? "Yes" : "No",
      express: details.vehicleExpress == null ? "N/A" : details.vehicleExpress ? "Yes" : "No",
      flammable: details.vehicleFlammable == null ? "N/A" : details.vehicleFlammable ? "Yes" : "No",
      trailer: details.vehicleTrailer == null ? "N/A" : details.vehicleTrailer ? "Yes" : "No",
    },
    driver: {
      name: details.driverName ?? "Unassigned",
      license: details.driverLicenseClass ?? "N/A",
      phone: details.driverPhone ?? "N/A",
      rating: details.driverRating != null ? details.driverRating.toFixed(1) : "N/A",
      trips: details.driverTotalTrips != null ? String(details.driverTotalTrips) : "N/A",
    },
    customer: {
      name: details.senderName ?? "—",
      // The account holder is a BUSINESS (B2B or B2C): prefer the order's own
      // business record, then the signed-in account's business name.
      company: details.businessName ?? accountBusinessName ?? "Business account",
      email: details.senderEmail ?? "N/A",
      phone: details.senderPhone ?? "N/A",
    },
  };
}

export default function Dashboard() {
  // Default view = the overview (ops-overview grammar, customer-scoped).
  // Selecting an order swaps in the four-tab details panel; "Back to overview"
  // restores the default.
  const [selectedOrder, setSelectedOrder] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeDetailTab, setActiveDetailTab] = useState("Order Details");
  const [detailsOpen, setDetailsOpen] = useState(false);

  const navigate = useNavigate();

  // The signed-in account's business — every customer account belongs to a
  // business, so deliveries without their own business record still present the
  // account's business name rather than a placeholder.
  const business = useQuery(api.users.businessProfile.getMyBusiness);

  // Fetch deliveries from Convex (server-resolved details included)
  const deliveries = useQuery(api.deliveries.state_machine.getMyDeliveries, {});

  const orders: ActivityOrder[] = deliveries?.map((d) =>
    transformDeliveryToOrder(d, business?.name),
  ) ?? [];

  const selectedOrderData = orders.find((o) => o.id === selectedOrder);
  const isDetailOpen = selectedOrder !== "" && selectedOrderData != null;

  // Reset detail tab when order changes
  useEffect(() => {
    setActiveDetailTab("Order Details");
  }, [selectedOrder]);

  // Close mobile details panel on resize to desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 1024) {
        setDetailsOpen(false);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleSelectOrder = (id: string) => {
    setSelectedOrder(id);
    // On mobile, open the details panel full-screen
    if (window.innerWidth <= 1024) {
      setDetailsOpen(true);
    }
  };

  const handleBackToOverview = () => {
    setSelectedOrder("");
    setDetailsOpen(false);
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
        ) : isDetailOpen && selectedOrderData ? (
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

            {/* Details panel — with a path back to the overview */}
            <DetailsPanel
              order={selectedOrderData}
              activeTab={activeDetailTab}
              onTabChange={setActiveDetailTab}
              isOpen={detailsOpen}
              onClose={() => setDetailsOpen(false)}
              onBack={handleBackToOverview}
            />
          </>
        ) : (
          /* Default view — the overview (stat cards + recent orders). The
             personal "Account" banner was removed: the business identity lives
             in the shell header, and this view stays focused on shipments. */
          <ActivityOverview
            orders={orders}
            onSelectOrder={handleSelectOrder}
            onRequestDelivery={() => navigate("/request-delivery")}
          />
        )}
      </div>
    </CustomerShell>
  );
}
