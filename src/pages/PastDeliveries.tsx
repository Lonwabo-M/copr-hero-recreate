import DashboardLayout from "@/components/dashboard/DashboardLayout";
import "@/styles/pages.css";

const pastDeliveries = [
  { id: "ORD-54321", date: "28 Aug 2025", from: "Sandton City", to: "Rosebank Mall", status: "completed", driver: "Sipho M.", amount: "R145.00" },
  { id: "ORD-54298", date: "26 Aug 2025", from: "Melrose Arch", to: "Menlyn Park", status: "completed", driver: "Thabo K.", amount: "R210.00" },
  { id: "ORD-54265", date: "24 Aug 2025", from: "V&A Waterfront", to: "Canal Walk", status: "completed", driver: "Lusanda M.", amount: "R89.00" },
  { id: "ORD-54230", date: "22 Aug 2025", from: "Gateway Mall", to: "uMhlanga Ridge", status: "cancelled", driver: "N/A", amount: "R0.00" },
  { id: "ORD-54198", date: "20 Aug 2025", from: "Eastgate Mall", to: "Bedford Centre", status: "completed", driver: "Pieter V.", amount: "R67.50" },
  { id: "ORD-54155", date: "18 Aug 2025", from: "Brooklyn Mall", to: "Hatfield Plaza", status: "completed", driver: "Sipho M.", amount: "R52.00" },
];

export default function PastDeliveries() {
  return (
    <DashboardLayout activeSidebarItem="Past Deliveries">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">Past Deliveries</h1>
          <p className="page-subtitle">View your delivery history and details</p>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Date</th>
              <th>From</th>
              <th>To</th>
              <th>Driver</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {pastDeliveries.map((d) => (
              <tr key={d.id}>
                <td style={{ fontWeight: 600 }}>{d.id}</td>
                <td>{d.date}</td>
                <td>{d.from}</td>
                <td>{d.to}</td>
                <td>{d.driver}</td>
                <td>{d.amount}</td>
                <td>
                  <span className={`status-badge ${d.status}`}>
                    {d.status.charAt(0).toUpperCase() + d.status.slice(1)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
