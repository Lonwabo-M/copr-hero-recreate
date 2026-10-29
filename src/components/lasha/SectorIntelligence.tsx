import { ShoppingBag, Warehouse, Stethoscope, Store, CheckCircle2 } from "lucide-react";

const sectors = [
  {
    number: "01",
    icon: ShoppingBag,
    title: "Retail & E-commerce",
    copy: "From online stores to brick-and-mortar shops, we handle your last-mile delivery with speed and care.",
  },
  {
    number: "02",
    icon: Warehouse,
    title: "FMCG & Distribution",
    copy: "Regular bulk deliveries to retailers, wholesalers, and distribution centres across the country.",
  },
  {
    number: "03",
    icon: Stethoscope,
    title: "Healthcare & Pharma",
    copy: "Temperature-sensitive and time-critical deliveries to clinics, pharmacies, and hospitals.",
  },
  {
    number: "04",
    icon: Store,
    title: "Small Business",
    copy: "Affordable, reliable delivery for startups and growing businesses that need professional logistics.",
  },
];

function SectorCard({ sector }: { sector: (typeof sectors)[number] }) {
  const Icon = sector.icon;
  return (
    <div className="sector-card">
      <div className="sector-icon">
        <Icon size={26} strokeWidth={1.5} />
      </div>
      <h3 className="sector-title">{sector.title}</h3>
      <p className="sector-copy">{sector.copy}</p>
    </div>
  );
}

export default function SectorIntelligence() {
  const left = sectors.slice(0, 2);
  const right = sectors.slice(2);

  return (
    <section
      id="sector-intelligence"
      style={{
        /* Light logo-cyan wash — this is the section's colour variation and
           the one place the brand cyan owns a full canvas, corporate-style. */
        backgroundColor: "#E6F4F8",
        padding: "120px 0",
      }}
    >
      <div className="lasha-container">
        {/* Technical label */}
        <p className="lasha-label lasha-label--ink mb-12">04 / Sector Intelligence</p>

        {/* Two-column header */}
        <div className="sector-header">
          <h2
            className="lasha-heading"
            style={{ fontSize: "clamp(40px, 4.5vw, 68px)" }}
          >
            Built for Every
            <br />
            <span style={{ color: "var(--lasha-cyan)" }}>Industry</span>
          </h2>
          <p
            className="lasha-body"
            style={{
              fontSize: 17,
              lineHeight: 1.7,
              maxWidth: 420,
              paddingTop: 12,
            }}
          >
            From retail to healthcare, Lasha adapts to your sector's unique
            delivery needs.
          </p>
        </div>

        {/* Two cards, a full-height image, two cards. On narrow screens the
            image moves above the cards and they fall into a single column. */}
        <div className="sector-layout">
          <div className="sector-col">
            {left.map((sector) => (
              <SectorCard key={sector.number} sector={sector} />
            ))}
          </div>

          <figure className="sector-visual">
            <img
              src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80"
              alt="A Lasha courier preparing parcels for dispatch in a warehouse"
              loading="lazy"
            />
            <figcaption className="sector-visual-chip">
              <CheckCircle2 size={16} strokeWidth={2.2} />
              Live tracking on every delivery
            </figcaption>
          </figure>

          <div className="sector-col">
            {right.map((sector) => (
              <SectorCard key={sector.number} sector={sector} />
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .sector-header {
          display: grid;
          grid-template-columns: 1.2fr 1fr;
          gap: 64px;
          margin-bottom: 56px;
          align-items: start;
        }

        .sector-layout {
          display: grid;
          grid-template-columns: 1fr 0.92fr 1fr;
          gap: 24px;
          align-items: stretch;
        }

        .sector-col {
          display: flex;
          flex-direction: column;
          gap: 24px;
        }

        .sector-card {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 44px 32px;
          background: #ffffff;
          border: 1px solid rgba(7, 148, 181, 0.14);
          border-radius: 22px;
          transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
        }

        .sector-card:hover {
          transform: translateY(-2px);
          border-color: rgba(7, 148, 181, 0.3);
          box-shadow: 0 18px 40px -26px rgba(8, 38, 49, 0.35);
        }

        .sector-icon {
          width: 58px;
          height: 58px;
          border-radius: 16px;
          background: rgba(7, 148, 181, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--lasha-cyan);
          margin-bottom: 26px;
          transition: background 0.25s ease, color 0.25s ease;
        }
        .sector-card:hover .sector-icon {
          background: var(--lasha-cyan);
          color: #ffffff;
        }

        .sector-title {
          font-size: clamp(21px, 1.8vw, 26px);
          font-weight: 700;
          color: var(--lasha-navy);
          letter-spacing: -0.02em;
          margin-bottom: 14px;
        }

        .sector-copy {
          font-size: 14.5px;
          line-height: 1.7;
          color: var(--lasha-body-text);
          max-width: 34ch;
          margin: 0;
        }

        .sector-visual {
          position: relative;
          margin: 0;
          border-radius: 22px;
          overflow: hidden;
          background: #dfe7f2;
          min-height: 420px;
        }

        .sector-visual img {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          display: block;
        }

        .sector-visual-chip {
          position: absolute;
          left: 18px;
          right: 18px;
          bottom: 18px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          padding: 13px 16px;
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.94);
          backdrop-filter: blur(8px);
          color: var(--lasha-navy);
          font-size: 13px;
          font-weight: 600;
          letter-spacing: -0.01em;
          box-shadow: 0 10px 30px -18px rgba(8, 38, 49, 0.5);
        }
        .sector-visual-chip svg {
          color: #0a7c42;
          flex-shrink: 0;
        }

        @media (max-width: 1024px) {
          .sector-header {
            grid-template-columns: 1fr;
            gap: 24px;
            margin-bottom: 40px;
          }
          .sector-layout {
            grid-template-columns: 1fr 1fr;
          }
          .sector-visual {
            grid-column: 1 / -1;
            grid-row: 1;
            min-height: 380px;
          }
        }

        @media (max-width: 768px) {
          #sector-intelligence {
            padding: 80px 0 !important;
          }
          .sector-layout {
            grid-template-columns: 1fr;
            gap: 16px;
          }
          .sector-col {
            gap: 16px;
          }
          .sector-card {
            padding: 34px 24px;
          }
          .sector-visual {
            min-height: 300px;
          }
        }
      `}</style>
    </section>
  );
}
