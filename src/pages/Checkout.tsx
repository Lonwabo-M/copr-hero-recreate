/**
 * Delivery Request Checkout
 *
 * Final step of the customer request flow: review the delivery (summary, ETA,
 * receiver, fee breakdown) and pay. Route: /checkout/:orderId behind the
 * CUSTOMER RoleGate — navigated to straight from Request Delivery after
 * creation, and reachable from the dashboard for any unpaid order.
 *
 * Backend contract — existing authorized queries/actions only:
 *   - deliveries.state_machine.getMyDeliveries → the customer's own deliveries
 *     (server-scoped) with enriched display details; this page finds the
 *     delivery belonging to :orderId in that list.
 *   - pricing.service.getQuoteForOrder → the authoritative fee breakdown
 *     (delivery fee, platform fee, total) for the order.
 *   - payments.actions.chargeOrderPaymentWithCard → inline card charge per the
 *     approved checkout reference (card fields in the right panel). Card data
 *     is forwarded straight to Paystack with the SECRET key server-side; it is
 *     never stored, logged, or audited by Lasha. Bank challenges surface as an
 *     OTP step handled by payments.actions.submitPaymentOtp.
 *   - payments.actions.initiateOrderPayment → hosted-checkout fallback: a
 *     Paystack hosted-checkout URL (PCI page), also used for unsupported
 *     authorization flows. The amount is always resolved server-side.
 *
 * Design: mirrors the approved checkout reference — left review column
 * (parcel card, deep-teal ETA card, receiver details, payment summary) and a
 * right payment panel with card fields and the large cyan "Pay R…" action.
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
  KeyRound,
  User,
  Phone,
  Building2,
  Ruler,
  Calendar,
  Weight,
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

  const chargeWithCard = useAction(api.payments.actions.chargeOrderPaymentWithCard);
  const submitOtp = useAction(api.payments.actions.submitPaymentOtp);
  const initiatePayment = useAction(api.payments.actions.initiateOrderPayment);

  // Inline card fields (per the approved checkout reference design).
  const [holderName, setHolderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  // Bank authorization (OTP) follow-up: holds our internal reference while
  // the challenge is open. Card material is cleared as soon as it's sent.
  const [otpReference, setOtpReference] = useState<string | null>(null);
  const [otp, setOtp] = useState("");

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

  // ── Inline-card helpers ──────────────────────────────────────────────────

  // Groups of 4, digits only, max 19 digits (widest common PAN length).
  const formatCardNumber = (v: string) =>
    v.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");

  // Expiry as MM/YY.
  const formatExpiry = (v: string) => {
    const digits = v.replace(/\D/g, "").slice(0, 4);
    return digits.length <= 2 ? digits : `${digits.slice(0, 2)}/${digits.slice(2)}`;
  };

  function validateCardFields(): string | null {
    if (!holderName.trim()) return "Enter the card holder name.";
    const digits = cardNumber.replace(/\s/g, "");
    if (digits.length < 13) return "Enter a valid card number.";
    const m = expiry.match(/^(\d{2})\/(\d{2})$/);
    if (!m) return "Expiry must be in MM/YY format.";
    const month = parseInt(m[1], 10);
    if (month < 1 || month > 12) return "Expiry month must be between 01 and 12.";
    const year = 2000 + parseInt(m[2], 10);
    const now = new Date();
    if (
      year < now.getFullYear() ||
      (year === now.getFullYear() && month < now.getMonth() + 1)
    ) {
      return "This card has expired.";
    }
    if (cvv.length < 3) return "Enter the card's CVV.";
    return null;
  }

  /** Post-success: clear card material and hand over to the delivery page. */
  const finalizePayment = () => {
    setHolderName("");
    setCardNumber("");
    setExpiry("");
    setCvv("");
    setOtp("");
    setOtpReference(null);
    const row = myDeliveries?.find((d: { orderId?: string }) => d.orderId === orderId);
    navigate(row ? `/deliveries/${row._id}` : "/dashboard");
  };

  const handlePayError = (e: unknown) => {
    const msg = e instanceof Error ? e.message : "";
    setError(
      msg.includes("not configured") || msg.includes("not enabled")
        ? "Online payments are not enabled yet. Please try again later."
        : msg.includes("email")
          ? "Your account needs a verified email address before paying."
          : msg || "We couldn't start your payment. Please try again.",
    );
  };

  const handlePay = async () => {
    if (!orderId) return;
    setError(null);
    const problem = validateCardFields();
    if (problem) {
      setError(problem);
      return;
    }
    setPaying(true);
    try {
      const result = await chargeWithCard({
        orderId: orderId as never,
        card: {
          holderName: holderName.trim(),
          number: cardNumber.replace(/\s/g, ""),
          expiryMonth: expiry.slice(0, 2),
          expiryYear: expiry.slice(3),
          cvv,
        },
      });
      if (result.status === "already_paid" || result.status === "completed") {
        finalizePayment();
        return;
      }
      if (result.status === "otp_required") {
        setOtpReference(result.reference);
        return;
      }
      setError("message" in result ? result.message : "Payment was declined.");
    } catch (e) {
      handlePayError(e);
    } finally {
      setPaying(false);
    }
  };

  const handleOtpSubmit = async () => {
    if (!otpReference || otp.trim().length < 3) return;
    setError(null);
    setPaying(true);
    try {
      const result = await submitOtp({ reference: otpReference, otp: otp.trim() });
      if (result.status === "already_paid" || result.status === "completed") {
        finalizePayment();
        return;
      }
      setError("message" in result ? result.message : "We couldn't verify that code.");
    } catch (e) {
      handlePayError(e);
    } finally {
      setPaying(false);
    }
  };

  // Hosted-checkout fallback (Paystack's own secure page) — also the escape
  // hatch for authorization flows the inline charge can't complete.
  const handleHostedCheckout = async () => {
    if (!orderId) return;
    setError(null);
    setPaying(true);
    try {
      const result = await initiatePayment({
        orderId: orderId as never,
        method: "card",
      });
      if (result.alreadyPaid) {
        finalizePayment();
        return;
      }
      if (result.authorizationUrl) {
        window.location.href = result.authorizationUrl;
        return;
      }
      setError("Payment could not be started. Please try again.");
    } catch (e) {
      handlePayError(e);
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
                <div className="co-pay-title-row">
                  <h2 className="co-card-title">Payment Details</h2>
                  <span className="co-pay-lock">
                    <Lock size={13} />
                    Secure
                  </span>
                </div>
                <p className="co-pay-note">
                  Card data is sent directly to our payment provider over a secure connection —
                  it is never stored on Lasha's servers.
                </p>

                <div className="co-pay-fields">
                  <label className="co-pay-field">
                    <span className="co-pay-label">Card Holder Name</span>
                    <input
                      className="co-pay-input"
                      type="text"
                      value={holderName}
                      onChange={(e) => setHolderName(e.target.value)}
                      placeholder="Enter card holder name"
                      autoComplete="cc-name"
                      disabled={paying || closed}
                    />
                  </label>
                  <label className="co-pay-field">
                    <span className="co-pay-label">Card Number</span>
                    <input
                      className="co-pay-input"
                      type="text"
                      inputMode="numeric"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(formatCardNumber(e.target.value))}
                      placeholder="Enter card number"
                      autoComplete="cc-number"
                      disabled={paying || closed}
                    />
                  </label>
                  <div className="co-pay-split">
                    <label className="co-pay-field">
                      <span className="co-pay-label">Expiry Date</span>
                      <input
                        className="co-pay-input"
                        type="text"
                        inputMode="numeric"
                        value={expiry}
                        onChange={(e) => setExpiry(formatExpiry(e.target.value))}
                        placeholder="MM/YY"
                        autoComplete="cc-exp"
                        disabled={paying || closed}
                      />
                    </label>
                    <label className="co-pay-field">
                      <span className="co-pay-label">CVV</span>
                      <input
                        className="co-pay-input"
                        type="password"
                        inputMode="numeric"
                        value={cvv}
                        onChange={(e) => setCvv(e.target.value.replace(/\D/g, "").slice(0, 4))}
                        placeholder="CVV"
                        autoComplete="cc-csc"
                        maxLength={4}
                        disabled={paying || closed}
                      />
                    </label>
                  </div>
                </div>

                {/* Bank authorization step (OTP challenge) */}
                {otpReference && (
                  <div className="co-otp-box">
                    <div className="co-otp-head">
                      <KeyRound size={15} />
                      <span>Confirm with your bank</span>
                    </div>
                    <p className="co-otp-text">
                      Enter the one-time code your bank sent you (SMS or banking app) to
                      authorize this payment.
                    </p>
                    <div className="co-otp-row">
                      <input
                        className="co-pay-input"
                        type="text"
                        inputMode="numeric"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                        placeholder="Enter code"
                        disabled={paying}
                      />
                      <button
                        className="co-otp-submit"
                        onClick={handleOtpSubmit}
                        disabled={paying || otp.trim().length < 3}
                      >
                        {paying ? (
                          <Loader2 size={15} className="animate-spin" />
                        ) : (
                          <KeyRound size={15} />
                        )}
                        Verify
                      </button>
                    </div>
                  </div>
                )}

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
                      Processing…
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

                <button
                  className="co-hosted-link"
                  onClick={handleHostedCheckout}
                  disabled={paying || closed}
                >
                  Prefer a bank page? Use the secure hosted checkout instead
                </button>

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
