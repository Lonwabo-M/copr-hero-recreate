import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Building2,
  Clock,
  DollarSign,
  LayoutDashboard,
  LogOut,
  MapPin,
  Package,
  Plus,
  Settings,
  Truck,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: Package, label: "Orders" },
  { icon: Truck, label: "Deliveries" },
  { icon: MapPin, label: "Tracking" },
  { icon: Users, label: "Customers" },
  { icon: Building2, label: "Business" },
  { icon: BarChart3, label: "Analytics" },
  { icon: Settings, label: "Settings" },
];

const recentOrders = [
  {
    id: "ORD-1089",
    customer: "Sarah Mitchell",
    from: "123 Market St",
    to: "456 Oak Ave",
    status: "In Transit",
    price: "$12.50",
    time: "2 min ago",
  },
  {
    id: "ORD-1088",
    customer: "David Chen",
    from: "789 Pine Rd",
    to: "321 Elm St",
    status: "Delivered",
    price: "$8.75",
    time: "18 min ago",
  },
  {
    id: "ORD-1087",
    customer: "Amara Obi",
    from: "555 Tech Blvd",
    to: "888 Health Way",
    status: "Picking Up",
    price: "$15.00",
    time: "25 min ago",
  },
  {
    id: "ORD-1086",
    customer: "James Wright",
    from: "111 Commerce Dr",
    to: "222 Residential Ln",
    status: "Confirmed",
    price: "$11.25",
    time: "32 min ago",
  },
  {
    id: "ORD-1085",
    customer: "Priya Patel",
    from: "444 Main St",
    to: "777 Lake View",
    status: "Delivered",
    price: "$9.50",
    time: "1 hr ago",
  },
];

const statusColors: Record<string, string> = {
  "In Transit": "bg-blue-500/10 text-blue-700",
  Delivered: "bg-green-500/10 text-green-700",
  "Picking Up": "bg-amber-500/10 text-amber-700",
  Confirmed: "bg-purple-500/10 text-purple-700",
  Pending: "bg-gray-500/10 text-gray-700",
};

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Top Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-xs">
              L
            </div>
            <span className="text-lg font-bold tracking-tight hidden sm:inline">
              Lasha
            </span>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium">
                {user?.name || "Dashboard"}
              </div>
              <div className="text-xs text-muted-foreground">
                {user?.email || "Business Account"}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 cursor-pointer"
              onClick={handleSignOut}
            >
              <LogOut className="size-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden lg:flex flex-col w-60 border-r border-border/50 bg-background/50 min-h-[calc(100vh-52px)] p-4 gap-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                item.active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              }`}
            >
              <item.icon className="size-4" />
              {item.label}
            </button>
          ))}

          <div className="mt-auto pt-4 border-t border-border/50">
            <div className="rounded-xl bg-muted/60 p-4">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Quick Actions
              </div>
              <Button size="sm" className="w-full gap-2 cursor-pointer">
                <Plus className="size-3.5" />
                New Delivery
              </Button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6 max-w-6xl">
          {/* Welcome */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">
              Welcome{user?.name ? `, ${user.name}` : " to Lasha"}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Here is what is happening with your deliveries today.
            </p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card className="border-border/60 shadow-none">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Active Orders
                    </p>
                    <p className="text-2xl font-bold mt-1">24</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-green-600 font-medium">
                        +3
                      </span>
                      <span className="text-xs text-muted-foreground">
                        from yesterday
                      </span>
                    </div>
                  </div>
                  <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Package className="size-5 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-none">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      In Transit
                    </p>
                    <p className="text-2xl font-bold mt-1">12</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-green-600 font-medium">
                        98%
                      </span>
                      <span className="text-xs text-muted-foreground">
                        on-time rate
                      </span>
                    </div>
                  </div>
                  <div className="size-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <Truck className="size-5 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-none">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      {"Today's Revenue"}
                    </p>
                    <p className="text-2xl font-bold mt-1">$2,847</p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-green-600 font-medium">
                        +18%
                      </span>
                      <span className="text-xs text-muted-foreground">
                        vs yesterday
                      </span>
                    </div>
                  </div>
                  <div className="size-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                    <DollarSign className="size-5 text-green-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/60 shadow-none">
              <CardContent className="p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Avg. Delivery Time
                    </p>
                    <p className="text-2xl font-bold mt-1">
                      18{" "}
                      <span className="text-sm font-normal text-muted-foreground">
                        min
                      </span>
                    </p>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-green-600 font-medium">
                        -2 min
                      </span>
                      <span className="text-xs text-muted-foreground">
                        improvement
                      </span>
                    </div>
                  </div>
                  <div className="size-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <Clock className="size-5 text-amber-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
            {/* Delivery Activity Chart */}
            <Card className="lg:col-span-2 border-border/60 shadow-none">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">
                    Delivery Activity
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-xs cursor-pointer"
                  >
                    This Week
                    <ArrowUpRight className="size-3" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-48 flex items-end gap-2 px-2">
                  {[
                    { day: "Mon", values: [20, 15, 25] },
                    { day: "Tue", values: [30, 20, 15] },
                    { day: "Wed", values: [25, 30, 20] },
                    { day: "Thu", values: [35, 25, 30] },
                    { day: "Fri", values: [40, 35, 25] },
                    { day: "Sat", values: [30, 20, 35] },
                    { day: "Sun", values: [15, 10, 20] },
                  ].map((d) => (
                    <div
                      key={d.day}
                      className="flex-1 flex flex-col items-center gap-1"
                    >
                      <div
                        className="w-full flex items-end gap-0.5"
                        style={{ height: "140px" }}
                      >
                        {d.values.map((v, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-t-sm transition-colors"
                            style={{
                              height: `${v * 2.8}px`,
                              backgroundColor:
                                i === 0
                                  ? "oklch(0.37 0.12 165 / 0.7)"
                                  : i === 1
                                    ? "oklch(0.37 0.12 165 / 0.35)"
                                    : "oklch(0.37 0.12 165 / 0.15)",
                            }}
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {d.day}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-4 mt-4 justify-center">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="size-2 rounded-full bg-primary/70" />
                    Completed
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="size-2 rounded-full bg-primary/35" />
                    In Transit
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <div className="size-2 rounded-full bg-primary/15" />
                    Pending
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card className="border-border/60 shadow-none">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">
                  Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  {
                    label: "On-Time Rate",
                    value: "98.2%",
                    icon: Clock,
                    color: "text-green-600",
                  },
                  {
                    label: "Customer Rating",
                    value: "4.9/5",
                    icon: Activity,
                    color: "text-amber-600",
                  },
                  {
                    label: "Active Couriers",
                    value: "16",
                    icon: Users,
                    color: "text-blue-600",
                  },
                  {
                    label: "Completion Rate",
                    value: "99.1%",
                    icon: Package,
                    color: "text-primary",
                  },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <stat.icon className={`size-4 ${stat.color}`} />
                      <span className="text-sm text-muted-foreground">
                        {stat.label}
                      </span>
                    </div>
                    <span className="text-sm font-semibold">{stat.value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Recent Orders */}
          <Card className="border-border/60 shadow-none">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold">
                  Recent Orders
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs cursor-pointer"
                >
                  View All
                  <ArrowUpRight className="size-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 pr-4">
                        Order
                      </th>
                      <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 pr-4">
                        Customer
                      </th>
                      <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 pr-4">
                        Route
                      </th>
                      <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 pr-4">
                        Status
                      </th>
                      <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3 pr-4">
                        Price
                      </th>
                      <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider pb-3">
                        Time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.map((order) => (
                      <tr
                        key={order.id}
                        className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="py-3.5 pr-4 text-sm font-medium">
                          {order.id}
                        </td>
                        <td className="py-3.5 pr-4 text-sm text-muted-foreground">
                          {order.customer}
                        </td>
                        <td className="py-3.5 pr-4 text-sm text-muted-foreground">
                          {order.from} → {order.to}
                        </td>
                        <td className="py-3.5 pr-4">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                              statusColors[order.status] ||
                              "bg-gray-500/10 text-gray-700"
                            }`}
                          >
                            {order.status}
                          </span>
                        </td>
                        <td className="py-3.5 pr-4 text-sm font-medium text-right">
                          {order.price}
                        </td>
                        <td className="py-3.5 text-sm text-muted-foreground text-right">
                          {order.time}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3">
                {recentOrders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-xl border border-border/50 p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{order.id}</span>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          statusColors[order.status] ||
                          "bg-gray-500/10 text-gray-700"
                        }`}
                      >
                        {order.status}
                      </span>
                    </div>
                    <div className="text-sm text-muted-foreground mb-1">
                      {order.customer}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {order.from} → {order.to}
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-sm font-semibold">
                        {order.price}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {order.time}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
