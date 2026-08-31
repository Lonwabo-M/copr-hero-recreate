import { useState } from "react";
import {
  MapPin,
  Truck,
  Navigation,
  CheckCircle,
  ArrowRight,
  Package,
} from "lucide-react";

interface Step {
  number: string;
  title: string;
  description: string;
  icon: typeof MapPin;
  visual: "request" | "pickup" | "track" | "delivered";
}

const steps: Step[] = [
  {
    number: "01",
    title: "Request a Delivery",
    description:
      "Fill in your shipment details, pick-up and drop-off locations, and choose your preferred delivery speed.",
    icon: MapPin,
    visual: "request",
  },
  {
    number: "02",
    title: "We Pick It Up",
    description:
      "A verified driver is matched and dispatched to collect your shipment from the designated pick-up point.",
    icon: Truck,
    visual: "pickup",
  },
  {
    number: "03",
    title: "Track in Real-Time",
    description:
      "Monitor your delivery from collection to doorstep with live GPS tracking and status updates.",
    icon: Navigation,
    visual: "track",
  },
  {
    number: "04",
    title: "Delivered & Confirmed",
    description:
      "Digital proof of delivery with photo confirmation and recipient signature ensures every handoff is verified.",
    icon: CheckCircle,
    visual: "delivered",
  },
];

function StepVisual({ visual }: { visual: Step["visual"] }) {
  if (visual === "request") {
    return (
      <div
        style={{
          background: "var(--lasha-ivory-light)",
          border: "1px solid var(--lasha-border-light)",
          borderRadius: 20,
          padding: 32,
        }}
      >
        <p
          className="lasha-label"
          style={{ fontSize: 9, marginBottom: 24, color: "var(--lasha-muted)" }}
        >
          New Delivery Request
        </p>
        <div className="flex flex-col gap-5">
          {[
            { label: "Pickup Location", value: "Johannesburg CBD", icon: MapPin },
            { label: "Drop-off Location", value: "Soweto, Block F", icon: MapPin },
            { label: "Delivery Speed", value: "Express — 2 hours", icon: Truck },
            { label: "Package Type", value: "Small parcel (<5kg)", icon: Package },
          ].map((f) => (
            <div key={f.label}>
              <p
                className="lasha-label"
                style={{
                  fontSize: 9,
                  color: "var(--lasha-muted)",
                  marginBottom: 6,
                }}
              >
                {f.label.toUpperCase()}
              </p>
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid var(--lasha-border-light)",
                  borderRadius: 10,
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <f.icon size={16} style={{ color: "var(--lasha-cyan)" }} strokeWidth={1.5} />
                <span style={{ fontSize: 14, color: "var(--lasha-navy)", fontWeight: 500 }}>
                  {f.value}
                </span>
              </div>
            </div>
          ))}
          <div className="flex justify-end mt-2">
            <span
              className="lasha-btn-primary"
              style={{ fontSize: 12, padding: "10px 20px", pointerEvents: "none" }}
            >
              Schedule Delivery
              <ArrowRight size={12} />
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (visual === "pickup") {
    return (
      <div
        style={{
          background: "var(--lasha-ivory-light)",
          border: "1px solid var(--lasha-border-light)",
          borderRadius: 20,
          padding: 32,
        }}
      >
        <p className="lasha-label" style={{ fontSize: 9, marginBottom: 20, color: "var(--lasha-muted)" }}>
          Driver Dispatched
        </p>
        <div
          style={{
            background: "#ffffff",
            border: "1px solid var(--lasha-border-light)",
            borderRadius: 16,
            padding: 24,
          }}
        >
          <div className="flex items-center gap-4 mb-4">
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                backgroundColor: "rgba(7,148,181,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Truck size={20} style={{ color: "var(--lasha-cyan)" }} strokeWidth={1.5} />
            </div>
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--lasha-navy)" }}>
                Driver assigned
              </p>
              <p style={{ fontSize: 12, color: "var(--lasha-muted)" }}>
                En route to pickup — estimated 12 min
              </p>
            </div>
          </div>
          <div
            style={{
              height: 2,
              background: "var(--lasha-ivory-dark)",
              borderRadius: 1,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: "35%",
                height: "100%",
                backgroundColor: "var(--lasha-cyan)",
                borderRadius: 1,
              }}
            />
          </div>
          <div className="flex justify-between mt-3">
            <span style={{ fontSize: 11, color: "var(--lasha-muted)" }}>Assigned</span>
            <span style={{ fontSize: 11, color: "var(--lasha-muted)" }}>At pickup</span>
            <span style={{ fontSize: 11, color: "var(--lasha-muted)" }}>Picked up</span>
          </div>
        </div>
      </div>
    );
  }

  if (visual === "track") {
    return (
      <div
        style={{
          background: "var(--lasha-ivory-light)",
          border: "1px solid var(--lasha-border-light)",
          borderRadius: 20,
          padding: 32,
        }}
      >
        <p className="lasha-label" style={{ fontSize: 9, marginBottom: 20, color: "var(--lasha-muted)" }}>
          Live Tracking
        </p>
        <div
          style={{
            background: "var(--lasha-navy)",
            borderRadius: 16,
            padding: 24,
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Route visualization */}
          <svg width="100%" height="120" viewBox="0 0 400 120" fill="none">
            <path
              d="M40 80 Q120 20 200 60 Q280 100 360 40"
              stroke="rgba(7,148,181,0.3)"
              strokeWidth="2"
              strokeDasharray="6 4"
            />
            <path
              d="M40 80 Q120 20 200 60"
              stroke="var(--lasha-cyan)"
              strokeWidth="2"
            />
            <circle cx="40" cy="80" r="6" fill="var(--lasha-lime)" />
            <circle cx="200" cy="60" r="5" fill="var(--lasha-cyan)" />
            <circle cx="360" cy="40" r="6" fill="rgba(255,255,255,0.2)" />
            <text x="40" y="100" fill="rgba(255,255,255,0.5)" fontSize="9" textAnchor="middle">
              Pickup
            </text>
            <text x="200" y="80" fill="var(--lasha-cyan)" fontSize="9" textAnchor="middle">
              In transit
            </text>
            <text x="360" y="60" fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="middle">
              Drop-off
            </text>
          </svg>
          <div className="flex items-center justify-between mt-4">
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
              ETA: 38 minutes
            </span>
            <span
              style={{
                fontSize: 11,
                color: "var(--lasha-lime)",
                fontWeight: 600,
              }}
            >
              ● Live
            </span>
          </div>
        </div>
      </div>
    );
  }

  // delivered
  return (
    <div
      style={{
        background: "var(--lasha-ivory-light)",
        border: "1px solid var(--lasha-border-light)",
        borderRadius: 20,
        padding: 32,
      }}
    >
      <p className="lasha-label" style={{ fontSize: 9, marginBottom: 20, color: "var(--lasha-muted)" }}>
        Delivery Confirmed
      </p>
      <div
        style={{
          background: "#ffffff",
          border: "1px solid var(--lasha-border-light)",
          borderRadius: 16,
          padding: 28,
        }}
      >
        <div className="flex items-center gap-4 mb-5">
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "50%",
              backgroundColor: "rgba(229,243,74,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <CheckCircle size={24} style={{ color: "var(--lasha-lime)" }} strokeWidth={1.5} />
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 700, color: "var(--lasha-navy)" }}>
              Delivered successfully
            </p>
            <p style={{ fontSize: 12, color: "var(--lasha-muted)" }}>
              14:32 SAST — Block F, Soweto
            </p>
          </div>
        </div>
        <div
          style={{
            background: "var(--lasha-ivory)",
            borderRadius: 10,
            padding: "14px 18px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            style={{
              width: 32,
              height: 24,
              borderRadius: 4,
              background: "var(--lasha-ivory-dark)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              color: "var(--lasha-muted)",
            }}
          >
            📷
          </div>
          <span style={{ fontSize: 13, color: "var(--lasha-body-text)" }}>
            Photo proof of delivery attached
          </span>
        </div>
      </div>
    </div>
  );
}

export default function HowItWorks() {
  const [active, setActive] = useState(0);
  const activeStep = steps[active];

  return (
    <section
      id="how-it-works"
      style={{ backgroundColor: "var(--lasha-ivory)", padding: "120px 0" }}
    >
      <div className="lasha-container">
        {/* Technical label */}
        <p className="lasha-label mb-6" style={{ textAlign: "center" }}>
          03 / The Handoff
        </p>

        {/* Heading */}
        <h2
          className="lasha-heading mb-4"
          style={{ textAlign: "center", fontSize: "clamp(36px, 4vw, 58px)" }}
        >
          Deliver in 4 Simple Steps
        </h2>
        <p
          className="lasha-body mb-16"
          style={{ textAlign: "center", maxWidth: 500, margin: "0 auto 64px" }}
        >
          Getting your goods delivered has never been this straightforward.
        </p>

        {/* Two-column layout */}
        <div className="how-grid">
          {/* Step navigation */}
          <div className="flex flex-col gap-3">
            {steps.map((step, i) => {
              const Icon = step.icon;
              const isActive = i === active;
              return (
                <button
                  key={step.number}
                  onClick={() => setActive(i)}
                  style={{
                    background: isActive ? "var(--lasha-navy)" : "transparent",
                    color: isActive ? "#ffffff" : "var(--lasha-body-text)",
                    border: isActive ? "none" : "1px solid var(--lasha-border-light)",
                    borderRadius: 14,
                    padding: "18px 20px",
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    cursor: "pointer",
                    transition: "all 0.25s ease",
                    textAlign: "left",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: isActive ? "var(--lasha-cyan-light)" : "var(--lasha-cyan)",
                      minWidth: 24,
                    }}
                  >
                    {step.number}
                  </span>
                  <Icon size={18} strokeWidth={1.5} style={{ opacity: isActive ? 1 : 0.5 }} />
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{step.title}</span>
                </button>
              );
            })}
          </div>

          {/* Active panel */}
          <div
            style={{
              background: "#ffffff",
              border: "1px solid var(--lasha-border-light)",
              borderRadius: 28,
              padding: 40,
              minHeight: 420,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="lasha-label" style={{ marginBottom: 8 }}>
                  Step {activeStep.number}
                </p>
                <h3
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: "var(--lasha-navy)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {activeStep.title}
                </h3>
              </div>
              <button
                onClick={() => setActive((active + 1) % steps.length)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  background: "var(--lasha-lime)",
                  border: "none",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "transform 0.2s",
                  flexShrink: 0,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "rotate(90deg)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "rotate(0deg)")}
                aria-label="Next step"
              >
                <ArrowRight size={16} style={{ color: "var(--lasha-navy)" }} />
              </button>
            </div>

            <p className="lasha-body" style={{ marginBottom: 32, fontSize: 15 }}>
              {activeStep.description}
            </p>

            <StepVisual visual={activeStep.visual} />
          </div>
        </div>
      </div>

      <style>{`
        .how-grid {
          display: grid;
          grid-template-columns: 320px 1fr;
          gap: 24px;
          align-items: start;
        }
        @media (max-width: 900px) {
          .how-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
}
