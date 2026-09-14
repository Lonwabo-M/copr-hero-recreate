import { useEffect } from "react";
import { Loader2 } from "lucide-react";
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

/** Mounted only once authenticated (so the onboarding query always has a
 *  session) — resolves the customer onboarding gate or the role home. */
function AuthenticatedDestination({ role }: { role: string | undefined }) {
  const status = useQuery(api.users.onboarding.getOnboardingStatus);

  const isCustomerExperience = role === ROLES.CUSTOMER || role === undefined;

  useEffect(() => {
    if (!isCustomerExperience) {
      // Driver/Operations/Admin routing unchanged.
      window.location.assign(homeRouteForRole(role));
      return;
    }
    if (status === undefined) return; // onboarding status still loading
    if (status.complete) {
      window.location.assign("/dashboard");
    } else {
      window.location.assign("/onboarding/customer");
    }
  }, [isCustomerExperience, status, role]);

  return <DestinationSpinner />;
}

export default function PostAuthRedirect() {
  const { isLoading, isAuthenticated, user } = useAuth();

  useEffect(() => {
    // Handled by the unauthenticated branch below once loading resolves.
  }, []);

  if (!isLoading && !isAuthenticated) {
    // Not signed in (e.g. visited /post-auth directly) → back to auth.
    window.location.assign("/auth");
    return null;
  }

  if (isLoading || !user) {
    return <DestinationSpinner />;
  }

  return <AuthenticatedDestination role={user.role as string | undefined} />;
}
