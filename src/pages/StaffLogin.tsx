import { useAuthActions, useAuthToken } from "@convex-dev/auth/react";
import { useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, ArrowRight, Loader2, ShieldCheck } from "lucide-react";

// ─── Staff sign-in (ZITADEL) ──────────────────────────────────────────────────
// Separate entry point for internal Lasha staff. Customer and driver sign-in
// remains on /auth and is deliberately not mixed into this page.
//
// The frontend only starts the OAuth flow. Convex Auth performs the code
// exchange on the deployment, validates the ZITADEL issuer/audience, and then
// calls the server-side staff guard in src/convex/auth.ts. A role can never be
// selected here.

export default function StaffLogin() {
  const { signIn, signOut } = useAuthActions();
  const token = useAuthToken();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState(
    searchParams.get("reason") === "staff-account"
      ? "Staff accounts cannot use the customer sign-in. Continue with ZITADEL below."
      : "",
  );
  const reason = searchParams.get("reason");
  const customerLoginStaffSession =
    token !== null && reason === "staff-account";

  const requested = searchParams.get("returnTo");
  const returnTo =
    requested?.startsWith("/") && requested !== "/staff-login"
      ? requested
      : "/post-auth";

  // Convex Auth processes the OAuth code in the URL before this component's
  // auth state settles. Once the staff session exists, continue to the same
  // role-aware destination used by password sign-in.
  if (token !== null && !customerLoginStaffSession) {
    return <Navigate to={returnTo} replace />;
  }

  const handleStaffSessionSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      // The auth client clears local tokens even if the server call fails.
      navigate("/staff-login", { replace: true });
    }
  };

  const handleStaffSignIn = async () => {
    setLoading(true);
    setError("");
    try {
      // Return to this page first so an OAuth failure does not strand staff on
      // the customer login screen; the provider redirect then goes to returnTo.
      const staffReturn = `/staff-login?returnTo=${encodeURIComponent(returnTo)}`;
      await signIn("zitadel", { redirectTo: staffReturn });
      // Successful OAuth starts a full-page redirect. Keep the loading state
      // active until the browser leaves this page.
    } catch (err: unknown) {
      setLoading(false);
      setError(
        err instanceof Error && err.message.includes("not configured")
          ? "Staff SSO is not configured on this deployment yet."
          : "Could not start staff sign-in. Please try again or contact an administrator.",
      );
    }
  };

  if (customerLoginStaffSession) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "clamp(20px, 5vw, 56px)",
          backgroundColor: "var(--lasha-navy)",
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
          <div
            style={{
              width: 44,
              height: 44,
              display: "grid",
              placeItems: "center",
              borderRadius: 12,
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
            Staff account detected
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
            Use the staff portal
          </h1>
          <p
            style={{
              margin: "14px 0 24px",
              fontSize: 14,
              lineHeight: 1.65,
              color: "var(--lasha-muted)",
            }}
          >
            You signed in through the customer login. Staff accounts must use
            ZITADEL. This is a legacy staff password session.
          </p>
          <button
            type="button"
            onClick={() => void handleStaffSessionSignOut()}
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
            {signingOut ? "Signing out…" : "Sign out and use ZITADEL"}
          </button>
          <Link
            to="/post-auth"
            style={{
              display: "block",
              marginTop: 18,
              textAlign: "center",
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--lasha-navy)",
              textDecoration: "none",
            }}
          >
            Continue to the staff portal with the legacy session
          </Link>
          <p
            style={{
              margin: "18px 0 0",
              fontSize: 11,
              lineHeight: 1.6,
              color: "var(--lasha-muted)",
              textAlign: "center",
            }}
          >
            The legacy option is temporary; use ZITADEL once staff SSO is
            configured.
          </p>
        </section>
      </main>
    );
  }

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
      <div
        style={{
          width: "100%",
          maxWidth: 960,
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(300px, 420px)",
          backgroundColor: "var(--lasha-ivory)",
          borderRadius: 24,
          overflow: "hidden",
          boxShadow: "0 30px 80px rgba(0,0,0,0.28)",
        }}
        className="staff-login-card"
      >
        <section
          style={{
            padding: "clamp(30px, 5vw, 58px)",
            backgroundColor: "var(--lasha-navy)",
            color: "#fff",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            gap: 44,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              width: 340,
              height: 340,
              borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.08)",
              right: -130,
              top: -140,
            }}
          />
          <div style={{ position: "relative" }}>
            <Link
              to="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                color: "rgba(255,255,255,0.65)",
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              <ArrowLeft size={15} />
              Back to Lasha
            </Link>

            <div style={{ marginTop: 54, display: "flex", alignItems: "center", gap: 12 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 12,
                  display: "grid",
                  placeItems: "center",
                  backgroundColor: "rgba(212,226,58,0.14)",
                  color: "var(--lasha-lime)",
                }}
              >
                <ShieldCheck size={22} strokeWidth={1.8} />
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    letterSpacing: "0.16em",
                    textTransform: "uppercase",
                    color: "var(--lasha-cyan-light)",
                    fontWeight: 700,
                  }}
                >
                  Lasha internal
                </div>
                <div style={{ fontSize: 14, color: "rgba(255,255,255,0.72)", marginTop: 3 }}>
                  Staff identity
                </div>
              </div>
            </div>

            <h1
              style={{
                margin: "28px 0 14px",
                fontSize: "clamp(34px, 5vw, 52px)",
                lineHeight: 0.98,
                letterSpacing: "-0.045em",
                fontWeight: 750,
              }}
            >
              Operations.
              <br />
              Admin.
              <br />
              <span style={{ color: "var(--lasha-lime)" }}>One staff login.</span>
            </h1>
            <p
              style={{
                maxWidth: 390,
                margin: 0,
                fontSize: 15,
                lineHeight: 1.7,
                color: "rgba(255,255,255,0.62)",
              }}
            >
              ZITADEL verifies your Lasha staff identity. Your assigned role
              still determines whether you enter the Operations Centre or the
              Admin Portal — the browser cannot choose it.
            </p>
          </div>

          <div
            style={{
              position: "relative",
              display: "flex",
              gap: 20,
              flexWrap: "wrap",
              paddingTop: 24,
              borderTop: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            {["ZITADEL OIDC", "Staff-only realm", "Server-side roles"].map((item) => (
              <span
                key={item}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 11.5,
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    backgroundColor: "var(--lasha-lime)",
                  }}
                />
                {item}
              </span>
            ))}
          </div>
        </section>

        <section
          style={{
            padding: "clamp(30px, 5vw, 52px)",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            backgroundColor: "var(--lasha-ivory)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 10,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              fontWeight: 700,
              color: "var(--lasha-cyan)",
            }}
          >
            Authorised staff only
          </p>
          <h2
            style={{
              margin: "12px 0 10px",
              fontSize: 30,
              lineHeight: 1.08,
              letterSpacing: "-0.035em",
              color: "var(--lasha-navy)",
              fontWeight: 750,
            }}
          >
            Sign in to your
            <br />
            Lasha workspace
          </h2>
          <p
            style={{
              margin: "0 0 24px",
              fontSize: 14,
              lineHeight: 1.65,
              color: "var(--lasha-muted)",
            }}
          >
            Use your Lasha staff account. Customer and driver accounts cannot
            enter here.
          </p>

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
            type="button"
            onClick={() => void handleStaffSignIn()}
            disabled={loading}
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
              backgroundColor: loading ? "#0b5f8a" : "var(--lasha-cyan)",
              color: "#fff",
              fontFamily: "Inter, sans-serif",
              fontSize: 14,
              fontWeight: 700,
              cursor: loading ? "wait" : "pointer",
              transition: "background-color 0.2s ease, transform 0.2s ease",
            }}
            onMouseEnter={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = "#056f8a";
            }}
            onMouseLeave={(e) => {
              if (!loading) e.currentTarget.style.backgroundColor = "var(--lasha-cyan)";
            }}
          >
            {loading ? (
              <>
                <Loader2 size={17} className="animate-spin" />
                Connecting to ZITADEL…
              </>
            ) : (
              <>
                Continue with ZITADEL
                <ArrowRight size={17} />
              </>
            )}
          </button>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              margin: "24px 0 18px",
            }}
          >
            <span style={{ height: 1, flex: 1, backgroundColor: "var(--lasha-border-light)" }} />
            <span style={{ fontSize: 11, color: "var(--lasha-muted)" }}>or</span>
            <span style={{ height: 1, flex: 1, backgroundColor: "var(--lasha-border-light)" }} />
          </div>

          <Link
            to="/auth"
            style={{
              display: "block",
              textAlign: "center",
              fontSize: 12.5,
              fontWeight: 600,
              color: "var(--lasha-navy)",
              textDecoration: "none",
            }}
          >
            Customer or driver? Sign in here
          </Link>

          <p
            style={{
              margin: "30px 0 0",
              fontSize: 11,
              lineHeight: 1.6,
              color: "var(--lasha-muted)",
              textAlign: "center",
            }}
          >
            Access is limited to provisioned staff accounts. If your staff
            account is not provisioned, contact a Lasha administrator.
          </p>
        </section>
      </div>

      <style>{`
        @media (max-width: 760px) {
          .staff-login-card {
            grid-template-columns: 1fr !important;
          }
          .staff-login-card > section:first-child {
            display: none !important;
          }
        }
      `}</style>
    </main>
  );
}
