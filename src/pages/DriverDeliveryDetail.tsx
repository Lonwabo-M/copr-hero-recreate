import { useParams } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import DriverShell from "@/components/shells/DriverShell";
import {
  Loader2,
  Package,
  MapPin,
  AlertTriangle,
  ArrowLeft,
  PenLine,
  Clock,
} from "lucide-react";
import { DELIVERY_STATUS } from "@/convex/schema";
import "@/styles/driver.css";

// ─── Driver Delivery Detail (history) ────────────────────────────────────────
// Shows one historical delivery to the authenticated driver. Everything comes
// from existing, driver-authorized Convex queries:
//
//   deliveries.state_machine.getDelivery  → throws "Access denied" unless
//                                           courierId === authenticated driver
//   tracking.queries.getDeliveryTracking  → same authorization via
//                                           authorizeTrackingAccess
//   pod.service.getPODForDelivery         → canAccessPOD allows the assigned
//                                           driver; returns POD + files
//
// A driver cannot open another driver's delivery by URL manipulation — the
// backend refuses. No customer/admin-only data is displayed.

function DetailRow({ label, value }: { label: string; value?: string | number | null }) {
  return (
    <div className="driver-timeline-item">
      <span className="driver-timeline-time">{label}</span>
      <span className="driver-timeline-text">
        {value === null || value === undefined || value === "" ? "—" : value}
      </span>
    </div>
  );
}

function formatDateTime(ts?: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DriverDeliveryDetail() {
  const { deliveryId } = useParams<{ deliveryId: string }>();

  // Existing authorized queries — "skip" until we have a route param.
  const delivery = useQuery(
    api.deliveries.state_machine.getDelivery,
    deliveryId ? { deliveryId: deliveryId as any } : "skip"
  );
  const tracking = useQuery(
    api.tracking.queries.getDeliveryTracking,
    deliveryId ? { deliveryId: deliveryId as any } : "skip"
  );
  const pod = useQuery(
    api.pod.service.getPODForDelivery,
    deliveryId ? { deliveryId: deliveryId as any } : "skip"
  );

  const loading =
    deliveryId === undefined ||
    delivery === undefined ||
    tracking === undefined;

  return (
    <DriverShell activeItem="Delivery History">
      <main className="driver-main dash-workspace">
        <div className="driver-container">
          {/* Back */}
          <button
            className="driver-history-back"
            onClick={() => window.history.back()}
          >
            <ArrowLeft size={14} />
            Back to history
          </button>

          {/* Loading */}
          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: "#999" }} />
            </div>
          ) : /* Query threw (unauthorized or missing) */
          delivery === null || tracking === null ? (
            <div className="driver-panel">
              <AlertTriangle size={24} style={{ color: "#b91c1c", margin: "0 auto" }} />
              <div className="driver-panel-title">Delivery unavailable</div>
              <div className="driver-panel-desc">
                This delivery does not exist or is not assigned to you.
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="driver-status-banner">
                <div>
                  <div className="driver-status-label">Final status</div>
                  <div className="driver-status-value">
                    {delivery.status.charAt(0).toUpperCase() +
                      delivery.status.slice(1).replace(/_/g, " ")}
                  </div>
                </div>
                <span className="driver-tracking-code">{delivery.trackingNumber}</span>
              </div>

              {/* Route */}
              <div className="driver-locations">
                <div className="driver-location-card">
                  <div className="driver-location-head">
                    <MapPin size={13} />
                    <span className="driver-location-tag">Pickup</span>
                  </div>
                  <div className="driver-location-address">
                    {delivery.pickupLat !== undefined
                      ? `${delivery.pickupLat.toFixed(5)}, ${delivery.pickupLng?.toFixed(5)}`
                      : "—"}
                  </div>
                </div>
                <div className="driver-location-card">
                  <div className="driver-location-head">
                    <MapPin size={13} />
                    <span className="driver-location-tag dropoff">Dropoff</span>
                  </div>
                  <div className="driver-location-address">
                    {delivery.dropoffLat !== undefined
                      ? `${delivery.dropoffLat.toFixed(5)}, ${delivery.dropoffLng?.toFixed(5)}`
                      : "—"}
                  </div>
                </div>
              </div>

              {/* Timestamps (existing fields) */}
              <div className="driver-timeline" style={{ marginBottom: 16 }}>
                <div className="driver-timeline-title">Timeline</div>
                <DetailRow label="Assigned" value={formatDateTime(delivery.assignedAt)} />
                <DetailRow label="Accepted" value={formatDateTime(delivery.acceptedAt)} />
                <DetailRow label="Started" value={formatDateTime(delivery.startedAt)} />
                <DetailRow label="Completed" value={formatDateTime(delivery.completedAt)} />
                {delivery.status === DELIVERY_STATUS.CANCELLED && (
                  <DetailRow
                    label="Rejected"
                    value={
                      delivery.rejectedAt
                        ? formatDateTime(delivery.rejectedAt)
                        : undefined
                    }
                  />
                )}
              </div>

              {/* POD (existing authorized query — assigned driver only) */}
              {pod === undefined ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 24 }}>
                  <Loader2 size={18} className="animate-spin" style={{ color: "#999" }} />
                </div>
              ) : pod === null ? (
                <div className="driver-timeline" style={{ marginBottom: 16 }}>
                  <div className="driver-timeline-title">
                    <PenLine size={13} style={{ display: "inline", marginRight: 6 }} />
                    Proof of delivery
                  </div>
                  <div className="driver-timeline-item">
                    <span className="driver-timeline-time">—</span>
                    <span className="driver-timeline-text">
                      No proof of delivery on record for this delivery.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="driver-timeline" style={{ marginBottom: 16 }}>
                  <div className="driver-timeline-title">
                    <PenLine size={13} style={{ display: "inline", marginRight: 6 }} />
                    Proof of delivery on record
                  </div>
                  <DetailRow label="Outcome" value={pod.outcome} />
                  <DetailRow label="Recipient" value={pod.recipientName} />
                  <DetailRow label="Submitted" value={formatDateTime(pod.createdAt)} />
                  {pod.deliveryNotes && (
                    <DetailRow label="Notes" value={pod.deliveryNotes} />
                  )}
                  {pod.files?.length > 0 && (
                    <DetailRow
                      label="Files"
                      value={`${pod.files.length} file(s) attached`}
                    />
                  )}
                </div>
              )}

              {/* Route history (tracking events) */}
              <div className="driver-timeline">
                <div className="driver-timeline-title">
                  <Clock size={13} style={{ display: "inline", marginRight: 6 }} />
                  Route history
                </div>
                {tracking.routeHistory && tracking.routeHistory.length > 0 ? (
                  tracking.routeHistory.slice(0, 20).map((e: any, i: number) => (
                    <div className="driver-timeline-item" key={e._id ?? i}>
                      <span className="driver-timeline-time">
                        {new Date(e.timestamp).toLocaleTimeString("en-ZA", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="driver-timeline-text">
                        {e.type.replace(/_/g, " ")}
                        {e.lat !== undefined && e.lng !== undefined
                          ? ` (${e.lat.toFixed(4)}, ${e.lng.toFixed(4)})`
                          : ""}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="driver-timeline-item">
                    <span className="driver-timeline-time">—</span>
                    <span className="driver-timeline-text">
                      No tracking events recorded.
                    </span>
                  </div>
                )}
              </div>

              {/* Package info from linked order (existing fields) */}
              {delivery.orderId && (
                <div className="driver-safety-note" style={{ marginTop: 14 }}>
                  <Package size={14} />
                  Delivery of record — reference {delivery.trackingNumber}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </DriverShell>
  );
}
