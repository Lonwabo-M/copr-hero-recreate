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
        <p className="lasha-label mb-12">
          About Lasha
        </p>

        {/* Header row — heading left, founding line right. The lede hangs from
            the same top edge as the heading (no arbitrary padding-top: the
            shared border-top defines one alignment band for both columns). */}
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

        {/* Feature figure — full-width editorial band above the two-column
            body. The photograph (16:9, object-fit cover) sits inside a fixed-
            aspect frame so the band's height is deterministic and the columns
            below start on a clean, aligned edge. */}
        <div className="about-figure">
          <img
            src="/assets/van-fleet.jpg"
            alt="A Lasha delivery van on route"
            loading="lazy"
          />
          <div className="about-figure-caption">
            <span className="lasha-label" style={{ fontSize: 11 }}>
              The network
            </span>
            <span>
              Vetted local vehicles, moving business goods daily.
            </span>
          </div>
        </div>

        {/* Body grid — copy left, stat rail right. Top edges aligned; the
            stat rail's cards distribute against the copy's height so neither
            column visually outruns the other. */}
        <div className="about-grid">
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
              <p className="lasha-label" style={{ fontSize: 11 }}>
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

          {/* Stat rail — the platform's real numbers, top-aligned with the
              first paragraph and separated by hairlines, not cards-in-cards. */}
          <aside className="about-stats" aria-label="Lasha by the numbers">
            <div className="about-stat">
              <span className="about-stat-value">250 000</span>
              <span className="about-stat-label">
                minibus taxis on South African roads — our idle capacity pool
              </span>
            </div>
            <div className="about-stat">
              <span className="about-stat-value">Same-day</span>
              <span className="about-stat-label">
                delivery windows, scheduled around real business operations
              </span>
            </div>
            <div className="about-stat">
              <span className="about-stat-value">100%</span>
              <span className="about-stat-label">
                of deliveries closed with digital proof of delivery
              </span>
            </div>
            <div className="about-stat">
              <span className="about-stat-value">Live</span>
              <span className="about-stat-label">
                GPS tracking on every vehicle, visible to every customer
              </span>
            </div>
          </aside>
        </div>
      </div>

      <style>{`
        /* ── Header row ─────────────────────────────────────────────── */
        .about-header {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 64px;
          align-items: stretch;
          margin-bottom: 56px;
        }
        .about-lede {
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          line-height: 1.7;
          color: var(--lasha-cyan-light);
          margin: 0;
          max-width: 320px;
          justify-self: end;
          align-self: start;
          text-align: left;
          border-top: 1px solid rgba(255, 255, 255, 0.18);
          padding-top: 18px;
          /* The heading has no top rule — align the lede's first text line
             with the heading's cap height instead of its border. */
          transform: translateY(4px);
        }

        /* ── Feature figure ─────────────────────────────────────────── */
        .about-figure {
          position: relative;
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.12);
          aspect-ratio: 21 / 9;
          margin-bottom: 64px;
          background: var(--lasha-navy-dark);
        }
        .about-figure img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          /* Subtle navy wash keeps the photo inside the section's palette. */
          filter: saturate(0.92);
        }
        .about-figure::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(
            180deg,
            rgba(8, 38, 49, 0.05) 0%,
            rgba(8, 38, 49, 0.55) 100%
          );
          pointer-events: none;
        }
        .about-figure-caption {
          position: absolute;
          left: 28px;
          right: 28px;
          bottom: 22px;
          z-index: 1;
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 24px;
          flex-wrap: wrap;
        }
        .about-figure-caption > span:last-child {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.85);
          font-weight: 500;
        }

        /* ── Body grid ──────────────────────────────────────────────── */
        .about-grid {
          display: grid;
          grid-template-columns: 1.6fr 1fr;
          gap: 72px;
          align-items: start;
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

        /* ── Stat rail ──────────────────────────────────────────────── */
        .about-stats {
          display: flex;
          flex-direction: column;
          border-top: 1px solid rgba(255, 255, 255, 0.14);
          align-self: stretch;
        }
        .about-stat {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 22px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
        }
        .about-stat:last-child {
          border-bottom: none;
        }
        .about-stat-value {
          font-size: 30px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: #ffffff;
          line-height: 1.1;
        }
        .about-stat-label {
          font-size: 13px;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.55);
          max-width: 300px;
        }

        /* ── Responsive ─────────────────────────────────────────────── */
        @media (max-width: 900px) {
          .about-header {
            grid-template-columns: 1fr;
            gap: 32px;
            margin-bottom: 44px;
          }
          .about-lede {
            justify-self: start;
            transform: none;
            max-width: 420px;
          }
          .about-figure {
            aspect-ratio: 16 / 9;
            margin-bottom: 48px;
          }
          .about-figure-caption {
            left: 18px;
            right: 18px;
            bottom: 14px;
          }
          .about-grid {
            grid-template-columns: 1fr;
            gap: 44px;
          }
          .about-stats {
            border-top: none;
          }
          .about-stat {
            padding: 18px 0;
          }
        }
      `}</style>
    </section>
  );
}
