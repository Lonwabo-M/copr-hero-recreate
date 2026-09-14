// ─── LashaLogo ───────────────────────────────────────────────────────────────
// Shared brand component used by the landing navbar and the app shells so the
// logo is ONE system everywhere (previously the landing showed a text-only
// wordmark and the dashboard showed the raw asset with most of it invisible).
//
// The uploaded asset (/assets/21.png) is a 625×625 canvas whose visible mark
// occupies only x:15.68%–82.40%, y:40.48%–59.04% (measured from the alpha
// channel) — a wide ~3.59:1 mark centred in a sea of transparency. Rendering
// the raw file at header sizes therefore showed a sliver of logo inside a big
// empty box, which is why the mark looked tiny. This component crops the
// transparent padding with a clipping frame + oversized inner image, so the
// visible mark fills the frame edge-to-edge at any requested height while the
// aspect ratio stays exact.
//
// A `wordmark` variant appends the "Lasha" word next to the mark for the
// landing navbar (matching its previous typographic treatment). The dashboard
// header renders the mark alone at ~3× the old size.

const FRAME_ASPECT = 417 / 116; // visible mark aspect (from alpha-bbox scan)
const INNER_SCALE = 625 / 417; // inner img width vs frame width (fills frame)
const INNER_LEFT = -15.68; // % of inner img width — crops transparent left
const INNER_TOP = -218.97; // % of inner img height — crops transparent top

export default function LashaLogo({
  height = 84,
  wordmark = false,
  dark = false,
}: {
  /** Rendered height of the visible mark in px (width derives from aspect). */
  height?: number;
  /** Append the "Lasha" wordmark (landing navbar treatment). */
  wordmark?: boolean;
  /** Wordmark colour context: on navy surfaces (landing) vs light (dashboard). */
  dark?: boolean;
}) {
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
          width: height * FRAME_ASPECT,
          overflow: "hidden",
          display: "inline-block",
          flexShrink: 0,
        }}
      >
        <img
          src="/assets/21.png"
          alt=""
          draggable={false}
          style={{
            // Oversized inner image cropped by the frame above — removes the
            // asset's transparent border so the visible mark fills the frame.
            position: "relative",
            display: "block",
            width: `${INNER_SCALE * 100}%`,
            maxWidth: "none",
            height: "auto",
            left: `${INNER_LEFT}%`,
            top: `${INNER_TOP}%`,
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
