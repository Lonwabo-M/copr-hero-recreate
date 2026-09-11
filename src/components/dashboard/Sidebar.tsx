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
} from "lucide-react";

interface SidebarProps {
  activeItem: string;
  onItemChange: (item: string) => void;
  isOpen: boolean;
}

const sidebarItems = [
  { icon: LayoutDashboard, label: "Activity Center" },
  { icon: History, label: "Past Deliveries" },
  { icon: Package, label: "Request Delivery" },
  { icon: MapPin, label: "Track Delivery" },
  { icon: Truck, label: "Active Delivery" },
  { icon: FileText, label: "Invoices" },
  { icon: Wallet, label: "Wallet" },
  { icon: CreditCard, label: "Make Payment" },
  { icon: Bell, label: "Notifications", hasNotif: true },
  { icon: CircleHelp, label: "Help" },
  { icon: Scale, label: "Legal" },
  { icon: Download, label: "Downloads" },
  { icon: Settings, label: "Settings" },
];

const bottomItems = [
  { icon: LogOut, label: "Log out" },
];

export default function Sidebar({ activeItem, onItemChange, isOpen }: SidebarProps) {
  return (
    <aside className={`dash-sidebar ${isOpen ? "open" : ""}`}>
      <div className="dash-sidebar-items">
        {sidebarItems.map((item) => {
          const Icon = item.icon;
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
        {bottomItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeItem === item.label;
          return (
            <button
              key={item.label}
              className={`dash-sidebar-item ${isActive ? "active" : ""}`}
              onClick={() => onItemChange(item.label)}
            >
              <Icon size={20} strokeWidth={1.5} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
