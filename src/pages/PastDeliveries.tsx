import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import CustomerShell from "@/components/shells/CustomerShell";
import { Loader2, Package } from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/pages.css";

export default function PastDeliveries() {
  const pastDeliveries = useQuery(api.users.getPastDeliveries);

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return "N/A";
    return new Date(timestamp).toLocaleDateString("en-ZA", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <CustomerShell activeItem="Past Deliveries">
      <div className="dash-workspace" style={{ overflow: "auto" }}>
        <div className="page-container">
          <div className="page-header">
            <h1 className="page-title">Past Deliveries</h1>
            <p className="page-subtitle">View your delivery history and details</p>
          </div>

          {pastDeliveries === undefined ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: "#999" }} />
            </div>
          ) : pastDeliveries.length === 0 ? (
            <div className="empty-state" style={{ padding: 60 }}>
              <div className="empty-state-icon"><Package size={24} /></div>
              <div className="empty-state-title">No past deliveries</div>
              <div className="empty-state-desc">Your completed and cancelled deliveries will appear here.</div>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Tracking #</th>
                  <th>Date</th>
                  <th>Driver</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {pastDeliveries.map((d: any) => (
                  <tr key={d._id}>
                    <td style={{ fontWeight: 600 }}>{d.trackingNumber}</td>
                    <td>{formatDate(d.completedAt)}</td>
                    <td>{d.driverName}</td>
                    <td>
                      <span className={`status-badge ${d.status}`}>
                        {d.status.charAt(0).toUpperCase() + d.status.slice(1).replace(/_/g, " ")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </CustomerShell>
  );
}
