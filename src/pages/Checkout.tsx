/**
 * Delivery Request Checkout
 *
 * Final step of the customer request flow: review the delivery (summary, ETA,
 * receiver, fee breakdown) and pay. Route: /checkout/:orderId behind the
 * CUSTOMER RoleGate — navigated to straight from Request Delivery after
 * creation, and reachable from the dashboard for any unpaid order.
 *
 * Backend contract — existing authorized queries/actions only, no new backend:
 *   - deliveries.state_machine.getMyDeliveries → the customer's own deliveries
 *     (server-scoped) with enriched display details; this page finds the
 *     delivery belonging to :orderId in that list.
 *   - pricing.service.getQuoteForOrder → the authoritative fee breakdown
 *     (delivery fee, platform fee, total) for the order.
 *   - payments.actions.initiateOrderPayment → returns a Paystack hosted-
 *     checkout URL; the amount is resolved server-side from the order, the
 *     client never sends one. Card entry happens on Paystack's PCI-compliant
 *     page — this UI intentionally renders NO card fields.
 *
 * Design: mirrors the approved checkout reference — left review column
 * (parcel card, deep-teal ETA card, receiver details, payment summary) and a
 * right payment panel with the large cyan "Pay R…" action.
 */

import { useParams, Link, useNavigate } from "react-router";
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import CustomerShell from "@/components/shells/CustomerShell";
import { formatEventDate } from "@/components/tracking/TrackingProgress";
import { DELIVERY_STATUS } from "@/convex/schema";
import {
  Package,
  MapPin,
  Navigation,
  User,
  Phone,
  Building2,
  Ruler,
  Calendar,
  Weight,
  CreditCard,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
  ArrowLeft,
  Lock,
} from "lucide-react";
import { useState } from "react";
import "@/styles/dashboard.css";
import "@/styles/checkout.css";

/** Deterministic ZAR formatting (R 600,00) — no Intl (ICU varies by runtime). */
function formatRands(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const rands = Math.floor(abs / 100)
    .toLocaleString("en-ZA")
    .replace(/\s/g, " ");
  const centsPart = String(abs % 100).padStart(2, "0");
  return `${sign}R ${rands},${centsPart}`;
}

function formatServiceLabel(expeditionType: string | null | undefined): string {
  if (!expeditionType) return "Standard";
  const label = expeditionType.replace(/_/g, "-");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function DetailCell({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="co-cell">
      <span className="co-cell-label">
        {icon}
        {label}
      </span>
      <span className="co-cell-value">{value}</span>
    </div>
  );
}

export default function Checkout() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initiatePayment = useAction(api.payments.actions.initiateOrderPayment);

  // Customer's own deliveries (server-scoped; enriched with display details).
  const myDeliveries = useQuery(
    api.deliveries.state_machine.getMyDeliveries,
    orderId ? {} : "skip",
  );

  // Authoritative fee breakdown for this order.
  const quote = useQuery(
    api.pricing.service.getQuoteForOrder,
    orderId ? { orderId: orderId as never } : "skip",
  );

  const loading = myDeliveries === undefined || quote === undefined;

  const handlePay = async () => {
    if (!orderId) return;
    setError(null);
    setPaying(true);
    try {
      const result = await initiatePayment({
        orderId: orderId as never,
        method: "card",
      });
      if (result.alreadyPaid) {
        // Order settled earlier — straight to its tracking page.
        const row = myDeliveries?.find((d: { orderId?: string }) => d.orderId === orderId);
        navigate(row ? `/deliveries/${row._id}` : "/dashboard");
        return;
      }
      if (result.authorizationUrl) {
        window.location.href = result.authorizationUrl;
        return;
      }
      setError("Payment could not be started. Please try again.");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setError(
        msg.includes("not configured") || msg.includes("not enabled")
          ? "Online payments are not enabled yet. Please try again later."
          : msg.includes("email")
            ? "Your account needs a verified email address before paying."
            : "We couldn't start your payment. Please try again.",
      );
    } finally {
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <CustomerShell activeItem="Request Delivery">
        <main className="co-main">
          <div className="co-container">
            <div style={{ display: "flex", justifyContent: "center", padding: 80 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: "#999" }} />
            </div>
          </div>
        </main>
      </CustomerShell>
    );
  }

  // Locate this order's delivery within the customer's own list.
  const deliveryRow = orderId
    ? (myDeliveries as Array<{ _id: string; orderId?: string; status: string; details?: DeliveryDetails | null }>).find(
        (d) => d.orderId === orderId,
      )
    : undefined;

  if (!orderId || !deliveryRow) {
    return (
      <CustomerShell activeItem="Request Delivery">
        <main className="co-main">
          <div className="co-container">
            <div className="empty-state" style={{ padding: 60 }}>
              <div className="empty-state-icon">
                <Package size={24} />
              </div>
              <div className="empty-state-title">Order not found</div>
              <div className="empty-state-desc">
                This order does not exist or you do not have access to it.
              </div>
              <Link className="co-back-inline" to="/dashboard">
                Back to dashboard
              </Link>
            </div>
          </div>
        </main>
      </CustomerShell>
    );
  }

  const details = deliveryRow.details;
  const alreadyPaid = deliveryRow.status === DELIVERY_STATUS.DELIVERED;
  const closed =
    alreadyPaid ||
    deliveryRow.status === DELIVERY_STATUS.FAILED ||
    deliveryRow.status === DELIVERY_STATUS.CANCELLED;

  const total = details?.price ?? quote?.totalCharge ?? 0;
  const deliveryFee = quote?.deliveryFee ?? total;
  const platformFee = quote?.platformFee ?? null;

  return (
    <CustomerShell activeItem="Request Delivery">
      <main className="co-main">
        <div className="co-container">
          {/* Page head */}
          <div className="co-page-head">
            <div>
              <span className="co-eyebrow">Checkout</span>
              <h1 className="co-title">Review &amp; pay</h1>
              <p className="co-sub">
                Confirm your delivery details and complete payment to get your driver assigned.
              </p>
            </div>
            <Link to="/dashboard" className="co-back">
              <ArrowLeft size={15} />
              Dashboard
            </Link>
          </div>

          {error && (
            <div className="co-alert co-alert-error">
              <AlertCircle size={18} />
              <p>{error}</p>
            </div>
          )}
          {alreadyPaid && (
            <div className="co-alert co-alert-ok">
              <CheckCircle2 size={18} />
              <p>This delivery is already paid.</p>
            </div>
          )}
          {!alreadyPaid && closed && (
            <div className="co-alert co-alert-warn">
              <AlertCircle size={18} />
              <p>This delivery was cancelled — payment is no longer required.</p>
            </div>
          )}

          <div className="co-grid">
            {/* ─── Left column — review ─────────────────────────────── */}
            <div className="co-left">
              {/* Parcel summary */}
              <div className="co-card">
                <div className="co-parcel-head">
                  <div className="co-parcel-icon">
                    <Package size={20} />
                  </div>
                  <div className="co-parcel-titles">
                    <h2 className="co-card-title">{details?.description ?? "Delivery"}</h2>
                    <p className="co-card-sub">
                      {details?.businessName
                        ? `Prepared for ${details.businessName}`
                        : "Prepared for delivery"}
                    </p>
                  </div>
                </div>
                <div className="co-cell-row">
                  <DetailCell
                    label="Date"
                    value={formatEventDate(details?.scheduledTime ?? details?.createdAt)}
                    icon={<Calendar size={12} />}
                  />
                  <DetailCell
                    label="Weight"
                    value={details?.weight != null ? `${details.weight} kg` : "—"}
                    icon={<Weight size={12} />}
                  />
                  <DetailCell
                    label="Dimensions"
                    value={
                      details?.width != null && details?.height != null
                        ? `W: ${details.width} H:${details.height}`
                        : "—"
                    }
                    icon={<Ruler size={12} />}
                  />
                </div>
              </div>

              {/* ETA card — deep teal, mirrors the reference */}
              <div className="co-eta-card">
                <div className="co-eta-head">
                  <h3>Estimated Time of Arrival</h3>
                  <span className="co-eta-chip">
                    {details?.scheduledTime ? formatEventDate(details.scheduledTime) : "Scheduled"}
                  </span>
                </div>
                <div className="co-eta-row">
                  <span className="co-eta-label">Sender</span>
                  <span className="co-eta-value">{details?.pickupAddress ?? "Pickup address on file"}</span>
                </div>
                <div className="co-eta-row">
                  <span className="co-eta-label">Receiver</span>
                  <span className="co-eta-value">{details?.dropoffAddress ?? "Drop-off address on file"}</span>
                </div>
              </div>

              {/* Receiver details */}
              <div className="co-card">
                <h3 className="co-card-title" style={{ marginBottom: 16 }}>Receiver Details</h3>
                <div className="co-cell-row">
                  <DetailCell
                    label="Receiver"
                    value={details?.recipientName ?? "Not specified"}
                    icon={<User size={12} />}
                  />
                  <DetailCell
                    label="Business Name"
                    value={details?.businessName ?? "—"}
                    icon={<Building2 size={12} />}
                  />
                  <DetailCell
                    label="Phone Number"
                    value={details?.recipientPhone ?? "Not specified"}
                    icon={<Phone size={12} />}
                  />
                </div>
                <div className="co-route-strip">
                  <span className="co-route-pin pickup">
                    <MapPin size={13} />
                  </span>
                  <span className="co-route-line" />
                  <span className="co-route-pin dropoff">
                    <Navigation size={13} />
                  </span>
                  <span className="co-route-addr">{details?.pickupAddress ?? "Pickup"}</span>
                  <span className="co-route-addr to">{details?.dropoffAddress ?? "Drop-off"}</span>
                </div>
              </div>

              {/* Payment summary */}
              <div className="co-card">
                <h3 className="co-card-title" style={{ marginBottom: 8 }}>Payment Summary</h3>
                <div className="co-fee-row">
                  <span>Delivery type</span>
                  <strong>{formatServiceLabel(details?.expeditionType)}</strong>
                </div>
                <div className="co-fee-row">
                  <span>Delivery fee</span>
                  <strong>{formatRands(deliveryFee)}</strong>
                </div>
                {platformFee != null && platformFee > 0 && (
                  <div className="co-fee-row">
                    <span>Service fee</span>
                    <strong>{formatRands(platformFee)}</strong>
                  </div>
                )}
                <div className="co-fee-row total">
                  <span>Total</span>
                  <strong>{formatRands(total)}</strong>
                </div>
              </div>
            </div>

            {/* ─── Right column — payment ───────────────────────────── */}
            <div className="co-right">
              <div className="co-card co-pay-card">
                <h2 className="co-card-title" style={{ marginBottom: 4 }}>Payment Details</h2>
                <p className="co-pay-note">
                  You'll enter card details on our payment provider's secure, PCI-compliant page —
                  card data never touches Lasha's servers.
                </p>

                <div className="co-pay-visual">
                  <div className="co-pay-cardchip">
                    <CreditCard size={22} />
                  </div>
                  <div className="co-pay-securelines">
                    <span className="co-pay-line" />
                    <span className="co-pay-line short" />
                  </div>
                  <div className="co-pay-lock">
                    <Lock size={13} />
                    Secure checkout
                  </div>
                </div>

                <div className="co-trust">
                  <ShieldCheck size={14} />
                  <span>Payments processed by Paystack</span>
                </div>

                <button
                  className="co-pay-btn"
                  onClick={handlePay}
                  disabled={paying || closed || total <= 0}
                >
                  {paying ? (
                    <>
                      <Loader2 size={16} className="animate-spin" style={{ marginRight: 8 }} />
                      Redirecting…
                    </>
                  ) : alreadyPaid ? (
                    "Already paid"
                  ) : (
                    `Pay ${formatRands(total)}`
                  )}
                </button>

                {total <= 0 && !closed && (
                  <p className="co-pay-wait">Finalising your quote… payment unlocks in a moment.</p>
                )}

                <Link to={`/deliveries/${deliveryRow._id}`} className="co-track-link">
                  Pay later — view delivery tracking
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </CustomerShell>
  );
}

interface DeliveryDetails {
  description: string | null;
  businessName: string | null;
  expeditionType: string | null;
  width: number | null;
  height: number | null;
  weight: number | null;
  price: number | null;
  scheduledTime: number | null;
  createdAt: number | null;
  recipientName: string | null;
  recipientPhone: string | null;
  pickupAddress: string | null;
  dropoffAddress: string | null;
}
