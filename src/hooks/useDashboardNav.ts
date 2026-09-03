import { useNavigate } from "react-router";
import { useAuthActions } from "@convex-dev/auth/react";

const routes: Record<string, string> = {
  "Activity Center": "/dashboard",
  "Past Deliveries": "/past-deliveries",
  "Request Delivery": "/request-delivery",
  "Track Delivery": "/track-delivery",
  Invoices: "/invoices",
  Wallet: "/wallet",
  "Make Payment": "/make-payment",
  Notifications: "/notifications",
  Help: "/help",
  Legal: "/legal",
  Downloads: "/downloads",
  Settings: "/settings",
};

export function useDashboardNav() {
  const navigate = useNavigate();
  const { signOut } = useAuthActions();

  const handleSidebarNavigation = (item: string) => {
    if (item === "Log out") {
      sessionStorage.removeItem("lasha_guest");
      signOut();
      return;
    }
    const route = routes[item];
    if (route) navigate(route);
  };

  return { handleSidebarNavigation };
}
