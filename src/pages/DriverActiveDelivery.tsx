/**
 * Driver Active Delivery
 *
 * Driver-facing workflow for managing the currently assigned delivery.
 *
 * Design notes:
 * - All delivery state comes from Convex reactive queries (no polling):
 *   `tracking.queries.getMyCurrentDelivery` resolves the delivery from the
 *   authenticated session user — a driver can never view another driver's
 *   delivery because no client-supplied driver/delivery ID is trusted.
 * - All state transitions go through the existing state-machine mutations
 *   (`deliveries.state_machine.*`). React never writes delivery status.
 * - Only the action valid for the delivery's current state is offered.
 * - Timeline comes from `tracking.queries.getDeliveryTracking` (route history).
 * - Location reporting uses the existing `tracking.mutations.updateDeliveryLocation`
 *   with the browser Geolocation API (one-shot "share position" button; no
 *   background GPS loop in this task).
 * - Navigation links open Google Maps directions for pickup/dropoff.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Sidebar from "@/components/dashboard/Sidebar";
import { useDashboardNav } from "@/hooks/useDashboardNav";
import {
  Loader2,
  Package,
  MapPin,
  Navigation,
  Clock,
  Weight,
  Box,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Share2,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import {
  DELIVERY_STATUS,
  VALID_TRANSITIONS,
} from "@/convex/schema";
import "@/styles/dashboard.css";
import "@/styles/pages.css";
import "@/styles/driver.css";

// ─── Workflow configuration (mirrors the server state machine) ───────────────

type Status = (typeof DELIVERY_STATUS)[keyof typeof DELIVERY_STATUS];

/** Ordered visual progress steps for the driver workflow. */
const PROGRESS_STEPS: { status: Status; label: string }[] = [
  { status: DELIVERY_STATUS.ASSIGNED, label: "Assigned" },
  { status: DELIVERY_STATUS.DRIVER_ACCEPTED, label: "Accepted" },
  { status: DELIVERY_STATUS.EN_ROUTE_TO_PICKUP, label: "To pickup" },
  { status: DELIVERY_STATUS.AT_PICKUP, label: "At pickup" },
  { status: DELIVERY_STATUS.PICKED_UP, label: "Picked up" },
  { status: DELIVERY_STATUS.IN_TRANSIT, label: "In transit" },
  { status: DELIVERY_STATUS.AT_DROPOFF, label: "At dropoff" },
  { status: DELIVERY_STATUS.DELIVERED, label: "Delivered" },
];

/** The single primary action available for each active status. */
const STATUS_ACTION: Partial<Record<Status, { label: string; operation: string }>> = {
  [DELIVERY_STATUS.ASSIGNED]: { label: "Accept Delivery", operation: "acceptAssignment" },
  [DELIVERY_STATUS.DRIVER_ACCEPTED]: { label: "Start Driving to Pickup", operation: "startEnRouteToPickup" },
  [DELIVERY_STATUS.EN_ROUTE_TO_PICKUP]: { label: "I've Arrived at Pickup", operation: "arriveAtPickup" },
  [DELIVERY_STATUS.AT_PICKUP]: { label: "Confirm Package Pickup", operation: "pickupPackage" },
  [DELIVERY_STATUS.PICKED_UP]: { label: "Start Delivery Trip", operation: "startTrip" },
  [DELIVERY_STATUS.IN_TRANSIT]: { label: "I've Arrived at Dropoff", operation: "arriveAtDropoff" },
  [DELIVERY_STATUS.AT_DROPOFF]: { label: "Complete Delivery", operation: "completeDelivery" },
};

/** Human-readable copy for each active status. */
const STATUS_COPY: Partial<Record<Status, string>> = {
  [DELIVERY_STATUS.ASSIGNED]: "A delivery has been assigned to you. Accept it to begin.",
  [DELIVERY_STATUS.DRIVER_ACCEPTED]: "Accepted. Start driving to the pickup location when ready.",
  [DELIVERY_STATUS.EN_ROUTE_TO_PICKUP]: "En route to pickup. Confirm arrival when you reach the location.",
  [DELIVERY_STATUS.AT_PICKUP]: "You're at the pickup location. Confirm once you have the package.",
  [DELIVERY_STATUS.PICKED_UP]: "Package collected. Start the delivery trip to the dropoff.",
  [DELIVERY_STATUS.IN_TRANSIT]: "In transit to the dropoff location. Drive safely.",
  [DELIVERY_STATUS.AT_DROPOFF]: "You're at the dropoff. Complete the delivery once handed over.",
};

export default function DriverActiveDelivery() {
  const { handleSidebarNavigation } = useDashboardNav();
  const [activeSidebarItem, setActiveSidebarItem] = useState("Active Delivery");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  // ─── Convex reactive data (session-derived; no client-supplied IDs) ────────
  const active = useQuery(api.tracking.queries.getMyCurrentDelivery, {});
  const deliveryId = active?.delivery?.id ?? null;
  const tracking = useQuery(
    api.tracking.queries.getDeliveryTracking,
    deliveryId ? { deliveryId } : "skip"
  );
  const updateDeliveryLocation = useMutation(api.tracking.mutations.updateDeliveryLocation);

  // State-machine transition mutations (existing domain operations)
  const acceptAssignment = useMutation(api.deliveries.state_machine.acceptAssignment);
  const startEnRouteToPickup = useMutation(api.deliveries.state_machine.startEnRouteToPickup);
  const arriveAtPickup = useMutation(api.deliveries.state_machine.arriveAtPickup);
  const pickupPackage = useMutation(api.deliveries.state_machine.pickupPackage);
  const startTrip = useMutation(api.deliveries.state_machine.startTrip);
  const arriveAtDropoff = useMutation(api.deliveries.state_machine.arriveAtDropoff);
  const completeDelivery = useMutation(api.deliveries.state_machine.completeDelivery);
  const rejectAssignment = useMutation(api.deliveries.state_machine.rejectAssignment);

  const mutations: Record<string, (args: { deliveryId: string }) => Promise<unknown>> = useMemo(
    () => ({
      acceptAssignment,
      startEnRouteToPickup,
      arriveAtPickup,
      pickupPackage,
      startTrip,
      arriveAtDropoff,
      completeDelivery,
    }),
    [
      acceptAssignment,
      startEnRouteToPickup,
      arriveAtPickup,
      pickupPackage,
      startTrip,
      arriveAtDropoff,
      completeDelivery,
    ]
  );

  const delivery = active?.delivery ?? null;
  const status = (delivery?.status ?? null) as Status | null;
  const action = status ? STATUS_ACTION[status] : undefined;
  const nextStatus = useMemo<Status | null>(() => {
    if (!status) return null;
    const candidates = (VALID_TRANSITIONS as Record<string, Status[]>)[status] ?? [];
    // The driver's forward transition is the candidate that matches the
    // workflow order (the first forward candidate in PROGRESS_STEPS).
    const order = PROGRESS_STEPS.map((s) => s.status);
    const forward = candidates
      .filter((c) => order.includes(c))
      .sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return forward[0] ?? null;
  }, [status]);

  // Timeline: derive milestone history from tracking events + delivery times
  const timeline = useMemo(() => {
    if (!tracking?.delivery) return [];
    const items: { time: number; text: string }[] = [];
    if (tracking.delivery.startedAt) items.push({ time: tracking.delivery.startedAt, text: "Delivery started" });
    for (const e of tracking.routeHistory ?? []) {
      if (e.type === "status_change" || e.type === "arrival") {
        items.push({ time: e.timestamp, text: e.type === "arrival" ? "Location arrival event" : "Status updated" });
      }
    }
    if (tracking.delivery.completedAt) items.push({ time: tracking.delivery.completedAt, text: "Delivered" });
    return items.sort((a, b) => b.time - a.time).slice(0, 8);
  }, [tracking]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleAction = useCallback(
    async (operation: string) => {
      if (!deliveryId) return;
      setError(null);
      setActionPending(operation);
      try {
        await mutations[operation]({ deliveryId });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update delivery");
      } finally {
        setActionPending(null);
      }
    },
    [deliveryId, mutations]
  );

  const handleReject = useCallback(async () => {
    if (!deliveryId) return;
    setError(null);
    setActionPending("rejectAssignment");
    try {
      await rejectAssignment({ deliveryId, reason: "Rejected by driver from active delivery view" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject assignment");
    } finally {
      setActionPending(null);
    }
  }, [deliveryId, rejectAssignment]);

  const handleShareLocation = useCallback(() => {
    if (!deliveryId) return;
    if (!("geolocation" in navigator)) {
      setError("Location sharing is not supported on this device");
      return;
    }
    setError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await updateDeliveryLocation({
            deliveryId,
            location: {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              timestamp: Date.now(),
              accuracy: pos.coords.accuracy ?? undefined,
            },
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to share location");
        } finally {
          setLocating(false);
        }
      },
      () => {
        setError("Could not get your location. Check location permissions.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  }, [deliveryId, updateDeliveryLocation]);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const formatTime = (timestamp?: number) =>
    timestamp
      ? new Date(timestamp).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })
      : null;

  const mapsUrl = (lat?: number, lng?: number) =>
    lat !== undefined && lng !== undefined
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : null;

  const currentStepIndex = status ? PROGRESS_STEPS.findIndex((s) => s.status === status) : -1;

  // ─── Sidebar/resize (matches other dashboard pages) ────────────────────────
  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 1024) setSidebarOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const onSidebarNav = (item: string) => {
    setActiveSidebarItem(item);
    handleSidebarNavigation(item);
  };

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="dashboard">
      <header className="dash-topnav">
        <div className="dash-topnav-logo">
          <div className="lasha-logo-icon"><span>L</span></div>
          <span className="dash-topnav-logo-text">Lasha</span>
        </div>
        <div className="dash-topnav-links">
          <button className="dash-topnav-link active">Home<span className="dash-topnav-link-underline" /></button>
          <button className="dash-topnav-link">About Us</button>
          <button className="dash-topnav-link">Services</button>
          <button className="dash-topnav-link">Contact US</button>
        </div>
        <div className="dash-topnav-right">
          <button className="dash-mobile-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
          </button>
          <button className="dash-topnav-profile">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
          </button>
        </div>
      </header>

      <div className="dash-app">
        {sidebarOpen && <div className="dash-mobile-overlay visible" onClick={() => setSidebarOpen(false)} />}
        <Sidebar activeItem={activeSidebarItem} onItemChange={onSidebarNav} isOpen={sidebarOpen} />

        <main className="driver-main dash-workspace">
          <div className="driver-container">
            <div className="driver-header">
              <div>
                <h1 className="driver-title">Active Delivery</h1>
                <p className="driver-subtitle">Your current assignment and next steps</p>
              </div>
            </div>

            {/* Loading state */}
            {active === undefined ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
                <Loader2 size={24} className="animate-spin" style={{ color: "#999" }} />
              </div>
            ) : /* Error state: query threw (e.g. not a driver) */
            active === null ? (
              <div className="driver-panel">
                <AlertTriangle size={24} style={{ color: "#b91c1c", margin: "0 auto" }} />
                <div className="driver-panel-title">Unable to load deliveries</div>
                <div className="driver-panel-desc">
                  Only drivers can view the active delivery workflow.
                </div>
              </div>
            ) : /* Empty state */
            !delivery ? (
              <div className="driver-panel">
                <Package size={24} style={{ color: "#999", margin: "0 auto" }} />
                <div className="driver-panel-title">No active delivery</div>
                <div className="driver-panel-desc">
                  You don't have a delivery assigned right now. New assignments appear here automatically.
                </div>
              </div>
            ) : (
              <>
                {error && <div className="driver-error" role="alert">{error}</div>}

                {/* Status banner */}
                <div className="driver-status-banner">
                  <div>
                    <div className="driver-status-label">Delivery status</div>
                    <div className="driver-status-value">
                      {status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ") : "—"}
                    </div>
                  </div>
                  <span className="driver-tracking-code">{delivery.trackingNumber}</span>
                </div>

                {/* Progress steps */}
                <div className="driver-progress">
                  {PROGRESS_STEPS.map((step, i) => (
                    <div
                      key={step.status}
                      className={`driver-progress-step ${
                        i < currentStepIndex ? "done" : i === currentStepIndex ? "current" : ""
                      }`}
                    >
                      <div className="driver-progress-dot">
                        {i <= currentStepIndex ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                      </div>
                      <span className="driver-progress-label">{step.label}</span>
                    </div>
                  ))}
                </div>

                {/* Primary action card — next valid state transition only */}
                <div className="driver-action-card">
                  <p className="driver-action-hint">{status ? STATUS_COPY[status] : null}</p>
                  {action ? (
                    <div className="driver-action-row">
                      <button
                        className="driver-primary-btn"
                        onClick={() => handleAction(action.operation)}
                        disabled={actionPending !== null}
                      >
                        {actionPending === action.operation ? (
                          <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                        ) : (
                          <CheckCircle2 size={16} />
                        )}
                        {actionPending === action.operation ? "Updating..." : action.label}
                      </button>
                      {status === DELIVERY_STATUS.ASSIGNED && (
                        <button
                          className="driver-secondary-btn"
                          onClick={handleReject}
                          disabled={actionPending !== null}
                        >
                          Reject
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="driver-action-hint" style={{ marginBottom: 0 }}>
                      No further driver actions for this delivery.
                    </p>
                  )}
                </div>

                {/* Locations */}
                <div className="driver-locations">
                  <div className="driver-location-card">
                    <div className="driver-location-head">
                      <span className="driver-location-tag">Pickup</span>
                    </div>
                    <div className="driver-location-address">
                      {delivery.pickupAddress ? delivery.pickupAddress.street : "Pickup coordinates"}
                    </div>
                    <div className="driver-location-meta">
                      {delivery.pickupAddress ? delivery.pickupAddress.city : `${delivery.pickupLat?.toFixed(5)}, ${delivery.pickupLng?.toFixed(5)}`}
                    </div>
                    {(() => {
                      const url = mapsUrl(delivery.pickupLat, delivery.pickupLng);
                      return url ? (
                        <a className="driver-nav-btn" href={url} target="_blank" rel="noreferrer">
                          <Navigation size={14} /> Directions to pickup
                        </a>
                      ) : null;
                    })()}
                  </div>

                  <div className="driver-location-card">
                    <div className="driver-location-head">
                      <span className="driver-location-tag dropoff">Dropoff</span>
                    </div>
                    <div className="driver-location-address">
                      {delivery.dropoffAddress ? delivery.dropoffAddress.street : "Dropoff coordinates"}
                    </div>
                    <div className="driver-location-meta">
                      {delivery.dropoffAddress ? delivery.dropoffAddress.city : `${delivery.dropoffLat?.toFixed(5)}, ${delivery.dropoffLng?.toFixed(5)}`}
                    </div>
                    {(() => {
                      const url = mapsUrl(delivery.dropoffLat, delivery.dropoffLng);
                      return url ? (
                        <a className="driver-nav-btn" href={url} target="_blank" rel="noreferrer">
                          <Navigation size={14} /> Directions to dropoff
                        </a>
                      ) : null;
                    })()}
                  </div>
                </div>

                {/* Package details */}
                <div className="driver-details">
                  <div className="driver-detail-card">
                    <div className="driver-detail-label">
                      <Box size={12} style={{ display: "inline", marginRight: 4 }} />
                      Package
                    </div>
                    <div className="driver-detail-value" style={{ textTransform: "capitalize" }}>
                      {tracking?.order?.packageSize ?? "—"} parcel
                    </div>
                    <div className="driver-detail-sub">
                      {tracking?.order?.expeditionType
                        ? tracking.order.expeditionType.replace(/_/g, " ")
                        : "Standard handling"}
                    </div>
                  </div>

                  <div className="driver-detail-card">
                    <div className="driver-detail-label">
                      <Weight size={12} style={{ display: "inline", marginRight: 4 }} />
                      Scheduled
                    </div>
                    <div className="driver-detail-value">
                      {delivery.estimatedArrival ? formatTime(delivery.estimatedArrival) : "—"}
                    </div>
                    <div className="driver-detail-sub">Estimated arrival</div>
                  </div>

                  <div className="driver-detail-card">
                    <div className="driver-detail-label">
                      <Clock size={12} style={{ display: "inline", marginRight: 4 }} />
                      Started
                    </div>
                    <div className="driver-detail-value">
                      {delivery.startedAt ? formatTime(delivery.startedAt) : "—"}
                    </div>
                    <div className="driver-detail-sub">Assignment time</div>
                  </div>
                </div>

                {/* Location sharing (existing tracking backend) */}
                <div className="driver-action-card" style={{ padding: 16 }}>
                  <div className="driver-action-row" style={{ alignItems: "center" }}>
                    <button
                      className="driver-secondary-btn"
                      style={{ color: "var(--primary)", borderColor: "var(--border)" }}
                      onClick={handleShareLocation}
                      disabled={locating || actionPending !== null}
                    >
                      {locating ? (
                        <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                      ) : (
                        <Share2 size={16} />
                      )}
                      {locating ? "Getting location..." : "Share my location"}
                    </button>
                    <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                      Sends one position update to operations via the tracking system.
                    </span>
                  </div>
                </div>

                {/* Timeline */}
                {timeline.length > 0 && (
                  <div className="driver-timeline">
                    <div className="driver-timeline-title">Delivery timeline</div>
                    {timeline.map((item, i) => (
                      <div className="driver-timeline-item" key={`${item.time}-${i}`}>
                        <span className="driver-timeline-time">{formatTime(item.time)}</span>
                        <span className="driver-timeline-text">{item.text}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="driver-safety-note">
                  <ShieldCheck size={14} />
                  Never use this screen while driving. Park safely before confirming an action.
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
