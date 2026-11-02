/**
 * Staff provisioning policy tests.
 *
 * Run with: bunx tsx src/convex/admin/staffPolicy.test.ts
 *
 * These are negative tests first: the point is to prove who cannot create,
 * change, suspend or reactivate staff access. The structural check at the end
 * verifies the Admin → Accounts mutations actually delegate to these helpers.
 */

import { readFileSync } from "fs";
import {
  PERMISSIONS,
  ROLES,
  ROLE_PERMISSIONS,
  isUserSuspended,
} from "../schema";
import {
  assignableStaffRolesFor,
  canActOnStaffAccount,
  canChangeStaffRole,
  canGrantStaffRole,
  canManageStaffAccount,
  canReactivateStaffAccount,
  canSuspendStaffAccount,
  findUserWithNormalizedEmail,
  normalizeStaffEmail,
  validateStaffEmail,
  validateStaffName,
  wouldRemoveLastSuperAdmin,
} from "./staffPolicy";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected ${expected}, got ${actual}`);
  }
}

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${message}`);
  }
}

function describe(name: string, fn: () => void) {
  console.log(`\n${name}`);
  fn();
}

// ─── Role ceiling ───────────────────────────────────────────────────────────

describe("Role ceiling", () => {
  test("company admin can grant operations and fleet manager", () => {
    assert(canGrantStaffRole(ROLES.COMPANY_ADMIN, ROLES.OPERATIONS), "operations");
    assert(canGrantStaffRole(ROLES.COMPANY_ADMIN, ROLES.FLEET_MANAGER), "fleet manager");
  });

  test("company admin cannot grant company admin, super admin, customer or driver", () => {
    assert(!canGrantStaffRole(ROLES.COMPANY_ADMIN, ROLES.COMPANY_ADMIN), "cannot mint peer admin");
    assert(!canGrantStaffRole(ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN), "cannot mint super admin");
    assert(!canGrantStaffRole(ROLES.COMPANY_ADMIN, ROLES.CUSTOMER), "cannot mint customer");
    assert(!canGrantStaffRole(ROLES.COMPANY_ADMIN, ROLES.DRIVER), "cannot mint driver");
  });

  test("super admin can grant admin tier but not another super admin", () => {
    assert(canGrantStaffRole(ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN), "company admin");
    assert(canGrantStaffRole(ROLES.SUPER_ADMIN, ROLES.OPERATIONS), "operations");
    assert(canGrantStaffRole(ROLES.SUPER_ADMIN, ROLES.FLEET_MANAGER), "fleet manager");
    assert(!canGrantStaffRole(ROLES.SUPER_ADMIN, ROLES.SUPER_ADMIN), "no self-replication");
  });

  test("non-admin staff cannot grant staff roles", () => {
    for (const role of [ROLES.OPERATIONS, ROLES.FLEET_MANAGER]) {
      assertEqual(assignableStaffRolesFor(role).length, 0, `${role} has no grantable roles`);
      assert(!canGrantStaffRole(role, ROLES.OPERATIONS), `${role} cannot grant operations`);
    }
  });

  test("company admin cannot promote an operations user to company admin", () => {
    assert(
      !canChangeStaffRole(
        "admin-1",
        "target-1",
        ROLES.COMPANY_ADMIN,
        ROLES.OPERATIONS,
        ROLES.COMPANY_ADMIN,
      ),
      "peer-admin promotion blocked",
    );
  });

  test("super admin can promote a company admin's role downward", () => {
    assert(
      canChangeStaffRole(
        "super-1",
        "target-1",
        ROLES.SUPER_ADMIN,
        ROLES.COMPANY_ADMIN,
        ROLES.OPERATIONS,
      ),
      "admin-tier demotion allowed for super admin",
    );
  });
});

// ─── Management ceiling ─────────────────────────────────────────────────────

describe("Management ceiling", () => {
  test("company admin can manage only non-admin staff", () => {
    assert(canManageStaffAccount(ROLES.COMPANY_ADMIN, ROLES.OPERATIONS), "operations");
    assert(canManageStaffAccount(ROLES.COMPANY_ADMIN, ROLES.FLEET_MANAGER), "fleet manager");
    assert(!canManageStaffAccount(ROLES.COMPANY_ADMIN, ROLES.COMPANY_ADMIN), "peer admin");
    assert(!canManageStaffAccount(ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN), "super admin");
  });

  test("super admin can manage every existing staff account", () => {
    for (const role of [
      ROLES.OPERATIONS,
      ROLES.FLEET_MANAGER,
      ROLES.COMPANY_ADMIN,
      ROLES.SUPER_ADMIN,
    ]) {
      assert(canManageStaffAccount(ROLES.SUPER_ADMIN, role), `manage ${role}`);
    }
  });

  test("customer and driver accounts are outside staff management", () => {
    assert(!canManageStaffAccount(ROLES.SUPER_ADMIN, ROLES.CUSTOMER), "customer");
    assert(!canManageStaffAccount(ROLES.SUPER_ADMIN, ROLES.DRIVER), "driver");
    assert(!canManageStaffAccount(ROLES.COMPANY_ADMIN, ROLES.CUSTOMER), "customer by admin");
    assert(!canManageStaffAccount(ROLES.COMPANY_ADMIN, ROLES.DRIVER), "driver by admin");
  });

  test("operations and fleet managers cannot manage staff", () => {
    assert(!canManageStaffAccount(ROLES.OPERATIONS, ROLES.OPERATIONS), "operations");
    assert(!canManageStaffAccount(ROLES.FLEET_MANAGER, ROLES.FLEET_MANAGER), "fleet manager");
  });
});

// ─── Self-edit guard ────────────────────────────────────────────────────────

describe("Self-edit guard", () => {
  test("an admin cannot act on their own account", () => {
    assert(
      !canActOnStaffAccount(
        "same-user",
        "same-user",
        ROLES.SUPER_ADMIN,
        ROLES.SUPER_ADMIN,
      ),
      "self action denied",
    );
    assert(
      !canChangeStaffRole(
        "same-user",
        "same-user",
        ROLES.SUPER_ADMIN,
        ROLES.SUPER_ADMIN,
        ROLES.COMPANY_ADMIN,
      ),
      "self demotion denied",
    );
    assert(
      !canSuspendStaffAccount(
        "same-user",
        "same-user",
        ROLES.SUPER_ADMIN,
        ROLES.SUPER_ADMIN,
        2,
      ),
      "self suspension denied",
    );
    assert(
      !canReactivateStaffAccount(
        "same-user",
        "same-user",
        ROLES.SUPER_ADMIN,
        ROLES.SUPER_ADMIN,
      ),
      "self reactivation denied",
    );
  });

  test("a different super admin is allowed", () => {
    assert(
      canActOnStaffAccount(
        "super-1",
        "super-2",
        ROLES.SUPER_ADMIN,
        ROLES.SUPER_ADMIN,
      ),
      "peer super admin action allowed",
    );
  });
});

// ─── Last-super-admin guard ─────────────────────────────────────────────────

describe("Last active super admin guard", () => {
  test("demoting the only active super admin is refused", () => {
    assert(
      wouldRemoveLastSuperAdmin(ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN, 1),
      "last super admin demotion blocked",
    );
  });

  test("demoting a super admin is allowed when another remains", () => {
    assert(
      !wouldRemoveLastSuperAdmin(ROLES.SUPER_ADMIN, ROLES.COMPANY_ADMIN, 2),
      "demotion allowed with two active super admins",
    );
  });

  test("suspending the only active super admin is refused", () => {
    assert(
      wouldRemoveLastSuperAdmin(ROLES.SUPER_ADMIN, null, 1),
      "last super admin suspension blocked",
    );
    assert(
      !canSuspendStaffAccount(
        "super-1",
        "super-2",
        ROLES.SUPER_ADMIN,
        ROLES.SUPER_ADMIN,
        1,
      ),
      "policy refuses last-admin suspension",
    );
  });

  test("suspending a super admin is allowed when another remains", () => {
    assert(
      canSuspendStaffAccount(
        "super-1",
        "super-2",
        ROLES.SUPER_ADMIN,
        ROLES.SUPER_ADMIN,
        2,
      ),
      "suspension allowed with two active super admins",
    );
  });

  test("non-super-admin roles are untouched by the last-admin guard", () => {
    assert(
      !wouldRemoveLastSuperAdmin(ROLES.OPERATIONS, ROLES.FLEET_MANAGER, 1),
      "operations demotion is not a last-admin case",
    );
    assert(
      canSuspendStaffAccount(
        "admin-1",
        "ops-1",
        ROLES.COMPANY_ADMIN,
        ROLES.OPERATIONS,
        1,
      ),
      "operations suspension allowed",
    );
  });
});

// ─── Duplicate email + validation ──────────────────────────────────────────

describe("Duplicate email handling", () => {
  test("normalisation is case-insensitive and trims whitespace", () => {
    assertEqual(normalizeStaffEmail("  Thandi@Lasha.CO.ZA "), "thandi@lasha.co.za", "normalised");
  });

  test("a case-variant duplicate is found", () => {
    const users = [
      { email: "existing@lasha.co.za", name: "Existing" },
      { email: "other@lasha.co.za", name: "Other" },
    ];
    assertEqual(
      findUserWithNormalizedEmail(users, "  EXISTING@LASHA.CO.ZA "),
      users[0],
      "duplicate found regardless of case",
    );
  });

  test("a unique email is not treated as a duplicate", () => {
    const users = [{ email: "existing@lasha.co.za" }];
    assertEqual(
      findUserWithNormalizedEmail(users, "new@lasha.co.za"),
      undefined,
      "unique email accepted",
    );
  });

  test("invalid and empty emails are rejected", () => {
    assert(validateStaffEmail("") !== null, "empty email rejected");
    assert(validateStaffEmail("not-an-email") !== null, "malformed email rejected");
    assert(validateStaffEmail("name@lasha.co.za") === null, "valid email accepted");
  });

  test("short and overlong names are rejected", () => {
    assert(validateStaffName("A") !== null, "one-character name rejected");
    assert(validateStaffName("x".repeat(101)) !== null, "overlong name rejected");
    assert(validateStaffName("Thandi Mokoena") === null, "valid name accepted");
  });
});

// ─── Suspension state ──────────────────────────────────────────────────────

describe("Suspension state", () => {
  test("only a timestamp marks an account suspended", () => {
    assert(isUserSuspended({ staffSuspendedAt: 123 }), "timestamp means suspended");
    assert(!isUserSuspended({}), "missing timestamp means active");
    assert(!isUserSuspended(null), "null user is not suspended");
    assert(!isUserSuspended(undefined), "undefined user is not suspended");
  });
});

// ─── Permission wiring ─────────────────────────────────────────────────────

describe("STAFF_MANAGE permission", () => {
  test("company and super admins hold staff:manage", () => {
    assert(
      ROLE_PERMISSIONS[ROLES.COMPANY_ADMIN].includes(PERMISSIONS.STAFF_MANAGE),
      "company admin has staff:manage",
    );
    assert(
      ROLE_PERMISSIONS[ROLES.SUPER_ADMIN].includes(PERMISSIONS.STAFF_MANAGE),
      "super admin has staff:manage",
    );
  });

  test("operations, fleet managers, drivers and customers do not", () => {
    for (const role of [
      ROLES.OPERATIONS,
      ROLES.FLEET_MANAGER,
      ROLES.DRIVER,
      ROLES.CUSTOMER,
    ]) {
      assert(
        !ROLE_PERMISSIONS[role].includes(PERMISSIONS.STAFF_MANAGE),
        `${role} lacks staff:manage`,
      );
    }
  });
});

// ─── Structural wiring ─────────────────────────────────────────────────────

describe("Admin Accounts wiring", () => {
  const accounts = readFileSync("src/convex/admin/accounts.ts", "utf8");

  test("mutations require the staff-management permission", () => {
    assert(accounts.includes("requireStaffManager"), "staff manager guard present");
    assert(accounts.includes("PERMISSIONS.STAFF_MANAGE"), "permission checked");
  });

  test("create rejects duplicate normalised emails", () => {
    const block = accounts.slice(
      accounts.indexOf("export const createStaffAccount"),
      accounts.indexOf("export const changeStaffRole"),
    );
    assert(block.includes("findUserWithNormalizedEmail"), "duplicate lookup used");
    assert(block.includes("An account with this email already exists"), "duplicate rejected");
    assert(block.includes("AUDIT_ACTIONS.USER_CREATED"), "creation audited");
  });

  test("role changes use the ceiling and last-admin guard", () => {
    const block = accounts.slice(
      accounts.indexOf("export const changeStaffRole"),
      accounts.indexOf("export const suspendStaffAccount"),
    );
    assert(block.includes("canChangeStaffRole"), "role ceiling enforced");
    assert(block.includes("wouldRemoveLastSuperAdmin"), "last-admin guard enforced");
    assert(block.includes("AUDIT_ACTIONS.USER_ROLE_CHANGED"), "role change audited");
  });

  test("suspension and reactivation use the policy and audit trail", () => {
    const block = accounts.slice(
      accounts.indexOf("export const suspendStaffAccount"),
      accounts.indexOf("export const reactivateStaffAccount"),
    );
    assert(block.includes("canSuspendStaffAccount"), "suspension policy enforced");
    assert(block.includes("staffSuspendedAt"), "suspension timestamp written");
    assert(block.includes("AUDIT_ACTIONS.USER_DEACTIVATED"), "suspension audited");

    const reactivate = accounts.slice(
      accounts.indexOf("export const reactivateStaffAccount"),
      accounts.indexOf("export const restoreLegacyTestElevations"),
    );
    assert(reactivate.includes("canReactivateStaffAccount"), "reactivation policy enforced");
    assert(reactivate.includes("AUDIT_ACTIONS.USER_REACTIVATED"), "reactivation audited");
  });

  test("the authorization boundary reads the suspension timestamp", () => {
    const authz = readFileSync("src/convex/auth/authorization.ts", "utf8");
    assert(authz.includes("isUserSuspended"), "authorization imports suspension check");
    assert(authz.includes("This account is suspended"), "suspended sessions rejected");
  });
});

// ─── Summary ───────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(56)}`);
console.log(`Staff policy tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
}
console.log(`${"=".repeat(56)}\n`);

if (failed > 0) {
  process.exit(1);
}
