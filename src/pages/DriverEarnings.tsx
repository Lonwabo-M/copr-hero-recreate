import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { useNavigate } from "react-router";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import DriverShell from "@/components/shells/DriverShell";
import {
  Loader2,
  Wallet,
  CheckCircle2,
  Clock,
  ArrowRight,
  Banknote,
  TrendingUp,
} from "lucide-react";
import { DELIVERY_STATUS } from "@/convex/schema";
import "@/styles/driver.css";

// Explicit shape for the driver earnings page item (mirrors
// driver_earnings.getDriverEarnings EarningRow). We declare it locally so the
// React component type is stable even when the generated API types shift.
interface EarningItemShape {
  settlementId: string;
  deliveryId: string;
  orderId: string;
  trackingNumber: string | null;
  deliveryStatus: string | null;
  createdAt: number;
  settlementStatus: string;
  settlementDriverEarnings: number;
  quoteDriverEarnings: number | null;
  quoteTotalCharge: number | null;
  payoutEligible: boolean;
  payoutReason: string;
  payoutEligibleLabel: string;
  customerPaid: boolean;
  settlementCompleted: boolean;
}

// ─── Driver Earnings ──────────────────────────────────────────────────────────
// Read-only earnings view for the authenticated driver, powered by
// `driver_earnings.getDriverEarnings` (driver-scoped, server-authorized) and
// `driver_earnings.getSettlementDriverEligibility` for per-settlement payout
// eligibility.
//
// Amounts come from stored settlement.driverEarnings enriched with the stored
// quote. We never recalculate pricing or platform fees in React.
//
// Presentation semantics (see docs/driver-earnings.md):
//   pending      → "Payable"
//   processing   → "Processing"
//   completed    → "Settlement completed" (NOT "Paid" — no external payout yet)
//   failed/disputed → shown with reason
//
// "Paid out" is always stated as "No external payouts recorded" because no
// external payout integration exists. Internal wallet credit (from
// completeSettlement) is an internal payable balance, not a bank payout.

const PAGE_SIZE = 20;

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatDate(ts?: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(ts?: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SettlementBadge({
  label,
  tone,
}: {
  label: string;
  tone: "payable" | "processing" | "completed" | "failed" | "disputed" | "eligible" | "not-yet" | "not-payable" | "already-settled" | "not-available";
}) {
  return (
    <span
      className={`driver-history-status ${tone}`}
      style={{ fontSize: 11, padding: "2px 8px", borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      {label}
    </span>
  );
}

const TONE_MAP: Record<string, string> = {
  Payable: "payable",
  Processing: "processing",
  "Settlement completed": "completed",
  Failed: "failed",
  Disputed: "disputed",
  Eligible: "eligible",
  "Not yet eligible": "not-yet",
  "Not payable": "not-payable",
  "Already settled": "already-settled",
  "Not available": "not-available",
};

export default function DriverEarnings() {
  const navigate = useNavigate();
  const [cursorStack, setCursorStack] = useState<(string | null)[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [daysFilter, setDaysFilter] = useState("");

  const { from, to } = useMemo(() => {
    if (!daysFilter) return { from: undefined, to: undefined };
    const days = parseInt(daysFilter, 10);
    return {
      from: Date.now() - days * 24 * 60 * 60 * 1000,
      to: undefined,
    };
  }, [daysFilter]);

  // Page query.
  const earnings = useQuery(
    api.driver_earnings.getDriverEarnings,
    {
      status: statusFilter === "all" ? undefined : (statusFilter as any),
      limit: PAGE_SIZE,
      cursor:
        cursorStack.length > 0
          ? (cursorStack[cursorStack.length - 1] as any)
          : undefined,
    },
  );

  // Per-settlement eligibility for items on the current page (batch is fine;
  // each is a small driver-scoped query). We load these reactively so the UI
  // reflects backend eligibility changes.


  // Summary (always loaded separately so the header is stable).
  const summary = useQuery(api.driver_earnings.getDriverEarningsSummary, {
    status: statusFilter === "all" ? undefined : (statusFilter as any),
  });

  const items = earnings?.items ?? [];
  const eligibleTotal = earnings?.summary?.eligibleForPayout ?? 0;
  const loading = earnings === undefined || summary === undefined;

  const toneFor = (label: string): "payable" | "processing" | "completed" | "failed" | "disputed" | "eligible" | "not-yet" | "not-payable" | "already-settled" | "not-available" => {
    return (TONE_MAP[label] as any) ?? "not-available";
  };

  return (
    <DriverShell activeItem="Earnings">
      <main className="driver-main dash-workspace">
        <div className="driver-container">
          {/* Header */}
          <div className="driver-header">
            <div>
              <h1 className="driver-title">Earnings</h1>
              <p className="driver-subtitle">
                Your delivery earnings, payable amounts and payout eligibility
              </p>
            </div>
          </div>

          {/* Summary band */}
          {loading ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                padding: 60,
              }}
            >
              <Loader2
                size={24}
                className="animate-spin"
                style={{ color: "#999" }}
              />
            </div>
          ) : (
            <div className="driver-panel" style={{ marginBottom: 16 }}>
              <div
                className="driver-panel-row"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 12,
                  justifyContent: "space-between",
                }}
              >
                <SummaryChip
                  label="Total earned"
                  value={formatCurrency(summary?.earnedFromCompleted ?? 0)}
                  sub={`${summary?.completedCount ?? 0} completed deliveries`}
                  icon={<TrendingUp size={14} />}
                />
                <SummaryChip
                  label="Payable"
                  value={formatCurrency(summary?.pendingPayable ?? 0)}
              sub={`${summary?.payableCount ?? 0} pending settlements`}
              icon={<Wallet size={14} />}
            />
            <SummaryChip
              label="Eligible for payout"
              value={formatCurrency(eligibleTotal)}
              sub="Awaiting customer payment clearance"
              icon={<CheckCircle2 size={14} />}
            />
                <SummaryChip
                  label="Paid out"
                  value={formatCurrency(summary?.paidOut ?? 0)}
                  sub={summary?.paidOutNote ?? "No external payouts recorded"}
                  icon={<Banknote size={14} />}
                  muted
                />
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="driver-history-filters">
            <div className="driver-history-filter-group">
              {[
                { value: "all", label: "All" },
                { value: "payable", label: "Payable" },
                { value: "completed", label: "Settled" },
                { value: "failed", label: "Not payable" },
              ].map((f) => (
                <button
                  key={f.value}
                  className={`driver-history-filter ${
                    statusFilter === f.value ? "active" : ""
                  }`}
                  onClick={() => {
                    setStatusFilter(f.value);
                    setCursorStack([]);
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="driver-history-filter-group">
              {[
                { value: "", label: "Any time" },
                { value: "7", label: "Last 7 days" },
                { value: "30", label: "Last 30 days" },
                { value: "90", label: "Last 90 days" },
              ].map((f) => (
                <button
                  key={f.value}
                  className={`driver-history-filter ${
                    daysFilter === f.value ? "active" : ""
                  }`}
                  onClick={() => {
                    setDaysFilter(f.value);
                    setCursorStack([]);
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Earnings list */}
          {earnings === undefined ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                padding: 60,
              }}
            >
              <Loader2
                size={24}
                className="animate-spin"
                style={{ color: "#999" }}
              />
            </div>
          ) : items.length === 0 && cursorStack.length === 0 ? (
            <div className="driver-panel">
              <Wallet
                size={24}
                style={{ color: "#999", margin: "0 auto" }}
              />
              <div className="driver-panel-title">
                {statusFilter !== "all" || daysFilter
                  ? "No matching earnings"
                  : summary?.completedCount === 0
                    ? "No earnings yet"
                    : "No payable earnings right now"}
              </div>
              <div className="driver-panel-desc">
                {summary?.completedCount === 0 ? (
                  <>
                    Your earnings from completed deliveries will appear here
                    after you finish assignments.
                  </>
                ) : statusFilter !== "all" || daysFilter ? (
                  <>
                    No earnings match the selected filters. Try widening them.
                  </>
                ) : summary?.payableCount === 0 ? (
                  <>
                    You have no payable settlements at the moment. Completed
                    deliveries may show as "Settlement completed" if the
                    customer payment was confirmed.
                  </>
                ) : (
                  <>No earnings match the selected filters.</>
                )}
              </div>
            </div>
          ) : items.length === 0 ? (
            <div className="driver-panel">
              <Wallet
                size={24}
                style={{ color: "#999", margin: "0 auto" }}
              />
              <div className="driver-panel-title">End of earnings</div>
              <div className="driver-panel-desc">
                You have reached the end of the current view.
              </div>
            </div>
          ) : (
            <>
              <div className="driver-history-list">
                {items.map((item) => (
                  <EarningsItem
                    key={item.settlementId}
                    item={item}
                    navigate={navigate}
                    toneFor={toneFor}
                  />
                ))}
              </div>

              {/* Pagination (server-side cursor) */}
              {(earnings?.nextCursor || cursorStack.length > 0) && (
                <div
                  className="driver-action-row"
                  style={{ marginTop: 4 }}
                >
                  <button
                    className="driver-secondary-btn"
                    style={{
                      color: "var(--text-primary)",
                      borderColor: "var(--border)",
                    }}
                    disabled={cursorStack.length === 0}
                    onClick={() =>
                      setCursorStack((s) => s.slice(0, -1))
                    }
                  >
                    Previous
                  </button>
                  <button
                    className="driver-secondary-btn"
                    style={{
                      color: "var(--text-primary)",
                      borderColor: "var(--border)",
                    }}
                    disabled={!earnings?.nextCursor}
                    onClick={() =>
                      setCursorStack((s) => [
                        ...s,
                        (earnings?.nextCursor ?? null) as string | null,
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

function SummaryChip({
  label,
  value,
  sub,
  icon,
  muted,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className="driver-panel-chip"
      style={{
        background: muted ? "var(--border)" : "var(--surface-2)",
        borderColor: muted ? "var(--border)" : "transparent",
        color: muted ? "var(--text-muted)" : "var(--text-primary)",
        padding: "10px 14px",
        borderRadius: 10,
        flex: "1 1 180px",
        minWidth: 140,
        border: muted ? "1px solid" : "1px solid transparent",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: muted ? "var(--text-muted)" : "var(--text-secondary)",
          fontSize: 12,
          marginBottom: 4,
        }}
      >
        {icon}
        {label}
      </div>
      <div
        style={{
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 11,
          color: muted ? "var(--text-muted)" : "var(--text-muted)",
          marginTop: 2,
        }}
      >
        {sub}
      </div>
    </div>
  );
}

function EarningsItem({
  item,
  navigate,
  toneFor,
}: {
  item: EarningItemShape;
  navigate: (to: string) => void;
  toneFor: (label: string) => string;
}) {
  const delivery = item.deliveryStatus;
  const isTerminal =
    delivery === DELIVERY_STATUS.DELIVERED ||
    delivery === DELIVERY_STATUS.FAILED ||
    delivery === DELIVERY_STATUS.CANCELLED;

  return (
    <button
      className="driver-history-item"
      onClick={() =>
        navigate(`/driver/history/${item.deliveryId}`)
      }
    >
      {/* Left: route + reference */}
      <div className="driver-history-main">
        <div className="driver-history-route">
          {item.trackingNumber
            ? `Delivery ${item.trackingNumber}`
            : "Delivery"}
          {item.trackingNumber && (
            <span
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                marginLeft: 8,
              }}
            >
              {item.deliveryStatus
                ? item.deliveryStatus
                    .replace(/_/g, " ")
                    .toLowerCase()
                : "unknown"}
            </span>
          )}
        </div>
        <div className="driver-history-meta">
          <span className="driver-tracking-code">
            {formatCurrency(item.settlementDriverEarnings)}
          </span>
          <SettlementBadge
            label={item.payoutEligibleLabel}
            tone={toneFor(item.payoutEligibleLabel) as any}
          />
        </div>
      </div>

      {/* Right: date + eligibility */}
      <div className="driver-history-right">
        <div className="driver-history-date">
          <Clock size={11} />
          {formatDate(item.createdAt)}
        </div>
        {item.payoutEligible && (
          <span
            style={{
              fontSize: 10,
              color: "var(--success)",
              marginTop: 2,
              display: "block",
            }}
          >
            Eligible
          </span>
        )}
        {!item.payoutEligible && item.settlementStatus !== "completed" && (
          <span
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              marginTop: 2,
              display: "block",
            }}
          >
            {item.payoutReason}
          </span>
        )}
        {item.settlementStatus === "completed" && (
          <span
            style={{
              fontSize: 10,
              color: "var(--text-muted)",
              marginTop: 2,
              display: "block",
            }}
          >
            Settlement completed
          </span>
        )}
        <ArrowRight
          size={16}
          style={{ color: "var(--text-muted)" }}
        />
      </div>
    </button>
  );
}
