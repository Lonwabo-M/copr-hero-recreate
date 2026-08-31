import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

interface AuthProps {
  redirectAfterAuth?: string;
}

export default function AuthPage({ redirectAfterAuth = "/dashboard" }: AuthProps) {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await signIn("password", { email, flow: "signUp" });
      setSent(true);
    } catch {
      // Try sign in if sign up fails
      try {
        await signIn("password", { email, flow: "signIn" });
        setSent(true);
      } catch {
        setLoading(false);
      }
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Left panel — branding */}
      <div
        className="auth-left"
        style={{
          backgroundColor: "var(--lasha-navy)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: 64,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background image */}
        <img
          src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&q=80"
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ filter: "brightness(0.2) saturate(0.5)" }}
          loading="lazy"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg, rgba(8,38,49,0.9) 0%, rgba(8,38,49,0.85) 100%)",
          }}
        />

        <div className="relative z-10 text-center max-w-sm">
          <div className="flex items-center gap-3 justify-center mb-6">
            <span
              style={{
                fontSize: 32,
                fontWeight: 800,
                color: "#ffffff",
                letterSpacing: "-0.03em",
              }}
            >
              Lasha
            </span>
          </div>
          <p
            className="lasha-label"
            style={{ color: "var(--lasha-cyan-light)", marginBottom: 32, fontSize: 10 }}
          >
            Logistics Infrastructure
          </p>
          <h1
            style={{
              fontSize: "clamp(28px, 3vw, 40px)",
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              color: "#ffffff",
              marginBottom: 20,
            }}
          >
            Welcome to{" "}
            <span style={{ color: "var(--lasha-cyan)" }}>Lasha</span>
          </h1>
          <p
            style={{
              fontSize: 15,
              lineHeight: 1.65,
              color: "rgba(255,255,255,0.55)",
              maxWidth: 340,
              marginInline: "auto",
            }}
          >
            Reliable delivery infrastructure connecting businesses to the
            communities they serve.
          </p>
        </div>
      </div>

      {/* Right panel — form */}
      <div
        className="auth-right"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          padding: 64,
          backgroundColor: "var(--lasha-ivory)",
        }}
      >
        <div style={{ width: "100%", maxWidth: 400 }}>
          {sent ? (
            <div>
              <p className="lasha-label mb-6">Check your email</p>
              <h2
                style={{
                  fontSize: 28,
                  fontWeight: 700,
                  letterSpacing: "-0.02em",
                  color: "var(--lasha-navy)",
                  marginBottom: 16,
                }}
              >
                We've sent you a link
              </h2>
              <p className="lasha-body" style={{ fontSize: 15 }}>
                Check <strong>{email}</strong> for a sign-in link to access your
                dashboard.
              </p>
            </div>
          ) : (
            <div>
              <p className="lasha-label mb-6">Sign in or create an account</p>
              <h2
                style={{
                  fontSize: "clamp(28px, 3vw, 36px)",
                  fontWeight: 700,
                  letterSpacing: "-0.03em",
                  color: "var(--lasha-navy)",
                  lineHeight: 1.1,
                  marginBottom: 12,
                }}
              >
                Enter your email to
                <br />
                get started
              </h2>
              <p
                className="lasha-body mb-10"
                style={{ fontSize: 15, color: "var(--lasha-muted)" }}
              >
                We'll send you a magic link — no password needed.
              </p>

              <form onSubmit={handleSubmit}>
                <label
                  className="lasha-label"
                  style={{ fontSize: 9, color: "var(--lasha-muted)", display: "block", marginBottom: 8 }}
                >
                  Email address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.co.za"
                  required
                  style={{
                    width: "100%",
                    padding: "14px 18px",
                    fontSize: 15,
                    fontFamily: "Inter, sans-serif",
                    color: "var(--lasha-navy)",
                    backgroundColor: "#ffffff",
                    border: "1px solid var(--lasha-border-light)",
                    borderRadius: 12,
                    outline: "none",
                    transition: "border-color 0.2s",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--lasha-cyan)")}
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = "var(--lasha-border-light)")
                  }
                />

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="lasha-btn-primary"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    marginTop: 16,
                    padding: "14px 28px",
                    fontSize: 14,
                    opacity: loading || !email ? 0.6 : 1,
                    cursor: loading || !email ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Sending link..." : "Continue"}
                  {!loading && <ArrowRight size={16} />}
                </button>
              </form>

              <p
                style={{
                  fontSize: 12,
                  color: "var(--lasha-muted)",
                  marginTop: 24,
                  lineHeight: 1.6,
                }}
              >
                By continuing, you agree to Lasha's Terms of Service and
                Privacy Policy.
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .auth-left {
            display: none !important;
          }
          .auth-right {
            padding: 32px 24px !important;
          }
        }
      `}</style>
    </div>
  );
}
