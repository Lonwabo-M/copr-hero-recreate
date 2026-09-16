import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import OperationsShell from "@/components/shells/OperationsShell";
import { RoleGate, APP_AREAS } from "@/components/shells/RoleGate";
import {
  Package,
  Truck,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  MapPin,
  Users,
  RefreshCw,
  XCircle,
  Navigation,
  User,
  Radio,
  Zap,
  ArrowRight,
  Send,
  Ban,
  CheckSquare,
} from "lucide-react";
import { DELIVERY_STATUS, ROLES } from "@/convex/schema";
import "@/styles/dashboard.css";
import "@/styles/operations.css";

// ─── Operations Centre ────────────────────────────────────────────────────────
//
// Live operational control interface for authorized operations users.
//
// Architecture (per spec — no new systems):
//   React (operations shell)
//     → Convex reactive queries (getActiveDeliveries, getDeliveryTracking,
//       getAvailableDriverLocations, getDispatchOffers, getDelivery)
//     → existing backend domain operations (dispatchDelivery, assignDriver,
//       reassignDelivery, cancelDelivery, failDelivery) — only where authorized
//       and only explicit domain mutations, never a generic
//       updateDeliveryStatus.
//
// Data sources (all existing, all authoritative):
//   - deliveries.state_machine.getActiveDeliveries  → active in-flight list
//   - deliveries.state_machine.getDelivery          → one delivery detail
//   - tracking.queries.getDeliveryTracking          → driver location +
//     route history + POD state for a delivery
//   - tracking.queries.getAvailableDriverLocations → all available driver
//     positions (operations/a super_admin only)
//   - dispatch.engine.getDispatchOffers             → active offers per
//     delivery (for dispatch visibility)
//
// Financial systems (settlement/payment/reconciliation) are deliberately NOT
// part of this interface — see docs/operations-centre.md §6.
//
// No mock data, no Math.random(), no fake driver locations, no external map
// service. The tactical map is an inline SVG rendered from real tracking
// records — it visualizes driver positions relative to their delivery's pickup/
// drop-off, it does not generate GPS from the operations browser.

type OpsTab = "overview" | "dispatch" | "live" | "drivers" | "exceptions" | "history";

interface DriverLocationEntry {
  driverId: Id<"users">;
  lat: number | null;
  lng: number | null;
  lastUpdate: number | null;
  isStale: boolean;
  name?: string;
  rating?: number;
  totalTrips?: number;
}

// ─── Active delivery statuses (exact state-machine terminology) ───────────────

const ACTIVE_STATUSES = [
  DELIVERY_STATUS.ASSIGNED,
  DELIVERY_STATUS.DRIVER_ACCEPTED,
  DELIVERY_STATUS.EN_ROUTE_TO_PICKUP,
  DELIVERY_STATUS.AT_PICKUP,
  DELIVERY_STATUS.PICKED_UP,
  DELIVERY_STATUS.IN_TRANSIT,
  DELIVERY_STATUS.AT_DROPOFF,
] as const;

// ─── Tracking freshness thresholds (from tracking/config.ts) ──────────────────

const FRESHNESS_MS = {
  fresh: 10_000,   // < 10s  → Live
  recent: 60_000,  // < 60s  → Recently updated
  // > 60s → stale (MAX_STALENESS_MS from tracking/config.ts)
};

function freshnessState(lastUpdate: number | undefined | null): "live" | "recent" | "stale" | "none" {
  if (lastUpdate === undefined || lastUpdate === null) return "none";
  const age = Date.now() - lastUpdate;
  if (age < FRESHNESS_MS.fresh) return "live";
  if (age < FRESHNESS_MS.recent) return "recent";
  return "stale";
}

function freshnessLabel(s: "live" | "recent" | "stale" | "none"): string {
  return s === "live" ? "Live" : s === "recent" ? "Recently updated" : s === "stale" ? "Stale" : "No location";
}

function freshnessDot(s: "live" | "recent" | "stale" | "none"): string {
  return s === "live" ? "#0A7C42"
    : s === "recent" ? "#0794B5"
    : s === "stale" ? "#856404"
    : "#666";
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

function formatCoordinate(v?: number | null): string {
  if (v === undefined || v === null) return "—";
  return v.toFixed(5);
}

function statusLabel(status: string): string {
  if (!status) return "—";
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Status colour (operations dashboard palette, consistent with existing ops).
const STATUS_COLORS: Record<string, string> = {
  [DELIVERY_STATUS.ASSIGNED]: "#856404",
  [DELIVERY_STATUS.DRIVER_ACCEPTED]: "#0794B5",
  [DELIVERY_STATUS.EN_ROUTE_TO_PICKUP]: "#0794B5",
  [DELIVERY_STATUS.AT_PICKUP]: "#0794B5",
  [DELIVERY_STATUS.PICKED_UP]: "#0A7C42",
  [DELIVERY_STATUS.IN_TRANSIT]: "#0A7C42",
  [DELIVERY_STATUS.AT_DROPOFF]: "#0A7C42",
  [DELIVERY_STATUS.PENDING_DISPATCH]: "#856404",
  [DELIVERY_STATUS.REQUESTED]: "#666",
  [DELIVERY_STATUS.REASSIGNMENT_REQUIRED]: "#C62828",
  [DELIVERY_STATUS.FAILED]: "#C62828",
  [DELIVERY_STATUS.CANCELLED]: "#666",
  [DELIVERY_STATUS.DELIVERED]: "#0A7C42",
};

// Tinted pill treatment for status badges: translucent fill of the status
// colour with a matching readable text colour (replaces solid white-on-colour).
function statusBadgeStyle(status: string): React.CSSProperties {
  const c = STATUS_COLORS[status] ?? "#666";
  return { background: `${c}1a`, color: c, border: `1px solid ${c}38` };
}

// Accent colour for exception cards by kind (also drives the left edge bar).
function exceptionKindColor(kind: string): string {
  if (kind === "failed" || kind === "stale_gps") return "#C62828";
  if (kind === "reassignment_required") return "#856404";
  return "#0794B5";
}

export default function OperationsCentre() {
  return (
    <RoleGate area={APP_AREAS.OPERATIONS}>
      <OperationsCentreInner />
    </RoleGate>
  );
}

function OperationsCentreInner() {
  const [activeTab, setActiveTab] = useState<OpsTab>("live");
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [dispatchTargetId, setDispatchTargetId] = useState<string | null>(null);
  const [reassigningId, setReassigningId] = useState<string | null>(null);

  // ── Operational action handlers (existing backend mutations only) ──────────
  // Backend RBAC remains authoritative; UI rejections are logged, not hidden.

  async function handleReassign(deliveryId: string) {
    setReassigningId(deliveryId);
    try {
      await reassignDelivery({ deliveryId: deliveryId as any });
    } catch (err: any) {
      console.error("reassignDelivery rejected:", err?.message);
    } finally {
      setReassigningId(null);
    }
  }

  function handleFail(deliveryId: string, reason: string) {
    failDelivery({ deliveryId: deliveryId as any, reason }).then(
      () => undefined,
      (err: any) => console.error("failDelivery rejected:", err?.message),
    );
  }

  function handleCancel(deliveryId: string, reason: string) {
    cancelDelivery({ deliveryId: deliveryId as any, reason }).then(
      () => undefined,
      (err: any) => console.error("cancelDelivery rejected:", err?.message),
    );
  }

  function handleCompleteWithPOD(deliveryId: string) {
    completeDeliveryWithPOD({
      deliveryId: deliveryId as any,
      recipientName: "Delivered by operations",
    }).then(
      () => undefined,
      (err: any) => console.error("completeDeliveryWithPOD rejected:", err?.message),
    );
  }

  // ── Core reactive queries ──────────────────────────────────────────────────

  const activeDeliveries = useQuery(
    api.deliveries.state_machine.getActiveDeliveries,
    { limit: 200 },
  );

  const driverLocations = useQuery(
    api.tracking.queries.getAvailableDriverLocations,
    {},
  );

  const selectedTracking = useQuery(
    api.tracking.queries.getDeliveryTracking,
    selectedDeliveryId ? { deliveryId: selectedDeliveryId as any } : "skip",
  );

  const dispatchOffers = useQuery(
    api.dispatch.engine.getDispatchOffers,
    dispatchTargetId ? { deliveryId: dispatchTargetId as any } : "skip",
  );

  const dispatchDelivery = useMutation(
    api.deliveries.state_machine.dispatchDelivery,
  );
  // Engine-level dispatch: pending_dispatch → driver offers (maxOffers default 3).
  const sendDriverOffers = useMutation(
    api.dispatch.engine.dispatchDelivery,
  );
  const reassignDelivery = useMutation(
    api.dispatch.engine.reassignDelivery,
  );
  const cancelDelivery = useMutation(
    api.deliveries.state_machine.cancelDelivery,
  );
  const failDelivery = useMutation(
    api.deliveries.state_machine.failDelivery,
  );
  const completeDeliveryWithPOD = useMutation(
    api.pod.service.completeDeliveryWithPOD,
  );

  // ── Derived views ──────────────────────────────────────────────────────────

  // getActiveDeliveries returns Doc<"deliveries">[] directly.
  const activeList: Doc<"deliveries">[] = activeDeliveries ?? [];

  const drivers: DriverLocationEntry[] = (driverLocations ?? []) as DriverLocationEntry[];

  // Map coordinate range — derived from real data so the map scales to actual
  // activity instead of a fixed fake viewport.
  const mapBounds = useMemo(() => {
    const points: [number, number][] = [];
    for (const d of activeList) {
      if (d.pickupLat !== undefined && d.pickupLng !== undefined) {
        points.push([d.pickupLat, d.pickupLng]);
      }
      if (d.dropoffLat !== undefined && d.dropoffLng !== undefined) {
        points.push([d.dropoffLat, d.dropoffLng]);
      }
    }
    for (const dr of drivers) {
      if (dr.lat !== null && dr.lng !== null && dr.lat !== undefined && dr.lng !== undefined) {
        points.push([dr.lat as number, dr.lng as number]);
      }
    }
    if (points.length === 0) {
      return {
        minLat: -34.0,
        maxLat: -33.6,
        minLng: 18.2,
        maxLng: 18.7,
        hasData: false,
      };
    }
    let minLat = Infinity,
      maxLat = -Infinity,
      minLng = Infinity,
      maxLng = -Infinity;
    for (const [lat, lng] of points) {
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
    }
    const latPad = (maxLat - minLat) * 0.12 || 0.02;
    const lngPad = (maxLng - minLng) * 0.12 || 0.02;
    return {
      minLat: minLat - latPad,
      maxLat: maxLat + latPad,
      minLng: minLng - lngPad,
      maxLng: maxLng + lngPad,
      hasData: true,
    };
  }, [activeList, drivers]);

  // Exceptions — derived from real data only.
  const exceptions = useMemo(() => {
    const items: Array<{
      kind: string;
      delivery: Doc<"deliveries">;
      driverLoc?: DriverLocationEntry;
      message: string;
    }> = [];

    for (const d of activeList) {
      if (d.status === DELIVERY_STATUS.FAILED) {
        items.push({ kind: "failed", delivery: d, message: "Delivery has failed" });
      } else if (d.status === DELIVERY_STATUS.REASSIGNMENT_REQUIRED) {
        items.push({ kind: "reassignment_required", delivery: d, message: "Reassignment required" });
      }

      if (d.courierId === undefined && ACTIVE_STATUSES.includes(d.status as any)) {
        items.push({ kind: "no_driver", delivery: d, message: "No driver assigned" });
      }

      const loc = drivers.find((dr) => dr.driverId === d.courierId);
      if (loc && loc.isStale) {
        items.push({ kind: "stale_gps", delivery: d, driverLoc: loc, message: "Driver location stale" });
      }

      if (
        (d.status === DELIVERY_STATUS.IN_TRANSIT ||
          d.status === DELIVERY_STATUS.EN_ROUTE_TO_PICKUP ||
          d.status === DELIVERY_STATUS.AT_PICKUP) &&
        (!loc || loc.lat === null)
      ) {
        items.push({ kind: "no_location", delivery: d, message: "No driver location available" });
      }
    }

    if (dispatchTargetId) {
      for (const o of (dispatchOffers ?? [])) {
        if (o.status === "expired") {
          const d = activeList.find((ad) => ad._id === dispatchTargetId);
          if (d) {
            items.push({ kind: "offer_expired", delivery: d, message: "Dispatch offer expired" });
          }
        }
      }
    }

    return items;
  }, [activeList, drivers, dispatchTargetId, dispatchOffers]);

  return (
    <OperationsShell activeItem="Operations Centre">
      <main className="ops-main">
        <div className="ops-page-head">
          <span className="ops-page-eyebrow">Control Room</span>
          <h1 className="ops-page-title">Operations Centre</h1>
        </div>
        <div className="ops-tabs">
          {([
            { id: "overview", label: "Overview", icon: <TrendingUp size={18} /> },
            { id: "dispatch", label: "Dispatch", icon: <Package size={18} /> },
            { id: "live", label: "Live Map", icon: <Navigation size={18} /> },
            { id: "drivers", label: "Drivers", icon: <Users size={18} /> },
            { id: "exceptions", label: "Exceptions", icon: <AlertTriangle size={18} /> },
            { id: "history", label: "History", icon: <Clock size={18} /> },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              className={`ops-tab ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="ops-content">
          {activeTab === "overview" && (
            <OverviewTab
              activeDeliveries={activeList}
              drivers={drivers}
              exceptions={exceptions}
            />
          )}

          {activeTab === "dispatch" && (
            <DispatchTab
              deliveries={activeList}
              dispatchTargetId={dispatchTargetId}
              onDispatch={(id) => setDispatchTargetId(id)}
              dispatchOffers={dispatchOffers}
              dispatchDelivery={dispatchDelivery}
              sendDriverOffers={sendDriverOffers}
              reassignDelivery={reassignDelivery}
            />
          )}

          {activeTab === "live" && (
            <LiveTab
              activeDeliveries={activeList}
              drivers={drivers}
              mapBounds={mapBounds}
              selectedDeliveryId={selectedDeliveryId}
              onSelectDelivery={(id) => setSelectedDeliveryId(id)}
              tracking={selectedTracking}
            />
          )}

          {activeTab === "drivers" && (
            <DriversTab drivers={drivers} activeDeliveries={activeList} />
          )}

          {activeTab === "exceptions" && (
            <ExceptionsTab
              exceptions={exceptions}
              reassigningId={reassigningId}
              onReassign={handleReassign}
              onCompleteWithPOD={handleCompleteWithPOD}
              onFail={handleFail}
              onCancel={handleCancel}
            />
          )}

          {activeTab === "history" && (
            <HistoryTab drivers={drivers} />
          )}
        </div>
      </main>
    </OperationsShell>
  );
}

// ─── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({
  activeDeliveries,
  drivers,
  exceptions,
}: {
  activeDeliveries: Doc<"deliveries">[];
  drivers: DriverLocationEntry[];
  exceptions: Array<{ kind: string; delivery: Doc<"deliveries">; driverLoc?: DriverLocationEntry; message: string }>;
}) {
  const activeCount = activeDeliveries.length;
  const driverCount = drivers.length;
  const withLocation = drivers.filter((d) => d.lat !== null && d.lat !== undefined).length;
  const staleCount = drivers.filter((d) => d.isStale).length;
  const exceptionCount = exceptions.length;

  const stats = [
    { icon: <Navigation size={24} />, label: "Active Deliveries", value: activeCount, color: "#0794B5" },
    { icon: <Users size={24} />, label: "Drivers Online", value: driverCount, color: "#0A7C42" },
    { icon: <Radio size={24} />, label: "Location Stale", value: staleCount, color: "#856404" },
    { icon: <AlertTriangle size={24} />, label: "Exceptions", value: exceptionCount, color: exceptionCount > 0 ? "#C62828" : "#0A7C42" },
  ];

  return (
    <div className="ops-overview">
      <div className="ops-stats-grid">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="ops-stat-card"
            style={{ "--stat-accent": stat.color } as React.CSSProperties}
          >
            <div className="ops-stat-icon" style={{ color: stat.color, background: `${stat.color}14` }}>
              {stat.icon}
            </div>
            <div className="ops-stat-value">{stat.value}</div>
            <div className="ops-stat-label">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="ops-section">
        <h2 className="ops-section-title">Live Map Summary</h2>
        <div className="ops-activity-list">
          <div className="ops-activity-item">
            <div className="ops-activity-icon delivery"><Navigation size={16} /></div>
            <div className="ops-activity-content">
              <div className="ops-activity-title">Active deliveries</div>
              <div className="ops-activity-desc">
                {activeCount} in-flight deliveries across operational states.
                Select Live Map to view driver positions.
              </div>
            </div>
          </div>
          <div className="ops-activity-item">
            <div className="ops-activity-icon delivery"><Users size={16} /></div>
            <div className="ops-activity-content">
              <div className="ops-activity-title">Drivers with location</div>
              <div className="ops-activity-desc">
                {withLocation} of {driverCount} available drivers reporting
                location. {staleCount > 0 ? `${staleCount} stale` : "All locations current"}.
              </div>
            </div>
          </div>
          {exceptionCount > 0 && (
            <div className="ops-activity-item">
              <div className="ops-activity-icon alert"><AlertTriangle size={16} /></div>
              <div className="ops-activity-content">
                <div className="ops-activity-title">Exceptions requiring attention</div>
                <div className="ops-activity-desc">{exceptionCount} operational exception(s). See the Exceptions tab.</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Dispatch Tab ─────────────────────────────────────────────────────────────

function DispatchTab({
  deliveries,
  dispatchTargetId,
  onDispatch,
  dispatchOffers,
  dispatchDelivery,
  sendDriverOffers,
  reassignDelivery,
}: {
  deliveries: Doc<"deliveries">[];
  dispatchTargetId: string | null;
  onDispatch: (id: string) => void;
  dispatchOffers: any;
  dispatchDelivery: any;
  sendDriverOffers: any;
  reassignDelivery: any;
}) {
  const [dispatchingId, setDispatchingId] = useState<string | null>(null);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatchReassigningId, setDispatchReassigningId] = useState<string | null>(null);

  // Everything pre-assignment lives here now: requested (needs staff release),
  // pending_dispatch (released — send driver offers), reassignment_required
  // (previous driver fell through). Each state has its own action.
  const activePending = deliveries.filter(
    (d) =>
      d.status === DELIVERY_STATUS.REQUESTED ||
      d.status === DELIVERY_STATUS.PENDING_DISPATCH ||
      d.status === DELIVERY_STATUS.REASSIGNMENT_REQUIRED,
  );

  // Release a requested delivery into the dispatch pool
  // (requested → pending_dispatch; engine offers go out next).
  const handleDispatch = async (id: string) => {
    setDispatchingId(id);
    setDispatchError(null);
    try {
      await dispatchDelivery({ deliveryId: id as any });
    } catch (e) {
      setDispatchError(e instanceof Error ? e.message : "Dispatch failed");
    } finally {
      setDispatchingId(null);
    }
  };

  // Send driver offers for a released delivery
  // (pending_dispatch → offers to scored drivers → assigned on accept).
  const handleSendOffers = async (id: string) => {
    setDispatchingId(id);
    setDispatchError(null);
    try {
      await sendDriverOffers({ deliveryId: id as any });
    } catch (e) {
      setDispatchError(e instanceof Error ? e.message : "Could not send driver offers");
    } finally {
      setDispatchingId(null);
    }
  };

  const handleDispatchReassign = async (id: string) => {
    setDispatchReassigningId(id);
    setDispatchError(null);
    try {
      await reassignDelivery({ deliveryId: id as any });
    } catch (e) {
      setDispatchError(e instanceof Error ? e.message : "Reassign failed");
    } finally {
      setDispatchReassigningId(null);
    }
  };

  return (
    <div className="ops-dispatch">
      <div className="ops-section-header">
        <h2 className="ops-section-title">Dispatch</h2>
        <div className="ops-filter-group">
          <span className="ops-live-count">{activePending.length} awaiting dispatch</span>
        </div>
      </div>

      {activePending.length > 0 ? (
        <div className="ops-dispatch-list">
          {activePending.map((d) => {
            const offers = (dispatchOffers ?? []).filter((o: any) => o.deliveryId === d._id);
            const hasOffers = offers.length > 0;
            const assigned = d.courierId !== undefined ? "Assigned" : "Unassigned";

            return (
              <div key={d._id} className="ops-dispatch-card">
                <div className="ops-dispatch-header">
                  <span className="ops-delivery-tracking">{d.trackingNumber}</span>
                  <span className="status-badge" style={statusBadgeStyle(d.status)}>
                    {statusLabel(d.status)}
                  </span>
                </div>

                <div className="ops-dispatch-route">
                  <div className="ops-route-point">
                    <MapPin size={13} />
                    <span>Pickup: {formatCoordinate(d.pickupLat)}, {formatCoordinate(d.pickupLng)}</span>
                  </div>
                  <div className="ops-route-point">
                    <MapPin size={13} />
                    <span>Dropoff: {formatCoordinate(d.dropoffLat)}, {formatCoordinate(d.dropoffLng)}</span>
                  </div>
                </div>

                <div className="ops-dispatch-meta">
                  <span className="ops-meta-item"><Package size={12} />Order #{d.orderId.slice(-6).toUpperCase()}</span>
                  <span className="ops-meta-item"><User size={12} />{assigned}</span>
                  {hasOffers && (
                    <span className="ops-meta-item" style={{ color: "#0A7C42" }}>
                      <Zap size={12} />{offers.length} active offer(s)
                    </span>
                  )}
                </div>

                <div className="ops-dispatch-actions">
                  {d.status === DELIVERY_STATUS.REQUESTED && (
                    <button
                      className="ops-btn ops-btn-primary ops-btn-sm"
                      disabled={dispatchingId === d._id}
                      onClick={() => handleDispatch(d._id)}
                    >
                      {dispatchingId === d._id ? (
                        <><RefreshCw size={14} className="animate-spin" />Releasing…</>
                      ) : (
                        <><RefreshCw size={14} />Release to dispatch</>
                      )}
                    </button>
                  )}
                  {d.status === DELIVERY_STATUS.PENDING_DISPATCH && (
                    <>
                      <button
                        className="ops-btn ops-btn-primary ops-btn-sm"
                        disabled={dispatchingId === d._id}
                        onClick={() => handleSendOffers(d._id)}
                      >
                        {dispatchingId === d._id ? (
                          <><RefreshCw size={14} className="animate-spin" />Sending offers…</>
                        ) : (
                          <><Zap size={14} />Send driver offers</>
                        )}
                      </button>
                      <button
                        className="ops-btn ops-btn-sm"
                        disabled={dispatchingId === d._id}
                        onClick={() => onDispatch(d._id)}
                      >
                        Offers<ArrowRight size={14} />
                      </button>
                    </>
                  )}
                  {d.status === DELIVERY_STATUS.REASSIGNMENT_REQUIRED && (
                    <button
                      className="ops-btn ops-btn-sm"
                      disabled={dispatchReassigningId === d._id}
                      onClick={() => handleDispatchReassign(d._id)}
                    >
                      {dispatchReassigningId === d._id ? (
                        <><RefreshCw size={14} className="animate-spin" />Reassigning…</>
                      ) : (
                        <><RefreshCw size={14} />Reassign<ArrowRight size={14} /></>
                      )}
                    </button>
                  )}
                </div>

                {dispatchError && <div className="ops-dispatch-error">{dispatchError}</div>}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon"><Package size={24} /></div>
          <div className="empty-state-title">Nothing awaiting dispatch</div>
          <div className="empty-state-desc">
            No deliveries are waiting to be released, offered to drivers, or
            reassigned. New customer requests appear here automatically.
          </div>
        </div>
      )}

      {dispatchTargetId && dispatchOffers && (dispatchOffers as any[]).length > 0 && (
        <div className="ops-section" style={{ marginTop: 24 }}>
          <h2 className="ops-section-title">Dispatch Offers — {dispatchTargetId.slice(-6).toUpperCase()}</h2>
          <div className="ops-activity-list">
            {(dispatchOffers as any[]).map((o: any) => (
              <div key={o._id} className="ops-activity-item">
                <div className="ops-activity-icon delivery"><User size={16} /></div>
                <div className="ops-activity-content">
                  <div className="ops-activity-title">{o.driverName} — {o.vehicleRegistration}</div>
                  <div className="ops-activity-desc">
                    Offer {o.status} · score {o.score?.toFixed(2) ?? "—"} · offered{" "}
                    {o.offeredAt ? formatDateTime(o.offeredAt) : "—"} · expires{" "}
                    {o.expiresAt ? formatDateTime(o.expiresAt) : "—"}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Live Tab (tactical SVG map + delivery list) ──────────────────────────────

function LiveTab({
  activeDeliveries,
  drivers,
  mapBounds,
  selectedDeliveryId,
  onSelectDelivery,
  tracking,
}: {
  activeDeliveries: Doc<"deliveries">[];
  drivers: DriverLocationEntry[];
  mapBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number; hasData: boolean };
  selectedDeliveryId: string | null;
  onSelectDelivery: (id: string) => void;
  tracking: any;
}) {
  const deliveryMarkers = activeDeliveries.map((d) => ({
    type: "pickup" as const,
    lat: d.pickupLat ?? 0,
    lng: d.pickupLng ?? 0,
    delivery: d,
  }));

  const dropoffMarkers = activeDeliveries
    .filter((d) => d.dropoffLat !== undefined)
    .map((d) => ({
      type: "dropoff" as const,
      lat: d.dropoffLat ?? 0,
      lng: d.dropoffLng ?? 0,
      delivery: d,
    }));

  const driverMarkers = drivers
    .filter((dr) => dr.lat !== null && dr.lng !== null)
    .map((dr) => {
      const assignedDelivery = activeDeliveries.find((d) => d.courierId === dr.driverId);
      return { driver: dr, delivery: assignedDelivery ?? null, lat: dr.lat as number, lng: dr.lng as number };
    });

  const selectedDelivery = selectedDeliveryId
    ? activeDeliveries.find((d) => d._id === selectedDeliveryId) ?? null
    : null;

  return (
    <div className="ops-live">
      <div className="ops-live-layout">
        <div className="ops-map-panel">
          <div className="ops-map-header">
            <h2 className="ops-section-title">Live Positions</h2>
            <div className="ops-map-legend">
              <span className="ops-legend-item"><span className="ops-legend-dot" style={{ background: "#0A7C42" }} />Driver</span>
              <span className="ops-legend-item"><span className="ops-legend-dot" style={{ background: "#0794B5" }} />Pickup</span>
              <span className="ops-legend-item"><span className="ops-legend-dot" style={{ background: "#856404" }} />Dropoff</span>
              <span className="ops-legend-item"><span className="ops-legend-dot" style={{ background: "#C62828" }} />Stale</span>
            </div>
          </div>

          <div className="ops-map">
            {mapBounds.hasData ? (
              <SvgMap
                bounds={mapBounds}
                drivers={driverMarkers}
                pickups={deliveryMarkers}
                dropoffs={dropoffMarkers}
                selectedDeliveryId={selectedDeliveryId}
                onDriverClick={(driver) => {
                  if (driver.delivery) {
                    onSelectDelivery(driver.delivery._id as string);
                  }
                }}
                onPickupClick={(d) => onSelectDelivery(d.delivery._id as string)}
                onDropoffClick={(d) => onSelectDelivery(d.delivery._id as string)}
              />
            ) : (
              <div className="ops-map-empty">
                <Navigation size={32} style={{ color: "#999" }} />
                <div>No active delivery or driver positions to display.</div>
              </div>
            )}
          </div>

          <div className="ops-map-footer">
            <span className="ops-map-note">
              Positions from existing driver GPS tracking. Not generated from this browser.
            </span>
          </div>
        </div>

        <div className="ops-live-side">
          <div className="ops-section">
            <div className="ops-section-header">
              <h2 className="ops-section-title">Active Deliveries</h2>
              <span className="ops-live-count">{activeDeliveries.length}</span>
            </div>

            {activeDeliveries.length > 0 ? (
              <div className="ops-delivery-list">
                {activeDeliveries.map((d) => {
                  const loc = drivers.find((dr) => dr.driverId === d.courierId);
                  const freshness = loc ? freshnessState(loc.lastUpdate) : "none";
                  const driverName = loc?.name ?? "—";
                  const selected = d._id === selectedDeliveryId;

                  return (
                    <button
                      key={d._id}
                      className={`ops-delivery-card ${selected ? "selected" : ""}`}
                      onClick={() => onSelectDelivery(d._id as string)}
                    >
                      <div className="ops-delivery-header">
                        <span className="ops-delivery-tracking">{d.trackingNumber}</span>
                        <span className="status-badge" style={statusBadgeStyle(d.status)}>
                          {statusLabel(d.status)}
                        </span>
                      </div>

                      <div className="ops-delivery-route">
                        <div className="ops-route-point">
                          <MapPin size={12} />
                          <span className="ops-route-label pickup">P</span>
                          <span>{formatCoordinate(d.pickupLat)}, {formatCoordinate(d.pickupLng)}</span>
                        </div>
                        <div className="ops-route-point">
                          <MapPin size={12} />
                          <span className="ops-route-label dropoff">D</span>
                          <span>{formatCoordinate(d.dropoffLat)}, {formatCoordinate(d.dropoffLng)}</span>
                        </div>
                      </div>

                      <div className="ops-delivery-footer">
                        <div className="ops-delivery-meta">
                          <span className="ops-meta-item"><User size={11} />{driverName}</span>
                          <span className="ops-meta-item ops-freshness" style={{ color: freshnessDot(freshness) }}>
                            <Radio size={10} className={freshness === "live" ? "animate-pulse" : ""} />
                            {freshnessLabel(freshness)}
                          </span>
                        </div>
                        <span className="ops-delivery-id">Order #{d.orderId.slice(-6).toUpperCase()}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon"><Truck size={24} /></div>
                <div className="empty-state-title">No active deliveries</div>
                <div className="empty-state-desc">No in-flight deliveries in the current operational view.</div>
              </div>
            )}
          </div>

          {selectedDelivery && (
            <div className="ops-section" style={{ marginTop: 16 }}>
              <div className="ops-section-header">
                <h2 className="ops-section-title">Delivery Detail — {selectedDelivery.trackingNumber}</h2>
                <button className="ops-btn ops-btn-sm" onClick={() => onSelectDelivery("")}>Close</button>
              </div>

              <div className="ops-delivery-detail">
                <div className="ops-detail-row">
                  <span className="ops-detail-label">Status</span>
                  <span className="ops-detail-value" style={{ color: STATUS_COLORS[selectedDelivery.status] ?? "#666" }}>
                    {statusLabel(selectedDelivery.status)}
                  </span>
                </div>

                <div className="ops-detail-row">
                  <span className="ops-detail-label">Order</span>
                  <span className="ops-detail-value">#{selectedDelivery.orderId.slice(-6).toUpperCase()}</span>
                </div>

                <div className="ops-detail-row">
                  <span className="ops-detail-label">Assigned driver</span>
                  <span className="ops-detail-value">
                    {tracking?.driverLocation ? (
                      <>
                        {tracking.driverLocation.lat !== undefined ? (
                          <span className="ops-detail-value ops-small">
                            {formatCoordinate(tracking.driverLocation.lat)}, {formatCoordinate(tracking.driverLocation.lng)}
                          </span>
                        ) : (
                          "—"
                        )}{" "}
                        <span className="ops-detail-value ops-small" style={{ color: freshnessDot(freshnessState(tracking.driverLocation?.lastUpdate)) }}>
                          ({freshnessLabel(freshnessState(tracking.driverLocation?.lastUpdate))})
                        </span>
                      </>
                    ) : (
                      selectedDelivery.courierId ? "Assigned" : "Not assigned"
                    )}
                  </span>
                </div>

                {selectedDelivery.pickupLat !== undefined && (
                  <div className="ops-detail-row">
                    <span className="ops-detail-label">Pickup</span>
                    <span className="ops-detail-value ops-small">{formatCoordinate(selectedDelivery.pickupLat)}, {formatCoordinate(selectedDelivery.pickupLng)}</span>
                  </div>
                )}

                {selectedDelivery.dropoffLat !== undefined && (
                  <div className="ops-detail-row">
                    <span className="ops-detail-label">Dropoff</span>
                    <span className="ops-detail-value ops-small">{formatCoordinate(selectedDelivery.dropoffLat)}, {formatCoordinate(selectedDelivery.dropoffLng)}</span>
                  </div>
                )}

                {selectedDelivery.startedAt !== undefined && (
                  <div className="ops-detail-row">
                    <span className="ops-detail-label">Started</span>
                    <span className="ops-detail-value ops-small">{formatDateTime(selectedDelivery.startedAt)}</span>
                  </div>
                )}

                {selectedDelivery.completedAt !== undefined && (
                  <div className="ops-detail-row">
                    <span className="ops-detail-label">Completed</span>
                    <span className="ops-detail-value ops-small">{formatDateTime(selectedDelivery.completedAt)}</span>
                  </div>
                )}

                {tracking?.driverLocation && (
                  <div className="ops-detail-section">
                    <div className="ops-detail-label" style={{ marginBottom: 8 }}><Radio size={13} />Driver location</div>
                    <div className="ops-detail-value ops-small">
                      Lat {formatCoordinate(tracking.driverLocation.lat)} · Lng {formatCoordinate(tracking.driverLocation.lng)} · Updated {formatDateTime(tracking.driverLocation.lastUpdate)}
                    </div>
                  </div>
                )}

                {tracking?.routeHistory && tracking.routeHistory.length > 0 && (
                  <div className="ops-detail-section">
                    <div className="ops-detail-label" style={{ marginBottom: 8 }}><Navigation size={13} />Tracking timeline (last {tracking.routeHistory.length})</div>
                    <div className="ops-route-history">
                      {tracking.routeHistory.slice(-10).reverse().map((pt: any, i: number) => (
                        <div key={i} className="ops-route-history-point">
                          <span className="ops-small">{formatCoordinate(pt.lat)}, {formatCoordinate(pt.lng)}</span>
                          <span className="ops-small ops-muted">{formatDateTime(pt.timestamp)}</span>
                          <span className="ops-small ops-muted">{typeof pt.type === "string" ? pt.type.replace(/_/g, " ") : "—"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedDelivery && (
                  <DeliveryPODSection deliveryId={selectedDelivery._id as string} />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Delivery POD section (scoped query for the selected delivery) ─────────────

function DeliveryPODSection({ deliveryId }: { deliveryId: string }) {
  const pod = useQuery(
    api.pod.service.getPODForDelivery,
    deliveryId ? { deliveryId: deliveryId as any } : "skip",
  );

  return (
    <div className="ops-detail-section">
      <div className="ops-detail-label" style={{ marginBottom: 8 }}><CheckSquare size={13} />Proof of delivery</div>
      {pod === undefined ? (
        <div className="ops-detail-value ops-small ops-muted">Loading POD…</div>
      ) : pod === null ? (
        <div className="ops-detail-value ops-small ops-muted">No POD on record</div>
      ) : (
        <div className="ops-detail-value ops-small">
          <div>Outcome: {pod.outcome ?? "—"}</div>
          <div>Submitted: {formatDateTime(pod.deliveredAt)}</div>
          {pod.recipientName ? (
            <div className="ops-small ops-muted">Recipient: {pod.recipientName}</div>
          ) : null}
          {pod.failureReason ? (
            <div className="ops-small" style={{ color: "#C62828" }}>
              Failure reason: {pod.failureReason}
            </div>
          ) : null}
          {pod.files && pod.files.length > 0 && (
            <div className="ops-small ops-muted">{pod.files.length} evidence file(s)</div>
          )}
          {pod.recipientSignatureId && (
            <div className="ops-small">
              Signature on file
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Inline SVG tactical map ──────────────────────────────────────────────────

function SvgMap({
  bounds,
  drivers,
  pickups,
  dropoffs,
  selectedDeliveryId,
  onDriverClick,
  onPickupClick,
  onDropoffClick,
}: {
  bounds: { minLat: number; maxLat: number; minLng: number; maxLng: number; hasData: boolean };
  drivers: Array<{ driver: DriverLocationEntry; delivery: Doc<"deliveries"> | null; lat: number; lng: number }>;
  pickups: Array<{ type: "pickup"; lat: number; lng: number; delivery: Doc<"deliveries"> }>;
  dropoffs: Array<{ type: "dropoff"; lat: number; lng: number; delivery: Doc<"deliveries"> }>;
  selectedDeliveryId: string | null;
  onDriverClick: (dr: any) => void;
  onPickupClick: (d: any) => void;
  onDropoffClick: (d: any) => void;
}) {
  const width = 600;
  const height = 420;
  const lngRange = bounds.maxLng - bounds.minLng || 0.001;
  const latRange = bounds.maxLat - bounds.minLat || 0.001;

  const toSvg = (lat: number, lng: number) => [
    ((lng - bounds.minLng) / lngRange) * width,
    ((bounds.maxLat - lat) / latRange) * height,
  ];

  const gridLines: React.ReactNode[] = [];
  for (let i = 0; i <= 6; i++) {
    const x = (i / 6) * width;
    gridLines.push(<line key={`vg${i}`} x1={x} y1={0} x2={x} y2={height} stroke="#e5e7eb" strokeWidth={1} />);
  }
  for (let i = 0; i <= 4; i++) {
    const y = (i / 4) * height;
    gridLines.push(<line key={`hg${i}`} x1={0} y1={y} x2={width} y2={y} stroke="#e5e7eb" strokeWidth={1} />);
  }

  const routes = pickups
    .filter((p) => p.delivery.dropoffLat !== undefined)
    .map((p) => {
      const [x1, y1] = toSvg(p.lat, p.lng);
      const [x2, y2] = toSvg(p.delivery.dropoffLat as number, p.delivery.dropoffLng as number);
      const selected = p.delivery._id === selectedDeliveryId;
      return (
        <g key={`route-${p.delivery._id}`}>
          <line
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={selected ? "#0794B5" : "#cbd5e1"}
            strokeWidth={selected ? 2.5 : 1.2}
            strokeDasharray={selected ? "none" : "4 4"}
            opacity={selected ? 1 : 0.6}
          />
        </g>
      );
    });

  const pickupMarkers = pickups.map((p) => {
    const [x, y] = toSvg(p.lat, p.lng);
    const selected = p.delivery._id === selectedDeliveryId;
    return (
      <g key={`pk-${p.delivery._id}`}>
        <circle
          cx={x} cy={y} r={selected ? 7 : 5}
          fill="#0794B5"
          stroke={selected ? "#fff" : "none"}
          strokeWidth={selected ? 2 : 0}
          className="ops-map-marker"
          style={{ cursor: "pointer" }}
          onClick={() => onPickupClick(p.delivery)}
        />
      </g>
    );
  });

  const dropoffMarkers = dropoffs.map((d) => {
    const [x, y] = toSvg(d.lat, d.lng);
    const selected = d.delivery._id === selectedDeliveryId;
    return (
      <g key={`dp-${d.delivery._id}`}>
        <circle
          cx={x} cy={y} r={selected ? 7 : 5}
          fill="#856404"
          stroke={selected ? "#fff" : "none"}
          strokeWidth={selected ? 2 : 0}
          className="ops-map-marker"
          style={{ cursor: "pointer" }}
          onClick={() => onDropoffClick(d.delivery)}
        />
      </g>
    );
  });

  const driverMarkers = drivers.map((dr) => {
    const [x, y] = toSvg(dr.lat, dr.lng);
    const stale = dr.driver.isStale;
    const selectedDelivery = dr.delivery?._id === selectedDeliveryId;
    return (
      <g key={`dr-${dr.driver.driverId}`}>
        <circle
          cx={x} cy={y} r={selectedDelivery ? 8 : 6}
          fill={stale ? "#C62828" : "#0A7C42"}
          stroke="#fff"
          strokeWidth={selectedDelivery ? 2.5 : 2}
          className="ops-map-marker"
          style={{ cursor: "pointer" }}
          onClick={() => onDriverClick(dr)}
        />
        {stale && (
          <circle cx={x} cy={y} r={11} fill="none" stroke="#C62828" strokeWidth={1.5} strokeDasharray="2 2" opacity={0.7} />
        )}
        <text x={x + 9} y={y + 4} fontSize={10} fill="#1f2937" fontWeight={500} className="ops-map-label">
          {dr.driver.name ? dr.driver.name.split(" ")[0] : "Driver"}
        </text>
        {dr.delivery && (
          <text x={x + 9} y={y + 16} fontSize={9} fill="#6b7280" className="ops-map-label ops-small">
            {dr.delivery.trackingNumber}
          </text>
        )}
      </g>
    );
  });

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="ops-map-svg" preserveAspectRatio="xMidYMid meet">
      {gridLines}
      {routes}
      {dropoffMarkers}
      {pickupMarkers}
      {driverMarkers}
    </svg>
  );
}

// ─── Drivers Tab ──────────────────────────────────────────────────────────────

function DriversTab({
  drivers,
  activeDeliveries,
}: {
  drivers: DriverLocationEntry[];
  activeDeliveries: Doc<"deliveries">[];
}) {
  return (
    <div className="ops-drivers">
      <div className="ops-section-header">
        <h2 className="ops-section-title">Driver Positions</h2>
        <div className="ops-filter-group">
          <span className="ops-live-count">{drivers.length} available</span>
        </div>
      </div>

      {drivers.length > 0 ? (
        <div className="ops-drivers-grid">
          {drivers.map((dr) => {
            const freshness = freshnessState(dr.lastUpdate);
            const assignedDelivery = activeDeliveries.find((d) => d.courierId === dr.driverId);
            const inTransit = assignedDelivery && [
              DELIVERY_STATUS.EN_ROUTE_TO_PICKUP,
              DELIVERY_STATUS.IN_TRANSIT,
              DELIVERY_STATUS.AT_PICKUP,
              DELIVERY_STATUS.AT_DROPOFF,
              DELIVERY_STATUS.PICKED_UP,
              DELIVERY_STATUS.DRIVER_ACCEPTED,
            ].includes(assignedDelivery.status as any);

            return (
              <div key={dr.driverId} className={`ops-driver-card ${dr.isStale ? "stale" : ""}`}>
                <div className="ops-driver-top">
                  <div className="ops-driver-dot" style={{
                    background: dr.isStale ? "#C62828" : inTransit ? "#0A7C42" : "#0794B5",
                    boxShadow: dr.isStale ? "0 0 0 3px rgba(198,40,40,0.15)" : "none",
                  }} />
                  <div className="ops-driver-info">
                    <span className="ops-driver-name">{dr.name ?? "Driver"}</span>
                    <span className="ops-driver-id">ID {dr.driverId.slice(-6).toUpperCase()}</span>
                  </div>
                  <span className="ops-freshness-badge" style={{ color: freshnessDot(freshness) }}>
                    <Radio size={11} className={freshness === "live" ? "animate-pulse" : ""} />
                    {freshnessLabel(freshness)}
                  </span>
                </div>

                {dr.lat !== null && dr.lat !== undefined && dr.lng !== null && dr.lng !== undefined ? (
                  <div className="ops-driver-coords ops-small">
                    {dr.lat.toFixed(5)}, {dr.lng.toFixed(5)}
                  </div>
                ) : (
                  <div className="ops-driver-coords ops-small ops-muted">No location</div>
                )}

                {dr.lastUpdate !== undefined && dr.lastUpdate !== null && (
                  <div className="ops-driver-coords ops-small ops-muted">Updated {formatDateTime(dr.lastUpdate)}</div>
                )}

                {assignedDelivery ? (
                  <div className="ops-driver-active">
                    <span className="ops-driver-active-label">Active delivery</span>
                    <span className="ops-driver-active-value">{assignedDelivery.trackingNumber}</span>
                    <span className="status-badge" style={statusBadgeStyle(assignedDelivery.status)}>
                      {statusLabel(assignedDelivery.status)}
                    </span>
                  </div>
                ) : (
                  <div className="ops-driver-active ops-driver-free">
                    <span className="ops-driver-active-label">Status</span>
                    <span className="ops-driver-active-value">Available</span>
                  </div>
                )}

                {dr.totalTrips !== undefined && dr.totalTrips !== null && (
                  <div className="ops-driver-meta ops-small ops-muted">{dr.totalTrips} total trips</div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon"><Users size={24} /></div>
          <div className="empty-state-title">No driver location data</div>
          <div className="empty-state-desc">No available drivers are reporting location right now.</div>
        </div>
      )}
    </div>
  );
}

// ─── Exceptions Tab ───────────────────────────────────────────────────────────

function ExceptionsTab({
  exceptions,
  reassigningId,
  onReassign,
  onCompleteWithPOD,
  onFail,
  onCancel,
}: {
  exceptions: Array<{ kind: string; delivery: Doc<"deliveries">; driverLoc?: DriverLocationEntry; message: string }>;
  reassigningId: string | null;
  onReassign: (id: string) => void;
  onCompleteWithPOD: (id: string) => void;
  onFail: (id: string, reason: string) => void;
  onCancel: (id: string, reason: string) => void;
}) {
  return (
    <div className="ops-exceptions">
      <div className="ops-section-header">
        <h2 className="ops-section-title">Exceptions</h2>
        <span className="ops-live-count">{exceptions.length}</span>
      </div>

      {exceptions.length > 0 ? (
        <div className="ops-exceptions-list">
          {exceptions.map((e, i) => (
            <div key={i} className="ops-exception-card" style={{ "--exception-accent": exceptionKindColor(e.kind) } as React.CSSProperties}>
              <div className="ops-exception-kind" style={{
                color: exceptionKindColor(e.kind),
              }}>
                {e.kind === "failed" && <XCircle size={16} />}
                {e.kind === "reassignment_required" && <RefreshCw size={16} />}
                {e.kind === "stale_gps" && <Radio size={16} />}
                {e.kind === "no_driver" && <User size={16} />}
                {e.kind === "no_location" && <Navigation size={16} />}
                {e.kind === "offer_expired" && <Zap size={16} />}
                {e.kind === "stale_gps" || e.kind === "no_location" ? "Tracking"
                  : e.kind === "no_driver" ? "Assignment"
                    : e.kind === "offer_expired" ? "Dispatch"
                      : "Other"}
              </div>

              <div className="ops-exception-body">
                <div className="ops-exception-title">{e.message}</div>
                <div className="ops-exception-meta">
                  <span className="ops-exception-tracking">{e.delivery.trackingNumber}</span>
                  <span className="ops-exception-status">{statusLabel(e.delivery.status)}</span>
                  {e.delivery.courierId ? (
                    <span className="ops-exception-driver">Driver: {e.delivery.courierId.slice(-6).toUpperCase()}</span>
                  ) : (
                    <span className="ops-exception-driver ops-muted">No driver assigned</span>
                  )}
                  {e.driverLoc && (
                    <span className="ops-exception-location ops-small ops-muted">
                      Last location: {e.driverLoc.lastUpdate ? formatDateTime(e.driverLoc.lastUpdate) : "never"}
                    </span>
                  )}
                </div>
              </div>

              <div className="ops-exception-actions">
                {e.kind === "reassignment_required" && (
                  <button
                    className="ops-btn ops-btn-sm"
                    disabled={reassigningId === e.delivery._id}
                    onClick={() => onReassign(e.delivery._id)}
                  >
                    {reassigningId === e.delivery._id ? (
                      <><RefreshCw size={14} className="animate-spin" />Reassigning…</>
                    ) : (
                      <><RefreshCw size={14} />Reassign<ArrowRight size={14} /></>
                    )}
                  </button>
                )}
                {e.delivery.status === DELIVERY_STATUS.AT_DROPOFF && (
                  <button
                    className="ops-btn ops-btn-sm"
                    disabled={reassigningId === e.delivery._id}
                    onClick={() => onCompleteWithPOD(e.delivery._id)}
                  >
                    <CheckSquare size={14} />Complete via POD
                  </button>
                )}
                {(() => {
                  const failable = [
                    DELIVERY_STATUS.AT_PICKUP,
                    DELIVERY_STATUS.PICKED_UP,
                    DELIVERY_STATUS.IN_TRANSIT,
                    DELIVERY_STATUS.AT_DROPOFF,
                  ];
                  return failable.includes(e.delivery.status as any) ? (
                    <button
                      className="ops-btn ops-btn-sm"
                      onClick={() =>
                        onFail(
                          e.delivery._id,
                          "Reported by operations: delivery compromised",
                        )
                      }
                    >
                      <Ban size={14} />Fail delivery
                    </button>
                  ) : null;
                })()}
                {e.delivery.status === DELIVERY_STATUS.ASSIGNED && (
                  <button
                    className="ops-btn ops-btn-sm"
                    onClick={() => onCancel(e.delivery._id, "Cancelled by operations")}
                  >
                    <XCircle size={14} />Cancel
                  </button>
                )}
                {e.kind === "stale_gps" && (
                  <button className="ops-btn ops-btn-sm" disabled>Investigate</button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon"><CheckCircle size={24} /></div>
          <div className="empty-state-title">No exceptions</div>
          <div className="empty-state-desc">All active deliveries and drivers are operating normally.</div>
        </div>
      )}
    </div>
  );
}

// ─── History Tab ──────────────────────────────────────────────────────────────

type HistoryRow = {
  _id: Id<"deliveries">;
  trackingNumber: string;
  status: string;
  startedAt?: number | null;
  completedAt?: number | null;
  courierId?: Id<"users"> | null;
};

function HistoryTab({
  drivers,
}: {
  drivers: DriverLocationEntry[];
}) {
  const operationalHistory = useQuery(
    api.deliveries.state_machine.getOperationalDeliveryHistory,
    {},
  );

  const historyList: Array<HistoryRow> = operationalHistory?.items ?? [];

  const completedCount = historyList.filter((d) => d.status === DELIVERY_STATUS.DELIVERED).length;
  const failedCount = historyList.filter((d) => d.status === DELIVERY_STATUS.FAILED).length;
  const cancelledCount = historyList.filter((d) => d.status === DELIVERY_STATUS.CANCELLED).length;

  return (
    <div className="ops-history">
      <div className="ops-section-header">
        <h2 className="ops-section-title">Delivery History</h2>
        <div className="ops-filter-group">
          <span className="ops-live-count">{historyList.length} shown</span>
        </div>
      </div>

      <div className="ops-history-summary">
        <div className="ops-history-summary-item"><CheckCircle size={16} style={{ color: "#0A7C42" }} /><span>{completedCount} delivered</span></div>
        <div className="ops-history-summary-item"><XCircle size={16} style={{ color: "#C62828" }} /><span>{failedCount} failed</span></div>
        <div className="ops-history-summary-item"><Clock size={16} style={{ color: "#666" }} /><span>{cancelledCount} cancelled</span></div>
      </div>

      {historyList.length > 0 ? (
        <table className="data-table">
          <thead>
            <tr>
              <th>Tracking #</th>
              <th>Delivery</th>
              <th>Status</th>
              <th>Started</th>
              <th>Completed</th>
              <th>Driver</th>
            </tr>
          </thead>
          <tbody>
            {historyList.map((d) => {
              const driverName = drivers.find((dr) => dr.driverId === d.courierId)?.name ?? "—";
              return (
                <tr key={d._id}>
                  <td style={{ fontWeight: 600 }}>{d.trackingNumber}</td>
                  <td>{d._id.slice(-6).toUpperCase()}</td>
                  <td><span className="status-badge" style={statusBadgeStyle(d.status)}>{statusLabel(d.status)}</span></td>
                  <td>{d.startedAt ? formatDateTime(d.startedAt) : "—"}</td>
                  <td>{d.completedAt ? formatDateTime(d.completedAt) : "—"}</td>
                  <td>{driverName}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <div className="empty-state">
          <div className="empty-state-icon"><Clock size={24} /></div>
          <div className="empty-state-title">No delivery history</div>
          <div className="empty-state-desc">Completed, failed and cancelled deliveries will appear here.</div>
        </div>
      )}
    </div>
  );
}
