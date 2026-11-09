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
  ClipboardCheck,
  PenLine,
  Check,
  Phone,
  LocateFixed,
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
import SignaturePad from "@/components/pod/SignaturePad";
import PODSummary from "@/components/pod/PODSummary";
import {
  POD_ACCEPT,
  POD_MAX_PHOTOS,
  validatePODPhoto,
  validatePODSubmission,
} from "@/lib/pod";
import "@/styles/dashboard.css";
import "@/styles/pages.css";
import "@/styles/driver.css";
import "@/styles/pod.css";

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
  // AT_DROPOFF has no standalone completion action: the POD form below is the
  // only path to completion, and the server requires evidence for it.
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

interface PODLocation {
  lat: number;
  lng: number;
  accuracy?: number;
}

/**
 * Ask the browser for a one-off handover fix. Location is supplemental
 * evidence: denial or timeout never blocks a valid POD submission.
 */
function requestPODLocation(): Promise<PODLocation | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: Number.isFinite(position.coords.accuracy)
            ? position.coords.accuracy
            : undefined,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 6_000, maximumAge: 30_000 },
    );
  });
}

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
  const rejectAssignment = useMutation(api.deliveries.state_machine.rejectAssignment);

  // POD mutations. Completion is atomic: evidence records, delivery transition,
  // notification, audit, and settlement commit together server-side.
  const completeDeliveryWithPOD = useMutation(api.pod.service.completeDeliveryWithPOD);
  const generateUploadUrl = useMutation(api.pod.service.generateUploadUrl);
  const recordFailedDelivery = useMutation(api.pod.service.recordFailedDelivery);

  const uploadPODBody = useCallback(
    async (body: Blob, fileName: string, contentType: string): Promise<string> => {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body,
      });
      if (!result.ok) {
        throw new Error(`Upload failed for ${fileName}`);
      }
      const { storageId } = (await result.json()) as { storageId?: string };
      if (!storageId) {
        throw new Error(`Upload did not return a storage id for ${fileName}`);
      }
      return storageId;
    },
    [generateUploadUrl],
  );

  const mutations: Record<string, (args: { deliveryId: any }) => Promise<unknown>> = useMemo(
    () => ({
      acceptAssignment,
      startEnRouteToPickup,
      arriveAtPickup,
      pickupPackage,
      startTrip,
      arriveAtDropoff,
    }),
    [
      acceptAssignment,
      startEnRouteToPickup,
      arriveAtPickup,
      pickupPackage,
      startTrip,
      arriveAtDropoff,
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
  const [failureFiles, setFailureFiles] = useState<File[]>([]);
  const failureUploadsRef = useRef<Array<{ file: File; storageId: string }>>([]);
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
      const photoFileIds: string[] = [];
      for (const file of failureFiles) {
        let uploaded = failureUploadsRef.current.find(
          (entry) => entry.file === file,
        );
        if (!uploaded) {
          const storageId = await uploadPODBody(file, file.name, file.type);
          uploaded = { file, storageId };
          failureUploadsRef.current.push(uploaded);
        }
        photoFileIds.push(uploaded.storageId);
      }

      await recordFailedDelivery({
        deliveryId,
        failureReason,
        failureNotes: failureNotes.trim() || undefined,
        photoFileIds: photoFileIds.length > 0 ? photoFileIds : undefined,
      });
      failureUploadsRef.current = [];
      setFailureFiles([]);
      setShowFailureForm(false);
      setFailureNotes("");
      setFailureSuccess(true);
      setTimeout(() => setFailureSuccess(false), 6000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record the delivery failure");
    } finally {
      setFailurePending(false);
    }
  }, [deliveryId, failureReason, failureNotes, failureFiles, uploadPODBody, recordFailedDelivery, isOnline]);

  // ─── POD capture and atomic submission ─────────────────────────────────
  // Architecture: the browser uploads immutable evidence objects to Convex
  // storage, then calls one atomic mutation that validates every storage id,
  // creates the POD + file records, transitions the delivery, and emits the
  // audit/tracking/settlement side effects. No partial POD can become visible.

  const [podRecipient, setPodRecipient] = useState("");
  const [podRecipientPhone, setPodRecipientPhone] = useState("");
  const [podNotes, setPodNotes] = useState("");
  const [podSignature, setPodSignature] = useState<string | null>(null);
  const [podFiles, setPodFiles] = useState<File[]>([]);
  const [podLocation, setPodLocation] = useState<PODLocation | null>(null);
  const [podLocationState, setPodLocationState] = useState<
    "idle" | "capturing" | "captured" | "unavailable"
  >("idle");

  // Uploaded objects survive a failed completion so a retry does not duplicate
  // storage. Keys are the exact local evidence (data URL or File object).
  const podUploadsRef = useRef<{
    signatureDataUrl: string | null;
    signatureStorageId: string | null;
    photos: Array<{ file: File; storageId: string }>;
  }>({ signatureDataUrl: null, signatureStorageId: null, photos: [] });

  const [podPhase, setPodPhase] = useState<
    null | "locating" | "uploading" | "completing"
  >(null);
  const [podSuccess, setPodSuccess] = useState(false);
  const podBusy = podPhase !== null;

  const showPODForm =
    status === DELIVERY_STATUS.AT_DROPOFF && !podSuccess && !showFailureForm;

  // Prefill known order details once per delivery, but keep them editable: the
  // person accepting the parcel may differ from the name captured at booking.
  const podPrefillRef = useRef<string | null>(null);
  useEffect(() => {
    if (!delivery || podPrefillRef.current === delivery.id) return;
    podPrefillRef.current = delivery.id;
    setPodRecipient((previous) => previous || delivery.recipientName || "");
    setPodRecipientPhone((previous) => previous || delivery.recipientPhone || "");
  }, [delivery]);

  const locatePOD = useCallback(async () => {
    setPodLocationState("capturing");
    const location = await requestPODLocation();
    if (!location) {
      setPodLocationState("unavailable");
      return null;
    }
    setPodLocation(location);
    setPodLocationState("captured");
    return location;
  }, []);

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const remaining = POD_MAX_PHOTOS - podFiles.length;
    if (remaining <= 0) {
      setError(`A POD can include at most ${POD_MAX_PHOTOS} photos plus a signature.`);
      return;
    }

    const valid: File[] = [];
    let firstError: string | null = null;
    for (const file of Array.from(files)) {
      const validationError = validatePODPhoto(file);
      if (validationError) {
        firstError ??= validationError;
        continue;
      }
      valid.push(file);
    }

    if (valid.length > remaining) {
      firstError ??= `Only ${remaining} more photo${remaining === 1 ? "" : "s"} can be added.`;
    }
    const accepted = valid.slice(0, remaining);
    if (accepted.length > 0) {
      setError(firstError);
      podUploadsRef.current.photos = [];
      setPodFiles((previous) => [...previous, ...accepted]);
    } else if (firstError) {
      setError(firstError);
    }
  };

  const handleSignatureChange = (dataUrl: string | null) => {
    setPodSignature(dataUrl);
    // A changed signature must be uploaded again; photos are unaffected.
    podUploadsRef.current.signatureDataUrl = null;
    podUploadsRef.current.signatureStorageId = null;
  };

  const handleFailureFileSelect = (files: FileList | null) => {
    if (!files) return;
    const remaining = 5 - failureFiles.length;
    if (remaining <= 0) {
      setError("A failed-delivery record can include at most 5 photos.");
      return;
    }
    const valid: File[] = [];
    let firstError: string | null = null;
    for (const file of Array.from(files)) {
      const validationError = validatePODPhoto(file);
      if (validationError) {
        firstError ??= validationError;
        continue;
      }
      valid.push(file);
    }
    if (valid.length > remaining) {
      firstError ??= `Only ${remaining} more photo${remaining === 1 ? "" : "s"} can be added.`;
    }
    const accepted = valid.slice(0, remaining);
    if (accepted.length > 0) {
      setError(firstError);
      failureUploadsRef.current = [];
      setFailureFiles((previous) => [...previous, ...accepted]);
    } else if (firstError) {
      setError(firstError);
    }
  };

  const handlePodSubmit = useCallback(async () => {
    if (!deliveryId) return;
    setError(null);

    const validationError = validatePODSubmission({
      recipientName: podRecipient,
      hasSignature: podSignature !== null,
      photoCount: podFiles.length,
    });
    if (validationError) {
      setError(validationError);
      return;
    }

    // POD submission is never claimable offline: completion must be confirmed
    // by Convex after upload and server-side evidence validation.
    if (!isOnline) {
      setError(
        "You're offline. Proof-of-delivery submission needs a connection — your location is still being saved and will sync automatically."
      );
      return;
    }

    try {
      // Location is best-effort and never blocks a handover.
      let location = podLocation;
      if (!location) {
        setPodPhase("locating");
        location = await locatePOD();
      }

      // Upload the signature once and reuse it if completion retries.
      let signatureStorageId: string | null = null;
      if (podSignature) {
        setPodPhase("uploading");
        if (
          podUploadsRef.current.signatureDataUrl !== podSignature ||
          !podUploadsRef.current.signatureStorageId
        ) {
          const blob = await (await fetch(podSignature)).blob();
          const uploaded = await uploadPODBody(
            blob,
            "recipient-signature.png",
            "image/png",
          );
          podUploadsRef.current.signatureDataUrl = podSignature;
          podUploadsRef.current.signatureStorageId = uploaded;
        }
        signatureStorageId = podUploadsRef.current.signatureStorageId;
      }

      // Upload photos only when they are not already in the retry cache.
      setPodPhase("uploading");
      const photoFileIds: string[] = [];
      for (const file of podFiles) {
        let uploaded = podUploadsRef.current.photos.find(
          (entry) => entry.file === file,
        );
        if (!uploaded) {
          const storageId = await uploadPODBody(file, file.name, file.type);
          uploaded = { file, storageId };
          podUploadsRef.current.photos.push(uploaded);
        }
        photoFileIds.push(uploaded.storageId);
      }

      // One transaction creates the POD, links evidence, transitions status,
      // records tracking/audit, settles the driver, and notifies the customer.
      setPodPhase("completing");
      await completeDeliveryWithPOD({
        deliveryId,
        recipientName: podRecipient.trim(),
        recipientPhone: podRecipientPhone.trim() || undefined,
        deliveryNotes: podNotes.trim() || undefined,
        signatureFileId: signatureStorageId ?? undefined,
        photoFileIds: photoFileIds.length > 0 ? photoFileIds : undefined,
        latitude: location?.lat,
        longitude: location?.lng,
        locationAccuracy: location?.accuracy,
      });

      podUploadsRef.current = {
        signatureDataUrl: null,
        signatureStorageId: null,
        photos: [],
      };
      setPodSuccess(true);
      setPodSignature(null);
      setPodFiles([]);
      setPodRecipient("");
      setPodRecipientPhone("");
      setPodNotes("");
      setPodLocation(null);
      setPodLocationState("idle");
      setTimeout(() => setPodSuccess(false), 6000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "POD submission failed");
    } finally {
      setPodPhase(null);
    }
  }, [
    deliveryId,
    podRecipient,
    podRecipientPhone,
    podSignature,
    podNotes,
    podFiles,
    podLocation,
    locatePOD,
    uploadPODBody,
    completeDeliveryWithPOD,
    isOnline,
  ]);

  // Recipient name + notes + selected files are safe to PREPARE offline
  // (they already live in local component state); the submission button
  // stays disabled offline and nothing is claimed as submitted until the
  // server confirms the atomic completion. No offline file persistence is
  // added — proof is uploaded directly to Convex File Storage and a temporary
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
                      Capture the handover, then submit once. The server creates the POD and
                      completes the delivery only after it validates the evidence.
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
                          maxLength={200}
                          autoComplete="name"
                          disabled={podBusy}
                        />
                      </div>
                      <div>
                        <label className="driver-detail-label" htmlFor="pod-recipient-phone">
                          Recipient phone
                        </label>
                        <input
                          id="pod-recipient-phone"
                          type="tel"
                          className="settings-input"
                          style={{ width: "100%" }}
                          placeholder="Optional contact number"
                          value={podRecipientPhone}
                          onChange={(e) => setPodRecipientPhone(e.target.value)}
                          maxLength={40}
                          autoComplete="tel"
                          disabled={podBusy}
                        />
                      </div>
                      <div>
                        <label className="driver-detail-label" htmlFor="pod-notes">
                          Delivery notes
                        </label>
                        <textarea
                          id="pod-notes"
                          className="settings-input"
                          style={{ width: "100%", minHeight: 72, resize: "vertical" }}
                          placeholder="Optional notes (e.g. left with reception)"
                          value={podNotes}
                          onChange={(e) => setPodNotes(e.target.value)}
                          maxLength={1000}
                          disabled={podBusy}
                        />
                      </div>
                    </div>

                    <SignaturePad
                      key={deliveryId ?? "pod-signature"}
                      onChange={handleSignatureChange}
                      disabled={podBusy}
                    />

                    {/* Photo capture / upload */}
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "12px 16px",
                        border: "1px dashed var(--border)",
                        borderRadius: 10,
                        cursor:
                          podBusy || podFiles.length >= POD_MAX_PHOTOS
                            ? "not-allowed"
                            : "pointer",
                        color: "var(--text-secondary)",
                        fontSize: 13,
                        marginBottom: 12,
                        opacity:
                          podBusy || podFiles.length >= POD_MAX_PHOTOS ? 0.6 : 1,
                      }}
                    >
                      <Camera size={16} />
                      Add delivery photo ({podFiles.length}/{POD_MAX_PHOTOS}, 10MB each)
                      <input
                        type="file"
                        accept={POD_ACCEPT}
                        multiple
                        capture="environment"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          handleFileSelect(e.target.files);
                          e.target.value = "";
                        }}
                        disabled={podBusy || podFiles.length >= POD_MAX_PHOTOS}
                      />
                    </label>

                    {/* Best-effort handover location */}
                    <div className="driver-pod-location">
                      <div>
                        <span className="driver-pod-location-label">
                          <LocateFixed size={13} /> Handover location
                        </span>
                        <span className="driver-pod-location-value">
                          {podLocation
                            ? `${podLocation.lat.toFixed(5)}, ${podLocation.lng.toFixed(5)}${
                                podLocation.accuracy != null
                                  ? ` · ±${Math.round(podLocation.accuracy)}m`
                                  : ""
                              }`
                            : podLocationState === "capturing"
                              ? "Getting your location…"
                              : podLocationState === "unavailable"
                                ? "Unavailable — submission can continue without it"
                                : "Not captured yet"}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="driver-secondary-btn"
                        onClick={() => void locatePOD()}
                        disabled={podBusy || podLocationState === "capturing"}
                      >
                        {podLocationState === "capturing" ? "Locating…" : "Use my location"}
                      </button>
                    </div>

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
                            <Camera size={12} />
                            {f.name.length > 22 ? `${f.name.slice(0, 20)}…` : f.name}
                            {!podBusy && (
                              <button
                                type="button"
                                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--text-muted)" }}
                                onClick={() => {
                                  podUploadsRef.current.photos = [];
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
                        {podPhase === "locating"
                          ? "Capturing location..."
                          : podPhase === "uploading"
                            ? "Uploading proof..."
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

                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "10px 12px",
                            border: "1px dashed var(--border)",
                            borderRadius: 9,
                            cursor:
                              failurePending || failureFiles.length >= 5
                                ? "not-allowed"
                                : "pointer",
                            color: "var(--text-secondary)",
                            fontSize: 12,
                            marginBottom: 10,
                            opacity:
                              failurePending || failureFiles.length >= 5 ? 0.6 : 1,
                          }}
                        >
                          <Camera size={14} />
                          Add failure photo (optional, {failureFiles.length}/5)
                          <input
                            type="file"
                            accept={POD_ACCEPT}
                            multiple
                            capture="environment"
                            style={{ display: "none" }}
                            onChange={(e) => {
                              handleFailureFileSelect(e.target.files);
                              e.target.value = "";
                            }}
                            disabled={failurePending || failureFiles.length >= 5}
                          />
                        </label>

                        {failureFiles.length > 0 && (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                            {failureFiles.map((file, index) => (
                              <span
                                key={`${file.name}-${index}`}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                  fontSize: 11.5,
                                  color: "var(--text-primary)",
                                  background: "var(--surface-muted)",
                                  border: "1px solid var(--border-light)",
                                  borderRadius: 6,
                                  padding: "4px 8px",
                                }}
                              >
                                <Camera size={12} />
                                {file.name.length > 22 ? `${file.name.slice(0, 20)}…` : file.name}
                                {!failurePending && (
                                  <button
                                    type="button"
                                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--text-muted)" }}
                                    onClick={() => {
                                      failureUploadsRef.current = [];
                                      setFailureFiles((previous) =>
                                        previous.filter((_, i) => i !== index),
                                      );
                                    }}
                                    aria-label={`Remove ${file.name}`}
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

                {/* Previously submitted POD, including viewable evidence. */}
                {existingPOD && !podSuccess && (
                  <div style={{ marginBottom: 16 }}>
                    <PODSummary
                      pod={existingPOD}
                      title="Proof of delivery on record"
                      showCoordinates
                    />
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
