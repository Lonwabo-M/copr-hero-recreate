import { useEffect, useState } from "react";
import { useMyBusiness, useUpdateMyProfile } from "@/hooks/use-lasha";
import DriverShell from "@/components/shells/DriverShell";
import { useAuth } from "@/hooks/use-auth";
import {
  Loader2,
  Save,
  CheckCircle2,
  User,
  ShieldCheck,
  Building,
  Info,
  AlertTriangle,
} from "lucide-react";
import { ROLES } from "@/convex/schema";
import {
  NAME_MAX_LENGTH,
  PHONE_MAX_LENGTH,
  validateName,
  validatePhone,
} from "@/convex/users/profileValidation";
import "@/styles/driver.css";

// ─── Driver Profile ──────────────────────────────────────────────────────────
// The authenticated driver's own profile, backed entirely by existing Convex
// operations:
//
//   users.currentUser                    → session-derived profile (read)
//   users.businessProfile.getMyBusiness  → session-derived business (read)
//   users.updateMyProfile                → session-scoped edit of name/phone,
//                                          server-validated, audit-logged
//
// Authorization: no user/driver/courier IDs are accepted from the client —
// every operation resolves identity inside Convex. A driver cannot load or
// modify another user's profile.
//
// Editable (per the backend whitelist PROFILE_EDITABLE_FIELDS): name, phone.
// Everything else is read-only; PROTECTED_USER_FIELDS (role, businessId,
// email, image, GPS fields) are structurally absent from the mutation args.
//
// No avatar upload flow exists in the backend (image is a protected field with
// no upload mutation), so the avatar is display-only. Authentication is
// OTP-based — no password controls are shown.

export default function DriverProfile() {
  const { user } = useAuth();
  const business = useMyBusiness();
  const updateMyProfile = useUpdateMyProfile();

  // Editable field state (initialized from Convex, saved via mutation only)
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [initialized, setInitialized] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  // Initialize form from Convex data (reactive re-sync if the user changes).
  useEffect(() => {
    if (user && !initialized) {
      setName(user.name ?? "");
      setPhone(user.phone ?? "");
      setInitialized(true);
    }
  }, [user, initialized]);

  const handleSave = async () => {
    setValidationError(null);
    setServerError(null);

    // Client-side mirror of the server validation for fast feedback; the
    // backend remains authoritative.
    const nameError = name.trim() ? validateName(name) : "Name cannot be empty";
    if (nameError) {
      setValidationError(nameError);
      return;
    }
    const phoneError = validatePhone(phone);
    if (phoneError) {
      setValidationError(phoneError);
      return;
    }

    setSaving(true);
    try {
      // Only whitelisted fields are sent; the mutation refuses anything else
      // structurally (they are not part of its args).
      await updateMyProfile({
        name: name.trim(),
        phone: phone.trim(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setServerError(
        err instanceof Error ? err.message : "Failed to save changes"
      );
    } finally {
      setSaving(false);
    }
  };

  const dirty = name !== (user?.name ?? "") || phone !== (user?.phone ?? "");
  const isDriver = user?.role === ROLES.DRIVER;

  const loading = user === undefined;

  return (
    <DriverShell activeItem="Profile">
      <main className="driver-main dash-workspace">
        <div className="driver-container">
          <div className="driver-header">
            <div>
              <h1 className="driver-title">Profile</h1>
              <p className="driver-subtitle">
                Your account information and details
              </p>
            </div>
          </div>

          {loading ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: "#999" }} />
            </div>
          ) : /* Unauthorized / missing profile */
          user === null ? (
            <div className="driver-panel">
              <AlertTriangle size={24} style={{ color: "#b91c1c", margin: "0 auto" }} />
              <div className="driver-panel-title">Profile unavailable</div>
              <div className="driver-panel-desc">
                You need to be signed in to view your profile.
              </div>
            </div>
          ) : (
            <>
              {validationError && (
                <div className="driver-error" role="alert">{validationError}</div>
              )}
              {serverError && (
                <div className="driver-error" role="alert">{serverError}</div>
              )}

              {/* ─── Personal information (editable) ──────────────────── */}
              <div className="driver-action-card">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <User size={16} style={{ color: "#0794b5" }} />
                  <h2 style={{ fontSize: 15, fontWeight: 600, color: "#202020" }}>
                    Personal information
                  </h2>
                </div>

                {/* Avatar — display only (no backend upload flow exists) */}
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                  {user.image ? (
                    <img
                      src={user.image}
                      alt="Profile"
                      style={{
                        width: 56, height: 56, borderRadius: "50%",
                        objectFit: "cover", border: "1px solid var(--border)",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 56, height: 56, borderRadius: "50%",
                        background: "#42b4d0", display: "flex",
                        alignItems: "center", justifyContent: "center",
                        fontSize: 22, fontWeight: 700, color: "#fff",
                      }}
                    >
                      {(user.name ?? user.email ?? "D")[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "#202020" }}>
                      {user.name ?? "Unnamed driver"}
                    </p>
                    <p style={{ fontSize: 12, color: "#666" }}>
                      {user.email ?? "No email on record"}
                    </p>
                  </div>
                </div>

                {/* Name (editable) */}
                <label
                  className="driver-detail-label"
                  htmlFor="driver-profile-name"
                  style={{ display: "block", marginBottom: 6 }}
                >
                  Full name
                </label>
                <input
                  id="driver-profile-name"
                  type="text"
                  value={name}
                  maxLength={NAME_MAX_LENGTH}
                  onChange={(e) => setName(e.target.value)}
                  className="driver-profile-input"
                />

                {/* Phone (editable, optional — empty clears it) */}
                <label
                  className="driver-detail-label"
                  htmlFor="driver-profile-phone"
                  style={{ display: "block", margin: "12px 0 6px" }}
                >
                  Phone number
                </label>
                <input
                  id="driver-profile-phone"
                  type="tel"
                  value={phone}
                  maxLength={PHONE_MAX_LENGTH}
                  placeholder="+27 …"
                  onChange={(e) => setPhone(e.target.value)}
                  className="driver-profile-input"
                />

                {/* Save */}
                <div className="driver-action-row" style={{ marginTop: 16 }}>
                  <button
                    className="driver-primary-btn"
                    onClick={handleSave}
                    disabled={saving || (!dirty && !saved)}
                  >
                    {saving ? (
                      <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                    ) : saved ? (
                      <CheckCircle2 size={16} />
                    ) : (
                      <Save size={16} />
                    )}
                    {saving ? "Saving…" : saved ? "Saved" : "Save Changes"}
                  </button>
                </div>
              </div>

              {/* ─── Driver status (read-only) ────────────────────────── */}
              <div className="driver-action-card">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <ShieldCheck size={16} style={{ color: "#0794b5" }} />
                  <h2 style={{ fontSize: 15, fontWeight: 600, color: "#202020" }}>
                    Account status
                  </h2>
                </div>
                <div className="driver-timeline">
                  <div className="driver-timeline-item">
                    <span className="driver-timeline-time">Role</span>
                    <span className="driver-timeline-text" style={{ textTransform: "capitalize" }}>
                      {String(user.role ?? "customer").replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="driver-timeline-item">
                    <span className="driver-timeline-time">Email verified</span>
                    <span className="driver-timeline-text">
                      {user.emailVerificationTime ? "Verified" : "Not verified"}
                    </span>
                  </div>
                  <div className="driver-timeline-item">
                    <span className="driver-timeline-time">Member since</span>
                    <span className="driver-timeline-text">
                      {new Date((user as any)._creationTime).toLocaleDateString("en-ZA", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  {!isDriver && (
                    <div className="driver-timeline-item">
                      <span className="driver-timeline-time">Note</span>
                      <span className="driver-timeline-text">
                        This account is not registered as a driver.
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* ─── Business association (read-only for drivers) ─────── */}
              {business === undefined ? (
                <div style={{ display: "flex", justifyContent: "center", padding: 16 }}>
                  <Loader2 size={18} className="animate-spin" style={{ color: "#999" }} />
                </div>
              ) : business !== null ? (
                <div className="driver-action-card">
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <Building size={16} style={{ color: "#0794b5" }} />
                    <h2 style={{ fontSize: 15, fontWeight: 600, color: "#202020" }}>
                      Company affiliation
                    </h2>
                  </div>
                  <div className="driver-timeline">
                    <div className="driver-timeline-item">
                      <span className="driver-timeline-time">Company</span>
                      <span className="driver-timeline-text">{business.name}</span>
                    </div>
                    {business.industry && (
                      <div className="driver-timeline-item">
                        <span className="driver-timeline-time">Industry</span>
                        <span className="driver-timeline-text">{business.industry}</span>
                      </div>
                    )}
                    <div className="driver-timeline-item">
                      <span className="driver-timeline-time">Managed by</span>
                      <span className="driver-timeline-text">
                        Company administrators
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* ─── Account information (read-only) ──────────────────── */}
              <div className="driver-action-card">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Info size={16} style={{ color: "#0794b5" }} />
                  <h2 style={{ fontSize: 15, fontWeight: 600, color: "#202020" }}>
                    Account information
                  </h2>
                </div>
                <div className="driver-timeline">
                  <div className="driver-timeline-item">
                    <span className="driver-timeline-time">Email</span>
                    <span className="driver-timeline-text">
                      {user.email ?? "—"} (managed by sign-in)
                    </span>
                  </div>
                  <div className="driver-timeline-item">
                    <span className="driver-timeline-time">Sign-in method</span>
                    <span className="driver-timeline-text">
                      Email and password
                    </span>
                  </div>
                </div>
              </div>

              {/* Logout lives in the DriverShell sidebar — no duplicate here */}
            </>
          )}
        </div>
      </main>
    </DriverShell>
  );
}
