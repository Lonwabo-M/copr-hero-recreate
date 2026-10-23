/**
 * Customer Tracking — tracking-number lookup.
 *
 * Route: /track-delivery (see src/main.tsx, RoleGate CUSTOMER area)
 *
 * Backend contract — the entitlement-scoped lookup query:
 *   - deliveries.state_machine.getDeliveryByTracking → authenticated lookup
 *     (the caller must own the order, be its assigned courier, or be staff)
 *     with server-resolved display details, milestone timestamps, and the
 *     milestone-adjacent event timeline (location blips excluded).
 *
 * UI parity: this page renders the exact same composition as the
 * activity-centre detail page (/deliveries/:deliveryId) — shared cyan
 * header tile + stepper, freshness chip, live-route card, shipment details,
 * and the Started/Completed/Driver side cards. The recorded-event timeline
 * card is intentionally omitted here (per design direction) and only the
 * two features the public lookup cannot provide are absent: the driver's
 * live map blip (position is only visible to the customer's own session)
 * and proof-of-delivery (authorization-scoped). No duplicate UI system.
 */

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import CustomerShell from "@/components/shells/CustomerShell";
import {
  TrackingHeader,
  RouteMap,
  FreshnessChip,
  freshness,
  statusCopy,
  buildSteps,
  formatEventTime,
} from "@/components/tracking/TrackingProgress";
import {
  Search,
  Copy,
  Check,
  MapPin,
  Navigation,
  Loader2,
  Package,
  User,
  Calendar,
  Clock,
  Ruler,
  Box,
  XCircle,
} from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/track-delivery.css";

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

/** Delivery-fee display in rands (prices are stored in cents). */
function formatRands(cents: number): string {
  return `R ${(cents / 100).toFixed(2)}`;
}

export default function TrackDelivery() {
  const [trackingInput, setTrackingInput] = useState("");
  const [searchedTracking, setSearchedTracking] = useState("");
  const [copied, setCopied] = useState(false);

  const trackingResult = useQuery(
    api.deliveries.state_machine.getDeliveryByTracking,
    searchedTracking ? { trackingNumber: searchedTracking } : "skip"
  );

  const handleTrack = () => {
    const upper = trackingInput.toUpperCase().trim();
    if (upper) {
      setSearchedTracking(upper);
    }
  };

  const handleCopy = () => {
    if (trackingResult) {
      navigator.clipboard.writeText(trackingResult.trackingNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const sc = trackingResult ? statusCopy(trackingResult.status) : null;
  const milestones = trackingResult?.milestones ?? null;
  const steps = trackingResult && milestones
    ? buildSteps(trackingResult.status, milestones, trackingResult.details?.scheduledTime ?? trackingResult.estimatedArrival)
    : [];
  const expectedTs = trackingResult
    ? trackingResult.details?.scheduledTime ?? trackingResult.estimatedArrival ?? null
    : null;

  // Freshness mirrors the activity-centre page: for an active (non-terminal)
  // delivery the tracking chip reflects the delivery's own last-activity
  // signal — here the most recent recorded event; terminal deliveries read
  // "Tracking unavailable" the same way the detail page's terminal branch does.
  const timeline: Array<{ type: string; timestamp: number }> = trackingResult?.timeline ?? [];
  const lastEventTs = timeline.length > 0 ? timeline[timeline.length - 1].timestamp : null;
  const isTerminal =
    trackingResult != null &&
    ["delivered", "failed", "cancelled"].includes(trackingResult.status);
  const fr = trackingResult ? (isTerminal ? ("none" as const) : freshness(lastEventTs)) : ("none" as const);
  const isFailed = trackingResult?.status === "failed" || trackingResult?.status === "cancelled";

  return (
    <CustomerShell activeItem="Track Delivery">
      <main className="track-main">
        <div className="track-container">
          {/* Page title */}
          <div className="track-page-title">
            <h1 className="track-title">Delivery Tracking</h1>
            {trackingResult && <FreshnessChip state={fr} />}
          </div>

          {/* Search bar */}
          <div className="track-search-bar">
            <Search className="track-search-icon" size={18} />
            <input
              type="text"
              className="track-search-input"
              placeholder="Enter tracking number (e.g., LSH-...)"
              value={trackingInput}
              onChange={(e) => setTrackingInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleTrack()}
            />
            <button className="track-search-btn" onClick={handleTrack}>
              Track
            </button>
          </div>

          {searchedTracking && trackingResult === undefined && (
            <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: "#999" }} />
            </div>
          )}

          {searchedTracking && trackingResult === null && (
            <div className="empty-state" style={{ padding: 60 }}>
              <div className="empty-state-icon"><Package size={24} /></div>
              <div className="empty-state-title">Delivery not found</div>
              <div className="empty-state-desc">No delivery found with tracking number "{searchedTracking}". Please check and try again.</div>
            </div>
          )}

          {trackingResult && milestones && sc && (
            <>
              {/* Shared header tile — identical to the activity-centre view */}
              <TrackingHeader
                trackingNumber={trackingResult.trackingNumber}
                status={trackingResult.status}
                steps={steps}
                onCopy={handleCopy}
                copied={copied}
              />

              {/* Failed / cancelled customer-safe notice — same as detail page */}
              {isFailed && (
                <div className="track-notice">
                  <div className="track-notice-icon">
                    <XCircle size={18} />
                  </div>
                  <div>
                    <p className="track-notice-label">This delivery could not be completed</p>
                    <p className="track-notice-time">
                      {trackingResult.completedAt ? formatEventTime(trackingResult.completedAt) : "—"}
                      {" · "}Please contact support for assistance.
                    </p>
                  </div>
                  </div>
              )}

              {/* Content grid */}
              <div className="track-content-grid">
                {/* Left column — mirrors the activity-centre page card-for-card */}
                <div className="track-left-col">
                  {/* Route card */}
                  <div className="track-route-card">
                    <div className="track-route-header">
                      <div>
                        <h3 className="track-route-title">
                          <Navigation size={16} />
                          Live route
                        </h3>
                        <p className="track-card-sub">
                          {expectedTs ? `Expected delivery: ${formatEventTime(expectedTs)}` : "Route overview for this delivery"}
                        </p>
                      </div>
                      {!isTerminal && <FreshnessChip state={fr} />}
                    </div>

                    {(trackingResult.pickupLat != null || trackingResult.dropoffLat != null) && (
                      <div className="track-map-wrap">
                        <RouteMap
                          pickup={
                            trackingResult.pickupLat != null
                              ? { lat: trackingResult.pickupLat, lng: trackingResult.pickupLng }
                              : null
                          }
                          dropoff={
                            trackingResult.dropoffLat != null
                              ? { lat: trackingResult.dropoffLat, lng: trackingResult.dropoffLng }
                              : null
                          }
                        />
                      </div>
                    )}

                    {/* Route strip — server-resolved addresses */}
                    <div className="track-route-visual">
                      <div className="track-route-point">
                        <div className="track-route-pin sender">
                          <MapPin size={16} />
                        </div>
                        <div>
                          <p className="track-route-point-label">Pickup</p>
                          <p className="track-route-name">Collection point</p>
                          <p className="track-route-street">
                            {trackingResult.details?.pickupAddress ?? "Address on file"}
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
                            {trackingResult.details?.dropoffAddress ?? "Address on file"}
                          </p>
                        </div>
                        <div className="track-route-pin receiver">
                          <MapPin size={16} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Shipment details — same card as the activity-centre page */}
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
                      {trackingResult.details?.description && (
                        <DetailRow label="Order" value={trackingResult.details.description} icon={<Package size={13} />} />
                      )}
                      {trackingResult.details?.businessName && (
                        <DetailRow label="Business" value={trackingResult.details.businessName} icon={<User size={13} />} />
                      )}
                      {trackingResult.details?.recipientName ? (
                        <DetailRow
                          label="Recipient"
                          icon={<User size={13} />}
                          value={
                            trackingResult.details.recipientPhone
                              ? `${trackingResult.details.recipientName} · ${trackingResult.details.recipientPhone}`
                              : trackingResult.details.recipientName
                          }
                        />
                      ) : (
                        <DetailRow label="Recipient" value="Not specified" icon={<User size={13} />} muted />
                      )}
                      <DetailRow
                        label="Requested"
                        icon={<Calendar size={13} />}
                        value={formatEventTime(
                          trackingResult.details?.scheduledTime ?? trackingResult.details?.createdAt,
                        )}
                        mono
                      />
                      {(trackingResult.details?.expeditionType || trackingResult.details?.parcelType) && (
                        <DetailRow
                          label="Service"
                          icon={<Clock size={13} />}
                          value={[
                            trackingResult.details.expeditionType?.replace(/_/g, "-"),
                            trackingResult.details.parcelType?.replace(/_/g, " "),
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        />
                      )}
                      <DetailRow
                        label="Dimensions"
                        icon={<Ruler size={13} />}
                        value={
                          trackingResult.details?.width != null && trackingResult.details?.height != null
                            ? `${trackingResult.details.width} × ${trackingResult.details.height} cm${
                                trackingResult.details?.weight != null ? ` · ${trackingResult.details.weight} kg` : ""
                              }`
                            : trackingResult.details?.weight != null
                              ? `${trackingResult.details.weight} kg`
                              : "Not specified"
                        }
                        mono
                        muted={trackingResult.details?.width == null && trackingResult.details?.weight == null}
                      />
                      {trackingResult.details?.price != null && trackingResult.details.price > 0 && (
                        <DetailRow
                          label="Delivery fee"
                          value={formatRands(trackingResult.details.price)}
                          mono
                        />
                      )}
                    </div>
                  </div>

                </div>

                {/* Right column — Started / Completed / Driver cards */}
                <div className="track-right-col">
                  <div className="track-last-updated">
                    <div className="track-updated-icon is-info"><Clock size={18} /></div>
                    <div>
                      <p className="track-updated-label">Started</p>
                      <p className="track-updated-time">{trackingResult.startedAt ? formatEventTime(trackingResult.startedAt) : "Not started yet"}</p>
                    </div>
                  </div>

                  {trackingResult.completedAt && (
                    <div className="track-last-updated">
                      <div className={`track-updated-icon ${isFailed ? "is-bad" : ""}`}>
                        {isFailed ? <XCircle size={18} /> : <Check size={18} />}
                      </div>
                      <div>
                        <p className="track-updated-label">{isFailed ? "Closed" : "Completed"}</p>
                        <p className="track-updated-time">{formatEventTime(trackingResult.completedAt)}</p>
                      </div>
                    </div>
                  )}

                  {trackingResult.courierId && !isFailed && (
                    <div className="track-last-updated">
                      <div className="track-updated-icon is-info"><User size={18} /></div>
                      <div>
                        <p className="track-updated-label">Driver assigned</p>
                        <p className="track-updated-time">Your driver is on this delivery</p>
                      </div>
                    </div>
                  )}

                  {/* Delivered — delivered confirmation mirrors the POD row
                      (evidence itself is session-authorized, lookup page is public) */}
                  {trackingResult.status === "delivered" && (
                    <div className="track-last-updated">
                      <div className="track-updated-icon"><Check size={18} /></div>
                      <div>
                        <p className="track-updated-label">Proof of delivery</p>
                        <p className="track-updated-time">
                          Delivered{" · "}{formatEventTime(trackingResult.completedAt)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
    </CustomerShell>
  );
}
