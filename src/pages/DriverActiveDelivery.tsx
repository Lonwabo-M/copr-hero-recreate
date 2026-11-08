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
 * - Location reporting is continuous while the delivery is in a trackable
 *   state (`useDriverLocationTracking`): `navigator.geolocation.watchPosition()`
 *   with client-side throttling, sent through the existing
 *   `tracking.mutations.updateDeliveryLocation` Convex mutation. The watcher is
 *   cleared when the delivery leaves a trackable state or the page unmounts.
 * - Navigation links open Google Maps directions for pickup/dropoff.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import DriverShell from "@/components/shells/DriverShell";
import {
  Loader2,
  Package,
  MapPin,
  Navigation,
  Clock,
  Box,
  CheckCircle2,
  Circle,
  AlertTriangle,
  ExternalLink,
  ShieldCheck,
  Camera,
  FileText,
  ClipboardCheck,
  PenLine,
  Upload,
  Check,
  Phone,
} from "lucide-react";
import {
  DELIVERY_STATUS,
  VALID_TRANSITIONS,
} from "@/convex/schema";
import {
  useDriverLocationTracking,
  TRACKING_STATUS_COPY,
  type TrackingState,
} from "@/hooks/useDriverLocationTracking";
import {
  useRequireOnline,
  useConnectivity,
  useOfflineGPSCount,
  clearDeliveryOfflineBuffer,
} from "@/hooks/use-offline";
import {
  WifiOff,
  CloudUpload,
} from "lucide-react";
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

/** Statuses in which continuous location tracking runs. Mirrors the
 *  backend's trackable-status list in `tracking.mutations` — the server
 *  remains authoritative and re-validates every update. */
const TRACKABLE_STATUSES: ReadonlySet<Status> = new Set<Status>([
  DELIVERY_STATUS.ASSIGNED,
  DELIVERY_STATUS.DRIVER_ACCEPTED,
  DELIVERY_STATUS.EN_ROUTE_TO_PICKUP,
  DELIVERY_STATUS.AT_PICKUP,
  DELIVERY_STATUS.PICKED_UP,
  DELIVERY_STATUS.IN_TRANSIT,
  DELIVERY_STATUS.AT_DROPOFF,
]);

/** Dot colour class for each tracking status. */
const TRACKING_DOT_CLASS: Record<TrackingState, string> = {
  idle: "off",
  starting: "pending",
  waiting: "on",
  sent: "on",
  buffered: "pending",
  denied: "error",
  error: "error",
  unsupported: "off",
};

const STATUS_COPY: Partial<Record<Status, string>> = {
  [DELIVERY_STATUS.ASSIGNED]: "A delivery has been assigned to you. Accept it to begin.",
  [DELIVERY_STATUS.DRIVER_ACCEPTED]: "Accepted. Start driving to the pickup location when ready.",
  [DELIVERY_STATUS.EN_ROUTE_TO_PICKUP]: "En route to pickup. Confirm arrival when you reach the location.",
  [DELIVERY_STATUS.AT_PICKUP]: "You're at the pickup location. Confirm once you have the package.",
  [DELIVERY_STATUS.PICKED_UP]: "Package collected. Start the delivery trip to the dropoff.",
  [DELIVERY_STATUS.IN_TRANSIT]: "In transit to the dropoff location. Drive safely.",
  [DELIVERY_STATUS.AT_DROPOFF]: "You're at the dropoff. Complete the delivery once handed over.",
};

const FAILURE_REASONS = [
  { value: "recipient_unavailable", label: "Recipient not available" },
  { value: "incorrect_address", label: "Address is incorrect" },
  { value: "refused_delivery", label: "Recipient refused the delivery" },
  { value: "damaged_goods", label: "Goods damaged" },
  { value: "missing_goods", label: "Goods missing" },
  { value: "vehicle_problem", label: "Vehicle problem" },
  { value: "safety_issue", label: "Safety issue" },
  { value: "other", label: "Other" },
] as const;

type FailureReason = (typeof FAILURE_REASONS)[number]["value"];

export default function DriverActiveDelivery() {
  const [error, setError] = useState<string | null>(null);
  const [actionPending, setActionPending] = useState<string | null>(null);

  // ─── Convex reactive data (session-derived; no client-supplied IDs) ────────
  const active = useQuery(api.tracking.queries.getMyCurrentDelivery, {});
  const deliveryId = active?.delivery?.id ?? null;
  const tracking = useQuery(
    api.tracking.queries.getDeliveryTracking,
    deliveryId ? { deliveryId } : "skip"
  );
  const existingPOD = useQuery(
    api.pod.service.getPODForDelivery,
    deliveryId ? { deliveryId } : "skip"
  );

  // State-machine transition mutations (existing domain operations)
  const acceptAssignment = useMutation(api.deliveries.state_machine.acceptAssignment);
  const startEnRouteToPickup = useMutation(api.deliveries.state_machine.startEnRouteToPickup);
  const arriveAtPickup = useMutation(api.deliveries.state_machine.arriveAtPickup);
  const pickupPackage = useMutation(api.deliveries.state_machine.pickupPackage);
  const startTrip = useMutation(api.deliveries.state_machine.startTrip);
  const arriveAtDropoff = useMutation(api.deliveries.state_machine.arriveAtDropoff);
  const completeDelivery = useMutation(api.deliveries.state_machine.completeDelivery);
  const rejectAssignment = useMutation(api.deliveries.state_machine.rejectAssignment);

  // POD mutations (existing POD backend)
  const createPOD = useMutation(api.pod.service.createPOD);
  const addPODEvidence = useMutation(api.pod.service.addPODEvidence);
  const generateUploadUrl = useMutation(api.pod.service.generateUploadUrl);
  const recordFailedDelivery = useMutation(api.pod.service.recordFailedDelivery);

  const mutations: Record<string, (args: { deliveryId: any }) => Promise<unknown>> = useMemo(
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

  // Failed delivery flow. Without this the driver is stuck at AT_DROPOFF when
  // the recipient refuses the parcel or is unavailable: completeDelivery requires
  // a successful POD, and the UI previously offered no failure path at all.
  const [showFailureForm, setShowFailureForm] = useState(false);
  const [failureReason, setFailureReason] = useState<FailureReason>("recipient_unavailable");
  const [failureNotes, setFailureNotes] = useState("");
  const [failurePending, setFailurePending] = useState(false);
  const [failureSuccess, setFailureSuccess] = useState(false);

  // ─── Offline resilience state ───────────────────────────────────────────
  // Delivery state transitions, offer accept/reject and POD submission are
  // concurrency-sensitive — they require live connectivity (the server must
  // confirm current state). Only GPS is buffered offline. The page renders
  // the last server-confirmed state read-only while offline and clearly
  // labels local-only state ("pending local action") without ever claiming
  // server-confirmed completion.
  const { isOnline, offlineMessage } = useRequireOnline();
  const { state: connectivityState, isOffline } = useConnectivity();
  const buffered = useOfflineGPSCount(deliveryId);

  // ─── Continuous GPS tracking (existing tracking backend) ─────────────────
  // Starts only with a trackable delivery, stops on completion/failure/
  // rejection/unmount. The hook owns the watcher lifecycle and throttling;
  // the server re-validates every update authoritatively.
  const trackingActive = status !== null && TRACKABLE_STATUSES.has(status);
  const { status: trackingStatus } = useDriverLocationTracking({
    deliveryId,
    active: trackingActive,
  });
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
      if (e.type !== "location_update") {
        items.push({ time: e.timestamp, text: `Status: ${e.type.replace(/_/g, " ")}` });
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
      if (!isOnline) {
        // State transitions are never queueable offline: a delayed replay
        // could be invalid against the server's CURRENT state.
        setError(
          "You're offline. Delivery actions need a connection — your location is still being saved and will sync automatically."
        );
        return;
      }
      setActionPending(operation);
      try {
        await mutations[operation]({ deliveryId });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update delivery");
      } finally {
        setActionPending(null);
      }
    },
    [deliveryId, mutations, isOnline]
  );

  const handleReject = useCallback(async () => {
    if (!deliveryId) return;
    setError(null);
    if (!isOnline) {
      // Rejecting releases an assignment for re-dispatch — concurrency-
      // sensitive, requires connectivity.
      setError(
        "You're offline. Rejecting needs a connection — your location is still being saved and will sync automatically."
      );
      return;
    }
    setActionPending("rejectAssignment");
    try {
      await rejectAssignment({ deliveryId, reason: "Rejected by driver from active delivery view" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject assignment");
    } finally {
      setActionPending(null);
    }
  }, [deliveryId, rejectAssignment, isOnline]);

  const handleFailureSubmit = useCallback(async () => {
    if (!deliveryId) return;
    setError(null);
    if (!isOnline) {
      setError(
        "You're offline. Recording a failed delivery needs a connection — your location is still being saved and will sync automatically."
      );
      return;
    }
    setFailurePending(true);
    try {
      await recordFailedDelivery({
        deliveryId,
        failureReason,
        failureNotes: failureNotes.trim() || undefined,
      });
      setShowFailureForm(false);
      setFailureNotes("");
      setFailureSuccess(true);
      setTimeout(() => setFailureSuccess(false), 6000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record the delivery failure");
    } finally {
      setFailurePending(false);
    }
  }, [deliveryId, failureReason, failureNotes, recordFailedDelivery, isOnline]);

  // ─── POD submission ────────────────────────────────────────────────────
  // Flow (all server-validated, existing POD backend):
  //   1. generateUploadUrl → Convex File Storage upload URL
  //   2. POST file directly to storage (credentials never touch React)
  //   3. createPOD → idempotent POD record (authorization + state checked)
  //   4. addPODEvidence per file → server re-validates size/MIME/type
  //   5. completeDelivery → server requires the POD to exist (authoritative)

  const [podRecipient, setPodRecipient] = useState("");
  const [podNotes, setPodNotes] = useState("");
  const [podFiles, setPodFiles] = useState<File[]>([]);
  // Uploaded storage IDs + attachment progress survive a retry so a failure
  // halfway through evidence attachment does not re-upload and duplicate files.
  const podUploadsRef = useRef<
    { file: File; storageId: string; name: string; size: number; mime: string; attached: boolean }[]
  >([]);
  const [podPhase, setPodPhase] = useState<
    null | "uploading" | "creating" | "evidence" | "completing"
  >(null);
  const [podSuccess, setPodSuccess] = useState(false);
  const podBusy = podPhase !== null;

  const showPODForm =
    status === DELIVERY_STATUS.AT_DROPOFF && !podSuccess && !showFailureForm;

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    // Client-side pre-check for UX; server re-validates authoritatively.
    const MAX = 10 * 1024 * 1024;
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    const valid: File[] = [];
    for (const f of Array.from(files)) {
      if (f.size > MAX) {
        setError(`${f.name} exceeds the 10MB limit`);
        continue;
      }
      if (!allowed.includes(f.type)) {
        setError(`${f.name} is not a supported file type (JPEG, PNG, WebP, PDF)`);
        continue;
      }
      valid.push(f);
    }
    if (valid.length > 0) {
      setError(null);
      // The picker changes the file set, so any uploads from a previous
      // incomplete attempt no longer line up with it.
      podUploadsRef.current = [];
      setPodFiles((prev) => [...prev, ...valid].slice(0, 5));
    }
  };

  const handlePodSubmit = useCallback(async () => {
    if (!deliveryId) return;
    setError(null);

    if (!podRecipient.trim()) {
      setError("Recipient name is required");
      return;
    }

    // POD submission is never claimable offline: completion must be confirmed
    // by Convex (upload → POD record → evidence → completeDelivery, all
    // server-validated). This handler only ever runs with connectivity.
    if (!isOnline) {
      setError(
        "You're offline. Proof-of-delivery submission needs a connection — your location is still being saved and will sync automatically."
      );
      return;
    }

    try {
      // 1–2. Upload each file to Convex File Storage. If this is a retry after
      // a partial failure, reuse the storage IDs already obtained instead of
      // uploading the same evidence again.
      const filesUnchanged =
        podUploadsRef.current.length === podFiles.length &&
        podFiles.every((file, i) => podUploadsRef.current[i]?.file === file);
      if (!filesUnchanged) {
        podUploadsRef.current = [];
        setPodPhase("uploading");
        for (const file of podFiles) {
          const uploadUrl = await generateUploadUrl();
          const result = await fetch(uploadUrl, {
            method: "POST",
            headers: { "Content-Type": file.type },
            body: file,
          });
          if (!result.ok) {
            throw new Error(`Upload failed for ${file.name}`);
          }
          const { storageId } = (await result.json()) as { storageId: string };
          podUploadsRef.current.push({
            file,
            storageId,
            name: file.name,
            size: file.size,
            mime: file.type,
            attached: false,
          });
        }
      }

      // 3. Create the idempotent POD record
      setPodPhase("creating");
      const { podId } = await createPOD({
        deliveryId,
        outcome: "delivered",
        recipientName: podRecipient.trim(),
        deliveryNotes: podNotes.trim() || undefined,
      });

      // 4. Attach evidence (server re-validates size/MIME and treats an
      // already-attached storage ID as idempotent).
      if (podUploadsRef.current.length > 0) {
        setPodPhase("evidence");
        for (const meta of podUploadsRef.current) {
          if (meta.attached) continue;
          await addPODEvidence({
            podId,
            fileId: meta.storageId,
            fileType: meta.mime === "application/pdf" ? "document" : "photo",
            fileName: meta.name,
            fileSize: meta.size,
            mimeType: meta.mime,
          });
          meta.attached = true;
        }
      }

      // 5. Complete the delivery — server verifies the POD exists
      setPodPhase("completing");
      await completeDelivery({ deliveryId });

      podUploadsRef.current = [];
      setPodSuccess(true);
      setPodFiles([]);
      setPodRecipient("");
      setPodNotes("");
      setTimeout(() => setPodSuccess(false), 6000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "POD submission failed");
    } finally {
      setPodPhase(null);
    }
  }, [deliveryId, podRecipient, podNotes, podFiles, generateUploadUrl, createPOD, addPODEvidence, completeDelivery, isOnline]);

  // Recipient name + notes + selected files are safe to PREPARE offline
  // (they already live in local component state); the submission button
  // stays disabled offline and nothing is claimed as submitted until the
  // server confirms each step. No offline file persistence is added — the
  // existing flow uploads directly to Convex File Storage and a temporary
  // disconnection at dropoff does not justify an offline evidence store.

  // ─── Terminal-state buffer cleanup ─────────────────────────────────────
  // When the delivery reaches a terminal state, discard any GPS still
  // buffered for it — queued points for a finished delivery are irrelevant
  // and must never be replayed against another delivery.
  const isTerminal =
    status === DELIVERY_STATUS.DELIVERED ||
    status === DELIVERY_STATUS.FAILED ||
    status === DELIVERY_STATUS.CANCELLED;
  useEffect(() => {
    if (isTerminal && deliveryId) {
      void clearDeliveryOfflineBuffer(deliveryId);
    }
  }, [isTerminal, deliveryId]);

  // ─── Helpers ───────────────────────────────────────────────────────────

  const formatTime = (timestamp?: number) =>
    timestamp
      ? new Date(timestamp).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })
      : null;

  const mapsUrl = (lat?: number, lng?: number) =>
    lat !== undefined && lng !== undefined
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`
      : null;

  const formatAddress = (
    address: { street: string; city: string; state?: string | null; zip?: string } | null,
    lat?: number,
    lng?: number,
  ) => {
    if (address) {
      return [address.street, address.city, address.state, address.zip]
        .filter(Boolean)
        .join(", ");
    }
    return lat !== undefined && lng !== undefined
      ? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
      : "Address unavailable";
  };

  const currentStepIndex = status ? PROGRESS_STEPS.findIndex((s) => s.status === status) : -1;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <DriverShell activeItem="Active Delivery">
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
            ) : /* Empty state — after POD completion the active query goes
                   null immediately, so keep the confirmation visible for a
                   moment instead of replacing it with "No active delivery". */
            !delivery ? failureSuccess ? (
              <div className="driver-panel" style={{ borderColor: "rgba(220, 38, 38, 0.35)" }}>
                <AlertTriangle size={26} style={{ color: "#b91c1c", margin: "0 auto" }} />
                <div className="driver-panel-title">Delivery recorded as failed</div>
                <div className="driver-panel-desc">
                  Operations have been notified and will follow up. You can return
                  to the Driver Home screen for your next assignment.
                </div>
              </div>
            ) : podSuccess ? (
              <div className="driver-panel" style={{ borderColor: "rgba(22, 163, 74, 0.4)" }}>
                <CheckCircle2 size={26} style={{ color: "#16a34a", margin: "0 auto" }} />
                <div className="driver-panel-title">Delivery completed</div>
                <div className="driver-panel-desc">
                  Proof of delivery recorded. Your earnings will appear after the
                  settlement is processed.
                </div>
              </div>
            ) : (
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

                {/* Offline notice: last known server state vs pending local
                    action — never fabricate server-confirmed state offline. */}
                {isOffline && (
                  <div className="driver-safety-note" role="status">
                    <WifiOff size={14} />
                    <span>
                      You're offline — showing the last known server state.
                      Delivery actions need a connection; your location is being
                      buffered and will sync automatically{buffered > 0 ? ` (${buffered} pending)` : ""}.
                    </span>
                  </div>
                )}
                {!isOffline && buffered > 0 && (
                  <div className="driver-safety-note" role="status">
                    <CloudUpload size={14} />
                    <span>
                      {buffered} buffered location{buffered === 1 ? "" : "s"} syncing…
                    </span>
                  </div>
                )}

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

                {/* Primary action card — next valid state transition only.
                    At dropoff, the primary action moves into the POD card. */}
                {status !== DELIVERY_STATUS.AT_DROPOFF && (
                  <div className="driver-action-card">
                    <p className="driver-action-hint">{status ? STATUS_COPY[status] : null}</p>
                    {action ? (
                      <div className="driver-action-row">
                        <button
                          className="driver-primary-btn"
                          onClick={() => handleAction(action.operation)}
                          disabled={actionPending !== null || podBusy || !isOnline}
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
                            disabled={actionPending !== null || !isOnline}
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
                )}

                {/* Proof of Delivery — required at dropoff before completion */}
                {showPODForm && (
                  <div className="driver-action-card">
                    <div className="driver-location-head">
                      <ClipboardCheck size={16} style={{ color: "var(--primary)" }} />
                      <span className="driver-timeline-title" style={{ marginBottom: 0 }}>
                        Proof of Delivery
                      </span>
                    </div>
                    <p className="driver-action-hint">
                      Record the handover, then complete the delivery. Proof of delivery is required
                      by the system before completion.
                    </p>

                    <div style={{ display: "grid", gap: 12, marginBottom: 14 }}>
                      <div>
                        <label className="driver-detail-label" htmlFor="pod-recipient">
                          Recipient name *
                        </label>
                        <input
                          id="pod-recipient"
                          type="text"
                          className="settings-input"
                          style={{ width: "100%" }}
                          placeholder="Who received the package?"
                          value={podRecipient}
                          onChange={(e) => setPodRecipient(e.target.value)}
                          disabled={podBusy}
                        />
                      </div>
                      <div>
                        <label className="driver-detail-label" htmlFor="pod-notes">
                          Delivery notes
                        </label>
                        <input
                          id="pod-notes"
                          type="text"
                          className="settings-input"
                          style={{ width: "100%" }}
                          placeholder="Optional notes (e.g. left with reception)"
                          value={podNotes}
                          onChange={(e) => setPodNotes(e.target.value)}
                          disabled={podBusy}
                        />
                      </div>
                    </div>

                    {/* File capture / upload */}
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "12px 16px",
                        border: "1px dashed var(--border)",
                        borderRadius: 10,
                        cursor: podBusy ? "not-allowed" : "pointer",
                        color: "var(--text-secondary)",
                        fontSize: 13,
                        marginBottom: 12,
                        opacity: podBusy ? 0.6 : 1,
                      }}
                    >
                      <Camera size={16} />
                      Add photo or document (max 5 files, 10MB each)
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        multiple
                        capture="environment"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          handleFileSelect(e.target.files);
                          e.target.value = "";
                        }}
                        disabled={podBusy}
                      />
                    </label>

                    {podFiles.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                        {podFiles.map((f, i) => (
                          <span
                            key={`${f.name}-${i}`}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 12,
                              color: "var(--text-primary)",
                              background: "var(--surface-muted)",
                              border: "1px solid var(--border-light)",
                              borderRadius: 6,
                              padding: "4px 8px",
                            }}
                          >
                            {f.type === "application/pdf" ? <FileText size={12} /> : <Camera size={12} />}
                            {f.name.length > 22 ? `${f.name.slice(0, 20)}…` : f.name}
                            {!podBusy && (
                              <button
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--text-muted)" }}
                                onClick={() => {
                                  podUploadsRef.current = [];
                                  setPodFiles((prev) => prev.filter((_, j) => j !== i));
                                }}
                                aria-label={`Remove ${f.name}`}
                              >
                                ×
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="driver-action-row">
                      <button
                        className="driver-primary-btn"
                        onClick={handlePodSubmit}
                        disabled={podBusy || !isOnline}
                      >
                        {podBusy ? (
                          <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                        ) : (
                          <CheckCircle2 size={16} />
                        )}
                        {podPhase === "uploading"
                          ? "Uploading proof..."
                          : podPhase === "creating"
                          ? "Recording POD..."
                          : podPhase === "evidence"
                          ? "Attaching files..."
                          : podPhase === "completing"
                          ? "Completing delivery..."
                          : "Submit POD & Complete"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Failed-delivery path. This is the only way to close a
                    delivery when the recipient refuses or cannot receive it. */}
                {status === DELIVERY_STATUS.AT_DROPOFF && !podSuccess && (
                  <div className="driver-action-card">
                    {!showFailureForm ? (
                      <div className="driver-action-row">
                        <button
                          type="button"
                          className="driver-secondary-btn"
                          onClick={() => setShowFailureForm(true)}
                          disabled={podBusy || failurePending || !isOnline}
                        >
                          <AlertTriangle size={16} />
                          Delivery can't be completed
                        </button>
                      </div>
                    ) : (
                      <div>
                        <div className="driver-timeline-title" style={{ marginBottom: 4 }}>
                          Report a failed delivery
                        </div>
                        <p className="driver-action-hint">
                          Use this only when the parcel cannot be handed over. The
                          delivery will be closed as failed and operations will follow up.
                        </p>

                        <label className="driver-detail-label" htmlFor="failure-reason">
                          Reason *
                        </label>
                        <select
                          id="failure-reason"
                          className="settings-input"
                          style={{ width: "100%", marginBottom: 12 }}
                          value={failureReason}
                          onChange={(e) => setFailureReason(e.target.value as FailureReason)}
                          disabled={failurePending}
                        >
                          {FAILURE_REASONS.map((reason) => (
                            <option key={reason.value} value={reason.value}>
                              {reason.label}
                            </option>
                          ))}
                        </select>

                        <label className="driver-detail-label" htmlFor="failure-notes">
                          Notes
                        </label>
                        <textarea
                          id="failure-notes"
                          className="settings-input"
                          style={{ width: "100%", minHeight: 76, resize: "vertical", marginBottom: 12 }}
                          placeholder="What happened? (optional)"
                          value={failureNotes}
                          onChange={(e) => setFailureNotes(e.target.value)}
                          maxLength={500}
                          disabled={failurePending}
                        />

                        <div className="driver-action-row">
                          <button
                            type="button"
                            className="driver-secondary-btn"
                            onClick={handleFailureSubmit}
                            disabled={failurePending || !isOnline}
                          >
                            {failurePending ? (
                              <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                            ) : (
                              <AlertTriangle size={16} />
                            )}
                            {failurePending ? "Recording…" : "Record failed delivery"}
                          </button>
                          <button
                            type="button"
                            className="driver-secondary-btn"
                            onClick={() => setShowFailureForm(false)}
                            disabled={failurePending}
                            style={{ color: "var(--text-secondary)", borderColor: "var(--border)" }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* POD submitted confirmation */}
                {podSuccess && (
                  <div className="driver-action-card" style={{ borderColor: "rgba(22, 163, 74, 0.4)" }}>
                    <div className="driver-action-row" style={{ alignItems: "center" }}>
                      <Check size={18} style={{ color: "#16a34a" }} />
                      <span style={{ fontSize: 14, fontWeight: 600, color: "#16a34a" }}>
                        Proof of delivery recorded. Delivery completed.
                      </span>
                    </div>
                  </div>
                )}

                {/* Previously submitted POD info */}
                {existingPOD && !podSuccess && (
                  <div className="driver-timeline" style={{ marginBottom: 16 }}>
                    <div className="driver-timeline-title">
                      <PenLine size={13} style={{ display: "inline", marginRight: 6 }} />
                      Proof of delivery on record
                    </div>
                    <div className="driver-timeline-item">
                      <span className="driver-timeline-time">
                        {new Date(existingPOD.createdAt).toLocaleString("en-ZA", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="driver-timeline-text">
                        {existingPOD.outcome === "delivered"
                          ? `Delivered to ${existingPOD.recipientName}`
                          : `Outcome: ${existingPOD.outcome}`}
                        {existingPOD.files?.length > 0 && ` · ${existingPOD.files.length} file(s) attached`}
                      </span>
                    </div>
                  </div>
                )}

                {/* Locations */}
                <div className="driver-locations">
                  <div className="driver-location-card">
                    <div className="driver-location-head">
                      <span className="driver-location-tag">Pickup</span>
                    </div>
                    <div className="driver-location-address">
                      {formatAddress(
                        delivery.pickupAddress,
                        delivery.pickupLat,
                        delivery.pickupLng,
                      )}
                    </div>
                    {(delivery.senderName || delivery.senderPhone) && (
                      <div className="driver-contact-row">
                        <Phone size={13} />
                        <span>{delivery.senderName ?? "Pickup contact"}</span>
                        {delivery.senderPhone && (
                          <a
                            className="driver-contact-link"
                            href={`tel:${delivery.senderPhone}`}
                          >
                            Call
                          </a>
                        )}
                      </div>
                    )}
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
                      {formatAddress(
                        delivery.dropoffAddress,
                        delivery.dropoffLat,
                        delivery.dropoffLng,
                      )}
                    </div>
                    {(delivery.recipientName || delivery.recipientPhone) && (
                      <div className="driver-contact-row">
                        <Phone size={13} />
                        <span>{delivery.recipientName ?? "Recipient"}</span>
                        {delivery.recipientPhone && (
                          <a
                            className="driver-contact-link"
                            href={`tel:${delivery.recipientPhone}`}
                          >
                            Call
                          </a>
                        )}
                      </div>
                    )}
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
                      {[
                        tracking?.order?.expeditionType
                          ? tracking.order.expeditionType.replace(/_/g, " ")
                          : "Standard handling",
                        delivery.weightKg != null ? `${delivery.weightKg} kg` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>

                  <div className="driver-detail-card">
                    <div className="driver-detail-label">
                      <Clock size={12} style={{ display: "inline", marginRight: 4 }} />
                      Scheduled
                    </div>
                    <div className="driver-detail-value">
                      {delivery.estimatedArrival ? formatTime(delivery.estimatedArrival) : "—"}
                    </div>
                    <div className="driver-detail-sub">Estimated arrival</div>
                  </div>

                  <div className="driver-detail-card">
                    <div className="driver-detail-label">
                      <PenLine size={12} style={{ display: "inline", marginRight: 4 }} />
                      Picked up
                    </div>
                    <div className="driver-detail-value">
                      {status &&
                      ([
                        DELIVERY_STATUS.PICKED_UP,
                        DELIVERY_STATUS.IN_TRANSIT,
                        DELIVERY_STATUS.AT_DROPOFF,
                        DELIVERY_STATUS.DELIVERED,
                      ] as string[]).includes(status) &&
                      delivery.startedAt
                        ? formatTime(delivery.startedAt)
                        : "—"}
                    </div>
                    <div className="driver-detail-sub">Pickup time</div>
                  </div>
                </div>

                {/* Location tracking (existing tracking backend) */}
                <div className="driver-action-card" style={{ padding: 16 }}>
                  <div className="driver-tracking-status">
                    <span className={`driver-tracking-dot ${TRACKING_DOT_CLASS[trackingStatus.state]}`} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="driver-tracking-label">
                        {TRACKING_STATUS_COPY[trackingStatus.state]}
                      </div>
                      {trackingStatus.state === "error" && trackingStatus.message && (
                        <div className="driver-tracking-meta">{trackingStatus.message}</div>
                      )}
                    </div>
                    {trackingStatus.lastSentAt && (
                      <span className="driver-tracking-meta">
                        Last update {formatTime(trackingStatus.lastSentAt)}
                      </span>
                    )}
                  </div>
                  <p className="driver-tracking-hint">
                    {trackingActive
                      ? "Your position is shared with operations while this delivery is active."
                      : "Location sharing starts automatically when you have an active delivery."}
                  </p>
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
    </DriverShell>
  );
}
