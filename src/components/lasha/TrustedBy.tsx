import { useMemo } from "react";

// ─── TrustedBy ───────────────────────────────────────────────────────────────
// "Trusted by" logo carousel directly below the hero. Simple infinite marquee
// (CSS animation, pausable on hover) of the partner logos the user listed.
// Real logo files can be dropped into /public/logos/<file> later — each entry
// below has an img src that renders only if the file exists, with a styled
// text fallback until then (no fake logo images, no mock assets required).
//
// Partners: TIA, CSIR, Welo, Department of Science and Technology.

interface Partner {
  name: string;
  /** Short mark rendered when no logo file has been uploaded yet. */
  mark: string;
  /** Public path of the uploaded logo (rendered once the file exists). */
  src?: string;
}

const PARTNERS: Partner[] = [
  { name: "TIA", mark: "TIA", src: "/logos/tia.svg" },
  { name: "CSIR", mark: "CSIR", src: "/logos/csir.svg" },
  { name: "Welo", mark: "Welo", src: "/logos/welo.svg" },
  { name: "Department of Science and Technology", mark: "DST", src: "/logos/dst.svg" },
];

export default function TrustedBy() {
  // Duplicate the list so the marquee loops seamlessly.
  const strip = useMemo(() => [...PARTNERS, ...PARTNERS], []);

  return (
    <section
      aria-label="Trusted by"
      style={{
        backgroundColor: "#ffffff",
        borderBottom: "1px solid var(--lasha-border-light)",
        padding: "36px 0",
        overflow: "hidden",
      }}
    >
      <div className="lasha-container">
        <p
          className="lasha-label"
          style={{ fontSize: 10, textAlign: "center", marginBottom: 24 }}
        >
          Trusted by
        </p>
      </div>

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
                  // fallback renders instead. Swap in /public/logos/*.svg when
                  // the real assets are available.
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

      <style>{`
        .trustedby-viewport {
          overflow: hidden;
          -webkit-mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
          mask-image: linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent);
        }
        .trustedby-track {
          display: flex;
          gap: 56px;
          width: max-content;
          padding-left: 56px;
          animation: trustedby-scroll 30s linear infinite;
        }
        .trustedby-viewport:hover .trustedby-track {
          animation-play-state: paused;
        }
        .trustedby-tile {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 56px;
          min-width: 150px;
        }
        .trustedby-tile img {
          max-height: 44px;
          max-width: 170px;
          object-fit: contain;
          filter: grayscale(1);
          opacity: 0.6;
          transition: opacity 0.2s ease, filter 0.2s ease;
        }
        .trustedby-tile img:hover {
          filter: grayscale(0);
          opacity: 1;
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
          opacity: 0.55;
          transition: opacity 0.2s ease;
        }
        .trustedby-tile:hover .trustedby-fallback-mark {
          opacity: 1;
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
        @media (prefers-reduced-motion: reduce) {
          .trustedby-track { animation: none; }
        }
      `}</style>
    </section>
  );
}
