import {
  LayoutDashboard,
  History,
  PackagePlus,
  FileText,
  Wallet,
  CreditCard,
  Bell,
  CircleHelp,
  Scale,
  Download,
} from "lucide-react";

interface SidebarProps {
  activeItem: string;
  onItemChange: (item: string) => void;
  isOpen: boolean;
}

const sidebarItems = [
  { icon: LayoutDashboard, label: "Activity Center" },
  { icon: History, label: "Past Deliveries" },
  { icon: PackagePlus, label: "Request Delivery" },
  { icon: FileText, label: "Invoices" },
  { icon: Wallet, label: "Wallet" },
  { icon: CreditCard, label: "Make Payment" },
  { icon: Bell, label: "Notifications", hasNotif: true },
  { icon: CircleHelp, label: "Help" },
  { icon: Scale, label: "Legal" },
  { icon: Download, label: "Downloads" },
];

export default function Sidebar({ activeItem, onItemChange, isOpen }: SidebarProps) {
  return (
    <aside className={`dash-sidebar ${isOpen ? "open" : ""}`}>
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
    </aside>
  );
}
