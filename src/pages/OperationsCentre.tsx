import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import Sidebar from "@/components/dashboard/Sidebar";
import { useDashboardNav } from "@/hooks/useDashboardNav";
import {
  Package,
  Truck,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  MapPin,
  Users,
  RefreshCw,
} from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/pages.css";
import "@/styles/operations.css";

type OpsTab = "overview" | "dispatch" | "live" | "drivers" | "exceptions" | "history";

export default function OperationsCentre() {
  const { handleSidebarNavigation } = useDashboardNav();
  const [activeSidebarItem, setActiveSidebarItem] = useState("Operations Centre");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<OpsTab>("overview");

  // Convex queries
  const deliveries = useQuery(api.deliveries.state_machine.getMyDeliveries, {});
  const notifications = useQuery(api.notifications.service.getMyNotifications, { limit: 10 });

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 1024) setSidebarOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onSidebarNav = (item: string) => {
    setActiveSidebarItem(item);
    handleSidebarNavigation(item);
  };

  // Calculate metrics from real data
  const activeDeliveries = deliveries?.filter(
    (d) => !["delivered", "cancelled", "failed"].includes(d.status)
  ).length ?? 0;

  const pendingDispatch = deliveries?.filter(
    (d) => d.status === "pending_dispatch"
  ).length ?? 0;

  const completedToday = deliveries?.filter(
    (d) => d.status === "delivered" && 
    d.completedAt && 
    d.completedAt > Date.now() - 24 * 60 * 60 * 1000
  ).length ?? 0;

  const failedDeliveries = deliveries?.filter(
    (d) => d.status === "failed"
  ).length ?? 0;

  const tabs: { id: OpsTab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <TrendingUp size={18} /> },
    { id: "dispatch", label: "Dispatch", icon: <Package size={18} /> },
    { id: "live", label: "Live Deliveries", icon: <MapPin size={18} /> },
    { id: "drivers", label: "Drivers", icon: <Users size={18} /> },
    { id: "exceptions", label: "Exceptions", icon: <AlertTriangle size={18} /> },
    { id: "history", label: "History", icon: <Clock size={18} /> },
  ];

  return (
    <div className="dashboard">
      {/* Top Navigation */}
      <header className="dash-topnav">
        <div className="dash-topnav-logo">
          <div className="lasha-logo-icon">
            <span>L</span>
          </div>
          <span className="dash-topnav-logo-text">Lasha</span>
        </div>

        <div className="dash-topnav-links">
          <button className="dash-topnav-link active">
            Home
            <span className="dash-topnav-link-underline" />
          </button>
          <button className="dash-topnav-link">About Us</button>
          <button className="dash-topnav-link">Services</button>
          <button className="dash-topnav-link">Contact US</button>
        </div>

        <div className="dash-topnav-right">
          <button
            className="dash-mobile-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <button className="dash-topnav-profile">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
        </div>
      </header>

      {/* App body */}
      <div className="dash-app">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="dash-mobile-overlay visible"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <Sidebar
          activeItem={activeSidebarItem}
          onItemChange={onSidebarNav}
          isOpen={sidebarOpen}
        />

        {/* Main content */}
        <main className="ops-main">
          {/* Tabs */}
          <div className="ops-tabs">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                className={`ops-tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="ops-content">
            {activeTab === "overview" && (
              <OverviewTab
                activeDeliveries={activeDeliveries}
                pendingDispatch={pendingDispatch}
                completedToday={completedToday}
                failedDeliveries={failedDeliveries}
                recentActivity={notifications}
              />
            )}
            {activeTab === "dispatch" && (
              <DispatchTab deliveries={deliveries} />
            )}
            {activeTab === "live" && (
              <LiveDeliveriesTab deliveries={deliveries} />
            )}
            {activeTab === "drivers" && (
              <DriversTab />
            )}
            {activeTab === "exceptions" && (
              <ExceptionsTab deliveries={deliveries} />
            )}
            {activeTab === "history" && (
              <HistoryTab deliveries={deliveries} />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  activeDeliveries,
  pendingDispatch,
  completedToday,
  failedDeliveries,
  recentActivity,
}: {
  activeDeliveries: number;
  pendingDispatch: number;
  completedToday: number;
  failedDeliveries: number;
  recentActivity: any[] | undefined;
}) {
  const stats = [
    { icon: <Truck size={24} />, label: "Active Deliveries", value: activeDeliveries, color: "#0794B5" },
    { icon: <Package size={24} />, label: "Pending Dispatch", value: pendingDispatch, color: "#856404" },
    { icon: <CheckCircle size={24} />, label: "Completed Today", value: completedToday, color: "#0A7C42" },
    { icon: <AlertTriangle size={24} />, label: "Failed", value: failedDeliveries, color: "#C62828" },
  ];

  return (
    <div className="ops-overview">
      {/* Stats Grid */}
      <div className="ops-stats-grid">
        {stats.map((stat) => (
          <div key={stat.label} className="ops-stat-card">
            <div className="ops-stat-icon" style={{ color: stat.color }}>
              {stat.icon}
            </div>
            <div className="ops-stat-value">{stat.value}</div>
            <div className="ops-stat-label">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="ops-section">
        <h2 className="ops-section-title">Recent Activity</h2>
        <div className="ops-activity-list">
          {recentActivity && recentActivity.length > 0 ? (
            recentActivity.map((activity) => (
              <div key={activity._id} className="ops-activity-item">
                <div className={`ops-activity-icon ${activity.type}`}>
                  {activity.type === "delivery" ? <Package size={16} /> : 
                   activity.type === "payment" ? <CheckCircle size={16} /> : 
                   <AlertTriangle size={16} />}
                </div>
                <div className="ops-activity-content">
                  <div className="ops-activity-title">{activity.title}</div>
                  <div className="ops-activity-desc">{activity.description}</div>
                </div>
                <div className="ops-activity-time">
                  {new Date(activity.createdAt).toLocaleTimeString()}
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Package size={24} />
              </div>
              <div className="empty-state-title">No recent activity</div>
              <div className="empty-state-desc">Activity will appear here as deliveries are processed.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Dispatch Tab ─────────────────────────────────────────────────────────────

function DispatchTab({ deliveries }: { deliveries: any[] | undefined }) {
  const pendingDispatch = deliveries?.filter(
    (d) => d.status === "pending_dispatch"
  ) ?? [];

  return (
    <div className="ops-dispatch">
      <div className="ops-section-header">
        <h2 className="ops-section-title">Pending Dispatch</h2>
        <button className="ops-btn ops-btn-primary">
          <RefreshCw size={16} />
          Refresh
        </button>
      </div>

      {pendingDispatch.length > 0 ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Tracking #</th>
              <th>Order</th>
              <th>Pickup</th>
              <th>Dropoff</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {pendingDispatch.map((delivery) => (
              <tr key={delivery._id}>
                <td style={{ fontWeight: 600 }}>{delivery.trackingNumber}</td>
                <td>{delivery.orderId.slice(-6).toUpperCase()}</td>
                <td>
                  {delivery.pickupLat?.toFixed(4)}, {delivery.pickupLng?.toFixed(4)}
                </td>
                <td>
                  {delivery.dropoffLat?.toFixed(4)}, {delivery.dropoffLng?.toFixed(4)}
                </td>
                <td>
                  <span className="status-badge pending">Pending</span>
                </td>
                <td>
                  <button className="ops-btn ops-btn-sm">Assign Driver</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Package size={24} />
          </div>
          <div className="empty-state-title">No pending dispatches</div>
          <div className="empty-state-desc">All deliveries have been assigned to drivers.</div>
        </div>
      )}
    </div>
  );
}

// ─── Live Deliveries Tab ──────────────────────────────────────────────────────

function LiveDeliveriesTab({ deliveries }: { deliveries: any[] | undefined }) {
  const activeDeliveries = deliveries?.filter(
    (d) => !["delivered", "cancelled", "failed"].includes(d.status)
  ) ?? [];

  const statusColors: Record<string, string> = {
    assigned: "#856404",
    driver_accepted: "#0794B5",
    en_route_to_pickup: "#0794B5",
    at_pickup: "#0794B5",
    picked_up: "#0A7C42",
    in_transit: "#0A7C42",
    at_dropoff: "#0A7C42",
  };

  return (
    <div className="ops-live">
      <div className="ops-section-header">
        <h2 className="ops-section-title">Live Deliveries</h2>
        <div className="ops-filter-group">
          <span className="ops-live-count">{activeDeliveries.length} active</span>
        </div>
      </div>

      {activeDeliveries.length > 0 ? (
        <div className="ops-delivery-grid">
          {activeDeliveries.map((delivery) => (
            <div key={delivery._id} className="ops-delivery-card">
              <div className="ops-delivery-header">
                <span className="ops-delivery-tracking">{delivery.trackingNumber}</span>
                <span
                  className="status-badge"
                  style={{
                    background: statusColors[delivery.status] ?? "#666",
                    color: "#fff",
                  }}
                >
                  {delivery.status.replace(/_/g, " ")}
                </span>
              </div>
              <div className="ops-delivery-route">
                <div className="ops-route-point">
                  <MapPin size={14} />
                  <span>Pickup: {delivery.pickupLat?.toFixed(2)}, {delivery.pickupLng?.toFixed(2)}</span>
                </div>
                <div className="ops-route-line" />
                <div className="ops-route-point">
                  <MapPin size={14} />
                  <span>Dropoff: {delivery.dropoffLat?.toFixed(2)}, {delivery.dropoffLng?.toFixed(2)}</span>
                </div>
              </div>
              <div className="ops-delivery-footer">
                <span className="ops-delivery-id">#{delivery.orderId.slice(-6).toUpperCase()}</span>
                <button className="ops-btn ops-btn-sm">View</button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Truck size={24} />
          </div>
          <div className="empty-state-title">No active deliveries</div>
          <div className="empty-state-desc">All deliveries are either completed or not yet started.</div>
        </div>
      )}
    </div>
  );
}

// ─── Drivers Tab ──────────────────────────────────────────────────────────────

function DriversTab() {
  return (
    <div className="ops-drivers">
      <div className="ops-section-header">
        <h2 className="ops-section-title">Driver Management</h2>
      </div>
      <div className="empty-state">
        <div className="empty-state-icon">
          <Users size={24} />
        </div>
        <div className="empty-state-title">Driver management</div>
        <div className="empty-state-desc">
          View and manage your driver fleet. Assign vehicles, track availability, and monitor performance.
        </div>
      </div>
    </div>
  );
}

// ─── Exceptions Tab ───────────────────────────────────────────────────────────

function ExceptionsTab({ deliveries }: { deliveries: any[] | undefined }) {
  const exceptions = deliveries?.filter(
    (d) => d.status === "failed" || d.status === "reassignment_required"
  ) ?? [];

  return (
    <div className="ops-exceptions">
      <div className="ops-section-header">
        <h2 className="ops-section-title">Exceptions</h2>
      </div>

      {exceptions.length > 0 ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Tracking #</th>
              <th>Order</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {exceptions.map((delivery) => (
              <tr key={delivery._id}>
                <td style={{ fontWeight: 600 }}>{delivery.trackingNumber}</td>
                <td>{delivery.orderId.slice(-6).toUpperCase()}</td>
                <td>
                  <span className="status-badge cancelled">
                    {delivery.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td>{delivery.rejectionReason ?? "N/A"}</td>
                <td>
                  <button className="ops-btn ops-btn-sm">Reassign</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">
            <CheckCircle size={24} />
          </div>
          <div className="empty-state-title">No exceptions</div>
          <div className="empty-state-desc">All deliveries are progressing normally.</div>
        </div>
      )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

function HistoryTab({ deliveries }: { deliveries: any[] | undefined }) {
  const completedDeliveries = deliveries?.filter(
    (d) => d.status === "delivered"
  ) ?? [];

  return (
    <div className="ops-history">
      <div className="ops-section-header">
        <h2 className="ops-section-title">Delivery History</h2>
      </div>

      {completedDeliveries.length > 0 ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Tracking #</th>
              <th>Order</th>
              <th>Status</th>
              <th>Completed</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {completedDeliveries.map((delivery) => (
              <tr key={delivery._id}>
                <td style={{ fontWeight: 600 }}>{delivery.trackingNumber}</td>
                <td>{delivery.orderId.slice(-6).toUpperCase()}</td>
                <td>
                  <span className="status-badge completed">Delivered</span>
                </td>
                <td>
                  {delivery.completedAt
                    ? new Date(delivery.completedAt).toLocaleDateString()
                    : "N/A"}
                </td>
                <td>
                  <button className="ops-btn ops-btn-sm">View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon">
            <Clock size={24} />
          </div>
          <div className="empty-state-title">No delivery history</div>
          <div className="empty-state-desc">Completed deliveries will appear here.</div>
        </div>
      )}
    </div>
  );
}
