import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import AdminShell from "@/components/shells/AdminShell";
import { Loader2, Activity, Truck, WifiOff, ShieldAlert, CheckCircle2, XCircle } from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/operations.css";

// ─── Platform Health (Admin Portal) ──────────────────────────────────────────
// Operational telemetry for the whole platform, aggregated by the metrics
// service over the trailing 24 hours: delivery outcomes, dispatch throughput,
// notification/payment/routing failures and auth anomalies. This is the
// admin's "is anything on fire" view — the Operations Centre stays focused on
// live dispatch.

type MetricBucket = { value: number; samples: number; avg?: number };

function fmtMetric(name: string): string {
  const labels: Record<string, string> = {
    "delivery.completed": "Deliveries completed",
    "delivery.cancelled": "Deliveries cancelled",
    "delivery.failed": "Deliveries failed",
    "dispatch.completed": "Dispatches completed",
    "dispatch.latency": "Dispatch latency (avg)",
    "notification.sent": "Notifications sent",
    "notification.failed": "Notification failures",
    "routing.failed": "Routing failures",
    "payment.failed": "Payment failures",
    "auth.login_failed": "Failed logins",
    "offline.sync_conflict": "Offline sync conflicts",
  };
  return labels[name] ?? name;
}

export default function AdminPlatformHealth() {
  const metrics = useQuery(api.metrics.service.getDashboardMetrics, {});
  // Ops workload analytics — the "what would automation be worth" panel,
  // derived from real audit/tracking/delivery records (never estimates).
  const workload = useQuery(api.admin.workload.getOpsWorkload, {});

  if (metrics === undefined) {
    return (
      <AdminShell activeItem="Platform Health">
        <main className="ops-main">
          <div className="ops-admin-head">
            <h1 className="ops-admin-portal">Admin Portal</h1>
            <span className="ops-admin-section">Platform Health</span>
          </div>
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Loader2 size={22} className="animate-spin" style={{ color: "#999" }} />
          </div>
        </main>
      </AdminShell>
    );
  }

  const get = (name: string): MetricBucket => (metrics as Record<string, MetricBucket>)[name] ?? { value: 0, samples: 0 };
  const completed = get("delivery.completed");
  const cancelled = get("delivery.cancelled");
  const failed = get("delivery.failed");
  const dispatchLatency = get("dispatch.latency");
  const paymentFailed = get("payment.failed");
  const authFailures = get("auth.login_failed");
  const offlineConflicts = get("offline.sync_conflict");

  const totalOutcomes = completed.value + cancelled.value + failed.value;
  const successRate = totalOutcomes > 0 ? (completed.value / totalOutcomes) * 100 : null;

  const groups: Array<{
    title: string;
    icon: React.ReactNode;
    color: string;
    bg: string;
    rows: Array<{ label: string; value: string; warn?: boolean }>;
  }> = [
    {
      title: "Deliveries (24h)",
      icon: <Truck size={16} />,
      color: "#0A7C42",
      bg: "rgba(10,124,66,0.1)",
      rows: [
        { label: "Completed", value: String(completed.value) },
        { label: "Cancelled", value: String(cancelled.value) },
        { label: "Failed", value: String(failed.value), warn: failed.value > 0 },
        { label: "Success rate", value: successRate == null ? "—" : `${successRate.toFixed(1)}%` },
      ],
    },
    {
      title: "Dispatch (24h)",
      icon: <Activity size={16} />,
      color: "#0794B5",
      bg: "rgba(7,148,181,0.1)",
      rows: [
        { label: "Dispatches completed", value: String(get("dispatch.completed").value) },
        {
          label: "Avg latency",
          value: dispatchLatency.samples > 0 ? `${(dispatchLatency.avg ?? 0).toFixed(0)} ms` : "—",
          warn: dispatchLatency.samples > 0 && (dispatchLatency.avg ?? 0) > 5_000,
        },
      ],
    },
    {
      title: "Reliability (24h)",
      icon: <WifiOff size={16} />,
      color: "#856404",
      bg: "rgba(133,100,4,0.1)",
      rows: [
        { label: "Notification failures", value: String(get("notification.failed").value), warn: get("notification.failed").value > 0 },
        { label: "Routing failures", value: String(get("routing.failed").value), warn: get("routing.failed").value > 0 },
        { label: "Payment failures", value: String(paymentFailed.value), warn: paymentFailed.value > 0 },
        { label: "Offline sync conflicts", value: String(offlineConflicts.value), warn: offlineConflicts.value > 0 },
      ],
    },
    {
      title: "Access (24h)",
      icon: <ShieldAlert size={16} />,
      color: "#C62828",
      bg: "rgba(198,40,40,0.1)",
      rows: [
        { label: "Failed logins", value: String(authFailures.value), warn: authFailures.value > 10 },
      ],
    },
  ];

  return (
    <AdminShell activeItem="Platform Health">
      <main className="ops-main">
        <div className="ops-admin-head">
          <h1 className="ops-admin-portal">Admin Portal</h1>
          <span className="ops-admin-section">Platform Health</span>
        </div>

        {/* Headline outcomes */}
        <div className="ops-stats-grid" style={{ marginBottom: 18 }}>
          <div className="ops-stat-card">
            <div className="ops-stat-icon" style={{ background: "rgba(10,124,66,0.1)", color: "#0A7C42" }}>
              <CheckCircle2 size={20} />
            </div>
            <div>
              <div className="ops-stat-value">{completed.value}</div>
              <div className="ops-stat-label">Completed · 24h</div>
            </div>
          </div>
          <div className="ops-stat-card">
            <div className="ops-stat-icon" style={{ background: successRate != null && successRate < 90 ? "rgba(198,40,40,0.1)" : "rgba(7,148,181,0.1)", color: successRate != null && successRate < 90 ? "#C62828" : "#0794B5" }}>
              <Activity size={20} />
            </div>
            <div>
              <div className="ops-stat-value">{successRate == null ? "—" : `${successRate.toFixed(0)}%`}</div>
              <div className="ops-stat-label">Success rate</div>
            </div>
          </div>
          <div className="ops-stat-card">
            <div className="ops-stat-icon" style={{ background: "rgba(198,40,40,0.1)", color: "#C62828" }}>
              <XCircle size={20} />
            </div>
            <div>
              <div className="ops-stat-value">{failed.value + cancelled.value}</div>
              <div className="ops-stat-label">Failed + cancelled</div>
            </div>
          </div>
        </div>

        {/* Metric groups */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
          {groups.map((g) => (
            <div key={g.title} className="ops-stat-card" style={{ padding: 18, cursor: "default" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span className="ops-stat-icon" style={{ width: 30, height: 30, background: g.bg, color: g.color }}>
                  {g.icon}
                </span>
                <strong style={{ fontSize: 13.5 }}>{g.title}</strong>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {g.rows.map((r) => (
                  <div key={r.label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span style={{ color: "#666" }}>{r.label}</span>
                    <span style={{ fontWeight: 600, color: r.warn ? "#C62828" : "#202020" }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Ops workload / automation-coverage panel — real tracked numbers,
            derived from the audit + tracking + delivery records. This is the
            evidence base for automation decisions (what absorbs manual work,
            what the exception rate actually is). */}
        <div className="ops-stat-card" style={{ padding: 18, marginTop: 14, cursor: "default" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span className="ops-stat-icon" style={{ width: 30, height: 30, background: "rgba(10,124,66,0.1)", color: "#0A7C42" }}>
              <Activity size={16} />
            </span>
            <strong style={{ fontSize: 13.5 }}>
              Ops workload · automation coverage{workload ? ` (${workload.windowDays}d)` : ""}
            </strong>
          </div>
          {workload === undefined ? (
            <Loader2 size={16} className="animate-spin" style={{ color: "#999" }} />
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
              {[
                { label: "Deliveries in window", value: String(workload.totals.deliveries) },
                { label: "Automated transitions", value: String(workload.automatedTransitions) },
                { label: "Manual dispatch actions", value: String(workload.manualDispatchActions) },
                { label: "Exception rate", value: `${workload.totals.exceptionRatePct}%` },
                { label: "Driver approvals", value: String(workload.driverApprovals) },
              ].map((r) => (
                <div key={r.label} style={{ border: "1px solid var(--border-light)", borderRadius: 10, padding: "10px 12px" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>{r.value}</div>
                  <div style={{ fontSize: 11.5, color: "#666", marginTop: 2 }}>{r.label}</div>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, color: "#999", marginTop: 10 }}>{workload?.basis ?? ""}</div>
        </div>
      </main>
    </AdminShell>
  );
}
