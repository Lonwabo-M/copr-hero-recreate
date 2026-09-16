import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import CustomerShell from "@/components/shells/CustomerShell";
import {
  Search,
  Copy,
  Check,
  MapPin,
  CheckCircle2,
  Circle,
  Loader2,
  Package,
} from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/track-delivery.css";

interface TrackingStep {
  label: string;
  time: string;
  status: "completed" | "active" | "pending";
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13 }}>
      <span style={{ color: "#888", flexShrink: 0 }}>{label}</span>
      <span style={{ color: "#1f2937", fontWeight: 500, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function getTrackingSteps(status: string): TrackingStep[] {
  const statusOrder = [
    "requested",
    "pending_dispatch",
    "assigned",
    "driver_accepted",
    "en_route_to_pickup",
    "at_pickup",
    "picked_up",
    "in_transit",
    "at_dropoff",
    "delivered",
  ];

  const currentIndex = statusOrder.indexOf(status);
  if (currentIndex === -1) {
    return [{ label: "Order placed", time: "Unknown", status: "active" }];
  }

  return [
    { label: "Order placed", time: currentIndex >= 0 ? "Completed" : "Pending", status: currentIndex >= 0 ? "completed" : "pending" },
    { label: "Dispatched", time: currentIndex >= 1 ? "Completed" : "Pending", status: currentIndex >= 1 ? "completed" : "pending" },
    { label: "Driver assigned", time: currentIndex >= 3 ? "Completed" : "Pending", status: currentIndex >= 3 ? "completed" : "pending" },
    { label: "Picked up", time: currentIndex >= 6 ? "Completed" : "Pending", status: currentIndex >= 6 ? "completed" : "pending" },
    { label: "In transit", time: currentIndex === 7 ? "Currently here" : currentIndex > 7 ? "Completed" : "Pending", status: currentIndex === 7 ? "active" : currentIndex > 7 ? "completed" : "pending" },
    { label: "Delivered", time: currentIndex >= 9 ? "Completed" : "Expected", status: currentIndex >= 9 ? "completed" : "pending" },
  ];
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

  const steps = trackingResult ? getTrackingSteps(trackingResult.status) : [];

  return (
    <CustomerShell activeItem="Track Delivery">
      {/* Main content */}
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

          {trackingResult && (
            <>
              {/* Tracking header card */}
              <div className="track-header-card">
                <div className="track-header-content">
                  <div>
                    <p className="track-header-label">Tracking shipment</p>
                    <div className="track-header-id-row">
                      <h2 className="track-header-id">{trackingResult.trackingNumber}</h2>
                      <button className="track-copy-btn" onClick={handleCopy} title="Copy tracking ID">
                        {copied ? <Check size={16} /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>
                  <div className="track-status-badge">
                    <span className="track-status-dot" />
                    {trackingResult.status.replace(/_/g, " ")}
                  </div>
                </div>

                {/* Progress stepper */}
                <div className="track-stepper">
                  {steps.map((step, i) => (
                    <div key={step.label} className={`track-step ${step.status}`}>
                      <div className="track-step-icon">
                        {step.status === "completed" ? (
                          <CheckCircle2 size={28} />
                        ) : step.status === "active" ? (
                          <div className="track-step-active">
                            <Circle size={28} />
                            <div className="track-step-pulse" />
                          </div>
                        ) : (
                          <Circle size={28} />
                        )}
                      </div>
                      <p className="track-step-label">{step.label}</p>
                      <p className="track-step-time">{step.time}</p>
                      {i < steps.length - 1 && (
                        <div
                          className={`track-step-line ${
                            step.status === "completed" ? "completed" : ""
                          }`}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Content grid */}
              <div className="track-content-grid">
                {/* Left column */}
                <div className="track-left-col">
                  {/* Shipment route card */}
                  <div className="track-route-card">
                    <div className="track-route-header">
                      <div>
                        <h3 className="track-route-title">Shipment route</h3>
                        {trackingResult.estimatedArrival && (
                          <p className="track-route-estimate">
                            Estimated arrival: {new Date(trackingResult.estimatedArrival).toLocaleDateString("en-ZA")}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Route visualization */}
                    <div className="track-route-visual">
                      <div className="track-route-point">
                        <div className="track-route-pin sender">
                          <MapPin size={16} />
                        </div>
                        <div>
                          <p className="track-route-point-label">Pickup</p>
                        </div>
                        <div className="track-route-dot-line">
                          <span className="track-route-dot" />
                          <span className="track-route-dash" />
                          <span className="track-route-dot" />
                        </div>
                        <div>
                          <p className="track-route-point-label">Dropoff</p>
                        </div>
                        <div className="track-route-pin receiver">
                          <MapPin size={16} />
                        </div>
                      </div>

                      <div className="track-route-addresses">
                        <div className="track-route-address">
                          <p className="track-route-name">Pickup</p>
                          <p className="track-route-street">
                            {trackingResult.details?.pickupAddress ?? "Address on file"}
                          </p>
                        </div>
                        <div className="track-route-address" style={{ textAlign: "right" }}>
                          <p className="track-route-name">Drop-off</p>
                          <p className="track-route-street">
                            {trackingResult.details?.dropoffAddress ?? "Address on file"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right column */}
                <div className="track-right-col">
                  {/* Shipment details — resolved server-side from the order */}
                  {trackingResult.details && (
                    <div className="track-route-card" style={{ padding: "20px 22px" }}>
                      <h3 className="track-route-title" style={{ marginBottom: 14 }}>
                        Shipment details
                      </h3>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {trackingResult.details.description && (
                          <DetailRow label="Order" value={trackingResult.details.description} />
                        )}
                        {trackingResult.details.recipientName && (
                          <DetailRow label="Recipient" value={trackingResult.details.recipientName} />
                        )}
                        {trackingResult.details.recipientPhone && (
                          <DetailRow label="Contact" value={trackingResult.details.recipientPhone} />
                        )}
                        <DetailRow
                          label="Requested"
                          value={new Date(
                            trackingResult.details.scheduledTime ?? trackingResult.details.createdAt ?? Date.now(),
                          ).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                        />
                        {(trackingResult.details.expeditionType || trackingResult.details.parcelType) && (
                          <DetailRow
                            label="Service"
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
                          value={
                            trackingResult.details.width != null && trackingResult.details.height != null
                              ? `${trackingResult.details.width} × ${trackingResult.details.height} cm${
                                  trackingResult.details.weight != null ? ` · ${trackingResult.details.weight} kg` : ""
                                }`
                              : trackingResult.details.weight != null
                                ? `${trackingResult.details.weight} kg`
                                : "Not specified"
                          }
                        />
                        {trackingResult.details.price != null && trackingResult.details.price > 0 && (
                          <DetailRow
                            label="Delivery fee"
                            value={`R${(trackingResult.details.price / 100).toFixed(2)}`}
                          />
                        )}
                      </div>
                    </div>
                  )}

                  {/* Last updated */}
                  {trackingResult.completedAt && (
                    <div className="track-last-updated">
                      <div className="track-updated-icon">
                        <Check size={18} />
                      </div>
                      <div>
                        <p className="track-updated-label">Completed</p>
                        <p className="track-updated-time">
                          {new Date(trackingResult.completedAt).toLocaleString("en-ZA")}
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
