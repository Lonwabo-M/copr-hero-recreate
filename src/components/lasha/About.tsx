export default function About() {
  return (
    <section
      id="about"
      className="relative overflow-hidden"
      style={{ padding: "120px 0", backgroundColor: "var(--lasha-navy)" }}
    >
      <div className="lasha-container">
        {/* Section label — identical placement pattern to every other Lasha
            section ("04 / Sector Intelligence", etc.): first element, top of
            the container, above the content grid. */}
        <p className="lasha-label mb-12" style={{ color: "var(--lasha-cyan-light)" }}>
          About Lasha
        </p>

        {/* Two-column header — heading left, lede right, top-aligned so the
            first lines of both columns sit on the same optical band. This is
            the same header grammar as "04 / Sector Intelligence". */}
        <div className="about-header">
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
          <p className="about-lede">
            Founded in the Western Cape, South Africa
          </p>
        </div>

        {/* Content grid — the fleet cutout hangs from the same top edge as
            the narrative column and its bottom edge is balanced against the
            copy (not stretched), so neither column outruns the other. */}
        <div className="about-grid">
          {/* Left: editorial figure (catalog plate). */}
          <div className="about-left">
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
        /* ── Header row ─────────────────────────────────────────────── */
        .about-header {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 64px;
          align-items: start;
          margin-bottom: 72px;
        }
        .about-lede {
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          line-height: 1.7;
          color: var(--lasha-cyan-light);
          /* Optical baseline: nudge down so the lede's first line sits on
             the same band as the heading's cap height. */
          padding-top: 14px;
          margin: 0;
          max-width: 320px;
          justify-self: end;
          text-align: left;
          border-top: 1px solid rgba(255, 255, 255, 0.14);
          padding-top: 18px;
        }

        /* ── Content grid ───────────────────────────────────────────── */
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
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: linear-gradient(180deg, #f6f8f9 0%, #e9eef0 100%);
          padding: 32px;
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

        /* ── Copy column ────────────────────────────────────────────── */
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
        .about-support {
          border: 1px solid rgba(67, 184, 212, 0.22);
          background: linear-gradient(180deg, rgba(7, 148, 181, 0.10) 0%, rgba(7, 148, 181, 0.04) 100%);
          border-radius: 16px;
          padding: 28px;
          margin-top: 16px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        /* ── Responsive ─────────────────────────────────────────────── */
        @media (max-width: 900px) {
          .about-header {
            grid-template-columns: 1fr;
            gap: 32px;
            margin-bottom: 56px;
          }
          .about-lede {
            justify-self: start;
            padding-top: 14px;
            max-width: 420px;
          }
          .about-grid {
            grid-template-columns: 1fr;
            gap: 48px;
          }
          .about-figure {
            max-width: 520px;
            margin-inline: auto;
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}
