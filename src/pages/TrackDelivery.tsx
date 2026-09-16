import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import CustomerShell from "@/components/shells/CustomerShell";
import {
  TrackingHeader,
  RouteMap,
  statusCopy,
  buildSteps,
  milestonesFromEvents,
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
  Phone,
  Calendar,
  Clock,
  Ruler,
  FileText,
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

  return (
    <CustomerShell activeItem="Track Delivery">
      <main className="track-main">
        <div className="track-container">
          {/* Page title */}
          <div className="track-page-title">
            <h1 className="track-title">Delivery Tracking</h1>
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

              {/* Content grid */}
              <div className="track-content-grid">
                {/* Left column */}
                <div className="track-left-col">
                  {/* Route card */}
                  <div className="track-route-card">
                    <div className="track-route-header">
                      <div>
                        <h3 className="track-route-title">
                          <Navigation size={16} />
                          Shipment route
                        </h3>
                        {expectedTs && (
                          <p className="track-route-estimate">
                            Expected delivery: {formatEventTime(expectedTs)}
                          </p>
                        )}
                      </div>
                      {sc.tone === "active" && trackingResult.status !== "delivered" && (
                        <span className="track-freshness recent"><Phone size={12} />{sc.label}</span>
                      )}
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
                </div>

                {/* Right column */}
                <div className="track-right-col">
                  {/* Shipment details — resolved server-side from the order */}
                  <div className="track-route-card" style={{ padding: "22px 24px" }}>
                    <h3 className="track-route-title" style={{ marginBottom: 10 }}>
                      <FileText size={16} />
                      Shipment details
                    </h3>
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

                  {/* Last updated */}
                  {trackingResult.completedAt && (
                    <div className="track-last-updated">
                      <div className="track-updated-icon">
                        <Check size={18} />
                      </div>
                      <div>
                        <p className="track-updated-label">Completed</p>
                        <p className="track-updated-time">{formatEventTime(trackingResult.completedAt)}</p>
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
