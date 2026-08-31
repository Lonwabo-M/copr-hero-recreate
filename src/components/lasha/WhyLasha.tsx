import { ShieldCheck, Route, CircleCheck } from "lucide-react";

const benefits = [
  {
    number: "01",
    icon: ShieldCheck,
    title: "Risk",
    copy: "We derisk your operation. We go where others don't — township streets, informal settlements, and dense urban areas — delivered through a driver network already embedded in those communities.",
  },
  {
    number: "02",
    icon: Route,
    title: "Scale",
    copy: "Infrastructure already on the road: minibus taxis operating daily across South Africa. We turn their idle capacity into your delivery solution.",
  },
  {
    number: "03",
    icon: CircleCheck,
    title: "Reliability",
    copy: "Vetted drivers. Tracked deliveries. Every Lasha driver is onboarded, trained, and verified. Every delivery is confirmed with proof of delivery.",
  },
];

export default function WhyLasha() {
  return (
    <section
      id="why-lasha"
      style={{ backgroundColor: "var(--lasha-ivory)", padding: "120px 0" }}
    >
      <div className="lasha-container">
        {/* Technical label */}
        <p className="lasha-label mb-12">01 / The Operating Edge</p>

        {/* Two-column intro */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 64,
            marginBottom: 80,
          }}
        >
          <div>
            <h2 className="lasha-heading" style={{ fontSize: "clamp(40px, 4vw, 62px)" }}>
              Why use our
              <br />
              <span style={{ color: "var(--lasha-cyan)" }}>platform?</span>
            </h2>
          </div>
          <div className="flex items-end">
            <p className="lasha-body" style={{ maxWidth: 430, fontSize: 17 }}>
              Lasha combines trusted local reach with the visibility and
              accountability modern businesses need to move goods with confidence.
            </p>
          </div>
        </div>

        {/* Three benefit cards */}
        <div
          className="lasha-card"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}
        >
          {benefits.map((b, i) => {
            const Icon = b.icon;
            return (
              <div
                key={b.number}
                style={{
                  padding: 40,
                  borderRight:
                    i < benefits.length - 1
                      ? "1px solid var(--lasha-border-light)"
                      : "none",
                }}
              >
                {/* Number */}
                <span
                  className="lasha-label"
                  style={{ display: "block", marginBottom: 20, fontSize: 12 }}
                >
                  {b.number}
                </span>
                {/* Icon */}
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    backgroundColor: "rgba(7, 148, 181, 0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    marginBottom: 24,
                  }}
                >
                  <Icon size={24} style={{ color: "var(--lasha-cyan)" }} strokeWidth={1.5} />
                </div>
                {/* Title */}
                <h3
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    letterSpacing: "-0.02em",
                    color: "var(--lasha-navy)",
                    marginBottom: 16,
                  }}
                >
                  {b.title}
                </h3>
                {/* Copy */}
                <p className="lasha-body" style={{ fontSize: 15, lineHeight: 1.7 }}>
                  {b.copy}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        @media (max-width: 1024px) {
          #why-lasha .lasha-card {
            grid-template-columns: 1fr !important;
          }
          #why-lasha .lasha-card > div {
            border-right: none !important;
            border-bottom: 1px solid var(--lasha-border-light);
          }
          #why-lasha .lasha-card > div:last-child {
            border-bottom: none;
          }
        }
        @media (max-width: 768px) {
          #why-lasha [style*="grid-template-columns: 1fr 1fr"] {
            grid-template-columns: 1fr !important;
            gap: 32px !important;
          }
        }
      `}</style>
    </section>
  );
}
