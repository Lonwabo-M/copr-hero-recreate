import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { homeRouteForRole } from "@/components/shells/roleAccess";

// ─── PostAuthRedirect ────────────────────────────────────────────────────────
// Role-aware post-auth entry point. After sign-in with no specific returnTo,
// users are routed to the home of the application area their role maps to:
// customer → /dashboard, driver → /driver, operations/fleet_manager →
// /operations, company_admin/super_admin → /operations (no admin pages yet).
// Unknown/missing roles default to the Customer Portal; Convex remains the
// authoritative authorization layer regardless of where the UI sends users.

export default function PostAuthRedirect() {
  const { isLoading, isAuthenticated, user } = useAuth();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      window.location.assign(homeRouteForRole(user?.role as string | undefined));
    }
  }, [isLoading, isAuthenticated, user]);

  if (!isLoading && !isAuthenticated) {
    // Not signed in (e.g. visited /post-auth directly) → back to auth.
    window.location.assign("/auth");
    return null;
  }

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
