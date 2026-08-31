const footerLinks = [
  { label: "Why Lasha", href: "#why-lasha" },
  { label: "Who We Serve", href: "#who-we-serve" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "About", href: "#about" },
  { label: "Track Shipment", href: "#how-it-works" },
  { label: "Contact", href: "#about" },
];

export default function Footer() {
  return (
    <footer
      style={{
        backgroundColor: "var(--lasha-navy-dark)",
        padding: "64px 0 40px",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div className="lasha-container">
        <div className="footer-grid">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <span
                style={{
                  fontSize: 20,
                  fontWeight: 800,
                  color: "#ffffff",
                  letterSpacing: "-0.02em",
                }}
              >
                Lasha
              </span>
            </div>
            <p
              className="lasha-label"
              style={{
                color: "rgba(255,255,255,0.3)",
                fontSize: 10,
              }}
            >
              Logistics Infrastructure
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {footerLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.5)",
                  textDecoration: "none",
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#ffffff")}
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "rgba(255,255,255,0.5)")
                }
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.08)",
            marginTop: 48,
            paddingTop: 24,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.3)" }}>
            © {new Date().getFullYear()} Lasha. All rights reserved.
          </p>
          <div className="flex gap-6">
            {["Privacy Policy", "Terms of Service"].map((item) => (
              <span
                key={item}
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.3)",
                  cursor: "pointer",
                }}
              >
                {item}
              </span>
            ))}
          </div>
        </div>
      </div>

      <style>{`
        .footer-grid {
          display: grid;
          grid-template-columns: 1fr 2fr;
          gap: 64px;
          align-items: start;
        }
        @media (max-width: 768px) {
          .footer-grid {
            grid-template-columns: 1fr !important;
            gap: 32px !important;
          }
        }
      `}</style>
    </footer>
  );
}
