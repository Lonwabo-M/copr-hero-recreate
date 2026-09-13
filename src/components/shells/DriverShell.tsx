import AppShell from "./AppShell";
import DriverConnectivityIndicator from "@/components/driver/DriverConnectivityIndicator";
import { useConvexConnectionBridge, useSyncEngine } from "@/hooks/use-offline";

// ─── DriverShell ─────────────────────────────────────────────────────────────
// The Driver App experience. Reuses the Lasha design system unchanged; only
// the navigation scope differs (driver entries only). Driver Active Delivery,
// POD submission and continuous GPS tracking live in this area. A small
// connectivity/sync indicator overlays the shell (fixed, dismiss-free) so the
// driver always knows whether GPS is buffered or syncing. The offline
// resilience lifecycle (Convex connection bridge + buffered-GPS sync engine)
// starts here once per mount — components below only consume state.

export default function DriverShell(props: {
  children: React.ReactNode;
  activeItem: string;
}) {
  // Observe the actual Convex client connection and drive the buffered-GPS
  // sync engine (auto-sync on reconnect/focus; bounded backoff on failure).
  useConvexConnectionBridge();
  useSyncEngine();

  return (
    <AppShell area="driver" activeItem={props.activeItem} brandLabel="Lasha">
      <DriverConnectivityIndicator />
      {props.children}
    </AppShell>
  );
}
