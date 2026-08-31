export default function About() {
  return (
    <section
      id="about"
      className="lasha-overlay relative overflow-hidden"
      style={{ padding: "140px 0" }}
    >
      {/* Background image */}
      <img
        src="https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=1920&q=80"
        alt="South African urban logistics"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: "brightness(0.28) saturate(0.5)" }}
        loading="lazy"
      />

      <div className="lasha-container">
        <div className="about-grid">
          {/* Left: Heading */}
          <div>
            <p className="lasha-label mb-8" style={{ color: "var(--lasha-cyan-light)" }}>
              About Lasha
            </p>
            <h2
              className="lasha-heading lasha-heading-dark"
              style={{ fontSize: "clamp(36px, 4vw, 60px)" }}
            >
              Local reach.
              <br />
              Modern visibility.
              <br />
              <span style={{ color: "var(--lasha-cyan)" }}>One delivery network.</span>
            </h2>
          </div>

          {/* Right: Copy */}
          <div className="flex flex-col gap-8 justify-end">
            <p
              style={{
                fontSize: 17,
                lineHeight: 1.75,
                color: "rgba(255,255,255,0.65)",
                maxWidth: 480,
              }}
            >
              Lasha combines existing local mobility infrastructure with modern
              logistics technology to provide dependable delivery capability
              across South Africa.
            </p>
            <p
              style={{
                fontSize: 17,
                lineHeight: 1.75,
                color: "rgba(255,255,255,0.65)",
                maxWidth: 480,
              }}
            >
              We built Lasha because the infrastructure for reliable, visible,
              scalable delivery already exists on the roads — it just needed a
              platform to connect it with the businesses that need it.
            </p>
            <div
              style={{
                borderTop: "1px solid rgba(255,255,255,0.1)",
                paddingTop: 24,
                marginTop: 8,
              }}
            >
              <p
                className="lasha-label"
                style={{ color: "var(--lasha-cyan-light)", fontSize: 11 }}
              >
                Founded in South Africa
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .about-grid {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 80px;
          align-items: end;
        }
        @media (max-width: 900px) {
          .about-grid {
            grid-template-columns: 1fr !important;
            gap: 48px !important;
          }
        }
      `}</style>
    </section>
  );
}
