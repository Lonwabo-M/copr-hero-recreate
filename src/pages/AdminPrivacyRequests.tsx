import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import OperationsShell from "@/components/shells/OperationsShell";
import { AlertTriangle, CheckCircle2, Clock, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { PRIVACY_REQUEST_LABELS } from "@/convex/privacy/policy";
import { ROLES } from "@/convex/schema";
import { useAuth } from "@/hooks/use-auth";
import "@/styles/dashboard.css";
import "@/styles/operations.css";

// ─── Privacy Requests (Operations Centre) ────────────────────────────────────
// The staff side of POPIA data subject requests: the queue the /privacy-rights
// form and the privacy@lasha.co.za desk feed. Reference, type, 30-day due date
// and status come from privacy_requests; handling follows the DSAR runbook
// (docs/popia/dsar-runbook.md). Every status change is audit-logged server-side
// with the acting staff member.
//
// Access is enforced by the query itself (Operations + Super Admin only), not
// by this page.

type StatusFilter = "" | "received" | "in_progress" | "completed" | "refused";

const TABS: { id: StatusFilter; label: string }[] = [
  { id: "", label: "All" },
  { id: "received", label: "Received" },
  { id: "in_progress", label: "In progress" },
  { id: "completed", label: "Completed" },
  { id: "refused", label: "Refused" },
];

const STATUS_COLOR: Record<string, string> = {
  received: "#0794B5",
  in_progress: "#856404",
  completed: "#0A7C42",
  refused: "#C62828",
};

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function daysLeft(dueAt: number): string {
  const days = Math.ceil((dueAt - Date.now()) / 86_400_000);
  if (days < 0) return `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue`;
  if (days === 0) return "Due today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

export default function AdminPrivacyRequests() {
  const { user } = useAuth();
  // The backend admits only Operations and Super Admin (a company admin must
  // never see another business's data subject requests). Fleet managers and
  // company admins can reach the Operations area, so this page mirrors the
  // backend rule instead of rendering a queue whose queries would throw.
  const role = user?.role as string | undefined;
  const allowed = role === ROLES.OPERATIONS || role === ROLES.SUPER_ADMIN;

  const [status, setStatus] = useState<StatusFilter>("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const requests = useQuery(
    api.privacy.queries.listPrivacyRequests,
    allowed ? { limit: 200, ...(status ? { status } : {}) } : "skip",
  );
  const stats = useQuery(
    api.privacy.queries.getPrivacyRequestStats,
    allowed ? {} : "skip",
  );
  const updateStatus = useMutation(api.privacy.mutations.updatePrivacyRequestStatus);

  const rows = requests ?? [];
  const selected = rows.find((row) => row._id === openId) ?? null;

  const applyStatus = async (next: "in_progress" | "completed" | "refused") => {
    if (!selected) return;
    setError("");
    setBusy(true);
    try {
      await updateStatus({
        requestId: selected._id,
        status: next,
        ...(note.trim() ? { resolutionNote: note.trim() } : {}),
      });
      setOpenId(null);
      setNote("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update the request.");
    } finally {
      setBusy(false);
    }
  };

  if (!allowed) {
    return (
      <OperationsShell activeItem="Privacy Requests">
        <main className="ops-main">
          <div className="empty-state">
            <div className="empty-state-icon">
              <ShieldCheck size={24} />
            </div>
            <div className="empty-state-title">Restricted queue</div>
            <div className="empty-state-desc">
              Privacy requests are handled by Lasha Operations and Super Admin
              accounts only, so one business can never see another person&apos;s
              request. Ask the Information Officer for access if you need it.
            </div>
          </div>
        </main>
      </OperationsShell>
    );
  }

  return (
    <OperationsShell activeItem="Privacy Requests">
      <main className="ops-main">
        <div className="ops-admin-head">
          <h1 className="ops-admin-portal">Operations Centre</h1>
          <span className="ops-admin-section">Privacy Requests</span>
        </div>

        <div className="ops-stats-grid" style={{ marginBottom: 18 }}>
          <div className="ops-stat-card">
            <div className="ops-stat-icon" style={{ background: "rgba(7,148,181,0.1)", color: "#0794B5" }}>
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="ops-stat-value">{stats === undefined ? "…" : stats.open}</div>
              <div className="ops-stat-label">Open · 30-day clock</div>
            </div>
          </div>
          <div className="ops-stat-card">
            <div className="ops-stat-icon" style={{ background: "rgba(198,40,40,0.1)", color: "#C62828" }}>
              <AlertTriangle size={20} />
            </div>
            <div>
              <div className="ops-stat-value">{stats === undefined ? "…" : stats.overdue}</div>
              <div className="ops-stat-label">Overdue</div>
            </div>
          </div>
          <div className="ops-stat-card">
            <div className="ops-stat-icon" style={{ background: "rgba(10,124,66,0.1)", color: "#0A7C42" }}>
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div className="ops-stat-value">{stats === undefined ? "…" : stats.completed}</div>
              <div className="ops-stat-label">Completed</div>
            </div>
          </div>
        </div>

        <div className="ops-filter-group" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16 }}>
          <div className="ops-tabs">
            {TABS.map((tab) => (
              <button
                key={tab.id || "all"}
                className={`ops-tab ${status === tab.id ? "active" : ""}`}
                onClick={() => {
                  setStatus(tab.id);
                  setOpenId(null);
                }}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#777" }}>
            POPIA s23–s24 · respond within 30 days
          </span>
        </div>

        {error ? (
          <p role="alert" style={{ color: "#C62828", fontSize: 13, marginBottom: 12 }}>
            {error}
          </p>
        ) : null}

        {requests === undefined ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Loader2 size={22} className="animate-spin" style={{ color: "#999" }} />
          </div>
        ) : rows.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <ShieldCheck size={24} />
            </div>
            <div className="empty-state-title">No privacy requests</div>
            <div className="empty-state-desc">
              Requests lodged at /privacy-rights or sent to the privacy desk appear here
              with a 30-day due date.
            </div>
          </div>
        ) : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Request</th>
                  <th>Person</th>
                  <th>Received</th>
                  <th>Deadline</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((request) => (
                  <tr key={request._id}>
                    <td style={{ fontFamily: "monospace", fontSize: 11.5 }}>{request.reference}</td>
                    <td style={{ fontSize: 12.5 }}>{PRIVACY_REQUEST_LABELS[request.type]}</td>
                    <td style={{ fontSize: 12.5 }}>
                      {request.name}
                      <span style={{ display: "block", color: "#8a8a8a", fontSize: 11.5 }}>
                        {request.email}
                      </span>
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap", color: "#666" }}>
                      {fmtDate(request.submittedAt)}
                    </td>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap", color: request.overdue ? "#C62828" : "#666", fontWeight: request.overdue ? 700 : 400 }}>
                      {fmtDate(request.dueAt)}
                      <span style={{ display: "block", fontSize: 11 }}>
                        {request.status === "completed" || request.status === "refused"
                          ? "Resolved"
                          : daysLeft(request.dueAt)}
                      </span>
                    </td>
                    <td>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          textTransform: "capitalize",
                          color: STATUS_COLOR[request.status] ?? "#555",
                        }}
                      >
                        {request.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td>
                      <button
                        className="ops-btn ops-btn-secondary"
                        style={{ fontSize: 12, padding: "5px 10px" }}
                        onClick={() => {
                          setOpenId(openId === request._id ? null : request._id);
                          setNote(request.resolutionNote ?? "");
                          setError("");
                        }}
                      >
                        {openId === request._id ? "Close" : "Open"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {selected ? (
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
                <p style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "#8a8a8a", marginBottom: 4 }}>
                  {selected.reference}
                </p>
                <h2 style={{ fontSize: 17, fontWeight: 700, margin: 0 }}>
                  {PRIVACY_REQUEST_LABELS[selected.type]}
                </h2>
              </div>
              <div style={{ fontSize: 12, color: "#666", textAlign: "right" }}>
                <Clock size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                Due {fmtDate(selected.dueAt)}
                <span style={{ display: "block" }}>{daysLeft(selected.dueAt)}</span>
              </div>
            </div>

            <dl style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, margin: "18px 0" }}>
              <div>
                <dt style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a8a8a" }}>Name</dt>
                <dd style={{ margin: 0, fontSize: 13 }}>{selected.name}</dd>
              </div>
              <div>
                <dt style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a8a8a" }}>Email</dt>
                <dd style={{ margin: 0, fontSize: 13 }}>{selected.email}</dd>
              </div>
              <div>
                <dt style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a8a8a" }}>Phone</dt>
                <dd style={{ margin: 0, fontSize: 13 }}>{selected.phone ?? "—"}</dd>
              </div>
            </dl>

            <p style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap", background: "#f8f6ef", borderRadius: 10, padding: "12px 14px" }}>
              {selected.details}
            </p>

            <label
              htmlFor="resolution-note"
              style={{ display: "block", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#8a8a8a", margin: "16px 0 6px" }}
            >
              Resolution note (what was sent, and to whom)
            </label>
            <textarea
              id="resolution-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="e.g. Export emailed 28 Oct 2026; verified by account email and tracking number."
              style={{
                width: "100%",
                fontSize: 13,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid #e6e3d8",
                fontFamily: "Inter, sans-serif",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />

            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              <button
                className="ops-btn ops-btn-secondary"
                disabled={busy}
                onClick={() => void applyStatus("in_progress")}
              >
                <Clock size={14} /> Mark in progress
              </button>
              <button
                className="ops-btn ops-btn-primary"
                disabled={busy}
                onClick={() => void applyStatus("completed")}
              >
                <CheckCircle2 size={14} /> Complete
              </button>
              <button
                className="ops-btn ops-btn-secondary"
                disabled={busy}
                onClick={() => void applyStatus("refused")}
                style={{ color: "#C62828" }}
              >
                <XCircle size={14} /> Refuse (explain why)
              </button>
              {busy ? <Loader2 size={16} className="animate-spin" style={{ alignSelf: "center" }} /> : null}
            </div>
            <p style={{ fontSize: 11.5, color: "#8a8a8a", marginTop: 12 }}>
              Completing or refusing stamps the resolution date; the record is deleted 24
              months later by the retention sweep. Follow the DSAR runbook for identity
              verification and legal-hold records.
            </p>
          </section>
        ) : null}
      </main>
    </OperationsShell>
  );
}
