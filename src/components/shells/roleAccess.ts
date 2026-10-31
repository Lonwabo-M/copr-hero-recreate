import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
  type Role,
} from "@/convex/schema";
import { APP_AREAS, type AppArea } from "./navigation";

// ─── Role → Area Mapping ─────────────────────────────────────────────────────
// Maps backend RBAC roles to the application area the account belongs to.
// Internal staff roles all share the staff login realm, but only roles holding
// the explicit `admin:access` permission may enter the Admin Portal.
// `company_admin` is a Lasha staff administrator, not a customer/business role.

export function roleToArea(role?: string): AppArea {
  switch (role) {
    case ROLES.DRIVER:
      return APP_AREAS.DRIVER;
    case ROLES.OPERATIONS:
    case ROLES.FLEET_MANAGER:
      return APP_AREAS.OPERATIONS;
    case ROLES.COMPANY_ADMIN:
    case ROLES.SUPER_ADMIN:
      return APP_AREAS.ADMIN;
    case ROLES.CUSTOMER:
    default:
      // Unknown/missing roles default to the Customer experience. The backend
      // remains authoritative: it defaults missing roles to customer too.
      return APP_AREAS.CUSTOMER;
  }
}

// ─── Admin Permission ────────────────────────────────────────────────────────
// Admin is a permission, not "whatever role happened to reach this page".
// Operations and Fleet Manager are staff, but do not automatically become
// administrators.

export function hasAdminAccess(role?: string): boolean {
  if (!role) return false;
  const permissions = ROLE_PERMISSIONS[role as Role];
  return permissions?.includes(PERMISSIONS.ADMIN_ACCESS) ?? false;
}

// ─── Area Access ─────────────────────────────────────────────────────────────
// Each area belongs to exactly one realm. There is no cross-area walk-in and
// no test elevation: an account enters only the area its role belongs to.

export function canAccessArea(role: string | undefined, area: AppArea): boolean {
  switch (area) {
    case APP_AREAS.CUSTOMER:
      // Customer realm only. A roleless account is a brand-new customer before
      // server-side provisioning.
      return role === undefined || role === ROLES.CUSTOMER;
    case APP_AREAS.DRIVER:
      return role === ROLES.DRIVER;
    case APP_AREAS.OPERATIONS:
      return role === ROLES.OPERATIONS || role === ROLES.FLEET_MANAGER;
    case APP_AREAS.ADMIN:
      return hasAdminAccess(role);
    default:
      return false;
  }
}

// ─── Post-Auth Home Route ────────────────────────────────────────────────────
// Where each area's home lives. Used by RoleGate and the auth page fallback.

export const AREA_HOME: Record<AppArea, string> = {
  [APP_AREAS.CUSTOMER]: "/dashboard",
  [APP_AREAS.DRIVER]: "/driver",
  [APP_AREAS.OPERATIONS]: "/operations",
  // The Admin Portal's first page: the driver approvals pipeline.
  [APP_AREAS.ADMIN]: "/admin/driver-approvals",
};

export function homeRouteForRole(role?: string): string {
  return AREA_HOME[roleToArea(role)];
}
