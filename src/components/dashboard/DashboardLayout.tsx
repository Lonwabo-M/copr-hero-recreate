import { useState, useEffect } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import TopNavigation from "@/components/dashboard/TopNavigation";
import Sidebar from "@/components/dashboard/Sidebar";
import type { ReactNode } from "react";

interface DashboardLayoutProps {
  activeSidebarItem: string;
  children: ReactNode;
}

export default function DashboardLayout({ activeSidebarItem, children }: DashboardLayoutProps) {
  const { signOut } = useAuthActions();
  const [activeNav, setActiveNav] = useState("Home");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 1024) setSidebarOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleSidebarNavigation = (item: string) => {
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

    if (item === "Log out") {
      sessionStorage.removeItem("lasha_guest");
      signOut();
      return;
    }

    const route = routes[item];
    if (route) {
      window.location.href = route;
    }
  };

  return (
    <div className="dashboard">
      <TopNavigation
        activeLink={activeNav}
        onLinkChange={setActiveNav}
        onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
      />
      <div className="dash-app">
        {(sidebarOpen) && (
          <div
            className="dash-mobile-overlay visible"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <Sidebar
          activeItem={activeSidebarItem}
          onItemChange={handleSidebarNavigation}
          isOpen={sidebarOpen}
        />
        <div className="dash-workspace" style={{ overflow: "auto" }}>
          {children}
        </div>
      </div>
    </div>
  );
}
