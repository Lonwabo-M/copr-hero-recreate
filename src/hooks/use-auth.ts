import { api } from "@/convex/_generated/api";
import { effectiveRoleForUser, isUserSuspended } from "@/convex/schema";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";

export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const userDoc = useQuery(api.users.currentUser);
  // Keep legacy test elevations inert in the client even before a backend
  // deploy catches up: routing and gates must use the same effective role the
  // authorization layer uses.
  const suspended = isUserSuspended(userDoc);
  const user = userDoc && !suspended
    ? { ...userDoc, role: effectiveRoleForUser(userDoc) }
    : suspended
      ? null
      : userDoc;
  const { signIn, signOut } = useAuthActions();

  // Derive isLoading directly from the dependencies instead of managing separate state
  const isLoading = isAuthLoading || userDoc === undefined;

  return {
    isLoading,
    // A suspended staff member has a valid session but no application access.
    // Treating them as signed out makes RequireAuth send them back to /auth;
    // the Convex authorization boundary independently rejects every call.
    isAuthenticated: isAuthenticated && !suspended,
    user,
    signIn,
    signOut,
  };
}
