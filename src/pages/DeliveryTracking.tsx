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
  Navigation,
  Box,
  Calendar,
  Ruler,
  Copy,
  FileCheck2,
} from "lucide-react";
import { useState } from "react";
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
  const flow: Array<{ label: string; statuses: string[] }> = [
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

type StatusTone = "ok" | "active" | "warn" | "bad";

function statusCopy(status: string): { label: string; tone: StatusTone } {
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

function StatusBadge({ label, tone }: { label: string; tone: StatusTone }) {
  const toneClass = tone === "bad" ? "is-bad" : tone === "warn" ? "is-warn" : "";
  return (
    <div className={`track-status-badge ${toneClass}`}>
      <span className="track-status-dot" />
      {label}
    </div>
  );
}

function FreshnessChip({ state }: { state: ReturnType<typeof freshness> }) {
  return (
    <span className={`track-freshness ${state}`}>
      <Radio size={12} className={state === "live" ? "animate-pulse" : ""} />
      {freshnessLabel(state)}
    </span>
  );
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

  const W = 640;
  const H = 260;
  const pad = 56;
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
      <defs>
        <linearGradient id="trackRouteGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#0794B5" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#0A7C42" stopOpacity="0.9" />
        </linearGradient>
      </defs>
      {pickupXY && dropoffXY && (
        <line
          x1={pickupXY[0]} y1={pickupXY[1]}
          x2={dropoffXY[0]} y2={dropoffXY[1]}
          stroke="url(#trackRouteGrad)" strokeWidth={2.5} strokeLinecap="round"
        />
      )}
      {pickupXY && (
        <g>
          <circle cx={pickupXY[0]} cy={pickupXY[1]} r={13} fill="rgba(7,148,181,0.15)" />
          <circle cx={pickupXY[0]} cy={pickupXY[1]} r={7} fill="#0794B5" stroke="#fff" strokeWidth={2.5} />
          <text x={pickupXY[0] - 9} y={pickupXY[1] + 24} fontSize={11} fill="#667" fontWeight={600} textAnchor="start">PICKUP</text>
        </g>
      )}
      {dropoffXY && (
        <g>
          <circle cx={dropoffXY[0]} cy={dropoffXY[1]} r={13} fill="rgba(10,124,66,0.15)" />
          <circle cx={dropoffXY[0]} cy={dropoffXY[1]} r={7} fill="#0A7C42" stroke="#fff" strokeWidth={2.5} />
          <text x={dropoffXY[0] - 16} y={dropoffXY[1] + 24} fontSize={11} fill="#667" fontWeight={600} textAnchor="start">DROP-OFF</text>
        </g>
      )}
      {driverXY && (
        <g>
          <circle cx={driverXY[0]} cy={driverXY[1]} r={16} fill="rgba(245,158,11,0.18)">
            <animate attributeName="r" values="12;20;12" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.55;0.15;0.55" dur="2.4s" repeatCount="indefinite" />
          </circle>
          <circle cx={driverXY[0]} cy={driverXY[1]} r={7.5} fill="#F59E0B" stroke="#fff" strokeWidth={2.5} />
          <text x={driverXY[0] + 12} y={driverXY[1] - 8} fontSize={11} fill="#1f2937" fontWeight={700}>DRIVER</text>
        </g>
      )}
    </svg>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────────────────

function DetailRow({ label, value, icon, mono, muted }: { label: string; value: string; icon?: React.ReactNode; mono?: boolean; muted?: boolean }) {
  return (
    <div className="track-detail-row">
      <span className="track-detail-label">
        {icon}
        {label}
      </span>
      <span className={`track-detail-value ${mono ? "mono" : ""} ${muted ? "muted" : ""}`}>{value}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DeliveryTracking() {
  const { deliveryId } = useParams<{ deliveryId: string }>();
  const [copied, setCopied] = useState(false);

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

  // Sender identity for the shipment-details card: getDelivery's customer
  // branch already proves the session user IS the order's sender, so the
  // sender is always the viewer — no extra query needed.

  const handleCopy = () => {
    if (delivery?.trackingNumber) {
      navigator.clipboard.writeText(delivery.trackingNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Loading: queries still streaming (incl. the no-route-param case).
  if (delivery === undefined || tracking === undefined) {
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

  const timelineEvents = tracking.routeHistory
    .filter((e: any) => e.type !== "location_update")
    .slice(-10)
    .reverse();

  return (
    <CustomerShell activeItem="Track Delivery">
      <main className="track-main">
        <div className="track-container">
          {/* Page title */}
          <div className="track-page-title">
            <div>
              <span className="track-title-eyebrow">Live tracking</span>
              <h1 className="track-title">Delivery tracking</h1>
            </div>
            <FreshnessChip state={fr} />
          </div>

          {/* Hero header */}
          <div className="track-header-card">
            <div className="track-header-content">
              <div>
                <p className="track-header-label">Tracking shipment</p>
                <div className="track-header-id-row">
                  <h2 className="track-header-id">{delivery.trackingNumber}</h2>
                  <button className="track-copy-btn" onClick={handleCopy} title="Copy tracking ID" aria-label="Copy tracking ID">
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                </div>
              </div>
              <StatusBadge label={sc.label} tone={sc.tone} />
            </div>

            {/* Customer stepper */}
            <div className="track-stepper">
              {timeline.map((step, i) => (
                <div key={step.label} className={`track-step ${step.state}`}>
                  <div className="track-step-icon">
                    {step.state === "done" ? (
                      <CheckCircle2 size={34} />
                    ) : step.state === "active" ? (
                      <div className="track-step-active">
                        <Circle size={34} />
                        <div className="track-step-pulse" />
                      </div>
                    ) : (
                      <Circle size={34} />
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
            <div className="track-notice">
              <div className="track-notice-icon">
                <XCircle size={18} />
              </div>
              <div>
                <p className="track-notice-label">This delivery could not be completed</p>
                <p className="track-notice-time">
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
                  <div>
                    <h3 className="track-route-title">
                      <Navigation size={16} />
                      Live route
                    </h3>
                    <p className="track-card-sub">
                      {driverVisible ? "Driver position updates in real time" : "Route overview for this delivery"}
                    </p>
                  </div>
                  {!isTerminal && (
                    <FreshnessChip state={fr} />
                  )}
                </div>

                {(tracking.delivery.pickupLat != null || tracking.delivery.dropoffLat != null) && (
                  <div className="track-map-wrap">
                    <RouteMap
                      pickup={tracking.delivery.pickupLat != null ? { lat: tracking.delivery.pickupLat, lng: tracking.delivery.pickupLng } : null}
                      dropoff={tracking.delivery.dropoffLat != null ? { lat: tracking.delivery.dropoffLat, lng: tracking.delivery.dropoffLng } : null}
                      driver={driverVisible ? { lat: dl!.lat, lng: dl!.lng } : null}
                    />
                  </div>
                )}

                {/* Route summary — human-readable addresses resolved
                    server-side; coordinates are never shown to customers. */}
                <div className="track-route-visual">
                  <div className="track-route-point">
                    <div className="track-route-pin sender"><MapPin size={16} /></div>
                    <div>
                      <p className="track-route-point-label">Pickup</p>
                      <p className="track-route-name">Collection point</p>
                      <p className="track-route-street">
                        {delivery.details?.pickupAddress ?? "Address on file"}
                      </p>
                    </div>
                    <div className="track-route-dot-line">
                      <span className="track-route-dot" />
                      <span className="track-route-dash" />
                      <span className="track-route-dot" />
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <p className="track-route-point-label">Drop-off</p>
                      <p className="track-route-name">Destination</p>
                      <p className="track-route-street">
                        {delivery.details?.dropoffAddress ?? "Address on file"}
                      </p>
                    </div>
                    <div className="track-route-pin receiver"><MapPin size={16} /></div>
                  </div>
                </div>
              </div>

              {/* Shipment details — who/what/when, resolved server-side */}
              <div className="track-route-card">
                <div className="track-route-header">
                  <div>
                    <h3 className="track-route-title">
                      <Box size={16} />
                      Shipment details
                    </h3>
                    <p className="track-card-sub">What is moving, to whom, and how</p>
                  </div>
                </div>
                <div className="track-detail-list">
                  {delivery.details?.description && (
                    <DetailRow label="Order" value={delivery.details.description} icon={<Package size={13} />} />
                  )}
                  {delivery.details?.recipientName ? (
                    <DetailRow
                      label="Recipient"
                      icon={<User size={13} />}
                      value={
                        delivery.details.recipientPhone
                          ? `${delivery.details.recipientName} · ${delivery.details.recipientPhone}`
                          : delivery.details.recipientName
                      }
                    />
                  ) : (
                    <DetailRow label="Recipient" value="Not specified" icon={<User size={13} />} muted />
                  )}
                  <DetailRow label="Sender" value="You" icon={<User size={13} />} />
                  <DetailRow
                    label="Requested"
                    icon={<Calendar size={13} />}
                    value={
                      delivery.details?.scheduledTime
                        ? formatDateTime(delivery.details.scheduledTime)
                        : delivery.details?.createdAt
                          ? formatDateTime(delivery.details.createdAt)
                          : "—"
                    }
                    mono
                  />
                  {(delivery.details?.expeditionType || delivery.details?.parcelType) && (
                    <DetailRow
                      label="Service"
                      icon={<Clock size={13} />}
                      value={[
                        delivery.details?.expeditionType?.replace(/_/g, "-"),
                        delivery.details?.parcelType?.replace(/_/g, " "),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    />
                  )}
                  <DetailRow
                    label="Dimensions"
                    icon={<Ruler size={13} />}
                    value={
                      delivery.details?.width != null && delivery.details?.height != null
                        ? `${delivery.details.width} × ${delivery.details.height} cm${
                            delivery.details?.weight != null ? ` · ${delivery.details.weight} kg` : ""
                          }`
                        : delivery.details?.weight != null
                          ? `${delivery.details.weight} kg`
                          : "Not specified"
                    }
                    mono
                    muted={delivery.details?.width == null && delivery.details?.weight == null}
                  />
                </div>
              </div>

              {/* Timeline from real tracking events */}
              {timelineEvents.length > 0 && (
                <div className="track-route-card">
                  <div className="track-route-header">
                    <div>
                      <h3 className="track-route-title">
                        <Clock size={16} />
                        Delivery timeline
                      </h3>
                      <p className="track-card-sub">Recorded events from the tracking system</p>
                    </div>
                  </div>
                  <div className="track-timeline">
                    {timelineEvents.map((e: any, i: number) => (
                      <div key={i} className="track-timeline-item">
                        <div className="track-timeline-rail">
                          <span className="track-timeline-dot" />
                          <span className="track-timeline-line" />
                        </div>
                        <div className="track-timeline-body">
                          <span className="track-timeline-label">
                            {String(e.type ?? "event").replace(/_/g, " ")}
                          </span>
                          <span className="track-timeline-time">{formatDateTime(e.timestamp)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right column: status rail + driver + POD */}
            <div className="track-right-col">
              <div className="track-last-updated">
                <div className="track-updated-icon is-info"><Clock size={18} /></div>
                <div>
                  <p className="track-updated-label">Started</p>
                  <p className="track-updated-time">{delivery.startedAt ? formatDateTime(delivery.startedAt) : "Not started yet"}</p>
                </div>
              </div>

              {delivery.completedAt && (
                <div className="track-last-updated">
                  <div className={`track-updated-icon ${isFailed ? "is-bad" : ""}`}>
                    {isFailed ? <XCircle size={18} /> : <Check size={18} />}
                  </div>
                  <div>
                    <p className="track-updated-label">{isFailed ? "Closed" : "Completed"}</p>
                    <p className="track-updated-time">{formatDateTime(delivery.completedAt)}</p>
                  </div>
                </div>
              )}

              {/* Driver (customer-facing identity only) */}
              {delivery.courierId && !isFailed && (
                <div className="track-last-updated">
                  <div className="track-updated-icon is-info"><User size={18} /></div>
                  <div>
                    <p className="track-updated-label">Driver assigned</p>
                    <p className="track-updated-time">
                      Your driver is on this delivery
                      {dl?.lastUpdate ? ` · last update ${formatDateTime(dl.lastUpdate)}` : ""}
                    </p>
                  </div>
                </div>
              )}

              {/* POD after successful delivery — existing authorization applies */}
              {status === DELIVERY_STATUS.DELIVERED && (
                pod === undefined ? (
                  <div className="track-last-updated">
                    <div className="track-updated-icon is-neutral"><Loader2 size={18} className="animate-spin" /></div>
                    <div>
                      <p className="track-updated-label">Proof of delivery</p>
                      <p className="track-updated-time">Loading…</p>
                    </div>
                  </div>
                ) : pod === null ? (
                  <div className="track-last-updated">
                    <div className="track-updated-icon is-neutral"><Clock size={18} /></div>
                    <div>
                      <p className="track-updated-label">Proof of delivery</p>
                      <p className="track-updated-time">Not yet available</p>
                    </div>
                  </div>
                ) : (
                  <div className="track-last-updated">
                    <div className="track-updated-icon"><FileCheck2 size={18} /></div>
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
