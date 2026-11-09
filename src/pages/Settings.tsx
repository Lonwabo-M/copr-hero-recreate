import { useState, useEffect } from "react";
import { Link } from "react-router";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useCurrentUser, useNotificationPreferences, useUpdateNotificationPreferences, useUpdateMyProfile, useMyBusiness, useUpdateMyBusiness } from "@/hooks/use-lasha";
import CustomerShell from "@/components/shells/CustomerShell";
import {
  User,
  Building,
  Bell,
  Shield,
  CreditCard,
  ChevronRight,
  Mail,
  Phone,
  MapPin,
  Save,
  Loader2,
  KeyRound,
} from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/settings.css";

type SettingsTab = "profile" | "business" | "notifications" | "security";

const settingsTabs = [
  { id: "profile" as const, label: "Profile", icon: User },
  { id: "business" as const, label: "Business", icon: Building },
  { id: "notifications" as const, label: "Notifications", icon: Bell },
  { id: "security" as const, label: "Security", icon: Shield },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Convex data
  const currentUser = useCurrentUser();
  const preferences = useNotificationPreferences();
  const updatePreferences = useUpdateNotificationPreferences();
  const updateMyProfile = useUpdateMyProfile();
  const myBusiness = useMyBusiness();
  const updateMyBusiness = useUpdateMyBusiness();
  const changePassword = useAction(api.auth.passwordChange.changePassword);

  // Profile state (initialized from Convex)
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // Business state
  const [companyName, setCompanyName] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyReg, setCompanyReg] = useState("");

  // Notification state (from Convex preferences)
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(true);
  const [pushNotifications, setPushNotifications] = useState(false);
  const [deliveryUpdates, setDeliveryUpdates] = useState(true);
  const [marketingEmails, setMarketingEmails] = useState(false);

  // Security state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordNotice, setPasswordNotice] = useState("");

  // Initialize form from Convex user data
  useEffect(() => {
    if (currentUser) {
      const nameParts = (currentUser.name ?? "").split(" ");
      setFirstName(nameParts[0] ?? "");
      setLastName(nameParts.slice(1).join(" ") ?? "");
      setEmail(currentUser.email ?? "");
      setPhone(currentUser.phone ?? "");
    }
  }, [currentUser]);

  // Initialize notification preferences from Convex
  useEffect(() => {
    if (preferences) {
      setEmailNotifications(preferences.emailNotifications ?? true);
      setSmsNotifications(preferences.smsNotifications ?? true);
      setPushNotifications(preferences.pushNotifications ?? false);
      setDeliveryUpdates(preferences.deliveryUpdates ?? true);
      setMarketingEmails(preferences.marketingEmails ?? false);
    }
  }, [preferences]);

  // Initialize business form from Convex business data
  useEffect(() => {
    if (myBusiness) {
      setCompanyName(myBusiness.name ?? "");
      setCompanyPhone(myBusiness.phone ?? "");
      setCompanyAddress(myBusiness.address ?? "");
      setCompanyReg(myBusiness.registrationNumber ?? "");
    }
  }, [myBusiness]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (activeTab === "profile") {
        const name = [firstName, lastName].filter(Boolean).join(" ").trim();
        if (!name) {
          setError("Enter your first or last name before saving.");
          return;
        }
        await updateMyProfile({
          ...(name !== (currentUser?.name ?? "") && { name }),
          ...(phone !== (currentUser?.phone ?? "") && { phone }),
        });
      } else if (activeTab === "business") {
        await updateMyBusiness({
          ...(companyName !== (myBusiness?.name ?? "") && { name: companyName }),
          ...(companyPhone !== (myBusiness?.phone ?? "") && { phone: companyPhone }),
          ...(companyAddress !== (myBusiness?.address ?? "") && { address: companyAddress }),
          ...(companyReg !== (myBusiness?.registrationNumber ?? "") && {
            registrationNumber: companyReg,
          }),
        });
      } else if (activeTab === "notifications") {
        await updatePreferences({
          emailNotifications,
          smsNotifications,
          pushNotifications,
          deliveryUpdates,
          marketingEmails,
        });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordNotice("");

    if (!currentPassword) {
      setPasswordError("Enter your current password.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (newPassword === currentPassword) {
      setPasswordError("Choose a new password that is different from your current one.");
      return;
    }

    setPasswordSaving(true);
    try {
      const result = await changePassword({ currentPassword, newPassword });
      if (!result.success) {
        setPasswordError(result.message);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordNotice(
        result.otherSessionsSignedOut
          ? "Password updated. Your other sessions have been signed out."
          : "Password updated.",
      );
    } catch {
      setPasswordError("Could not update your password. Please try again.");
    } finally {
      setPasswordSaving(false);
    }
  };

  const isLoading = currentUser === undefined;

  return (
    <CustomerShell activeItem="Settings">
      {/* Main content */}
      <main className="settings-main">
        <div className="settings-container">
            {/* Page header */}
            <div className="settings-header">
              <h1 className="settings-title">Settings</h1>
              <p className="settings-subtitle">
                Manage your account settings and preferences.
              </p>
            </div>

            {/* Loading state */}
            {isLoading ? (
              <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
                <Loader2 size={24} className="animate-spin" style={{ color: "#999" }} />
              </div>
            ) : (
              /* Settings layout */
              <div className="settings-layout">
                {/* Settings tabs sidebar */}
                <div className="settings-tabs">
                  {settingsTabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        className={`settings-tab ${activeTab === tab.id ? "active" : ""}`}
                        onClick={() => setActiveTab(tab.id)}
                        aria-current={activeTab === tab.id ? "page" : undefined}
                      >
                        <Icon size={18} />
                        <span>{tab.label}</span>
                        <ChevronRight size={16} className="settings-tab-arrow" />
                      </button>
                    );
                  })}
                </div>

                {/* Settings content */}
                <div className="settings-content">
                  {activeTab === "profile" && (
                    <div className="settings-section">
                      <h2 className="settings-section-title">Profile Information</h2>
                      <p className="settings-section-desc">
                        Update your personal information and how others see you on the platform.
                      </p>

                      {/* Avatar */}
                      <div className="settings-avatar-section">
                        <div className="settings-avatar">
                          {currentUser?.image ? (
                            <img
                              src={currentUser.image}
                              alt="Profile"
                              className="settings-avatar-img"
                            />
                          ) : (
                            <div style={{
                              width: 80, height: 80, borderRadius: "50%",
                              background: "#42b4d0", display: "flex",
                              alignItems: "center", justifyContent: "center",
                              fontSize: 32, fontWeight: 600, color: "#fff",
                            }}>
                              {(firstName || "U")[0].toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="settings-avatar-name">{firstName} {lastName}</p>
                          <p className="settings-avatar-email">{email}</p>
                        </div>
                      </div>

                      {/* Form fields */}
                      <div className="settings-form-grid">
                        <div className="settings-field">
                          <label className="settings-label" htmlFor="settings-first-name">First Name</label>
                          <input
                            id="settings-first-name"
                            type="text"
                            className="settings-input"
                            value={firstName}
                            autoComplete="given-name"
                            onChange={(e) => setFirstName(e.target.value)}
                          />
                        </div>
                        <div className="settings-field">
                          <label className="settings-label" htmlFor="settings-last-name">Last Name</label>
                          <input
                            id="settings-last-name"
                            type="text"
                            className="settings-input"
                            value={lastName}
                            autoComplete="family-name"
                            onChange={(e) => setLastName(e.target.value)}
                          />
                        </div>
                        <div className="settings-field">
                          <label className="settings-label" htmlFor="settings-email">
                            <Mail size={14} />
                            Sign-in email
                          </label>
                          <input
                            id="settings-email"
                            type="email"
                            className="settings-input"
                            value={email}
                            readOnly
                            aria-describedby="settings-email-hint"
                          />
                          <p
                            id="settings-email-hint"
                            style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}
                          >
                            Contact support if you need to change the email you sign in with.
                          </p>
                        </div>
                        <div className="settings-field">
                          <label className="settings-label" htmlFor="settings-phone">
                            <Phone size={14} />
                            Phone
                          </label>
                          <input
                            id="settings-phone"
                            type="tel"
                            className="settings-input"
                            value={phone}
                            autoComplete="tel"
                            onChange={(e) => setPhone(e.target.value)}
                          />
                        </div>
                        <div className="settings-field full-width">
                          <label className="settings-label">
                            <MapPin size={14} />
                            Delivery addresses
                          </label>
                          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: "2px 0 8px" }}>
                            Pickup and drop-off addresses are managed in your address book.
                          </p>
                          <Link
                            to="/address-book"
                            style={{ color: "var(--lasha-cyan, #0794b5)", fontWeight: 600, fontSize: 13 }}
                          >
                            Manage addresses
                          </Link>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === "business" && (
                    <div className="settings-section">
                      <h2 className="settings-section-title">Business Information</h2>
                      <p className="settings-section-desc">
                        Manage your business details and company information.
                      </p>

                      <div className="settings-form-grid">
                        <div className="settings-field full-width">
                          <label className="settings-label" htmlFor="settings-company-name">Company Name</label>
                          <input
                            id="settings-company-name"
                            type="text"
                            className="settings-input"
                            value={companyName}
                            autoComplete="organization"
                            onChange={(e) => setCompanyName(e.target.value)}
                          />
                        </div>
                        <div className="settings-field">
                          <label className="settings-label" htmlFor="settings-company-phone">
                            <Phone size={14} />
                            Business Phone
                          </label>
                          <input
                            id="settings-company-phone"
                            type="tel"
                            className="settings-input"
                            value={companyPhone}
                            autoComplete="tel"
                            onChange={(e) => setCompanyPhone(e.target.value)}
                          />
                        </div>
                        <div className="settings-field full-width">
                          <label className="settings-label" htmlFor="settings-company-address">
                            <MapPin size={14} />
                            Business Address
                          </label>
                          <input
                            id="settings-company-address"
                            type="text"
                            className="settings-input"
                            value={companyAddress}
                            autoComplete="street-address"
                            onChange={(e) => setCompanyAddress(e.target.value)}
                          />
                        </div>
                        <div className="settings-field">
                          <label className="settings-label" htmlFor="settings-company-reg">Registration Number</label>
                          <input
                            id="settings-company-reg"
                            type="text"
                            className="settings-input"
                            value={companyReg}
                            onChange={(e) => setCompanyReg(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === "notifications" && (
                    <div className="settings-section">
                      <h2 className="settings-section-title">Notification Preferences</h2>
                      <p className="settings-section-desc">
                        Choose how you want to be notified about deliveries and account updates.
                      </p>

                      <div className="settings-toggles">
                        <div className="settings-toggle-row">
                          <div className="settings-toggle-info">
                            <p className="settings-toggle-label">Email Notifications</p>
                            <p className="settings-toggle-desc">
                              Receive delivery updates and account alerts via email
                            </p>
                          </div>
                          <label className="settings-switch">
                            <input
                              type="checkbox"
                              checked={emailNotifications}
                              onChange={(e) => setEmailNotifications(e.target.checked)}
                            />
                            <span className="settings-switch-slider" />
                          </label>
                        </div>

                        <div className="settings-toggle-row">
                          <div className="settings-toggle-info">
                            <p className="settings-toggle-label">SMS Notifications</p>
                            <p className="settings-toggle-desc">
                              Get text messages for critical delivery updates
                            </p>
                          </div>
                          <label className="settings-switch">
                            <input
                              type="checkbox"
                              checked={smsNotifications}
                              onChange={(e) => setSmsNotifications(e.target.checked)}
                            />
                            <span className="settings-switch-slider" />
                          </label>
                        </div>

                        <div className="settings-toggle-row">
                          <div className="settings-toggle-info">
                            <p className="settings-toggle-label">Push Notifications</p>
                            <p className="settings-toggle-desc">
                              Receive push notifications on your devices
                            </p>
                          </div>
                          <label className="settings-switch">
                            <input
                              type="checkbox"
                              checked={pushNotifications}
                              onChange={(e) => setPushNotifications(e.target.checked)}
                            />
                            <span className="settings-switch-slider" />
                          </label>
                        </div>

                        <div className="settings-toggle-row">
                          <div className="settings-toggle-info">
                            <p className="settings-toggle-label">Delivery Updates</p>
                            <p className="settings-toggle-desc">
                              Real-time status updates for all your shipments
                            </p>
                          </div>
                          <label className="settings-switch">
                            <input
                              type="checkbox"
                              checked={deliveryUpdates}
                              onChange={(e) => setDeliveryUpdates(e.target.checked)}
                            />
                            <span className="settings-switch-slider" />
                          </label>
                        </div>

                        <div className="settings-toggle-row">
                          <div className="settings-toggle-info">
                            <p className="settings-toggle-label">Marketing Emails</p>
                            <p className="settings-toggle-desc">
                              Promotional offers and product updates
                            </p>
                          </div>
                          <label className="settings-switch">
                            <input
                              type="checkbox"
                              checked={marketingEmails}
                              onChange={(e) => setMarketingEmails(e.target.checked)}
                            />
                            <span className="settings-switch-slider" />
                          </label>
                        </div>
                      </div>
                    </div>
                  )}

                  {activeTab === "security" && (
                    <div className="settings-section">
                      <h2 className="settings-section-title">Security Settings</h2>
                      <p className="settings-section-desc">
                        Manage your password and security preferences.
                      </p>

                      {/* Change password */}
                      <form
                        className="settings-security-card"
                        onSubmit={handleChangePassword}
                        noValidate
                      >
                        <h3 className="settings-security-title">Change Password</h3>
                        <p
                          style={{
                            fontSize: 13,
                            color: "var(--text-muted)",
                            marginTop: -10,
                            marginBottom: 18,
                          }}
                        >
                          Use at least 8 characters. Other signed-in devices will be signed out.
                        </p>
                        <div className="settings-form-grid">
                          <div className="settings-field full-width">
                            <label className="settings-label" htmlFor="current-password">
                              Current Password
                            </label>
                            <input
                              id="current-password"
                              type="password"
                              className="settings-input"
                              placeholder="Enter current password"
                              autoComplete="current-password"
                              value={currentPassword}
                              onChange={(e) => setCurrentPassword(e.target.value)}
                            />
                          </div>
                          <div className="settings-field">
                            <label className="settings-label" htmlFor="new-password">
                              New Password
                            </label>
                            <input
                              id="new-password"
                              type="password"
                              className="settings-input"
                              placeholder="Enter new password"
                              autoComplete="new-password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                            />
                          </div>
                          <div className="settings-field">
                            <label className="settings-label" htmlFor="confirm-password">
                              Confirm Password
                            </label>
                            <input
                              id="confirm-password"
                              type="password"
                              className="settings-input"
                              placeholder="Confirm new password"
                              autoComplete="new-password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                            />
                          </div>
                        </div>

                        {passwordError && (
                          <p
                            role="alert"
                            style={{
                              marginTop: 16,
                              padding: "10px 14px",
                              borderRadius: 8,
                              background: "rgba(220, 38, 38, 0.08)",
                              border: "1px solid rgba(220, 38, 38, 0.3)",
                              color: "#b91c1c",
                              fontSize: 13,
                              fontWeight: 500,
                            }}
                          >
                            {passwordError}
                          </p>
                        )}
                        {passwordNotice && (
                          <p
                            role="status"
                            style={{
                              marginTop: 16,
                              padding: "10px 14px",
                              borderRadius: 8,
                              background: "rgba(15, 118, 110, 0.08)",
                              border: "1px solid rgba(15, 118, 110, 0.28)",
                              color: "#0f766e",
                              fontSize: 13,
                              fontWeight: 500,
                            }}
                          >
                            {passwordNotice}
                          </p>
                        )}

                        <div className="settings-actions" style={{ marginTop: 20 }}>
                          <button
                            type="submit"
                            className="settings-save-btn"
                            disabled={passwordSaving}
                            style={{ opacity: passwordSaving ? 0.7 : 1 }}
                          >
                            {passwordSaving ? (
                              <Loader2
                                size={16}
                                style={{ animation: "spin 1s linear infinite" }}
                              />
                            ) : (
                              <KeyRound size={16} />
                            )}
                            {passwordSaving ? "Updating..." : "Update Password"}
                          </button>
                        </div>
                      </form>

                      {/* Two-factor auth — shown honestly until the feature exists */}
                      <div className="settings-security-card">
                        <div className="settings-toggle-row">
                          <div className="settings-toggle-info">
                            <p className="settings-toggle-label">Two-Factor Authentication</p>
                            <p className="settings-toggle-desc">
                              Add an extra layer of security to your account
                            </p>
                          </div>
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "var(--text-muted)",
                              background: "var(--surface-muted, #f4f6f7)",
                              border: "1px solid var(--border-light, #e8e8e8)",
                              borderRadius: 999,
                              padding: "5px 10px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Not available yet
                          </span>
                        </div>
                      </div>

                      {/* Session info */}
                      <div className="settings-security-card">
                        <h3 className="settings-security-title">Current Session</h3>
                        <div className="settings-session">
                          <div className="settings-session-info">
                            <p className="settings-session-device">Current Browser</p>
                            <p className="settings-session-time">Last active: Now</p>
                          </div>
                          <span className="settings-session-current">Current</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Save button — the password card has its own submit. */}
                  {activeTab !== "security" && (
                    <>
                      {error && (
                        <div
                          className="settings-actions"
                          style={{
                            padding: "10px 14px",
                            marginBottom: 12,
                            borderRadius: 8,
                            background: "rgba(220, 38, 38, 0.08)",
                            border: "1px solid rgba(220, 38, 38, 0.3)",
                            color: "#b91c1c",
                            fontSize: 13,
                            fontWeight: 500,
                          }}
                          role="alert"
                        >
                          {error}
                        </div>
                      )}
                      <div className="settings-actions">
                        <button
                          type="button"
                          className="settings-save-btn"
                          onClick={handleSave}
                          disabled={saving || saved}
                          style={{ opacity: saving ? 0.7 : 1 }}
                        >
                          {saving ? (
                            <Loader2
                              size={16}
                              style={{ animation: "spin 1s linear infinite" }}
                            />
                          ) : (
                            <Save size={16} />
                          )}
                          {saved ? "Saved!" : saving ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
    </CustomerShell>
  );
}
