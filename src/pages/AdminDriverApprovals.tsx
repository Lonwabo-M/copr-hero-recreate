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
  FileCheck,
  AlertTriangle,
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

type Verification = {
  idDocumentChecked: boolean;
  licenseChecked: boolean;
  vehicleRegistrationChecked: boolean;
  sanctionsScreened: boolean;
  pepScreened: boolean;
  adverseMediaScreened: boolean;
};

type ApplicationRow = {
  _id: string;
  userId: string;
  status: "pending" | "approved" | "rejected";
  // Captured driver identity. Optional because applications submitted before
  // identity capture existed have no values on file — the review card must fall
  // back to the account details rather than render "undefined".
  firstName?: string;
  surname?: string;
  idNumber?: string;
  cellNumber?: string;
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
  // KYC documents (signed URLs resolved server-side from storage ids).
  idDocumentUrl: string | null;
  licenseDocumentUrl: string | null;
  // Recorded enhanced due diligence, present once a reviewer has decided.
  verification?: {
    idDocumentChecked: boolean;
    licenseChecked: boolean;
    vehicleRegistrationChecked: boolean;
    sanctionsScreened: boolean;
    pepScreened: boolean;
    adverseMediaScreened: boolean;
  };
  verificationNotes?: string;
  verifiedAt?: number;
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
  onAccept: (id: string, verification: Verification, notes: string) => void;
  onReject: (id: string, notes: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [notes, setNotes] = useState("");
  // Enhanced due diligence: every box must be ticked and the screening result
  // written down before the Accept button unlocks. The server enforces the
  // same rule, so this is only fast feedback.
  const [checks, setChecks] = useState<Verification>({
    idDocumentChecked: false,
    licenseChecked: false,
    vehicleRegistrationChecked: false,
    sanctionsScreened: false,
    pepScreened: false,
    adverseMediaScreened: false,
  });
  const [verificationNotes, setVerificationNotes] = useState("");

  const documentsPresent = Boolean(app.idDocumentUrl && app.licenseDocumentUrl);
  const allChecked = Object.values(checks).every(Boolean);
  const canApprove =
    documentsPresent && allChecked && verificationNotes.trim().length >= 10;

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
        <InfoCard
          label="Full Name"
          value={
            [app.firstName, app.surname].filter(Boolean).join(" ") ||
            app.applicantName ||
            "—"
          }
        />
        <InfoCard
          label="ID Number"
          value={app.idNumber ?? "Not provided"}
          muted={!app.idNumber}
        />
        <InfoCard
          label="Cell Number"
          value={app.cellNumber ?? app.applicantPhone ?? "Not provided"}
          muted={!app.cellNumber}
        />
        <InfoCard label="License Class" value={app.licenseClass} />
        <InfoCard label="License Number" value={app.licenseNumber ?? "—"} muted />
      </div>

      {/* KYC documents */}
      <div style={{ margin: "12px 0 8px", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#9A9A9A" }}>
        Identity documents
      </div>
      {documentsPresent ? (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <a
            href={app.idDocumentUrl ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="ops-btn ops-btn-secondary"
            style={{ fontSize: 12, padding: "7px 12px", textDecoration: "none" }}
          >
            <FileCheck size={14} /> Identity document
          </a>
          <a
            href={app.licenseDocumentUrl ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            className="ops-btn ops-btn-secondary"
            style={{ fontSize: 12, padding: "7px 12px", textDecoration: "none" }}
          >
            <FileCheck size={14} /> Driving licence
          </a>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            gap: 9,
            alignItems: "flex-start",
            padding: "10px 12px",
            borderRadius: 10,
            background: "rgba(198,40,40,0.06)",
            border: "1px solid rgba(198,40,40,0.25)",
            fontSize: 12.5,
            color: "#8a2020",
          }}
        >
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            No KYC documents on file. This application cannot be approved — ask the driver to
            resubmit with a copy of their identity document and driving licence.
          </span>
        </div>
      )}

      {/* Recorded screening (once a decision exists) */}
      {app.verification ? (
        <div style={{ marginTop: 14, fontSize: 12.5, color: "#444", lineHeight: 1.6 }}>
          <strong>Due diligence recorded:</strong>{" "}
          {Object.values(app.verification).filter(Boolean).length}/6 checks · ID document, licence
          and vehicle registration checked; sanctions, PEP and adverse-media screening run.
          {app.verificationNotes ? (
            <span style={{ display: "block", color: "#666" }}>{app.verificationNotes}</span>
          ) : null}
        </div>
      ) : null}

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

      {/* Enhanced due diligence — pending only */}
      {app.status === "pending" && (
        <div
          style={{
            marginTop: 16,
            padding: "14px 16px",
            borderRadius: 12,
            border: "1px solid var(--border-light, #E8E8E8)",
            background: "#fbfaf6",
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "#202020", marginBottom: 4 }}>
            Enhanced due diligence
          </div>
          <p style={{ fontSize: 12, color: "#666", margin: "0 0 10px", lineHeight: 1.55 }}>
            Check each item against the documents and an independent screening source. Approval
            is refused until every check is recorded.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {(
              [
                ["idDocumentChecked", "ID document matches the captured identity"],
                ["licenseChecked", "Driving licence is valid for this vehicle class"],
                ["vehicleRegistrationChecked", "Licence disc and plate match the vehicle"],
                ["sanctionsScreened", "Sanctions / watchlist screening — no match"],
                ["pepScreened", "PEP screening — no match"],
                ["adverseMediaScreened", "Adverse media check — nothing material"],
              ] as [keyof Verification, string][]
            ).map(([key, label]) => (
              <label
                key={key}
                style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5, color: "#333", cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  checked={checks[key]}
                  onChange={(e) => setChecks((prev) => ({ ...prev, [key]: e.target.checked }))}
                  style={{ marginTop: 2, accentColor: "#0794B5", width: 15, height: 15 }}
                />
                {label}
              </label>
            ))}
          </div>
          <input
            className="dash-search"
            style={{ height: 38, paddingLeft: 12, width: "100%", marginTop: 10 }}
            placeholder="Screening result and source (required, e.g. 'ID + licence verified 29 Oct; sanctions/PEP cleared on Dow Jones screening')"
            value={verificationNotes}
            onChange={(e) => setVerificationNotes(e.target.value)}
            maxLength={1_000}
          />
        </div>
      )}

      {/* Decision actions — pending only */}
      {app.status === "pending" && (
        <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
          <button
            className="lasha-btn-primary"
            style={{ height: 40, padding: "0 18px", display: "inline-flex", alignItems: "center", gap: 8, border: "none", cursor: canApprove ? "pointer" : "not-allowed", opacity: canApprove ? 1 : 0.55 }}
            disabled={decisionPending || !canApprove}
            title={canApprove ? undefined : "Complete the KYC checks and screening note first"}
            onClick={() => onAccept(app._id, checks, verificationNotes)}
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

  const handleAccept = async (id: string, verification: Verification, notes: string) => {
    setBusyId(id);
    setError(null);
    try {
      await acceptApplication({
        applicationId: id as any,
        verification,
        verificationNotes: notes.trim(),
      });
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
