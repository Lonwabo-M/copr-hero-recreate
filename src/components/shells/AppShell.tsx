import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { clearAllOfflineData } from "@/lib/offline/db";
import { useNavigate } from "react-router";
import Sidebar from "@/components/dashboard/Sidebar";
import LashaLogo from "@/components/branding/LashaLogo";
import { useAuth } from "@/hooks/use-auth";
import {
  AREA_LABELS,
  AREA_NAVIGATION,
  type AppArea,
  type NavItem,
} from "./navigation";

// ─── AppShell ────────────────────────────────────────────────────────────────
// Single implementation of the Lasha app chrome that every page previously
// duplicated inline (dash-topnav header + dash-app + mobile overlay + Sidebar).
// The navigation list is scoped to the shell's application area, so a Driver
// shell never renders customer entries and vice versa. Route guards (RoleGate)
// enforce who can reach a shell; the shell itself enforces which nav is shown.

interface AppShellProps {
  area: AppArea;
  /** Which page's content to render inside the shell. */
  children: React.ReactNode;
  /** Sidebar item to highlight for the current page. */
  activeItem: string;
  /** Optional area qualifier rendered beside the logo (e.g. "Lasha Admin").
   *  The plain "Lasha" text is gone — the mark IS the brand. */
  brandLabel?: string;
}

const LOGOUT_LABEL = "Log out";

export default function AppShell({
  area,
  children,
  activeItem,
  brandLabel,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  // Session user — used only for the business-identity subscription below;
  // area admission is owned entirely by RoleGate.
  const { user } = useAuth();

  const navItems: NavItem[] = AREA_NAVIGATION[area];

  // Reactive unread count — the notification indicator reflects the user's
  // actual unread notifications via the existing session-scoped Convex query
  // (getUnreadCount). Convex push updates it live; it is never decorative.
  // While the session is resolving this query legitimately returns the
  // unauthenticated placeholder — the dot simply stays hidden until it lands.
  const unreadCount = useQuery(api.notifications.service.getUnreadCount);
  const hasUnread = (unreadCount ?? 0) > 0;

  // ── Business identity (Customer Portal) ───────────────────────────────────
  // Every customer account belongs to a business (B2B and B2C alike — the
  // business is the account holder, the person is its contact). The header
  // therefore names the BUSINESS, not the individual. Subscribed only once the
  // session user is resolved so an early unauthenticated call can never poison
  // the reactive subscription.
  const business = useQuery(
    api.users.businessProfile.getMyBusiness,
    area === "customer" && user ? {} : "skip",
  );
  const businessName = area === "customer" ? business?.name ?? null : null;

  // Matches the resize behaviour every page previously implemented inline.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 1024) setSidebarOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleNav = (item: NavItem) => {
    // Navigation is area-scoped. There are no cross-area access points: a
    // Customer, Driver, Operations and Admin shell each render only routes
    // belonging to their own realm/area.
    navigate(item.route);
  };

  const handleLogout = () => {
    // Offline resilience hygiene: queued operational data (buffered GPS,
    // cached deliveries) is session-scoped and must never survive logout —
    // it would leak one driver's location trail into another session on a
    // shared device. Cleared BEFORE sign-out so it runs while still mounted.
    void clearAllOfflineData().catch((err) =>
      console.warn("[logout] offline data cleanup failed:", err)
  );
    // Land on the public landing page after logout. A full load here is
    // deliberate: it is immune to the RequireAuth redirect race (the router
    // can bounce to /auth the moment isAuthenticated flips) and guarantees a
    // clean post-session state.
    void signOut().finally(() => {
      window.location.assign("/");
    });
  };

  return (
    <div className="dashboard">
      {/* Top Navigation */}
      <header className="dash-topnav">
        <div className="dash-topnav-logo">
          <button
            className="dash-mobile-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <Menu size={22} />
          </button>
          {/* Logo — actual Lasha mark, cropped to its visible bounds; sized
              to sit comfortably inside the 90px header */}
          <LashaLogo height={34} />
          {brandLabel ? (
            <span className="dash-topnav-logo-text">{brandLabel}</span>
          ) : businessName ? (
            <span className="dash-topnav-org" title={businessName}>
              {businessName}
            </span>
          ) : null}
        </div>

        <div className="dash-topnav-right">
          <button
            className="dash-topnav-profile"
            aria-label={AREA_LABELS[area]}
            title={AREA_LABELS[area]}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </button>
        </div>
      </header>

      {/* App body */}
      <div className="dash-app">
        {/* Mobile overlay */}
        {sidebarOpen && (
          <div
            className="dash-mobile-overlay visible"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Area-scoped sidebar — the unread badge rides along so the
            Notifications entry reflects the live unread count. */}
        <Sidebar
          activeItem={activeItem}
          unreadCount={hasUnread && unreadCount ? unreadCount : 0}
          onItemChange={(label) => {
            if (label === LOGOUT_LABEL) {
              handleLogout();
              return;
            }
            const item = navItems.find((n) => n.label === label);
            if (item) handleNav(item);
          }}
          isOpen={sidebarOpen}
          items={navItems}
        />

        {/* Page content */}
        {children}
      </div>
    </div>
  );
}
