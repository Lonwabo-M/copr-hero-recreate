import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Navigate, useLocation } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ROLES } from "@/convex/schema";
import { useAuth } from "@/hooks/use-auth";
import { RequireAuth } from "@/components/RequireAuth";
import { APP_AREAS, type AppArea } from "./navigation";
import { canAccessArea, homeRouteForRole, elevationRoleForArea, elevationAreaArg } from "./roleAccess";

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

  // ── Area elevation (driver / operations / admin walk-ins) ────────────────────────
  // Area access is broader than area ENFORCEMENT: a supervisory account (e.g.
  // super_admin → Driver App) is admitted by the access rule, but the backend
  // enforces each workspace's queries against the area's own role ("Only
  // drivers can access this query"). A tester must be able to walk the area
  // end-to-end, so the guard claims the marked, reversible elevation whenever
  // the caller does not already hold the target role — exactly the elevation
  // the sidebar access point relies on (AppShell navigates first; THIS guard
  // is the sole owner of the claim, so a role flip can never unmount a guard
  // mid-navigation). Admin is included: an operations walk-in holds neither
  // admin role, so without elevation the admin guard would bounce them back
  // to /operations (the "Admin Portal lands in Operations" bug). Real staff
  // of the area are untouched (the claim is a no-op for them) and the
  // backend still authorizes every call.
  const testAccessState = useQuery(
    api.users.testAccess.getTestAccessState,
    user ? {} : "skip",
  );
  const claimTestAccess = useMutation(api.users.testAccess.claimTestAreaAccess);
  const [elevating, setElevating] = useState(false);
  const [elevationFailed, setElevationFailed] = useState(false);
  const elevationAttempted = useRef(false);
  // The elevation state must have RESOLVED before we can decide: rendering the
  // workspace while the check is in flight is precisely what surfaced "Only
  // drivers can access this query" as a preview error.
  const awaitingElevationCheck = testAccessState === undefined;
  // Roleless accounts (a brand-new sign-up, before the backend provisions a
  // role) belong to the Customer experience — canAccessArea already admits
  // them to the Customer area. Requiring `role !== undefined` here bounced new
  // accounts away from /onboarding/customer straight to /dashboard, skipping
  // onboarding entirely. This is UX routing only; the backend remains the
  // authorization authority.
  const admitted = canAccessArea(role, area);
  // A roleless account (brand-new sign-up, before any role is provisioned) is
  // also a walk-in for staffed areas: without the elevation claim it is
  // bounced straight back to its home route, so cross-area sidebar clicks
  // appear completely dead. The backend claim is safe for roleless accounts —
  // it remembers the previous (empty) role and release restores them to the
  // customer portal.
  const needsElevation =
    area !== APP_AREAS.CUSTOMER &&
    role !== elevationRoleForArea(area);

  useEffect(() => {
    if (awaitingElevationCheck || !needsElevation || elevationAttempted.current) return;
    elevationAttempted.current = true;
    setElevating(true);
    void claimTestAccess({ area: elevationAreaArg(area) })
      .catch((err) => {
        console.error("[access] area elevation failed:", err);
        setElevationFailed(true);
      })
      .finally(() => setElevating(false));
  }, [awaitingElevationCheck, needsElevation, claimTestAccess]);

  // Safety net: the elevation is already committed server-side by the time the
  // claim resolves, so if the reactive role never arrives (dropped
  // subscription / stale cache) a full document load still lands the tester in
  // the workspace instead of spinning here forever. Mirrors the AppShell
  // access-point behaviour.
  useEffect(() => {
    if (awaitingElevationCheck || !needsElevation || elevationFailed) return;
    const timer = window.setTimeout(() => {
      window.location.reload();
    }, 2500);
    return () => window.clearTimeout(timer);
  }, [awaitingElevationCheck, needsElevation, elevationFailed]);

  if (isLoading || awaitingElevationCheck || needsElevation || elevating) {
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

  if (!admitted) {
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
