import AppShell from "./AppShell";

// ─── AdminShell ──────────────────────────────────────────────────────────────
// Reserved for platform administration. No admin-only pages exist yet (this is
// documented as a remaining gap — see docs/frontend-architecture.md). When the
// first admin page is built, it renders inside this shell and adminNavigation
// (src/components/shells/navigation.ts) gets its first entry. The route guard
// (RoleGate area="admin") is already in place.
export default function AdminShell(props: {
  children: React.ReactNode;
  activeItem: string;
}) {
  return (
    <AppShell area="admin" activeItem={props.activeItem} brandLabel="Lasha Admin">
      {props.children}
    </AppShell>
  );
}
