import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { RequireAuth } from "@/components/RequireAuth";
import { APP_AREAS, type AppArea } from "./navigation";
import { canAccessArea, homeRouteForRole } from "./roleAccess";

// ─── RoleGate ────────────────────────────────────────────────────────────────
// Centralized, role-aware route guard layered on the existing RequireAuth
// (which still handles authentication + /auth?returnTo redirect preservation).
//
// This is UX-level routing only: the frontend never grants access. Convex
// queries/mutations remain the authoritative authorization boundary — every
// domain function still resolves the authenticated user server-side and
// enforces RBAC there.

interface RoleGateProps {
  area: AppArea;
  children: ReactNode;
}

export function RoleGate({ area, children }: RoleGateProps) {
  return (
    <RequireAuth>
      <AreaGuard area={area}>{children}</AreaGuard>
    </RequireAuth>
  );
}

function AreaGuard({ area, children }: RoleGateProps) {
  const { isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  const role = user?.role as string | undefined;

  if (!canAccessArea(role, area)) {
    // Redirect to the home of the area this user belongs to. Preserve the
    // attempted path so an authorized user can be sent back after switching
    // accounts (cheap, non-security-critical; Convex still authorizes data).
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={homeRouteForRole(role)}
        state={{ denied: returnTo }}
        replace
      />
    );
  }

  return children;
}

// Re-export so route definitions read naturally and the two guards can't
// drift apart.
export { APP_AREAS };
