// ─── Application Areas ───────────────────────────────────────────────────────
// The four role-specific application experiences. Route guards enforce these
// areas; navigation configs are scoped to one area each.

export const APP_AREAS = {
  CUSTOMER: "customer",
  DRIVER: "driver",
  OPERATIONS: "operations",
  ADMIN: "admin",
} as const;

export type AppArea = (typeof APP_AREAS)[keyof typeof APP_AREAS];

// ─── Navigation Item ─────────────────────────────────────────────────────────
export interface NavItem {
  label: string;
  route: string;
  hasNotif?: boolean;
}

// ─── Customer Portal Navigation ──────────────────────────────────────────────
// Customer/business functionality only. No driver or operations entries.
export const customerNavigation: NavItem[] = [
  { label: "Activity Center", route: "/dashboard" },
  { label: "Past Deliveries", route: "/past-deliveries" },
  { label: "Request Delivery", route: "/request-delivery" },
  { label: "Track Delivery", route: "/track-delivery" },
  { label: "Operations Centre", route: "/operations" },
  { label: "Invoices", route: "/invoices" },
  { label: "Wallet", route: "/wallet" },
  { label: "Make Payment", route: "/make-payment" },
  { label: "Notifications", route: "/notifications", hasNotif: true },
  { label: "Help", route: "/help" },
  { label: "Legal", route: "/legal" },
  { label: "Downloads", route: "/downloads" },
  { label: "Settings", route: "/settings" },
];

// ─── Driver App Navigation ───────────────────────────────────────────────────
// Driver pages plus the cross-area test loop return paths: the Driver App is
// reachable from the Operations sidebar, so Operations Centre and Dashboard
// ride along. Guards decide admission; entering an area you don't hold
// triggers the reversible test elevation (see AppShell handleNav).
export const driverNavigation: NavItem[] = [
  { label: "Delivery Offers", route: "/driver/offers" },
  { label: "Active Delivery", route: "/driver/active-delivery" },
  { label: "Delivery History", route: "/driver/history" },
  { label: "Earnings", route: "/driver/earnings" },
  { label: "Driver Application", route: "/driver/apply" },
  { label: "Profile", route: "/driver/profile" },
  { label: "Operations Centre", route: "/operations" },
  { label: "Dashboard", route: "/dashboard" },
];

// ─── Operations Centre Navigation ────────────────────────────────────────────
// Operations/dispatch functionality, plus every cross-area access point for
// the testing loop: the customer Dashboard (return path) and the Driver App
// (claim/reveal). Real staff navigate straight through; others trigger the
// reversible test elevation in AppShell handleNav.
export const operationsNavigation: NavItem[] = [
  { label: "Operations Centre", route: "/operations" },
  { label: "Driver App", route: "/driver" },
  { label: "Admin Portal", route: "/admin/driver-approvals" },
  { label: "Dashboard", route: "/dashboard" },
];

// ─── Admin Navigation ────────────────────────────────────────────────────────
// Platform administration: driver onboarding approvals (Capture → Review →
// Accept pipeline). Reached from the Operations sidebar ("Admin Portal") via
// the same reversible test elevation as the Driver App.
export const adminNavigation: NavItem[] = [
  { label: "Driver Approvals", route: "/admin/driver-approvals" },
  { label: "Operations Centre", route: "/operations" },
  { label: "Dashboard", route: "/dashboard" },
];

// ─── Area → Navigation ───────────────────────────────────────────────────────
export const AREA_NAVIGATION: Record<AppArea, NavItem[]> = {
  [APP_AREAS.CUSTOMER]: customerNavigation,
  [APP_AREAS.DRIVER]: driverNavigation,
  [APP_AREAS.OPERATIONS]: operationsNavigation,
  [APP_AREAS.ADMIN]: adminNavigation,
};

// ─── Area Labels ─────────────────────────────────────────────────────────────
export const AREA_LABELS: Record<AppArea, string> = {
  [APP_AREAS.CUSTOMER]: "Lasha Customer Portal",
  [APP_AREAS.DRIVER]: "Lasha Driver App",
  [APP_AREAS.OPERATIONS]: "Lasha Operations",
  [APP_AREAS.ADMIN]: "Lasha Admin",
};
