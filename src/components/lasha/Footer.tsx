import { useState } from "react";
import { Phone, Mail, Instagram, Twitter, Facebook } from "lucide-react";

const footerColumns = [
  {
    title: "Company",
    links: [
      { label: "About", href: "#about" },
      { label: "Careers", href: "#" },
      { label: "Press", href: "#" },
      { label: "Partners", href: "#" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help Center", href: "#" },
      { label: "Contact Us", href: "#about" },
      { label: "Terms of Service", href: "#" },
      { label: "Privacy Policy", href: "#" },
    ],
  },
  {
    title: "Product",
    links: [
      { label: "Same-Day Delivery", href: "#how-it-works" },
      { label: "Scheduled Deliveries", href: "#how-it-works" },
      { label: "API Documentation", href: "#" },
      { label: "Business Plans", href: "#who-we-serve" },
    ],
  },
];

export default function Footer() {
  const [email, setEmail] = useState("");

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle subscription
    setEmail("");
  };

  return (
    <footer
      style={{
        backgroundColor: "var(--lasha-navy)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      {/* Newsletter Section */}
      <div
        style={{
          borderBottom: "1px solid rgba(255,255,255,0.10)",
        }}
      >
        <div
          className="lasha-container"
          style={{
            padding: "48px 0",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 24,
          }}
        >
          <h3
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "-0.02em",
            }}
          >
            Subscribe to our newsletter
          </h3>

          <form
            onSubmit={handleSubscribe}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: 320,
                height: 48,
                padding: "0 20px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.20)",
                background: "transparent",
                color: "#ffffff",
                fontSize: 14,
                fontFamily: "Inter, sans-serif",
                outline: "none",
              }}
            />
            <button
              type="submit"
              style={{
                height: 48,
                padding: "0 28px",
                borderRadius: 8,
                border: "none",
                background: "var(--lasha-lime)",
                color: "var(--lasha-navy)",
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "Inter, sans-serif",
                cursor: "pointer",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#d4e23a")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--lasha-lime)")}
            >
              Subscribe
            </button>
          </form>
        </div>
      </div>

      {/* Main Footer Content */}
      <div className="lasha-container" style={{ padding: "64px 0 48px" }}>
        <div className="footer-columns">
          {/* Column links */}
          {footerColumns.map((column) => (
            <div key={column.title}>
              <h4
                className="lasha-label"
                style={{
                  color: "rgba(255,255,255,0.4)",
                  marginBottom: 24,
                  fontSize: 11,
                }}
              >
                {column.title}
              </h4>
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {column.links.map((link) => (
                  <li key={link.label} style={{ marginBottom: 16 }}>
                    <a
                      href={link.href}
                      style={{
                        fontSize: 15,
                        color: "rgba(255,255,255,0.7)",
                        textDecoration: "none",
                        transition: "color 0.2s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = "#ffffff")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = "rgba(255,255,255,0.7)")
                      }
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Contact Column */}
          <div>
            <h4
              className="lasha-label"
              style={{
                color: "rgba(255,255,255,0.4)",
                marginBottom: 24,
                fontSize: 11,
              }}
            >
              Contact
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <a
                href="tel:+27101234567"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  fontSize: 15,
                  color: "rgba(255,255,255,0.7)",
                  textDecoration: "none",
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "#ffffff")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "rgba(255,255,255,0.7)")
                }
              >
                <Phone size={18} strokeWidth={1.5} />
                +27 10 123 4567
              </a>
              <a
                href="mailto:hello@lasha.co.za"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  fontSize: 15,
                  color: "rgba(255,255,255,0.7)",
                  textDecoration: "none",
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "#ffffff")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "rgba(255,255,255,0.7)")
                }
              >
                <Mail size={18} strokeWidth={1.5} />
                hello@lasha.co.za
              </a>
              <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                <a
                  href="#"
                  aria-label="Instagram"
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "#ffffff")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "rgba(255,255,255,0.5)")
                  }
                >
                  <Instagram size={20} strokeWidth={1.5} />
                </a>
                <a
                  href="#"
                  aria-label="Twitter"
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "#ffffff")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "rgba(255,255,255,0.5)")
                  }
                >
                  <Twitter size={20} strokeWidth={1.5} />
                </a>
                <a
                  href="#"
                  aria-label="Facebook"
                  style={{
                    color: "rgba(255,255,255,0.5)",
                    transition: "color 0.2s",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.color = "#ffffff")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.color = "rgba(255,255,255,0.5)")
                  }
                >
                  <Facebook size={20} strokeWidth={1.5} />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Bar */}
      <div
        style={{
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          className="lasha-container"
          style={{
            padding: "24px 0",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
          }}
        >
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.35)" }}>
            © {new Date().getFullYear()} Lasha Logistics. All rights reserved.
          </p>
          <div style={{ display: "flex", gap: 24 }}>
            {["Terms", "Privacy", "Cookies"].map((item) => (
              <a
                key={item}
                href="#"
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.35)",
                  textDecoration: "none",
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = "rgba(255,255,255,0.7)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = "rgba(255,255,255,0.35)")
                }
              >
                {item}
              </a>
            ))}
          </div>
        </div>
      </div>

      <style>{`\n        .footer-columns {\n          display: grid;\n          grid-template-columns: repeat(4, 1fr);\n          gap: 48px;\n        }\n        @media (max-width: 900px) {\n          .footer-columns {\n            grid-template-columns: repeat(2, 1fr);\n          }\n        }\n        @media (max-width: 600px) {\n          .footer-columns {\n            grid-template-columns: 1fr;\n          }\n        }\n      `}</style>
    </footer>
  );
}
