import { useEffect, useState } from "react";
import { Menu, ShieldCheck, Loader2 } from "lucide-react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { clearAllOfflineData } from "@/lib/offline/db";
import { useNavigate } from "react-router";
import Sidebar from "@/components/dashboard/Sidebar";
import LashaLogo from "@/components/branding/LashaLogo";
import { useAuth } from "@/hooks/use-auth";
import { ROLES } from "@/convex/schema";
import { canAccessArea, AREA_HOME } from "./roleAccess";
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

  const navItems: NavItem[] = AREA_NAVIGATION[area];

  // ── Cross-area access points (testing loop) ──────────────────────────────
  // Sidebar entries for other areas claim a marked, reversible test elevation
  // (users.testAccess) and navigate once the reactive user record carries the
  // target role, so RoleGate admits the route without a refresh. Real staff
  // navigate straight through. Inside an elevated area, one click releases and
  // restores the pre-test role.
  const { user } = useAuth();
  const claimTestAccess = useMutation(api.users.testAccess.claimTestAreaAccess);
  const releaseTestAccess = useMutation(api.users.testAccess.releaseTestAreaAccess);
  const testAccessState = useQuery(api.users.testAccess.getTestAccessState, {});
  const [pendingArea, setPendingArea] = useState<AppArea | null>(null);
  const [releasing, setReleasing] = useState(false);

  const isTestElevated = testAccessState?.testElevated === true;
  // The backend testElevated marker is authoritative: real staff are never
  // marked, and test-elevated accounts always carry a staff role while inside
  // an elevated area — so the role must NOT gate the release affordance
  // (otherwise the button vanishes the moment elevation lands and the tester
  // is trapped in the area).

  const ROLE_FOR_AREA: Record<AppArea, string> = {
    customer: ROLES.CUSTOMER,
    driver: ROLES.DRIVER,
    operations: ROLES.OPERATIONS,
    admin: ROLES.SUPER_ADMIN,
  };

  useEffect(() => {
    if (pendingArea && user?.role === ROLE_FOR_AREA[pendingArea]) {
      setPendingArea(null);
      navigate(AREA_HOME[pendingArea]);
    }
  }, [pendingArea, user?.role, navigate]);

  const handleOpenArea = async (target: AppArea) => {
    if (canAccessArea(user?.role as string | undefined, target)) {
      navigate(AREA_HOME[target]);
      return;
    }
    setPendingArea(target);
    try {
      await claimTestAccess({ area: target as "driver" | "operations" | "admin" });
    } catch {
      setPendingArea(null);
    }
  };

  const handleReleaseTestAccess = async () => {
    setReleasing(true);
    try {
      await releaseTestAccess({});
    } finally {
      setReleasing(false);
    }
  };

  // Reactive unread count — the notification indicator reflects the user's
  // actual unread notifications via the existing session-scoped Convex query
  // (getUnreadCount). Convex push updates it live; it is never decorative.
  // While the session is resolving this query legitimately returns the
  // unauthenticated placeholder — the dot simply stays hidden until it lands.
  const unreadCount = useQuery(api.notifications.service.getUnreadCount);
  const hasUnread = (unreadCount ?? 0) > 0;

  // Matches the resize behaviour every page previously implemented inline.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 1024) setSidebarOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleNav = (item: NavItem) => {
    // Cross-area sidebar entries are the access points: navigate directly when
    // the role already admits the area, claim reversible test elevation
    // otherwise, and always land once the reactive role arrives. Every
    // cross-area route MUST be mapped here — an unmapped route navigates raw
    // and RoleGate silently bounces the user back to their home area (the
    // "Admin Portal does nothing" bug).
    const crossArea: Partial<Record<string, AppArea>> = {
      "/operations": "operations",
      "/driver": "driver",
      "/admin/driver-approvals": "admin",
      "/dashboard": "customer",
    };
    const targetArea = crossArea[item.route] ?? (item.route.startsWith("/admin") ? "admin" : undefined);
    if (targetArea) {
      void handleOpenArea(targetArea);
      return;
    }
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
          {brandLabel && (
            <span className="dash-topnav-logo-text">{brandLabel}</span>
          )}
        </div>

        <div className="dash-topnav-right">
          {/* Test-elevation release — only while operating under a claimed
              (reversible) elevation. */}
          {isTestElevated && (
            <button
              className="dash-topnav-profile"
              onClick={handleReleaseTestAccess}
              disabled={releasing}
              aria-label="Release test access and return to customer portal"
              title="Release test access"
              style={{ width: "auto", padding: "0 14px", gap: 7, fontSize: 12.5, fontWeight: 600 }}
            >
              {releasing ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <ShieldCheck size={15} />
              )}
              Release test access
            </button>
          )}
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
