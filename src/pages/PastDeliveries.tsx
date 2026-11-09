import { useQuery } from "convex/react";
import { Link } from "react-router";
import { api } from "@/convex/_generated/api";
import CustomerShell from "@/components/shells/CustomerShell";
import { orderStatusFromDelivery, orderStatusTone } from "@/lib/orderStatus";
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
        <div className="page-container" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: "100%" }}>
          <div className="page-header">
            <h1 className="page-title">Past Deliveries</h1>
            <p className="page-subtitle">View your delivery history and details</p>
          </div>

          {pastDeliveries === undefined ? (
            <div style={{ display: "flex", justifyContent: "center", padding: 60 }}>
              <Loader2 size={24} className="animate-spin" style={{ color: "#999" }} />
            </div>
          ) : pastDeliveries.length === 0 ? (
            /* Full-height centered empty state — same visual unit as the
               Activity Center's: icon, heading, copy on one axis. */
            <div
              className="empty-state"
              style={{
                flex: 1,
                minHeight: "50vh",
                width: "100%",
              }}
            >
              <div className="empty-state-icon"><Package size={24} /></div>
              <div className="empty-state-title">No past deliveries</div>
              <div className="empty-state-desc">Your completed and cancelled deliveries will appear here.</div>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Tracking #</th>
                    <th scope="col">Date</th>
                    <th scope="col">Driver</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pastDeliveries.map((d: any) => {
                    const status = orderStatusFromDelivery(d.status);
                    return (
                      <tr key={d._id}>
                        <td style={{ fontWeight: 600 }}>
                          <Link
                            to={`/deliveries/${d._id}`}
                            style={{ color: "#087f9c", textDecoration: "none" }}
                          >
                            {d.trackingNumber}
                          </Link>
                        </td>
                        <td>{formatDate(d.completedAt)}</td>
                        <td>{d.driverName && d.driverName !== "N/A" ? d.driverName : "—"}</td>
                        <td>
                          <span className={`status-badge ${orderStatusTone(status)}`}>
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </CustomerShell>
  );
}
