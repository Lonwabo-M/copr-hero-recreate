import { useQuery } from "convex/react";
import { Loader2, Bell } from "lucide-react";
import { api } from "@/convex/_generated/api";
import DriverShell from "@/components/shells/DriverShell";
import { useAuth } from "@/hooks/use-auth";

// Client-side expiry helper (display only) — mirrors DriverOffers. The
// backend remains authoritative and re-validates expiry on accept.
const isExpired = (expiresAt: number) => expiresAt < Date.now();

// ─── DriverHome ──────────────────────────────────────────────────────────────
// Home of the Driver App. Composes existing Convex queries only — no new
// backend, no mock data. Shows the driver's current assignment status, past
// delivery count and account identity, with entry points to the pages that
// actually exist in the Driver App today.

const ACTIVE_STATUSES = [
  "assigned",
  "driver_accepted",
  "en_route_to_pickup",
  "at_pickup",
  "picked_up",
  "in_transit",
  "at_dropoff",
];

export default function DriverHome() {
  const { user } = useAuth();
  const current = useQuery(api.tracking.queries.getMyCurrentDelivery, {});
  const history = useQuery(api.deliveries.state_machine.getMyDeliveries, { limit: 50 });
  const offers = useQuery(api.dispatch.engine.getMyDispatchOffers, {});

  // Driver-facing in-app notifications (existing infrastructure, session-scoped).
  const notifications = useQuery(api.notifications.service.getMyNotifications, {});
  const unreadCount =
    notifications?.filter((n) => !n.isRead).length ?? 0;

  const activeDelivery = current?.delivery ?? null;

  // Real count of unexpired pending offers (display only; backend re-validates).
  const availableOffers =
    offers?.filter((o) => o.status === "pending" && !isExpired(o.expiresAt)).length ?? 0;

  const completedCount =
    history?.filter((d) => d.status === "delivered").length ?? 0;

  return (
    <DriverShell activeItem="Active Delivery">
      <main className="driver-main dash-workspace" style={{ paddingBottom: 24 }}>
        <div className="driver-container">
          <div className="driver-header">
            <div>
              <h1 className="driver-title">Driver App</h1>
              <p className="driver-subtitle">
                Your assignments and delivery activity
              </p>
            </div>
          </div>

          {current === undefined || history === undefined || offers === undefined ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: "#999" }} />
            </div>
          ) : (
            <>
              {/* Available offers — path to the offers workflow */}
              <div className="driver-action-card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 600, color: "#202020" }}>
                    Delivery offers
                  </h2>
                  {availableOffers > 0 && (
                    <span className="driver-offer-countdown">{availableOffers} available</span>
                  )}
                </div>
                {availableOffers > 0 ? (
                  <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
                    You have {availableOffers} assignment {availableOffers === 1 ? "offer" : "offers"} waiting.
                  </p>
                ) : (
                  <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
                    No offers waiting right now. New offers appear automatically.
                  </p>
                )}
                <button
                  className="driver-primary-btn"
                  onClick={() => window.location.assign("/driver/offers")}
                >
                  View Delivery Offers
                </button>
              </div>

              {/* Current assignment */}
              <div className="driver-action-card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 600, color: "#202020" }}>
                    Current assignment
                  </h2>
                  {activeDelivery && (
                    <span className="driver-status-badge">{activeDelivery.status.replace(/_/g, " ")}</span>
                  )}
                </div>
                {activeDelivery ? (
                  <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
                    Tracking {activeDelivery.trackingNumber} — continue in Active Delivery.
                  </p>
                ) : (
                  <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
                    No active delivery right now. New assignments appear here automatically.
                  </p>
                )}
                <button
                  className="driver-primary-btn"
                  onClick={() => window.location.assign("/driver/active-delivery")}
                >
                  Open Active Delivery
                </button>
              </div>

              {/* In-app notifications — existing infra, session-scoped query. */}
              <div className="driver-action-card" style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <h2 style={{ fontSize: 15, fontWeight: 600, color: "#202020" }}>
                    Notifications
                  </h2>
                  {unreadCount > 0 && (
                    <span className="driver-offer-countdown">{unreadCount} new</span>
                  )}
                </div>
                {notifications === undefined ? (
                  <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>Loading…</p>
                ) : notifications.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#666", marginBottom: 12 }}>
                    <Bell size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
                    No notifications yet. Delivery updates appear here.
                  </p>
                ) : (
                  notifications.slice(0, 3).map((n) => (
                    <div
                      key={n._id}
                      style={{
                        padding: "8px 0",
                        borderBottom: "1px solid #f0f0f0",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: n.isRead ? 400 : 600,
                          color: "#202020",
                        }}
                      >
                        {n.title}
                      </div>
                      <div style={{ fontSize: 12, color: "#666" }}>{n.description}</div>
                    </div>
                  ))
                )}
              </div>

              {/* Activity summary */}
              <div className="driver-action-card" style={{ padding: 16 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: "#202020", marginBottom: 12 }}>
                  Activity
                </h2>
                <div style={{ display: "flex", gap: 24 }}>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#0794b5" }}>
                      {completedCount}
                    </div>
                    <div style={{ fontSize: 12, color: "#666" }}>Completed deliveries</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#202020" }}>
                      {history.length}
                    </div>
                    <div style={{ fontSize: 12, color: "#666" }}>Recent assignments</div
                    >
                  </div>
                </div>
              </div>

              {/* Account */}
              <div className="driver-action-card" style={{ padding: 16 }}>
                <h2 style={{ fontSize: 15, fontWeight: 600, color: "#202020", marginBottom: 8 }}>
                  Account
                </h2>
                <p style={{ fontSize: 13, color: "#666" }}>
                  {user?.email ?? user?.name ?? "Signed in"}
                </p>
              </div>
            </>
          )}
        </div>
      </main>
    </DriverShell>
  );
}
