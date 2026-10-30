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
 * The header tile (cyan bar + stepper) is the shared TrackingHeader — the
 * exact same component the tracking-number lookup page renders.
 *
 * Customer/driver boundary: this page consumes state only. No driver
 * mutations (accept/reject, GPS updates, POD submission) or operational
 * mutations (dispatch, reassign, cancel, fail) are reachable from here.
 */

import { useParams, Link } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import CustomerShell from "@/components/shells/CustomerShell";
import { TrackingHeader, RouteMap, FreshnessChip, freshness, buildSteps, milestonesFromEvents, formatEventTime } from "@/components/tracking/TrackingProgress";
import { DELIVERY_STATUS } from "@/convex/schema";
import {
  MapPin,
  Loader2,
  Package,
  XCircle,
  Clock,
  User,
  Navigation,
  Box,
  Calendar,
  Ruler,
  Check,
  FileCheck2,
  CreditCard,
} from "lucide-react";
import { useState } from "react";
import "@/styles/dashboard.css";
import "@/styles/track-delivery.css";

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
    deliveryId ? { deliveryId: deliveryId as never } : "skip",
  );
  const tracking = useQuery(
    api.tracking.queries.getDeliveryTracking,
    deliveryId ? { deliveryId: deliveryId as never } : "skip",
  );
  const pod = useQuery(
    api.pod.service.getPODForDelivery,
    deliveryId ? { deliveryId: deliveryId as never } : "skip",
  );
  // Payment is an order fact, not a delivery status. This is the resumable
  // "pay later" entry point after Checkout — it links back to the same
  // order-scoped payment surface instead of a separate payment page.
  const payment = useQuery(
    api.payments.queries.getMyOrderPayment,
    delivery?.orderId ? { orderId: delivery.orderId } : "skip",
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

  // Milestones come from the real tracking event log (routeHistory now carries
  // event metadata). Expected delivery date falls back to the order's
  // scheduled time — never fabricated.
  const milestones = milestonesFromEvents(tracking.routeHistory);
  const expectedTs = delivery.details?.scheduledTime ?? tracking.delivery.estimatedArrival ?? null;
  const steps = buildSteps(status, milestones, expectedTs);

  const isTerminal =
    status === DELIVERY_STATUS.DELIVERED ||
    status === DELIVERY_STATUS.FAILED ||
    status === DELIVERY_STATUS.CANCELLED;
  const isFailed = status === DELIVERY_STATUS.FAILED || status === DELIVERY_STATUS.CANCELLED;
  const paymentOutstanding =
    payment !== undefined &&
    payment !== null &&
    payment.status !== "completed" &&
    payment.status !== "refunded" &&
    !isFailed;
  const outstandingAmount = payment?.amount ?? 0;

  // Tracking freshness — from the backend's isStale plus its timestamps.
  const dl = tracking.driverLocation;
  const fr = isTerminal
    ? ("none" as const)
    : freshness(dl?.lastUpdate ?? null);
  const driverVisible = !isTerminal && dl?.lat != null && dl?.lng != null;

  const timelineEvents = tracking.routeHistory
    .filter((e) => e.type !== "location_update")
    .slice(-10)
    .reverse();

  return (
    <CustomerShell activeItem="Track Delivery">
      <main className="track-main">
        <div className="track-container">
          {/* Page title */}
          <div className="track-page-title">
            <h1 className="track-title">Delivery Tracking</h1>
            <FreshnessChip state={fr} />
          </div>

          {/* Shared header tile — cyan summary bar + stepper */}
          <TrackingHeader
            trackingNumber={delivery.trackingNumber}
            status={status}
            steps={steps}
            onCopy={handleCopy}
            copied={copied}
          />

          {/* Failed / cancelled customer-safe notice */}
          {isFailed && (
            <div className="track-notice">
              <div className="track-notice-icon">
                <XCircle size={18} />
              </div>
              <div>
                <p className="track-notice-label">This delivery could not be completed</p>
                <p className="track-notice-time">
                  {delivery.completedAt ? formatEventTime(delivery.completedAt) : "—"}
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
                  {delivery.details?.businessName && (
                    <DetailRow label="Business" value={delivery.details.businessName} icon={<User size={13} />} />
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
                        ? formatEventTime(delivery.details.scheduledTime)
                        : delivery.details?.createdAt
                          ? formatEventTime(delivery.details.createdAt)
                          : "—"
                    }
                    mono
                  />
                  {(delivery.details?.expeditionType || delivery.details?.parcelType) && (
                    <DetailRow
                      label="Service"
                      icon={<Clock size={13} />}
                      value={formatService(delivery.details?.expeditionType, delivery.details?.parcelType)}
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
                    {timelineEvents.map((e, i) => (
                      <div key={i} className="track-timeline-item">
                        <div className="track-timeline-rail">
                          <span className="track-timeline-dot" />
                          <span className="track-timeline-line" />
                        </div>
                        <div className="track-timeline-body">
                          <span className="track-timeline-label">
                            {String(e.type ?? "event").replace(/_/g, " ")}
                          </span>
                          <span className="track-timeline-time">{formatEventTime(e.timestamp)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Right column: payment + status rail + driver + POD */}
            <div className="track-right-col">
              {paymentOutstanding && (
                <div className="track-payment-card">
                  <div className="track-payment-icon">
                    <CreditCard size={18} />
                  </div>
                  <div className="track-payment-body">
                    <p className="track-payment-label">Payment outstanding</p>
                    <p className="track-payment-amount">
                      R {(outstandingAmount / 100).toFixed(2).replace(".", ",")}
                    </p>
                    <p className="track-payment-copy">
                      Complete payment to settle this delivery. You can pay by card or
                      from your Lasha wallet.
                    </p>
                    <Link
                      to={`/checkout/${delivery.orderId}`}
                      className="track-payment-btn"
                    >
                      Complete payment
                    </Link>
                  </div>
                </div>
              )}

              <div className="track-last-updated">
                <div className="track-updated-icon is-info"><Clock size={18} /></div>
                <div>
                  <p className="track-updated-label">Started</p>
                  <p className="track-updated-time">{delivery.startedAt ? formatEventTime(delivery.startedAt) : "Not started yet"}</p>
                </div>
              </div>

              {delivery.completedAt && (
                <div className="track-last-updated">
                  <div className={`track-updated-icon ${isFailed ? "is-bad" : ""}`}>
                    {isFailed ? <XCircle size={18} /> : <Check size={18} />}
                  </div>
                  <div>
                    <p className="track-updated-label">{isFailed ? "Closed" : "Completed"}</p>
                    <p className="track-updated-time">{formatEventTime(delivery.completedAt)}</p>
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
                      {dl?.lastUpdate ? ` · last update ${formatEventTime(dl.lastUpdate)}` : ""}
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
                        {formatEventTime(pod.deliveredAt)}
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

/** Shared service label builder (also used by the lookup page). */
function formatService(
  expeditionType: string | null | undefined,
  parcelType: string | null | undefined,
): string {
  return [
    expeditionType ? expeditionType.replace(/_/g, "-") : null,
    parcelType ? parcelType.replace(/_/g, " ") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
