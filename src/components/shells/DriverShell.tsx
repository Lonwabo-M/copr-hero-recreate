import AppShell from "./AppShell";

// ─── DriverShell ─────────────────────────────────────────────────────────────
// The Driver App experience. Reuses the Lasha design system unchanged; only
// the navigation scope differs (driver entries only). Driver Active Delivery,
// POD submission and continuous GPS tracking live in this area.

export default function DriverShell(props: {
  children: React.ReactNode;
  activeItem: string;
}) {
  return (
    <AppShell area="driver" activeItem={props.activeItem} brandLabel="Lasha">
      {props.children}
    </AppShell>
  );
}
