import { strict as assert } from "assert";
import { safeInternalPath } from "./safeReturnTo";

let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (error) {
    failed++;
    console.log(`  ✗ ${name}\n    ${error instanceof Error ? error.message : String(error)}`);
  }
}

test("accepts ordinary internal paths and preserves query/hash", () => {
  assert.equal(safeInternalPath("/dashboard"), "/dashboard");
  assert.equal(
    safeInternalPath("/deliveries/abc?tab=pod#signature"),
    "/deliveries/abc?tab=pod#signature",
  );
});

test("rejects protocol-relative and backslash open redirects", () => {
  assert.equal(safeInternalPath("//evil.test", "/safe"), "/safe");
  assert.equal(safeInternalPath("/\\evil.test", "/safe"), "/safe");
  assert.equal(safeInternalPath("/\\\\evil.test", "/safe"), "/safe");
  assert.equal(safeInternalPath("///evil.test", "/safe"), "/safe");
  assert.equal(safeInternalPath("/..//evil.test", "/safe"), "/safe");
  assert.equal(safeInternalPath("/%2e%2e//evil.test", "/safe"), "/safe");
});

test("rejects non-path, control-character and external inputs", () => {
  assert.equal(safeInternalPath("https://evil.test", "/safe"), "/safe");
  assert.equal(safeInternalPath("javascript:alert(1)", "/safe"), "/safe");
  assert.equal(safeInternalPath(" /dashboard", "/safe"), "/safe");
  assert.equal(safeInternalPath("/dash\nboard", "/safe"), "/safe");
  assert.equal(safeInternalPath(null, "/safe"), "/safe");
  assert.equal(safeInternalPath(undefined, null), null);
});

console.log(`\nsafeReturnTo.test: ${failed === 0 ? "all passed" : `${failed} failed`}`);
if (failed > 0) process.exit(1);
