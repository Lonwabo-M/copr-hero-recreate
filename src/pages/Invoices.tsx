import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import CustomerShell from "@/components/shells/CustomerShell";
import { Loader2, FileText } from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/pages.css";

export default function Invoices() {
  const [filter, setFilter] = useState("All");

  const invoices = useQuery(api.users.getInvoices);

  const filtered = filter === "All"
    ? invoices
    : invoices?.filter((i: any) => i.status === filter.toLowerCase());

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      minimumFractionDigits: 2,
    }).format(amount / 100);
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleDateString("en-ZA", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <CustomerShell activeItem="Invoices">
      <div className="dash-workspace" style={{ overflow: "auto" }}>
        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">Invoices</h1>
            <p className="page-subtitle">Manage and track your invoices</p>
          </div>
          <div className="filter-tabs">
            {["All", "Paid", "Pending", "Cancelled"].map((f) => (
              <button
                type="button"
                key={f}
                className={`filter-tab ${filter === f ? "active" : ""}`}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
              >
                {f}
              </button>
            ))}
          </div>

          {invoices === undefined ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: "#999" }} />
            </div>
          ) : !filtered || filtered.length === 0 ? (
            <div className="empty-state" style={{ padding: 60 }}>
              <div className="empty-state-icon"><FileText size={24} /></div>
              <div className="empty-state-title">
                {invoices.length > 0 ? `No ${filter.toLowerCase()} invoices` : "No invoices yet"}
              </div>
              <div className="empty-state-desc">
                {invoices.length > 0
                  ? "Try another status filter."
                  : "Invoices issued to your account will appear here."}
              </div>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Invoice #</th>
                    <th scope="col">Date</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((inv: any) => (
                    <tr key={inv._id}>
                      <td style={{ fontWeight: 600 }}>{inv.invoiceNumber}</td>
                      <td>{formatDate(inv.createdAt)}</td>
                      <td style={{ fontWeight: 600 }}>{formatCurrency(inv.amount)}</td>
                      <td>
                        <span className={`status-badge ${inv.status}`}>
                          {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </CustomerShell>
  );
}
