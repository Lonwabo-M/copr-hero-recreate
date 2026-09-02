import { ShoppingBag, Warehouse, Stethoscope, Store } from "lucide-react";

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

export default function SectorIntelligence() {
  return (
    <section
      id="sector-intelligence"
      style={{ backgroundColor: "var(--lasha-ivory)", padding: "120px 0" }}
    >
      <div className="lasha-container">
        {/* Technical label */}
        <p className="lasha-label mb-12">04 / Sector Intelligence</p>

        {/* Two-column header */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.2fr 1fr",
            gap: 64,
            marginBottom: 64,
            alignItems: "start",
          }}
        >
          <h2
            className="lasha-heading"
            style={{ fontSize: "clamp(40px, 4.5vw, 68px)" }}
          >
            Built for Every
            <br />
            Industry
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

        {/* Four sector cards */}
        <div className="sector-grid">
          {sectors.map((sector) => {
            const Icon = sector.icon;
            return (
              <div key={sector.number} className="sector-card">
                <div className="sector-card-top">
                  <div className="sector-icon">
                    <Icon size={22} strokeWidth={1.5} />
                  </div>
                  <span className="sector-number">{sector.number}</span>
                </div>
                <h3 className="sector-title">{sector.title}</h3>
                <p className="sector-copy">{sector.copy}</p>
              </div>
            );
          })}
        </div>
      </div>

      <style>{`
        .sector-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          border: 1px solid var(--lasha-border-light);
          border-radius: 20px;
          overflow: hidden;
        }

        .sector-card {
          padding: 32px 28px;
          border-right: 1px solid var(--lasha-border-light);
          display: flex;
          flex-direction: column;
          min-height: 260px;
          transition: background 0.2s ease;
        }

        .sector-card:last-child {
          border-right: none;
        }

        .sector-card:hover {
          background: rgba(7, 148, 181, 0.03);
        }

        .sector-card-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          margin-bottom: 40px;
        }

        .sector-icon {
          width: 48px;
          height: 48px;
          border-radius: 14px;
          background: rgba(7, 148, 181, 0.1);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--lasha-cyan);
        }

        .sector-number {
          font-size: 13px;
          font-weight: 500;
          color: var(--lasha-muted);
          font-family: "Inter", monospace;
        }

        .sector-title {
          font-size: 18px;
          font-weight: 700;
          color: var(--lasha-navy);
          letter-spacing: -0.02em;
          margin-bottom: 12px;
        }

        .sector-copy {
          font-size: 14px;
          line-height: 1.65;
          color: var(--lasha-body-text);
          margin-top: auto;
        }

        @media (max-width: 1024px) {
          .sector-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          .sector-card:nth-child(2) {
            border-right: none;
          }
          .sector-card:nth-child(1),
          .sector-card:nth-child(2) {
            border-bottom: 1px solid var(--lasha-border-light);
          }
        }

        @media (max-width: 768px) {
          .sector-grid {
            grid-template-columns: 1fr !important;
          }
          .sector-card {
            border-right: none !important;
            border-bottom: 1px solid var(--lasha-border-light);
            min-height: auto;
          }
          .sector-card:last-child {
            border-bottom: none;
          }
        }

        @media (max-width: 768px) {
          #sector-intelligence [style*="grid-template-columns: 1.2fr"] {
            grid-template-columns: 1fr !important;
            gap: 24px !important;
          }
        }
      `}</style>
    </section>
  );
}
