import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import CustomerShell from "@/components/shells/CustomerShell";
import { Loader2, Package, ShieldCheck, RotateCcw } from "lucide-react";
import { ROLES } from "@/convex/schema";
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
  // Human-readable addresses come from the server-resolved `details` (order +
  // address records). Coordinates are never shown to customers.
  const details = delivery.details ?? {};
  return {
    id: `#${delivery.trackingNumber}`,
    deliveryId: delivery._id,
    status: delivery.status === "in_transit" ? "In Transit" : "Pending",
    pickup: {
      name: "Pickup Location",
      address: details.pickupAddress ?? "Address on file",
      date: (details.scheduledTime ?? details.createdAt ?? delivery.assignedAt)
        ? new Date(details.scheduledTime ?? details.createdAt ?? delivery.assignedAt).toLocaleDateString("en-ZA", { day: "2-digit", month: "short" })
        : "N/A",
      time: (details.scheduledTime ?? details.createdAt ?? delivery.assignedAt)
        ? new Date(details.scheduledTime ?? details.createdAt ?? delivery.assignedAt).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })
        : "N/A",
    },
    dropoff: {
      name: "Dropoff Location",
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
  const { user } = useAuth();

  // Testing access point → Operations Centre. Claims a marked, reversible
  // test elevation (users.testAccess) and navigates only once the reactive
  // auth state reflects the operations role, so RoleGate admits the route
  // without a manual refresh and without a redirect race.
  const claimTestAccess = useMutation(api.users.testAccess.claimTestOperationsAccess);
  const releaseTestAccess = useMutation(api.users.testAccess.releaseTestOperationsAccess);
  const testAccessState = useQuery(api.users.testAccess.getTestAccessState, {});
  const [opsPending, setOpsPending] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const isTestElevated = testAccessState?.testElevated === true;
  const isRealStaff =
    user?.role === ROLES.OPERATIONS ||
    user?.role === ROLES.FLEET_MANAGER ||
    user?.role === ROLES.COMPANY_ADMIN ||
    user?.role === ROLES.SUPER_ADMIN;

  // Wait for the reactive user record to carry the elevated role, then cross
  // into the guarded area — RoleGate re-evaluates on the same query.
  useEffect(() => {
    if (opsPending && (user?.role === ROLES.OPERATIONS || isRealStaff)) {
      setOpsPending(false);
      navigate("/operations");
    }
  }, [opsPending, user?.role, isRealStaff, navigate]);

  const handleOpenOperations = async () => {
    if (isRealStaff) {
      navigate("/operations");
      return;
    }
    setOpsPending(true);
    try {
      await claimTestAccess({});
    } catch {
      setOpsPending(false);
    }
  };

  const handleReleaseTestAccess = async () => {
    setReleasing(true);
    try {
      await releaseTestAccess({});
    } finally {
      setReleasing(false);
    }
  };

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
        {/* Testing access strip → Operations Centre (temporary, reversible) */}
        <div
          className="dash-test-access"
          style={{
            gridColumn: "1 / -1",
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "12px 16px",
            borderRadius: 12,
            border: "1px dashed rgba(7,148,181,0.35)",
            background: "rgba(7,148,181,0.06)",
          }}
        >
          <ShieldCheck size={18} style={{ color: "#0794b5", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1a2733" }}>
              Testing access — Operations Centre
            </div>
            <div style={{ fontSize: 12, color: "#6b7a89", marginTop: 2 }}>
              {isTestElevated
                ? "Test elevation active. Open the Operations Centre, or release to restore your customer role."
                : "Temporarily elevate this account to operations staff for testing. Reversible in one click."}
            </div>
          </div>
          {isTestElevated && (
            <button
              onClick={handleReleaseTestAccess}
              disabled={releasing || opsPending}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                fontSize: 12.5,
                fontWeight: 600,
                color: "#4a5a68",
                background: "#fff",
                border: "1px solid #e3e8ee",
                borderRadius: 9,
                padding: "9px 14px",
                cursor: releasing ? "wait" : "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {releasing ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <RotateCcw size={14} />
              )}
              Release
            </button>
          )}
          <button
            onClick={handleOpenOperations}
            disabled={opsPending || releasing}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              fontSize: 12.5,
              fontWeight: 700,
              color: "#fff",
              background: "linear-gradient(135deg, #29a8c6, #0794b5)",
              border: "none",
              borderRadius: 9,
              padding: "10px 16px",
              cursor: opsPending ? "wait" : "pointer",
              boxShadow: "0 4px 12px rgba(7,148,181,0.28)",
              whiteSpace: "nowrap",
            }}
          >
            {opsPending ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ShieldCheck size={14} />
            )}
            {opsPending ? "Elevating…" : "Open Operations Centre"}
          </button>
        </div>

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
                  {selectedOrderData.customer.company !== "—" && (
                    <p style={{ fontSize: 13, color: "#666", marginTop: 8 }}>Order: {selectedOrderData.customer.company}</p>
                  )}
                  {selectedOrderData.customer.name !== "Not specified" && (
                    <p style={{ fontSize: 13, color: "#666" }}>Recipient: {selectedOrderData.customer.name}{selectedOrderData.customer.phone !== "N/A" ? ` · ${selectedOrderData.customer.phone}` : ""}</p>
                  )}
                  {selectedOrderData.pickup.date !== "N/A" && (
                    <p style={{ fontSize: 13, color: "#666", marginTop: 8 }}>
                      Scheduled: {selectedOrderData.pickup.date} at {selectedOrderData.pickup.time}
                    </p>
                  )}
                  <p style={{ fontSize: 13, color: "#666", marginTop: 8 }}>
                    Service: {selectedOrderData.customer.email}
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </CustomerShell>
  );
}
