/**
 * Lasha Delivery State Machine Tests
 *
 * These tests verify that the delivery state machine correctly enforces
 * state transitions, authorization, and business rules.
 *
 * Run with: bun run src/convex/deliveries/state_machine.test.ts
 */

import {
  DELIVERY_STATUS,
  VALID_TRANSITIONS,
  TRANSITION_PERMISSIONS,
  ROLES,
} from "../schema";

// ─── Test Helpers ─────────────────────────────────────────────────────────────

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

function assertArrayIncludes<T>(arr: T[], item: T, message: string) {
  if (!arr.includes(item)) {
    throw new Error(`Assertion failed: ${message}. Array does not include ${item}`);
  }
}

function assertArrayNotIncludes<T>(arr: T[], item: T, message: string) {
  if (arr.includes(item)) {
    throw new Error(`Assertion failed: ${message}. Array should not include ${item}`);
  }
}

function describe(name: string, fn: () => void) {
  console.log(`\n${name}`);
  fn();
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe("Delivery Status Constants", () => {
  test("should have all required statuses", () => {
    assertEqual(DELIVERY_STATUS.REQUESTED, "requested", "REQUESTED");
    assertEqual(DELIVERY_STATUS.PENDING_DISPATCH, "pending_dispatch", "PENDING_DISPATCH");
    assertEqual(DELIVERY_STATUS.ASSIGNED, "assigned", "ASSIGNED");
    assertEqual(DELIVERY_STATUS.DRIVER_ACCEPTED, "driver_accepted", "DRIVER_ACCEPTED");
    assertEqual(DELIVERY_STATUS.EN_ROUTE_TO_PICKUP, "en_route_to_pickup", "EN_ROUTE_TO_PICKUP");
    assertEqual(DELIVERY_STATUS.AT_PICKUP, "at_pickup", "AT_PICKUP");
    assertEqual(DELIVERY_STATUS.PICKED_UP, "picked_up", "PICKED_UP");
    assertEqual(DELIVERY_STATUS.IN_TRANSIT, "in_transit", "IN_TRANSIT");
    assertEqual(DELIVERY_STATUS.AT_DROPOFF, "at_dropoff", "AT_DROPOFF");
    assertEqual(DELIVERY_STATUS.DELIVERED, "delivered", "DELIVERED");
    assertEqual(DELIVERY_STATUS.CANCELLED, "cancelled", "CANCELLED");
    assertEqual(DELIVERY_STATUS.FAILED, "failed", "FAILED");
    assertEqual(DELIVERY_STATUS.REASSIGNMENT_REQUIRED, "reassignment_required", "REASSIGNMENT_REQUIRED");
  });

  test("should have 13 total statuses", () => {
    const statusCount = Object.keys(DELIVERY_STATUS).length;
    assertEqual(statusCount, 13, "status count");
  });
});

describe("Valid Transitions", () => {
  describe("REQUESTED state", () => {
    test("should allow transition to PENDING_DISPATCH", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.REQUESTED],
        DELIVERY_STATUS.PENDING_DISPATCH,
        "REQUESTED -> PENDING_DISPATCH"
      );
    });

    test("should allow transition to CANCELLED", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.REQUESTED],
        DELIVERY_STATUS.CANCELLED,
        "REQUESTED -> CANCELLED"
      );
    });

    test("should NOT allow transition to ASSIGNED", () => {
      assertArrayNotIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.REQUESTED],
        DELIVERY_STATUS.ASSIGNED,
        "REQUESTED -> ASSIGNED"
      );
    });
  });

  describe("PENDING_DISPATCH state", () => {
    test("should allow transition to ASSIGNED", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.PENDING_DISPATCH],
        DELIVERY_STATUS.ASSIGNED,
        "PENDING_DISPATCH -> ASSIGNED"
      );
    });

    test("should allow transition to CANCELLED", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.PENDING_DISPATCH],
        DELIVERY_STATUS.CANCELLED,
        "PENDING_DISPATCH -> CANCELLED"
      );
    });

    test("should NOT allow transition to DRIVER_ACCEPTED", () => {
      assertArrayNotIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.PENDING_DISPATCH],
        DELIVERY_STATUS.DRIVER_ACCEPTED,
        "PENDING_DISPATCH -> DRIVER_ACCEPTED"
      );
    });
  });

  describe("ASSIGNED state", () => {
    test("should allow transition to DRIVER_ACCEPTED", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.ASSIGNED],
        DELIVERY_STATUS.DRIVER_ACCEPTED,
        "ASSIGNED -> DRIVER_ACCEPTED"
      );
    });

    test("should allow transition to REASSIGNMENT_REQUIRED", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.ASSIGNED],
        DELIVERY_STATUS.REASSIGNMENT_REQUIRED,
        "ASSIGNED -> REASSIGNMENT_REQUIRED"
      );
    });

    test("should allow transition to CANCELLED", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.ASSIGNED],
        DELIVERY_STATUS.CANCELLED,
        "ASSIGNED -> CANCELLED"
      );
    });

    test("should NOT allow transition to IN_TRANSIT", () => {
      assertArrayNotIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.ASSIGNED],
        DELIVERY_STATUS.IN_TRANSIT,
        "ASSIGNED -> IN_TRANSIT"
      );
    });
  });

  describe("DRIVER_ACCEPTED state", () => {
    test("should allow transition to EN_ROUTE_TO_PICKUP", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.DRIVER_ACCEPTED],
        DELIVERY_STATUS.EN_ROUTE_TO_PICKUP,
        "DRIVER_ACCEPTED -> EN_ROUTE_TO_PICKUP"
      );
    });

    test("should allow transition to REASSIGNMENT_REQUIRED", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.DRIVER_ACCEPTED],
        DELIVERY_STATUS.REASSIGNMENT_REQUIRED,
        "DRIVER_ACCEPTED -> REASSIGNMENT_REQUIRED"
      );
    });

    test("should allow transition to CANCELLED", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.DRIVER_ACCEPTED],
        DELIVERY_STATUS.CANCELLED,
        "DRIVER_ACCEPTED -> CANCELLED"
      );
    });
  });

  describe("EN_ROUTE_TO_PICKUP state", () => {
    test("should allow transition to AT_PICKUP", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.EN_ROUTE_TO_PICKUP],
        DELIVERY_STATUS.AT_PICKUP,
        "EN_ROUTE_TO_PICKUP -> AT_PICKUP"
      );
    });

    test("should allow transition to REASSIGNMENT_REQUIRED", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.EN_ROUTE_TO_PICKUP],
        DELIVERY_STATUS.REASSIGNMENT_REQUIRED,
        "EN_ROUTE_TO_PICKUP -> REASSIGNMENT_REQUIRED"
      );
    });

    test("should allow transition to CANCELLED", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.EN_ROUTE_TO_PICKUP],
        DELIVERY_STATUS.CANCELLED,
        "EN_ROUTE_TO_PICKUP -> CANCELLED"
      );
    });
  });

  describe("AT_PICKUP state", () => {
    test("should allow transition to PICKED_UP", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.AT_PICKUP],
        DELIVERY_STATUS.PICKED_UP,
        "AT_PICKUP -> PICKED_UP"
      );
    });

    test("should allow transition to FAILED", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.AT_PICKUP],
        DELIVERY_STATUS.FAILED,
        "AT_PICKUP -> FAILED"
      );
    });

    test("should allow transition to CANCELLED", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.AT_PICKUP],
        DELIVERY_STATUS.CANCELLED,
        "AT_PICKUP -> CANCELLED"
      );
    });
  });

  describe("PICKED_UP state", () => {
    test("should allow transition to IN_TRANSIT", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.PICKED_UP],
        DELIVERY_STATUS.IN_TRANSIT,
        "PICKED_UP -> IN_TRANSIT"
      );
    });

    test("should allow transition to FAILED", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.PICKED_UP],
        DELIVERY_STATUS.FAILED,
        "PICKED_UP -> FAILED"
      );
    });

    test("should NOT allow transition to CANCELLED", () => {
      assertArrayNotIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.PICKED_UP],
        DELIVERY_STATUS.CANCELLED,
        "PICKED_UP -> CANCELLED"
      );
    });
  });

  describe("IN_TRANSIT state", () => {
    test("should allow transition to AT_DROPOFF", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.IN_TRANSIT],
        DELIVERY_STATUS.AT_DROPOFF,
        "IN_TRANSIT -> AT_DROPOFF"
      );
    });

    test("should allow transition to FAILED", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.IN_TRANSIT],
        DELIVERY_STATUS.FAILED,
        "IN_TRANSIT -> FAILED"
      );
    });

    test("should NOT allow transition to CANCELLED", () => {
      assertArrayNotIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.IN_TRANSIT],
        DELIVERY_STATUS.CANCELLED,
        "IN_TRANSIT -> CANCELLED"
      );
    });
  });

  describe("AT_DROPOFF state", () => {
    test("should allow transition to DELIVERED", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.AT_DROPOFF],
        DELIVERY_STATUS.DELIVERED,
        "AT_DROPOFF -> DELIVERED"
      );
    });

    test("should allow transition to FAILED", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.AT_DROPOFF],
        DELIVERY_STATUS.FAILED,
        "AT_DROPOFF -> FAILED"
      );
    });
  });

  describe("Terminal states", () => {
    test("DELIVERED should have no transitions", () => {
      assertEqual(VALID_TRANSITIONS[DELIVERY_STATUS.DELIVERED].length, 0, "DELIVERED transitions");
    });

    test("CANCELLED should have no transitions", () => {
      assertEqual(VALID_TRANSITIONS[DELIVERY_STATUS.CANCELLED].length, 0, "CANCELLED transitions");
    });

    test("FAILED should have no transitions", () => {
      assertEqual(VALID_TRANSITIONS[DELIVERY_STATUS.FAILED].length, 0, "FAILED transitions");
    });
  });

  describe("REASSIGNMENT_REQUIRED state", () => {
    test("should allow transition to PENDING_DISPATCH", () => {
      assertArrayIncludes(
        VALID_TRANSITIONS[DELIVERY_STATUS.REASSIGNMENT_REQUIRED],
        DELIVERY_STATUS.PENDING_DISPATCH,
        "REASSIGNMENT_REQUIRED -> PENDING_DISPATCH"
      );
    });
  });
});

describe("Transition Permissions", () => {
  describe("createDelivery (requested -> pending_dispatch)", () => {
    test("should allow customer", () => {
      const roles = TRANSITION_PERMISSIONS["requested->pending_dispatch"];
      assertArrayIncludes(roles, "customer", "customer can create delivery");
    });

    test("should allow company_admin", () => {
      const roles = TRANSITION_PERMISSIONS["requested->pending_dispatch"];
      assertArrayIncludes(roles, "company_admin", "company_admin can create delivery");
    });

    test("should allow operations", () => {
      const roles = TRANSITION_PERMISSIONS["requested->pending_dispatch"];
      assertArrayIncludes(roles, "operations", "operations can create delivery");
    });

    test("should NOT allow driver", () => {
      const roles = TRANSITION_PERMISSIONS["requested->pending_dispatch"];
      assertArrayNotIncludes(roles, "driver", "driver cannot create delivery");
    });
  });

  describe("assignDriver (pending_dispatch -> assigned)", () => {
    test("should allow operations", () => {
      const roles = TRANSITION_PERMISSIONS["pending_dispatch->assigned"];
      assertArrayIncludes(roles, "operations", "operations can assign driver");
    });

    test("should allow company_admin", () => {
      const roles = TRANSITION_PERMISSIONS["pending_dispatch->assigned"];
      assertArrayIncludes(roles, "company_admin", "company_admin can assign driver");
    });

    test("should allow super_admin", () => {
      const roles = TRANSITION_PERMISSIONS["pending_dispatch->assigned"];
      assertArrayIncludes(roles, "super_admin", "super_admin can assign driver");
    });

    test("should NOT allow customer", () => {
      const roles = TRANSITION_PERMISSIONS["pending_dispatch->assigned"];
      assertArrayNotIncludes(roles, "customer", "customer cannot assign driver");
    });

    test("should NOT allow driver", () => {
      const roles = TRANSITION_PERMISSIONS["pending_dispatch->assigned"];
      assertArrayNotIncludes(roles, "driver", "driver cannot assign driver");
    });
  });

  describe("acceptAssignment (assigned -> driver_accepted)", () => {
    test("should allow driver", () => {
      const roles = TRANSITION_PERMISSIONS["assigned->driver_accepted"];
      assertArrayIncludes(roles, "driver", "driver can accept assignment");
    });

    test("should NOT allow customer", () => {
      const roles = TRANSITION_PERMISSIONS["assigned->driver_accepted"];
      assertArrayNotIncludes(roles, "customer", "customer cannot accept assignment");
    });

    test("should NOT allow operations", () => {
      const roles = TRANSITION_PERMISSIONS["assigned->driver_accepted"];
      assertArrayNotIncludes(roles, "operations", "operations cannot accept assignment");
    });
  });

  describe("driver transitions", () => {
    test("driver should be able to start en route", () => {
      const roles = TRANSITION_PERMISSIONS["driver_accepted->en_route_to_pickup"];
      assertArrayIncludes(roles, "driver", "driver can start en route");
    });

    test("driver should be able to arrive at pickup", () => {
      const roles = TRANSITION_PERMISSIONS["en_route_to_pickup->at_pickup"];
      assertArrayIncludes(roles, "driver", "driver can arrive at pickup");
    });

    test("driver should be able to pickup package", () => {
      const roles = TRANSITION_PERMISSIONS["at_pickup->picked_up"];
      assertArrayIncludes(roles, "driver", "driver can pickup package");
    });

    test("driver should be able to start trip", () => {
      const roles = TRANSITION_PERMISSIONS["picked_up->in_transit"];
      assertArrayIncludes(roles, "driver", "driver can start trip");
    });

    test("driver should be able to arrive at dropoff", () => {
      const roles = TRANSITION_PERMISSIONS["in_transit->at_dropoff"];
      assertArrayIncludes(roles, "driver", "driver can arrive at dropoff");
    });

    test("driver should be able to complete delivery", () => {
      const roles = TRANSITION_PERMISSIONS["at_dropoff->delivered"];
      assertArrayIncludes(roles, "driver", "driver can complete delivery");
    });
  });

  describe("cancel transitions", () => {
    test("customer should be able to cancel from most states", () => {
      const cancelStates = [
        "requested->cancelled",
        "pending_dispatch->cancelled",
        "assigned->cancelled",
        "driver_accepted->cancelled",
        "en_route_to_pickup->cancelled",
        "at_pickup->cancelled",
      ];

      for (const state of cancelStates) {
        const roles = TRANSITION_PERMISSIONS[state];
        assertArrayIncludes(roles, "customer", `customer can cancel from ${state}`);
      }
    });

    test("operations should be able to cancel from most states", () => {
      const cancelStates = [
        "requested->cancelled",
        "pending_dispatch->cancelled",
        "assigned->cancelled",
        "driver_accepted->cancelled",
        "en_route_to_pickup->cancelled",
        "at_pickup->cancelled",
      ];

      for (const state of cancelStates) {
        const roles = TRANSITION_PERMISSIONS[state];
        assertArrayIncludes(roles, "operations", `operations can cancel from ${state}`);
      }
    });
  });
});

describe("State Machine Integrity", () => {
  test("every status should have transitions defined", () => {
    const statuses = Object.values(DELIVERY_STATUS);
    for (const status of statuses) {
      assert(
        VALID_TRANSITIONS[status] !== undefined,
        `Transitions defined for ${status}`
      );
    }
  });

  test("all transitions should reference valid statuses", () => {
    const statuses = Object.values(DELIVERY_STATUS);
    for (const [from, toStates] of Object.entries(VALID_TRANSITIONS)) {
      assert(statuses.includes(from as any), `From status ${from} is valid`);
      for (const to of toStates) {
        assert(statuses.includes(to as any), `To status ${to} is valid`);
      }
    }
  });

  test("terminal states should have empty transitions", () => {
    assertEqual(VALID_TRANSITIONS[DELIVERY_STATUS.DELIVERED].length, 0, "DELIVERED");
    assertEqual(VALID_TRANSITIONS[DELIVERY_STATUS.CANCELLED].length, 0, "CANCELLED");
    assertEqual(VALID_TRANSITIONS[DELIVERY_STATUS.FAILED].length, 0, "FAILED");
  });

  test("REASSIGNMENT_REQUIRED should only go to PENDING_DISPATCH", () => {
    assertEqual(VALID_TRANSITIONS[DELIVERY_STATUS.REASSIGNMENT_REQUIRED].length, 1, "REASSIGNMENT_REQUIRED");
    assertEqual(VALID_TRANSITIONS[DELIVERY_STATUS.REASSIGNMENT_REQUIRED][0], DELIVERY_STATUS.PENDING_DISPATCH, "REASSIGNMENT_REQUIRED -> PENDING_DISPATCH");
  });
});

describe("Permission Completeness", () => {
  test("every non-terminal transition should have permissions defined", () => {
    for (const [from, toStates] of Object.entries(VALID_TRANSITIONS)) {
      for (const to of toStates) {
        const key = `${from}->${to}`;
        assert(
          TRANSITION_PERMISSIONS[key] !== undefined,
          `Permissions defined for ${key}`
        );
      }
    }
  });

  test("every permission entry should have at least one role", () => {
    for (const [key, roles] of Object.entries(TRANSITION_PERMISSIONS)) {
      assert(roles.length > 0, `Permissions for ${key} has at least one role`);
    }
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
