import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { isLoading, isAuthenticated } = useAuth();
  const location = useLocation();

  // Dev bypass: ?dev=true or ?guest=true in URL, OR session-level guest flag
  const params = new URLSearchParams(location.search);
  const urlBypass = params.get("dev") === "true" || params.get("guest") === "true";
  const sessionBypass = sessionStorage.getItem("lasha_guest") === "true";
  const devBypass = urlBypass || sessionBypass;

  if (isLoading && !devBypass) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  if (!isAuthenticated && !devBypass) {
    const returnTo = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/auth?returnTo=${encodeURIComponent(returnTo)}`}
        replace
      />
    );
  }

  return children;
}
