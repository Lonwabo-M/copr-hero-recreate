import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import AdminShell from "@/components/shells/AdminShell";
import {
  AlertTriangle,
  Loader2,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/operations.css";

// ─── Accounts (Admin Portal) ─────────────────────────────────────────────────
// The account inventory for the Phase 0/1 realm migration: every login, its
// role and realm, the business it belongs to, and its sign-in provider. This
// is a read-only view; role changes remain server-side operations.

type Realm = "staff" | "driver" | "customer";

const REALM_LABELS: Record<Realm, string> = {
  staff: "Staff",
  driver: "Driver",
  customer: "Customer",
};

const REALM_COLOURS: Record<Realm, { color: string; background: string }> = {
  staff: { color: "#0A7C42", background: "rgba(10,124,66,0.1)" },
  driver: { color: "#0794B5", background: "rgba(7,148,181,0.1)" },
  customer: { color: "#856404", background: "rgba(133,100,4,0.1)" },
};

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super admin",
  company_admin: "Company admin",
  operations: "Operations",
  fleet_manager: "Fleet manager",
  driver: "Driver",
  customer: "Customer",
  unassigned: "Unassigned",
};

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function RoleBadge({ role }: { role: string }) {
  const label = ROLE_LABELS[role] ?? role;
  const isAdmin = role === "super_admin" || role === "company_admin";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 9px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: 700,
        color: isAdmin ? "#6B4E00" : "#44515A",
        background: isAdmin ? "rgba(133,100,4,0.1)" : "var(--surface-muted, #F4F4F4)",
        border: "1px solid var(--border-light, #E8E8E8)",
        whiteSpace: "nowrap",
      }}
    >
      {isAdmin && <ShieldCheck size={12} />}
      {label}
    </span>
  );
}

function RealmBadge({ realm }: { realm: Realm }) {
  const colours = REALM_COLOURS[realm];
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 9px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        color: colours.color,
        background: colours.background,
        whiteSpace: "nowrap",
      }}
    >
      {REALM_LABELS[realm]}
    </span>
  );
}

export default function AdminAccounts() {
  const inventory = useQuery(api.admin.accounts.getAccountInventory, {});
  const restoreLegacy = useMutation(api.admin.accounts.restoreLegacyTestElevations);
  const [search, setSearch] = useState("");
  const [realm, setRealm] = useState<"all" | Realm>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!inventory) return [];
    const q = search.trim().toLowerCase();
    return inventory.accounts.filter((account) => {
      if (realm !== "all" && account.realm !== realm) return false;
      if (!q) return true;
      return (
        (account.name ?? "").toLowerCase().includes(q) ||
        (account.email ?? "").toLowerCase().includes(q) ||
        account.role.toLowerCase().includes(q) ||
        (account.businessName ?? "").toLowerCase().includes(q) ||
        account.providers.join(" ").toLowerCase().includes(q)
      );
    });
  }, [inventory, realm, search]);

  const handleRestore = async () => {
    if (!inventory?.legacyTestElevated) return;
    const confirmed = window.confirm(
      `Restore ${inventory.legacyTestElevated} account(s) to their pre-test role? This only touches accounts still marked with the retired test-access flag.`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await restoreLegacy({});
      setNotice(
        result.restored === 0
          ? "No legacy test elevations remained."
          : `Restored ${result.restored} account(s) to their previous role.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not restore test elevations");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell activeItem="Accounts">
      <main className="ops-main">
        <div className="ops-admin-head">
          <h1 className="ops-admin-portal">Admin Portal</h1>
          <span className="ops-admin-section">Accounts</span>
        </div>

        <p style={{ marginTop: -6, marginBottom: 18, fontSize: 13, color: "#666", maxWidth: 720 }}>
          The guest list for the realm migration: every customer, driver and staff
          login known to the deployment. Customers have no admin portal; every
          account shown in the Staff realm is an internal Lasha account.
        </p>

        <div className="ops-stats-grid" style={{ marginBottom: 18 }}>
          <div className="ops-stat-card">
            <div className="ops-stat-icon" style={{ background: "rgba(7,148,181,0.1)", color: "#0794B5" }}>
              <Users size={20} />
            </div>
            <div>
              <div className="ops-stat-value">{inventory?.total ?? "…"}</div>
              <div className="ops-stat-label">Total accounts</div>
            </div>
          </div>
          <div className="ops-stat-card">
            <div className="ops-stat-icon" style={{ background: "rgba(10,124,66,0.1)", color: "#0A7C42" }}>
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="ops-stat-value">{inventory?.countsByRealm.staff ?? "…"}</div>
              <div className="ops-stat-label">Staff realm</div>
            </div>
          </div>
          <div className="ops-stat-card">
            <div className="ops-stat-icon" style={{ background: "rgba(7,148,181,0.1)", color: "#0794B5" }}>
              <UserRound size={20} />
            </div>
            <div>
              <div className="ops-stat-value">{inventory?.countsByRealm.driver ?? "…"}</div>
              <div className="ops-stat-label">Driver realm</div>
            </div>
          </div>
          <div className="ops-stat-card">
            <div className="ops-stat-icon" style={{ background: "rgba(133,100,4,0.1)", color: "#856404" }}>
              <Users size={20} />
            </div>
            <div>
              <div className="ops-stat-value">{inventory?.countsByRealm.customer ?? "…"}</div>
              <div className="ops-stat-label">Customer realm</div>
            </div>
          </div>
        </div>

        {inventory?.legacyTestElevated ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              marginBottom: 16,
              borderRadius: 12,
              background: "rgba(133,100,4,0.06)",
              border: "1px solid rgba(133,100,4,0.25)",
              flexWrap: "wrap",
            }}
          >
            <AlertTriangle size={17} style={{ color: "#856404", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 220, fontSize: 12.5, color: "#5f4a04" }}>
              {inventory.legacyTestElevated} account(s) still carry the retired
              test-access marker. Restore them before the staff login migration.
            </div>
            <button
              className="ops-btn ops-btn-secondary"
              onClick={handleRestore}
              disabled={busy}
              style={{ fontSize: 12, padding: "7px 12px" }}
            >
              {busy ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
              Restore legacy roles
            </button>
          </div>
        ) : null}

        {error && (
          <div style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: "#C62828" }}>
            {error}
          </div>
        )}
        {notice && (
          <div style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: "#0A7C42" }}>
            {notice}
          </div>
        )}

        <div
          className="ops-filter-group"
          style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}
        >
          <div style={{ position: "relative", flex: 1, minWidth: 240 }}>
            <Search
              size={14}
              style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#9A9A9A" }}
            />
            <input
              className="ops-filter-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, role or business…"
              style={{ width: "100%", padding: "9px 12px 9px 34px" }}
            />
          </div>
          <div className="ops-tabs">
            {(["all", "staff", "driver", "customer"] as const).map((tab) => (
              <button
                key={tab}
                className={`ops-tab ${realm === tab ? "active" : ""}`}
                onClick={() => setRealm(tab)}
              >
                <span>{tab === "all" ? "All" : REALM_LABELS[tab]}</span>
              </button>
            ))}
          </div>
        </div>

        {inventory === undefined ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Loader2 size={22} className="animate-spin" style={{ color: "#999" }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Users size={24} /></div>
            <div className="empty-state-title">No matching accounts</div>
            <div className="empty-state-desc">
              Try a different search or realm filter.
            </div>
          </div>
        ) : (
          <div className="ops-table-wrap">
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Account</th>
                  <th>Realm</th>
                  <th>Role</th>
                  <th>Business</th>
                  <th>Sign-in</th>
                  <th>Created</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((account) => (
                  <tr key={account.userId}>
                    <td>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {account.name ?? "—"}
                      </div>
                      <div style={{ fontSize: 12, color: "#777" }}>
                        {account.email ?? "No email on account"}
                      </div>
                    </td>
                    <td><RealmBadge realm={account.realm} /></td>
                    <td><RoleBadge role={account.role} /></td>
                    <td style={{ fontSize: 12.5 }}>
                      {account.businessName ?? "—"}
                    </td>
                    <td style={{ fontSize: 12, color: "#666", textTransform: "capitalize" }}>
                      {account.providers.length > 0 ? account.providers.join(", ") : "—"}
                    </td>
                    <td style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap" }}>
                      {fmtDate(account.createdAt)}
                    </td>
                    <td style={{ fontSize: 11.5 }}>
                      {account.legacyTestElevated ? (
                        <span style={{ color: "#856404", fontWeight: 700 }}>
                          Legacy test elevation
                        </span>
                      ) : account.role === "unassigned" ? (
                        <span style={{ color: "#856404", fontWeight: 700 }}>
                          Role not assigned
                        </span>
                      ) : account.isAnonymous ? (
                        <span style={{ color: "#777" }}>Anonymous</span>
                      ) : (
                        <span style={{ color: "#0A7C42" }}>Active</span>
                      )}
                    </td>
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
