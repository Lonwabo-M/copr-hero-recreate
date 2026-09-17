import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Navigate, useLocation } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ROLES } from "@/convex/schema";
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
  const role = user?.role as string | undefined;

  // ── Driver App elevation ─────────────────────────────────────────────────
  // The Driver App is enforced server-side as ROLES.DRIVER — every driver
  // query/mutation gates on it (e.g. tracking.queries.getMyCurrentDelivery,
  // driver_earnings, the delivery state machine). A supervisory or test-elevated
  // account is admitted to the area by the access rule but does not hold the
  // role, so it would land on a workspace where each query throws
  // "Only drivers can access this query". Testers must be able to walk this
  // area end-to-end, so the guard claims the driver elevation itself (the same
  // marked, reversible elevation the sidebar uses). Real staff are untouched:
  // the claim is a no-op for them, and the backend still authorizes every call.
  const testAccessState = useQuery(
    api.users.testAccess.getTestAccessState,
    user ? {} : "skip",
  );
  const claimTestAccess = useMutation(api.users.testAccess.claimTestAreaAccess);
  const [elevating, setElevating] = useState(false);
  const [elevationFailed, setElevationFailed] = useState(false);
  const elevationAttempted = useRef(false);
  const needsDriverElevation =
    area === APP_AREAS.DRIVER &&
    role !== ROLES.DRIVER &&
    testAccessState?.testElevated === true;
  // While the elevation state is still resolving we must NOT render the
  // workspace: rendering it under a non-driver role is precisely what surfaced
  // "Only drivers can access this query" as a preview error.
  const awaitingDriverElevationCheck =
    area === APP_AREAS.DRIVER &&
    role !== ROLES.DRIVER &&
    testAccessState === undefined;

  useEffect(() => {
    if (!needsDriverElevation || elevationAttempted.current) return;
    elevationAttempted.current = true;
    setElevating(true);
    void claimTestAccess({ area: "driver" })
      .catch((err) => {
        console.error("[access] driver elevation failed:", err);
        setElevationFailed(true);
      })
      .finally(() => setElevating(false));
  }, [needsDriverElevation, claimTestAccess]);

  if (isLoading || awaitingDriverElevationCheck || needsDriverElevation || elevating) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  // The elevation could not be claimed — never strand the user on a workspace
  // whose every query would throw. Send them back to an area they do hold.
  if (elevationFailed && !canAccessArea(role, area)) {
    return <Navigate to={homeRouteForRole(role)} replace />;
  }

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
