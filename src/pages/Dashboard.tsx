import { useState, useEffect } from "react";
import { useAuthActions } from "@convex-dev/auth/react";
import TopNavigation from "@/components/dashboard/TopNavigation";
import Sidebar from "@/components/dashboard/Sidebar";
import OrderPanel from "@/components/dashboard/OrderPanel";
import DetailsPanel from "@/components/dashboard/DetailsPanel";
import { orders } from "@/data/orders";
import "@/styles/dashboard.css";

export default function Dashboard() {
  const { signOut } = useAuthActions();
  const [selectedOrder, setSelectedOrder] = useState(orders[0]?.id ?? "");
  const [activeFilter, setActiveFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSidebarItem, setActiveSidebarItem] = useState("Activity Center");
  const [activeNav, setActiveNav] = useState("Home");
  const [activeDetailTab, setActiveDetailTab] = useState("Vehicle Details");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const selectedOrderData = orders.find((o) => o.id === selectedOrder);

  // Reset detail tab when order changes
  useEffect(() => {
    setActiveDetailTab("Vehicle Details");
  }, [selectedOrder]);

  // Close sidebar on resize to desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 1024) {
        setSidebarOpen(false);
        setDetailsOpen(false);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleSelectOrder = (id: string) => {
    setSelectedOrder(id);
    // On mobile, open the details panel
    if (window.innerWidth <= 1024) {
      setDetailsOpen(true);
    }
  };

  const handleSidebarNavigation = (item: string) => {
    setActiveSidebarItem(item);
    // Navigate based on sidebar item
    if (item === "Activity Center" || item === "Past Deliveries") {
      window.location.href = "/dashboard";
    } else if (item === "Request Delivery") {
      window.location.href = "/request-delivery";
    } else if (item === "Track Delivery") {
      window.location.href = "/track-delivery";
    } else if (item === "Wallet") {
      window.location.href = "/wallet";
    } else if (item === "Settings") {
      window.location.href = "/settings";
    } else if (item === "Log out") {
      signOut();
    }
  };

  return (
    <div className="dashboard">
      {/* Top Navigation */}
      <TopNavigation
        activeLink={activeNav}
        onLinkChange={setActiveNav}
        onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
      />

      {/* App body */}
      <div className="dash-app">
        {/* Mobile overlay */}
        {(sidebarOpen || detailsOpen) && (
          <div
            className="dash-mobile-overlay visible"
            onClick={() => {
              setSidebarOpen(false);
              setDetailsOpen(false);
            }}
          />
        )}

        {/* Sidebar */}
        <Sidebar
          activeItem={activeSidebarItem}
          onItemChange={handleSidebarNavigation}
          isOpen={sidebarOpen}
        />

        {/* Workspace */}
        <div className="dash-workspace">
          {/* Order panel */}
          <OrderPanel
            orders={orders}
            selectedId={selectedOrder}
            searchQuery={searchQuery}
            activeFilter={activeFilter}
            onSearchChange={setSearchQuery}
            onFilterChange={setActiveFilter}
            onSelectOrder={handleSelectOrder}
          />

          {/* Details panel */}
          {selectedOrderData && (
            <DetailsPanel
              order={selectedOrderData}
              activeTab={activeDetailTab}
              onTabChange={setActiveDetailTab}
              isOpen={detailsOpen}
              onClose={() => setDetailsOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
