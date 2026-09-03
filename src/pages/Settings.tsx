import { useState } from "react";
import Sidebar from "@/components/dashboard/Sidebar";
import { useDashboardNav } from "@/hooks/useDashboardNav";
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
  const { handleSidebarNavigation } = useDashboardNav();
  const [activeSidebarItem, setActiveSidebarItem] = useState("Settings");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [saved, setSaved] = useState(false);

  // Profile state
  const [firstName, setFirstName] = useState("Lusanda");
  const [lastName, setLastName] = useState("Miya");
  const [email, setEmail] = useState("lusanda@lasha.co.za");
  const [phone, setPhone] = useState("+27 82 555 1234");
  const [address, setAddress] = useState("12 Main Road, Sandton, Johannesburg");

  // Business state
  const [companyName, setCompanyName] = useState("Miya Logistics");
  const [companyEmail, setCompanyEmail] = useState("info@miyalogistics.co.za");
  const [companyPhone, setCompanyPhone] = useState("+27 11 555 9876");
  const [companyAddress, setCompanyAddress] = useState("45 Business Park, Midrand");
  const [companyReg, setCompanyReg] = useState("2024/123456/07");

  // Notification state
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

  const onSidebarNav = (item: string) => {
    setActiveSidebarItem(item);
    handleSidebarNavigation(item);
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="dashboard">
      {/* Top Navigation */}
      <header className="dash-topnav">
        <div className="dash-topnav-logo">
          <div className="lasha-logo-icon">
            <span>L</span>
          </div>
          <span className="dash-topnav-logo-text">Lasha</span>
        </div>

        <div className="dash-topnav-links">
          <button className="dash-topnav-link active">
            Home
            <span className="dash-topnav-link-underline" />
          </button>
          <button className="dash-topnav-link">About Us</button>
          <button className="dash-topnav-link">Services</button>
          <button className="dash-topnav-link">Contact US</button>
        </div>

        <div className="dash-topnav-right">
          <button className="dash-mobile-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <button className="dash-topnav-profile">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
        </div>
      </header>

      {/* App body */}
      <div className="dash-app">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div className="dash-mobile-overlay visible" onClick={() => setSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <Sidebar activeItem={activeSidebarItem}          onItemChange={onSidebarNav} isOpen={sidebarOpen} />

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

            {/* Settings layout */}
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
                        <img
                          src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&q=80"
                          alt="Profile"
                          className="settings-avatar-img"
                        />
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
                          <p className="settings-session-device">Chrome on MacOS</p>
                          <p className="settings-session-time">Last active: Now</p>
                        </div>
                        <span className="settings-session-current">Current</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Save button */}
                <div className="settings-actions">
                  <button className="settings-save-btn" onClick={handleSave}>
                    <Save size={16} />
                    {saved ? "Saved!" : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
