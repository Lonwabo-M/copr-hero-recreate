import { ArrowRight, MapPin } from "lucide-react";
import { useNavigate } from "react-router";

export default function Hero() {
  const navigate = useNavigate();

  const handleGuestAccess = () => {
    sessionStorage.setItem("lasha_guest", "true");
    navigate("/dashboard");
  };

  return (
    <section
      id="hero"
      className="relative min-h-[92vh] flex items-center overflow-hidden"
      style={{ backgroundColor: "var(--lasha-navy)" }}
    >
      {/* Background image with overlay */}
      <div className="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1570125909232-eb263c188f7e?w=1920&q=80"
          alt="South African logistics delivery"
          className="w-full h-full object-cover object-center"
          style={{ filter: "brightness(0.3) saturate(0.65)" }}
          loading="eager"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,38,49,0.88) 0%, rgba(8,38,49,0.72) 40%, rgba(8,38,49,0.92) 100%)",
          }}
        />
      </div>

      <div className="lasha-container relative z-10 pt-32 pb-24 w-full">
        <div className="max-w-[900px]">
          {/* Technical label */}
          <p className="lasha-label mb-6" style={{ color: "var(--lasha-cyan-light)" }}>
            Logistics Infrastructure
          </p>

          {/* Main heading */}
          <h1 className="lasha-heading lasha-heading-dark mb-8" style={{ maxWidth: 780 }}>
            The logistics infrastructure built for the way{" "}
            <span style={{ color: "var(--lasha-cyan)" }}>South Africa</span> moves.
          </h1>

          {/* Supporting copy */}
          <p
            className="lasha-body mb-12"
            style={{ color: "rgba(255,255,255,0.65)", maxWidth: 540, fontSize: 18, lineHeight: 1.7 }}
          >
            Reliable last-mile delivery infrastructure connecting businesses to
            the communities they serve.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap gap-4 items-center">
            <a href="/auth" className="lasha-btn-primary">
              Get Started
              <ArrowRight size={16} />
            </a>
            <button onClick={handleGuestAccess} className="lasha-btn-secondary" style={{ color: "var(--lasha-cyan-light)", borderColor: "rgba(7,148,181,0.5)" }}>
              Guest Access
              <ArrowRight size={14} />
            </button>
            <button
              onClick={() =>
                document.querySelector("#how-it-works")?.scrollIntoView({ behavior: "smooth" })
              }
              className="lasha-btn-secondary"
              style={{ color: "var(--lasha-cyan-light)", borderColor: "rgba(7,148,181,0.5)" }}
            >
              Track Shipment
              <ArrowRight size={14} />
            </button>
          </div>

          {/* Pilot coverage note — bottom of the hero */}
          <div
            style={{
              marginTop: 48,
              maxWidth: 520,
              display: "flex",
              gap: 14,
              borderLeft: "2px solid var(--lasha-cyan)",
              paddingLeft: 16,
              alignItems: "flex-start",
            }}
          >
            <MapPin size={16} style={{ color: "var(--lasha-cyan)", flexShrink: 0, marginTop: 3 }} />
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.6,
                color: "rgba(255,255,255,0.6)",
                margin: 0,
              }}
            >
              <strong style={{ color: "#ffffff", fontWeight: 700 }}>
                Pilot coverage:
              </strong>{" "}
              Western Cape (Cape Winelands to Cape Metro) and Gauteng (East Rand)
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
