import AppShell from "./AppShell";

// ─── CustomerShell ───────────────────────────────────────────────────────────
// The Customer Portal experience. Contains customer/business functionality
// only: dashboard, deliveries, request/track delivery, payments, settings.
// Driver and operations entries are not part of this navigation. Existing
// customer UI and styling are unchanged.

export default function CustomerShell(props: {
  children: React.ReactNode;
  activeItem: string;
}) {
  return (
    <AppShell area="customer" activeItem={props.activeItem} brandLabel="Lasha">
      {props.children}
    </AppShell>
  );
}
