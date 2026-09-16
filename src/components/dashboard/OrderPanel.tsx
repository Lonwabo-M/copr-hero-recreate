import SearchBar from "./SearchBar";
import OrderFilters from "./OrderFilters";
import OrderCard from "./OrderCard";
import type { Order } from "@/types/dashboard";

// The panel is generic over the order shape so callers can pass enriched
// rows (e.g. ActivityOrder with the real delivery id) without losing type
// information through the base Order interface.
interface OrderPanelProps<T extends Order> {
  orders: T[];
  selectedId: string;
  searchQuery: string;
  activeFilter: string;
  onSearchChange: (query: string) => void;
  onFilterChange: (filter: string) => void;
  onSelectOrder: (id: string) => void;
  /** Track Order action — navigates to the delivery's tracking view. */
  onTrack: (order: T) => void;
}

export default function OrderPanel<T extends Order>({
  orders,
  selectedId,
  searchQuery,
  activeFilter,
  onSearchChange,
  onFilterChange,
  onSelectOrder,
  onTrack,
}: OrderPanelProps<T>) {
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
            onTrack={() => onTrack(order)}
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
