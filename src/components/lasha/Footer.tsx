import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
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
      { label: "Help Center", href: "/help" },
      { label: "Contact Us", href: "#about" },
      { label: "Terms of Service", href: "/terms" },
      { label: "Acceptable Use", href: "/acceptable-use" },
      { label: "Privacy Notice", href: "/privacy" },
      { label: "PAIA Manual", href: "/paia" },
      { label: "Your Privacy Rights", href: "/privacy-rights" },
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
  // POPIA s69: the opt-in must be unticked, separate and provable. The server
  // stores the exact wording and notice version with the subscription.
  const [consent, setConsent] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  const subscribe = useMutation(api.privacy.mutations.subscribeToMarketing);

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!consent) {
      setError("Please tick the consent box so we may email you.");
      return;
    }
    setState("busy");
    try {
      await subscribe({ email, companyWebsite: honeypot });
      setState("done");
      setEmail("");
    } catch (err) {
      setState("idle");
      setError(
        err instanceof Error ? err.message : "Could not subscribe. Please try again.",
      );
    }
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
              flexDirection: "column",
              gap: 12,
              maxWidth: 470,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <input
              type="email"
              placeholder="Enter your email"
              required
              aria-label="Email address for product updates"
              autoComplete="email"
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
              disabled={state !== "idle" || !consent}
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
                cursor: state !== "idle" || !consent ? "not-allowed" : "pointer",
                opacity: state !== "idle" || !consent ? 0.55 : 1,
                transition: "background 0.2s, opacity 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#d4e23a")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "var(--lasha-lime)")}
            >
              {state === "done" ? "Subscribed" : state === "busy" ? "Subscribing…" : "Subscribe"}
            </button>
            <div aria-hidden="true" style={{ position: "absolute", left: -9999 }}>
              <label htmlFor="footer-company-website">Company website</label>
              <input
                id="footer-company-website"
                tabIndex={-1}
                autoComplete="off"
                value={honeypot}
                onChange={(e) => setHoneypot(e.target.value)}
              />
            </div>
            </div>

            <label
              style={{
                display: "flex",
                gap: 9,
                alignItems: "flex-start",
                fontSize: 12,
                lineHeight: 1.55,
                color: "rgba(255,255,255,0.55)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                style={{ marginTop: 2, accentColor: "var(--lasha-lime)", width: 14, height: 14 }}
              />
              <span>
                I agree to receive product news and offers from Lasha by email, and I
                can stop them at any time. Read our{" "}
                <a href="/privacy" style={{ color: "rgba(255,255,255,0.8)" }}>
                  Privacy Notice
                </a>
                .
              </span>
            </label>

            {error ? (
              <p role="alert" style={{ fontSize: 12, color: "#ffb4a8" }}>
                {error}
              </p>
            ) : state === "done" ? (
              <p style={{ fontSize: 12, color: "var(--lasha-lime)" }}>
                You&apos;re on the list. Every email will include a way to stop them.
              </p>
            ) : null}
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
            {[
              { label: "Terms", href: "/terms" },
              { label: "Privacy", href: "/privacy" },
              { label: "Cookies", href: "/cookies" },
              { label: "PAIA", href: "/paia" },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
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
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </div>

      <style>{`\n        .footer-columns {\n          display: grid;\n          grid-template-columns: repeat(4, 1fr);\n          gap: 48px;\n        }\n        @media (max-width: 900px) {\n          .footer-columns {\n            grid-template-columns: repeat(2, 1fr);\n          }\n        }\n        @media (max-width: 600px) {\n          .footer-columns {\n            grid-template-columns: 1fr;\n          }\n        }\n      `}</style>
    </footer>
  );
}
