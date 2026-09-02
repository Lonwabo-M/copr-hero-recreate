import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import Sidebar from "@/components/dashboard/Sidebar";
import {
  Package,
  MapPin,
  Navigation,
  Calendar,
  Clock,
  ChevronDown,
  Weight,
  Ruler,
} from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/request-delivery.css";

export default function RequestDelivery() {
  const { signOut } = useAuthActions();
  const [activeSidebarItem, setActiveSidebarItem] = useState("Request Delivery");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Form state
  const [orderName, setOrderName] = useState("");
  const [parcelType, setParcelType] = useState("");
  const [expeditionType, setExpeditionType] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [pickupLocation, setPickupLocation] = useState("");
  const [dropoffLocation, setDropoffLocation] = useState("");
  const [scheduleDate, setScheduleDate] = useState("");
  const [timeFrom, setTimeFrom] = useState("00:00");
  const [timeTo, setTimeTo] = useState("00:00");

  const handleSidebarNavigation = (item: string) => {
    setActiveSidebarItem(item);
    const routes: Record<string, string> = {
      "Activity Center": "/dashboard",
      "Past Deliveries": "/past-deliveries",
      "Request Delivery": "/request-delivery",
      "Track Delivery": "/track-delivery",
      Invoices: "/invoices",
      Wallet: "/wallet",
      "Make Payment": "/make-payment",
      Notifications: "/notifications",
      Help: "/help",
      Legal: "/legal",
      Downloads: "/downloads",
      Settings: "/settings",
    };
    if (item === "Log out") {
      sessionStorage.removeItem("lasha_guest");
      signOut();
      return;
    }
    const route = routes[item];
    if (route) window.location.href = route;
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
          <div
            className="dash-mobile-overlay visible"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <Sidebar
          activeItem={activeSidebarItem}
          onItemChange={handleSidebarNavigation}
          isOpen={sidebarOpen}
        />

        {/* Main content */}
        <main className="request-delivery-main">
          <div className="request-delivery-container">
            {/* Header */}
            <div className="request-delivery-header">
              <h1 className="request-delivery-title">New Parcel</h1>
              <p className="request-delivery-subtitle">
                No matter the size—small packages or large pallets—we've got your delivery needs covered. With Lasha, you can get an instant delivery quote for your local and regional shipments. Enter your delivery details below, explore your options, and book with confidence when you're ready. Your logistics, simplified.
              </p>
            </div>

            {/* Form */}
            <form className="request-delivery-form" onSubmit={(e) => e.preventDefault()}>
              <div className="form-grid">
                {/* Left column */}
                <div className="form-column">
                  {/* Order Name */}
                  <div className="form-field">
                    <label className="form-label">
                      Order Name <span className="required">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <Package className="form-input-icon" size={18} />
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Enter order name"
                        value={orderName}
                        onChange={(e) => setOrderName(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Parcel Type */}
                  <div className="form-field">
                    <label className="form-label">
                      Parcel Type <span className="required">*</span>
                    </label>
                    <div className="form-select-wrapper">
                      <Package className="form-select-icon" size={18} />
                      <select
                        className="form-select"
                        value={parcelType}
                        onChange={(e) => setParcelType(e.target.value)}
                      >
                        <option value="" disabled>Select parcel type</option>
                        <option value="document">Document</option>
                        <option value="small-parcel">Small Parcel</option>
                        <option value="large-parcel">Large Parcel</option>
                        <option value="pallet">Pallet</option>
                      </select>
                      <ChevronDown className="form-select-arrow" size={18} />
                    </div>
                  </div>

                  {/* Expedition Type */}
                  <div className="form-field">
                    <label className="form-label">
                      Expedition Type <span className="required">*</span>
                    </label>
                    <div className="form-select-wrapper">
                      <Package className="form-select-icon" size={18} />
                      <select
                        className="form-select"
                        value={expeditionType}
                        onChange={(e) => setExpeditionType(e.target.value)}
                      >
                        <option value="" disabled>Select expedition</option>
                        <option value="standard">Standard</option>
                        <option value="express">Express</option>
                        <option value="same-day">Same Day</option>
                      </select>
                      <ChevronDown className="form-select-arrow" size={18} />
                    </div>
                  </div>

                  {/* Dimensions */}
                  <div className="form-field">
                    <label className="form-label">
                      Dimensions <span className="required">*</span>
                    </label>
                    <div className="form-dimensions">
                      <div className="form-dimension-input">
                        <input
                          type="number"
                          className="form-input"
                          placeholder="Width"
                          value={width}
                          onChange={(e) => setWidth(e.target.value)}
                        />
                        <span className="form-dimension-unit">cm</span>
                      </div>
                      <div className="form-dimension-input">
                        <input
                          type="number"
                          className="form-input"
                          placeholder="Height"
                          value={height}
                          onChange={(e) => setHeight(e.target.value)}
                        />
                        <span className="form-dimension-unit">cm</span>
                      </div>
                    </div>
                  </div>

                  {/* Weight */}
                  <div className="form-field">
                    <label className="form-label">
                      Weight <span className="required">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <Weight className="form-input-icon" size={18} />
                      <input
                        type="number"
                        className="form-input"
                        placeholder="Weight"
                        value={weight}
                        onChange={(e) => setWeight(e.target.value)}
                      />
                      <span className="form-input-unit">kg</span>
                    </div>
                  </div>
                </div>

                {/* Right column */}
                <div className="form-column form-column-right">
                  <div className="location-connector">
                    {/* Pick-up Point */}
                    <div className="form-field">
                      <label className="form-label">
                        Pick-up Point <span className="required">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <MapPin className="form-input-icon location-icon" size={18} />
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Enter pickup location"
                          value={pickupLocation}
                          onChange={(e) => setPickupLocation(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Connector line */}
                    <div className="location-connector-line">
                      <div className="connector-dot" />
                      <div className="connector-dash" />
                      <div className="connector-dot" />
                    </div>

                    {/* Drop-off Point */}
                    <div className="form-field">
                      <label className="form-label">
                        Drop-off Point <span className="required">*</span>
                      </label>
                      <div className="form-input-wrapper">
                        <Navigation className="form-input-icon location-icon" size={18} />
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Enter drop-off location"
                          value={dropoffLocation}
                          onChange={(e) => setDropoffLocation(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Schedule */}
                  <div className="form-field">
                    <label className="form-label">
                      Schedule <span className="required">*</span>
                    </label>
                    <div className="form-input-wrapper">
                      <Calendar className="form-input-icon" size={18} />
                      <input
                        type="date"
                        className="form-input"
                        placeholder="Select date"
                        value={scheduleDate}
                        onChange={(e) => setScheduleDate(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Between (Time range) */}
                  <div className="form-field">
                    <label className="form-label">
                      Between <span className="required">*</span>
                    </label>
                    <div className="form-time-range">
                      <div className="form-time-select">
                        <Clock className="form-time-icon" size={16} />
                        <select
                          className="form-select form-select-time"
                          value={timeFrom}
                          onChange={(e) => setTimeFrom(e.target.value)}
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={`${String(i).padStart(2, "0")}:00`}>
                              {`${String(i).padStart(2, "0")}:00`}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="form-select-arrow" size={16} />
                      </div>
                      <div className="form-time-select">
                        <Clock className="form-time-icon" size={16} />
                        <select
                          className="form-select form-select-time"
                          value={timeTo}
                          onChange={(e) => setTimeTo(e.target.value)}
                        >
                          {Array.from({ length: 24 }, (_, i) => (
                            <option key={i} value={`${String(i).padStart(2, "0")}:00`}>
                              {`${String(i).padStart(2, "0")}:00`}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="form-select-arrow" size={16} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit button */}
              <div className="form-actions">
                <button type="submit" className="form-submit-btn">
                  Request Delivery
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
