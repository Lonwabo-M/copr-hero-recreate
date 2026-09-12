import AppShell from "./AppShell";

// ─── OperationsShell ─────────────────────────────────────────────────────────
// The Operations Centre experience. Reuses the Lasha design system unchanged;
// navigation is scoped to operations entries only.

export default function OperationsShell(props: {
  children: React.ReactNode;
  activeItem: string;
}) {
  return (
    <AppShell area="operations" activeItem={props.activeItem} brandLabel="Lasha">
      {props.children}
    </AppShell>
  );
}
