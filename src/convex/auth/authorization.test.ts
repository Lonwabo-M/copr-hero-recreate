/**
 * Lasha Authorization Tests
 *
 * These tests verify that the RBAC system correctly enforces permissions.
 * Run with: bun test src/convex/auth/authorization.test.ts
 */

import {
  ROLES,
  PERMISSIONS,
  ROLE_PERMISSIONS,
  Role,
  Permission,
} from "../schema";
import { hasPermission } from "./authorization";

// ─── Simple test helpers ──────────────────────────────────────────────────────

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`Assertion failed: ${message}. Expected ${expected}, got ${actual}`);
  }
}

// ─── Test Results ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    const msg = e instanceof Error ? e.message : String(e);
    failures.push(`${name}: ${msg}`);
    console.log(`  ✗ ${name}`);
    console.log(`    ${msg}`);
  }
}

function describe(name: string, fn: () => void) {
  console.log(`\n${name}`);
  fn();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("CUSTOMER role", () => {
  test("should have delivery:create permission", () => {
    assertEqual(hasPermission(ROLES.CUSTOMER, PERMISSIONS.DELIVERY_CREATE), true, "delivery:create");
  });

  test("should have delivery:view permission", () => {
    assertEqual(hasPermission(ROLES.CUSTOMER, PERMISSIONS.DELIVERY_VIEW), true, "delivery:view");
  });

  test("should have delivery:cancel permission", () => {
    assertEqual(hasPermission(ROLES.CUSTOMER, PERMISSIONS.DELIVERY_CANCEL), true, "delivery:cancel");
  });

  test("should have tracking:view permission", () => {
    assertEqual(hasPermission(ROLES.CUSTOMER, PERMISSIONS.TRACKING_VIEW), true, "tracking:view");
  });

  test("should NOT have delivery:assign permission", () => {
    assertEqual(hasPermission(ROLES.CUSTOMER, PERMISSIONS.DELIVERY_ASSIGN), false, "delivery:assign");
  });

  test("should NOT have driver:manage permission", () => {
    assertEqual(hasPermission(ROLES.CUSTOMER, PERMISSIONS.DRIVER_MANAGE), false, "driver:manage");
  });

  test("should NOT have operations:manage permission", () => {
    assertEqual(hasPermission(ROLES.CUSTOMER, PERMISSIONS.OPERATIONS_MANAGE), false, "operations:manage");
  });

  test("should NOT have pricing:manage permission", () => {
    assertEqual(hasPermission(ROLES.CUSTOMER, PERMISSIONS.PRICING_MANAGE), false, "pricing:manage");
  });
});

describe("DRIVER role", () => {
  test("should have delivery:view permission", () => {
    assertEqual(hasPermission(ROLES.DRIVER, PERMISSIONS.DELIVERY_VIEW), true, "delivery:view");
  });

  test("should have delivery:update_status permission", () => {
    assertEqual(hasPermission(ROLES.DRIVER, PERMISSIONS.DELIVERY_UPDATE_STATUS), true, "delivery:update_status");
  });

  test("should have driver:view permission", () => {
    assertEqual(hasPermission(ROLES.DRIVER, PERMISSIONS.DRIVER_VIEW), true, "driver:view");
  });

  test("should have tracking:view permission", () => {
    assertEqual(hasPermission(ROLES.DRIVER, PERMISSIONS.TRACKING_VIEW), true, "tracking:view");
  });

  test("should NOT have delivery:create permission", () => {
    assertEqual(hasPermission(ROLES.DRIVER, PERMISSIONS.DELIVERY_CREATE), false, "delivery:create");
  });

  test("should NOT have delivery:assign permission", () => {
    assertEqual(hasPermission(ROLES.DRIVER, PERMISSIONS.DELIVERY_ASSIGN), false, "delivery:assign");
  });

  test("should NOT have driver:manage permission", () => {
    assertEqual(hasPermission(ROLES.DRIVER, PERMISSIONS.DRIVER_MANAGE), false, "driver:manage");
  });

  test("should NOT have fleet:manage permission", () => {
    assertEqual(hasPermission(ROLES.DRIVER, PERMISSIONS.FLEET_MANAGE), false, "fleet:manage");
  });
});

describe("FLEET_MANAGER role", () => {
  test("should have driver:view permission", () => {
    assertEqual(hasPermission(ROLES.FLEET_MANAGER, PERMISSIONS.DRIVER_VIEW), true, "driver:view");
  });

  test("should have driver:manage permission", () => {
    assertEqual(hasPermission(ROLES.FLEET_MANAGER, PERMISSIONS.DRIVER_MANAGE), true, "driver:manage");
  });

  test("should have fleet:view permission", () => {
    assertEqual(hasPermission(ROLES.FLEET_MANAGER, PERMISSIONS.FLEET_VIEW), true, "fleet:view");
  });

  test("should have fleet:manage permission", () => {
    assertEqual(hasPermission(ROLES.FLEET_MANAGER, PERMISSIONS.FLEET_MANAGE), true, "fleet:manage");
  });

  test("should have delivery:view permission", () => {
    assertEqual(hasPermission(ROLES.FLEET_MANAGER, PERMISSIONS.DELIVERY_VIEW), true, "delivery:view");
  });

  test("should NOT have delivery:assign permission", () => {
    assertEqual(hasPermission(ROLES.FLEET_MANAGER, PERMISSIONS.DELIVERY_ASSIGN), false, "delivery:assign");
  });

  test("should NOT have delivery:cancel permission", () => {
    assertEqual(hasPermission(ROLES.FLEET_MANAGER, PERMISSIONS.DELIVERY_CANCEL), false, "delivery:cancel");
  });

  test("should NOT have pricing:manage permission", () => {
    assertEqual(hasPermission(ROLES.FLEET_MANAGER, PERMISSIONS.PRICING_MANAGE), false, "pricing:manage");
  });
});

describe("OPERATIONS role", () => {
  test("should have delivery:view permission", () => {
    assertEqual(hasPermission(ROLES.OPERATIONS, PERMISSIONS.DELIVERY_VIEW), true, "delivery:view");
  });

  test("should have delivery:assign permission", () => {
    assertEqual(hasPermission(ROLES.OPERATIONS, PERMISSIONS.DELIVERY_ASSIGN), true, "delivery:assign");
  });

  test("should have delivery:reassign permission", () => {
    assertEqual(hasPermission(ROLES.OPERATIONS, PERMISSIONS.DELIVERY_REASSIGN), true, "delivery:reassign");
  });

  test("should have operations:manage permission", () => {
    assertEqual(hasPermission(ROLES.OPERATIONS, PERMISSIONS.OPERATIONS_MANAGE), true, "operations:manage");
  });

  test("should have pricing:manage permission", () => {
    assertEqual(hasPermission(ROLES.OPERATIONS, PERMISSIONS.PRICING_MANAGE), true, "pricing:manage");
  });

  test("should have settlement:view permission", () => {
    assertEqual(hasPermission(ROLES.OPERATIONS, PERMISSIONS.SETTLEMENT_VIEW), true, "settlement:view");
  });

  test("should NOT have settlement:manage permission", () => {
    assertEqual(hasPermission(ROLES.OPERATIONS, PERMISSIONS.SETTLEMENT_MANAGE), false, "settlement:manage");
  });

  test("should NOT have user:manage permission", () => {
    assertEqual(hasPermission(ROLES.OPERATIONS, PERMISSIONS.USER_MANAGE), false, "user:manage");
  });
});

describe("COMPANY_ADMIN role", () => {
  test("should have all delivery permissions", () => {
    assertEqual(hasPermission(ROLES.COMPANY_ADMIN, PERMISSIONS.DELIVERY_CREATE), true, "delivery:create");
    assertEqual(hasPermission(ROLES.COMPANY_ADMIN, PERMISSIONS.DELIVERY_VIEW), true, "delivery:view");
    assertEqual(hasPermission(ROLES.COMPANY_ADMIN, PERMISSIONS.DELIVERY_CANCEL), true, "delivery:cancel");
    assertEqual(hasPermission(ROLES.COMPANY_ADMIN, PERMISSIONS.DELIVERY_ASSIGN), true, "delivery:assign");
    assertEqual(hasPermission(ROLES.COMPANY_ADMIN, PERMISSIONS.DELIVERY_REASSIGN), true, "delivery:reassign");
    assertEqual(hasPermission(ROLES.COMPANY_ADMIN, PERMISSIONS.DELIVERY_UPDATE_STATUS), true, "delivery:update_status");
  });

  test("should have all driver permissions", () => {
    assertEqual(hasPermission(ROLES.COMPANY_ADMIN, PERMISSIONS.DRIVER_VIEW), true, "driver:view");
    assertEqual(hasPermission(ROLES.COMPANY_ADMIN, PERMISSIONS.DRIVER_MANAGE), true, "driver:manage");
  });

  test("should have all fleet permissions", () => {
    assertEqual(hasPermission(ROLES.COMPANY_ADMIN, PERMISSIONS.FLEET_VIEW), true, "fleet:view");
    assertEqual(hasPermission(ROLES.COMPANY_ADMIN, PERMISSIONS.FLEET_MANAGE), true, "fleet:manage");
  });

  test("should have all user permissions", () => {
    assertEqual(hasPermission(ROLES.COMPANY_ADMIN, PERMISSIONS.USER_VIEW), true, "user:view");
    assertEqual(hasPermission(ROLES.COMPANY_ADMIN, PERMISSIONS.USER_MANAGE), true, "user:manage");
  });

  test("should have all business permissions", () => {
    assertEqual(hasPermission(ROLES.COMPANY_ADMIN, PERMISSIONS.BUSINESS_VIEW), true, "business:view");
    assertEqual(hasPermission(ROLES.COMPANY_ADMIN, PERMISSIONS.BUSINESS_MANAGE), true, "business:manage");
  });

  test("should have all settlement permissions", () => {
    assertEqual(hasPermission(ROLES.COMPANY_ADMIN, PERMISSIONS.SETTLEMENT_VIEW), true, "settlement:view");
    assertEqual(hasPermission(ROLES.COMPANY_ADMIN, PERMISSIONS.SETTLEMENT_MANAGE), true, "settlement:manage");
  });
});

describe("SUPER_ADMIN role", () => {
  test("should have ALL permissions", () => {
    const allPermissions = Object.values(PERMISSIONS);
    for (const permission of allPermissions) {
      assertEqual(hasPermission(ROLES.SUPER_ADMIN, permission), true, `super_admin has ${permission}`);
    }
  });

  test("should have permission count equal to total permissions", () => {
    assertEqual(ROLE_PERMISSIONS[ROLES.SUPER_ADMIN].length, Object.values(PERMISSIONS).length, "permission count");
  });
});

describe("Permission Uniqueness", () => {
  test("should have unique permission strings", () => {
    const permissions = Object.values(PERMISSIONS);
    const unique = new Set(permissions);
    assertEqual(unique.size, permissions.length, "unique permissions");
  });

  test("should have unique role names", () => {
    const roles = Object.values(ROLES);
    const unique = new Set(roles);
    assertEqual(unique.size, roles.length, "unique roles");
  });
});

describe("Role Hierarchy", () => {
  test("SUPER_ADMIN and COMPANY_ADMIN have same permission set (different scope)", () => {
    // SUPER_ADMIN and COMPANY_ADMIN have the same permissions,
    // but SUPER_ADMIN has global scope while COMPANY_ADMIN is limited to their company
    assertEqual(ROLE_PERMISSIONS[ROLES.SUPER_ADMIN].length, ROLE_PERMISSIONS[ROLES.COMPANY_ADMIN].length, "same permission count");
  });

  test("COMPANY_ADMIN should have more permissions than OPERATIONS", () => {
    assert(ROLE_PERMISSIONS[ROLES.COMPANY_ADMIN].length > ROLE_PERMISSIONS[ROLES.OPERATIONS].length, "company_admin > operations");
  });

  test("OPERATIONS should have more permissions than FLEET_MANAGER", () => {
    assert(ROLE_PERMISSIONS[ROLES.OPERATIONS].length > ROLE_PERMISSIONS[ROLES.FLEET_MANAGER].length, "operations > fleet_manager");
  });

  test("FLEET_MANAGER should have more permissions than DRIVER", () => {
    assert(ROLE_PERMISSIONS[ROLES.FLEET_MANAGER].length > ROLE_PERMISSIONS[ROLES.DRIVER].length, "fleet_manager > driver");
  });

  test("CUSTOMER and DRIVER have different permission sets (not strictly hierarchical)", () => {
    // CUSTOMER has delivery:create, DRIVER has delivery:update_status
    // They serve different purposes, so count comparison is not meaningful
    assertEqual(hasPermission(ROLES.CUSTOMER, PERMISSIONS.DELIVERY_CREATE), true, "customer has delivery:create");
    assertEqual(hasPermission(ROLES.DRIVER, PERMISSIONS.DELIVERY_CREATE), false, "driver does not have delivery:create");
    assertEqual(hasPermission(ROLES.DRIVER, PERMISSIONS.DELIVERY_UPDATE_STATUS), true, "driver has delivery:update_status");
    assertEqual(hasPermission(ROLES.CUSTOMER, PERMISSIONS.DELIVERY_UPDATE_STATUS), false, "customer does not have delivery:update_status");
  });
});

describe("Edge Cases", () => {
  test("should handle invalid role gracefully", () => {
    // @ts-expect-error Testing invalid role
    assertEqual(hasPermission("invalid_role", PERMISSIONS.DELIVERY_VIEW), false, "invalid role");
  });

  test("should handle invalid permission gracefully", () => {
    // @ts-expect-error Testing invalid permission
    assertEqual(hasPermission(ROLES.CUSTOMER, "invalid:permission"), false, "invalid permission");
  });

  test("should not grant permissions not in the list", () => {
    for (const role of Object.values(ROLES)) {
      // @ts-expect-error Testing non-existent permission
      assertEqual(hasPermission(role, "nonexistent:permission"), false, `nonexistent for ${role}`);
    }
  });
});

describe("Access Isolation Rules", () => {
  test("CUSTOMER should not have delivery:assign permission", () => {
    assertEqual(hasPermission(ROLES.CUSTOMER, PERMISSIONS.DELIVERY_ASSIGN), false, "customer no assign");
  });

  test("DRIVER should not have delivery:assign permission", () => {
    assertEqual(hasPermission(ROLES.DRIVER, PERMISSIONS.DELIVERY_ASSIGN), false, "driver no assign");
  });

  test("DRIVER should not have delivery:reassign permission", () => {
    assertEqual(hasPermission(ROLES.DRIVER, PERMISSIONS.DELIVERY_REASSIGN), false, "driver no reassign");
  });

  test("OPERATIONS should have delivery:assign permission", () => {
    assertEqual(hasPermission(ROLES.OPERATIONS, PERMISSIONS.DELIVERY_ASSIGN), true, "operations can assign");
  });

  test("OPERATIONS should have operations:manage permission", () => {
    assertEqual(hasPermission(ROLES.OPERATIONS, PERMISSIONS.OPERATIONS_MANAGE), true, "operations manage");
  });
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${"=".repeat(50)}`);
console.log(`Test Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log(`\nFailures:`);
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
}
console.log(`${"=".repeat(50)}\n`);

if (failed > 0) {
  process.exit(1);
}
