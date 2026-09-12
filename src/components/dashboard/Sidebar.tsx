import {
  LayoutDashboard,
  History,
  Package,
  MapPin,
  Truck,
  FileText,
  Wallet,
  CreditCard,
  Bell,
  CircleHelp,
  Scale,
  Download,
  Settings,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import type { NavItem } from "@/components/shells/navigation";

interface SidebarProps {
  activeItem: string;
  onItemChange: (item: string) => void;
  isOpen: boolean;
  /** Navigation entries for the current application area (role-scoped). */
  items: NavItem[];
}

// ─── Icon registry ───────────────────────────────────────────────────────────
// Preserves the original per-item icons without coupling navigation configs
// (pure data) to lucide-react.
const ICONS: Record<string, LucideIcon> = {
  "Activity Center": LayoutDashboard,
  "Past Deliveries": History,
  "Request Delivery": Package,
  "Track Delivery": MapPin,
  "Active Delivery": Truck,
  Invoices: FileText,
  Wallet: Wallet,
  "Make Payment": CreditCard,
  Notifications: Bell,
  Help: CircleHelp,
  Legal: Scale,
  Downloads: Download,
  Settings: Settings,
  "Log out": LogOut,
  // Operations Centre entries
  "Operations Centre": Truck,
};

// ─── Sidebar (shared, area-scoped) ───────────────────────────────────────────
// Renders the navigation entries handed to it by the surrounding AppShell —
// which derives them from the shell's application area. No single global nav
// list exists anymore; each application area only ever receives its own items.
// Visual styling is unchanged (dash-sidebar classes from dashboard.css).

export default function Sidebar({
  activeItem,
  onItemChange,
  isOpen,
  items,
}: SidebarProps) {
  return (
    <aside className={`dash-sidebar ${isOpen ? "open" : ""}`}>
      <div className="dash-sidebar-items">
        {items.map((item) => {
          const Icon = ICONS[item.label] ?? Package;
          const isActive = activeItem === item.label;
          return (
            <button
              key={item.label}
              className={`dash-sidebar-item ${isActive ? "active" : ""}`}
              onClick={() => onItemChange(item.label)}
            >
              <Icon size={20} strokeWidth={1.5} />
              <span>{item.label}</span>
              {item.hasNotif && !isActive && <span className="notif-dot" />}
            </button>
          );
        })}
      </div>

      <div className="dash-sidebar-bottom">
        <button
          className="dash-sidebar-item"
          onClick={() => onItemChange("Log out")}
        >
          <LogOut size={20} strokeWidth={1.5} />
          <span>Log out</span>
        </button>
      </div>
    </aside>
  );
}
