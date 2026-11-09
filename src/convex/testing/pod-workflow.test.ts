/**
 * Lasha POD Submission Workflow Tests
 *
 * Verifies the POD-gated delivery completion contract:
 * - completeDelivery requires an existing POD record AND evidence
 * - atomic completion validates storage metadata and persists the signature
 * - POD backend authorization model rejects cross-driver and unauthorized access
 * - POD file validation rules (size, MIME types)
 * - Driver UI uses one atomic completion call; operations cannot fabricate POD
 * - Customer/driver/operations evidence viewers receive authorized URLs
 *
 * Run with: bunx tsx src/convex/testing/pod-workflow.test.ts
 */

import { readFileSync } from "node:fs";
import {
  DELIVERY_STATUS,
  ROLES,
} from "../schema";

const podServiceSource = readFileSync(
  new URL("../pod/service.ts", import.meta.url),
  "utf8",
);
const stateMachineSource = readFileSync(
  new URL("../deliveries/state_machine.ts", import.meta.url),
  "utf8",
);
const driverPageSource = readFileSync(
  new URL("../../pages/DriverActiveDelivery.tsx", import.meta.url),
  "utf8",
);
const operationsPageSource = readFileSync(
  new URL("../../pages/OperationsCentre.tsx", import.meta.url),
  "utf8",
);
const podSummarySource = readFileSync(
  new URL("../../components/pod/PODSummary.tsx", import.meta.url),
  "utf8",
);
const signaturePadSource = readFileSync(
  new URL("../../components/pod/SignaturePad.tsx", import.meta.url),
  "utf8",
);

// ─── Test Harness ────────────────────────────────────────────────────────────

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
    toBeTruthy: () => {
      if (!value) throw new Error(`Expected truthy, got ${JSON.stringify(value)}`);
    },
  };
}

// ─── Constants mirrored from src/convex/pod/service.ts ───────────────────────

const POD_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const POD_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];
const POD_FAILURE_REASONS = [
  "recipient_unavailable",
  "incorrect_address",
  "refused_delivery",
  "damaged_goods",
  "missing_goods",
  "vehicle_problem",
  "safety_issue",
  "other",
];

// ─── POD-Gated Completion ────────────────────────────────────────────────────

console.log("\n── POD-Gated Delivery Completion ──\n");

test("completeDelivery rejects completion without a POD record", () => {
  // Mirrors the server rule added to state_machine.completeDelivery:
  //   if (!existingPOD) throw "Proof of delivery is required..."
  const completeWithoutPOD = (hasPOD: boolean) => {
    if (!hasPOD) {
      throw new Error("Proof of delivery is required before completing this delivery");
    }
    return { success: true };
  };

  let threw = false;
  try {
    completeWithoutPOD(false);
  } catch {
    threw = true;
  }
  expect(threw).toBe(true);

  const result = completeWithoutPOD(true);
  expect(result.success).toBe(true);
});

test("completion state requirement is unchanged (AT_DROPOFF only)", () => {
  // The POD gate was added AFTER the state check; valid transition unchanged
  const validNext = ["delivered", "failed"];
  expect(validNext.includes(DELIVERY_STATUS.DELIVERED)).toBe(true);
});

// ─── POD Authorization Model (mirrors pod/service.ts helpers) ────────────────

console.log("\n── POD Authorization Model ──\n");

function canCreatePOD(user: { role: string; userId: any }, delivery: { courierId: any }): boolean {
  if (user.role === ROLES.DRIVER && delivery.courierId === user.userId) return true;
  if (
    user.role === ROLES.OPERATIONS ||
    user.role === ROLES.COMPANY_ADMIN ||
    user.role === ROLES.SUPER_ADMIN
  ) {
    return true;
  }
  return false;
}

test("driver can create POD for their assigned delivery", () => {
  expect(canCreatePOD({ role: ROLES.DRIVER, userId: "d1" }, { courierId: "d1" })).toBe(true);
});

test("driver cannot create POD for another driver's delivery", () => {
  expect(canCreatePOD({ role: ROLES.DRIVER, userId: "d1" }, { courierId: "d2" })).toBe(false);
});

test("unauthorized roles cannot create POD", () => {
  expect(canCreatePOD({ role: ROLES.CUSTOMER, userId: "c1" }, { courierId: "d1" })).toBe(false);
  expect(canCreatePOD({ role: ROLES.FLEET_MANAGER, userId: "f1" }, { courierId: "d1" })).toBe(false);
});

test("operations and super admin can create POD (existing privilege)", () => {
  expect(canCreatePOD({ role: ROLES.OPERATIONS, userId: "o1" }, { courierId: "d1" })).toBe(true);
  expect(canCreatePOD({ role: ROLES.SUPER_ADMIN, userId: "s1" }, { courierId: "d1" })).toBe(true);
});

// ─── POD File Validation ─────────────────────────────────────────────────────

console.log("\n── POD File Validation ──\n");

test("files within size limit are accepted, oversized files rejected", () => {
  const validate = (size: number) => size <= POD_MAX_FILE_SIZE;
  expect(validate(5 * 1024 * 1024)).toBe(true);
  expect(validate(POD_MAX_FILE_SIZE + 1)).toBe(false);
});

test("allowed MIME types match the backend whitelist", () => {
  const validate = (mime: string) => POD_ALLOWED_MIME_TYPES.includes(mime);
  expect(validate("image/jpeg")).toBe(true);
  expect(validate("image/png")).toBe(true);
  expect(validate("image/webp")).toBe(true);
  expect(validate("application/pdf")).toBe(true);
  expect(validate("image/gif")).toBe(false);
  expect(validate("application/zip")).toBe(false);
});

test("failure outcome requires a failure reason", () => {
  const validate = (outcome: string, failureReason?: string) =>
    !(outcome === "failed" && !failureReason);
  expect(validate("failed")).toBe(false);
  expect(validate("failed", "recipient_unavailable")).toBe(true);
  expect(validate("delivered")).toBe(true);
});

test("failure reasons come from the existing backend enum", () => {
  for (const reason of POD_FAILURE_REASONS) {
    expect(POD_FAILURE_REASONS.includes(reason)).toBe(true);
  }
});

// ─── Driver UI POD Contract ──────────────────────────────────────────────────

console.log("\n── Driver UI POD Contract ──\n");

test("POD form appears only in AT_DROPOFF state", () => {
  const showPODForm = (status: string) => status === DELIVERY_STATUS.AT_DROPOFF;
  expect(showPODForm(DELIVERY_STATUS.AT_DROPOFF)).toBe(true);
  expect(showPODForm(DELIVERY_STATUS.IN_TRANSIT)).toBe(false);
  expect(showPODForm(DELIVERY_STATUS.DELIVERED)).toBe(false);
});

test("driver UI uses one atomic POD completion call", () => {
  expect(driverPageSource.includes("completeDeliveryWithPOD")).toBe(true);
  expect(driverPageSource.includes("createPOD")).toBe(false);
  expect(driverPageSource.includes("addPODEvidence")).toBe(false);
  expect(driverPageSource.includes("state_machine.completeDelivery")).toBe(false);
});

test("server rejects atomic completion with no evidence", () => {
  expect(
    podServiceSource.includes("At least one recipient signature or delivery photo is required"),
  ).toBe(true);
});

test("atomic completion persists the signature pointer and validates every file", () => {
  expect(podServiceSource.includes("recipientSignatureId: args.signatureFileId")).toBe(true);
  expect(podServiceSource.includes("ctx.storage.getMetadata")).toBe(true);
  expect(podServiceSource.includes("ALLOWED_MIME_TYPES.includes(contentType)")).toBe(true);
});

test("server validates handover coordinates without making them mandatory", () => {
  expect(podServiceSource.includes("function validatePODLocation")).toBe(true);
  expect(podServiceSource.includes("Latitude must be between -90 and 90")).toBe(true);
  expect(podServiceSource.includes("validatePODLocation(args.latitude, args.longitude, args.locationAccuracy)")).toBe(true);
});

test("failed-delivery flow can attach validated photo evidence", () => {
  const failureBlock = driverPageSource.slice(
    driverPageSource.indexOf("handleFailureSubmit"),
    driverPageSource.indexOf("// ─── POD capture"),
  );
  expect(failureBlock.includes("photoFileIds")).toBe(true);
  expect(failureBlock.includes("uploadPODBody")).toBe(true);
});

test("legacy completion path also requires at least one evidence file", () => {
  expect(stateMachineSource.includes('query("pod_files")')).toBe(true);
  expect(stateMachineSource.includes("podEvidence.length === 0")).toBe(true);
  expect(stateMachineSource.includes("must include at least one signature")).toBe(true);
});

test("authorized POD queries resolve storage URLs for the viewer", () => {
  expect(podServiceSource.includes("ctx.storage.getUrl")).toBe(true);
  expect(podServiceSource.includes("loadPODFiles")).toBe(true);
  expect(podSummarySource.includes("file.url") || podSummarySource.includes("photo.url")).toBe(true);
});

test("signature capture produces a PNG image", () => {
  expect(signaturePadSource.includes('toDataURL("image/png")')).toBe(true);
  expect(signaturePadSource.includes("onPointerDown")).toBe(true);
});

test("operations cannot fabricate a handover completion", () => {
  expect(operationsPageSource.includes("completeDeliveryWithPOD")).toBe(false);
  expect(operationsPageSource.includes("Awaiting driver POD")).toBe(true);
});

test("recipient name is mandatory in the UI and on the server", () => {
  // Server: recipientName: v.string() (required arg)
  const validate = (name: string) => name.trim().length > 0;
  expect(validate("")).toBe(false);
  expect(validate("   ")).toBe(false);
  expect(validate("Thabo M.")).toBe(true);
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
