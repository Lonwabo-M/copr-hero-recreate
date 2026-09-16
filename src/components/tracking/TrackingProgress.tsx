/**
 * Shared customer tracking visuals.
 *
 * Both tracking entry points — `/track-delivery` (tracking-number lookup) and
 * `/deliveries/:deliveryId` (activity-centre detail) — render the exact same
 * header tile: cyan summary bar ("Tracking shipment" + ID + status pill) over
 * a white four-step progress stepper.
 *
 * Stepper anatomy (matched to the approved reference):
 *   done    → solid cyan circle with a white tick
 *   active  → white circle, cyan ring, solid cyan core dot
 *   pending → white circle, pale ring only
 *   line    → soft teal behind progress, pale grey ahead of it; each segment
 *             is drawn from the previous node's edge to this node's edge so
 *             lines never touch or overlap the circles.
 *
 * Milestones are derived from real tracking events only — a step with no
 * recorded event stays pending. No timestamps are fabricated.
 */

import { Check, Copy } from "lucide-react";
import { DELIVERY_STATUS, TRACKING_EVENT_TYPES } from "@/convex/schema";

// ─── Status copy (shared so both pages label states identically) ─────────────

export type StatusTone = "ok" | "active" | "warn" | "bad";

export function statusCopy(status: string): { label: string; tone: StatusTone } {
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
      return { label: humanStatus(status), tone: "active" };
  }
}

function humanStatus(status: string): string {
  switch (status) {
    case DELIVERY_STATUS.ASSIGNED:
      return "Driver assigned";
    case DELIVERY_STATUS.DRIVER_ACCEPTED:
      return "Driver accepted";
    case DELIVERY_STATUS.EN_ROUTE_TO_PICKUP:
      return "Heading to pickup";
    case DELIVERY_STATUS.AT_PICKUP:
      return "At pickup";
    case DELIVERY_STATUS.PICKED_UP:
      return "Package picked up";
    case DELIVERY_STATUS.IN_TRANSIT:
      return "In transit";
    case DELIVERY_STATUS.AT_DROPOFF:
      return "At destination";
    default:
      return status.replace(/_/g, " ");
  }
}

// ─── Deterministic time formatting (no Intl — bun/browser ICU differ) ─────────

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatEventTime(ts: number | null | undefined): string {
  if (ts === null || ts === undefined) return "—";
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${MONTHS_SHORT[d.getMonth()]}, ${hh}:${mm}`;
}

export function formatEventDate(ts: number | null | undefined): string {
  if (ts === null || ts === undefined) return "—";
  const d = new Date(ts);
  const day = String(d.getDate()).padStart(2, "0");
  return `${day} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── Milestone derivation ─────────────────────────────────────────────────────

export interface Milestones {
  placed: number | null;
  pickedUp: number | null;
  inTransit: number | null;
  delivered: number | null;
}

export interface TrackingEventLite {
  type: string;
  timestamp: number;
  metadata?: string | null;
}

/** Latest timestamp of a given event type, or null when never recorded. */
export function latestEventTime(events: TrackingEventLite[], type: string): number | null {
  const matches = events.filter((e) => e.type === type);
  return matches.length > 0 ? matches[matches.length - 1].timestamp : null;
}

/**
 * Several state transitions reuse the "picked_up" event type (dispatch,
 * accept, en-route, at-pickup); the actual pickup milestone is the one whose
 * metadata records toStatus = PICKED_UP.
 */
export function isPickupMilestoneEvent(event: TrackingEventLite): boolean {
  try {
    return JSON.parse(event.metadata ?? "{}").toStatus === DELIVERY_STATUS.PICKED_UP;
  } catch {
    return false;
  }
}

export function milestonesFromEvents(events: TrackingEventLite[]): Milestones {
  const pickups = events.filter(
    (e) => e.type === TRACKING_EVENT_TYPES.PICKED_UP && isPickupMilestoneEvent(e),
  );
  return {
    placed: latestEventTime(events, TRACKING_EVENT_TYPES.ORDER_PLACED),
    pickedUp: pickups.length > 0 ? pickups[pickups.length - 1].timestamp : null,
    inTransit: latestEventTime(events, TRACKING_EVENT_TYPES.IN_TRANSIT),
    delivered: latestEventTime(events, TRACKING_EVENT_TYPES.DELIVERED),
  };
}

// ─── Step model ───────────────────────────────────────────────────────────────

export interface TrackStepVM {
  key: string;
  label: string;
  state: "done" | "active" | "pending";
  time: string;
}

/**
 * The four reference steps: Order placed → Picked up → In transit → Delivered.
 *
 * - Delivered expected date comes from the order's scheduled time (or its
 *   estimate) — shown as "Expected <date>" until the delivered event lands.
 * - The active step is the first incomplete one; when a milestone timestamp
 *   exists the step shows its real recorded time, the current step reads
 *   "Currently here", pending steps read "Pending".
 */
export function buildSteps(
  status: string,
  m: Milestones,
  expectedTs: number | null | undefined,
): TrackStepVM[] {
  // Exception states (failed/cancelled/reassignment) keep completed steps
  // factual and never mark Delivered as done.
  const deliveredDone = m.delivered !== null;
  const inTransitDone = m.inTransit !== null && !deliveredDone;
  const pickedUpDone = m.pickedUp !== null;
  const placedDone = m.placed !== null || status === DELIVERY_STATUS.REQUESTED;

  const raw: Array<{ key: string; label: string; done: boolean; ts: number | null; activeLabel?: string }> = [
    { key: "placed", label: "Order placed", done: placedDone, ts: m.placed },
    { key: "picked-up", label: "Picked up", done: pickedUpDone, ts: m.pickedUp },
    { key: "in-transit", label: "In transit", done: inTransitDone, ts: m.inTransit, activeLabel: "Currently here" },
    {
      key: "delivered",
      label: "Delivered",
      done: deliveredDone,
      ts: m.delivered,
      activeLabel: expectedTs ? `Expected ${formatEventDate(expectedTs)}` : "Expected shortly",
    },
  ];

  const firstIncomplete = raw.findIndex((s) => !s.done);

  return raw.map((s, i) => {
    let state: TrackStepVM["state"];
    if (s.done) state = "done";
    else if (i === firstIncomplete) state = "active";
    else state = "pending";

    let time: string;
    if (state === "done") time = formatEventTime(s.ts);
    else if (state === "active") time = s.activeLabel ?? "Pending";
    else time = s.activeLabel ?? "Pending";

    return { key: s.key, label: s.label, state, time };
  });
}

// ─── Status pill (glass, on the cyan bar) ─────────────────────────────────────

export function StatusPill({ label, tone }: { label: string; tone: StatusTone }) {
  return (
    <div className={`track-status-pill is-${tone}`}>
      <span className="track-status-pill-dot" />
      {label}
    </div>
  );
}

// ─── The header tile ──────────────────────────────────────────────────────────

export function TrackingHeader({
  trackingNumber,
  status,
  steps,
  onCopy,
  copied,
}: {
  trackingNumber: string;
  status: string;
  steps: TrackStepVM[];
  onCopy: () => void;
  copied: boolean;
}) {
  const sc = statusCopy(status);
  return (
    <div className="track-header-card">
      {/* Cyan summary bar */}
      <div className="track-header-bar">
        <div>
          <p className="track-header-label">Tracking shipment</p>
          <div className="track-header-id-row">
            <h2 className="track-header-id">{trackingNumber}</h2>
            <button className="track-copy-btn" onClick={onCopy} title="Copy tracking ID" aria-label="Copy tracking ID">
              {copied ? <Check size={14} strokeWidth={2.5} /> : <Copy size={14} strokeWidth={2} />}
            </button>
          </div>
        </div>
        <StatusPill label={sc.label} tone={sc.tone} />
      </div>

      {/* White stepper panel */}
      <div className="track-stepper-panel">
        <ol className="track-stepper">
          {steps.map((step, i) => (
            <li key={step.key} className={`track-step is-${step.state}`}>
              <div className="track-step-top">
                {/* connecting segment — drawn left of this node, from the
                    previous node's edge, so it never overlaps a circle */}
                {i > 0 && <span className="track-step-line" aria-hidden="true" />}
                <span className="track-step-node">
                  {step.state === "done" ? (
                    <Check size={13} strokeWidth={3} className="track-step-tick" />
                  ) : step.state === "active" ? (
                    <span className="track-step-core" />
                  ) : null}
                </span>
              </div>
              <div className="track-step-text">
                <p className="track-step-label">{step.label}</p>
                <p className="track-step-time">{step.time}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ─── Inline route mini-map (customer's own delivery only) ─────────────────────

export function RouteMap({
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
