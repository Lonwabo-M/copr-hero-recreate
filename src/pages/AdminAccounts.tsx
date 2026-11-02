import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import AdminShell from "@/components/shells/AdminShell";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Loader2,
  Plus,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import type { Role } from "@/convex/schema";
import "@/styles/dashboard.css";
import "@/styles/operations.css";

// ─── Accounts (Admin Portal) ─────────────────────────────────────────────────
// The account inventory and staff lifecycle surface. Staff records created
// here get Lasha authorization only; ZITADEL remains the identity provider, so
// a new record stays "Awaiting ZITADEL" until a matching verified identity
// signs in. All role-ceiling, self-edit, duplicate-email, suspension and
// last-super-admin checks are enforced by Convex, not this page.

type Realm = "staff" | "driver" | "customer";
type StaffStatus = "active" | "awaiting_sso" | "suspended" | "not_staff";

type AccountRow = {
  userId: string;
  name: string | null;
  email: string | null;
  role: Role | "unassigned";
  realm: Realm;
  businessId: string | null;
  businessName: string | null;
  providers: string[];
  isAnonymous: boolean;
  emailVerified: boolean;
  createdAt: number;
  staffSuspendedAt: number | null;
  staffStatus: StaffStatus;
  isSelf: boolean;
  lastActiveSuperAdmin: boolean;
  canChangeRole: boolean;
  canSuspend: boolean;
  canReactivate: boolean;
  legacyTestElevated: boolean;
  legacyPreviousRole: Role | null;
};

type DialogState =
  | { kind: "add" }
  | { kind: "role"; account: AccountRow }
  | { kind: "suspend"; account: AccountRow }
  | null;

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

function fmtDateTime(ts: number): string {
  return new Date(ts).toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
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

function StatusCell({ account }: { account: AccountRow }) {
  if (account.legacyTestElevated) {
    return <span style={{ color: "#856404", fontWeight: 700 }}>Legacy test elevation</span>;
  }
  if (account.staffStatus === "suspended") {
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
        <span style={{ color: "#C62828", fontWeight: 700 }}>Suspended</span>
        {account.staffSuspendedAt && (
          <span style={{ color: "#999", fontSize: 11 }}>
            {fmtDateTime(account.staffSuspendedAt)}
          </span>
        )}
      </span>
    );
  }
  if (account.staffStatus === "awaiting_sso") {
    return (
      <span style={{ display: "inline-flex", flexDirection: "column", gap: 2 }}>
        <span style={{ color: "#0794B5", fontWeight: 700 }}>Awaiting ZITADEL</span>
        <span style={{ color: "#999", fontSize: 11 }}>Lasha access prepared</span>
      </span>
    );
  }
  if (account.role === "unassigned") {
    return <span style={{ color: "#856404", fontWeight: 700 }}>Role not assigned</span>;
  }
  if (account.isAnonymous) {
    return <span style={{ color: "#777" }}>Anonymous</span>;
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "#0A7C42" }}>
      <CheckCircle2 size={13} />
      Active
    </span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-sm font-semibold text-foreground">{children}</span>;
}

export default function AdminAccounts() {
  const inventory = useQuery(api.admin.accounts.getAccountInventory, {});
  const restoreLegacy = useMutation(api.admin.accounts.restoreLegacyTestElevations);
  const prepareStaffSso = useMutation(api.admin.accounts.prepareStaffSsoLinking);
  const createStaff = useMutation(api.admin.accounts.createStaffAccount);
  const changeStaffRole = useMutation(api.admin.accounts.changeStaffRole);
  const suspendStaff = useMutation(api.admin.accounts.suspendStaffAccount);
  const reactivateStaff = useMutation(api.admin.accounts.reactivateStaffAccount);

  const [search, setSearch] = useState("");
  const [realm, setRealm] = useState<"all" | Realm>("all");
  const [busy, setBusy] = useState(false);
  const [preparingSso, setPreparingSso] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formRole, setFormRole] = useState<Role>("operations");
  const [formReason, setFormReason] = useState("");

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

  const resetDialog = () => {
    setFormError(null);
    setFormName("");
    setFormEmail("");
    setFormReason("");
  };

  const closeDialog = () => {
    if (saving) return;
    setDialog(null);
    resetDialog();
  };

  const openAdd = () => {
    const roles = inventory?.assignableRoles ?? [];
    if (roles.length === 0) return;
    const defaultRole = roles.includes("operations") ? "operations" : roles[0];
    resetDialog();
    setFormRole(defaultRole);
    setDialog({ kind: "add" });
  };

  const openRoleChange = (account: AccountRow) => {
    const options = (inventory?.assignableRoles ?? []).filter(
      (candidate) => candidate !== account.role,
    );
    if (options.length === 0) return;
    resetDialog();
    setFormRole(options[0]);
    setDialog({ kind: "role", account });
  };

  const openSuspend = (account: AccountRow) => {
    resetDialog();
    setDialog({ kind: "suspend", account });
  };

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

  const handlePrepareSso = async () => {
    if (!inventory?.staffMissingVerifiedEmail) return;
    const confirmed = window.confirm(
      `Prepare ${inventory.staffMissingVerifiedEmail} staff account(s) for ZITADEL linking? This marks only unique staff emails as verified; customers and drivers are never touched.`,
    );
    if (!confirmed) return;

    setPreparingSso(true);
    setError(null);
    setNotice(null);
    try {
      const result = await prepareStaffSso({});
      setNotice(
        result.prepared === 0
          ? "No staff accounts needed preparation."
          : `Prepared ${result.prepared} staff account(s) for ZITADEL sign-in.` +
              (result.skippedNoEmail || result.skippedDuplicateEmail
                ? ` Skipped ${result.skippedNoEmail} without an email and ${result.skippedDuplicateEmail} with duplicate emails.`
                : ""),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not prepare staff SSO linking");
    } finally {
      setPreparingSso(false);
    }
  };

  const handleReactivate = async (account: AccountRow) => {
    if (!account.canReactivate) return;
    const label = account.email ?? account.name ?? "this account";
    if (!window.confirm(`Reactivate staff access for ${label}? Their existing ZITADEL identity will be accepted again.`)) {
      return;
    }

    setRowBusy(account.userId);
    setError(null);
    setNotice(null);
    try {
      await reactivateStaff({ userId: account.userId as never });
      setNotice(`Staff access reactivated for ${label}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reactivate staff access");
    } finally {
      setRowBusy(null);
    }
  };

  const handleDialogSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!dialog) return;

    setSaving(true);
    setFormError(null);
    try {
      if (dialog.kind === "add") {
        await createStaff({
          name: formName,
          email: formEmail,
          role: formRole,
        });
        setNotice(
          `Staff access created for ${formEmail.trim()}. They can sign in once a ZITADEL identity with the same verified email exists.`,
        );
      } else if (dialog.kind === "role") {
        await changeStaffRole({
          userId: dialog.account.userId as never,
          role: formRole,
        });
        setNotice(
          `Staff role changed to ${ROLE_LABELS[formRole] ?? formRole} for ${dialog.account.email ?? dialog.account.name ?? "the account"}.`,
        );
      } else {
        await suspendStaff({
          userId: dialog.account.userId as never,
          reason: formReason.trim() || undefined,
        });
        setNotice(`Staff access suspended for ${dialog.account.email ?? dialog.account.name ?? "the account"}.`);
      }
      setDialog(null);
      resetDialog();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not save this change");
    } finally {
      setSaving(false);
    }
  };

  const dialogTitle =
    dialog?.kind === "add"
      ? "Add staff access"
      : dialog?.kind === "role"
        ? "Change staff role"
        : "Suspend staff access";

  const roleOptions =
    dialog?.kind === "role"
      ? (inventory?.assignableRoles ?? []).filter((role) => role !== dialog.account.role)
      : inventory?.assignableRoles ?? [];

  return (
    <AdminShell activeItem="Accounts">
      <main className="ops-main">
        <div className="ops-admin-head">
          <h1 className="ops-admin-portal">Admin Portal</h1>
          <span className="ops-admin-section">Accounts</span>
          {inventory?.canManageStaff ? (
            <button
              className="ops-btn ops-btn-primary"
              onClick={openAdd}
              disabled={(inventory.assignableRoles ?? []).length === 0}
              style={{ marginLeft: "auto", fontSize: 12.5, padding: "8px 14px" }}
            >
              <Plus size={14} />
              Add staff member
            </button>
          ) : null}
        </div>

        <p style={{ marginTop: -6, marginBottom: 18, fontSize: 13, color: "#666", maxWidth: 760 }}>
          The guest list for every customer, driver and staff login. Staff access
          is created here; ZITADEL remains the identity provider, so a new staff
          record waits for a matching verified ZITADEL sign-in.
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

        {inventory?.staffMissingVerifiedEmail ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              marginBottom: 16,
              borderRadius: 12,
              background: "rgba(7,148,181,0.06)",
              border: "1px solid rgba(7,148,181,0.25)",
              flexWrap: "wrap",
            }}
          >
            <ShieldCheck size={17} style={{ color: "#0794B5", flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 220, fontSize: 12.5, color: "#075e73" }}>
              {inventory.staffMissingVerifiedEmail} staff account(s) need an
              email prepared before ZITADEL can link to them. This only marks
              unique staff emails.
            </div>
            <button
              className="ops-btn ops-btn-secondary"
              onClick={handlePrepareSso}
              disabled={preparingSso}
              style={{ fontSize: 12, padding: "7px 12px" }}
            >
              {preparingSso ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
              Prepare staff SSO
            </button>
          </div>
        ) : null}

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
          {inventory && inventory.suspendedStaff > 0 ? (
            <span className="ops-live-count" style={{ color: "#C62828" }}>
              {inventory.suspendedStaff} suspended
            </span>
          ) : null}
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
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((account) => (
                  <tr key={account.userId}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600 }}>
                        {account.name ?? "—"}
                        {account.isSelf ? (
                          <span style={{ fontSize: 10, fontWeight: 700, color: "#0794B5", background: "rgba(7,148,181,0.1)", borderRadius: 999, padding: "2px 7px" }}>
                            You
                          </span>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 12, color: "#777" }}>
                        {account.email ?? "No email on account"}
                      </div>
                    </td>
                    <td><RealmBadge realm={account.realm} /></td>
                    <td>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        <RoleBadge role={account.role} />
                        {account.lastActiveSuperAdmin ? (
                          <span style={{ fontSize: 10.5, color: "#856404", fontWeight: 700 }}>
                            Last active super admin
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {account.businessName ?? "—"}
                    </td>
                    <td style={{ fontSize: 12, color: "#666", textTransform: "capitalize" }}>
                      {account.providers.length > 0 ? account.providers.join(", ") : "—"}
                    </td>
                    <td style={{ fontSize: 11.5 }}>
                      <StatusCell account={account} />
                    </td>
                    <td style={{ fontSize: 12, color: "#666", whiteSpace: "nowrap" }}>
                      {fmtDate(account.createdAt)}
                    </td>
                    <td>
                      {account.realm === "staff" ? (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {account.canChangeRole ? (
                            <button
                              className="ops-btn ops-btn-sm"
                              onClick={() => openRoleChange(account)}
                              title="Change this staff member's role"
                            >
                              Change role
                            </button>
                          ) : null}
                          {account.canSuspend ? (
                            <button
                              className="ops-btn ops-btn-sm"
                              onClick={() => openSuspend(account)}
                              title="Suspend this staff member's access"
                              style={{ color: "#C62828", borderColor: "rgba(198,40,40,0.3)" }}
                            >
                              <Ban size={12} />
                              Suspend
                            </button>
                          ) : null}
                          {account.canReactivate ? (
                            <button
                              className="ops-btn ops-btn-sm"
                              onClick={() => handleReactivate(account)}
                              disabled={rowBusy === account.userId}
                              title="Reactivate this staff member's access"
                              style={{ color: "#0A7C42", borderColor: "rgba(10,124,66,0.3)" }}
                            >
                              {rowBusy === account.userId ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <RotateCcw size={12} />
                              )}
                              Reactivate
                            </button>
                          ) : null}
                          {!account.canChangeRole && !account.canSuspend && !account.canReactivate ? (
                            <span style={{ fontSize: 11.5, color: "#999" }}>
                              {account.isSelf
                                ? "Your account"
                                : account.lastActiveSuperAdmin
                                  ? "Protected"
                                  : "No actions available"}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span style={{ fontSize: 11.5, color: "#999" }}>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
            <DialogDescription>
              {dialog?.kind === "add"
                ? "Create Lasha authorization for a staff member. This does not create their ZITADEL identity or send an invitation."
                : dialog?.kind === "role"
                  ? "Change what this staff member can access. The change is audited and takes effect immediately."
                  : "Block this staff member's Lasha access. Their ZITADEL identity remains intact and can be reactivated later."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleDialogSubmit} className="grid gap-4">
            {dialog?.kind === "add" ? (
              <>
                <label className="grid gap-1.5">
                  <FieldLabel>Full name</FieldLabel>
                  <input
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                    value={formName}
                    onChange={(event) => setFormName(event.target.value)}
                    placeholder="e.g. Thandi Mokoena"
                    autoComplete="off"
                    required
                  />
                </label>
                <label className="grid gap-1.5">
                  <FieldLabel>Work email</FieldLabel>
                  <input
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                    type="email"
                    value={formEmail}
                    onChange={(event) => setFormEmail(event.target.value)}
                    placeholder="name@lasha.co.za"
                    autoComplete="off"
                    required
                  />
                  <span className="text-[11.5px] text-muted-foreground">
                    This must match the person's verified email in ZITADEL.
                  </span>
                </label>
                <label className="grid gap-1.5">
                  <FieldLabel>Role</FieldLabel>
                  <select
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                    value={formRole}
                    onChange={(event) => setFormRole(event.target.value as Role)}
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role] ?? role}
                      </option>
                    ))}
                  </select>
                </label>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "rgba(7,148,181,0.06)",
                    border: "1px solid rgba(7,148,181,0.2)",
                    fontSize: 12,
                    color: "#075e73",
                    lineHeight: 1.5,
                  }}
                >
                  <ShieldCheck size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    The account will show <strong>Awaiting ZITADEL</strong> until
                    a ZITADEL user with this verified email signs in at{" "}
                    <code>/staff-login</code>.
                  </span>
                </div>
              </>
            ) : null}

            {dialog?.kind === "role" ? (
              <>
                <div style={{ padding: "10px 12px", borderRadius: 10, background: "#F7F7F7", fontSize: 12.5 }}>
                  <div style={{ fontWeight: 700 }}>{dialog.account.name ?? "—"}</div>
                  <div style={{ color: "#777" }}>{dialog.account.email ?? "No email"}</div>
                  <div style={{ marginTop: 4, color: "#666" }}>
                    Current role: <strong>{ROLE_LABELS[dialog.account.role] ?? dialog.account.role}</strong>
                  </div>
                </div>
                <label className="grid gap-1.5">
                  <FieldLabel>New role</FieldLabel>
                  <select
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
                    value={formRole}
                    onChange={(event) => setFormRole(event.target.value as Role)}
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role] ?? role}
                      </option>
                    ))}
                  </select>
                </label>
                {dialog.account.lastActiveSuperAdmin ? (
                  <div style={{ fontSize: 12, color: "#C62828" }}>
                    This is the last active super admin and cannot be demoted.
                  </div>
                ) : null}
              </>
            ) : null}

            {dialog?.kind === "suspend" ? (
              <>
                <div
                  style={{
                    display: "flex",
                    gap: 10,
                    padding: "10px 12px",
                    borderRadius: 10,
                    background: "rgba(198,40,40,0.05)",
                    border: "1px solid rgba(198,40,40,0.2)",
                    fontSize: 12,
                    color: "#8a1f1f",
                    lineHeight: 1.5,
                  }}
                >
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>
                    This blocks every authenticated Lasha request immediately.
                    It does not delete the account, alter their ZITADEL identity,
                    or remove their history.
                  </span>
                </div>
                <div style={{ padding: "10px 12px", borderRadius: 10, background: "#F7F7F7", fontSize: 12.5 }}>
                  <div style={{ fontWeight: 700 }}>{dialog.account.name ?? "—"}</div>
                  <div style={{ color: "#777" }}>{dialog.account.email ?? "No email"}</div>
                  <div style={{ marginTop: 4, color: "#666" }}>
                    Role: <strong>{ROLE_LABELS[dialog.account.role] ?? dialog.account.role}</strong>
                  </div>
                </div>
                <label className="grid gap-1.5">
                  <FieldLabel>Reason (optional)</FieldLabel>
                  <textarea
                    className="min-h-20 rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    value={formReason}
                    onChange={(event) => setFormReason(event.target.value)}
                    placeholder="Record why access is being suspended"
                    maxLength={300}
                  />
                  <span className="text-[11.5px] text-muted-foreground">
                    The reason is written to the audit trail.
                  </span>
                </label>
              </>
            ) : null}

            {formError ? (
              <div style={{ fontSize: 12.5, fontWeight: 600, color: "#C62828" }}>
                {formError}
              </div>
            ) : null}

            <DialogFooter>
              <button
                type="button"
                className="ops-btn"
                onClick={closeDialog}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`ops-btn ${dialog?.kind === "suspend" ? "" : "ops-btn-primary"}`}
                disabled={saving}
                style={dialog?.kind === "suspend" ? { color: "#C62828", borderColor: "rgba(198,40,40,0.35)" } : undefined}
              >
                {saving ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : dialog?.kind === "suspend" ? (
                  <Ban size={13} />
                ) : (
                  <ShieldCheck size={13} />
                )}
                {dialog?.kind === "add"
                  ? "Create staff access"
                  : dialog?.kind === "role"
                    ? "Change role"
                    : "Suspend access"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AdminShell>
  );
}
