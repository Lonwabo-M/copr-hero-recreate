import { Loader2 } from "lucide-react";
import { Navigate, useLocation } from "react-router";
import { useAuth } from "@/hooks/use-auth";
import { RequireAuth } from "@/components/RequireAuth";
import { APP_AREAS, type AppArea } from "./navigation";
import { canAccessArea, homeRouteForRole } from "./roleAccess";

// ─── RoleGate ────────────────────────────────────────────────────────────────
// Authentication + role-aware area guard. This is a UX boundary only: Convex
// queries/mutations resolve the caller server-side and enforce the realm,
// permission and role checks themselves.
//
// There is deliberately no cross-area elevation here. A Customer cannot walk
// into the Driver App, a Driver cannot walk into Operations/Admin, and an
// Operations account cannot open the Admin Portal just by visiting its URL.

interface RoleGateProps {
  area: AppArea;
  children: React.ReactNode;
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
  const role = user?.role as string | undefined;

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!canAccessArea(role, area)) {
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
