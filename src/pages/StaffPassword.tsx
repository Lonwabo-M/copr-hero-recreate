import { useAuthActions } from "@convex-dev/auth/react";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { ArrowLeft, ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { homeRouteForRole } from "@/components/shells/roleAccess";
import { isStaffRole, type Role } from "@/convex/schema";
import { safeAuthError } from "@/lib/authError";

// ─── Staff password bootstrap ────────────────────────────────────────────────
// ZITADEL cannot create the first staff record: it only links to an existing
// internal account. This page is the separate bootstrap entry point for the
// seeded/existing staff administrator. It uses the password provider, then
// refuses to continue unless the authenticated account has a staff role.
//
// This is deliberately not linked from the customer /auth page: customer and
// driver credentials must not be entered into a staff-branded form by mistake.

function StaffPasswordLoading() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        backgroundColor: "var(--lasha-navy)",
      }}
    >
      <Loader2
        size={24}
        className="animate-spin"
        style={{ color: "var(--lasha-cyan-light)" }}
      />
    </main>
  );
}

export default function StaffPassword() {
  const { signIn, signOut } = useAuthActions();
  const { isLoading, isAuthenticated, user } = useAuth();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  const requested = searchParams.get("returnTo");
  const returnTo =
    requested?.startsWith("/") &&
    !requested.startsWith("//") &&
    requested !== "/staff-password"
      ? requested
      : "/post-auth";

  const role = user?.role as Role | undefined;
  const staffSession = isAuthenticated && isStaffRole(role);
  const nonStaffSession = isAuthenticated && !staffSession;

  if (isLoading) {
    return <StaffPasswordLoading />;
  }

  if (staffSession) {
    return <Navigate to={returnTo} replace />;
  }

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await signIn("password", {
        email: email.trim(),
        password,
        flow: "signIn",
      });
      // useAuth re-renders into either the staff redirect or the
      // non-staff notice above; the role check is never bypassed.
    } catch (err: unknown) {
      setError(
        safeAuthError(
          err,
          "signIn",
          "Could not sign in. Check the staff email and password.",
        ),
      );
      setBusy(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: "clamp(20px, 5vw, 56px)",
        backgroundColor: "var(--lasha-navy)",
        backgroundImage:
          "radial-gradient(circle at 12% 18%, rgba(7,148,181,0.28), transparent 34%), radial-gradient(circle at 88% 82%, rgba(212,226,58,0.10), transparent 30%)",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 520,
          padding: "clamp(28px, 5vw, 44px)",
          borderRadius: 24,
          backgroundColor: "var(--lasha-ivory)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.28)",
        }}
      >
        <Link
          to={`/staff-login?returnTo=${encodeURIComponent(returnTo)}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            color: "var(--lasha-muted)",
            textDecoration: "none",
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={14} />
          Back to staff sign-in
        </Link>

        <div
          style={{
            width: 44,
            height: 44,
            display: "grid",
            placeItems: "center",
            borderRadius: 12,
            marginTop: 24,
            color: "var(--lasha-cyan)",
            backgroundColor: "rgba(7,148,181,0.1)",
          }}
        >
          <ShieldCheck size={22} />
        </div>

        <p
          style={{
            margin: "22px 0 8px",
            fontSize: 10,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            fontWeight: 700,
            color: "var(--lasha-cyan)",
          }}
        >
          Staff bootstrap
        </p>
        <h1
          style={{
            margin: 0,
            fontSize: 30,
            lineHeight: 1.08,
            letterSpacing: "-0.035em",
            color: "var(--lasha-navy)",
          }}
        >
          Staff password
          <br />
          sign-in
        </h1>

        <p
          style={{
            margin: "14px 0 22px",
            fontSize: 14,
            lineHeight: 1.65,
            color: "var(--lasha-muted)",
          }}
        >
          First-time admin? If this deployment has a seeded staff admin, sign in
          with it, then add staff emails under <strong>Admin → Accounts</strong>.
          If the seeded admin is missing, use the{" "}
          <Link to="/staff-setup">one-time first-admin setup</Link>. ZITADEL
          only works after that staff email has been provisioned.
        </p>

        {nonStaffSession ? (
          <div>
            <div
              role="alert"
              style={{
                padding: "12px 14px",
                marginBottom: 16,
                borderRadius: 10,
                fontSize: 12.5,
                lineHeight: 1.55,
                color: "#9f1d1d",
                backgroundColor: "#fef2f2",
                border: "1px solid #fecaca",
              }}
            >
              That account is a customer or driver. Customer and driver
              accounts cannot open staff pages.
            </div>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              style={{
                width: "100%",
                minHeight: 48,
                border: "none",
                borderRadius: 11,
                padding: "13px 18px",
                backgroundColor: signingOut ? "#0b5f8a" : "var(--lasha-cyan)",
                color: "#fff",
                fontFamily: "Inter, sans-serif",
                fontSize: 14,
                fontWeight: 700,
                cursor: signingOut ? "wait" : "pointer",
              }}
            >
              {signingOut ? "Signing out…" : "Sign out and use a staff account"}
            </button>
            <Link
              to={homeRouteForRole(role)}
              style={{
                display: "block",
                marginTop: 16,
                textAlign: "center",
                fontSize: 12.5,
                fontWeight: 600,
                color: "var(--lasha-navy)",
                textDecoration: "none",
              }}
            >
              Go to my dashboard
            </Link>
          </div>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)}>
            <label
              htmlFor="staff-password-email"
              style={{
                display: "block",
                marginBottom: 7,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--lasha-navy)",
              }}
            >
              Staff email
            </label>
            <input
              id="staff-password-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              style={{
                width: "100%",
                minHeight: 44,
                boxSizing: "border-box",
                border: "1px solid var(--lasha-border-light)",
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 14,
                fontSize: 14,
                color: "var(--lasha-navy)",
                backgroundColor: "#fff",
              }}
            />

            <label
              htmlFor="staff-password-password"
              style={{
                display: "block",
                marginBottom: 7,
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--lasha-navy)",
              }}
            >
              Password
            </label>
            <input
              id="staff-password-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              style={{
                width: "100%",
                minHeight: 44,
                boxSizing: "border-box",
                border: "1px solid var(--lasha-border-light)",
                borderRadius: 10,
                padding: "10px 12px",
                marginBottom: 16,
                fontSize: 14,
                color: "var(--lasha-navy)",
                backgroundColor: "#fff",
              }}
            />

            {error && (
              <div
                role="alert"
                style={{
                  padding: "11px 13px",
                  marginBottom: 16,
                  borderRadius: 10,
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  color: "#9f1d1d",
                  backgroundColor: "#fef2f2",
                  border: "1px solid #fecaca",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              style={{
                width: "100%",
                minHeight: 50,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                border: "none",
                borderRadius: 11,
                padding: "13px 18px",
                backgroundColor: busy ? "#0b5f8a" : "var(--lasha-cyan)",
                color: "#fff",
                fontFamily: "Inter, sans-serif",
                fontSize: 14,
                fontWeight: 700,
                cursor: busy ? "wait" : "pointer",
              }}
            >
              {busy ? (
                <>
                  <Loader2 size={17} className="animate-spin" />
                  Signing in…
                </>
              ) : (
                <>
                  Sign in with staff password
                  <ArrowRight size={17} />
                </>
              )}
            </button>
          </form>
        )}

        <Link
          to={`/staff-login?returnTo=${encodeURIComponent(returnTo)}`}
          style={{
            display: "block",
            marginTop: 20,
            textAlign: "center",
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--lasha-navy)",
            textDecoration: "none",
          }}
        >
          Use ZITADEL instead
        </Link>
      </section>
    </main>
  );
}
