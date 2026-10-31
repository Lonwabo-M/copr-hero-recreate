import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import OperationsShell from "@/components/shells/OperationsShell";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquareWarning,
  Play,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { ROLES } from "@/convex/schema";
import { useAuth } from "@/hooks/use-auth";
import type { Id } from "@/convex/_generated/dataModel";
import "@/styles/dashboard.css";
import "@/styles/operations.css";

// ─── Disputes (Operations Centre) ────────────────────────────────────────────
// The staff side of the disputes workflow. A dispute raised by a customer
// arrives here with a 7-day response target; the linked driver settlement is
// held as "disputed" until someone records an outcome and decides the payout.
//
// Access is enforced by the queries (Operations + Super Admin only), not by
// this page — a company admin must never see another business's disputes.

type StatusFilter = "" | "open" | "investigating" | "resolved" | "rejected";
type CloseStatus = "resolved" | "rejected";
type Resolution =
  | "refund_full"
  | "refund_partial"
  | "redelivery"
  | "goodwill_credit"
  | "no_action";
type DriverPayout = "released" | "withheld";

const TABS: { id: StatusFilter; label: string }[] = [
  { id: "", label: "All" },
  { id: "open", label: "Open" },
  { id: "investigating", label: "Investigating" },
  { id: "resolved", label: "Resolved" },
  { id: "rejected", label: "Rejected" },
];

const STATUS_COLOR: Record<string, string> = {
  open: "#856404",
  investigating: "#0794B5",
  resolved: "#0A7C42",
  rejected: "#C62828",
};

const RESOLUTION_LABELS: Record<Resolution, string> = {
  refund_full: "Full refund",
  refund_partial: "Partial refund",
  redelivery: "Redelivery at our cost",
  goodwill_credit: "Goodwill credit",
  no_action: "No refund",
};

function formatMoney(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(
    cents / 100,
  );
}

function formatDate(ts: number | null | undefined): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function dueLabel(dueAt: number): string {
  const days = Math.ceil((dueAt - Date.now()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

const fieldStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 10,
  border: "1px solid #e6e3d8",
  fontFamily: "Inter, sans-serif",
  fontSize: 13.5,
  color: "#202020",
  background: "#ffffff",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "#8a8a8a",
  marginBottom: 6,
};

export default function AdminDisputes() {
  const { user } = useAuth();
  const role = user?.role as string | undefined;
  const allowed = role === ROLES.OPERATIONS || role === ROLES.SUPER_ADMIN;

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [closeStatus, setCloseStatus] = useState<CloseStatus>("resolved");
  const [resolution, setResolution] = useState<Resolution>("no_action");
  const [amountRands, setAmountRands] = useState("");
  const [driverPayout, setDriverPayout] = useState<DriverPayout>("released");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const disputes = useQuery(
    api.disputes.service.listDisputes,
    allowed ? (statusFilter ? { status: statusFilter } : {}) : "skip",
  );
  const stats = useQuery(api.disputes.service.getDisputeStats, allowed ? {} : "skip");
  const startReview = useMutation(api.disputes.service.startDisputeReview);
  const resolveDispute = useMutation(api.disputes.service.resolveDispute);

  const rows = disputes ?? [];
  const selected = rows.find((row) => row._id === openId) ?? null;
  const selectedClosed = selected?.status === "resolved" || selected?.status === "rejected";

  const resetForm = () => {
    setCloseStatus("resolved");
    setResolution("no_action");
    setAmountRands("");
    setDriverPayout("released");
    setNote("");
  };

  const handleStartReview = async () => {
    if (!selected) return;
    setError("");
    setBusy(true);
    try {
      await startReview({ disputeId: selected._id as Id<"disputes"> });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the review.");
    } finally {
      setBusy(false);
    }
  };

  const handleResolve = async () => {
    if (!selected) return;
    setError("");
    if (note.trim().length < 10) {
      setError("Explain the outcome in at least 10 characters — it is the customer's answer.");
      return;
    }
    const needsAmount = resolution === "refund_partial" || resolution === "goodwill_credit";
    const rands = Number(amountRands);
    if (needsAmount && (!Number.isFinite(rands) || rands <= 0)) {
      setError("Enter the amount to refund or credit in rands.");
      return;
    }
    setBusy(true);
    try {
      await resolveDispute({
        disputeId: selected._id as Id<"disputes">,
        status: closeStatus,
        resolution,
        ...(needsAmount || resolution === "refund_full"
          ? { resolutionAmount: needsAmount ? Math.round(rands * 100) : undefined }
          : {}),
        resolutionNote: note.trim(),
        driverPayout,
      });
      setOpenId(null);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not close the dispute.");
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) {
    return (
      <OperationsShell activeItem="Disputes">
        <main className="ops-main">
          <div className="empty-state">
            <div className="empty-state-icon">
              <ShieldCheck size={24} />
            </div>
            <div className="empty-state-title">Restricted queue</div>
            <div className="empty-state-desc">
              Delivery disputes are handled by Lasha Operations and Super Admin accounts only,
              so one business can never see another business&apos;s claims.
            </div>
          </div>
        </main>
      </OperationsShell>
    );
  }

  return (
    <OperationsShell activeItem="Disputes">
      <main className="ops-main">
        <div className="ops-admin-head">
          <h1 className="ops-admin-portal">Operations Centre</h1>
          <span className="ops-admin-section">Disputes</span>
        </div>

        <div className="ops-stats-grid" style={{ marginBottom: 18 }}>
          <div className="ops-stat-card">
            <div className="ops-stat-icon" style={{ background: "rgba(133,100,4,0.1)", color: "#856404" }}>
              <MessageSquareWarning size={20} />
            </div>
            <div>
              <div className="ops-stat-value">{stats === undefined ? "…" : stats.open}</div>
              <div className="ops-stat-label">Open</div>
            </div>
          </div>
          <div className="ops-stat-card">
            <div className="ops-stat-icon" style={{ background: "rgba(7,148,181,0.1)", color: "#0794B5" }}>
              <Clock size={20} />
            </div>
            <div>
              <div className="ops-stat-value">
                {stats === undefined ? "…" : stats.investigating}
              </div>
              <div className="ops-stat-label">Investigating</div>
            </div>
          </div>
          <div className="ops-stat-card">
            <div className="ops-stat-icon" style={{ background: "rgba(198,40,40,0.1)", color: "#C62828" }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="ops-stat-value">{stats === undefined ? "…" : stats.overdue}</div>
              <div className="ops-stat-label">Past 7-day target</div>
            </div>
          </div>
          <div className="ops-stat-card">
            <div className="ops-stat-icon" style={{ background: "rgba(10,124,66,0.1)", color: "#0A7C42" }}>
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div className="ops-stat-value">{stats === undefined ? "…" : stats.resolved}</div>
              <div className="ops-stat-label">Closed</div>
            </div>
          </div>
        </div>

        <div
          className="ops-filter-group"
          style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}
        >
          <div className="ops-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id || "all"}
                className={`ops-tab ${statusFilter === tab.id ? "active" : ""}`}
                onClick={() => {
                  setStatusFilter(tab.id);
                  setOpenId(null);
                }}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#777" }}>
            Claims window 7 days · response target 7 days · driver payout held while open
          </span>
        </div>

        {error && (
          <p role="alert" style={{ color: "#C62828", fontSize: 13, marginBottom: 12 }}>
            {error}
          </p>
        )}

        {disputes === undefined ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Loader2 size={22} className="animate-spin" style={{ color: "#999" }} />
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <MessageSquareWarning size={24} />
            </div>
            <div className="empty-state-title">No disputes</div>
            <div className="empty-state-desc">
              Claims raised from the customer portal appear here, with the driver&apos;s payout
              held until you close them.
            </div>
          </div>
        ) : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Claim</th>
                  <th>Customer</th>
                  <th>Delivery</th>
                  <th>Driver</th>
                  <th>Target</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row._id}>
                    <td style={{ fontFamily: "monospace", fontSize: 11.5 }}>{row.reference}</td>
                    <td style={{ fontSize: 12.5 }}>{row.categoryLabel}</td>
                    <td style={{ fontSize: 12.5 }}>
                      {row.customerName}
                      <span style={{ display: "block", color: "#8a8a8a", fontSize: 11.5 }}>
                        {row.customerEmail ?? "—"}
                      </span>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {row.trackingNumber ?? "—"}
                      <span style={{ display: "block", color: "#8a8a8a", fontSize: 11.5 }}>
                        {row.deliveryStatus?.replace(/_/g, " ") ?? "—"} ·{" "}
                        {formatMoney(row.orderPrice)}
                      </span>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {row.driverName ?? "Unassigned"}
                      <span style={{ display: "block", color: "#8a8a8a", fontSize: 11.5 }}>
                        {row.settlementStatus ? `settlement ${row.settlementStatus}` : "no settlement"}
                      </span>
                    </td>
                    <td
                      style={{
                        fontSize: 12,
                        whiteSpace: "nowrap",
                        color: row.overdue ? "#C62828" : "#666",
                        fontWeight: row.overdue ? 700 : 400,
                      }}
                    >
                      {formatDate(row.slaDueAt)}
                      <span style={{ display: "block", fontSize: 11 }}>
                        {row.status === "resolved" || row.status === "rejected"
                          ? "Closed"
                          : dueLabel(row.slaDueAt)}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "capitalize",
                          color: STATUS_COLOR[row.status] ?? "#555",
                        }}
                      >
                        {row.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td>
                      <button
                        className="ops-btn ops-btn-secondary"
                        style={{ fontSize: 12, padding: "5px 10px" }}
                        onClick={() => {
                          setOpenId(openId === row._id ? null : row._id);
                          resetForm();
                          setError("");
                        }}
                      >
                        {openId === row._id ? "Close" : "Open"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selected && (
          <section
            style={{
              marginTop: 20,
              border: "1px solid #e6e3d8",
              borderRadius: 14,
              background: "#ffffff",
              padding: 20,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
              <div>
                <p
                  style={{
                    fontSize: 11,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    color: "#8a8a8a",
                    marginBottom: 4,
                  }}
                >
                  {selected.reference} · {selected.categoryLabel}
                </p>
                <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
                  {selected.trackingNumber ?? "Delivery"} · {formatMoney(selected.orderPrice)}
                </h2>
              </div>
              <div style={{ fontSize: 12, color: "#666", textAlign: "right" }}>
                <Clock size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                Target {formatDate(selected.slaDueAt)}
                <span style={{ display: "block" }}>
                  {selected.status === "resolved" || selected.status === "rejected"
                    ? `Closed ${formatDate(selected.resolvedAt)}`
                    : dueLabel(selected.slaDueAt)}
                </span>
              </div>
            </div>

            <dl
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                gap: 12,
                margin: "18px 0",
              }}
            >
              <div>
                <dt style={labelStyle}>Customer</dt>
                <dd style={{ margin: 0, fontSize: 13 }}>
                  {selected.customerName}
                  <span style={{ display: "block", color: "#8a8a8a", fontSize: 12 }}>
                    {selected.customerEmail ?? "—"}
                  </span>
                </dd>
              </div>
              <div>
                <dt style={labelStyle}>Driver</dt>
                <dd style={{ margin: 0, fontSize: 13 }}>
                  {selected.driverName ?? "Unassigned"}
                  <span style={{ display: "block", color: "#8a8a8a", fontSize: 12 }}>
                    {selected.settlementStatus
                      ? `settlement ${selected.settlementStatus} · ${formatMoney(selected.settlementAmount)}`
                      : "no settlement recorded"}
                  </span>
                </dd>
              </div>
              <div>
                <dt style={labelStyle}>Driver payout decision</dt>
                <dd style={{ margin: 0, fontSize: 13, textTransform: "capitalize" }}>
                  {selected.driverPayout ?? "Pending"}
                </dd>
              </div>
            </dl>

            <p
              style={{
                fontSize: 13.5,
                lineHeight: 1.6,
                whiteSpace: "pre-wrap",
                background: "#f8f6ef",
                borderRadius: 10,
                padding: "12px 14px",
              }}
            >
              {selected.description}
            </p>

            {selectedClosed ? (
              <div
                style={{
                  marginTop: 16,
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: "rgba(10,124,66,0.06)",
                  border: "1px solid rgba(10,124,66,0.25)",
                  fontSize: 13,
                  lineHeight: 1.6,
                }}
              >
                <strong style={{ display: "block", marginBottom: 4 }}>
                  {selected.status === "resolved" ? "Resolved" : "Rejected"}
                  {selected.resolution ? ` — ${RESOLUTION_LABELS[selected.resolution as Resolution]}` : ""}
                  {selected.resolutionAmount != null
                    ? ` (${formatMoney(selected.resolutionAmount)})`
                    : ""}
                </strong>
                {selected.resolutionNote}
              </div>
            ) : (
              <>
                <label style={{ ...labelStyle, margin: "16px 0 6px" }} htmlFor="dispute-note">
                  Outcome note (sent to the customer)
                </label>
                <textarea
                  id="dispute-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  maxLength={2_000}
                  placeholder="e.g. Recipient confirmed the parcel arrived late on 27 Oct; partial refund of the express surcharge approved."
                  style={{ ...fieldStyle, resize: "vertical" }}
                />

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                    gap: 12,
                    marginTop: 14,
                  }}
                >
                  <div>
                    <label style={labelStyle} htmlFor="dispute-outcome">
                      Decision
                    </label>
                    <select
                      id="dispute-outcome"
                      value={closeStatus}
                      onChange={(e) => {
                        const next = e.target.value as CloseStatus;
                        setCloseStatus(next);
                        if (next === "rejected") setResolution("no_action");
                      }}
                      style={fieldStyle}
                    >
                      <option value="resolved">Resolved (claim upheld)</option>
                      <option value="rejected">Rejected (no action)</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor="dispute-resolution">
                      Resolution
                    </label>
                    <select
                      id="dispute-resolution"
                      value={resolution}
                      disabled={closeStatus === "rejected"}
                      onChange={(e) => setResolution(e.target.value as Resolution)}
                      style={fieldStyle}
                    >
                      {(Object.keys(RESOLUTION_LABELS) as Resolution[]).map((key) => (
                        <option key={key} value={key}>
                          {RESOLUTION_LABELS[key]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor="dispute-amount">
                      Amount (rands)
                    </label>
                    <input
                      id="dispute-amount"
                      value={amountRands}
                      onChange={(e) => setAmountRands(e.target.value)}
                      inputMode="decimal"
                      placeholder={
                        resolution === "refund_full"
                          ? "Full charge applies"
                          : "0.00"
                      }
                      disabled={
                        closeStatus === "rejected" ||
                        (resolution !== "refund_partial" && resolution !== "goodwill_credit")
                      }
                      style={fieldStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle} htmlFor="dispute-payout">
                      Driver settlement
                    </label>
                    <select
                      id="dispute-payout"
                      value={driverPayout}
                      onChange={(e) => setDriverPayout(e.target.value as DriverPayout)}
                      style={fieldStyle}
                    >
                      <option value="released">Release — pay the driver</option>
                      <option value="withheld">Withhold — driver not paid</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                  {selected.status === "open" && (
                    <button
                      className="ops-btn ops-btn-secondary"
                      disabled={busy}
                      onClick={() => void handleStartReview()}
                    >
                      <Play size={14} /> Start investigation
                    </button>
                  )}
                  <button
                    className="ops-btn ops-btn-primary"
                    disabled={busy}
                    onClick={() => void handleResolve()}
                  >
                    {closeStatus === "resolved" ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                    {closeStatus === "resolved" ? "Resolve dispute" : "Reject dispute"}
                  </button>
                  {busy && (
                    <Loader2 size={16} className="animate-spin" style={{ alignSelf: "center" }} />
                  )}
                </div>

                <p style={{ fontSize: 11.5, color: "#8a8a8a", marginTop: 12 }}>
                  Releasing restores the held settlement for the normal payout gate. Withholding
                  marks it failed with this dispute&apos;s reference. Refunds are paid by finance
                  against the reference; every action is written to the audit log.
                </p>
              </>
            )}
          </section>
        )}
      </main>
    </OperationsShell>
  );
}
