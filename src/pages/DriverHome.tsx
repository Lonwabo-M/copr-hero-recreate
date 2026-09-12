import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import DriverShell from "@/components/shells/DriverShell";
import { useAuth } from "@/hooks/use-auth";

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

  const activeDelivery = current?.delivery ?? null;

  const completedCount =
    history?.filter((d) => d.status === "delivered").length ?? 0;

  return (
    <DriverShell activeItem="Active Delivery">
      <main className="driver-main dash-workspace">
        <div className="driver-container">
          <div className="driver-header">
            <div>
              <h1 className="driver-title">Driver App</h1>
              <p className="driver-subtitle">
                Your assignments and delivery activity
              </p>
            </div>
          </div>

          {current === undefined || history === undefined ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: "#999" }} />
            </div>
          ) : (
            <>
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
                  className="driver-btn-primary"
                  onClick={() => window.location.assign("/driver/active-delivery")}
                >
                  Open Active Delivery
                </button>
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
