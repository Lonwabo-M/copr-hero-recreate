/**
 * Lasha Driver Location Tracking Hook
 *
 * Continuous browser GPS reporting for the Driver Active Delivery workflow.
 *
 * Design:
 * - Uses the standard `navigator.geolocation.watchPosition()` API. No new
 *   tracking backend, service, or schema — updates are sent through the
 *   existing `tracking.mutations.updateDeliveryLocation` Convex mutation,
 *   which re-validates coordinates, timestamps, frequency, movement, driver
 *   role, and delivery assignment server-side.
 * - Lifecycle is tied to the active delivery: the watcher starts only when a
 *   delivery ID is provided and `active` is true, and is cleared via
 *   `clearWatch()` when the delivery becomes inactive, completes, fails, is
 *   rejected, or the page unmounts. A single effect with cleanup guarantees
 *   no duplicate watchers across re-renders (enforced with a watcher-ID ref).
 * - Client-side throttling: GPS events are NOT sent on every fix. Updates go
 *   out at most every SEND_INTERVAL_MS, with a longer stationary heartbeat so
 *   the server never sees the driver as stale. Negligible movement is skipped.
 *   The backend remains authoritative and validates every received update.
 * - GPS errors are non-fatal: they update the tracking status only — never
 *   the delivery state — and subsequent fixes retry normally.
 * - Permission prompts fire at most once per watcher (browser behaviour);
 *   denial maps to a distinct, clearly-communicated status.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

// ─── Configuration ───────────────────────────────────────────────────────────

/** Minimum interval between location updates sent to Convex (ms).
 *  Comfortably above the backend's MIN_UPDATE_INTERVAL_MS (10s). */
export const SEND_INTERVAL_MS = 15_000;

/** Stationary heartbeat: when the driver isn't moving, send at least this
 *  often to stay below the backend's MAX_STALENESS_MS (60s). */
export const HEARTBEAT_INTERVAL_MS = 45_000;

/** Movements smaller than this (meters) are considered negligible. */
export const MIN_DISTANCE_METERS = 20;

// ─── Status model ────────────────────────────────────────────────────────────

export type TrackingState =
  | "idle" // no active delivery — no watcher
  | "starting" // watcher requested, waiting for first GPS fix
  | "waiting" // receiving fixes, throttling until next send
  | "sent" // last update delivered to Convex successfully
  | "denied" // location permission denied
  | "error" // GPS unavailable / timeout / update rejected
  | "unsupported"; // browser has no geolocation API

export interface TrackingStatus {
  state: TrackingState;
  /** Human-readable detail for error/denied states. */
  message?: string;
  /** Timestamp (Date.now()) of the last successful Convex update. */
  lastSentAt?: number;
}

export const TRACKING_STATUS_COPY: Record<TrackingState, string> = {
  idle: "Location tracking off",
  starting: "Location tracking starting…",
  waiting: "Location tracking active",
  sent: "Location update sent",
  denied: "Location permission denied",
  error: "GPS unavailable",
  unsupported: "Location not supported on this device",
};

// ─── Pure helpers (unit-testable) ────────────────────────────────────────────

/** Haversine distance in meters — used only for client-side movement filtering.
 *  The backend performs its own authoritative movement validation. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Decide whether a GPS fix should be sent to Convex.
 *  - Inside the send window: never (throttle).
 *  - Negligible movement before the heartbeat interval: skip.
 *  - Otherwise send (moved enough, heartbeat due, or first fix). */
export function shouldSendLocation(input: {
  now: number;
  lastSentAt: number;
  lastLat: number | null;
  lastLng: number | null;
  lat: number;
  lng: number;
}): boolean {
  const sinceSend = input.now - input.lastSentAt;
  if (sinceSend < SEND_INTERVAL_MS) return false;

  const isFirstFix = input.lastLat === null || input.lastLng === null;
  if (isFirstFix) return true;

  const moved = haversineMeters(input.lastLat!, input.lastLng!, input.lat, input.lng);
  if (moved < MIN_DISTANCE_METERS && sinceSend < HEARTBEAT_INTERVAL_MS) return false;

  return true;
}

/** Map a GeolocationPositionError code to a tracking state. */
export function statusForGpsError(code: number): TrackingStatus {
  if (code === 1) {
    return { state: "denied", message: "Location permission was denied" };
  }
  if (code === 2) {
    return { state: "error", message: "Location is currently unavailable" };
  }
  return { state: "error", message: "Could not get a GPS fix (timeout)" };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UseDriverLocationTrackingArgs {
  /** Active delivery ID, or null when the driver has no active delivery. */
  deliveryId: string | null;
  /** Whether tracking should run (delivery in a trackable/active state). */
  active: boolean;
}

export function useDriverLocationTracking({ deliveryId, active }: UseDriverLocationTrackingArgs) {
  const [status, setStatus] = useState<TrackingStatus>({ state: "idle" });

  const updateDeliveryLocation = useMutation(api.tracking.mutations.updateDeliveryLocation);

  // Watcher handle — guarantees at most one live watcher and correct cleanup.
  const watchIdRef = useRef<number | null>(null);

  // Last-sent bookkeeping for throttling (refs: mutated inside callbacks
  // without re-subscribing the effect).
  const lastSentRef = useRef<{ at: number; lat: number | null; lng: number | null }>({
    at: 0,
    lat: null,
    lng: null,
  });

  // Keep the latest send function in a ref so the watch effect depends only
  // on [deliveryId, active] and never re-creates the watcher on re-renders.
  const sendUpdateRef = useRef<(lat: number, lng: number, accuracy?: number) => Promise<void>>(
    async () => {}
  );

  sendUpdateRef.current = useCallback(
    async (lat: number, lng: number, accuracy?: number) => {
      if (!deliveryId) return;
      try {
        await updateDeliveryLocation({
          deliveryId,
          location: {
            lat,
            lng,
            timestamp: Date.now(),
            accuracy: accuracy ?? undefined,
          },
        });
        lastSentRef.current = { at: Date.now(), lat, lng };
        setStatus({ state: "sent", lastSentAt: lastSentRef.current.at });
      } catch (err) {
        // Non-fatal: keep the watcher running so subsequent fixes retry.
        // Surface the reason; never touch delivery state here.
        const message = err instanceof Error ? err.message : "Location update failed";
        console.warn("[driver-tracking] update rejected:", message);
        setStatus((prev) => ({
          state: "error",
          message,
          lastSentAt: prev.lastSentAt,
        }));
      }
    },
    [deliveryId, updateDeliveryLocation]
  );

  useEffect(() => {
    // No active delivery → no watcher, no permission request.
    if (!deliveryId || !active) {
      setStatus({ state: "idle" });
      return;
    }

    if (!("geolocation" in navigator) || !navigator.geolocation) {
      setStatus({ state: "unsupported" });
      return;
    }

    // Safety net: never create a second live watcher.
    if (watchIdRef.current !== null) return;

    setStatus({ state: "starting" });
    // Reset throttle bookkeeping for the new tracking session.
    lastSentRef.current = { at: 0, lat: null, lng: null };

    const handlePosition = (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const decision = shouldSendLocation({
        now: Date.now(),
        lastSentAt: lastSentRef.current.at,
        lastLat: lastSentRef.current.lat,
        lastLng: lastSentRef.current.lng,
        lat: latitude,
        lng: longitude,
      });

      if (!decision) {
        // Still receiving fixes — just throttled / negligible movement.
        setStatus((prev) =>
          prev.state === "sent" || prev.state === "waiting"
            ? prev.state === "sent"
              ? prev
              : { state: "waiting", lastSentAt: prev.lastSentAt }
            : { state: "waiting", lastSentAt: undefined }
        );
        return;
      }

      // Optimistically show activity; the send updates to "sent" or "error".
      setStatus((prev) => ({ state: "waiting", lastSentAt: prev.lastSentAt }));
      void sendUpdateRef.current(latitude, longitude, accuracy);
    };

    const handleGpsError = (err: GeolocationPositionError) => {
      // Non-fatal: map to a status; the watcher stays live for later fixes.
      const next = statusForGpsError(err.code);
      console.warn("[driver-tracking] GPS error:", err.code, err.message);
      setStatus((prev) => ({ ...next, lastSentAt: prev.lastSentAt }));
    };

    watchIdRef.current = navigator.geolocation.watchPosition(handlePosition, handleGpsError, {
      enableHighAccuracy: true,
      timeout: 15_000,
      maximumAge: 5_000,
    });

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setStatus({ state: "idle" });
    };
  }, [deliveryId, active]);

  return { status };
}
