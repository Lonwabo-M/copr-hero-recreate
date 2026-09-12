import { useState, useEffect } from "react";
import { useCurrentUser, useNotificationPreferences, useUpdateNotificationPreferences, useUpdateMyProfile, useMyBusiness, useUpdateMyBusiness } from "@/hooks/use-lasha";
import CustomerShell from "@/components/shells/CustomerShell";
import {
  User,
  Building,
  Bell,
  Shield,
  CreditCard,
  ChevronRight,
  Camera,
  Mail,
  Phone,
  MapPin,
  Save,
  Loader2,
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

  // Profile state (initialized from Convex)
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");

  // Business state
  const [companyName, setCompanyName] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
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
  const [twoFactor, setTwoFactor] = useState(false);

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
      setCompanyEmail(""); // businesses table has no email field
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
                        className={`settings-tab ${activeTab === tab.id ? "active" : ""}`}
                        onClick={() => setActiveTab(tab.id)}
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
                          <button className="settings-avatar-edit">
                            <Camera size={14} />
                          </button>
                        </div>
                        <div>
                          <p className="settings-avatar-name">{firstName} {lastName}</p>
                          <p className="settings-avatar-email">{email}</p>
                        </div>
                      </div>

                      {/* Form fields */}
                      <div className="settings-form-grid">
                        <div className="settings-field">
                          <label className="settings-label">First Name</label>
                          <input
                            type="text"
                            className="settings-input"
                            value={firstName}
                            onChange={(e) => setFirstName(e.target.value)}
                          />
                        </div>
                        <div className="settings-field">
                          <label className="settings-label">Last Name</label>
                          <input
                            type="text"
                            className="settings-input"
                            value={lastName}
                            onChange={(e) => setLastName(e.target.value)}
                          />
                        </div>
                        <div className="settings-field">
                          <label className="settings-label">
                            <Mail size={14} />
                            Email
                          </label>
                          <input
                            type="email"
                            className="settings-input"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                          />
                        </div>
                        <div className="settings-field">
                          <label className="settings-label">
                            <Phone size={14} />
                            Phone
                          </label>
                          <input
                            type="tel"
                            className="settings-input"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                          />
                        </div>
                        <div className="settings-field full-width">
                          <label className="settings-label">
                            <MapPin size={14} />
                            Address
                          </label>
                          <input
                            type="text"
                            className="settings-input"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                          />
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
                          <label className="settings-label">Company Name</label>
                          <input
                            type="text"
                            className="settings-input"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                          />
                        </div>
                        <div className="settings-field">
                          <label className="settings-label">
                            <Mail size={14} />
                            Business Email
                          </label>
                          <input
                            type="email"
                            className="settings-input"
                            value={companyEmail}
                            onChange={(e) => setCompanyEmail(e.target.value)}
                          />
                        </div>
                        <div className="settings-field">
                          <label className="settings-label">
                            <Phone size={14} />
                            Business Phone
                          </label>
                          <input
                            type="tel"
                            className="settings-input"
                            value={companyPhone}
                            onChange={(e) => setCompanyPhone(e.target.value)}
                          />
                        </div>
                        <div className="settings-field full-width">
                          <label className="settings-label">
                            <MapPin size={14} />
                            Business Address
                          </label>
                          <input
                            type="text"
                            className="settings-input"
                            value={companyAddress}
                            onChange={(e) => setCompanyAddress(e.target.value)}
                          />
                        </div>
                        <div className="settings-field">
                          <label className="settings-label">Registration Number</label>
                          <input
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
                      <div className="settings-security-card">
                        <h3 className="settings-security-title">Change Password</h3>
                        <div className="settings-form-grid">
                          <div className="settings-field full-width">
                            <label className="settings-label">Current Password</label>
                            <input
                              type="password"
                              className="settings-input"
                              placeholder="Enter current password"
                              value={currentPassword}
                              onChange={(e) => setCurrentPassword(e.target.value)}
                            />
                          </div>
                          <div className="settings-field">
                            <label className="settings-label">New Password</label>
                            <input
                              type="password"
                              className="settings-input"
                              placeholder="Enter new password"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                            />
                          </div>
                          <div className="settings-field">
                            <label className="settings-label">Confirm Password</label>
                            <input
                              type="password"
                              className="settings-input"
                              placeholder="Confirm new password"
                              value={confirmPassword}
                              onChange={(e) => setConfirmPassword(e.target.value)}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Two-factor auth */}
                      <div className="settings-security-card">
                        <div className="settings-toggle-row">
                          <div className="settings-toggle-info">
                            <p className="settings-toggle-label">Two-Factor Authentication</p>
                            <p className="settings-toggle-desc">
                              Add an extra layer of security to your account
                            </p>
                          </div>
                          <label className="settings-switch">
                            <input
                              type="checkbox"
                              checked={twoFactor}
                              onChange={(e) => setTwoFactor(e.target.checked)}
                            />
                            <span className="settings-switch-slider" />
                          </label>
                        </div>
                      </div>

                      {/* Session info */}
                      <div className="settings-security-card">
                        <h3 className="settings-security-title">Active Sessions</h3>
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

                  {/* Save button */}
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
                      className="settings-save-btn"
                      onClick={handleSave}
                      disabled={saving}
                      style={{ opacity: saving ? 0.7 : 1 }}
                    >
                      {saving ? (
                        <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
                      ) : (
                        <Save size={16} />
                      )}
                      {saved ? "Saved!" : saving ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </main>
    </CustomerShell>
  );
}
