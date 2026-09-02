import { Package, CreditCard, AlertTriangle } from "lucide-react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import "@/styles/pages.css";

const notifications = [
  {
    id: 1,
    type: "delivery",
    title: "Delivery Completed",
    desc: "Order #55667 has been successfully delivered to Fourways Mall.",
    time: "2 min ago",
    unread: true,
  },
  {
    id: 2,
    type: "payment",
    title: "Payment Received",
    desc: "R1,450.00 has been credited to your Lasha Wallet from INV-2024-003.",
    time: "1 hour ago",
    unread: true,
  },
  {
    id: 3,
    type: "delivery",
    title: "Driver Assigned",
    desc: "Lusanda Miya has been assigned to order #55668 for pickup at Sammy's Kitchen.",
    time: "3 hours ago",
    unread: false,
  },
  {
    id: 4,
    type: "alert",
    title: "Delivery Delayed",
    desc: "Order #55660 is experiencing a 30-minute delay due to traffic on the N1.",
    time: "5 hours ago",
    unread: false,
  },
  {
    id: 5,
    type: "payment",
    title: "Invoice Generated",
    desc: "INV-2024-007 for R2,340.00 has been generated and is awaiting payment.",
    time: "Yesterday",
    unread: false,
  },
  {
    id: 6,
    type: "delivery",
    title: "Pickup Scheduled",
    desc: "Your pickup at Sandton City has been scheduled for tomorrow at 09:00 AM.",
    time: "Yesterday",
    unread: false,
  },
];

const iconMap = {
  delivery: Package,
  payment: CreditCard,
  alert: AlertTriangle,
};

export default function Notifications() {
  return (
    <DashboardLayout activeSidebarItem="Notifications">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">Notifications</h1>
          <p className="page-subtitle">Stay updated on your deliveries and account activity</p>
        </div>

        <div className="notification-list">
          {notifications.map((n) => {
            const Icon = iconMap[n.type as keyof typeof iconMap];
            return (
              <div key={n.id} className={`notification-item ${n.unread ? "unread" : ""}`}>
                <div className={`notification-icon ${n.type}`}>
                  <Icon size={20} />
                </div>
                <div className="notification-content">
                  <div className="notification-title">{n.title}</div>
                  <div className="notification-desc">{n.desc}</div>
                </div>
                <div className="notification-time">{n.time}</div>
              </div>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
