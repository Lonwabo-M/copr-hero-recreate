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
// Only pages that already exist. The Driver App structure can later support
// Earnings, History, Profile, Safety/SOS — none exist yet, so they are
// NOT listed (no placeholder pages).
export const driverNavigation: NavItem[] = [
  { label: "Delivery Offers", route: "/driver/offers" },
  { label: "Active Delivery", route: "/driver/active-delivery" },
];

// ─── Operations Centre Navigation ────────────────────────────────────────────
// Operations/dispatch functionality only.
export const operationsNavigation: NavItem[] = [
  { label: "Operations Centre", route: "/operations" },
];

// ─── Admin Navigation ────────────────────────────────────────────────────────
// No admin-specific pages exist yet. Documented as a remaining gap; when admin
// pages are built they get entries here. Until then, admin-role users are
// routed to the Operations Centre shell (see roleAccess.ts homeRouteForRole).
export const adminNavigation: NavItem[] = [];

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
