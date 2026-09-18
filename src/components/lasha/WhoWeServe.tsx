import { Building2, ShoppingBag, ArrowRight, Check } from "lucide-react";

export default function WhoWeServe() {
  return (
    <section
      id="who-we-serve"
      className="relative overflow-hidden"
      style={{ padding: "140px 0", backgroundColor: "var(--lasha-navy)" }}
    >
      <div className="lasha-container">
        {/* Technical label */}
        <p className="lasha-label mb-12">
          02 / Who We Serve
        </p>

        {/* Heading */}
        <h2
          className="lasha-heading lasha-heading-dark mb-8"
          style={{ fontSize: "clamp(40px, 4.5vw, 72px)", maxWidth: 700 }}
        >
          Built for Businesses.
          <br />
          <span style={{ color: "var(--lasha-cyan)" }}>Available for Everyone.</span>
        </h2>

        {/* Supporting copy */}
        <p
          className="lasha-body mb-20"
          style={{
            color: "rgba(255,255,255,0.6)",
            maxWidth: 650,
            fontSize: 17,
            lineHeight: 1.7,
          }}
        >
          From enterprise distribution networks to growing e-commerce teams,
          Lasha makes dependable last-mile logistics available at the scale you
          need.
        </p>

        {/* B2B / B2C cards */}
        <div className="who-grid">
          {/* B2B Card */}
          <div
            style={{
              background: "rgba(5, 57, 69, 0.80)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 28,
              padding: 40,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <Building2 size={24} style={{ color: "var(--lasha-cyan-light)" }} strokeWidth={1.5} />
              <span
                className="lasha-label"
                style={{ fontSize: 11 }}
              >
                B2B Logistics
              </span>
            </div>

            <h3
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "#ffffff",
                marginBottom: 16,
              }}
            >
              Business-to-Business
            </h3>

            <p
              style={{
                fontSize: 15,
                lineHeight: 1.7,
                color: "rgba(255,255,255,0.6)",
                marginBottom: 28,
              }}
            >
              Whether you're an FMCG brand delivering to retailers, a
              pharmaceutical company delivering to clinics, or a courier needing
              township coverage — Lasha gives you the delivery speed and reach
              you don't currently have.
            </p>

            {/* Features */}
            <div className="flex flex-col gap-3 mb-10">
              {[
                "Regular and bulk delivery capacity",
                "Business accounts",
                "Real-time delivery tracking and proof of delivery",
                "API capability for enterprise integrations",
              ].map((f) => (
                <div key={f} className="flex items-start gap-3">
                  <Check
                    size={16}
                    style={{ color: "var(--lasha-lime)", marginTop: 3, flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 14, color: "rgba(255,255,255,0.7)" }}>
                    {f}
                  </span>
                </div>
              ))}
            </div>

            <a href="/auth" className="lasha-btn-primary mt-auto" style={{ alignSelf: "flex-start" }}>
              Enquire for Business
              <ArrowRight size={14} />
            </a>
          </div>

          {/* B2C Card */}
          <div
            style={{
              background: "var(--lasha-ivory)",
              border: "1px solid var(--lasha-border-light)",
              borderRadius: 28,
              padding: 40,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="flex items-center justify-between mb-6">
              <ShoppingBag size={24} style={{ color: "var(--lasha-cyan)" }} strokeWidth={1.5} />
              <span className="lasha-label" style={{ fontSize: 11 }}>
                B2C Access
              </span>
            </div>

            <h3
              style={{
                fontSize: 28,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                color: "var(--lasha-navy)",
                marginBottom: 16,
              }}
            >
              Business-to-Customers
            </h3>

            <p className="lasha-body" style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 28 }}>
              Helping clients like e-commerce businesses deliver orders faster,
              reduce shipping costs, and delight customers with reliable last-mile
              delivery.
            </p>

            {/* Feature callout */}
            <div
              style={{
                background: "var(--lasha-ivory-dark)",
                borderLeft: "3px solid var(--lasha-cyan)",
                borderRadius: "0 12px 12px 0",
                padding: "24px 28px",
                marginBottom: 32,
              }}
            >
              <h4
                style={{
                  fontSize: 15,
                  fontWeight: 700,
                  color: "var(--lasha-navy)",
                  marginBottom: 8,
                }}
              >
                A better delivery experience
              </h4>
              <p style={{ fontSize: 14, lineHeight: 1.65, color: "var(--lasha-body-text)" }}>
                Live tracking, verified drivers, and digital proof of delivery
                from pickup to doorstep.
              </p>
            </div>

            <a
              href="/auth"
              className="lasha-btn-secondary mt-auto"
              style={{ alignSelf: "flex-start" }}
            >
              Get Started
              <ArrowRight size={14} />
            </a>
          </div>
        </div>
      </div>

      <style>{`
        .who-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 20px;
        }
        @media (max-width: 1024px) {
          .who-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </section>
  );
}
