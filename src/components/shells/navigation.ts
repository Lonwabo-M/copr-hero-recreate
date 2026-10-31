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
// Customer/business functionality only — deliberately NO driver, operations or
// admin entries. The staff portals are standalone applications at their own
// URLs (/driver, /operations, /admin/...) and are opened in their own browser
// tabs; they are never advertised from the customer-facing product. Their
// routes and guards stay fully wired (RoleGate + test access) for staff and
// for allowlisted testing accounts.
export const customerNavigation: NavItem[] = [
  { label: "Activity Center", route: "/dashboard" },
  { label: "Past Deliveries", route: "/past-deliveries" },
  { label: "Request Delivery", route: "/request-delivery" },
  { label: "Track Delivery", route: "/track-delivery" },
  { label: "Address Book", route: "/address-book" },
  { label: "Invoices", route: "/invoices" },
  { label: "Wallet", route: "/wallet" },
  { label: "Notifications", route: "/notifications", hasNotif: true },
  { label: "Help", route: "/help" },
  { label: "Disputes", route: "/disputes" },
  { label: "Legal", route: "/legal" },
  { label: "Downloads", route: "/downloads" },
  { label: "Settings", route: "/settings" },
];

// ─── Driver App Navigation ───────────────────────────────────────────────────
// Driver-only pages. The Driver App never advertises customer, Operations or
// Admin entries; those are different realms/applications.
export const driverNavigation: NavItem[] = [
  { label: "Delivery Offers", route: "/driver/offers" },
  { label: "Active Delivery", route: "/driver/active-delivery" },
  { label: "Delivery History", route: "/driver/history" },
  { label: "Earnings", route: "/driver/earnings" },
  { label: "Driver Application", route: "/driver/apply" },
  { label: "Profile", route: "/driver/profile" },
];

// ─── Operations Centre Navigation ────────────────────────────────────────────
// Internal operations work only. Operations does not receive an Admin Portal
// entry: Admin is a separate permission held by Lasha administrators.
export const operationsNavigation: NavItem[] = [
  { label: "Operations Centre", route: "/operations" },
  { label: "Disputes", route: "/admin/disputes" },
  { label: "Privacy Requests", route: "/admin/privacy-requests" },
];

// ─── Admin Navigation ────────────────────────────────────────────────────────
// Platform administration for accounts holding `admin:access`: driver
// onboarding approvals, the roster of record, pricing rules, platform health,
// audit trail and the account inventory. Admin staff do not get Operations or
// Customer navigation; those are separate areas.
export const adminNavigation: NavItem[] = [
  { label: "Driver Approvals", route: "/admin/driver-approvals" },
  { label: "Driver Roster", route: "/admin/driver-roster" },
  { label: "Pricing Rules", route: "/admin/pricing-rules" },
  { label: "Platform Health", route: "/admin/platform-health" },
  { label: "Audit Log", route: "/admin/audit-log" },
  { label: "Accounts", route: "/admin/accounts" },
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
