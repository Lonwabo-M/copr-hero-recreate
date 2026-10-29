import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import CustomerShell from "@/components/shells/CustomerShell";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquareWarning,
  Package,
  Send,
} from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/pages.css";

// ─── Disputes & claims (customer portal) ─────────────────────────────────────
// A customer-facing route into the disputes workflow: raise a claim on a
// completed, failed or cancelled delivery within the 7-day window in the Terms
// of Service, and follow the answer. Raising a dispute also puts the driver's
// settlement on hold server-side until operations decide the payout.
//
// The backend derives ownership from the session — this page never sends a
// customer id, and the delivery list query already excludes deliveries that
// are outside the claim window.

const CATEGORIES = [
  { value: "not_delivered", label: "Not delivered" },
  { value: "damaged", label: "Damaged in transit" },
  { value: "late", label: "Late delivery" },
  { value: "wrong_item", label: "Wrong item delivered" },
  { value: "overcharged", label: "Incorrect charge" },
  { value: "driver_conduct", label: "Driver conduct" },
  { value: "other", label: "Something else" },
] as const;

type Category = (typeof CATEGORIES)[number]["value"];

const STATUS_COLOR: Record<string, string> = {
  open: "#856404",
  investigating: "#0794B5",
  resolved: "#0A7C42",
  rejected: "#C62828",
};

function formatMoney(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
  }).format(cents / 100);
}

function formatDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 10,
  border: "1px solid var(--lasha-border-light)",
  fontFamily: "Inter, sans-serif",
  fontSize: 14,
  color: "var(--lasha-navy)",
  background: "#ffffff",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--lasha-muted)",
  marginBottom: 7,
};

export default function Disputes() {
  const deliveries = useQuery(api.disputes.service.getDisputableDeliveries, {});
  const myDisputes = useQuery(api.disputes.service.getMyDisputes, {});
  const raiseDispute = useMutation(api.disputes.service.raiseDispute);

  const [deliveryId, setDeliveryId] = useState("");
  const [category, setCategory] = useState<Category>("not_delivered");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ reference: string; dueAt: number } | null>(null);

  const eligible = (deliveries ?? []).filter((d) => !d.openDisputeReference);
  const selectedId = deliveryId || eligible[0]?.deliveryId || "";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!selectedId) {
      setError("Choose the delivery you are disputing.");
      return;
    }
    if (description.trim().length < 20) {
      setError("Describe what went wrong in at least 20 characters.");
      return;
    }
    setBusy(true);
    try {
      const response = await raiseDispute({
        deliveryId: selectedId as Id<"deliveries">,
        category,
        description: description.trim(),
      });
      setResult({ reference: response.reference, dueAt: response.dueAt });
      setDescription("");
      setDeliveryId("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not raise the dispute.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <CustomerShell activeItem="Disputes">
      <div className="dash-workspace" style={{ overflow: "auto" }}>
        <div className="page-container" style={{ maxWidth: 980 }}>
          <div className="page-header">
            <h1 className="page-title">Disputes &amp; claims</h1>
            <p className="page-subtitle">
              Report a delivery problem and follow the answer. Claims must be raised within 7
              days of completion, and we answer within 7 days of receiving one.
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: 14,
              alignItems: "flex-start",
              padding: "14px 18px",
              borderRadius: 12,
              border: "1px solid #e6e3d8",
              background: "#f8f6ef",
              marginBottom: 22,
            }}
          >
            <MessageSquareWarning size={18} style={{ flexShrink: 0, marginTop: 2, color: "#856404" }} />
            <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0 }}>
              Raising a dispute pauses the driver&apos;s payout for that delivery while we
              investigate. We may ask for photographs, the recipient&apos;s details or the parcel
              itself. If you cannot use this form, email{" "}
              <a href="mailto:hello@lasha.co.za" style={{ color: "var(--lasha-cyan)", fontWeight: 600 }}>
                hello@lasha.co.za
              </a>{" "}
              with your tracking number. See the{" "}
              <a href="/terms" style={{ color: "var(--lasha-cyan)", fontWeight: 600 }}>
                Terms of Service
              </a>{" "}
              for the claims and refund rules.
            </p>
          </div>

          {result && (
            <div
              role="status"
              style={{
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
                padding: "14px 18px",
                borderRadius: 12,
                border: "1px solid rgba(10,124,66,0.35)",
                background: "rgba(10,124,66,0.06)",
                marginBottom: 20,
              }}
            >
              <CheckCircle2 size={18} style={{ flexShrink: 0, marginTop: 2, color: "#0A7C42" }} />
              <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                <strong>Dispute received.</strong> Your reference is{" "}
                <strong>{result.reference}</strong>. We will respond by{" "}
                <strong>{formatDate(result.dueAt)}</strong>. Keep the reference for any
                follow-up.
              </div>
            </div>
          )}

          {/* ─── Open / past disputes ─────────────────────────────────── */}
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 12px" }}>Your disputes</h2>
          {myDisputes === undefined ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 36 }}>
              <Loader2 size={22} className="animate-spin" style={{ color: "#999" }} />
            </div>
          ) : myDisputes.length === 0 ? (
            <div className="empty-state" style={{ marginBottom: 26 }}>
              <div className="empty-state-icon">
                <CheckCircle2 size={24} />
              </div>
              <div className="empty-state-title">No disputes raised</div>
              <div className="empty-state-desc">
                When a delivery goes wrong, raise it here and it will appear in this list.
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 26 }}>
              {myDisputes.map((dispute) => (
                <div
                  key={dispute._id}
                  style={{
                    border: "1px solid var(--lasha-border-light)",
                    borderRadius: 14,
                    background: "#ffffff",
                    padding: "16px 18px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700 }}>
                        {dispute.categoryLabel}
                        {dispute.trackingNumber ? (
                          <span style={{ color: "var(--lasha-muted)", fontWeight: 500 }}>
                            {" "}· {dispute.trackingNumber}
                          </span>
                        ) : null}
                      </p>
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--lasha-muted)" }}>
                        {dispute.reference} · raised {formatDate(dispute.createdAt)} · order{" "}
                        {formatMoney(dispute.amount)}
                      </p>
                    </div>
                    <span
                      style={{
                        alignSelf: "flex-start",
                        fontSize: 11.5,
                        fontWeight: 700,
                        textTransform: "capitalize",
                        color: STATUS_COLOR[dispute.status] ?? "#555",
                        background: "rgba(8,38,49,0.05)",
                        borderRadius: 999,
                        padding: "4px 12px",
                      }}
                    >
                      {dispute.status.replace(/_/g, " ")}
                    </span>
                  </div>
                  <p style={{ margin: "12px 0 0", fontSize: 13.5, lineHeight: 1.6 }}>
                    {dispute.description}
                  </p>
                  {dispute.resolutionNote ? (
                    <div
                      style={{
                        marginTop: 12,
                        padding: "11px 14px",
                        borderRadius: 10,
                        background: "#f8f6ef",
                        fontSize: 13,
                        lineHeight: 1.6,
                      }}
                    >
                      <strong style={{ display: "block", marginBottom: 3 }}>
                        Resolution
                        {dispute.resolution ? ` — ${dispute.resolution.replace(/_/g, " ")}` : ""}
                        {dispute.resolutionAmount != null
                          ? ` (${formatMoney(dispute.resolutionAmount)})`
                          : ""}
                      </strong>
                      {dispute.resolutionNote}
                    </div>
                  ) : (
                    <p style={{ margin: "10px 0 0", fontSize: 12.5, color: "var(--lasha-muted)" }}>
                      <Clock size={12} style={{ verticalAlign: "-2px", marginRight: 5 }} />
                      Response due {formatDate(dispute.slaDueAt)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ─── Raise a dispute ──────────────────────────────────────── */}
          <h2 style={{ fontSize: 17, fontWeight: 700, margin: "0 0 12px" }}>Raise a dispute</h2>
          {deliveries === undefined ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 36 }}>
              <Loader2 size={22} className="animate-spin" style={{ color: "#999" }} />
            </div>
          ) : eligible.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon">
                <Package size={24} />
              </div>
              <div className="empty-state-title">No deliveries can be disputed</div>
              <div className="empty-state-desc">
                A delivery can be disputed within 7 days of being completed, failed or
                cancelled. If yours is older than that, email hello@lasha.co.za.
              </div>
            </div>
          ) : (
            <form
              onSubmit={submit}
              style={{
                border: "1px solid var(--lasha-border-light)",
                borderRadius: 16,
                background: "#ffffff",
                padding: 20,
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <label style={labelStyle} htmlFor="dispute-delivery">
                    Delivery
                  </label>
                  <select
                    id="dispute-delivery"
                    value={selectedId}
                    onChange={(e) => setDeliveryId(e.target.value)}
                    style={fieldStyle}
                  >
                    {eligible.map((delivery) => (
                      <option key={delivery.deliveryId} value={delivery.deliveryId}>
                        {delivery.trackingNumber} — {delivery.status.replace(/_/g, " ")} —{" "}
                        {formatDate(delivery.completedAt)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle} htmlFor="dispute-category">
                    What went wrong
                  </label>
                  <select
                    id="dispute-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as Category)}
                    style={fieldStyle}
                  >
                    {CATEGORIES.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={labelStyle} htmlFor="dispute-description">
                  What happened
                </label>
                <textarea
                  id="dispute-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  required
                  minLength={20}
                  maxLength={2_000}
                  rows={5}
                  placeholder="Tell us what was expected, what happened, and what you would like us to do. Include the recipient's name if it helps."
                  style={{ ...fieldStyle, resize: "vertical" }}
                />
                <p style={{ margin: "6px 0 0", fontSize: 11.5, color: "var(--lasha-muted)" }}>
                  {description.trim().length}/2000 characters · at least 20
                </p>
              </div>

              {error && (
                <p
                  role="alert"
                  style={{
                    margin: 0,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    color: "#b91c1c",
                    fontSize: 13,
                  }}
                >
                  {error}
                </p>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                <button
                  type="submit"
                  className="lasha-btn-primary"
                  disabled={busy}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "12px 22px",
                    border: "none",
                    cursor: busy ? "wait" : "pointer",
                    opacity: busy ? 0.7 : 1,
                  }}
                >
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  {busy ? "Sending…" : "Submit dispute"}
                </button>
                <span style={{ fontSize: 12, color: "var(--lasha-muted)" }}>
                  <AlertTriangle size={12} style={{ verticalAlign: "-2px", marginRight: 5 }} />
                  False claims can lead to account restrictions.
                </span>
              </div>
            </form>
          )}
        </div>
      </div>
    </CustomerShell>
  );
}
