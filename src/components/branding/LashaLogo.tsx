// ─── LashaLogo ───────────────────────────────────────────────────────────────
// Shared brand component used by the landing navbar and the app shells so the
// logo is ONE system everywhere (previously the landing showed a text-only
// wordmark and the dashboard showed the raw asset with most of it invisible).
//
// The uploaded assets are 625×625 canvases whose visible mark occupies only a
// narrow horizontal band centred in a sea of transparency (bounds measured
// from each asset's alpha channel). Rendering the raw file at header sizes
// therefore showed a sliver of logo inside a big empty box. This component
// crops the transparent padding with a clipping frame + oversized inner image,
// so the visible mark fills the frame edge-to-edge at any requested height
// while the aspect ratio stays exact.
//
// Two variants, per asset:
//  - "app"     → /assets/21.png — the mark used inside the app shells.
//  - "landing" → /assets/22.png — the landing-page logo asset.
//
// A `wordmark` variant appends the "Lasha" word next to the mark. The assets
// already contain the wordmark, so this is only for text-only contexts.

interface AssetGeometry {
  src: string;
  /** Visible-mark size in canvas pixels (measured from the alpha bbox). */
  visibleWidthPx: number;
  visibleHeightPx: number;
  /** Transparent left margin as % of the canvas width. */
  leftPct: number;
  /** Transparent top margin as % of the canvas height. */
  topPct: number;
}

const CANVAS_SIZE = 625;

const ASSETS: Record<"app" | "landing", AssetGeometry> = {
  // /assets/21.png — visible mark x 15.68%–82.40%, y 40.48%–59.04%
  app: {
    src: "/assets/21.png",
    visibleWidthPx: 417,
    visibleHeightPx: 116,
    leftPct: 15.68,
    topPct: 40.48,
  },
  // /assets/22.png — visible mark x 17.44%–84.32%, y 42.56%–61.28%
  landing: {
    src: "/assets/22.png",
    visibleWidthPx: 418,
    visibleHeightPx: 117,
    leftPct: 17.44,
    topPct: 42.56,
  },
};

export default function LashaLogo({
  height = 84,
  wordmark = false,
  dark = false,
  asset = "app",
}: {
  /** Rendered height of the visible mark in px (width derives from aspect). */
  height?: number;
  /** Append the "Lasha" wordmark (for contexts without the baked-in word). */
  wordmark?: boolean;
  /** Wordmark colour context: on navy surfaces (landing) vs light (dashboard). */
  dark?: boolean;
  /** Which brand asset to render (each cropped to its own measured bounds). */
  asset?: "app" | "landing";
}) {
  const geometry = ASSETS[asset];
  const aspect = geometry.visibleWidthPx / geometry.visibleHeightPx;
  // Inner img width as % of the frame width: the canvas must scale so the
  // visible mark (visibleWidthPx canvas px) fills the frame exactly.
  // ratio = (CANVAS_SIZE / visibleHeightPx) / aspect = CANVAS_SIZE / visibleWidthPx.
  const innerWidthPct = (CANVAS_SIZE / geometry.visibleWidthPx) * 100;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 14,
        lineHeight: 0,
      }}
      aria-label="Lasha"
      role="img"
    >
      <span
        style={{
          height,
          width: height * aspect,
          overflow: "hidden",
          display: "inline-block",
          flexShrink: 0,
        }}
      >
        <img
          src={geometry.src}
          alt=""
          draggable={false}
          style={{
            // Oversized inner image cropped by the frame above — removes the
            // asset's transparent border so the visible mark fills the frame.
            position: "relative",
            display: "block",
            width: `${innerWidthPct}%`,
            maxWidth: "none",
            height: "auto",
            // Image-relative crop — translate % resolves against the element's
            // own box. (`left`/`top` % would resolve against the FRAME instead,
            // which under-shifts the crop and clips the mark's edges.)
            transform: `translate(-${geometry.leftPct}%, -${geometry.topPct}%)`,
            userSelect: "none",
          }}
        />
      </span>
      {wordmark && (
        <span
          className="text-white font-extrabold tracking-tight"
          style={{
            fontFamily: "Inter, sans-serif",
            fontSize: Math.max(22, height * 0.32),
            color: dark ? "#ffffff" : "var(--lasha-navy)",
          }}
        >
          Lasha
        </span>
      )}
    </span>
  );
}
