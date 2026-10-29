import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { homeRouteForRole } from "@/components/shells/roleAccess";
import { ROLES } from "@/convex/schema";

// ─── PostAuthRedirect ────────────────────────────────────────────────────────
// Role-aware post-auth entry point. After sign-in with no specific returnTo,
// users land in the Activity Center (/dashboard) — the platform's daily home —
// except drivers, who go straight to the Driver App (/driver) because their
// jobs and status actions live there. Operations and Admin workspaces stay one
// click away in the customer sidebar. Unknown/missing roles default to the
// Customer experience; Convex remains the authoritative authorization layer
// regardless of where the UI sends users.
//
// Customer onboarding: a customer (or unprovisioned account, which the backend
// defaults to the customer experience) whose onboarding is incomplete is sent
// to /onboarding/customer first. Completion is a deterministic backend check
// (users/onboarding.ts), so already-onboarded customers go straight to
// /dashboard and are never re-onboarded. Driver/Operations/Admin routing is
// unchanged. This is UX routing only — the backend enforces authorization on
// every query and mutation.
//
// Latency/correctness: all redirects are client-side (react-router navigate).
// Right after sign-up/sign-in the session token is already stored, but
// useConvexAuth flips to authenticated ASYNCHRONOUSLY — navigating away the
// instant isAuthenticated is false caused a bounce back to /auth (users had to
// refresh). A short grace period lets the session propagate before deciding
// the user is really signed out.

const SIGNED_OUT_GRACE_MS = 2500;

function DestinationSpinner() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "var(--lasha-ivory, #faf9f6)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--lasha-cyan, #0794b5)" }} />
        <p style={{ fontSize: 13, color: "var(--lasha-muted, #666)" }}>Taking you to your workspace…</p>
      </div>
    </main>
  );
}

/** Mounted as soon as the session exists. Fires the onboarding-status query
 *  immediately (in parallel with the user query); acts on it only once the
 *  role is resolved. */
function AuthenticatedDestination({
  role,
  roleResolved,
}: {
  role: string | undefined;
  roleResolved: boolean;
}) {
  const navigate = useNavigate();
  const status = useQuery(api.users.onboarding.getOnboardingStatus);

  // While the role is still resolving, hold both branches. Once resolved,
  // unprovisioned accounts (no role) take the customer experience — the same
  // default the backend authorization layer applies.
  const isCustomerExperience =
    !roleResolved || role === ROLES.CUSTOMER || role === undefined;

  useEffect(() => {
    if (!roleResolved) return; // role not yet known — never route early
    if (!isCustomerExperience) {
      // Staff land in the Activity Center. Drivers keep the Driver App: the
      // customer sidebar has no Driver App entry, so sending them to
      // /dashboard would strand them away from their active delivery.
      navigate(role === ROLES.DRIVER ? homeRouteForRole(role) : "/dashboard", {
        replace: true,
      });
      return;
    }
    // `unauthenticated` means the status query ran before the fresh session
    // token reached the Convex client (the signUp → navigate instant). Hold
    // navigation: the reactive subscription re-fires authenticated within a
    // beat, and routing on the placeholder `complete: false` would drop
    // already-onboarded users into onboarding.
    if (status === undefined || status.unauthenticated) return;
    navigate(status.complete ? "/dashboard" : "/onboarding/customer", { replace: true });
  }, [roleResolved, isCustomerExperience, status, role, navigate]);

  return <DestinationSpinner />;
}

export default function PostAuthRedirect() {
  const navigate = useNavigate();
  const { isLoading, isAuthenticated, user } = useAuth();

  // Grace period: immediately after sign-up the token is stored but
  // isAuthenticated is still false for a moment. Only treat the user as
  // signed out once the grace window has elapsed without authentication.
  const [signedOutConfirmed, setSignedOutConfirmed] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const timer = setTimeout(() => setSignedOutConfirmed(true), SIGNED_OUT_GRACE_MS);
      return () => clearTimeout(timer);
    }
    // Authentication succeeded within the window — cancel the bounce.
    setSignedOutConfirmed(false);
  }, [isLoading, isAuthenticated]);

  useEffect(() => {
    if (signedOutConfirmed) {
      // Genuinely not signed in (e.g. visited /post-auth directly) → auth.
      navigate("/auth", { replace: true });
    }
  }, [signedOutConfirmed, navigate]);

  if (!isAuthenticated) {
    return <DestinationSpinner />;
  }

  // roleResolved = the user query has settled (isLoading covers auth + user).
  return (
    <AuthenticatedDestination
      role={user?.role as string | undefined}
      roleResolved={!isLoading}
    />
  );
}
