export default function About() {
  return (
    <section
      id="about"
      className="relative overflow-hidden"
      style={{ padding: "120px 0", backgroundColor: "var(--lasha-navy)" }}
    >
      <div className="lasha-container">
        {/* Topline — section label and founding line share one baseline row
            ("About Lasha" left, "Founded…" right), so the two read as a
            single aligned band at the top of the section. */}
        <div className="about-topline">
          <p className="lasha-label">About Lasha</p>
          <p className="about-lede">
            Founded in the Western Cape, South Africa
          </p>
        </div>

        <h2
          className="lasha-heading lasha-heading-dark"
          style={{ fontSize: "clamp(34px, 3.6vw, 54px)", marginBottom: 56 }}
        >
          Local reach.
          <br />
          Modern visibility.
          <br />
          <span style={{ color: "var(--lasha-cyan)" }}>One delivery network.</span>
        </h2>

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
          </div>
        </div>

        {/* Support panel — stretched across the full container width so its
            left edge aligns with the photograph's left edge above; label and
            copy sit in a two-column grid at desktop widths. */}
        <div className="about-support">
          <p className="lasha-label" style={{ fontSize: 11 }}>
            Support
          </p>
          <div className="about-support-copy">
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

        {/* Stat band — the platform's real numbers as a full-width horizontal
            rail with hairline separators: corporate, scannable, aligned to the
            same container edges as everything above it. */}
        <div className="about-stats" aria-label="Lasha by the numbers">
          <div className="about-stat">
            <span className="about-stat-index">01</span>
            <span className="about-stat-value">250 000</span>
            <span className="about-stat-tick" aria-hidden="true" />
            <span className="about-stat-label">
              minibus taxis on South African roads — our idle capacity pool
            </span>
          </div>
          <div className="about-stat">
            <span className="about-stat-index">02</span>
            <span className="about-stat-value">Same-day</span>
            <span className="about-stat-tick" aria-hidden="true" />
            <span className="about-stat-label">
              delivery windows, scheduled around real business operations
            </span>
          </div>
          <div className="about-stat">
            <span className="about-stat-index">03</span>
            <span className="about-stat-value">100%</span>
            <span className="about-stat-tick" aria-hidden="true" />
            <span className="about-stat-label">
              of deliveries closed with digital proof of delivery
            </span>
          </div>
          <div className="about-stat">
            <span className="about-stat-index">04</span>
            <span className="about-stat-value">Live</span>
            <span className="about-stat-tick" aria-hidden="true" />
            <span className="about-stat-label">
              GPS tracking on every vehicle, visible to every customer
            </span>
          </div>
        </div>
      </div>

      <style>{`
        /* ── Topline row: label + founding line on one baseline ────── */
        .about-topline {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 24px;
          flex-wrap: wrap;
          margin-bottom: 20px;
        }
        .about-lede {
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          line-height: 1.7;
          color: var(--lasha-cyan-light);
          margin: 0;
        }

        /* ── Body grid: image + copy ───────────────────────────────── */
        .about-body {
          display: grid;
          grid-template-columns: minmax(320px, 440px) 1fr;
          gap: 64px;
          align-items: start;
          margin-bottom: 56px;
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
        /* ── Support band — full container width, label left / copy right,
            left edge flush with the photograph above. */
        .about-support {
          border: 1px solid rgba(67, 184, 212, 0.22);
          background: linear-gradient(180deg, rgba(7, 148, 181, 0.10) 0%, rgba(7, 148, 181, 0.04) 100%);
          border-radius: 16px;
          padding: 28px 32px;
          display: grid;
          grid-template-columns: 180px 1fr;
          gap: 32px;
          align-items: start;
          margin-bottom: 56px;
        }
        .about-support-copy {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .about-support-copy p {
          font-size: 15px;
          line-height: 1.75;
          color: rgba(255, 255, 255, 0.68);
          margin: 0;
        }

        /* ── Stat band — horizontal rail with layered accents: index chips,
            cyan values, a lime tick rule, and a soft corner wash so each
            cell carries colour without turning into a loud card. */
        .about-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          border-top: 1px solid rgba(255, 255, 255, 0.14);
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
        }
        .about-stat {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 32px 32px 32px 28px;
          border-right: 1px solid rgba(255, 255, 255, 0.14);
          overflow: hidden;
          /* Soft cyan wash anchored bottom-left of each cell. */
          background:
            radial-gradient(120% 100% at 0% 100%, rgba(7, 148, 181, 0.10) 0%, rgba(7, 148, 181, 0) 62%);
          transition: background 0.25s ease;
        }
        .about-stat:hover {
          background:
            radial-gradient(120% 100% at 0% 100%, rgba(7, 148, 181, 0.18) 0%, rgba(7, 148, 181, 0) 62%);
        }
        .about-stat:nth-child(n + 2) {
          padding-left: 28px;
        }
        .about-stat:last-child {
          border-right: none;
          padding-right: 0;
        }
        /* Index chip — the platform's numbered-label motif (01 / 02 …). */
        .about-stat-index {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.1em;
          color: var(--lasha-cyan-light);
          line-height: 1;
          padding: 5px 9px;
          border: 1px solid rgba(67, 184, 212, 0.35);
          border-radius: 999px;
          width: fit-content;
          background: rgba(7, 148, 181, 0.12);
        }
        .about-stat-value {
          font-size: 30px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--lasha-cyan-light);
          line-height: 1.1;
        }
        /* Lime tick — a short accent rule bridging value and label, the
           section's one lime note (the brand's highlight colour). */
        .about-stat-tick {
          display: block;
          width: 26px;
          height: 2px;
          background: var(--lasha-lime);
          border-radius: 1px;
          opacity: 0.9;
        }
        .about-stat-label {
          font-size: 13px;
          line-height: 1.6;
          color: rgba(255, 255, 255, 0.6);
          max-width: 280px;
        }

        /* ── Responsive ─────────────────────────────────────────────── */
        @media (max-width: 1024px) {
          .about-body {
            grid-template-columns: 1fr;
            gap: 40px;
            margin-bottom: 44px;
          }
          .about-figure {
            position: static;
            max-width: 560px;
          }
          .about-support {
            grid-template-columns: 1fr;
            gap: 18px;
            margin-bottom: 44px;
          }
          .about-stats {
            grid-template-columns: repeat(2, 1fr);
          }
          .about-stat {
            padding: 24px 24px 24px 24px;
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
            padding-right: 24px;
          }
        }
        @media (max-width: 900px) {
          .about-topline {
            flex-direction: column;
            align-items: flex-start;
            gap: 10px;
          }
        }
        @media (max-width: 640px) {
          .about-body {
            gap: 32px;
          }
          .about-support {
            padding: 22px 20px;
          }
          .about-stats {
            grid-template-columns: 1fr;
          }
          .about-stat {
            padding: 20px 0 20px 20px !important;
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
