const filters = ["All", "Pending", "In Transit", "Delivered", "Cancelled", "Failed"] as const;

interface OrderFiltersProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}

export default function OrderFilters({ activeFilter, onFilterChange }: OrderFiltersProps) {
  return (
    <div className="dash-filters">
      {filters.map((filter) => (
        <button
          type="button"
          key={filter}
          className={`dash-filter ${activeFilter === filter ? "active" : ""}`}
          onClick={() => onFilterChange(filter)}
          aria-pressed={activeFilter === filter}
        >
          {filter}
        </button>
      ))}
    </div>
  );
}
