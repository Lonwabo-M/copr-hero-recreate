import { useState } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import Sidebar from "@/components/dashboard/Sidebar";
import {
  Search,
  Copy,
  Check,
  Phone,
  MessageSquare,
  MapPin,
  Calendar,
  Truck,
  Weight,
  Ruler,
  CheckCircle2,
  Circle,
} from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/track-delivery.css";

interface TrackingStep {
  label: string;
  time: string;
  status: "completed" | "active" | "pending";
}

const trackingData: Record<
  string,
  {
    trackingId: string;
    status: string;
    steps: TrackingStep[];
    sender: { name: string; address: string; city: string };
    receiver: { name: string; address: string; city: string };
    driver: { name: string; avatar: string };
    deliveryType: string;
    weight: string;
    dimensions: string;
    estimatedArrival: string;
    lastUpdated: string;
  }
> = {
  HY257845U4: {
    trackingId: "HY257845U4",
    status: "In transit",
    steps: [
      { label: "Order placed", time: "14 July, 08:42", status: "completed" },
      { label: "Picked up", time: "14 July, 10:15", status: "completed" },
      { label: "In transit", time: "Currently here", status: "active" },
      { label: "Delivered", time: "Expected 18 June", status: "pending" },
    ],
    sender: {
      name: "Sammy's Kitchen",
      address: "9547 Elias St.",
      city: "Marabastad, Pretoria",
    },
    receiver: {
      name: "Luba Mokobane",
      address: "7869 Royal St. Hillbrow",
      city: "Johannesburg",
    },
    driver: {
      name: "Lusanda Miya",
      avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&q=80",
    },
    deliveryType: "Express",
    weight: "20 Kg",
    dimensions: "W: 1000 H:250",
    estimatedArrival: "18 June 2025",
    lastUpdated: "Today at 10:15 AM",
  },
};

const defaultTracking = trackingData["HY257845U4"];

export default function TrackDelivery() {
  const { signOut } = useAuthActions();
  const [activeSidebarItem, setActiveSidebarItem] = useState("Track Delivery");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [trackingInput, setTrackingInput] = useState("HY257845U4");
  const [trackingResult, setTrackingResult] = useState(defaultTracking);
  const [copied, setCopied] = useState(false);

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

  const handleTrack = () => {
    const upper = trackingInput.toUpperCase().trim();
    if (trackingData[upper]) {
      setTrackingResult(trackingData[upper]);
    } else {
      // For demo, show default
      setTrackingResult(defaultTracking);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(trackingResult.trackingId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
        <Sidebar activeItem={activeSidebarItem} onItemChange={handleSidebarNavigation} isOpen={sidebarOpen} />

        {/* Main content */}
        <main className="track-main">
          <div className="track-container">
            {/* Page title */}
            <div className="track-page-title">
              <h1 className="track-title">Delivery Tracking</h1>
            </div>

            {/* Search bar */}
            <div className="track-search-bar">
              <Search className="track-search-icon" size={18} />
              <input
                type="text"
                className="track-search-input"
                placeholder="Enter tracking number"
                value={trackingInput}
                onChange={(e) => setTrackingInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleTrack()}
              />
              <button className="track-search-btn" onClick={handleTrack}>
                Track
              </button>
            </div>

            {trackingResult && (
              <>
                {/* Tracking header card */}
                <div className="track-header-card">
                  <div className="track-header-content">
                    <div>
                      <p className="track-header-label">Tracking shipment</p>
                      <div className="track-header-id-row">
                        <h2 className="track-header-id">{trackingResult.trackingId}</h2>
                        <button className="track-copy-btn" onClick={handleCopy} title="Copy tracking ID">
                          {copied ? <Check size={16} /> : <Copy size={16} />}
                        </button>
                      </div>
                    </div>
                    <div className="track-status-badge">
                      <span className="track-status-dot" />
                      {trackingResult.status}
                    </div>
                  </div>

                  {/* Progress stepper */}
                  <div className="track-stepper">
                    {trackingResult.steps.map((step, i) => (
                      <div key={step.label} className={`track-step ${step.status}`}>
                        <div className="track-step-icon">
                          {step.status === "completed" ? (
                            <CheckCircle2 size={28} />
                          ) : step.status === "active" ? (
                            <div className="track-step-active">
                              <Circle size={28} />
                              <div className="track-step-pulse" />
                            </div>
                          ) : (
                            <Circle size={28} />
                          )}
                        </div>
                        <p className="track-step-label">{step.label}</p>
                        <p className="track-step-time">{step.time}</p>
                        {i < trackingResult.steps.length - 1 && (
                          <div
                            className={`track-step-line ${
                              step.status === "completed" ? "completed" : ""
                            }`}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Content grid */}
                <div className="track-content-grid">
                  {/* Left column */}
                  <div className="track-left-col">
                    {/* Shipment route card */}
                    <div className="track-route-card">
                      <div className="track-route-header">
                        <div>
                          <h3 className="track-route-title">Shipment route</h3>
                          <p className="track-route-estimate">
                            Estimated arrival: {trackingResult.estimatedArrival}
                          </p>
                        </div>
                        <div className="track-route-date">
                          <Calendar size={14} />
                          <span>{trackingResult.estimatedArrival.split(" ").slice(0, 2).join(" ")}</span>
                        </div>
                      </div>

                      {/* Route visualization */}
                      <div className="track-route-visual">
                        <div className="track-route-point">
                          <div className="track-route-pin sender">
                            <MapPin size={16} />
                          </div>
                          <div>
                            <p className="track-route-point-label">Sender</p>
                          </div>
                          <div className="track-route-dot-line">
                            <span className="track-route-dot" />
                            <span className="track-route-dash" />
                            <span className="track-route-dot" />
                          </div>
                          <div>
                            <p className="track-route-point-label">Receiver</p>
                          </div>
                          <div className="track-route-pin receiver">
                            <MapPin size={16} />
                          </div>
                        </div>

                        <div className="track-route-addresses">
                          <div className="track-route-address">
                            <p className="track-route-name">{trackingResult.sender.name}</p>
                            <p className="track-route-street">{trackingResult.sender.address}</p>
                            <p className="track-route-city">{trackingResult.sender.city}</p>
                          </div>
                          <div className="track-route-address" style={{ textAlign: "right" }}>
                            <p className="track-route-name">{trackingResult.receiver.name}</p>
                            <p className="track-route-street">{trackingResult.receiver.address}</p>
                            <p className="track-route-city">{trackingResult.receiver.city}</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Package details */}
                    <div className="track-package-details">
                      <div className="track-detail-item">
                        <p className="track-detail-label">Delivery type</p>
                        <p className="track-detail-value">{trackingResult.deliveryType}</p>
                      </div>
                      <div className="track-detail-item">
                        <p className="track-detail-label">Package weight</p>
                        <p className="track-detail-value">{trackingResult.weight}</p>
                      </div>
                      <div className="track-detail-item">
                        <p className="track-detail-label">Dimensions</p>
                        <p className="track-detail-value">{trackingResult.dimensions}</p>
                      </div>
                    </div>
                  </div>

                  {/* Right column */}
                  <div className="track-right-col">
                    {/* Driver card */}
                    <div className="track-driver-card">
                      <div className="track-driver-info">
                        <img
                          src={trackingResult.driver.avatar}
                          alt={trackingResult.driver.name}
                          className="track-driver-avatar"
                        />
                        <div>
                          <p className="track-driver-label">Your driver</p>
                          <p className="track-driver-name">{trackingResult.driver.name}</p>
                        </div>
                      </div>
                      <div className="track-driver-actions">
                        <button className="track-call-btn">
                          <Phone size={16} />
                          Call driver
                        </button>
                        <button className="track-message-btn">
                          <MessageSquare size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Last updated */}
                    <div className="track-last-updated">
                      <div className="track-updated-icon">
                        <Check size={18} />
                      </div>
                      <div>
                        <p className="track-updated-label">Last updated</p>
                        <p className="track-updated-time">{trackingResult.lastUpdated}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
