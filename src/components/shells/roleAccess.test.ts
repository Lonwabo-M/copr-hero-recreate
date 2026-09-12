/**
 * Role-aware routing tests — pure logic only (no React rendering).
 *
 * Covers the acceptance criteria for role separation:
 * - role → application-area mapping
 * - area access checks (customer/driver/operations/admin)
 * - post-auth home route per role
 *
 * Run: bunx tsx src/components/shells/roleAccess.test.ts
 * (Self-contained assertion harness, matching the repo's existing test pattern.)
 */

import { ROLES } from "../../convex/schema";
import { APP_AREAS } from "./navigation";
import { roleToArea, canAccessArea, homeRouteForRole } from "./roleAccess";

// ─── Tiny assertion harness (mirrors existing repo tests) ────────────────────
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

// ─── 2. Area access matrix ───────────────────────────────────────────────────
// Customer area: accessible to all authenticated roles
for (const role of Object.values(ROLES)) {
  assert(`customer area accessible to ${role}`, canAccessArea(role, APP_AREAS.CUSTOMER));
}

// Driver area: only drivers (and super_admin)
assert("driver area accessible to driver", canAccessArea(ROLES.DRIVER, APP_AREAS.DRIVER));
assert("driver area accessible to super_admin", canAccessArea(ROLES.SUPER_ADMIN, APP_AREAS.DRIVER));
assert("driver area DENIED to customer", !canAccessArea(ROLES.CUSTOMER, APP_AREAS.DRIVER));
assert("driver area DENIED to operations", !canAccessArea(ROLES.OPERATIONS, APP_AREAS.DRIVER));
assert("driver area DENIED to fleet_manager", !canAccessArea(ROLES.FLEET_MANAGER, APP_AREAS.DRIVER));
assert("driver area DENIED to company_admin", !canAccessArea(ROLES.COMPANY_ADMIN, APP_AREAS.DRIVER));
assert("driver area DENIED to unknown role", !canAccessArea("intruder", APP_AREAS.DRIVER));
assert("driver area DENIED to missing role", !canAccessArea(undefined, APP_AREAS.DRIVER));

// Operations area: operations, fleet managers, and admins
assert("operations area accessible to operations", canAccessArea(ROLES.OPERATIONS, APP_AREAS.OPERATIONS));
assert("operations area accessible to fleet_manager", canAccessArea(ROLES.FLEET_MANAGER, APP_AREAS.OPERATIONS));
assert("operations area accessible to company_admin", canAccessArea(ROLES.COMPANY_ADMIN, APP_AREAS.OPERATIONS));
assert("operations area accessible to super_admin", canAccessArea(ROLES.SUPER_ADMIN, APP_AREAS.OPERATIONS));
assert("operations area DENIED to customer", !canAccessArea(ROLES.CUSTOMER, APP_AREAS.OPERATIONS));
assert("operations area DENIED to driver", !canAccessArea(ROLES.DRIVER, APP_AREAS.OPERATIONS));
assert("operations area DENIED to unknown role", !canAccessArea("intruder", APP_AREAS.OPERATIONS));

// Admin area: company_admin + super_admin only
assert("admin area accessible to company_admin", canAccessArea(ROLES.COMPANY_ADMIN, APP_AREAS.ADMIN));
assert("admin area accessible to super_admin", canAccessArea(ROLES.SUPER_ADMIN, APP_AREAS.ADMIN));
assert("admin area DENIED to customer", !canAccessArea(ROLES.CUSTOMER, APP_AREAS.ADMIN));
assert("admin area DENIED to driver", !canAccessArea(ROLES.DRIVER, APP_AREAS.ADMIN));
assert("admin area DENIED to operations", !canAccessArea(ROLES.OPERATIONS, APP_AREAS.ADMIN));
assert("admin area DENIED to fleet_manager", !canAccessArea(ROLES.FLEET_MANAGER, APP_AREAS.ADMIN));
assert("admin area DENIED to unknown role", !canAccessArea("intruder", APP_AREAS.ADMIN));

// ─── 3. Home routes ──────────────────────────────────────────────────────────
assert("customer home = /dashboard", homeRouteForRole(ROLES.CUSTOMER) === "/dashboard");
assert("driver home = /driver", homeRouteForRole(ROLES.DRIVER) === "/driver");
assert("operations home = /operations", homeRouteForRole(ROLES.OPERATIONS) === "/operations");
assert("fleet_manager home = /operations", homeRouteForRole(ROLES.FLEET_MANAGER) === "/operations");
// Admin pages don't exist yet — admins land in Operations (documented gap)
assert("company_admin home = /operations (gap)", homeRouteForRole(ROLES.COMPANY_ADMIN) === "/operations");
assert("super_admin home = /operations (gap)", homeRouteForRole(ROLES.SUPER_ADMIN) === "/operations");
assert("unknown role home = /dashboard (safe default)", homeRouteForRole(undefined) === "/dashboard");

// ─── 4. Navigation separation ────────────────────────────────────────────────
// Driver App nav must NOT contain customer-only entries.
const { customerNavigation, driverNavigation, operationsNavigation, adminNavigation } =
  await import("./navigation");

const customerOnlyLabels = [
  "Activity Center",
  "Request Delivery",
  "Track Delivery",
  "Wallet",
  "Make Payment",
  "Invoices",
];
for (const label of customerOnlyLabels) {
  assert(
    `driver nav excludes "${label}"`,
    !driverNavigation.some((n) => n.label === label),
  );
}
assert(
  "driver nav has no customer route paths",
  !driverNavigation.some((n) => !n.route.startsWith("/driver") && n.route !== "#"),
);
assert(
  "operations nav has no driver/customer routes",
  !operationsNavigation.some((n) => n.route.startsWith("/driver") || n.route === "/dashboard"),
);

// Customer nav must NOT contain driver/operations entries.
assert(
  "customer nav excludes Active Delivery",
  !customerNavigation.some((n) => n.label === "Active Delivery"),
);
assert(
  "customer nav excludes driver routes",
  !customerNavigation.some((n) => n.route.startsWith("/driver")),
);
assert(
  "customer nav excludes operations routes",
  !customerNavigation.some((n) => n.route.startsWith("/operations")),
);

// Admin nav intentionally empty (no admin pages yet).
assert("admin nav is empty until admin pages exist", adminNavigation.length === 0);

// ─── Report ──────────────────────────────────────────────────────────────────
console.log(`\nRole-access routing tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.error("Failures:");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
process.exit(0);
