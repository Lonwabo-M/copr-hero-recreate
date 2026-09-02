import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { ArrowRight, ArrowLeft } from "lucide-react";

interface AuthProps {
  redirectAfterAuth?: string;
}

export default function AuthPage({ redirectAfterAuth = "/dashboard" }: AuthProps) {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [error, setError] = useState("");

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    setError("");
    try {
      await signIn("email-otp", { email, flow: "signUp" });
      setOtpSent(true);
    } catch (err: unknown) {
      // Try signIn flow if signUp fails
      try {
        await signIn("email-otp", { email, flow: "signIn" });
        setOtpSent(true);
      } catch (err2: unknown) {
        const message = err2 instanceof Error ? err2.message : "Failed to send code";
        setError(message);
      }
    }
    setLoading(false);
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || otp.length < 4) return;
    setLoading(true);
    setError("");
    try {
      await signIn("email-otp", { email, code: otp });
      window.location.href = redirectAfterAuth;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Invalid code";
      setError(message);
      setLoading(false);
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
          {!otpSent ? (
            /* Step 1: Enter email */
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
                We'll send you a verification code — no password needed.
              </p>

              {error && (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    backgroundColor: "#fef2f2",
                    border: "1px solid #fecaca",
                    marginBottom: 20,
                  }}
                >
                  <p style={{ fontSize: 13, color: "#b91c1c" }}>{error}</p>
                </div>
              )}

              <form onSubmit={handleSendOtp}>
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
                  {loading ? "Sending code..." : "Continue"}
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
          ) : (
            /* Step 2: Enter OTP code */
            <div>
              <button
                onClick={() => {
                  setOtpSent(false);
                  setOtp("");
                  setError("");
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "none",
                  border: "none",
                  color: "var(--lasha-cyan)",
                  fontFamily: "Inter, sans-serif",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                  padding: 0,
                  marginBottom: 24,
                }}
              >
                <ArrowLeft size={14} />
                Back
              </button>

              <p className="lasha-label mb-6">Verification code</p>
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
                Check your inbox
              </h2>
              <p
                className="lasha-body mb-10"
                style={{ fontSize: 15, color: "var(--lasha-muted)" }}
              >
                We sent a 6-digit code to <strong>{email}</strong>. Enter it
                below to continue.
              </p>

              {error && (
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: 10,
                    backgroundColor: "#fef2f2",
                    border: "1px solid #fecaca",
                    marginBottom: 20,
                  }}
                >
                  <p style={{ fontSize: 13, color: "#b91c1c" }}>{error}</p>
                </div>
              )}

              <form onSubmit={handleVerifyOtp}>
                <label
                  className="lasha-label"
                  style={{ fontSize: 9, color: "var(--lasha-muted)", display: "block", marginBottom: 8 }}
                >
                  Verification code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  required
                  maxLength={6}
                  autoFocus
                  style={{
                    width: "100%",
                    padding: "14px 18px",
                    fontSize: 22,
                    fontFamily: "Inter, monospace",
                    letterSpacing: "0.2em",
                    color: "var(--lasha-navy)",
                    backgroundColor: "#ffffff",
                    border: "1px solid var(--lasha-border-light)",
                    borderRadius: 12,
                    outline: "none",
                    transition: "border-color 0.2s",
                    boxSizing: "border-box",
                    textAlign: "center",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--lasha-cyan)")}
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor = "var(--lasha-border-light)")
                  }
                />

                <button
                  type="submit"
                  disabled={loading || otp.length < 4}
                  className="lasha-btn-primary"
                  style={{
                    width: "100%",
                    justifyContent: "center",
                    marginTop: 16,
                    padding: "14px 28px",
                    fontSize: 14,
                    opacity: loading || otp.length < 4 ? 0.6 : 1,
                    cursor: loading || otp.length < 4 ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Verifying..." : "Sign In"}
                  {!loading && <ArrowRight size={16} />}
                </button>
              </form>

              <p
                style={{
                  fontSize: 13,
                  color: "var(--lasha-muted)",
                  marginTop: 20,
                  textAlign: "center",
                }}
              >
                Didn't receive a code?{" "}
                <button
                  onClick={async () => {
                    setLoading(true);
                    setError("");
                    try {
                      await signIn("email-otp", { email, flow: "signUp" });
                    } catch {
                      try {
                        await signIn("email-otp", { email, flow: "signIn" });
                      } catch {
                        // ignore
                      }
                    }
                    setLoading(false);
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--lasha-cyan)",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "Inter, sans-serif",
                    fontSize: 13,
                    padding: 0,
                  }}
                >
                  Resend code
                </button>
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
