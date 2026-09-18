import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import AdminShell from "@/components/shells/AdminShell";
import { Loader2, ScrollText, Search, ShieldCheck, Activity } from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/operations.css";

// ─── Audit Log (Admin Portal) ────────────────────────────────────────────────
// Platform governance surface: the recent audit trail (who did what, where,
// when) with category filtering and a 24-hour activity summary. Every domain
// mutation already writes here server-side; the portal makes it visible.

type AuditEventRow = {
  _id: string;
  actorId?: string;
  actorRole: string;
  actorEmail?: string;
  category: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: string;
  timestamp: number;
};

const CATEGORIES = [
  { id: "", label: "All" },
  { id: "delivery", label: "Delivery" },
  { id: "dispatch", label: "Dispatch" },
  { id: "pricing", label: "Pricing" },
  { id: "payment", label: "Payment" },
  { id: "user", label: "Users" },
  { id: "auth", label: "Auth" },
] as const;

function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function actionColor(action: string): string {
  if (action.includes("failed")) return "#C62828";
  if (action.includes("completed") || action.includes("created") || action.includes("accepted")) return "#0A7C42";
  if (action.includes("cancelled") || action.includes("rejected") || action.includes("expired")) return "#856404";
  return "#0794B5";
}

export default function AdminAuditLog() {
  const [category, setCategory] = useState<string>("");
  const [search, setSearch] = useState("");

  const events = useQuery(api.audit.service.getRecentAuditEvents, {
    limit: 150,
    ...(category ? { category } : {}),
  });
  const stats = useQuery(api.audit.service.getAuditStats, {});

  const filtered = (events ?? []).filter((e) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      e.action.toLowerCase().includes(q) ||
      e.entityType.toLowerCase().includes(q) ||
      e.entityId.toLowerCase().includes(q) ||
      (e.actorEmail ?? "").toLowerCase().includes(q) ||
      (e.actorRole ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <AdminShell activeItem="Audit Log">
      <main className="ops-main">
        <div className="ops-admin-head">
          <h1 className="ops-admin-portal">Admin Portal</h1>
          <span className="ops-admin-section">Audit Log</span>
        </div>

        <div className="ops-stats-grid" style={{ marginBottom: 18 }}>
          <div className="ops-stat-card">
            <div className="ops-stat-icon" style={{ background: "rgba(7,148,181,0.1)", color: "#0794B5" }}>
              <Activity size={20} />
            </div>
            <div>
              <div className="ops-stat-value">{stats === undefined ? "…" : stats.totalEvents}</div>
              <div className="ops-stat-label">Events · last 24h</div>
            </div>
          </div>
          <div className="ops-stat-card">
            <div className="ops-stat-icon" style={{ background: "rgba(10,124,66,0.1)", color: "#0A7C42" }}>
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="ops-stat-value">
                {stats === undefined ? "…" : Object.keys(stats.byCategory).length}
              </div>
              <div className="ops-stat-label">Active categories</div>
            </div>
          </div>
        </div>

        <div className="ops-filter-group" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9A9A9A" }} />
            <input
              className="ops-filter-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search action, entity, actor…"
              style={{ width: "100%", padding: "9px 12px 9px 34px" }}
            />
          </div>
          <div className="ops-tabs">
            {CATEGORIES.map((c) => (
              <button
                key={c.id || "all"}
                className={`ops-tab ${category === c.id ? "active" : ""}`}
                onClick={() => setCategory(c.id)}
              >
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        {events === undefined ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Loader2 size={22} className="animate-spin" style={{ color: "#999" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><ScrollText size={24} /></div>
            <div className="empty-state-title">No audit events</div>
            <div className="empty-state-desc">Platform activity is recorded here automatically as it happens.</div>
          </div>
        ) : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Category</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Actor</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e._id}>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap", color: "#666" }}>{fmtDateTime(e.timestamp)}</td>
                    <td>
                      <span style={{ fontSize: 11.5, fontWeight: 600, textTransform: "capitalize" }}>{e.category}</span>
                    </td>
                    <td style={{ fontSize: 12.5, fontWeight: 600, color: actionColor(e.action) }}>{e.action}</td>
                    <td style={{ fontSize: 12 }}>
                      {e.entityType}
                      <span style={{ color: "#9A9A9A", marginLeft: 6, fontFamily: "monospace", fontSize: 11 }}>
                        {String(e.entityId).slice(-6)}
                      </span>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {e.actorEmail ?? (e.actorId ? `${e.actorRole} · ${String(e.actorId).slice(-6)}` : e.actorRole)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AdminShell>
  );
}
