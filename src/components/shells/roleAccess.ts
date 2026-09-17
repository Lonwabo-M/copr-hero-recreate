import { ROLES } from "@/convex/schema";
import { APP_AREAS, type AppArea } from "./navigation";

// ─── Role → Area Mapping ─────────────────────────────────────────────────────
// Maps backend RBAC roles (src/convex/schema.ts) to the frontend application
// area the user should land in. super_admin and company_admin get admin
// capabilities per the existing RBAC permission model (user:manage etc.).
// fleet_manager is an operational role (fleet:view/manage) → Operations Centre.

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
      // Unknown/missing role defaults to the Customer Portal — the backend
      // remains authoritative: Convex queries/mutations still enforce RBAC.
      return APP_AREAS.CUSTOMER;
  }
}

// ─── Area Access ─────────────────────────────────────────────────────────────
// Which roles may access which application area. Admin is intentionally open
// to both admin roles; Operations is open to ops + fleet managers + admins
// (admins retain supervisory access, mirroring backend checks like
// `user.role === ROLES.SUPER_ADMIN || user.role === ROLES.OPERATIONS`).

export function canAccessArea(role: string | undefined, area: AppArea): boolean {
  switch (area) {
    case APP_AREAS.CUSTOMER:
      // All authenticated roles may view the Customer Portal (customers own it;
      // the backend scopes all queries per-user regardless of role).
      return true;
    case APP_AREAS.DRIVER:
      return role === ROLES.DRIVER || role === ROLES.SUPER_ADMIN;
    case APP_AREAS.OPERATIONS:
      return (
        role === ROLES.OPERATIONS ||
        role === ROLES.FLEET_MANAGER ||
        role === ROLES.COMPANY_ADMIN ||
        role === ROLES.SUPER_ADMIN
      );
    case APP_AREAS.ADMIN:
      return role === ROLES.COMPANY_ADMIN || role === ROLES.SUPER_ADMIN;
    default:
      return false;
  }
}

// ─── Post-Auth Home Route ────────────────────────────────────────────────────
// Role-aware landing: where each area's home lives. Used by RequireRole and
// the auth page fallback.

export const AREA_HOME: Record<AppArea, string> = {
  [APP_AREAS.CUSTOMER]: "/dashboard",
  [APP_AREAS.DRIVER]: "/driver",
  [APP_AREAS.OPERATIONS]: "/operations",
  // The Admin Portal's first page: the driver approvals pipeline
  // (Capture → Review → Accept).
  [APP_AREAS.ADMIN]: "/admin/driver-approvals",
};

export function homeRouteForRole(role?: string): string {
  return AREA_HOME[roleToArea(role)];
}
