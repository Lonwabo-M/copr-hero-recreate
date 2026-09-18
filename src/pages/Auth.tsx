import { useAuthActions } from "@convex-dev/auth/react";
import { useEffect, useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router";
import { ArrowRight, ArrowLeft, Eye, EyeOff } from "lucide-react";

type Mode = "login" | "signup" | "forgot" | "reset";

interface AuthProps {
  /** Fallback when no ?returnTo= is present. Post-auth role resolution then
   *  happens at /post-auth (see main.tsx) so drivers land in the Driver App,
   *  operations users in the Operations Centre, customers in the portal. */
  redirectAfterAuth?: string;
}

const PASSWORD_MIN_LENGTH = 8;

function validateEmail(email: string): string | null {
  if (!email.trim()) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return "Enter a valid email address";
  }
  return null;
}

function validateNewPassword(password: string, confirm: string): string | null {
  if (!password) return "Password is required";
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  if (password !== confirm) return "Passwords do not match";
  return null;
}

/** User-safe auth error mapping — never surfaces provider internals,
 *  database IDs, or configuration. */
function safeAuthError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : "";
  if (
    message.toLowerCase().includes("usage limit") ||
    message.toLowerCase().includes("exceeded a configured")
  ) {
    return "Platform database is paused (usage limit reached). Sign-in is unavailable until the limit is raised in the Convex dashboard settings.";
  }
  if (message.includes("already exists")) return "An account with this email already exists";
  if (message.includes("Invalid credentials") || message.includes("InvalidSecret")) {
    return "Invalid email or password";
  }
  if (message.includes("InvalidAccountId")) return "Invalid email or password";
  if (message.includes("TooManyFailedAttempts")) {
    return "Too many attempts. Please try again later.";
  }
  if (message.toLowerCase().includes("password")) {
    return message.length < 120 ? message : "Password does not meet requirements";
  }
  if (message.includes("not configured")) {
    return "Service temporarily unavailable. Please try again later.";
  }
  return fallback;
}

export default function AuthPage({ redirectAfterAuth = "/post-auth" }: AuthProps) {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Preserve the exact deep-link the user was trying to reach (set by
  // RequireAuth/RoleGate as ?returnTo=...).
  const returnTo = searchParams.get("returnTo");
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "login";

  const [mode, setMode] = useState<Mode>(initialMode);

  // The login form links to /auth?mode=signup and vice versa. React Router
  // re-renders this same mounted component on that navigation (no remount),
  // so `mode` initialized once from useState never updates — the signup form
  // only appeared after a manual browser refresh. Sync the mode with the URL
  // so clicking "Create account" / "Sign in" switches the form immediately.
  useEffect(() => {
    const next = searchParams.get("mode") === "signup" ? "signup" : "login";
    setMode((current) => (current === next ? current : next));
  }, [searchParams]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const goTo = (next: Mode) => {
    setMode(next);
    setError("");
    setNotice("");
    setPassword("");
    setConfirmPassword("");
    if (next === "forgot" || next === "login") setResetCodeSent(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailError = validateEmail(email);
    if (emailError || !password) {
      setError(emailError ?? "Password is required");
      return;
    }
    setLoading(true);
    setError("");
    try {
      // signIn resolves only after the session token is stored (Convex Auth
      // contract), so client-side navigation is safe here — a full page
      // reload would re-download the bundle and add seconds of latency.
      await signIn("password", { email: email.trim(), password, flow: "signIn" });
      navigate(returnTo ?? redirectAfterAuth, { replace: true });
    } catch (err: unknown) {
      setError(safeAuthError(err, "Invalid email or password"));
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailError = validateEmail(email);
    const passwordError = validateNewPassword(password, confirmPassword);
    const firstError = emailError ?? passwordError;
    if (firstError) {
      setError(firstError);
      return;
    }
    setLoading(true);
    setError("");
    try {
      await signIn("password", {
        email: email.trim(),
        password,
        flow: "signUp",
      });
      navigate(returnTo ?? redirectAfterAuth, { replace: true });
    } catch (err: unknown) {
      setError(safeAuthError(err, "Could not create your account"));
      setLoading(false);
    }
  };

  // Step 1 of reset: email the user a 6-digit code (provider "reset" flow).
  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailError = validateEmail(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    setLoading(true);
    setError("");
    try {
      await signIn("password", { email: email.trim(), flow: "reset" });
      setResetCodeSent(true);
      setNotice("If an account exists for this email, a reset code has been sent.");
      setLoading(false);
    } catch (err: unknown) {
      // Never reveal whether the email exists.
      setError(safeAuthError(err, "Could not start password reset"));
      setLoading(false);
    }
  };

  // Step 2 of reset: verify the emailed code and set the new password
  // (provider "reset-verification" flow).
  const handleCompleteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetCode || resetCode.length < 4) {
      setError("Enter the code from your email");
      return;
    }
    const passwordError = validateNewPassword(password, confirmPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }
    setLoading(true);
    setError("");
    try {
      await signIn("password", {
        email: email.trim(),
        code: resetCode,
        newPassword: password,
        flow: "reset-verification",
      });
      // Reset signs the user in — continue to their role-aware destination.
      navigate(returnTo ?? redirectAfterAuth, { replace: true });
    } catch (err: unknown) {
      setError(safeAuthError(err, "Invalid or expired reset code"));
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
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
  };

  const errorBox = error && (
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
  );

  const noticeBox = notice && (
    <div
      style={{
        padding: "12px 16px",
        borderRadius: 10,
        backgroundColor: "#f0fdfa",
        border: "1px solid #99f6e4",
        marginBottom: 20,
      }}
    >
      <p style={{ fontSize: 13, color: "#0f766e" }}>{notice}</p>
    </div>
  );

  const passwordField = (
    <>
      <label
        className="lasha-label"
        style={{ fontSize: 9, color: "var(--lasha-muted)", display: "block", marginBottom: 8 }}
      >
        Password
      </label>
      <div style={{ position: "relative" }}>
        <input
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          style={inputStyle}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--lasha-cyan)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--lasha-border-light)")}
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          style={{
            position: "absolute",
            right: 14,
            top: "50%",
            transform: "translateY(-50%)",
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--lasha-muted)",
            padding: 4,
            display: "flex",
          }}
        >
          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    </>
  );

  const submitButton = (label: string, busyLabel: string, disabled: boolean) => (
    <button
      type="submit"
      disabled={loading || disabled}
      className="lasha-btn-primary"
      style={{
        width: "100%",
        justifyContent: "center",
        marginTop: 16,
        padding: "14px 28px",
        fontSize: 14,
        opacity: loading || disabled ? 0.6 : 1,
        cursor: loading || disabled ? "not-allowed" : "pointer",
      }}
    >
      {loading ? busyLabel : label}
      {!loading && <ArrowRight size={16} />}
    </button>
  );

  const backToLoginLink = (
    <button
      type="button"
      onClick={() => goTo("login")}
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
      Back to sign in
    </button>
  );

  let form: React.ReactNode;
  if (mode === "login") {
    form = (
      <div>
        <p className="lasha-label mb-6">Sign in</p>
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
          Welcome back to
          <br />
          Lasha
        </h2>
        <p
          className="lasha-body mb-10"
          style={{ fontSize: 15, color: "var(--lasha-muted)" }}
        >
          Sign in with your email and password.
        </p>

        {errorBox}

        <form onSubmit={handleLogin}>
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
            autoComplete="email"
            style={{ ...inputStyle, marginBottom: 16 }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--lasha-cyan)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--lasha-border-light)")}
          />
          {passwordField}
          {submitButton("Sign In", "Signing in...", !email || !password)}
        </form>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginTop: 20,
            fontSize: 13,
          }}
        >
          <button
            type="button"
            onClick={() => goTo("forgot")}
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
            Forgot password?
          </button>
          <Link
            to="/auth?mode=signup"
            style={{
              color: "var(--lasha-cyan)",
              fontWeight: 600,
              textDecoration: "none",
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
            }}
          >
            Create account
          </Link>
        </div>

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

        <DevQuickSignIn onError={setError} setLoading={setLoading} />
      </div>
    );
  } else if (mode === "signup") {
    form = (
      <div>
        {backToLoginLink}
        <p className="lasha-label mb-6">Create your account</p>
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
          Get started with
          <br />
          Lasha
        </h2>
        <p
          className="lasha-body mb-10"
          style={{ fontSize: 15, color: "var(--lasha-muted)" }}
        >
          One account with an email and password — no codes required.
        </p>

        {errorBox}

        <form onSubmit={handleSignUp}>
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
            autoComplete="email"
            style={{ ...inputStyle, marginBottom: 16 }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--lasha-cyan)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--lasha-border-light)")}
          />
          {passwordField}
          <>
            <label
              className="lasha-label"
              style={{ fontSize: 9, color: "var(--lasha-muted)", display: "block", margin: "16px 0 8px" }}
            >
              Confirm password
            </label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--lasha-cyan)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--lasha-border-light)")}
            />
            <p style={{ fontSize: 12, color: "var(--lasha-muted)", marginTop: 10 }}>
              At least {PASSWORD_MIN_LENGTH} characters.
            </p>
          </>
          {submitButton("Create Account", "Creating account...", !email || !password || !confirmPassword)}
        </form>

        <p
          style={{
            fontSize: 13,
            color: "var(--lasha-muted)",
            marginTop: 20,
            textAlign: "center",
          }}
        >
          Already have an account?{" "}
          <Link
            to="/auth"
            style={{
              color: "var(--lasha-cyan)",
              fontWeight: 600,
              textDecoration: "none",
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
            }}
          >
            Sign in
          </Link>
        </p>
      </div>
    );
  } else if (mode === "forgot") {
    form = (
      <div>
        {backToLoginLink}
        <p className="lasha-label mb-6">Password reset</p>
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
          Forgot your
          <br />
          password?
        </h2>
        <p
          className="lasha-body mb-10"
          style={{ fontSize: 15, color: "var(--lasha-muted)" }}
        >
          Enter your account email and we'll send you a reset code.
        </p>

        {errorBox}
        {noticeBox}

        <form onSubmit={handleRequestReset}>
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
            autoComplete="email"
            style={inputStyle}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--lasha-cyan)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--lasha-border-light)")}
          />
          {submitButton("Send Reset Code", "Sending...", !email)}
        </form>

        {resetCodeSent && (
          <button
            type="button"
            onClick={() => {
              setMode("reset");
              setError("");
              setNotice("");
              setPassword("");
              setConfirmPassword("");
            }}
            className="lasha-btn-primary"
            style={{
              width: "100%",
              justifyContent: "center",
              marginTop: 12,
              padding: "14px 28px",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            I have a code
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    );
  } else {
    form = (
      <div>
        <button
          type="button"
          onClick={() => goTo("forgot")}
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

        <p className="lasha-label mb-6">Reset code</p>
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
          Set a new
          <br />
          password
        </h2>
        <p
          className="lasha-body mb-10"
          style={{ fontSize: 15, color: "var(--lasha-muted)" }}
        >
          Enter the code sent to <strong>{email}</strong> and choose a new
          password.
        </p>

        {errorBox}

        <form onSubmit={handleCompleteReset}>
          <label
            className="lasha-label"
            style={{ fontSize: 9, color: "var(--lasha-muted)", display: "block", marginBottom: 8 }}
          >
            Reset code
          </label>
          <input
            type="text"
            inputMode="numeric"
            value={resetCode}
            onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            required
            maxLength={6}
            autoFocus
            style={{
              ...inputStyle,
              fontSize: 22,
              fontFamily: "Inter, monospace",
              letterSpacing: "0.2em",
              textAlign: "center",
              marginBottom: 16,
            }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--lasha-cyan)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--lasha-border-light)")}
          />
          {passwordField}
          <>
            <label
              className="lasha-label"
              style={{ fontSize: 9, color: "var(--lasha-muted)", display: "block", margin: "16px 0 8px" }}
            >
              Confirm new password
            </label>
            <input
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="new-password"
              style={inputStyle}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--lasha-cyan)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--lasha-border-light)")}
            />
          </>
          {submitButton("Set New Password", "Updating...", !resetCode || !password || !confirmPassword)}
        </form>
      </div>
    );
  }

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
          position: "relative",
        }}
      >
        {/* Abort sign-in → back to the public landing page. Quiet text link:
            the word "Home" with an arrow, no pill/button chrome. */}
        <Link
          to="/"
          aria-label="Back to home"
          className="auth-home-link"
        >
          <ArrowLeft size={15} strokeWidth={2} />
          Home
        </Link>
        <div style={{ width: "100%", maxWidth: 400 }}>{form}</div>
      </div>

      <style>{`
        .auth-home-link {
          position: absolute;
          top: 30px;
          left: 34px;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          background: none;
          border: none;
          color: var(--lasha-navy);
          font-family: Inter, sans-serif;
          font-size: 13.5px;
          font-weight: 500;
          letter-spacing: 0.01em;
          text-decoration: none;
          transition: color 0.2s ease, gap 0.2s ease;
        }
        .auth-home-link:hover {
          color: var(--lasha-cyan);
          gap: 10px;
        }
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

// ─── Dev quick sign-in ──────────────────────────────────────────────────────
// Development/testing affordance: one-click sign-in to the REAL seeded agent
// accounts from the stress-test waves (all platform data lives on them). It
// uses the standard password sign-in flow — no backend changes, no elevated
// privileges. Gated to non-production builds; hidden once the app is built
// for production.
const DEV_PASSWORD = "Lasha!Pump2026";
const DEV_ACCOUNTS: { label: string; email: string; dest: string }[] = [
  { label: "Admin", email: "agent.admin@lasha.test", dest: "/admin/driver-approvals" },
  { label: "Operations", email: "agent.ops@lasha.test", dest: "/operations" },
  { label: "Driver #1", email: "agent.driver1@lasha.test", dest: "/driver" },
  { label: "Customer #1", email: "agent.customer1@lasha.test", dest: "/dashboard" },
];

function DevQuickSignIn({ onError, setLoading }: { onError: (m: string) => void; setLoading: (b: boolean) => void }) {
  const { signIn } = useAuthActions();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [busy, setBusy] = useState<string | null>(null);
  if (import.meta.env.PROD) return null;

  const quickSignIn = async (acct: (typeof DEV_ACCOUNTS)[number]) => {
    onError("");
    setBusy(acct.label);
    setLoading(true);
    try {
      await signIn("password", { email: acct.email, password: DEV_PASSWORD, flow: "signIn" });
      const returnTo = searchParams.get("returnTo");
      navigate(returnTo ?? acct.dest, { replace: true });
    } catch (err: unknown) {
      onError(safeAuthError(err, "Dev sign-in failed — the platform database may be paused (usage limit)."));
      setBusy(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="dev-quick-signin"
      style={{
        marginTop: 28,
        paddingTop: 20,
        borderTop: "1px dashed var(--lasha-border-light)",
      }}
    >
      <p
        style={{
          fontSize: 9,
          fontFamily: '"SF Mono", Menlo, monospace',
          fontWeight: 600,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--lasha-muted)",
          marginBottom: 10,
          textAlign: "center",
        }}
      >
        Dev quick sign-in · seeded accounts
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {DEV_ACCOUNTS.map((acct) => (
          <button
            key={acct.label}
            type="button"
            disabled={busy !== null}
            onClick={() => void quickSignIn(acct)}
            style={{
              padding: "9px 10px",
              fontSize: 12.5,
              fontWeight: 600,
              fontFamily: "Inter, sans-serif",
              color: "var(--lasha-navy)",
              backgroundColor: "#ffffff",
              border: "1px solid var(--lasha-border-light)",
              borderRadius: 9,
              cursor: busy !== null ? "wait" : "pointer",
              transition: "border-color 0.15s, background 0.15s",
              opacity: busy !== null && busy !== acct.label ? 0.5 : 1,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--lasha-cyan)")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--lasha-border-light)")}
          >
            {busy === acct.label ? "Signing in…" : acct.label}
          </button>
        ))}
      </div>
    </div>
  );
}
