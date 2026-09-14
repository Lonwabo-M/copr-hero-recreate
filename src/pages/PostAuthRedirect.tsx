import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useNavigate } from "react-router";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import { homeRouteForRole } from "@/components/shells/roleAccess";
import { ROLES } from "@/convex/schema";

// ─── PostAuthRedirect ────────────────────────────────────────────────────────
// Role-aware post-auth entry point. After sign-in with no specific returnTo,
// users are routed to the home of the application area their role maps to:
// customer → /dashboard, driver → /driver, operations/fleet_manager →
// /operations, company_admin/super_admin → /operations (no admin pages yet).
// Unknown/missing roles default to the Customer experience; Convex remains the
// authoritative authorization layer regardless of where the UI sends users.
//
// Customer onboarding: a customer (or unprovisioned account, which the backend
// defaults to the customer experience) whose onboarding is incomplete is sent
// to /onboarding/customer first. Completion is a deterministic backend check
// (users/onboarding.ts), so already-onboarded customers go straight to
// /dashboard and are never re-onboarded. Driver/Operations/Admin routing is
// unchanged. This is UX routing only — the backend enforces authorization on
// every query and mutation.
//
// Latency: all redirects are client-side (react-router navigate) — the session
// token is already stored by the time Auth.tsx navigates here, so full page
// reloads would only re-download the bundle. The user and onboarding-status
// queries run IN PARALLEL; the customer destination is chosen only once the
// role is resolved, so a driver/ops/admin account whose role is still loading
// can never be transiently routed into onboarding.

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
      // Driver/Operations/Admin routing unchanged.
      navigate(homeRouteForRole(role), { replace: true });
      return;
    }
    if (status === undefined) return; // onboarding status still loading
    navigate(status.complete ? "/dashboard" : "/onboarding/customer", { replace: true });
  }, [roleResolved, isCustomerExperience, status, role, navigate]);

  return <DestinationSpinner />;
}

export default function PostAuthRedirect() {
  const navigate = useNavigate();
  const { isLoading, isAuthenticated, user } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Not signed in (e.g. visited /post-auth directly) → back to auth.
      navigate("/auth", { replace: true });
    }
  }, [isLoading, isAuthenticated, navigate]);

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
