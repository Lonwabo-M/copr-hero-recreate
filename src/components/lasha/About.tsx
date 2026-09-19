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

        {/* Body grid — contained photograph left (4:3, capped width so it never
            dominates the section), narrative copy right. Top edges aligned on
            one shared line; the caption sits under the image like a print
            credit, not overlaid on it. */}
        <div className="about-body">
          <figure className="about-figure">
            <div className="about-figure-frame">
              <img
                src="/assets/van-fleet.jpg"
                alt="A Lasha delivery van on route"
                loading="lazy"
              />
            </div>
            <figcaption className="about-figure-caption">
              <span className="lasha-label" style={{ fontSize: 11 }}>
                The network
              </span>
              <span className="about-figure-note">
                Vetted local vehicles, moving business goods daily.
              </span>
            </figcaption>
          </figure>

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
        </div>

        {/* Stat band — the platform's real numbers as a full-width horizontal
            rail with hairline separators: corporate, scannable, aligned to the
            same container edges as everything above it. */}
        <div className="about-stats" aria-label="Lasha by the numbers">
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

        /* ── Body grid: image + copy ───────────────────────────────── */
        .about-body {
          display: grid;
          grid-template-columns: minmax(320px, 440px) 1fr;
          gap: 64px;
          align-items: start;
          margin-bottom: 72px;
        }

        /* Contained figure — a bounded 4:3 frame with a fixed width cap, so
           the photo reads as one editorial element beside the copy rather
           than a full-width band that outruns the section. */
        .about-figure {
          margin: 0;
          position: sticky;
          top: 96px;
        }
        .about-figure-frame {
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid rgba(255, 255, 255, 0.12);
          aspect-ratio: 4 / 3;
          background: var(--lasha-navy-dark);
        }
        .about-figure-frame img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          /* Subtle navy wash keeps the photo inside the section's palette. */
          filter: saturate(0.94);
        }
        .about-figure-caption {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
          margin-top: 14px;
          padding: 0 2px;
        }
        .about-figure-note {
          font-size: 13px;
          color: rgba(255, 255, 255, 0.6);
          font-weight: 500;
        }

        /* ── Copy column ────────────────────────────────────────────── */
        .about-copy {
          display: flex;
          flex-direction: column;
          gap: 20px;
          padding-top: 4px;
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

        /* ── Stat band — horizontal rail ────────────────────────────── */
        .about-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          border-top: 1px solid rgba(255, 255, 255, 0.14);
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
        }
        .about-stat {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding: 32px 32px 32px 0;
          border-right: 1px solid rgba(255, 255, 255, 0.14);
        }
        .about-stat:nth-child(n + 2) {
          padding-left: 32px;
        }
        .about-stat:last-child {
          border-right: none;
          padding-right: 0;
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
          max-width: 280px;
        }

        /* ── Responsive ─────────────────────────────────────────────── */
        @media (max-width: 1024px) {
          .about-body {
            grid-template-columns: 1fr;
            gap: 40px;
            margin-bottom: 56px;
          }
          .about-figure {
            position: static;
            max-width: 560px;
          }
          .about-stats {
            grid-template-columns: repeat(2, 1fr);
          }
          .about-stat {
            padding: 24px 24px 24px 0;
            border-bottom: 1px solid rgba(255, 255, 255, 0.14);
          }
          .about-stat:nth-child(n + 2) {
            padding-left: 24px;
          }
          .about-stat:nth-child(3),
          .about-stat:nth-child(4) {
            border-bottom: none;
          }
          .about-stat:nth-child(2) {
            border-right: none;
            padding-right: 0;
          }
        }
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
        }
        @media (max-width: 640px) {
          .about-body {
            gap: 32px;
          }
          .about-stats {
            grid-template-columns: 1fr;
          }
          .about-stat {
            padding: 20px 0 !important;
            border-right: none !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.14);
          }
          .about-stat:last-child {
            border-bottom: none;
          }
        }
      `}</style>
    </section>
  );
}
