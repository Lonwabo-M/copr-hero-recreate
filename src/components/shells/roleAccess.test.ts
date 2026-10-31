/**
 * Role-aware routing tests — pure logic only (no React rendering).
 *
 * Covers the Phase 1 access model:
 * - role → application-area mapping
 * - realm-exclusive area access
 * - Admin gated by the explicit `admin:access` permission
 * - post-auth home route per role
 * - no cross-area navigation entries
 *
 * Run: bunx tsx src/components/shells/roleAccess.test.ts
 */

import { ROLES } from "../../convex/schema";
import { APP_AREAS } from "./navigation";
import {
  roleToArea,
  canAccessArea,
  hasAdminAccess,
  homeRouteForRole,
} from "./roleAccess";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(name: string, condition: boolean) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(name);
  }
}

// ─── 1. Role → Area mapping ──────────────────────────────────────────────────
assert("customer → customer area", roleToArea(ROLES.CUSTOMER) === APP_AREAS.CUSTOMER);
assert("driver → driver area", roleToArea(ROLES.DRIVER) === APP_AREAS.DRIVER);
assert("operations → operations area", roleToArea(ROLES.OPERATIONS) === APP_AREAS.OPERATIONS);
assert("fleet_manager → operations area", roleToArea(ROLES.FLEET_MANAGER) === APP_AREAS.OPERATIONS);
assert("company_admin → admin area", roleToArea(ROLES.COMPANY_ADMIN) === APP_AREAS.ADMIN);
assert("super_admin → admin area", roleToArea(ROLES.SUPER_ADMIN) === APP_AREAS.ADMIN);
assert("unknown role defaults to customer area", roleToArea("intruder") === APP_AREAS.CUSTOMER);
assert("missing role defaults to customer area", roleToArea(undefined) === APP_AREAS.CUSTOMER);

// ─── 2. Admin permission ─────────────────────────────────────────────────────
assert("company_admin has admin:access", hasAdminAccess(ROLES.COMPANY_ADMIN));
assert("super_admin has admin:access", hasAdminAccess(ROLES.SUPER_ADMIN));
assert("operations lacks admin:access", !hasAdminAccess(ROLES.OPERATIONS));
assert("fleet_manager lacks admin:access", !hasAdminAccess(ROLES.FLEET_MANAGER));
assert("driver lacks admin:access", !hasAdminAccess(ROLES.DRIVER));
assert("customer lacks admin:access", !hasAdminAccess(ROLES.CUSTOMER));

// ─── 3. Realm-exclusive area access ─────────────────────────────────────────
assert("customer area accessible to customer", canAccessArea(ROLES.CUSTOMER, APP_AREAS.CUSTOMER));
assert("customer area accessible to roleless sign-up", canAccessArea(undefined, APP_AREAS.CUSTOMER));
assert("customer area DENIED to driver", !canAccessArea(ROLES.DRIVER, APP_AREAS.CUSTOMER));
assert("customer area DENIED to operations", !canAccessArea(ROLES.OPERATIONS, APP_AREAS.CUSTOMER));
assert("customer area DENIED to company_admin", !canAccessArea(ROLES.COMPANY_ADMIN, APP_AREAS.CUSTOMER));

assert("driver area accessible to driver", canAccessArea(ROLES.DRIVER, APP_AREAS.DRIVER));
assert("driver area DENIED to customer", !canAccessArea(ROLES.CUSTOMER, APP_AREAS.DRIVER));
assert("driver area DENIED to operations", !canAccessArea(ROLES.OPERATIONS, APP_AREAS.DRIVER));
assert("driver area DENIED to super_admin", !canAccessArea(ROLES.SUPER_ADMIN, APP_AREAS.DRIVER));

assert("operations area accessible to operations", canAccessArea(ROLES.OPERATIONS, APP_AREAS.OPERATIONS));
assert("operations area accessible to fleet_manager", canAccessArea(ROLES.FLEET_MANAGER, APP_AREAS.OPERATIONS));
assert("operations area DENIED to company_admin", !canAccessArea(ROLES.COMPANY_ADMIN, APP_AREAS.OPERATIONS));
assert("operations area DENIED to super_admin", !canAccessArea(ROLES.SUPER_ADMIN, APP_AREAS.OPERATIONS));
assert("operations area DENIED to driver", !canAccessArea(ROLES.DRIVER, APP_AREAS.OPERATIONS));

assert("admin area accessible to company_admin", canAccessArea(ROLES.COMPANY_ADMIN, APP_AREAS.ADMIN));
assert("admin area accessible to super_admin", canAccessArea(ROLES.SUPER_ADMIN, APP_AREAS.ADMIN));
assert("admin area DENIED to operations", !canAccessArea(ROLES.OPERATIONS, APP_AREAS.ADMIN));
assert("admin area DENIED to fleet_manager", !canAccessArea(ROLES.FLEET_MANAGER, APP_AREAS.ADMIN));
assert("admin area DENIED to driver", !canAccessArea(ROLES.DRIVER, APP_AREAS.ADMIN));
assert("admin area DENIED to customer", !canAccessArea(ROLES.CUSTOMER, APP_AREAS.ADMIN));

// ─── 4. Home routes ──────────────────────────────────────────────────────────
assert("customer home = /dashboard", homeRouteForRole(ROLES.CUSTOMER) === "/dashboard");
assert("driver home = /driver", homeRouteForRole(ROLES.DRIVER) === "/driver");
assert("operations home = /operations", homeRouteForRole(ROLES.OPERATIONS) === "/operations");
assert("fleet_manager home = /operations", homeRouteForRole(ROLES.FLEET_MANAGER) === "/operations");
assert("company_admin home = /admin/driver-approvals", homeRouteForRole(ROLES.COMPANY_ADMIN) === "/admin/driver-approvals");
assert("super_admin home = /admin/driver-approvals", homeRouteForRole(ROLES.SUPER_ADMIN) === "/admin/driver-approvals");
assert("unknown role home = /dashboard", homeRouteForRole(undefined) === "/dashboard");

// ─── 5. Navigation separation ────────────────────────────────────────────────
const { customerNavigation, driverNavigation, operationsNavigation, adminNavigation } =
  await import("./navigation");

assert(
  "customer nav excludes staff routes",
  !customerNavigation.some((n) =>
    n.route.startsWith("/driver") ||
    n.route.startsWith("/admin") ||
    n.route === "/operations",
  ),
);
assert(
  "driver nav excludes cross-area routes",
  !driverNavigation.some((n) =>
    n.route.startsWith("/admin") ||
    n.route === "/operations" ||
    n.route === "/dashboard",
  ),
);
// Disputes and privacy requests are Operations-owned workflows that retain
// their historical /admin URLs for now; they are not Admin Portal entries.
const operationsOwnedAdminRoutes = new Set([
  "/admin/disputes",
  "/admin/privacy-requests",
]);
assert(
  "operations nav excludes driver/admin/customer routes",
  !operationsNavigation.some((n) =>
    n.route.startsWith("/driver") ||
    (n.route.startsWith("/admin") && !operationsOwnedAdminRoutes.has(n.route)) ||
    n.route === "/dashboard",
  ),
);
assert(
  "admin nav excludes operations/driver/customer routes",
  !adminNavigation.some((n) =>
    n.route === "/operations" ||
    n.route.startsWith("/driver") ||
    n.route === "/dashboard",
  ),
);
assert(
  "admin nav includes account inventory",
  adminNavigation.some((n) => n.route === "/admin/accounts"),
);

// ─── Report ──────────────────────────────────────────────────────────────────
console.log(`\nRole-access routing tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.error("Failures:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
process.exit(0);
