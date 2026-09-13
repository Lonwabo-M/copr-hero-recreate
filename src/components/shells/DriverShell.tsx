import AppShell from "./AppShell";
import DriverConnectivityIndicator from "@/components/driver/DriverConnectivityIndicator";

// ─── DriverShell ─────────────────────────────────────────────────────────────
// The Driver App experience. Reuses the Lasha design system unchanged; only
// the navigation scope differs (driver entries only). Driver Active Delivery,
// POD submission and continuous GPS tracking live in this area. A small
// connectivity/sync indicator overlays the shell (fixed, dismiss-free) so the
// driver always knows whether GPS is buffered or syncing.

export default function DriverShell(props: {
  children: React.ReactNode;
  activeItem: string;
}) {
  return (
    <AppShell area="driver" activeItem={props.activeItem} brandLabel="Lasha">
      <DriverConnectivityIndicator />
      {props.children}
    </AppShell>
  );
}
