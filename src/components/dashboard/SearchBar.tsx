import { Search } from "lucide-react";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="dash-search-wrapper">
      <Search size={19} className="dash-search-icon" strokeWidth={1.5} />
      <input
        type="text"
        className="dash-search"
        placeholder="Search Order by Number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Search orders"
      />
    </div>
  );
}
