import SearchBar from "./SearchBar";
import OrderFilters from "./OrderFilters";
import OrderCard from "./OrderCard";
import type { Order } from "@/types/dashboard";

interface OrderPanelProps {
  orders: Order[];
  selectedId: string;
  searchQuery: string;
  activeFilter: string;
  onSearchChange: (query: string) => void;
  onFilterChange: (filter: string) => void;
  onSelectOrder: (id: string) => void;
}

export default function OrderPanel({
  orders,
  selectedId,
  searchQuery,
  activeFilter,
  onSearchChange,
  onFilterChange,
  onSelectOrder,
}: OrderPanelProps) {
  // Filter and search
  const filtered = orders.filter((order) => {
    const matchesFilter =
      activeFilter === "All" ||
      (activeFilter === "Pending" && order.status === "Pending") ||
      (activeFilter === "In Transit" && order.status === "In Transit");
    const matchesSearch = order.id.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="dash-order-panel">
      <SearchBar value={searchQuery} onChange={onSearchChange} />
      <OrderFilters activeFilter={activeFilter} onFilterChange={onFilterChange} />

      <div className="dash-order-list">
        {filtered.map((order) => (
          <OrderCard
            key={order.id}
            order={order}
            isActive={order.id === selectedId}
            onClick={() => onSelectOrder(order.id)}
          />
        ))}

        {filtered.length === 0 && (
          <div className="dash-placeholder" style={{ padding: "40px 16px" }}>
            <p className="dash-placeholder-title" style={{ fontSize: 15 }}>
              No orders found
            </p>
            <p className="dash-placeholder-desc" style={{ fontSize: 13 }}>
              Try adjusting your search or filter criteria.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
