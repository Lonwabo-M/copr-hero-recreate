import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { ArrowLeft, ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { homeRouteForRole } from "@/components/shells/roleAccess";
import { authErrorDetail, safeAuthError } from "@/lib/authError";
import { isStaffRole, type Role } from "@/convex/schema";

// ─── First administrator setup ────────────────────────────────────────────────
// This is the only path that can create the first staff administrator without
// one already existing. The backend mutation re-checks that no active admin
// exists before promoting the signed-in account, and the page closes itself as
// soon as setup is complete. After that, all staff changes go through
// Admin → Accounts and staff sign-in goes through ZITADEL.

const fieldStyle: CSSProperties = {
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
};

const labelStyle: CSSProperties = {
  display: "block",
  marginBottom: 7,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "var(--lasha-navy)",
};

const primaryButtonStyle: CSSProperties = {
  width: "100%",
  minHeight: 50,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  border: "none",
  borderRadius: 11,
  padding: "13px 18px",
  backgroundColor: "var(--lasha-cyan)",
  color: "#fff",
  fontFamily: "Inter, sans-serif",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

function Shell({ children }: { children: ReactNode }) {
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
          maxWidth: 540,
          padding: "clamp(28px, 5vw, 44px)",
          borderRadius: 24,
          backgroundColor: "var(--lasha-ivory)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.28)",
        }}
      >
        {children}
      </section>
    </main>
  );
}

function SetupHeader() {
  return (
    <>
      <Link
        to="/staff-login"
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
        First administrator
      </p>
    </>
  );
}

export default function StaffSetup() {
  const { signIn, signOut } = useAuthActions();
  const { isLoading, isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const status = useQuery(api.admin.setup.getSetupStatus);
  const claimFirstAdmin = useMutation(api.admin.setup.claimFirstAdmin);

  const [mode, setMode] = useState<"create" | "existing">("create");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState("");

  const role = user?.role as Role | undefined;
  const staffSession = isAuthenticated && isStaffRole(role);

  const claim = async () => {
    setBusy(true);
    setError("");
    try {
      await claimFirstAdmin();
      navigate("/admin/accounts", { replace: true });
    } catch (err: unknown) {
      const detail = authErrorDetail(err);
      setError(
        detail ||
          "Could not claim the first administrator. Refresh and try again.",
      );
      setBusy(false);
    }
  };

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
      if (mode === "create") {
        await signIn("password", {
          flow: "signUp",
          email: email.trim(),
          password,
          name: name.trim() || "Administrator",
        });
      } else {
        await signIn("password", {
          flow: "signIn",
          email: email.trim(),
          password,
        });
      }
      await claimFirstAdmin();
      navigate("/admin/accounts", { replace: true });
    } catch (err: unknown) {
      setError(
        safeAuthError(
          err,
          mode === "create" ? "signUp" : "signIn",
          "Could not create the administrator. Check the details and try again.",
        ),
      );
      setBusy(false);
    }
  };

  if (status === undefined || isLoading) {
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

  if (!status.needsSetup) {
    return (
      <Shell>
        <SetupHeader />
        <h1
          style={{
            margin: 0,
            fontSize: 30,
            lineHeight: 1.08,
            letterSpacing: "-0.035em",
            color: "var(--lasha-navy)",
          }}
        >
          Setup is already
          <br />
          complete
        </h1>
        <p
          style={{
            margin: "14px 0 24px",
            fontSize: 14,
            lineHeight: 1.65,
            color: "var(--lasha-muted)",
          }}
        >
          An administrator already exists for this deployment. The one-time
          setup is closed; staff changes now go through Admin → Accounts.
        </p>
        <Link
          to="/staff-login"
          style={{
            ...primaryButtonStyle,
            textDecoration: "none",
            boxSizing: "border-box",
          }}
        >
          Go to staff sign-in
          <ArrowRight size={17} />
        </Link>
      </Shell>
    );
  }

  if (isAuthenticated) {
    return (
      <Shell>
        <SetupHeader />
        <h1
          style={{
            margin: 0,
            fontSize: 30,
            lineHeight: 1.08,
            letterSpacing: "-0.035em",
            color: "var(--lasha-navy)",
          }}
        >
          Claim the first
          <br />
          administrator
        </h1>
        <p
          style={{
            margin: "14px 0 22px",
            fontSize: 14,
            lineHeight: 1.65,
            color: "var(--lasha-muted)",
          }}
        >
          This deployment has no administrator yet. The signed-in account below
          will become the first super administrator. This is a one-time action
          and closes as soon as it succeeds.
        </p>

        <div
          style={{
            padding: "14px 16px",
            marginBottom: 16,
            borderRadius: 12,
            backgroundColor: "rgba(7,148,181,0.07)",
            border: "1px solid rgba(7,148,181,0.16)",
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 13.5,
              fontWeight: 700,
              color: "var(--lasha-navy)",
            }}
          >
            {user?.email ?? "Signed-in account"}
          </p>
          <p
            style={{
              margin: "4px 0 0",
              fontSize: 11.5,
              color: "var(--lasha-muted)",
            }}
          >
            {user?.name ? `${user.name} · ` : ""}
            Current role: {role ?? "none"}
            {staffSession ? " (staff)" : " (customer/driver)"}
          </p>
        </div>

        {!staffSession && (
          <div
            style={{
              padding: "11px 13px",
              marginBottom: 16,
              borderRadius: 10,
              fontSize: 12.5,
              lineHeight: 1.55,
              color: "#92400e",
              backgroundColor: "#fffbeb",
              border: "1px solid #fde68a",
            }}
          >
            This account is currently a customer or driver. Claiming setup will
            replace that role with super administrator. If you want to keep
            customer access, sign out and create a separate staff account.
          </div>
        )}

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
          onClick={() => void claim()}
          disabled={busy}
          style={{
            ...primaryButtonStyle,
            backgroundColor: busy ? "#0b5f8a" : "var(--lasha-cyan)",
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? (
            <>
              <Loader2 size={17} className="animate-spin" />
              Claiming…
            </>
          ) : (
            <>
              Make this the first administrator
              <ArrowRight size={17} />
            </>
          )}
        </button>

        <button
          type="button"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
          style={{
            width: "100%",
            minHeight: 44,
            marginTop: 12,
            border: "1px solid var(--lasha-border-light)",
            borderRadius: 10,
            padding: "10px 16px",
            backgroundColor: "transparent",
            color: "var(--lasha-navy)",
            fontFamily: "Inter, sans-serif",
            fontSize: 12.5,
            fontWeight: 600,
            cursor: signingOut ? "wait" : "pointer",
          }}
        >
          {signingOut ? "Signing out…" : "Use a different account"}
        </button>

        <Link
          to={homeRouteForRole(role)}
          style={{
            display: "block",
            marginTop: 16,
            textAlign: "center",
            fontSize: 12.5,
            fontWeight: 600,
            color: "var(--lasha-muted)",
            textDecoration: "none",
          }}
        >
          Go to my current dashboard
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <SetupHeader />
      <h1
        style={{
          margin: 0,
          fontSize: 30,
          lineHeight: 1.08,
          letterSpacing: "-0.035em",
          color: "var(--lasha-navy)",
        }}
      >
        Set up the first
        <br />
        administrator
      </h1>
      <p
        style={{
          margin: "14px 0 22px",
          fontSize: 14,
          lineHeight: 1.65,
          color: "var(--lasha-muted)",
        }}
      >
        Create the first staff administrator for this deployment. This page
        closes as soon as one exists. Use a real staff email; you can add
        ZITADEL staff emails later under Admin → Accounts.
      </p>

      <div
        style={{
          display: "flex",
          gap: 6,
          padding: 4,
          marginBottom: 20,
          borderRadius: 10,
          backgroundColor: "rgba(11,39,66,0.06)",
        }}
      >
        {(
          [
            ["create", "Create admin account"],
            ["existing", "I already have an account"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setMode(value);
              setError("");
            }}
            style={{
              flex: 1,
              border: "none",
              borderRadius: 8,
              padding: "9px 10px",
              backgroundColor:
                mode === value ? "var(--lasha-ivory)" : "transparent",
              color:
                mode === value ? "var(--lasha-navy)" : "var(--lasha-muted)",
              fontFamily: "Inter, sans-serif",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              boxShadow:
                mode === value ? "0 1px 4px rgba(11,39,66,0.12)" : "none",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={(event) => void handleSubmit(event)}>
        {mode === "create" && (
          <>
            <label htmlFor="setup-name" style={labelStyle}>
              Your name
            </label>
            <input
              id="setup-name"
              type="text"
              autoComplete="name"
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              style={fieldStyle}
            />
          </>
        )}

        <label htmlFor="setup-email" style={labelStyle}>
          Staff email
        </label>
        <input
          id="setup-email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          style={fieldStyle}
        />

        <label htmlFor="setup-password" style={labelStyle}>
          Password
        </label>
        <input
          id="setup-password"
          type="password"
          autoComplete={mode === "create" ? "new-password" : "current-password"}
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          style={fieldStyle}
        />
        <p
          style={{
            margin: "-6px 0 16px",
            fontSize: 11.5,
            lineHeight: 1.5,
            color: "var(--lasha-muted)",
          }}
        >
          {mode === "create"
            ? "At least 8 characters. This password is only for bootstrap; ZITADEL becomes the staff sign-in after emails are provisioned."
            : "Sign in with the existing account you want to promote to administrator."}
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
          type="submit"
          disabled={busy}
          style={{
            ...primaryButtonStyle,
            backgroundColor: busy ? "#0b5f8a" : "var(--lasha-cyan)",
            cursor: busy ? "wait" : "pointer",
          }}
        >
          {busy ? (
            <>
              <Loader2 size={17} className="animate-spin" />
              Setting up…
            </>
          ) : (
            <>
              Set up administrator
              <ArrowRight size={17} />
            </>
          )}
        </button>
      </form>

      <p
        style={{
          margin: "20px 0 0",
          textAlign: "center",
          fontSize: 11.5,
          lineHeight: 1.6,
          color: "var(--lasha-muted)",
        }}
      >
        Already set up? <Link to="/staff-login">Go to staff sign-in</Link>.
      </p>
    </Shell>
  );
}
