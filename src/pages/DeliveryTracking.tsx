/**
 * Customer Delivery Tracking
 *
 * Live, customer-scoped view of one of the customer's own deliveries.
 *
 * Route: /deliveries/:deliveryId (see src/main.tsx, RoleGate CUSTOMER area)
 *
 * Backend contract — existing authorized queries only, no new backend:
 *   - deliveries.state_machine.getDelivery       → role-checked delivery access
 *     (customer must be the order's sender; server resolves identity)
 *   - tracking.queries.getDeliveryTracking       → customer-authorized live
 *     tracking (driver location while active, route history/timeline events)
 *   - pod.service.getPODForDelivery              → customer-authorized POD
 *     (canAccessPOD resolves ownership through the order server-side)
 *
 * All three queries authorize on the server. A manipulated :deliveryId cannot
 * expose another customer's delivery — the backend denies access.
 *
 * Customer/driver boundary: this page consumes state only. No driver
 * mutations (accept/reject, GPS updates, POD submission) or operational
 * mutations (dispatch, reassign, cancel, fail) are reachable from here.
 */

import { useParams, Link } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import CustomerShell from "@/components/shells/CustomerShell";
import { DELIVERY_STATUS } from "@/convex/schema";
import {
  Search,
  Copy,
  Check,
  MapPin,
  CheckCircle2,
  Circle,
  Loader2,
  Package,
  Radio,
  XCircle,
  Clock,
  User,
} from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/track-delivery.css";

// ─── Tracking freshness (backend MAX_STALENESS_MS from tracking/config.ts) ────

const STALENESS_MS = 60_000;

function freshness(lastUpdate: number | undefined | null): "live" | "recent" | "stale" | "none" {
  if (lastUpdate === undefined || lastUpdate === null) return "none";
  const age = Date.now() - lastUpdate;
  if (age < 10_000) return "live";
  if (age < STALENESS_MS) return "recent";
  return "stale";
}

function freshnessLabel(s: ReturnType<typeof freshness>): string {
  switch (s) {
    case "live":
      return "Live";
    case "recent":
      return "Recently updated";
    case "stale":
      return "Stale";
    default:
      return "Tracking unavailable";
  }
}

function formatDateTime(ts?: number | null): string {
  if (ts === undefined || ts === null) return "—";
  return new Date(ts).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Customer timeline (real state only — no fabricated milestones) ───────────

const ACTIVE_STATUSES: Record<string, string> = {
  [DELIVERY_STATUS.ASSIGNED]: "Driver assigned",
  [DELIVERY_STATUS.DRIVER_ACCEPTED]: "Driver accepted",
  [DELIVERY_STATUS.EN_ROUTE_TO_PICKUP]: "Heading to pickup",
  [DELIVERY_STATUS.AT_PICKUP]: "At pickup",
  [DELIVERY_STATUS.PICKED_UP]: "Package picked up",
  [DELIVERY_STATUS.IN_TRANSIT]: "On the way",
  [DELIVERY_STATUS.AT_DROPOFF]: "At destination",
};

function customerTimeline(status: string): Array<{ label: string; state: "done" | "active" | "pending" }> {
  const flow = [
    { label: "Delivery requested", statuses: [DELIVERY_STATUS.REQUESTED] },
    { label: "Dispatched", statuses: [DELIVERY_STATUS.PENDING_DISPATCH] },
    { label: "Driver assigned", statuses: [DELIVERY_STATUS.ASSIGNED] },
    { label: "Driver accepted", statuses: [DELIVERY_STATUS.DRIVER_ACCEPTED] },
    { label: "Heading to pickup", statuses: [DELIVERY_STATUS.EN_ROUTE_TO_PICKUP, DELIVERY_STATUS.AT_PICKUP] },
    { label: "Package picked up", statuses: [DELIVERY_STATUS.PICKED_UP] },
    { label: "On the way", statuses: [DELIVERY_STATUS.IN_TRANSIT] },
    { label: "At destination", statuses: [DELIVERY_STATUS.AT_DROPOFF] },
    { label: "Delivered", statuses: [DELIVERY_STATUS.DELIVERED] },
  ];

  // Exception states are not part of the linear flow.
  if (
    status === DELIVERY_STATUS.FAILED ||
    status === DELIVERY_STATUS.CANCELLED ||
    status === DELIVERY_STATUS.REASSIGNMENT_REQUIRED
  ) {
    return flow.map((m, i) => ({
      label: m.label,
      state: i === 0 ? ("done" as const) : ("pending" as const),
    }));
  }

  const idx = flow.findIndex((m) => m.statuses.includes(status));
  if (idx === -1) {
    return flow.map((m, i) => ({ label: m.label, state: i === 0 ? "done" : "pending" }));
  }

  return flow.map((m, i) => ({
    label: m.label,
    state: i < idx ? "done" : i === idx ? "active" : "pending",
  }));
}

// ─── Customer-safe status copy ────────────────────────────────────────────────

function statusCopy(status: string): { label: string; tone: "ok" | "active" | "warn" | "bad" } {
  switch (status) {
    case DELIVERY_STATUS.DELIVERED:
      return { label: "Delivered", tone: "ok" };
    case DELIVERY_STATUS.FAILED:
      return { label: "Delivery failed", tone: "bad" };
    case DELIVERY_STATUS.CANCELLED:
      return { label: "Delivery cancelled", tone: "bad" };
    case DELIVERY_STATUS.REASSIGNMENT_REQUIRED:
      return { label: "Being reassigned", tone: "warn" };
    case DELIVERY_STATUS.REQUESTED:
      return { label: "Delivery requested", tone: "active" };
    case DELIVERY_STATUS.PENDING_DISPATCH:
      return { label: "Preparing for dispatch", tone: "active" };
    default:
      return { label: ACTIVE_STATUSES[status] ?? status.replace(/_/g, " "), tone: "active" };
  }
}

// ─── Inline route mini-map (same pattern as the operations SVG map, scoped) ────

function RouteMap({
  pickup,
  dropoff,
  driver,
}: {
  pickup?: { lat?: number | null; lng?: number | null } | null;
  dropoff?: { lat?: number | null; lng?: number | null } | null;
  driver?: { lat?: number | null; lng?: number | null } | null;
}) {
  const points: Array<{ lat: number; lng: number; kind: "pickup" | "dropoff" | "driver" }> = [];
  if (pickup?.lat != null && pickup?.lng != null) points.push({ lat: pickup.lat, lng: pickup.lng, kind: "pickup" });
  if (dropoff?.lat != null && dropoff?.lng != null) points.push({ lat: dropoff.lat, lng: dropoff.lng, kind: "dropoff" });
  if (driver?.lat != null && driver?.lng != null) points.push({ lat: driver.lat, lng: driver.lng, kind: "driver" });

  if (points.length === 0) return null;

  const W = 320;
  const H = 180;
  const pad = 24;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = maxLat - minLat || 0.001;
  const lngSpan = maxLng - minLng || 0.001;

  const toXY = (lat: number, lng: number): [number, number] => [
    pad + ((lng - minLng) / lngSpan) * (W - pad * 2),
    H - pad - ((lat - minLat) / latSpan) * (H - pad * 2),
  ];

  const pickupXY = pickup?.lat != null && pickup?.lng != null ? toXY(pickup.lat, pickup.lng) : null;
  const dropoffXY = dropoff?.lat != null && dropoff?.lng != null ? toXY(dropoff.lat, dropoff.lng) : null;
  const driverXY = driver?.lat != null && driver?.lng != null ? toXY(driver.lat, driver.lng) : null;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="track-map-svg" role="img" aria-label="Delivery route map">
      {pickupXY && dropoffXY && (
        <line
          x1={pickupXY[0]} y1={pickupXY[1]}
          x2={dropoffXY[0]} y2={dropoffXY[1]}
          stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="4 4"
        />
      )}
      {pickupXY && (
        <g>
          <circle cx={pickupXY[0]} cy={pickupXY[1]} r={6} fill="#0794B5" stroke="#fff" strokeWidth={2} />
          <text x={pickupXY[0] + 9} y={pickupXY[1] + 4} fontSize={10} fill="#1f2937">Pickup</text>
        </g>
      )}
      {dropoffXY && (
        <g>
          <circle cx={dropoffXY[0]} cy={dropoffXY[1]} r={6} fill="#0A7C42" stroke="#fff" strokeWidth={2} />
          <text x={dropoffXY[0] + 9} y={dropoffXY[1] + 4} fontSize={10} fill="#1f2937">Destination</text>
        </g>
      )}
      {driverXY && (
        <g>
          <circle cx={driverXY[0]} cy={driverXY[1]} r={7} fill="#F59E0B" stroke="#fff" strokeWidth={2} />
          <text x={driverXY[0] + 10} y={driverXY[1] + 4} fontSize={10} fill="#1f2937" fontWeight={600}>Driver</text>
        </g>
      )}
    </svg>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DeliveryTracking() {
  const { deliveryId } = useParams<{ deliveryId: string }>();
  const [copied, setCopied] = [false, (_v: boolean) => {}];

  const delivery = useQuery(
    api.deliveries.state_machine.getDelivery,
    deliveryId ? { deliveryId: deliveryId as any } : "skip",
  );
  const tracking = useQuery(
    api.tracking.queries.getDeliveryTracking,
    deliveryId ? { deliveryId: deliveryId as any } : "skip",
  );
  const pod = useQuery(
    api.pod.service.getPODForDelivery,
    deliveryId ? { deliveryId: deliveryId as any } : "skip",
  );

  // Loading: route param present but queries still streaming.
  if (deliveryId && (delivery === undefined || tracking === undefined)) {
    return (
      <CustomerShell activeItem="Track Delivery">
        <div className="track-main">
          <div className="track-container">
            <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: "#999" }} />
            </div>
          </div>
        </div>
      </CustomerShell>
    );
  }

  // Not found / unauthorized. The backend throws for both cross-customer
  // access and missing deliveries; react-query surfaces them as rejected
  // subscriptions, which read as `null` here. Deliberately identical wording
  // so unauthorized probing learns nothing.
  if (delivery === null || tracking === null || deliveryId === undefined) {
    return (
      <CustomerShell activeItem="Track Delivery">
        <div className="track-main">
          <div className="track-container">
            <div className="empty-state" style={{ padding: 60 }}>
              <div className="empty-state-icon"><Package size={24} /></div>
              <div className="empty-state-title">Delivery not found</div>
              <div className="empty-state-desc">
                This delivery does not exist or you do not have access to it.
              </div>
              <Link className="track-search-btn" to="/dashboard" style={{ marginTop: 16, textDecoration: "none" }}>
                Back to dashboard
              </Link>
            </div>
          </div>
        </div>
      </CustomerShell>
    );
  }

  const status = delivery.status;
  const sc = statusCopy(status);
  const timeline = customerTimeline(status);
  const isTerminal = [DELIVERY_STATUS.DELIVERED, DELIVERY_STATUS.FAILED, DELIVERY_STATUS.CANCELLED].includes(status as any);
  const isFailed = status === DELIVERY_STATUS.FAILED || status === DELIVERY_STATUS.CANCELLED;

  // Tracking freshness — from the backend's isStale plus its timestamps.
  const dl = tracking.driverLocation;
  const fr = isTerminal
    ? ("none" as const)
    : freshness(dl?.lastUpdate ?? null);
  const driverVisible = !isTerminal && dl?.lat != null && dl?.lng != null;

  return (
    <CustomerShell activeItem="Track Delivery">
      <main className="track-main">
        <div className="track-container">
          {/* Header */}
          <div className="track-page-title">
            <h1 className="track-title">Delivery tracking</h1>
          </div>

          {/* Header card */}
          <div className="track-header-card">
            <div className="track-header-content">
              <div>
                <p className="track-header-label">Tracking shipment</p>
                <div className="track-header-id-row">
                  <h2 className="track-header-id">{delivery.trackingNumber}</h2>
                </div>
              </div>
              <div className="track-status-badge">
                <span className="track-status-dot" />
                {sc.label}
              </div>
            </div>

            {/* Customer stepper */}
            <div className="track-stepper">
              {timeline.map((step, i) => (
                <div key={step.label} className={`track-step ${step.state}`}>
                  <div className="track-step-icon">
                    {step.state === "done" ? (
                      <CheckCircle2 size={28} />
                    ) : step.state === "active" ? (
                      <div className="track-step-active">
                        <Circle size={28} />
                        <div className="track-step-pulse" />
                      </div>
                    ) : (
                      <Circle size={28} />
                    )}
                  </div>
                  <p className="track-step-label">{step.label}</p>
                  {i < timeline.length - 1 && (
                    <div className={`track-step-line ${step.state === "done" ? "completed" : ""}`} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Failed / cancelled customer-safe notice */}
          {isFailed && (
            <div className="track-last-updated" style={{ borderLeft: "3px solid #C62828" }}>
              <div className="track-updated-icon" style={{ background: "#C62828" }}>
                <XCircle size={18} />
              </div>
              <div>
                <p className="track-updated-label">This delivery could not be completed</p>
                <p className="track-updated-time">
                  {delivery.completedAt ? formatDateTime(delivery.completedAt) : "—"}
                  {" · "}Please contact support for assistance.
                </p>
              </div>
            </div>
          )}

          {/* Content grid */}
          <div className="track-content-grid">
            {/* Left column: route + map + timeline */}
            <div className="track-left-col">
              {/* Live route map — customer's own delivery only */}
              <div className="track-route-card">
                <div className="track-route-header">
                  <h3 className="track-route-title">Live route</h3>
                  {!isTerminal && (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        fontSize: 12,
                        color: fr === "live" ? "#0A7C42" : fr === "stale" ? "#C62828" : "#666",
                      }}
                    >
                      <Radio size={12} className={fr === "live" ? "animate-pulse" : ""} />
                      {freshnessLabel(fr)}
                      {dl?.lastUpdate ? ` · ${formatDateTime(dl.lastUpdate)}` : ""}
                    </span>
                  )}
                </div>

                <RouteMap
                  pickup={tracking.delivery.pickupLat != null ? { lat: tracking.delivery.pickupLat, lng: tracking.delivery.pickupLng } : null}
                  dropoff={tracking.delivery.dropoffLat != null ? { lat: tracking.delivery.dropoffLat, lng: tracking.delivery.dropoffLng } : null}
                  driver={driverVisible ? { lat: dl!.lat, lng: dl!.lng } : null}
                />

                {/* Route summary */}
                <div className="track-route-visual">
                  <div className="track-route-point">
                    <div className="track-route-pin sender"><MapPin size={16} /></div>
                    <div>
                      <p className="track-route-point-label">Pickup</p>
                      <p className="track-route-street">
                        {tracking.delivery.pickupLat != null
                          ? `${tracking.delivery.pickupLat.toFixed(4)}, ${tracking.delivery.pickupLng?.toFixed(4)}`
                          : "Pending coordinates"}
                      </p>
                    </div>
                    <div className="track-route-dot-line">
                      <span className="track-route-dot" />
                      <span className="track-route-dash" />
                      <span className="track-route-dot" />
                    </div>
                    <div>
                      <p className="track-route-point-label">Drop-off</p>
                      <p className="track-route-street">
                        {tracking.delivery.dropoffLat != null
                          ? `${tracking.delivery.dropoffLat.toFixed(4)}, ${tracking.delivery.dropoffLng?.toFixed(4)}`
                          : "Pending coordinates"}
                      </p>
                    </div>
                    <div className="track-route-pin receiver"><MapPin size={16} /></div>
                  </div>
                </div>
              </div>

              {/* Driver (customer-facing identity only) */}
              {delivery.courierId && !isFailed && (
                <div className="track-last-updated">
                  <div className="track-updated-icon"><User size={18} /></div>
                  <div>
                    <p className="track-updated-label">Driver assigned</p>
                    <p className="track-updated-time">
                      Your driver is on this delivery
                      {dl?.lastUpdate ? ` · last location update ${formatDateTime(dl.lastUpdate)}` : ""}
                    </p>
                  </div>
                </div>
              )}

              {/* Timeline from real tracking events */}
              {tracking.routeHistory.length > 0 && (
                <div className="track-route-card">
                  <div className="track-route-header">
                    <h3 className="track-route-title">Delivery timeline</h3>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {tracking.routeHistory
                      .filter((e: any) => e.type !== "location_update")
                      .slice(-10)
                      .reverse()
                      .map((e: any, i: number) => (
                        <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: "#333", minWidth: 130 }}>
                            {String(e.type ?? "").replace(/_/g, " ")}
                          </span>
                          <span style={{ fontSize: 12, color: "#888" }}>{formatDateTime(e.timestamp)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right column: timestamps + POD */}
            <div className="track-right-col">
              <div className="track-last-updated">
                <div className="track-updated-icon"><Clock size={18} /></div>
                <div>
                  <p className="track-updated-label">Started</p>
                  <p className="track-updated-time">{delivery.startedAt ? formatDateTime(delivery.startedAt) : "Not started yet"}</p>
                </div>
              </div>

              {delivery.completedAt && (
                <div className="track-last-updated">
                  <div className="track-updated-icon" style={{ background: isFailed ? "#C62828" : "#0A7C42" }}>
                    {isFailed ? <XCircle size={18} /> : <Check size={18} />}
                  </div>
                  <div>
                    <p className="track-updated-label">{isFailed ? "Closed" : "Completed"}</p>
                    <p className="track-updated-time">{formatDateTime(delivery.completedAt)}</p>
                  </div>
                </div>
              )}

              {/* POD after successful delivery — existing authorization applies */}
              {status === DELIVERY_STATUS.DELIVERED && (
                pod === undefined ? (
                  <div className="track-last-updated">
                    <div className="track-updated-icon"><Loader2 size={18} className="animate-spin" /></div>
                    <div>
                      <p className="track-updated-label">Proof of delivery</p>
                      <p className="track-updated-time">Loading…</p>
                    </div>
                  </div>
                ) : pod === null ? (
                  <div className="track-last-updated">
                    <div className="track-updated-icon"><Clock size={18} /></div>
                    <div>
                      <p className="track-updated-label">Proof of delivery</p>
                      <p className="track-updated-time">Not yet available</p>
                    </div>
                  </div>
                ) : (
                  <div className="track-last-updated">
                    <div className="track-updated-icon" style={{ background: "#0A7C42" }}>
                      <CheckCircle2 size={18} />
                    </div>
                    <div>
                      <p className="track-updated-label">Proof of delivery</p>
                      <p className="track-updated-time">
                        {pod.outcome === "delivered" ? "Delivered" : pod.outcome}
                        {pod.recipientName ? ` · Received by ${pod.recipientName}` : ""}
                        {" · "}
                        {formatDateTime(pod.deliveredAt)}
                        {pod.files && pod.files.length > 0 ? ` · ${pod.files.length} evidence file(s) on file` : ""}
                      </p>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      </main>
    </CustomerShell>
  );
}
