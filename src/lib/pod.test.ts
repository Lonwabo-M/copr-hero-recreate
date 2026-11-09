/**
 * POD client rule tests.
 *
 * These intentionally test the pure UX contract: the server repeats all
 * validation authoritatively, but the driver should get the same answer before
 * uploading a file.
 *
 * Run: bunx tsx src/lib/pod.test.ts
 */

import {
  POD_MAX_FILE_SIZE,
  POD_MAX_PHOTOS,
  formatPODBytes,
  podOutcomeLabel,
  validatePODPhoto,
  validatePODSubmission,
} from "./pod";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    console.log(`  ✗ ${name}: ${message}`);
  }
}

function equal<T>(actual: T, expected: T, message = "values differ") {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const validPhoto = { name: "doorstep.jpg", size: 1234, type: "image/jpeg" };

console.log("\n── POD submission rules ──\n");

test("recipient name is required", () => {
  equal(
    validatePODSubmission({ recipientName: "   ", hasSignature: true, photoCount: 0 }),
    "Recipient name is required",
  );
});

test("at least one signature or photo is required", () => {
  equal(
    validatePODSubmission({ recipientName: "Thabo", hasSignature: false, photoCount: 0 }),
    "Add a recipient signature or at least one delivery photo",
  );
});

test("signature-only submission is valid", () => {
  equal(
    validatePODSubmission({ recipientName: "Thabo", hasSignature: true, photoCount: 0 }),
    null,
  );
});

test("four photos plus signature is within the five-file limit", () => {
  equal(
    validatePODSubmission({
      recipientName: "Thabo",
      hasSignature: true,
      photoCount: POD_MAX_PHOTOS,
    }),
    null,
  );
});

test("five photos are rejected because one slot is reserved for the signature", () => {
  equal(
    validatePODSubmission({ recipientName: "Thabo", hasSignature: false, photoCount: 5 }),
    "You can attach at most 4 photos (the fifth slot is for the signature)",
  );
});

console.log("\n── POD photo rules ──\n");

test("JPEG, PNG and WebP are accepted", () => {
  for (const type of ["image/jpeg", "image/png", "image/webp"]) {
    equal(validatePODPhoto({ ...validPhoto, type }), null, `${type} rejected`);
  }
});

test("PDF and arbitrary files are rejected for handover evidence", () => {
  equal(
    validatePODPhoto({ ...validPhoto, type: "application/pdf" }),
    "doorstep.jpg is not a supported image (JPEG, PNG or WebP)",
  );
  equal(
    validatePODPhoto({ ...validPhoto, type: "text/html" }),
    "doorstep.jpg is not a supported image (JPEG, PNG or WebP)",
  );
});

test("empty and oversized photos are rejected", () => {
  equal(validatePODPhoto({ ...validPhoto, size: 0 }), "doorstep.jpg is empty");
  equal(
    validatePODPhoto({ ...validPhoto, size: POD_MAX_FILE_SIZE + 1 }),
    "doorstep.jpg exceeds the 10MB limit",
  );
});

console.log("\n── Presentation helpers ──\n");

test("outcomes have honest customer-facing labels", () => {
  equal(podOutcomeLabel("delivered"), "Delivered");
  equal(podOutcomeLabel("partial"), "Partially delivered");
  equal(podOutcomeLabel("failed"), "Not delivered");
});

test("file sizes are readable", () => {
  equal(formatPODBytes(512), "512 B");
  equal(formatPODBytes(2048), "2 KB");
  equal(formatPODBytes(2 * 1024 * 1024), "2.0 MB");
});

console.log("\n── Summary ──");
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Total: ${passed + failed}`);

if (failures.length > 0) {
  console.log("\nFailures:");
  for (const failure of failures) console.log(`  - ${failure}`);
  process.exit(1);
}
