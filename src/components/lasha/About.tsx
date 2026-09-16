export default function About() {
  return (
    <section
      id="about"
      className="relative overflow-hidden"
      style={{ padding: "120px 0", backgroundColor: "var(--lasha-navy)" }}
    >
      <div className="lasha-container">
        {/* Section label — same placement pattern as every other Lasha
            section ("04 / Sector Intelligence", etc.): first element, top of
            the container, above the content grid. */}
        <p className="lasha-label mb-12" style={{ color: "var(--lasha-cyan-light)" }}>
          About Lasha
        </p>

        <div className="about-grid">
          {/* Left: heading block + editorial figure. */}
          <div className="about-left">
            <h2
              className="lasha-heading lasha-heading-dark"
              style={{ fontSize: "clamp(34px, 3.6vw, 54px)" }}
            >
              Local reach.
              <br />
              Modern visibility.
              <br />
              <span style={{ color: "var(--lasha-cyan)" }}>One delivery network.</span>
            </h2>

            {/* Vehicle image — the fleet cutout sits on a light studio panel
                like a catalog plate: sharp at native resolution, and a
                deliberate contrast against the navy section. */}
            <div className="about-figure">
              <img
                src="/assets/Taxi_image-removebg-preview.png"
                alt="A Lasha delivery taxi"
                loading="lazy"
              />
            </div>
          </div>

          {/* Right: narrative copy */}
          <div className="about-copy">
            <p className="about-lede">
              Founded in the Western Cape, South Africa
            </p>
            <p>
              At Lasha, we believe the future of logistics in South Africa does
              not lie in building more trucks — it lies in unlocking the
              potential of what we already have. Every day, 250 000 minibus
              taxis move millions of people, yet during off-peak and
              post-commute hours, these vehicles sit idle. We asked a simple
              question: what if those same taxis could move goods as well as
              people?
            </p>
            <p>
              That's how our logistics platform was born. By partnering with
              taxi owners and drivers, we are turning underutilized capacity
              into a delivery network that is faster, more flexible, and
              designed for the realities of local business. From FMCG giants to
              spaza shops, we help businesses deliver goods the same day, or on
              a schedule that suits their operations — all with real-time
              tracking, optimized routes, and digital proof of delivery.
            </p>
            <p>
              We are more than a logistics company. We are rethinking how South
              African businesses move, connect, and grow — while creating new
              income streams for taxi owners and strengthening the backbone of
              the township economy.
            </p>

            <div className="about-support">
              <p className="lasha-label" style={{ color: "var(--lasha-cyan-light)", fontSize: 11 }}>
                Support
              </p>
              <p>
                Our vision is strengthened by the support of the Department of
                Science, Technology and Innovation (DTSI), the Technology
                Innovation Agency (TIA), and the Council for Scientific and
                Industrial Research (CSIR) — partners who share our commitment
                to building innovative, locally-rooted solutions that transform
                industries and uplift communities.
              </p>
              <p>
                At the heart of it, our mission is simple: move goods smarter,
                strengthen communities, and build a logistics system truly made
                for Africa.
              </p>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .about-grid {
          display: grid;
          grid-template-columns: 1fr 1.15fr;
          gap: 72px;
          align-items: start;
        }
        .about-left {
          align-self: start;
        }
        .about-figure {
          margin-top: 40px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: linear-gradient(180deg, #f6f8f9 0%, #e9eef0 100%);
          padding: 28px 32px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .about-figure img {
          display: block;
          /* Native resolution — never upscaled, so it stays crisp. */
          width: min(100%, 300px);
          height: auto;
        }
        .about-copy {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .about-copy p {
          font-size: 16px;
          line-height: 1.8;
          color: rgba(255, 255, 255, 0.68);
          margin: 0;
        }
        .about-lede {
          font-size: 13px !important;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--lasha-cyan-light) !important;
          margin-bottom: 4px;
        }
        .about-support {
          border-top: 1px solid rgba(255, 255, 255, 0.12);
          padding-top: 28px;
          margin-top: 12px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        @media (max-width: 900px) {
          .about-grid {
            grid-template-columns: 1fr !important;
            gap: 48px !important;
          }
          .about-left {
            position: static;
          }
          .about-figure {
            margin-top: 28px;
            max-width: 520px;
          }
        }
      `}</style>
    </section>
  );
}
