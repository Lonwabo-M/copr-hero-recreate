import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { api } from "@/convex/_generated/api";
import DriverShell from "@/components/shells/DriverShell";
import {
  Loader2,
  Package,
  CheckCircle2,
  XCircle,
  Ban,
  ChevronRight,
  Calendar,
} from "lucide-react";
import { DELIVERY_STATUS } from "@/convex/schema";
import "@/styles/driver.css";

// ─── Driver History ──────────────────────────────────────────────────────────
// Historical (terminal-status) deliveries for the authenticated driver, served
// by `deliveries.state_machine.getMyDeliveryHistory` — a driver-scoped query
// that resolves identity server-side and applies status/date filters and
// cursor pagination in Convex. No client-side filtering of a global list.
//
// All displayed fields exist in the backend. No earnings/fees/distances are
// shown (not part of this task's data model).

const PAGE_SIZE = 20;

const STATUS_FILTERS = [
  { value: "", label: "All" },
  { value: DELIVERY_STATUS.DELIVERED, label: "Delivered" },
  { value: DELIVERY_STATUS.FAILED, label: "Failed" },
  { value: DELIVERY_STATUS.CANCELLED, label: "Cancelled" },
] as const;

const DATE_FILTERS = [
  { value: "", label: "Any time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
] as const;

function StatusBadge({ status }: { status: string }) {
  const icon =
    status === DELIVERY_STATUS.DELIVERED ? (
      <CheckCircle2 size={12} />
    ) : status === DELIVERY_STATUS.FAILED ? (
      <XCircle size={12} />
    ) : (
      <Ban size={12} />
    );
  const tone =
    status === DELIVERY_STATUS.DELIVERED
      ? "delivered"
      : status === DELIVERY_STATUS.FAILED
        ? "failed"
        : "cancelled";
  return (
    <span className={`driver-history-status ${tone}`}>
      {icon}
      {status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ")}
    </span>
  );
}

export default function DriverHistory() {
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState("");
  const [daysFilter, setDaysFilter] = useState("");
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([]);

  // Server-side date window from the day filter (existing timestamps only).
  const { from, to } = useMemo(() => {
    if (!daysFilter) return { from: undefined, to: undefined };
    const days = parseInt(daysFilter, 10);
    return {
      from: Date.now() - days * 24 * 60 * 60 * 1000,
      to: undefined,
    };
  }, [daysFilter]);

  const history = useQuery(
    api.deliveries.state_machine.getMyDeliveryHistory,
    {
      status: (statusFilter || undefined) as any,
      from,
      to,
      limit: PAGE_SIZE,
      cursor: cursorStack.length > 0 ? (cursorStack[cursorStack.length - 1] as any) : undefined,
    }
  );

  const items = history?.items ?? [];

  const changeFilter = (setter: (v: string) => void) => (v: string) => {
    setter(v);
    setCursorStack([]); // filters reset pagination
  };

  return (
    <DriverShell activeItem="Delivery History">
      <main className="driver-main dash-workspace">
        <div className="driver-container">
          <div className="driver-header">
            <div>
              <h1 className="driver-title">Delivery History</h1>
              <p className="driver-subtitle">
                Your completed, failed and cancelled deliveries
              </p>
            </div>
          </div>

          {/* Filters (server-side) */}
          <div className="driver-history-filters">
            <div className="driver-history-filter-group">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  className={`driver-history-filter ${statusFilter === f.value ? "active" : ""}`}
                  onClick={() => changeFilter(setStatusFilter)(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="driver-history-filter-group">
              {DATE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  className={`driver-history-filter ${daysFilter === f.value ? "active" : ""}`}
                  onClick={() => changeFilter(setDaysFilter)(f.value)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Loading */}
          {history === undefined ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: "#999" }} />
            </div>
          ) : /* Empty states */
          items.length === 0 && cursorStack.length === 0 ? (
            <div className="driver-panel">
              <Package size={24} style={{ color: "#999", margin: "0 auto" }} />
              <div className="driver-panel-title">
                {statusFilter || daysFilter ? "No matching deliveries" : "No delivery history yet"}
              </div>
              <div className="driver-panel-desc">
                {statusFilter || daysFilter
                  ? "No deliveries match the selected filters. Try widening them."
                  : "Your completed deliveries will appear here after you finish assignments."}
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="driver-panel">
              <Package size={24} style={{ color: "#999", margin: "0 auto" }} />
              <div className="driver-panel-title">End of history</div>
              <div className="driver-panel-desc">No further deliveries on this page.</div>
            </div>
          ) : (
            <>
              {/* History list */}
              <div className="driver-history-list">
                {items.map((d) => (
                  <button
                    key={d._id}
                    className="driver-history-item"
                    onClick={() => navigate(`/driver/history/${d._id}`)}
                  >
                    <div className="driver-history-main">
                      <div className="driver-history-route">
                        {d.pickupCity ?? "Unknown"} → {d.dropoffCity ?? "Unknown"}
                      </div>
                      <div className="driver-history-meta">
                        <span className="driver-tracking-code">{d.trackingNumber}</span>
                        <StatusBadge status={d.status} />
                      </div>
                    </div>
                    <div className="driver-history-right">
                      <div className="driver-history-date">
                        <Calendar size={11} />
                        {d.completedAt
                          ? new Date(d.completedAt).toLocaleDateString("en-ZA", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })
                          : d.assignedAt
                            ? new Date(d.assignedAt).toLocaleDateString("en-ZA", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })
                            : "—"}
                      </div>
                      <ChevronRight size={16} style={{ color: "var(--text-muted)" }} />
                    </div>
                  </button>
                ))}
              </div>

              {/* Pagination (server-side cursor) */}
              {(history?.nextCursor || cursorStack.length > 0) && (
                <div className="driver-action-row" style={{ marginTop: 4 }}>
                  <button
                    className="driver-secondary-btn"
                    style={{ color: "var(--text-primary)", borderColor: "var(--border)" }}
                    disabled={cursorStack.length === 0}
                    onClick={() =>
                      setCursorStack((s) => s.slice(0, -1))
                    }
                  >
                    Previous
                  </button>
                  <button
                    className="driver-secondary-btn"
                    style={{ color: "var(--text-primary)", borderColor: "var(--border)" }}
                    disabled={!history?.nextCursor}
                    onClick={() =>
                      setCursorStack((s) => [
                        ...s,
                        (history?.nextCursor ?? null) as string | null,
                      ])
                    }
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </DriverShell>
  );
}
