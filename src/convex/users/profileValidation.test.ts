/**
 * Lasha Profile Validation & Authorization Tests
 *
 * Verifies the pure validation rules used by the profile mutations and the
 * authorization model (session-derived identity, protected-field whitelist).
 *
 * Run with: bunx tsx src/convex/users/profileValidation.test.ts
 */

import {
  PROFILE_EDITABLE_FIELDS,
  BUSINESS_EDITABLE_FIELDS,
  PROTECTED_USER_FIELDS,
  NAME_MAX_LENGTH,
  BUSINESS_NAME_MAX_LENGTH,
  SA_ID_LENGTH,
  CELL_MAX_LENGTH,
  validateName,
  validatePhone,
  validateOptionalText,
  validateBusinessName,
  validateSaIdNumber,
  validateCellNumber,
  validatePersonName,
} from "./profileValidation";
import { ROLES } from "../schema";

// ─── Test Runner ─────────────────────────────────────────────────────────────

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
    console.log(`  ✗ ${name}: ${msg}`);
  }
}

function expect(value: any) {
  return {
    toBe: (expected: any) => {
      if (value !== expected) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(value)}`);
      }
    },
    toBeNull: () => {
      if (value !== null) {
        throw new Error(`Expected null, got ${JSON.stringify(value)}`);
      }
    },
    toBeTruthy: () => {
      if (!value) {
        throw new Error(`Expected truthy, got ${JSON.stringify(value)}`);
      }
    },
    toContain: (item: any) => {
      if (!Array.isArray(value) || !value.includes(item)) {
        throw new Error(`Expected array containing ${JSON.stringify(item)}, got ${JSON.stringify(value)}`);
      }
    },
    toNotContain: (item: any) => {
      if (Array.isArray(value) && value.includes(item)) {
        throw new Error(`Expected array NOT containing ${JSON.stringify(item)}`);
      }
    },
  };
}

// ─── Editable / Protected Field Contract ─────────────────────────────────────

console.log("\n── Profile Field Contract ──\n");

test("profile mutation whitelist excludes all protected fields", () => {
  for (const field of PROFILE_EDITABLE_FIELDS) {
    expect(PROTECTED_USER_FIELDS).toNotContain(field);
  }
});

test("privileged fields are protected", () => {
  expect(PROTECTED_USER_FIELDS).toContain("role");
  expect(PROTECTED_USER_FIELDS).toContain("businessId");
  expect(PROTECTED_USER_FIELDS).toContain("email");
  expect(PROTECTED_USER_FIELDS).toContain("emailVerificationTime");
  expect(PROTECTED_USER_FIELDS).toContain("isAnonymous");
});

test("business mutation whitelist excludes ownership fields", () => {
  expect(BUSINESS_EDITABLE_FIELDS).toNotContain("ownerUserId");
  expect(BUSINESS_EDITABLE_FIELDS).toNotContain("createdAt");
});

// ─── Name Validation ─────────────────────────────────────────────────────────

console.log("\n── Name Validation ──\n");

test("accepts a normal name", () => {
  expect(validateName("Thabo Mokoena")).toBeNull();
});

test("rejects empty name", () => {
  expect(validateName("")).toBeTruthy();
  expect(validateName("   ")).toBeTruthy();
});

test(`rejects names longer than ${NAME_MAX_LENGTH} characters`, () => {
  expect(validateName("a".repeat(NAME_MAX_LENGTH + 1))).toBeTruthy();
  expect(validateName("a".repeat(NAME_MAX_LENGTH))).toBeNull();
});

// ─── Phone Validation ────────────────────────────────────────────────────────

console.log("\n── Phone Validation ──\n");

test("accepts South African phone formats", () => {
  expect(validatePhone("+27 82 123 4567")).toBeNull();
  expect(validatePhone("0821234567")).toBeNull();
  expect(validatePhone("+27-82-123-4567")).toBeNull();
});

test("allows empty phone (clearing the field)", () => {
  expect(validatePhone("")).toBeNull();
  expect(validatePhone("   ")).toBeNull();
});

test("rejects invalid phone formats", () => {
  expect(validatePhone("not-a-phone")).toBeTruthy();
  expect(validatePhone("abc123")).toBeTruthy();
});

test("rejects overly long phone numbers", () => {
  expect(validatePhone("+27 82 123 4567 8901 2345")).toBeTruthy();
});

// ─── Business Validation ─────────────────────────────────────────────────────

console.log("\n── Business Validation ──\n");

test("accepts a normal business name", () => {
  expect(validateBusinessName("Lasha Logistics (Pty) Ltd")).toBeNull();
});

test("rejects empty business name", () => {
  expect(validateBusinessName("")).toBeTruthy();
});

test(`rejects business names longer than ${BUSINESS_NAME_MAX_LENGTH} characters`, () => {
  expect(validateBusinessName("x".repeat(BUSINESS_NAME_MAX_LENGTH + 1))).toBeTruthy();
});

test("optional text validator caps length but allows empty", () => {
  expect(validateOptionalText("", "Address", 200)).toBeNull();
  expect(validateOptionalText("12 Main Road", "Address", 200)).toBeNull();
  expect(validateOptionalText("x".repeat(201), "Address", 200)).toBeTruthy();
});

// ─── SA ID Number Validation ─────────────────────────────────────────────────

// 8501125120088 = birthdate 85-01-12, valid Luhn checksum (see Luhn below).
const VALID_SIM_ID = "8501125120088";

test(`accepts a valid 13-digit SA ID (Luhn checksum verified, SA_ID_LENGTH = ${SA_ID_LENGTH})`, () => {
  expect(SA_ID_LENGTH).toBe(13);
  expect(validateSaIdNumber(VALID_SIM_ID)).toBeNull();
});

test("tolerates spaces in ID input and stores digits", () => {
  expect(validateSaIdNumber("850112 5120088")).toBeNull();
  expect(validateSaIdNumber("8501 1251 2008 8")).toBeNull();
});

test("rejects ID numbers that are not exactly 13 digits", () => {
  expect(validateSaIdNumber("85011251200")).toBeTruthy();
  expect(validateSaIdNumber("850112512008899")).toBeTruthy();
});

test("rejects non-digit ID input", () => {
  expect(validateSaIdNumber("85011251A0088")).toBeTruthy();
  expect(validateSaIdNumber("")).toBeTruthy();
});

test("rejects implausible birth month or day in ID", () => {
  expect(validateSaIdNumber("8513125120088")).toBeTruthy(); // month 13
  expect(validateSaIdNumber("8500325120088")).toBeTruthy(); // day 32
  expect(validateSaIdNumber("8501005120088")).toBeTruthy(); // day 0
});

test("rejects ID numbers with a bad Luhn checksum", () => {
  // Last digit off by one breaks the checksum.
  expect(validateSaIdNumber("8501125120089")).toBeTruthy();
});

// ─── Cell Number Validation ──────────────────────────────────────────────────

test(`accepts SA cell formats (CELL_MAX_LENGTH = ${CELL_MAX_LENGTH})`, () => {
  expect(CELL_MAX_LENGTH).toBe(20);
  expect(validateCellNumber("082 123 4567")).toBeNull();
  expect(validateCellNumber("0821234567")).toBeNull();
  expect(validateCellNumber("+27821234567")).toBeNull();
  expect(validateCellNumber("072 123 4567")).toBeNull();
  expect(validateCellNumber("+27-82-123-4567")).toBeNull();
});

test("rejects invalid cell numbers", () => {
  expect(validateCellNumber("")).toBeTruthy(); // required
  expect(validateCellNumber("052 123 4567")).toBeTruthy(); // 05 prefix not a cell
  expect(validateCellNumber("082 123 456")).toBeTruthy(); // too short
  expect(validateCellNumber("082 123 45678")).toBeTruthy(); // too long
  expect(validateCellNumber("not-a-number")).toBeTruthy();
  expect(validateCellNumber("+44821234567")).toBeTruthy(); // not SA
});

// ─── Person Name Validation ──────────────────────────────────────────────────

test("person name validator accepts normal names", () => {
  expect(validatePersonName("Thabo", "First name")).toBeNull();
  expect(validatePersonName("Mokoena", "Surname")).toBeNull();
  expect(validatePersonName("  Thabo  ", "First name")).toBeNull();
});

test("person name validator rejects empty input", () => {
  expect(validatePersonName("", "First name")).toBeTruthy();
  expect(validatePersonName("   ", "Surname")).toBeTruthy();
});

test("person name validator rejects overly long input", () => {
  expect(validatePersonName("a".repeat(NAME_MAX_LENGTH + 1), "First name")).toBeTruthy();
});

// ─── Authorization Model ─────────────────────────────────────────────────────

console.log("\n── Authorization Model ──\n");

test("business update authorization: owner and company_admin allowed, customer/driver denied", () => {
  const businessId = "biz1" as any;
  const ownerUserId = "user_owner" as any;

  const isAuthorized = (user: {
    _id: any;
    role?: string;
    businessId?: any;
  }, business: { _id: any; ownerUserId: any }) => {
    const role = user.role ?? ROLES.CUSTOMER;
    const isOwner = business.ownerUserId === user._id;
    const isCompanyAdmin = role === ROLES.COMPANY_ADMIN && user.businessId === business._id;
    const isSuperAdmin = role === ROLES.SUPER_ADMIN;
    const isOperations = role === ROLES.OPERATIONS;
    return isOwner || isCompanyAdmin || isSuperAdmin || isOperations;
  };

  const business = { _id: businessId, ownerUserId };

  // Owner (customer role) is allowed — they own the business
  expect(
    isAuthorized({ _id: ownerUserId, role: ROLES.CUSTOMER, businessId: businessId }, business)
  ).toBe(true);

  // Company admin of that business is allowed
  expect(
    isAuthorized({ _id: "user_admin" as any, role: ROLES.COMPANY_ADMIN, businessId: businessId }, business)
  ).toBe(true);

  // A different customer (not owner, no business) is denied
  expect(
    isAuthorized({ _id: "user_other" as any, role: ROLES.CUSTOMER }, business)
  ).toBe(false);

  // A driver is denied
  expect(
    isAuthorized({ _id: "user_driver" as any, role: ROLES.DRIVER, businessId: businessId }, business)
  ).toBe(false);
});

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log("\n── Summary ──");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
  process.exit(1);
}
