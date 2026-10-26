import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import DriverShell from "@/components/shells/DriverShell";
import {
  Loader2,
  Save,
  CheckCircle2,
  XCircle,
  Clock,
  Truck,
  FileText,
  AlertTriangle,
  User,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import "@/styles/driver.css";

// ─── Driver Application (Capture step) ───────────────────────────────────────
// Step 1 of the driver pipeline: Capture → Review → Accept. A driver captures
// their license and vehicle details here (Driver App); the Admin Portal
// reviews and accepts, which provisions the driver_profile + vehicle that
// dispatch requires. Until accepted, the driver is not dispatchable.
//
// Backend: users.driverApplications (session-derived; no IDs from client).
// Resubmission after a rejection reuses the same application record.

const CAPABILITY_FIELDS = [
  { key: "vehicleBreaking", label: "Breaking / fragile goods" },
  { key: "vehicleExpress", label: "Express service" },
  { key: "vehicleFlammable", label: "Flammable goods" },
  { key: "vehicleTrailer", label: "Trailer equipped" },
] as const;

type CapabilityKey = (typeof CAPABILITY_FIELDS)[number]["key"];

function StatusBanner({
  status,
  notes,
  reviewerName,
}: {
  status: "pending" | "approved" | "rejected";
  notes?: string;
  reviewerName?: string | null;
}) {
  if (status === "approved") {
    return (
      <div className="driver-action-card" style={{ padding: 16, borderLeft: "4px solid #0A7C42" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CheckCircle2 size={20} color="#0A7C42" />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#0A7C42" }}>Application approved</div>
            <div style={{ fontSize: 12.5, color: "#666", marginTop: 2 }}>
              You are dispatchable — delivery offers will appear when dispatch matches you.
            </div>
          </div>
        </div>
      </div>
    );
  }
  if (status === "pending") {
    return (
      <div className="driver-action-card" style={{ padding: 16, borderLeft: "4px solid #856404" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Clock size={20} color="#856404" />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#856404" }}>Application under review</div>
            <div style={{ fontSize: 12.5, color: "#666", marginTop: 2 }}>
              The Lasha team is reviewing your details. You'll be notified once a decision is made.
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="driver-action-card" style={{ padding: 16, borderLeft: "4px solid #C62828" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <XCircle size={20} color="#C62828" />
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#C62828" }}>Application not approved</div>
          <div style={{ fontSize: 12.5, color: "#666", marginTop: 2 }}>
            {notes ? `Reason: ${notes}` : "Please update your details and resubmit below."}
            {reviewerName && ` · Reviewed by ${reviewerName}`}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DriverApply() {
  const application = useQuery(api.users.driverApplications.getMyDriverApplication, {});
  const submitApplication = useMutation(api.users.driverApplications.submitMyDriverApplication);
  const { user } = useAuth();

  // Identity: from the previous application when resubmitting, else prefilled
  // from the signed-in account so returning drivers start from what we know.
  const knownFirstName = application?.firstName ?? user?.name?.split(" ")[0] ?? "";
  const knownSurname = application?.surname ?? user?.name?.split(" ").slice(1).join(" ") ?? "";
  const knownCell = application?.cellNumber ?? user?.phone ?? "";

  const [firstName, setFirstName] = useState("");
  const [surname, setSurname] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [cellNumber, setCellNumber] = useState("");
  const [licenseClass, setLicenseClass] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehicleCapacityKg, setVehicleCapacityKg] = useState("");
  const [vehicleRegistration, setVehicleRegistration] = useState("");
  const [capabilities, setCapabilities] = useState<Record<CapabilityKey, boolean>>({
    vehicleBreaking: false,
    vehicleExpress: false,
    vehicleFlammable: false,
    vehicleTrailer: false,
  });

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCapability = (key: CapabilityKey, value: boolean) => {
    setCapabilities((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    setError(null);

    const yearNum = vehicleYear.trim() === "" ? undefined : Number(vehicleYear);
    const capacityNum = Number(vehicleCapacityKg);

    // Identity validation (client mirror of the backend rules).
    if (firstName.trim().length === 0) return setError("First name is required");
    if (surname.trim().length === 0) return setError("Surname is required");
    const idDigits = idNumber.replace(/\s/g, "");
    if (!/^\d{13}$/.test(idDigits)) return setError("ID number must be exactly 13 digits");
    const cellDigits = cellNumber.trim().replace(/[\s()-]/g, "");
    if (!/^(\+27|0)[6-8]\d{8}$/.test(cellDigits)) {
      return setError("Enter a valid South African cell number (e.g. 082 123 4567)");
    }

    if (licenseClass.trim().length < 2) return setError("License class is required (e.g. \"B Code 08\")");
    if (vehicleMake.trim().length < 2) return setError("Vehicle make is required");
    if (vehicleModel.trim().length < 2) return setError("Vehicle model is required");
    if (vehicleYear.trim() !== "" && (!Number.isFinite(yearNum) || (yearNum as number) < 1980 || (yearNum as number) > 2100)) {
      return setError("Vehicle year looks invalid");
    }
    if (!Number.isFinite(capacityNum) || capacityNum < 1) {
      return setError("Load capacity (kg) is required");
    }
    if (vehicleRegistration.trim().length < 3) return setError("License plate is required");

    setSubmitting(true);
    try {
      await submitApplication({
        firstName: firstName.trim(),
        surname: surname.trim(),
        idNumber: idDigits,
        cellNumber: cellNumber.trim(),
        licenseClass: licenseClass.trim(),
        licenseNumber: licenseNumber.trim() || undefined,
        vehicleMake: vehicleMake.trim(),
        vehicleModel: vehicleModel.trim(),
        vehicleYear: yearNum,
        vehicleCapacityKg: capacityNum,
        vehicleRegistration: vehicleRegistration.trim(),
        vehicleBreaking: capabilities.vehicleBreaking,
        vehicleExpress: capabilities.vehicleExpress,
        vehicleFlammable: capabilities.vehicleFlammable,
        vehicleTrailer: capabilities.vehicleTrailer,
      });
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not submit the application");
    } finally {
      setSubmitting(false);
    }
  };

  const status = application?.status ?? null;
  const isRejected = status === "rejected";
  const canEdit = application === undefined || application === null || isRejected;
  // Narrowed non-null application for the pending/approved branches.
  const liveApp = application ?? null;

  // Applications captured before identity fields existed have none on file, so
  // fall back to the account details and never render "undefined".
  const displayName =
    [liveApp?.firstName, liveApp?.surname].filter(Boolean).join(" ") ||
    user?.name ||
    "—";
  const displayId = liveApp?.idNumber || "—";
  const displayCell = liveApp?.cellNumber || user?.phone || "—";

  // Prefill identity + vehicle fields once data lands: resubmissions start
  // from the captured application; fresh forms start from the account.
  const prefillDone = useRef(false);
  useEffect(() => {
    if (prefillDone.current || application === undefined) return;
    prefillDone.current = true;
    if (application) {
      setFirstName(application.firstName ?? knownFirstName);
      setSurname(application.surname ?? knownSurname);
      setIdNumber(application.idNumber ?? "");
      setCellNumber(application.cellNumber ?? knownCell);
      setLicenseClass(application.licenseClass);
      setLicenseNumber(application.licenseNumber ?? "");
      setVehicleMake(application.vehicleMake);
      setVehicleModel(application.vehicleModel);
      setVehicleYear(application.vehicleYear != null ? String(application.vehicleYear) : "");
      setVehicleCapacityKg(String(application.vehicleCapacityKg));
      setVehicleRegistration(application.vehicleRegistration);
      setCapabilities({
        vehicleBreaking: application.vehicleBreaking,
        vehicleExpress: application.vehicleExpress,
        vehicleFlammable: application.vehicleFlammable,
        vehicleTrailer: application.vehicleTrailer,
      });
    } else {
      setFirstName(knownFirstName);
      setSurname(knownSurname);
      setCellNumber(knownCell);
    };
  }, [application, knownFirstName, knownSurname, knownCell]);

  return (
    <DriverShell activeItem="Driver Application">
      <main className="driver-main dash-workspace" style={{ paddingBottom: 24 }}>
        <div className="driver-container">
          <div className="driver-header">
            <div>
              <h1 className="driver-title">Driver Application</h1>
              <p className="driver-subtitle">
                Capture your details — the Lasha team reviews and approves new drivers
              </p>
            </div>
          </div>

          {application === undefined ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: "#999" }} />
            </div>
          ) : (
            <>
              {/* Status of the existing application */}
              {status !== null && liveApp && (
                <div style={{ marginBottom: 16 }}>
                  <StatusBanner
                    status={status}
                    notes={liveApp.reviewNotes}
                    reviewerName={liveApp.reviewerName}
                  />
                </div>
              )}

              {status === "approved" && liveApp ? (
                /* Approved — nothing to edit; the profile is live */
                <div className="driver-action-card" style={{ padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Truck size={18} color="#0794B5" />
                    <div style={{ fontSize: 13.5, color: "#202020" }}>
                      {displayName} · {liveApp.vehicleMake}{" "}
                      {liveApp.vehicleModel} · {liveApp.vehicleRegistration} — on file
                      with Lasha.
                    </div>
                  </div>
                </div>
              ) : status === "pending" && liveApp ? (
                /* Pending — read-only summary of what was captured */
                <div className="driver-action-card" style={{ padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <FileText size={18} color="#0794B5" />
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#202020" }}>
                      What you submitted
                    </div>
                  </div>
                  <div style={{ fontSize: 13, color: "#444", lineHeight: 1.9 }}>
                    Driver: <strong>{displayName}</strong>
                    <br />
                    ID number: <strong>{displayId}</strong> · Cell:{" "}
                    <strong>{displayCell}</strong>
                    <br />
                    License: <strong>{liveApp.licenseClass}</strong>
                    {liveApp.licenseNumber ? ` (${liveApp.licenseNumber})` : ""}
                    <br />
                    Vehicle: <strong>{liveApp.vehicleMake} {liveApp.vehicleModel}</strong>
                    {liveApp.vehicleYear ? ` (${liveApp.vehicleYear})` : ""}
                    <br />
                    Plate: <strong>{liveApp.vehicleRegistration}</strong> · Capacity:{" "}
                    <strong>{liveApp.vehicleCapacityKg.toLocaleString("en-ZA")} kg</strong>
                  </div>
                </div>
              ) : (
                /* No application yet, or rejected → the capture form */
                <div className="driver-action-card" style={{ padding: 16 }}>
                  {isRejected && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <AlertTriangle size={16} color="#856404" />
                      <span style={{ fontSize: 12.5, color: "#856404", fontWeight: 600 }}>
                        Update your details and resubmit
                      </span>
                    </div>
                  )}
                  {submitted && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <CheckCircle2 size={16} color="#0A7C42" />
                      <span style={{ fontSize: 12.5, color: "#0A7C42", fontWeight: 600 }}>
                        Application submitted — under review
                      </span>
                    </div>
                  )}

                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <User size={16} color="#0794B5" />
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: "#202020" }}>
                        Your details
                      </span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#202020" }}>First name *</span>
                        <input
                          className="dash-search"
                          style={{ height: 44, paddingLeft: 12 }}
                          placeholder="Thabo"
                          autoComplete="given-name"
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          disabled={!canEdit}
                        />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#202020" }}>Surname *</span>
                        <input
                          className="dash-search"
                          style={{ height: 44, paddingLeft: 12 }}
                          placeholder="Mokoena"
                          autoComplete="family-name"
                          value={surname}
                          onChange={(e) => setSurname(e.target.value)}
                          disabled={!canEdit}
                        />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#202020" }}>ID number *</span>
                        <input
                          className="dash-search"
                          style={{ height: 44, paddingLeft: 12 }}
                          placeholder="13-digit ID number"
                          inputMode="numeric"
                          autoComplete="off"
                          maxLength={16}
                          value={idNumber}
                          onChange={(e) => setIdNumber(e.target.value.replace(/[^\d\s]/g, ""))}
                          disabled={!canEdit}
                        />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#202020" }}>Cell number *</span>
                        <input
                          className="dash-search"
                          style={{ height: 44, paddingLeft: 12 }}
                          placeholder="082 123 4567"
                          inputMode="tel"
                          autoComplete="tel"
                          value={cellNumber}
                          onChange={(e) => setCellNumber(e.target.value)}
                          disabled={!canEdit}
                        />
                      </label>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <Truck size={16} color="#0794B5" />
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: "#202020" }}>Vehicle</span>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#202020" }}>Make *</span>
                        <input
                          className="dash-search"
                          style={{ height: 44, paddingLeft: 12 }}
                          placeholder="Toyota"
                          value={vehicleMake}
                          onChange={(e) => setVehicleMake(e.target.value)}
                          disabled={!canEdit}
                        />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#202020" }}>Model *</span>
                        <input
                          className="dash-search"
                          style={{ height: 44, paddingLeft: 12 }}
                          placeholder="Quantum"
                          value={vehicleModel}
                          onChange={(e) => setVehicleModel(e.target.value)}
                          disabled={!canEdit}
                        />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#202020" }}>
                          Year <span style={{ color: "#9A9A9A", fontWeight: 400 }}>(optional)</span>
                        </span>
                        <input
                          className="dash-search"
                          style={{ height: 44, paddingLeft: 12 }}
                          placeholder="2021"
                          inputMode="numeric"
                          value={vehicleYear}
                          onChange={(e) => setVehicleYear(e.target.value)}
                          disabled={!canEdit}
                        />
                      </label>
                      <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#202020" }}>Load capacity (kg) *</span>
                        <input
                          className="dash-search"
                          style={{ height: 44, paddingLeft: 12 }}
                          placeholder="1200"
                          inputMode="numeric"
                          value={vehicleCapacityKg}
                          onChange={(e) => setVehicleCapacityKg(e.target.value)}
                          disabled={!canEdit}
                        />
                      </label>
                    </div>

                    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#202020" }}>License plate *</span>
                      <input
                        className="dash-search"
                        style={{ height: 44, paddingLeft: 12 }}
                        placeholder="FR35C0 GP"
                        value={vehicleRegistration}
                        onChange={(e) => setVehicleRegistration(e.target.value.toUpperCase())}
                        disabled={!canEdit}
                      />
                    </label>

                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                      <CheckCircle2 size={16} color="#0794B5" />
                      <span style={{ fontSize: 13.5, fontWeight: 700, color: "#202020" }}>Handling capabilities</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      {CAPABILITY_FIELDS.map((field) => (
                        <label
                          key={field.key}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 9,
                            fontSize: 13,
                            color: "#202020",
                            border: "1px solid #E8E8E8",
                            borderRadius: 10,
                            padding: "10px 12px",
                            cursor: canEdit ? "pointer" : "default",
                            background: capabilities[field.key] ? "rgba(66,180,208,0.06)" : "#fff",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={capabilities[field.key]}
                            onChange={(e) => handleCapability(field.key, e.target.checked)}
                            disabled={!canEdit}
                            style={{ width: 16, height: 16, accentColor: "#42B4D0" }}
                          />
                          {field.label}
                        </label>
                      ))}
                    </div>

                    {error && (
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: "#C62828" }}>{error}</div>
                    )}

                    <button
                      className="lasha-btn-primary"
                      style={{
                        height: 46,
                        marginTop: 4,
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        fontSize: 14,
                        fontWeight: 700,
                        border: "none",
                        cursor: submitting ? "default" : "pointer",
                        opacity: submitting ? 0.7 : 1,
                      }}
                      onClick={handleSubmit}
                      disabled={submitting || !canEdit}
                    >
                      {submitting ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Save size={16} />
                      )}
                      {isRejected ? "Resubmit application" : "Submit application"}
                    </button>
                    <p style={{ fontSize: 12, color: "var(--lasha-muted)", lineHeight: 1.6, marginTop: 4 }}>
                      We use your identity, licence and vehicle information to verify
                      that you may drive for Lasha and to pay you. Never for marketing.
                      See our <a href="/privacy" style={{ color: "var(--lasha-cyan)", fontWeight: 600 }}>Privacy Notice</a>{" "}
                      and <a href="/privacy-rights" style={{ color: "var(--lasha-cyan)", fontWeight: 600 }}>your rights</a>.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </DriverShell>
  );
}
