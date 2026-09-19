import { ArrowRight } from "lucide-react";

export default function FinalCTA() {
  return (
    <section
      style={{
        backgroundColor: "var(--lasha-navy)",
        padding: "128px 0",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Ambient cyan glow — matches the FAQ section's depth treatment so the
          two closing navy blocks read as one continuous band. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: -200,
          left: "50%",
          transform: "translateX(-50%)",
          width: 640,
          height: 640,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(7,148,181,0.14) 0%, rgba(7,148,181,0) 70%)",
          pointerEvents: "none",
        }}
      />

      <div className="lasha-container" style={{ textAlign: "center", position: "relative" }}>
        <h2
          className="lasha-heading lasha-heading-dark mb-8"
          style={{
            fontSize: "clamp(38px, 4.5vw, 68px)",
            maxWidth: 700,
            marginInline: "auto",
          }}
        >
          Ready to move
          <br />
          <span style={{ color: "var(--lasha-cyan)" }}>goods differently?</span>
        </h2>

        <p
          className="lasha-body mb-12"
          style={{
            color: "rgba(255,255,255,0.55)",
            maxWidth: 480,
            marginInline: "auto",
            fontSize: 17,
            lineHeight: 1.7,
          }}
        >
          Build a faster, more visible and more dependable delivery operation
          with Lasha.
        </p>

        <div className="flex flex-wrap gap-4 justify-center">
          <a href="/auth" className="lasha-btn-primary">
            Get Started
            <ArrowRight size={16} />
          </a>
          <a
            href="/book-demo"
            className="lasha-btn-secondary"
            style={{
              color: "var(--lasha-cyan-light)",
              borderColor: "rgba(7,148,181,0.4)",
            }}
          >
            Talk to Lasha
            <ArrowRight size={14} />
          </a>
        </div>
      </div>
    </section>
  );
}
