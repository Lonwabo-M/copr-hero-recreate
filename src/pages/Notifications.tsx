import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import CustomerShell from "@/components/shells/CustomerShell";
import { Package, CreditCard, AlertTriangle, Bell, Loader2 } from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/pages.css";

const iconMap: Record<string, typeof Package> = {
  delivery: Package,
  payment: CreditCard,
  alert: AlertTriangle,
  system: Bell,
  security: AlertTriangle,
};

export default function Notifications() {
  const notifications = useQuery(api.notifications.service.getMyNotifications, {});
  const markAsRead = useMutation(api.notifications.service.markAsRead);
  const markAllAsRead = useMutation(api.notifications.service.markAllAsRead);

  const handleMarkAllRead = async () => {
    try {
      await markAllAsRead();
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  const handleMarkRead = async (notificationId: string) => {
    try {
      await markAsRead({ notificationId: notificationId as any });
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  };

  const getTimeAgo = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} day${days > 1 ? "s" : ""} ago`;
    return new Date(timestamp).toLocaleDateString("en-ZA", {
      day: "2-digit",
      month: "short",
    });
  };

  return (
    <CustomerShell activeItem="Notifications">
      <div className="dash-workspace" style={{ overflow: "auto" }}>
        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">Notifications</h1>
            <p className="page-subtitle">Stay updated on your deliveries and account activity</p>
            {notifications && notifications.length > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{
                  marginTop: 8,
                  padding: "6px 12px",
                  fontSize: 13,
                  color: "#0794B5",
                  background: "none",
                  border: "1px solid #0794B5",
                  borderRadius: 6,
                  cursor: "pointer",
                }}
              >
                Mark all as read
              </button>
            )}
          </div>

          {notifications === undefined ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: "#999" }} />
            </div>
          ) : notifications.length === 0 ? (
            <div className="empty-state" style={{ padding: 60 }}>
              <div className="empty-state-icon"><Bell size={24} /></div>
              <div className="empty-state-title">No notifications</div>
              <div className="empty-state-desc">You're all caught up! Notifications will appear here.</div>
            </div>
          ) : (
            <div className="notification-list">
              {notifications.map((n) => {
                const Icon = iconMap[n.type] ?? Bell;
                return (
                  <div
                    key={n._id}
                    className={`notification-item ${!n.isRead ? "unread" : ""}`}
                    onClick={() => !n.isRead && handleMarkRead(n._id)}
                    style={{ cursor: n.isRead ? "default" : "pointer" }}
                  >
                    <div className={`notification-icon ${n.type}`}><Icon size={20} /></div>
                    <div className="notification-content">
                      <div className="notification-title">{n.title}</div>
                      <div className="notification-desc">{n.description}</div>
                    </div>
                    <div className="notification-time">{getTimeAgo(n.createdAt)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </CustomerShell>
  );
}
