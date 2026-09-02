import { useState } from "react";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import "@/styles/pages.css";

const invoices = [
  { id: "INV-2024-001", date: "30 Aug 2025", client: "TechCorp SA", amount: "R4,250.00", status: "paid" },
  { id: "INV-2024-002", date: "28 Aug 2025", client: "FreshMart Logistics", amount: "R1,890.00", status: "pending" },
  { id: "INV-2024-003", date: "25 Aug 2025", client: "UrbanDelivery Co", amount: "R3,120.00", status: "paid" },
  { id: "INV-2024-004", date: "22 Aug 2025", client: "MediExpress", amount: "R2,680.00", status: "pending" },
  { id: "INV-2024-005", date: "20 Aug 2025", client: "QuickShip PTY", amount: "R5,400.00", status: "paid" },
  { id: "INV-2024-006", date: "18 Aug 2025", client: "GreenRoute", amount: "R950.00", status: "cancelled" },
];

export default function Invoices() {
  const [filter, setFilter] = useState("All");

  const filtered = filter === "All" ? invoices : invoices.filter((i) => i.status === filter.toLowerCase());

  return (
    <DashboardLayout activeSidebarItem="Invoices">
      <div className="page-container">
        <div className="page-header">
          <h1 className="page-title">Invoices</h1>
          <p className="page-subtitle">Manage and track your invoices</p>
        </div>

        <div className="filter-tabs">
          {["All", "Paid", "Pending", "Cancelled"].map((f) => (
            <button
              key={f}
              className={`filter-tab ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Invoice ID</th>
              <th>Date</th>
              <th>Client</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inv) => (
              <tr key={inv.id}>
                <td style={{ fontWeight: 600 }}>{inv.id}</td>
                <td>{inv.date}</td>
                <td>{inv.client}</td>
                <td style={{ fontWeight: 600 }}>{inv.amount}</td>
                <td>
                  <span className={`status-badge ${inv.status}`}>
                    {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                  </span>
                </td>
                <td>
                  <button className="download-btn">Download</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardLayout>
  );
}
