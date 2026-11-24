import { strict as assert } from "assert";
import { toCsv } from "./csv";

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
    console.log(`  ✗ ${name}\n    ${message}`);
  }
}

const columns = [
  { key: "name", label: "Name" },
  { key: "amount", label: "Amount" },
];

test("neutralizes formula-leading text cells", () => {
  const csv = toCsv(
    [
      { name: "=HYPERLINK(\"https://evil.test\",\"click\")", amount: 10 },
      { name: "+SUM(A1:A2)", amount: -5 },
      { name: "@cmd", amount: 0 },
    ],
    columns,
  );

  // The text is prefixed with an apostrophe; numeric negatives are not.
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes("'+SUM(A1:A2)"));
  assert.ok(csv.includes("'@cmd"));
  assert.ok(csv.includes(",-5"));
  assert.ok(!csv.includes(",'-5"));
});

test("still quotes commas and embedded quotes", () => {
  const csv = toCsv([{ name: "Acme, \"Cape\"", amount: 1 }], columns);
  assert.ok(csv.includes('"Acme, ""Cape"""'));
});

test("ordinary text is not modified", () => {
  const csv = toCsv([{ name: "Thabo Mokoena", amount: 1 }], columns);
  assert.ok(csv.includes("Thabo Mokoena"));
  assert.ok(!csv.includes("'Thabo"));
});

console.log(`\ncsv.test: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
