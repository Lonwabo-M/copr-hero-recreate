import { useEffect, useRef, useState } from "react";
import { Menu, ShieldCheck, Loader2 } from "lucide-react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { clearAllOfflineData } from "@/lib/offline/db";
import { useNavigate } from "react-router";
import Sidebar from "@/components/dashboard/Sidebar";
import LashaLogo from "@/components/branding/LashaLogo";
import { useAuth } from "@/hooks/use-auth";
import { AREA_HOME } from "./roleAccess";
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
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  const navItems: NavItem[] = AREA_NAVIGATION[area];

  // ── Cross-area access points (testing loop) ──────────────────────────────
  // Access points NAVIGATE FIRST — see handleOpenArea. The only cross-area
  // state this shell owns is the "Release test access" affordance for the
  // marked, reversible elevation (users.testAccess) the destination guard
  // claimed. Real staff are never marked.
  const releaseTestAccess = useMutation(api.users.testAccess.releaseTestAreaAccess);
  const testAccessState = useQuery(api.users.testAccess.getTestAccessState, {});
  const [releasing, setReleasing] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const isTestElevated = testAccessState?.testElevated === true;
  // The backend testElevated marker is authoritative: real staff are never
  // marked, and test-elevated accounts always carry a staff role while inside
  // an elevated area — so the role must NOT gate the release affordance
  // (otherwise the button vanishes the moment elevation lands and the tester
  // is trapped in the area).

  const handleOpenArea = (target: AppArea) => {
    // Immediate client-side navigation. The destination route's RoleGate owns
    // admission: for walk-ins it claims the reversible elevation with its own
    // spinner and reload safety net. Racing the elevation from HERE is what
    // broke Driver/Admin clicks — the role flip unmounts the current route's
    // guard mid-navigation and bounces the user back to their old area.
    setAccessError(null);
    navigateRef.current(AREA_HOME[target]);
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
    // Cross-area sidebar entries are the access points: navigate immediately
    // and let the destination RoleGate admit or elevate. Every cross-area
    // route MUST be mapped here — an unmapped route navigates raw and
    // RoleGate silently bounces the user back to their home area (the
    // "Admin Portal does nothing" bug).
    const crossArea: Partial<Record<string, AppArea>> = {
      "/operations": "operations",
      "/driver": "driver",
      "/admin/driver-approvals": "admin",
      "/dashboard": "customer",
    };
    const targetArea = crossArea[item.route] ?? (item.route.startsWith("/admin") ? "admin" : undefined);
    if (targetArea) {
      handleOpenArea(targetArea);
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
          {brandLabel ? (
            <span className="dash-topnav-logo-text">{brandLabel}</span>
          ) : businessName ? (
            <span className="dash-topnav-org" title={businessName}>
              {businessName}
            </span>
          ) : null}
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

        {/* Cross-area access failure — surfaced, never swallowed. */}
        {accessError && (
          <div
            role="alert"
            style={{
              position: "fixed",
              top: 100,
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 60,
              maxWidth: 440,
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 16px",
              borderRadius: 12,
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              boxShadow: "0 8px 24px rgba(32,32,32,0.12)",
              fontFamily: "Inter, sans-serif",
              fontSize: 13,
              fontWeight: 500,
              color: "#B91C1C",
            }}
          >
            <ShieldCheck size={16} />
            <span style={{ flex: 1 }}>{accessError}</span>
            <button
              onClick={() => setAccessError(null)}
              aria-label="Dismiss"
              style={{
                background: "none",
                border: "none",
                color: "#B91C1C",
                cursor: "pointer",
                fontFamily: "inherit",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Page content */}
        {children}
      </div>
    </div>
  );
}
