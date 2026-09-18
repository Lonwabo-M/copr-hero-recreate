import AppShell from "./AppShell";

// ─── AdminShell ──────────────────────────────────────────────────────────────
// Platform administration shell: driver onboarding approvals (Capture →
// Review → Accept), the driver roster of record, pricing rules, platform
// health and the audit trail. The topnav carries only the Lasha mark — the
// portal identity lives in each page's eyebrow ("Admin Portal"), so the
// wording is legible rather than duplicated next to the logo. The route guard
// (RoleGate area="admin") is in place; sidebar entries come from
// adminNavigation (src/components/shells/navigation.ts).
export default function AdminShell(props: {
  children: React.ReactNode;
  activeItem: string;
}) {
  return (
    <AppShell area="admin" activeItem={props.activeItem}>
      {props.children}
    </AppShell>
  );
}
