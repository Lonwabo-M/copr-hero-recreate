import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import { ArrowRight } from "lucide-react";

interface AuthProps {
  redirectAfterAuth?: string;
}

export default function AuthPage({ redirectAfterAuth = "/dashboard" }: AuthProps) {
  const { signIn } = useAuthActions();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setLoading(true);
    setError("");
    try {
      if (isSignUp) {
        await signIn("password", { email, password, flow: "signUp" });
      } else {
        await signIn("password", { email, password, flow: "signIn" });
      }
      window.location.href = redirectAfterAuth;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Authentication failed";
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
          <p className="lasha-label mb-6">
            {isSignUp ? "Create an account" : "Sign in to your account"}
          </p>
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
            {isSignUp ? "Create your account" : "Welcome back"}
          </h2>
          <p
            className="lasha-body mb-10"
            style={{ fontSize: 15, color: "var(--lasha-muted)" }}
          >
            {isSignUp
              ? "Enter your details to create a new account."
              : "Enter your email and password to access your dashboard."}
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
                marginBottom: 16,
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--lasha-cyan)")}
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = "var(--lasha-border-light)")
              }
            />

            <label
              className="lasha-label"
              style={{ fontSize: 9, color: "var(--lasha-muted)", display: "block", marginBottom: 8 }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              minLength={6}
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
              disabled={loading || !email || !password}
              className="lasha-btn-primary"
              style={{
                width: "100%",
                justifyContent: "center",
                marginTop: 20,
                padding: "14px 28px",
                fontSize: 14,
                opacity: loading || !email || !password ? 0.6 : 1,
                cursor: loading || !email || !password ? "not-allowed" : "pointer",
              }}
            >
              {loading
                ? "Please wait..."
                : isSignUp
                  ? "Create Account"
                  : "Sign In"}
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
            {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setError("");
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
              {isSignUp ? "Sign In" : "Create one"}
            </button>
          </p>

          <p
            style={{
              fontSize: 12,
              color: "var(--lasha-muted)",
              marginTop: 24,
              lineHeight: 1.6,
              textAlign: "center",
            }}
          >
            By continuing, you agree to Lasha's Terms of Service and
            Privacy Policy.
          </p>
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
