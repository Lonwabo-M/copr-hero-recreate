import { useMemo } from "react";

// ─── TrustedBy ───────────────────────────────────────────────────────────────
// "Trusted by leading organisations" logo carousel directly below the hero.
// Layout follows the supplied reference: the uppercase title sits on the left
// of the strip, logos scroll in an infinite marquee to its right.
//
// Logos render grayscale by default and regain their full colour on hover.
// Real logo files can be dropped into /public/logos/ later — each entry has an
// img src that renders once the file exists, with a styled text fallback until
// then (no fake logo images).
//
// Partners: CSIR, Welo, TIA, Department of Science and Technology.

interface Partner {
  name: string;
  /** Short mark rendered when no logo file has been uploaded yet. */
  mark: string;
  /** Public path of the uploaded logo (rendered once the file exists). */
  src?: string;
}

const PARTNERS: Partner[] = [
  { name: "CSIR", mark: "CSIR", src: "/assets/CSIR_Logo.png" },
  { name: "Welo", mark: "Welo", src: "/assets/Welo_Logo.jpg" },
  { name: "TIA", mark: "TIA", src: "/assets/tia-logo-1.png" },
  { name: "Department of Science and Technology", mark: "DST", src: "/assets/DSTI_logo.png" },
];

export default function TrustedBy() {
  // Duplicate the list so the marquee loops seamlessly.
  const strip = useMemo(() => [...PARTNERS, ...PARTNERS], []);

  return (
    <section
      aria-label="Trusted by leading organisations"
      style={{
        backgroundColor: "var(--lasha-ivory)",
        borderBottom: "1px solid var(--lasha-border-light)",
        /* Breathing room between the full-height hero and the logo strip. */
        marginTop: 56,
        padding: "28px 0",
        overflow: "hidden",
      }}
    >
      <div className="trustedby-row lasha-container">
        {/* Title — fixed on the left of the strip (reference layout). Dark
            grey per the approved treatment (overrides the cyan label default). */}
        <p
          className="lasha-label"
          style={{
            fontSize: 10,
            whiteSpace: "nowrap",
            marginRight: 40,
            flexShrink: 0,
            color: "#4b5563",
          }}
        >
          Trusted by leading organisations
        </p>

        {/* Marquee strip */}
        <div className="trustedby-viewport">
          <div className="trustedby-track">
            {strip.map((p, i) => (
              <div
                key={`${p.name}-${i}`}
                className="trustedby-tile"
                title={p.name}
                aria-hidden={i >= PARTNERS.length}
              >
                <img
                  src={p.src}
                  alt={p.name}
                  loading="lazy"
                  onError={(e) => {
                    // No logo file uploaded yet → hide the img; the styled text
                    // fallback renders instead. Swap in /public/logos/*.svg
                    // when the real assets are available.
                    const img = e.currentTarget;
                    img.style.display = "none";
                    const fallback = img.nextElementSibling as HTMLElement | null;
                    if (fallback) fallback.style.display = "flex";
                  }}
                />
                <div
                  className="trustedby-fallback"
                  style={{ display: "none" }}
                  aria-hidden="true"
                >
                  <span className="trustedby-fallback-mark">{p.mark}</span>
                  <span className="trustedby-fallback-name">{p.name}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .trustedby-row {
          display: flex;
          align-items: center;
        }
        .trustedby-viewport {
          flex: 1;
          overflow: hidden;
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
          mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent);
        }
        .trustedby-track {
          display: flex;
          align-items: center;
          gap: 72px;
          width: max-content;
          padding-left: 72px;
          animation: trustedby-scroll 32s linear infinite;
        }
        /* NOTE: no hover pause — the marquee keeps scrolling when the user
           hovers so logos are always cycling (per product decision). */
        .trustedby-tile {
          display: flex;
          align-items: center;
          justify-content: center;
          /* Uniform tile: every logo renders at the same visual height (the
             Welo reference) inside an equal box, so the strip reads evenly. */
          height: 40px;
          min-width: 150px;
        }
        /* Grayscale by default, full colour on hover (reference behaviour). */
        .trustedby-tile img,
        .trustedby-fallback-mark {
          filter: grayscale(1);
          opacity: 0.55;
          transition: filter 0.25s ease, opacity 0.25s ease;
        }
        .trustedby-tile:hover img,
        .trustedby-tile:hover .trustedby-fallback-mark {
          filter: grayscale(0);
          opacity: 1;
        }
        .trustedby-tile img {
          /* All logos render at one common visual size: height locked, width
             free so each mark's true proportions are preserved. */
          height: 32px;
          width: auto;
          max-width: 170px;
          object-fit: contain;
        }
        .trustedby-fallback {
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          user-select: none;
        }
        .trustedby-fallback-mark {
          font-size: 20px;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: var(--lasha-navy);
        }
        .trustedby-fallback-name {
          font-size: 9px;
          font-weight: 600;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--lasha-muted);
          max-width: 170px;
          text-align: center;
          line-height: 1.3;
        }
        @keyframes trustedby-scroll {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        @media (max-width: 768px) {
          .trustedby-row {
            flex-direction: column;
            align-items: flex-start;
            gap: 16px;
          }
          .trustedby-row .lasha-label {
            margin-right: 0;
            white-space: normal;
          }
          .trustedby-viewport {
            width: 100%;
          }
        }
      `}</style>
    </section>
  );
}
