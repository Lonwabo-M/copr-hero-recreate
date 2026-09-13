/**
 * Driver Connectivity Indicator
 *
 * Small, non-intrusive status pill for the Driver App. Surfaces the offline
 * resilience state without redesigning any shell:
 *
 *  - Online                          → subtle/dot only (or hidden while idle)
 *  - Offline                         → amber pill; GPS fixes are being buffered
 *  - Reconnecting                    → amber pill, pulsing
 *  - Syncing buffered locations…     → teal pill while replay is running
 *  - Sync complete                   → brief green confirmation
 *  - Sync issue — will retry         → red pill with the recoverable reason
 *
 * The indicator consumes ONLY the offline resilience layer (connectivity
 * state + the delivery-bound GPS buffer) and the existing driver shell
 * styling. It never mutates delivery state and never fabricates server
 * state: "buffered" always means local-only until Convex confirms.
 */

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  useConnectivity,
  useOfflineGPS,
  useDriverOfflineStatus,
} from "@/hooks/use-offline";

export default function DriverConnectivityIndicator() {
  const { state } = useConnectivity();

  // The driver's active delivery, when one exists (existing authorized query).
  const current = useQuery(api.tracking.queries.getMyCurrentDelivery, {});
  const deliveryId = (current?.delivery?._id ?? null) as string | null;

  const { bufferedCount, retrySync } = useOfflineGPS(deliveryId);
  const status = useDriverOfflineStatus(bufferedCount);

  // "Sync complete" is transient — fade back to plain Online after a moment.
  const [showComplete, setShowComplete] = useState(false);
  useEffect(() => {
    if (state !== "SYNC_COMPLETE") {
      setShowComplete(false);
      return;
    }
    setShowComplete(true);
    const t = setTimeout(() => setShowComplete(false), 4000);
    return () => clearTimeout(t);
  }, [state]);

  // Fully online with nothing pending → render nothing (non-intrusive).
  const isQuietOnline =
    (state === "ONLINE" && bufferedCount === 0) ||
    (state === "SYNC_COMPLETE" && !showComplete);
  if (isQuietOnline) return null;

  const tone =
    state === "SYNCING" || showComplete
      ? { bg: "rgba(7, 148, 181, 0.10)", color: "#0794B5" }
      : state === "SYNC_ERROR"
        ? { bg: "rgba(220, 38, 38, 0.08)", color: "#b91c1c" }
        : { bg: "rgba(217, 119, 6, 0.12)", color: "#b45309" };

  const label = showComplete ? "Sync complete" : status.label;

  return (
    <button
      type="button"
      onClick={retrySync}
      title={
        status.detail
          ? `${label} — ${status.detail}. Tap to retry sync.`
          : `${label}. Tap to retry sync.`
      }
      style={{
        position: "fixed",
        top: 14,
        right: 14,
        zIndex: 40,
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "6px 12px",
        borderRadius: 999,
        background: tone.bg,
        color: tone.color,
        fontSize: 12,
        fontWeight: 600,
        border: `1px solid ${tone.color}33`,
        cursor: "pointer",
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: tone.color,
          flexShrink: 0,
          opacity: state === "RECONNECTING" || state === "SYNCING" ? 0.5 : 1,
        }}
      />
      {label}
      {status.detail && (
        <span style={{ fontWeight: 400, opacity: 0.85 }}>· {status.detail}</span>
      )}
    </button>
  );
}
