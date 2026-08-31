import { ArrowRight } from "lucide-react";

export default function Hero() {
  return (
    <section
      id="hero"
      className="relative min-h-[92vh] flex items-center overflow-hidden"
      style={{ backgroundColor: "var(--lasha-navy)" }}
    >
      {/* Background image with overlay */}
      <div className="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1920&q=80"
          alt="Logistics distribution center"
          className="w-full h-full object-cover"
          style={{ filter: "brightness(0.35) saturate(0.7)" }}
          loading="eager"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,38,49,0.92) 0%, rgba(8,38,49,0.78) 40%, rgba(8,38,49,0.95) 100%)",
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
        </div>
      </div>
    </section>
  );
}
