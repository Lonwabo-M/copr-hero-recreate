import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import {
  LayoutDashboard,
  Package,
  Truck,
  Navigation,
  Users,
  Building2,
  BarChart3,
  Settings,
  LogOut,
  ArrowRight,
  Clock,
  TrendingUp,
  CheckCircle,
} from "lucide-react";

const sidebarItems = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Package, label: "Orders", active: false },
  { icon: Truck, label: "Deliveries", active: false },
  { icon: Navigation, label: "Tracking", active: false },
  { icon: Users, label: "Customers", active: false },
  { icon: Building2, label: "Business", active: false },
  { icon: BarChart3, label: "Analytics", active: false },
  { icon: Settings, label: "Settings", active: false },
];

const recentOrders = [
  {
    id: "LSH-4821",
    from: "Johannesburg CBD",
    to: "Soweto, Block F",
    status: "In Transit",
    statusColor: "var(--lasha-cyan)",
    time: "12 min ago",
    driver: "Thabo M.",
  },
  {
    id: "LSH-4820",
    from: "Pretoria Central",
    to: "Centurion Mall",
    status: "Delivered",
    statusColor: "var(--lasha-lime)",
    time: "34 min ago",
    driver: "Sipho K.",
  },
  {
    id: "LSH-4819",
    from: "Sandton City",
    to: "Alexandra Township",
    status: "In Transit",
    statusColor: "var(--lasha-cyan)",
    time: "45 min ago",
    driver: "Nomsa D.",
  },
  {
    id: "LSH-4818",
    from: "Cape Town CBD",
    to: "Khayelitsha",
    status: "Picked Up",
    statusColor: "var(--lasha-cyan-light)",
    time: "1 hr ago",
    driver: "Lwazi P.",
  },
  {
    id: "LSH-4817",
    from: "Durban Point",
    to: "Umlazi Section Q",
    status: "Delivered",
    statusColor: "var(--lasha-lime)",
    time: "2 hrs ago",
    driver: "Zanele M.",
  },
];

const weeklyData = [
  { day: "Mon", completed: 42, transit: 8, pending: 5 },
  { day: "Tue", completed: 38, transit: 12, pending: 7 },
  { day: "Wed", completed: 55, transit: 6, pending: 3 },
  { day: "Thu", completed: 47, transit: 10, pending: 4 },
  { day: "Fri", completed: 61, transit: 14, pending: 8 },
  { day: "Sat", completed: 34, transit: 5, pending: 2 },
  { day: "Sun", completed: 19, transit: 3, pending: 1 },
];

export default function Dashboard() {
  const { signOut } = useAuthActions();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const maxVal = Math.max(...weeklyData.map((d) => d.completed + d.transit + d.pending));

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        backgroundColor: "var(--lasha-ivory)",
      }}
    >
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className="dash-sidebar"
        style={{
          width: 260,
          backgroundColor: "var(--lasha-navy)",
          display: "flex",
          flexDirection: "column",
          position: "fixed",
          top: 0,
          left: 0,
          bottom: 0,
          zIndex: 50,
          transition: "transform 0.3s ease",
        }}
      >
        {/* Logo */}
        <div style={{ padding: "28px 24px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <span
            style={{
              fontSize: 20,
              fontWeight: 800,
              color: "#ffffff",
              letterSpacing: "-0.02em",
            }}
          >
            Lasha
          </span>
          <p
            className="lasha-label"
            style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, marginTop: 4 }}
          >
            Dashboard
          </p>
        </div>

        {/* Nav items */}
        <div className="flex flex-col gap-1 flex-1" style={{ padding: "16px 12px" }}>
          {sidebarItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "11px 14px",
                  borderRadius: 10,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: item.active ? 600 : 400,
                  fontFamily: "Inter, sans-serif",
                  background: item.active ? "rgba(7,148,181,0.15)" : "transparent",
                  color: item.active ? "var(--lasha-cyan-light)" : "rgba(255,255,255,0.5)",
                  transition: "all 0.2s",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <Icon size={18} strokeWidth={1.5} />
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Quick actions */}
        <div style={{ padding: "16px 12px 12px", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          <a
            href="/"
            className="lasha-btn-primary"
            style={{
              width: "100%",
              justifyContent: "center",
              fontSize: 13,
              padding: "11px 16px",
            }}
          >
            New Delivery
            <ArrowRight size={14} />
          </a>
        </div>

        {/* Sign out */}
        <div style={{ padding: "0 12px 20px" }}>
          <button
            onClick={() => signOut()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontFamily: "Inter, sans-serif",
              background: "transparent",
              color: "rgba(255,255,255,0.4)",
              width: "100%",
              textAlign: "left",
            }}
          >
            <LogOut size={16} strokeWidth={1.5} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main
        className="dash-main"
        style={{
          flex: 1,
          marginLeft: 260,
          minWidth: 0,
        }}
      >
        {/* Header */}
        <header
          style={{
            height: 72,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 40px",
            borderBottom: "1px solid var(--lasha-border-light)",
            backgroundColor: "rgba(244,242,233,0.9)",
            backdropFilter: "blur(8px)",
            position: "sticky",
            top: 0,
            zIndex: 30,
          }}
        >
          <div className="flex items-center gap-4">
            <button
              className="lg:hidden bg-transparent border-none cursor-pointer p-2"
              style={{ color: "var(--lasha-navy)" }}
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label="Toggle sidebar"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <div>
              <h1
                style={{
                  fontSize: 20,
                  fontWeight: 700,
                  color: "var(--lasha-navy)",
                  letterSpacing: "-0.02em",
                }}
              >
                Dashboard
              </h1>
              <p style={{ fontSize: 13, color: "var(--lasha-muted)" }}>
                Logistics operations overview
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                backgroundColor: "var(--lasha-navy)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--lasha-lime)",
              }}
            >
              L
            </div>
          </div>
        </header>

        {/* Content */}
        <div style={{ padding: "32px 40px 64px" }}>
          {/* Stat cards */}
          <div className="dash-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
            {[
              {
                label: "Active Orders",
                value: "24",
                icon: Package,
                change: "+3 today",
                color: "var(--lasha-cyan)",
              },
              {
                label: "In Transit",
                value: "18",
                icon: Truck,
                change: "Avg. 34 min",
                color: "var(--lasha-cyan-light)",
              },
              {
                label: "Today's Revenue",
                value: "R 12,480",
                icon: TrendingUp,
                change: "+12% vs yesterday",
                color: "var(--lasha-lime)",
              },
              {
                label: "Avg. Delivery Time",
                value: "34 min",
                icon: Clock,
                change: "Within target",
                color: "var(--lasha-cyan)",
              },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  style={{
                    background: "#ffffff",
                    border: "1px solid var(--lasha-border-light)",
                    borderRadius: 16,
                    padding: 24,
                  }}
                >
                  <div className="flex items-center justify-between mb-4">
                    <span style={{ fontSize: 13, color: "var(--lasha-muted)", fontWeight: 500 }}>
                      {stat.label}
                    </span>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        backgroundColor: `color-mix(in srgb, ${stat.color} 10%, transparent)`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon size={18} style={{ color: stat.color }} strokeWidth={1.5} />
                    </div>
                  </div>
                  <p
                    style={{
                      fontSize: 30,
                      fontWeight: 700,
                      color: "var(--lasha-navy)",
                      letterSpacing: "-0.02em",
                    }}
                  >
                    {stat.value}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--lasha-muted)", marginTop: 6 }}>
                    {stat.change}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Chart + Performance */}
          <div className="dash-two-col" style={{ marginTop: 24, display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
            {/* Weekly chart */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid var(--lasha-border-light)",
                borderRadius: 16,
                padding: 28,
              }}
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <p style={{ fontSize: 15, fontWeight: 700, color: "var(--lasha-navy)" }}>
                    Weekly Activity
                  </p>
                  <p style={{ fontSize: 12, color: "var(--lasha-muted)" }}>
                    Deliveries this week
                  </p>
                </div>
                <div className="flex gap-4">
                  {[
                    { label: "Completed", color: "var(--lasha-cyan)" },
                    { label: "In Transit", color: "var(--lasha-cyan-light)" },
                    { label: "Pending", color: "var(--lasha-ivory-dark)" },
                  ].map((l) => (
                    <div key={l.label} className="flex items-center gap-2">
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 2,
                          backgroundColor: l.color,
                        }}
                      />
                      <span style={{ fontSize: 11, color: "var(--lasha-muted)" }}>{l.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Bar chart */}
              <div className="flex items-end gap-4" style={{ height: 180 }}>
                {weeklyData.map((d) => {
                  const total = d.completed + d.transit + d.pending;
                  const h = (total / maxVal) * 160;
                  const completedH = (d.completed / total) * h;
                  const transitH = (d.transit / total) * h;
                  const pendingH = (d.pending / total) * h;
                  return (
                    <div key={d.day} className="flex flex-col items-center gap-2 flex-1">
                      <div
                        style={{
                          width: "100%",
                          height: h,
                          display: "flex",
                          flexDirection: "column",
                          justifyContent: "flex-end",
                          borderRadius: 6,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: pendingH,
                            backgroundColor: "var(--lasha-ivory-dark)",
                          }}
                        />
                        <div
                          style={{
                            height: transitH,
                            backgroundColor: "var(--lasha-cyan-light)",
                          }}
                        />
                        <div
                          style={{
                            height: completedH,
                            backgroundColor: "var(--lasha-cyan)",
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 11, color: "var(--lasha-muted)" }}>{d.day}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Performance */}
            <div
              style={{
                background: "#ffffff",
                border: "1px solid var(--lasha-border-light)",
                borderRadius: 16,
                padding: 28,
              }}
            >
              <p style={{ fontSize: 15, fontWeight: 700, color: "var(--lasha-navy)", marginBottom: 24 }}>
                Performance
              </p>
              {[
                { label: "On-Time Rate", value: "94%", bar: 0.94 },
                { label: "Customer Rating", value: "4.8", bar: 0.96 },
                { label: "Active Couriers", value: "12", bar: 0.75 },
                { label: "Completion Rate", value: "98%", bar: 0.98 },
              ].map((p, i) => (
                <div
                  key={p.label}
                  style={{
                    marginBottom: i < 3 ? 20 : 0,
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ fontSize: 13, color: "var(--lasha-body-text)" }}>
                      {p.label}
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: "var(--lasha-navy)" }}>
                      {p.value}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 6,
                      background: "var(--lasha-ivory-dark)",
                      borderRadius: 3,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${p.bar * 100}%`,
                        height: "100%",
                        backgroundColor: "var(--lasha-cyan)",
                        borderRadius: 3,
                        transition: "width 0.6s ease",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent orders */}
          <div
            style={{
              marginTop: 24,
              background: "#ffffff",
              border: "1px solid var(--lasha-border-light)",
              borderRadius: 16,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "20px 28px",
                borderBottom: "1px solid var(--lasha-border-light)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <p style={{ fontSize: 15, fontWeight: 700, color: "var(--lasha-navy)" }}>
                Recent Orders
              </p>
              <span className="lasha-label" style={{ fontSize: 10 }}>
                Last 24 hours
              </span>
            </div>

            {/* Table header - desktop */}
            <div
              className="dash-table-header"
              style={{
                display: "grid",
                gridTemplateColumns: "100px 1fr 1fr 110px 90px 100px",
                padding: "12px 28px",
                borderBottom: "1px solid var(--lasha-border-light)",
              }}
            >
              {["Order", "From", "To", "Status", "Time", "Driver"].map((h) => (
                <span
                  key={h}
                  className="lasha-label"
                  style={{ fontSize: 9, color: "var(--lasha-muted)" }}
                >
                  {h}
                </span>
              ))}
            </div>

            {/* Rows */}
            {recentOrders.map((o, i) => (
              <div
                key={o.id}
                className="dash-table-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "100px 1fr 1fr 110px 90px 100px",
                  padding: "14px 28px",
                  borderBottom:
                    i < recentOrders.length - 1
                      ? "1px solid var(--lasha-border-light)"
                      : "none",
                  alignItems: "center",
                }}
              >
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--lasha-navy)" }}>
                  {o.id}
                </span>
                <span style={{ fontSize: 13, color: "var(--lasha-body-text)" }}>{o.from}</span>
                <span style={{ fontSize: 13, color: "var(--lasha-body-text)" }}>{o.to}</span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: o.statusColor,
                  }}
                >
                  {o.status}
                </span>
                <span style={{ fontSize: 12, color: "var(--lasha-muted)" }}>{o.time}</span>
                <span style={{ fontSize: 13, color: "var(--lasha-body-text)" }}>{o.driver}</span>
              </div>
            ))}
          </div>
        </div>
      </main>

      <style>{`
        @media (max-width: 1024px) {
          .dash-sidebar {
            transform: translateX(-100%);
          }
          .dash-main {
            margin-left: 0 !important;
          }
        }
        @media (max-width: 1024px) {
          .dash-stats {
            grid-template-columns: 1fr 1fr !important;
          }
          .dash-two-col {
            grid-template-columns: 1fr !important;
          }
          .dash-table-header,
          .dash-table-row {
            grid-template-columns: 80px 1fr 1fr 90px !important;
          }
          .dash-table-header > *:nth-child(5),
          .dash-table-header > *:nth-child(6),
          .dash-table-row > *:nth-child(5),
          .dash-table-row > *:nth-child(6) {
            display: none !important;
          }
        }
        @media (max-width: 640px) {
          .dash-stats {
            grid-template-columns: 1fr !important;
          }
          .dash-table-header,
          .dash-table-row {
            grid-template-columns: 1fr 1fr !important;
          }
          .dash-table-header > *:nth-child(3),
          .dash-table-header > *:nth-child(4),
          .dash-table-row > *:nth-child(3),
          .dash-table-row > *:nth-child(4),
          .dash-table-header > *:nth-child(5),
          .dash-table-header > *:nth-child(6),
          .dash-table-row > *:nth-child(5),
          .dash-table-row > *:nth-child(6) {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
}
