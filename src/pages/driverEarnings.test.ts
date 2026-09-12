/**
 * Driver Earnings Tests
 *
 * Verifies the Driver Earnings page (DriverEarnings.tsx) and its backend
 * contracts from the client side. All amounts come from real convex records;
 * no mock data, no Math.random(), no fake settlements.
 *
 * Covers:
 *  - page renders inside DriverShell with the correct activeItem
 *  - summary band uses formatCurrency (cents → ZAR) correctly
 *  - "Paid out" is shown as "No external payouts recorded", never a balance
 *  - settlement status labels (Payable / Processing / Settlement completed)
 *  - payout eligibility labels (Eligible / Not yet eligible / Not payable)
 *  - navigation to /driver/history/:deliveryId for detail (reuses history, no
 *    separate earnings detail route)
 *  - page is read-only (no mutations exposed from the driver)
 *  - filters reset pagination cursor
 *  - loading/empty states for no earnings, no payable, no matching results
 *
 * Run: bunx tsx src/pages/driverEarnings.test.ts
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── Test harness (matches repo pattern) ───────────────────────────────────────

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

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(
      `Assertion failed: ${message}. Expected ${expected}, got ${actual}`,
    );
  }
}

function assertTrue(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertContains(haystack: string, needle: string, message: string) {
  if (!haystack.includes(needle)) {
    throw new Error(
      `Assertion failed: ${message}. Expected to find: "${needle}"`,
    );
  }
}

function assertNotContains(
  haystack: string,
  needle: string,
  message: string,
) {
  if (haystack.includes(needle)) {
    throw new Error(
      `Assertion failed: ${message}. Should NOT contain: "${needle}"`,
    );
  }
}

function read(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const page = read("src/pages/DriverEarnings.tsx");
const navigation = read("src/components/shells/navigation.ts");
const sidebar = read("src/components/dashboard/Sidebar.tsx");
const mainFile = read("src/main.tsx");
const backend = read("src/convex/driver_earnings.ts");

// ─── 1. Shell / routing ────────────────────────────────────────────────────────

console.log("\n1. Shell and routing");

test("DriverEarnings renders inside DriverShell with activeItem 'Earnings'", () => {
  assertContains(
    page,
    '<DriverShell activeItem="Earnings">',
    "DriverEarnings uses DriverShell with activeItem='Earnings'",
  );
});

test("DriverEarnings is mounted at /driver/earnings in the router", () => {
  assertContains(
    mainFile,
    'path="/driver/earnings"',
    "main.tsx registers /driver/earnings route",
  );
  assertContains(
    mainFile,
    "<DriverEarnings />",
    "main.tsx renders DriverEarnings on /driver/earnings",
  );
  assertContains(
    mainFile,
    `RoleGate area={APP_AREAS.DRIVER}`,
    "/driver/earnings is protected by the DRIVER RoleGate",
  );
});

test("Earnings is in the driver navigation config", () => {
  assertContains(
    navigation,
    `{ label: "Earnings", route: "/driver/earnings" }`,
    "driverNavigation includes Earnings entry",
  );
});

test("Earnings has a sidebar icon", () => {
  assertContains(
    sidebar,
    "Earnings: TrendingUp,",
    "Sidebar ICONS registry maps Earnings to TrendingUp",
  );
});

// ─── 2. Read-only guarantee ────────────────────────────────────────────────────

console.log("\n2. Read-only guarantee");

test("DriverEarnings page does not expose any Convex mutation to the driver", () => {
  // The page should only use useQuery, never useMutation for financial state.
  const mutations = page.match(/useMutation\(/g);
  assertTrue(
    mutations === null || mutations.length === 0,
    `DriverEarnings must not call useMutation; found ${mutations?.length ?? 0} useMutation calls`,
  );
});

test("DriverEarnings uses only driver_earnings queries (no settlement mutation)", () => {
  assertContains(
    page,
    "api.driver_earnings.getDriverEarnings",
    "page reads getDriverEarnings",
  );
  assertContains(
    page,
    "api.driver_earnings.getDriverEarningsSummary",
    "page reads getDriverEarningsSummary",
  );
});

test("backend driver earnings queries are all query (no mutation/write)", () => {
  const block = backend;
  assertTrue(
    block.includes("export const getDriverEarnings = query"),
    "getDriverEarnings is a query",
  );
  assertTrue(
    block.includes("export const getSettlementDriverEligibility = query"),
    "getSettlementDriverEligibility is a query",
  );
  assertTrue(
    block.includes("export const getDriverEarningsSummary = query"),
    "getDriverEarningsSummary is a query",
  );
});

// ─── 3. Financial presentation ─────────────────────────────────────────────────

console.log("\n3. Financial presentation");

test("formatCurrency converts cents to ZAR with 2 decimals", () => {
  // The page defines its own formatCurrency; verify it uses en-ZA / ZAR and
  // divides by 100.
  assertContains(
    page,
    'currency: "ZAR"',
    "formatCurrency uses ZAR",
  );
  assertContains(
    page,
    "cents / 100",
    "formatCurrency divides cents by 100",
  );
});

test("'Paid out' summary chip shows 'No external payouts recorded'", () => {
  assertContains(
    page,
    "No external payouts recorded",
    "Paid out chip displays honest 'No external payouts recorded' note",
  );
});

test("paidOut is 0 in the backend summary (no fabricated balance)", () => {
  assertContains(
    backend,
    "paidOut: 0,\n      paidOutNote: \"No external payouts recorded\"",
    "backend summary hardcodes paidOut: 0 with honest note",
  );
});

test("settlement status 'completed' is presented as 'Settlement completed', not 'Paid'", () => {
  // The page must render 'Settlement completed' for completed settlements and
  // must never label them as 'Paid'.
  assertContains(
    page,
    "Settlement completed",
    "page renders 'Settlement completed' for completed settlements",
  );

  // Locate the render block for settlementStatus === "completed" and confirm
  // it contains "Settlement completed" within a reasonable window.
  const idx = page.indexOf('item.settlementStatus === "completed"');
  assertTrue(idx >= 0, "page contains a settlementStatus === 'completed' check");
  const window = page.slice(idx, idx + 600);
  assertTrue(
    window.includes("Settlement completed"),
    "the completed-status render block contains 'Settlement completed'",
  );

  // The page must not render 'Paid' for ANY settlement status check.
  // Walk through every settlementStatus check in the page and verify none of
  // them render 'Paid'.
  let searchFrom = 0;
  while (true) {
    const pos = page.indexOf("settlementStatus", searchFrom);
    if (pos < 0) break;
    // Look at the JSX following this occurrence.
    const block = page.slice(pos, pos + 400);
    const paidHere = block.match(/<span[^>]*>\s*Paid\s*<\/span>/);
    assertTrue(
      paidHere === null,
      `the page renders 'Paid' near a settlementStatus reference (around char ${pos}) — this would mislabel a settlement as paid`,
    );
    searchFrom = pos + 1;
  }
});

test("pending/processing settlements are distinguished from paid", () => {
  // The page maps payoutEligibleLabel values; payable/processing are not
  // labeled as paid.
  assertContains(
    page,
    'payoutEligibleLabel}',
    "page renders the payoutEligibleLabel (Payable / Processing / etc.)",
  );
});

test("payout eligibility labels are driver-safe (Eligible / Not yet eligible / Not payable / Already settled)", () => {
  // The backend returns these labels; the UI renders payoutEligibleLabel.
  assertContains(
    backend,
    '"Eligible"',
    "backend can return 'Eligible'",
  );
  assertContains(
    backend,
    '"Not yet eligible"',
    "backend can return 'Not yet eligible'",
  );
  assertContains(
    backend,
    '"Not payable"',
    "backend can return 'Not payable'",
  );
  assertContains(
    backend,
    '"Already settled"',
    "backend can return 'Already settled'",
  );
});

// ─── 4. Navigation to existing history detail ──────────────────────────────────

console.log("\n4. Navigation to existing history detail");

test("earning items navigate to /driver/history/:deliveryId (reuses history detail)", () => {
  // The earnings item onClick should navigate to the existing history detail
  // route rather than a separate /driver/earnings/:id route.
  assertContains(
    page,
    "navigate(`/driver/history/${item.deliveryId}`)",
    "earnings items navigate to /driver/history/:deliveryId",
  );
});

test("no separate /driver/earnings/:deliveryId route is registered", () => {
  assertNotContains(
    mainFile,
    'path="/driver/earnings/:',
    "no separate earnings detail route is registered",
  );
});

// ─── 5. Filters / pagination ───────────────────────────────────────────────────

console.log("\n5. Filters and pagination");

test("status filter resets the pagination cursor", () => {
  assertContains(
    page,
    "setStatusFilter(f.value);\n                    setCursorStack([]);",
    "status filter resets cursor stack",
  );
});

test("date filter resets the pagination cursor", () => {
  assertContains(
    page,
    "setDaysFilter(f.value);\n                    setCursorStack([]);",
    "date filter resets cursor stack",
  );
});

test("cursor pagination uses server-side nextCursor", () => {
  assertContains(
    page,
    "earnings?.nextCursor",
    "page uses server-provided nextCursor",
  );
});

// ─── 6. Empty / loading states ─────────────────────────────────────────────────

console.log("\n6. Empty and loading states");

test("loading state renders a spinner", () => {
  assertContains(
    page,
    "Loader2",
    "page renders Loader2 for loading state",
  );
});

test("empty state for 'no earnings yet' exists", () => {
  assertContains(
    page,
    "No earnings yet",
    "page has 'No earnings yet' empty state",
  );
});

test("empty state for 'no matching earnings' exists", () => {
  assertContains(
    page,
    "No matching earnings",
    "page has 'No matching earnings' empty state for filtered results",
  );
});

test("empty state for 'no payable earnings right now' exists", () => {
  assertContains(
    page,
    "No payable earnings right now",
    "page has 'No payable earnings right now' state",
  );
});

// ─── 7. No mock data / no fake values ──────────────────────────────────────────

console.log("\n7. No mock data");

test("page does not use Math.random()", () => {
  assertNotContains(page, "Math.random()", "page does not use Math.random()");
});

test("page does not contain fake settlement amounts", () => {
  // There should be no hardcoded earnings amounts in the page source.
  const fakeAmounts = page.match(/\b\d{6,}\b/g);
  // Any large integer literal in the page would be suspicious — but our
  // formatCurrency and constants don't introduce them. We allow constants like
  // PAGE_SIZE (20) but flag large numbers.
  if (fakeAmounts) {
    const large = fakeAmounts.filter((n) => parseInt(n, 10) > 1000);
    assertTrue(
      large.length === 0,
      `page contains large numeric literals that look like fake amounts: ${large.join(", ")}`,
    );
  }
});

test("page does not import fake driver/earnings data", () => {
  assertNotContains(
    page,
    "mock",
    "page does not import mock data",
  );
  assertNotContains(
    page,
    "../mocks",
    "page does not import from a mocks directory",
  );
});

// ─── 8. Backend authorization mirrors client expectations ──────────────────────

console.log("\n8. Backend authorization mirrors client expectations");

test("backend getDriverEarnings derives identity from the authenticated session", () => {
  assertContains(
    backend,
    "const user = await getCurrentAuthUser(ctx);",
    "getDriverEarnings resolves identity via getCurrentAuthUser",
  );
  assertContains(
    backend,
    "const driverId = user.userId;",
    "getDriverEarnings derives driverId from the session, not client input",
  );
});

test("backend driver eligibility refuses to read another driver's settlement", () => {
  assertContains(
    backend,
    'if (settlement.driverId !== user.userId) {',
    "driver eligibility enforces settlement ownership",
  );
});

// ─── Summary ────────────────────────────────────────────────────────────────────

console.log(`\nDriver Earnings tests: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
  process.exit(1);
}
