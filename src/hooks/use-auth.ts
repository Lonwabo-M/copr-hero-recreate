import { api } from "@/convex/_generated/api";
import { effectiveRoleForUser } from "@/convex/schema";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth, useQuery } from "convex/react";

export function useAuth() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const userDoc = useQuery(api.users.currentUser);
  // Keep legacy test elevations inert in the client even before a backend
  // deploy catches up: routing and gates must use the same effective role the
  // authorization layer uses.
  const user = userDoc
    ? { ...userDoc, role: effectiveRoleForUser(userDoc) }
    : userDoc;
  const { signIn, signOut } = useAuthActions();

  // Derive isLoading directly from the dependencies instead of managing separate state
  const isLoading = isAuthLoading || user === undefined;

  return {
    isLoading,
    isAuthenticated,
    user,
    signIn,
    signOut,
  };
}
