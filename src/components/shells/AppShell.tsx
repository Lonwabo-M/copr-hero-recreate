import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useAuthActions } from "@convex-dev/auth/react";
import { clearAllOfflineData } from "@/lib/offline/db";
import { useNavigate } from "react-router";
import Sidebar from "@/components/dashboard/Sidebar";
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
  /** Logo variant: Dashboard used the SVG logo, other pages the "L" mark. */
  logo?: "img" | "icon";
  /** Custom brand text after the logo (defaults to "Lasha"). */
  brandLabel?: string;
}

const STATIC_LINKS = ["Home", "About Us", "Services", "Contact US"];

const LOGOUT_LABEL = "Log out";

export default function AppShell({
  area,
  children,
  activeItem,
  logo = "icon",
  brandLabel,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeLink, setActiveLink] = useState("Home");
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

  const navItems: NavItem[] = AREA_NAVIGATION[area];

  // Matches the resize behaviour every page previously implemented inline.
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 1024) setSidebarOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleNav = (item: NavItem) => {
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
    signOut();
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
          {logo === "img" ? (
            <img
              src="/logo.svg"
              alt="Lasha"
              style={{ height: 28 }}
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="lasha-logo-icon">
              <span>L</span>
            </div>
          )}
          <span className="dash-topnav-logo-text">{brandLabel ?? "Lasha"}</span>
        </div>

        <nav className="dash-topnav-links">
          {STATIC_LINKS.map((link) => (
            <button
              key={link}
              className={`dash-topnav-link ${activeLink === link ? "active" : ""}`}
              onClick={() => setActiveLink(link)}
            >
              {link}
              {activeLink === link && (
                <span className="dash-topnav-link-underline" />
              )}
            </button>
          ))}
        </nav>

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

        {/* Area-scoped sidebar */}
        <Sidebar
          activeItem={activeItem}
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
