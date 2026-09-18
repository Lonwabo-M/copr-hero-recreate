import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import AdminShell from "@/components/shells/AdminShell";
import {
  Loader2,
  CheckSquare,
  Truck,
  User,
  Phone,
  Mail,
  BadgeCheck,
  XCircle,
  Clock,
  X,
} from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/operations.css";

// ─── Driver Approvals (Admin Portal) ─────────────────────────────────────────
// The REVIEW + ACCEPT steps of the driver pipeline (Capture → Review → Accept).
// Capture happens in the Driver App (profile → driver application form); this
// page is where an admin inspects the captured details and accepts or rejects.
// Acceptance provisions the driver_profile + active vehicle that dispatch
// requires, so an approved driver immediately appears in the Operations
// Centre's Drivers tab and becomes dispatchable. The flow deliberately does
// NOT live in the Operations Centre — operations dispatch; admins hire.

type ApplicationRow = {
  _id: string;
  userId: string;
  status: "pending" | "approved" | "rejected";
  licenseClass: string;
  licenseNumber?: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear?: number;
  vehicleCapacityKg: number;
  vehicleRegistration: string;
  vehicleBreaking: boolean;
  vehicleExpress: boolean;
  vehicleFlammable: boolean;
  vehicleTrailer: boolean;
  reviewNotes?: string;
  reviewerName: string | null;
  reviewedAt?: number;
  createdAt: number;
  applicantName: string;
  applicantEmail: string | null;
  applicantPhone: string | null;
};

const STATUS_TABS = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
] as const;

function fmtDateTime(ts?: number | null): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function InfoCard({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="dash-info-card">
      <div className="dash-info-label">{label}</div>
      <div className="dash-info-value" style={muted ? { color: "#9A9A9A" } : undefined}>
        {value}
      </div>
    </div>
  );
}

function Capability({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12.5,
        fontWeight: 600,
        color: enabled ? "#0A7C42" : "#9A9A9A",
        background: enabled ? "rgba(10,124,66,0.08)" : "var(--surface-muted, #F4F4F4)",
        border: `1px solid ${enabled ? "rgba(10,124,66,0.25)" : "var(--border-light, #E8E8E8)"}`,
        borderRadius: 8,
        padding: "5px 10px",
      }}
    >
      {enabled ? <BadgeCheck size={14} /> : <XCircle size={14} />}
      {label}
    </span>
  );
}

function ApplicationCard({
  app,
  decisionPending,
  onAccept,
  onReject,
}: {
  app: ApplicationRow;
  decisionPending: boolean;
  onAccept: (id: string) => void;
  onReject: (id: string, notes: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [notes, setNotes] = useState("");

  const statusPill =
    app.status === "approved"
      ? { text: "Approved", color: "#0A7C42", bg: "rgba(10,124,66,0.1)" }
      : app.status === "rejected"
        ? { text: "Rejected", color: "#C62828", bg: "rgba(198,40,40,0.08)" }
        : { text: "Pending review", color: "#856404", bg: "rgba(133,100,4,0.1)" };

  return (
    <div className="ops-dispatch-card" style={{ maxWidth: 760 }}>
      <div className="ops-dispatch-header">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              background: "var(--primary-light, #C7EDF5)",
              color: "var(--primary-dark, #35ABC8)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <User size={18} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-primary, #202020)" }}>
              {app.applicantName}
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 2 }}>
              {app.applicantPhone && (
                <a
                  href={`tel:${app.applicantPhone}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "#0794B5", textDecoration: "none" }}
                >
                  <Phone size={12} /> {app.applicantPhone}
                </a>
              )}
              {app.applicantEmail && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "#666" }}>
                  <Mail size={12} /> {app.applicantEmail}
                </span>
              )}
            </div>
          </div>
        </div>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: statusPill.color,
            background: statusPill.bg,
            borderRadius: 999,
            padding: "4px 12px",
          }}
        >
          {statusPill.text}
        </span>
      </div>

      {/* Captured driver info */}
      <div style={{ margin: "12px 0 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9A9A9A" }}>
        Captured Driver Details
      </div>
      <div className="dash-info-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <InfoCard label="License Class" value={app.licenseClass} />
        <InfoCard label="License Number" value={app.licenseNumber ?? "—"} muted />
      </div>

      {/* Captured vehicle info */}
      <div style={{ margin: "12px 0 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9A9A9A", display: "inline-flex", alignItems: "center", gap: 6 }}>
        <Truck size={13} /> Vehicle
      </div>
      <div className="dash-info-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
        <InfoCard label="Make" value={app.vehicleMake} />
        <InfoCard label="Model" value={app.vehicleModel} />
        <InfoCard label="Year" value={app.vehicleYear != null ? String(app.vehicleYear) : "—"} muted />
        <InfoCard label="Capacity" value={`${app.vehicleCapacityKg.toLocaleString("en-ZA")} kg`} />
        <InfoCard label="License Plate" value={app.vehicleRegistration} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <Capability label="Breaking / fragile" enabled={app.vehicleBreaking} />
        <Capability label="Express" enabled={app.vehicleExpress} />
        <Capability label="Flammable" enabled={app.vehicleFlammable} />
        <Capability label="Trailer" enabled={app.vehicleTrailer} />
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: "#9A9A9A" }}>
        Submitted {fmtDateTime(app.createdAt)}
        {app.status !== "pending" && (
          <>
            {" · "}Reviewed by {app.reviewerName ?? "admin"} on {fmtDateTime(app.reviewedAt)}
          </>
        )}
        {app.reviewNotes && <> · Notes: {app.reviewNotes}</>}
      </div>

      {/* Decision actions — pending only */}
      {app.status === "pending" && (
        <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
          <button
            className="lasha-btn-primary"
            style={{ height: 40, padding: "0 18px", display: "inline-flex", alignItems: "center", gap: 8, border: "none", cursor: "pointer" }}
            disabled={decisionPending}
            onClick={() => onAccept(app._id)}
          >
            {decisionPending ? <Loader2 size={15} className="animate-spin" /> : <CheckSquare size={15} />}
            Accept driver
          </button>
          {!rejecting ? (
            <button
              style={{
                height: 40,
                padding: "0 16px",
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                background: "none",
                border: "1px solid var(--border, #DEDEDE)",
                borderRadius: 10,
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                fontWeight: 600,
                color: "#C62828",
                cursor: "pointer",
              }}
              onClick={() => setRejecting(true)}
            >
              <XCircle size={15} />
              Reject
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8, flex: 1, minWidth: 260 }}>
              <input
                className="dash-search"
                style={{ height: 40, paddingLeft: 12 }}
                placeholder="Reason for rejection (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <button
                style={{
                  height: 40,
                  padding: "0 14px",
                  background: "#C62828",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  fontFamily: "Inter, sans-serif",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 6,
                }}
                onClick={() => {
                  onReject(app._id, notes);
                  setRejecting(false);
                }}
              >
                <X size={14} /> Confirm
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DriverApprovals() {
  const [statusTab, setStatusTab] = useState<"pending" | "approved" | "rejected">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const applications = useQuery(api.users.driverApplications.getApplicationsForReview, {
    status: statusTab,
  });

  const acceptApplication = useMutation(api.users.driverApplications.acceptDriverApplication);
  const rejectApplication = useMutation(api.users.driverApplications.rejectDriverApplication);

  const handleAccept = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await acceptApplication({ applicationId: id as any });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not accept the application");
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (id: string, notes: string) => {
    setBusyId(id);
    setError(null);
    try {
      await rejectApplication({ applicationId: id as any, notes: notes || undefined });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reject the application");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminShell activeItem="Driver Approvals">
      <main className="ops-main">
        <div className="ops-admin-head">
          <h1 className="ops-admin-portal">Admin Portal</h1>
          <span className="ops-admin-section">Driver Approvals</span>
        </div>

        {/* Pipeline: Capture → Review → Accept */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
            marginBottom: 18,
            fontSize: 12.5,
            color: "#666",
          }}
        >
          <span style={{ fontWeight: 600, color: "#202020" }}>1. Capture</span>
          <span style={{ color: "#9A9A9A" }}>driver submits in the Driver App</span>
          <span style={{ color: "#C7EDF5" }}>→</span>
          <span style={{ fontWeight: 600, color: "#202020" }}>2. Review</span>
          <span style={{ color: "#9A9A9A" }}>you are here</span>
          <span style={{ color: "#C7EDF5" }}>→</span>
          <span style={{ fontWeight: 600, color: "#202020" }}>3. Accept</span>
          <span style={{ color: "#9A9A9A" }}>driver becomes dispatchable</span>
        </div>

        <div className="ops-tabs" style={{ marginBottom: 18 }}>
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              className={`ops-tab ${statusTab === tab.id ? "active" : ""}`}
              onClick={() => setStatusTab(tab.id)}
            >
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {error && (
          <div style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: "#C62828" }}>
            {error}
          </div>
        )}

        {applications === undefined ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Loader2 size={22} className="animate-spin" style={{ color: "#999" }} />
          </div>
        ) : applications.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Clock size={24} /></div>
            <div className="empty-state-title">
              No {statusTab} applications
            </div>
            <div className="empty-state-desc">
              {statusTab === "pending"
                ? "Driver applications submitted in the Driver App appear here for review."
                : `No ${statusTab} applications yet.`}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {applications.map((app) => (
              <ApplicationCard
                key={app._id}
                app={app as ApplicationRow}
                decisionPending={busyId === app._id}
                onAccept={handleAccept}
                onReject={handleReject}
              />
            ))}
          </div>
        )}
      </main>
    </AdminShell>
  );
}
