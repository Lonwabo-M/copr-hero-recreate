const filters = ["All", "Pending", "In Transit"] as const;

interface OrderFiltersProps {
  activeFilter: string;
  onFilterChange: (filter: string) => void;
}

export default function OrderFilters({ activeFilter, onFilterChange }: OrderFiltersProps) {
  return (
    <div className="dash-filters">
      {filters.map((filter) => (
        <button
          key={filter}
          className={`dash-filter ${activeFilter === filter ? "active" : ""}`}
          onClick={() => onFilterChange(filter)}
        >
          {filter}
        </button>
      ))}
    </div>
  );
}
