interface DetailTabsProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const tabs = ["Order Details", "Vehicle Details", "Driver Details", "Customer Details"];

export default function DetailTabs({ activeTab, onTabChange }: DetailTabsProps) {
  return (
    <div className="dash-detail-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab}
          className={`dash-detail-tab ${activeTab === tab ? "active" : ""}`}
          onClick={() => onTabChange(tab)}
          role="tab"
          aria-selected={activeTab === tab}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
