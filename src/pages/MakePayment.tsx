import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";
import CustomerShell from "@/components/shells/CustomerShell";
import { CreditCard, Building2, Wallet, Smartphone, Loader2, CheckCircle2, XCircle, ExternalLink, Clock } from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/pages.css";

/**
 * Make Payment — real customer payment flow.
 *
 * - Amounts come from the authoritative stored order charge (server-side);
 *   the customer selects an order, they never type an amount.
 * - "Pay" calls the Convex Paystack action, which returns a checkout URL.
 * - After returning from checkout (?reference=...), the app verifies the
 *   payment server-side (Paystack verify endpoint) — the browser is never
 *   trusted as proof of payment.
 * - Status badges read the authoritative payment_transactions state via
 *   reactive queries. No simulated success, no setTimeout.
 */

type OverviewEntry = {
  orderId: string;
  trackingNumber: string | null;
  orderStatus: string;
  createdAt: number;
  amount: number;
  payment: {
    status: string;
    provider: string;
    providerTransactionId: string | null;
    amount: number;
    createdAt: number;
    completedAt: number | null;
  } | null;
};

const formatCurrency = (cents: number) =>
  new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
  }).format(cents / 100);

const methods = [
  { id: "card", label: "Credit / Debit Card", icon: CreditCard },
  { id: "eft", label: "EFT Bank Transfer", icon: Building2 },
  { id: "wallet", label: "Lasha Wallet", icon: Wallet },
  { id: "snapscan", label: "SnapScan", icon: Smartphone },
];

function paymentBadge(payment: OverviewEntry["payment"]) {
  if (!payment) {
    return (
      <span style={{ fontSize: 12, fontWeight: 600, color: "#8a6d1a", background: "#fdf6e3", border: "1px solid #f0e0b0", borderRadius: 999, padding: "3px 10px" }}>
        Unpaid
      </span>
    );
  }
  switch (payment.status) {
    case "completed":
      return (
        <span style={{ fontSize: 12, fontWeight: 600, color: "#1a7a3d", background: "#e9f9ef", border: "1px solid #bfe8cd", borderRadius: 999, padding: "3px 10px" }}>
          Paid
        </span>
      );
    case "failed":
      return (
        <span style={{ fontSize: 12, fontWeight: 600, color: "#a02020", background: "#fdeeee", border: "1px solid #f2c6c6", borderRadius: 999, padding: "3px 10px" }}>
          Failed
        </span>
      );
    case "refunded":
      return (
        <span style={{ fontSize: 12, fontWeight: 600, color: "#555", background: "#f2f2f2", border: "1px solid #ddd", borderRadius: 999, padding: "3px 10px" }}>
          Refunded
        </span>
      );
    default:
      return (
        <span style={{ fontSize: 12, fontWeight: 600, color: "#0a5c74", background: "#e8f6fb", border: "1px solid #c2e5f0", borderRadius: 999, padding: "3px 10px" }}>
          Pending
        </span>
      );
  }
}

export default function MakePayment() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [method, setMethod] = useState("card");
  const [selectedOrderId, setSelectedOrderId] = useState<Id<"orders"> | null>(null);
  const [initiating, setInitiating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const overview = useQuery(api.payments.queries.getMyPaymentOverview, {});
  const initiatePayment = useAction(api.payments.actions.initiateOrderPayment);
  const payWithWallet = useAction(api.payments.actions.payOrderWithWallet);
  const verifyPayment = useAction(api.payments.actions.verifyOrderPayment);

  // Server-side verification after returning from Paystack checkout.
  // Runs once per reference; the backend is idempotent for repeats.
  const reference = searchParams.get("reference");
  const verifying = Boolean(reference);
  useEffect(() => {
    if (!reference) return;
    let cancelled = false;
    verifyPayment({ reference })
      .then((result) => {
        if (cancelled) return;
        if (result.status === "completed") {
          setNotice("Payment successful — thank you.");
          setError(null);
        } else if (result.status === "failed") {
          setError("The payment was not completed. You can try again.");
        } else {
          setNotice("Payment is still pending with the provider. This page updates when it completes.");
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Payment verification failed");
      })
      .finally(() => {
        if (cancelled) return;
        // Clean the URL so refresh/re-verify doesn't loop on a stale reference.
        searchParams.delete("reference");
        setSearchParams(searchParams, { replace: true });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reference]);

  const handlePay = async () => {
    if (!selectedOrderId || initiating) return;
    setInitiating(true);
    setError(null);
    setNotice(null);
    try {
      if (method === "wallet") {
        const result = await payWithWallet({ orderId: selectedOrderId });
        if (result.alreadyPaid) {
          setNotice("This order has already been paid.");
        } else {
          setNotice(
            `Paid ${formatCurrency(selected?.amount ?? 0)} from your Lasha wallet.`,
          );
        }
        return;
      }

      const result = await initiatePayment({ orderId: selectedOrderId, method });
      if (result.alreadyPaid) {
        setNotice("This order has already been paid.");
      } else if (result.authorizationUrl) {
        // Redirect to the provider's secure checkout page.
        window.location.assign(result.authorizationUrl);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the payment");
    } finally {
      setInitiating(false);
    }
  };

  const payable = (overview ?? []).filter(
    (o: OverviewEntry) => o.payment?.status !== "completed" && o.payment?.status !== "refunded"
  );
  const selected = payable.find((o: OverviewEntry) => o.orderId === selectedOrderId) ?? null;

  return (
    <CustomerShell activeItem="Make Payment">
      <div className="dash-workspace" style={{ overflow: "auto" }}>
        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">Make a Payment</h1>
            <p className="page-subtitle">Pay for your deliveries securely through our payment provider</p>
          </div>

          {verifying && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderRadius: 10, background: "#e8f6fb", border: "1px solid #c2e5f0", marginBottom: 20, maxWidth: 700 }}>
              <Loader2 size={18} style={{ animation: "spin 1s linear infinite", color: "#0794b5" }} />
              <span style={{ fontSize: 14, color: "#0a5c74" }}>Verifying your payment with the provider…</span>
            </div>
          )}

          {notice && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderRadius: 10, background: "#e9f9ef", border: "1px solid #bfe8cd", marginBottom: 20, maxWidth: 700 }}>
              <CheckCircle2 size={18} style={{ color: "#1a7a3d" }} />
              <span style={{ fontSize: 14, color: "#1a7a3d" }}>{notice}</span>
            </div>
          )}

          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderRadius: 10, background: "#fdeeee", border: "1px solid #f2c6c6", marginBottom: 20, maxWidth: 700 }}>
              <XCircle size={18} style={{ color: "#a02020" }} />
              <span style={{ fontSize: 14, color: "#a02020" }}>{error}</span>
              {error.toLowerCase().includes("insufficient wallet") && (
                <Link
                  to="/wallet"
                  style={{ fontSize: 13, fontWeight: 600, color: "#0794b5", whiteSpace: "nowrap" }}
                >
                  Top up wallet
                </Link>
              )}
            </div>
          )}

          {/* Orders to pay */}
          <div style={{ maxWidth: 700, marginBottom: 24 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#202020", display: "block", marginBottom: 10 }}>
              Select a delivery to pay for
            </label>

            {overview === undefined ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 20, border: "1px solid #e8e8e8", borderRadius: 10 }}>
                <Loader2 size={18} style={{ animation: "spin 1s linear infinite", color: "#999" }} />
                <span style={{ fontSize: 14, color: "#666" }}>Loading your orders…</span>
              </div>
            ) : payable.length === 0 ? (
              <div style={{ padding: 20, border: "1px solid #e8e8e8", borderRadius: 10, background: "#fafafa" }}>
                <p style={{ fontSize: 14, color: "#666", margin: 0 }}>
                  Nothing to pay right now — all your deliveries are paid or there are no orders yet.
                </p>
              </div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {payable.map((o: OverviewEntry) => {
                  const isSelected = selectedOrderId === o.orderId;
                  return (
                    <button
                      key={o.orderId}
                      onClick={() => setSelectedOrderId(o.orderId as Id<"orders">)}
                      disabled={initiating}
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                        padding: "14px 18px", borderRadius: 10, cursor: initiating ? "wait" : "pointer",
                        border: `1px solid ${isSelected ? "#42b4d0" : "#e8e8e8"}`,
                        background: isSelected ? "#f0fbfd" : "#fff", textAlign: "left", transition: "all 0.15s",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: "#202020" }}>
                            {o.trackingNumber ?? "Delivery"}
                          </span>
                          {paymentBadge(o.payment)}
                        </div>
                        <span style={{ fontSize: 12, color: "#999", marginTop: 2, display: "block" }}>
                          Placed {new Date(o.createdAt).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      </div>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#202020", whiteSpace: "nowrap" }}>
                        {formatCurrency(o.amount)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Payment method */}
          <div style={{ maxWidth: 700, marginBottom: 24 }}>
            <label style={{ fontSize: 13, fontWeight: 600, color: "#202020", display: "block", marginBottom: 10 }}>Payment Method</label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
              {methods.map((m) => {
                const Icon = m.icon;
                const isSel = method === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMethod(m.id)}
                    disabled={initiating}
                    style={{
                      display: "flex", alignItems: "center", gap: 12, padding: "14px 16px",
                      borderRadius: 10, border: `1px solid ${isSel ? "#42b4d0" : "#e8e8e8"}`,
                      background: isSel ? "#f0fbfd" : "#fff", cursor: "pointer", textAlign: "left", transition: "all 0.15s",
                    }}
                  >
                    <div style={{
                      width: 38, height: 38, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                      background: isSel ? "#42b4d0" : "#f4f4f4", color: isSel ? "#fff" : "#666",
                    }}>
                      <Icon size={19} />
                    </div>
                    <span style={{ fontSize: 13.5, fontWeight: 500, color: isSel ? "#0794b5" : "#202020" }}>{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount summary (authoritative, read-only) */}
          <div style={{
            padding: "18px 22px", borderRadius: 12, background: "#f0fbfd",
            border: "1px solid #d4eef5", marginBottom: 24, maxWidth: 700,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {selected?.payment?.status === "failed" ? (
                <XCircle size={20} style={{ color: "#a02020" }} />
              ) : (
                <Clock size={20} style={{ color: "#0794b5" }} />
              )}
              <div>
                <p style={{ fontSize: 12, color: "#666", margin: 0 }}>Amount due (set at order time)</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: "#202020", margin: 0 }}>
                  {selected ? formatCurrency(selected.amount) : "—"}
                </p>
              </div>
            </div>
            {selected?.payment?.status === "pending" && (
              <span style={{ fontSize: 12, color: "#0a5c74" }}>A pending attempt exists</span>
            )}
          </div>

          <div style={{ maxWidth: 700 }}>
            <button
              onClick={handlePay}
              disabled={!selected || initiating || verifying}
              style={{
                width: "100%", padding: "14px 24px", borderRadius: 10, border: "none",
                background: !selected || initiating || verifying ? "#ccc" : "#42b4d0",
                color: "#fff", fontSize: 15, fontWeight: 600,
                cursor: !selected || initiating || verifying ? "not-allowed" : "pointer",
                transition: "background 0.15s",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              {initiating ? (
                <>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  {method === "wallet" ? "Paying from wallet…" : "Starting secure checkout…"}
                </>
              ) : verifying ? (
                <>
                  <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                  Verifying payment…
                </>
              ) : method === "wallet" ? (
                <>
                  <Wallet size={16} />
                  Pay from Lasha Wallet
                </>
              ) : (
                <>
                  <ExternalLink size={16} />
                  Continue to Secure Payment
                </>
              )}
            </button>
            <p style={{ fontSize: 12, color: "#999", marginTop: 10 }}>
              {method === "wallet"
                ? "Your Lasha wallet is debited immediately and the payment is recorded server-side. Top up first if your balance is too low."
                : "You will be redirected to our payment provider's secure checkout. Payment status is confirmed server-side — this page never assumes success on its own."}
            </p>
          </div>
        </div>
      </div>
    </CustomerShell>
  );
}
