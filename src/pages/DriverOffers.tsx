import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { useNavigate } from "react-router";
import { api } from "@/convex/_generated/api";
import DriverShell from "@/components/shells/DriverShell";
import {
  Package,
  MapPin,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  Timer,
  Inbox,
} from "lucide-react";
import "@/styles/driver.css";

// ─── Driver Offers ───────────────────────────────────────────────────────────
// Available dispatch offers for the authenticated driver, backed by the
// existing dispatch engine query `getMyDispatchOffers` (which resolves the
// driver from the Convex session — no client-supplied identity).
//
// Accept/reject use the existing `dispatch.engine.acceptAssignment` /
// `rejectAssignment` mutations. The backend remains authoritative for
// authorization, offer validity, expiry, concurrency, and the delivery state
// transition. This page only displays state and reports backend errors.

interface OfferShape {
  _id: string;
  deliveryId: string;
  status: string;
  score: number;
  offeredAt: number;
  expiresAt: number;
  deliveryStatus?: string;
  pickupCity?: string;
  dropoffCity?: string;
  packageSize?: string;
  orderPrice?: number;
}

const now = () => Date.now();

/** Client-side expiry display helper. The backend re-checks expiry on accept. */
function isExpired(offer: OfferShape): boolean {
  return offer.expiresAt < now();
}

/** Format remaining time on an offer as m:ss. */
function formatRemaining(expiresAt: number): string {
  const remainingMs = Math.max(0, expiresAt - now());
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export default function DriverOffers() {
  const navigate = useNavigate();
  const offers = useQuery(api.dispatch.engine.getMyDispatchOffers, {});
  const acceptAssignment = useMutation(api.dispatch.engine.acceptAssignment);
  const rejectAssignment = useMutation(api.dispatch.engine.rejectAssignment);

  // Pending accept/reject per offer — prevents duplicate submissions.
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastAccepted, setLastAccepted] = useState<string | null>(null);

  // Ticks every second so countdowns/expiry re-render (purely visual).
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const visibleOffers = useMemo(
    () => (offers ?? []).filter((o) => !isExpired(o as OfferShape)),
    [offers]
  );

  const handleAccept = async (offer: OfferShape) => {
    if (pendingAction) return; // guard against duplicate submissions
    setError(null);
    setPendingAction(offer._id);
    try {
      const result = await acceptAssignment({ offerId: offer._id as any });
      if (result?.success && result.deliveryId) {
        // Offer accepted — offer disappears reactively; hand off to Active Delivery.
        setLastAccepted(offer._id);
        navigate("/driver/active-delivery");
      }
    } catch (err) {
      // Backend is authoritative: expired / already claimed / invalid offers
      // all surface here. The reactive query refreshes the list automatically.
      setError(
        err instanceof Error
          ? err.message
          : "Could not accept this offer. Please try again."
      );
    } finally {
      setPendingAction(null);
    }
  };

  const handleReject = async (offer: OfferShape) => {
    if (pendingAction) return;
    setError(null);
    setPendingAction(offer._id);
    try {
      await rejectAssignment({ offerId: offer._id as any });
      // Rejected offers disappear via the reactive query — no local mutation.
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not reject this offer. Please try again."
      );
    } finally {
      setPendingAction(null);
    }
  };

  return (
    <DriverShell activeItem="Delivery Offers">
      <main className="driver-main dash-workspace">
        <div className="driver-container">
          <div className="driver-header">
            <div>
              <h1 className="driver-title">Delivery Offers</h1>
              <p className="driver-subtitle">
                Assignments available to you right now
              </p>
            </div>
          </div>

          {error && (
            <div className="driver-error" role="alert">
              {error}
            </div>
          )}

          {/* Loading */}
          {offers === undefined ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: "#999" }} />
            </div>
          ) : /* No offers at all (or all expired) */
          visibleOffers.length === 0 ? (
            <div className="driver-panel">
              <Inbox size={24} style={{ color: "#999", margin: "0 auto" }} />
              <div className="driver-panel-title">No available offers</div>
              <div className="driver-panel-desc">
                New delivery offers appear here automatically when dispatch
                assigns them to you.
              </div>
            </div>
          ) : (
            visibleOffers.map((offer) => {
              const o = offer as OfferShape;
              const expired = isExpired(o);
              const busy = pendingAction === o._id;
              const locked = pendingAction !== null;
              const justAccepted = lastAccepted === o._id;
              return (
                <div
                  key={o._id}
                  className="driver-offer-card"
                  style={justAccepted ? { opacity: 0.6 } : undefined}
                >
                  {/* Route + countdown */}
                  <div className="driver-offer-route">
                    <div className="driver-offer-cities">
                      <MapPin size={14} style={{ color: "#0794b5" }} />
                      <span>
                        {o.pickupCity ?? "Unknown"} → {o.dropoffCity ?? "Unknown"}
                      </span>
                    </div>
                    <span
                      className={`driver-offer-countdown ${expired ? "expired" : ""}`}
                    >
                      <Timer size={12} />
                      {expired ? "Expired" : formatRemaining(o.expiresAt)}
                    </span>
                  </div>

                  {/* Package / delivery facts (fields the backend provides) */}
                  <div className="driver-offer-meta">
                    <span className="driver-offer-chip">
                      <Package size={12} />
                      {o.packageSize ?? "small"} parcel
                    </span>
                    <span className="driver-offer-chip">
                      Ref {o.deliveryId.slice(-6).toUpperCase()}
                    </span>
                    {typeof o.orderPrice === "number" && o.orderPrice > 0 && (
                      <span className="driver-offer-chip">
                        Delivery fee {formatCurrency(o.orderPrice)}
                      </span>
                    )}
                  </div>

                  {/* Accept / Reject */}
                  <div className="driver-action-row" style={{ marginTop: 14 }}>
                    <button
                      className="driver-primary-btn"
                      onClick={() => handleAccept(o)}
                      disabled={expired || locked || justAccepted}
                    >
                      {busy ? (
                        <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                      ) : (
                        <CheckCircle2 size={16} />
                      )}
                      {busy ? "Accepting…" : "Accept"}
                    </button>
                    <button
                      className="driver-secondary-btn"
                      onClick={() => handleReject(o)}
                      disabled={expired || locked || justAccepted}
                    >
                      {busy ? (
                        <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                      ) : (
                        <XCircle size={16} />
                      )}
                      {busy ? "Rejecting…" : "Reject"}
                    </button>
                  </div>
                </div>
              );
            })
          )}

          {/* How it works */}
          <div className="driver-safety-note" style={{ marginTop: 8 }}>
            <Clock size={14} />
            Offers expire quickly. Accepted offers move you straight into Active
            Delivery.
          </div>
        </div>
      </main>
    </DriverShell>
  );
}
