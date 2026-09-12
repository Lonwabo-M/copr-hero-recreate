import AppShell from "./AppShell";

// ─── CustomerShell ───────────────────────────────────────────────────────────
// The Customer Portal experience. Contains customer/business functionality
// only: dashboard, deliveries, request/track delivery, payments, settings.
// Driver and operations entries are not part of this navigation. Existing
// customer UI and styling are unchanged.

export default function CustomerShell(props: {
  children: React.ReactNode;
  activeItem: string;
  /** Logo variant: Dashboard used the SVG logo, other pages the "L" mark. */
  logo?: "img" | "icon";
}) {
  return (
    <AppShell
      area="customer"
      activeItem={props.activeItem}
      logo={props.logo}
      brandLabel="Lasha"
    >
      {props.children}
    </AppShell>
  );
}
