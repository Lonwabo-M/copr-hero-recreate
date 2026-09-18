import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import AdminShell from "@/components/shells/AdminShell";
import { Loader2, Users, Phone, Mail, Car, Star, Search, Truck } from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/operations.css";

// ─── Driver Roster (Admin Portal) ────────────────────────────────────────────
// The platform's approved driver fleet: who is on the books, what they drive,
// whether they are available and how they are performing. Approval itself
// happens in Driver Approvals; this is the resulting roster of record.

type RosterRow = {
  driverId: string;
  name: string;
  phone: string | null;
  email: string | null;
  hasProfile: boolean;
  isAvailable: boolean;
  rating: number | null;
  totalTrips: number | null;
  licenseClass: string | null;
  vehicle: {
    make: string;
    model: string;
    registration: string;
    capacityKg?: number;
  } | null;
  hasGps: boolean;
  applicationStatus: string | null;
};

function fmtRating(rating: number | null): string {
  if (rating == null) return "—";
  return `${rating.toFixed(1)} ★`;
}

export default function AdminDriverRoster() {
  const [search, setSearch] = useState("");
  const [availabilityTab, setAvailabilityTab] = useState<"all" | "available" | "off">("all");

  const roster = useQuery(api.users.driverApplications.getDriverRoster, {});

  const filtered = (roster ?? []).filter((d) => {
    if (availabilityTab === "available" && !d.isAvailable) return false;
    if (availabilityTab === "off" && d.isAvailable) return false;
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      (d.phone ?? "").toLowerCase().includes(q) ||
      (d.email ?? "").toLowerCase().includes(q) ||
      `${d.vehicle?.make ?? ""} ${d.vehicle?.model ?? ""} ${d.vehicle?.registration ?? ""}`.toLowerCase().includes(q)
    );
  });

  const availableCount = (roster ?? []).filter((d) => d.isAvailable).length;

  return (
    <AdminShell activeItem="Driver Roster">
      <main className="ops-main">
        <div className="ops-page-head">
          <span className="ops-page-eyebrow">Admin Portal</span>
          <h1 className="ops-page-title">Driver Roster</h1>
        </div>

        <div className="ops-stats-grid" style={{ marginBottom: 18 }}>
          <div className="ops-stat-card">
            <div className="ops-stat-icon" style={{ background: "rgba(10,124,66,0.1)", color: "#0A7C42" }}>
              <Users size={20} />
            </div>
            <div>
              <div className="ops-stat-value">{roster?.length ?? "…"}</div>
              <div className="ops-stat-label">Approved drivers</div>
            </div>
          </div>
          <div className="ops-stat-card">
            <div className="ops-stat-icon" style={{ background: "rgba(7,148,181,0.1)", color: "#0794B5" }}>
              <Truck size={20} />
            </div>
            <div>
              <div className="ops-stat-value">{roster === undefined ? "…" : availableCount}</div>
              <div className="ops-stat-label">Available now</div>
            </div>
          </div>
          <div className="ops-stat-card">
            <div className="ops-stat-icon" style={{ background: "rgba(133,100,4,0.1)", color: "#856404" }}>
              <Star size={20} />
            </div>
            <div>
              <div className="ops-stat-value">
                {roster === undefined || roster.length === 0
                  ? "—"
                  : (roster.reduce((sum, d) => sum + (d.rating ?? 0), 0) /
                     roster.filter((d) => d.rating != null).length || 0).toFixed(1)}
              </div>
              <div className="ops-stat-label">Average rating</div>
            </div>
          </div>
        </div>

        <div className="ops-filter-group" style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 220 }}>
            <Search size={14} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9A9A9A" }} />
            <input
              className="ops-filter-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, email or vehicle…"
              style={{ width: "100%", padding: "9px 12px 9px 34px" }}
            />
          </div>
          {(["all", "available", "off"] as const).map((tab) => (
            <button
              key={tab}
              className={`ops-tab ${availabilityTab === tab ? "active" : ""}`}
              onClick={() => setAvailabilityTab(tab)}
            >
              <span style={{ textTransform: "capitalize" }}>{tab === "off" ? "Unavailable" : tab}</span>
            </button>
          ))}
        </div>

        {roster === undefined ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Loader2 size={22} className="animate-spin" style={{ color: "#999" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Users size={24} /></div>
            <div className="empty-state-title">No drivers found</div>
            <div className="empty-state-desc">
              Drivers appear here once they register and are approved through Driver Approvals.
            </div>
          </div>
        ) : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>Contact</th>
                  <th>Vehicle</th>
                  <th>License</th>
                  <th>Availability</th>
                  <th>Rating</th>
                  <th>Trips</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.driverId}>
                    <td style={{ fontWeight: 600 }}>
                      {d.name}
                      {!d.hasProfile && (
                        <span style={{ marginLeft: 8, fontSize: 11, color: "#856404", fontWeight: 500 }}>
                          no profile
                        </span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2, fontSize: 12 }}>
                        {d.phone && <span><Phone size={11} style={{ verticalAlign: -1, marginRight: 4, color: "#9A9A9A" }} />{d.phone}</span>}
                        {d.email && <span><Mail size={11} style={{ verticalAlign: -1, marginRight: 4, color: "#9A9A9A" }} />{d.email}</span>}
                        {!d.phone && !d.email && "—"}
                      </div>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {d.vehicle ? (
                        <span>
                          <Car size={11} style={{ verticalAlign: -1, marginRight: 4, color: "#0794B5" }} />
                          {d.vehicle.make} {d.vehicle.model}
                          <span style={{ color: "#666" }}> · {d.vehicle.registration}</span>
                          {d.vehicle.capacityKg != null && (
                            <span style={{ color: "#666" }}> · {d.vehicle.capacityKg} kg</span>
                          )}
                        </span>
                      ) : "—"}
                    </td>
                    <td style={{ fontSize: 12.5 }}>{d.licenseClass ?? "—"}</td>
                    <td>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 10px",
                          borderRadius: 999,
                          fontSize: 11.5,
                          fontWeight: 600,
                          background: d.isAvailable ? "rgba(10,124,66,0.12)" : "rgba(133,100,4,0.12)",
                          color: d.isAvailable ? "#0A7C42" : "#856404",
                        }}
                      >
                        {d.isAvailable ? "Available" : "Unavailable"}
                      </span>
                    </td>
                    <td style={{ fontSize: 12.5 }}>{fmtRating(d.rating)}</td>
                    <td style={{ fontSize: 12.5 }}>{d.totalTrips ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AdminShell>
  );
}
