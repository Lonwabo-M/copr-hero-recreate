/**
 * Password-reset send throttle tests.
 *
 * Run with: bunx tsx src/convex/auth/resetRateLimitPolicy.test.ts
 */

import {
  RESET_CODE_COOLDOWN_MS,
  RESET_CODE_DAY_MS,
  RESET_CODE_HOUR_MS,
  RESET_CODE_MAX_PER_DAY,
  RESET_CODE_MAX_PER_HOUR,
  decideResetSend,
} from "./resetRateLimitPolicy";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    failures.push(name);
    console.error(`  ✗ ${name}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const MIN = 60_000;
const NOW = 1_800_000_000_000;

// ─── Cooldown ──────────────────────────────────────────────────────────────

test("the first request is allowed", () => {
  const decision = decideResetSend([], NOW);
  assert(decision.allowed, "first send allowed");
  if (decision.allowed) {
    assert(decision.timestamps.length === 1, "send recorded");
    assert(decision.timestamps[0] === NOW, "recorded timestamp is now");
  }
});

test("a second request inside the cooldown is blocked with a retry time", () => {
  const decision = decideResetSend([NOW - 30_000], NOW);
  assert(!decision.allowed, "blocked");
  if (!decision.allowed) {
    assert(
      decision.retryAfterSeconds === Math.ceil((RESET_CODE_COOLDOWN_MS - 30_000) / 1000),
      `retry was ${decision.retryAfterSeconds}s`,
    );
  }
});

test("a request after the cooldown is allowed", () => {
  const decision = decideResetSend([NOW - RESET_CODE_COOLDOWN_MS], NOW);
  assert(decision.allowed, "cooldown elapsed");
});

test("a blocked request does not extend the cooldown", () => {
  const previous = [NOW - 50_000];
  const denied = decideResetSend(previous, NOW);
  const again = decideResetSend(previous, NOW + 1_000);
  assert(!denied.allowed && !again.allowed, "still blocked");
  if (!denied.allowed && !again.allowed) {
    assert(
      again.retryAfterSeconds < denied.retryAfterSeconds,
      "retry countdown keeps shrinking; denied attempts are not recorded",
    );
  }
});

// ─── Hourly / daily windows ────────────────────────────────────────────────

test(`the ${RESET_CODE_MAX_PER_HOUR}th request in an hour is allowed and the next is not`, () => {
  const previous = Array.from({ length: RESET_CODE_MAX_PER_HOUR }, (_, i) => NOW - (5 - i) * 5 * MIN);
  // Times: now-25m, -20m, -15m, -10m, -5m — all within the hour.
  const decision = decideResetSend(previous, NOW);
  assert(!decision.allowed, "hourly cap enforced");
  if (!decision.allowed) {
    const expected = Math.ceil(
      (previous[0] + RESET_CODE_HOUR_MS - NOW) / 1000,
    );
    assert(decision.retryAfterSeconds === expected, `retry was ${decision.retryAfterSeconds}s`);
  }
});

test("an entry falling out of the hourly window frees a slot", () => {
  const previous = Array.from({ length: RESET_CODE_MAX_PER_HOUR }, (_, i) => NOW - (5 - i) * 5 * MIN);
  // Age the oldest entry past an hour.
  previous[0] = NOW - RESET_CODE_HOUR_MS - 1;
  const decision = decideResetSend(previous, NOW);
  assert(decision.allowed, "slot reused after the oldest send leaves the window");
});

test("the daily cap blocks even when the hourly cap would allow", () => {
  // 10 sends, every 2 hours over the last 18 hours — at most one per hour.
  const previous = Array.from({ length: RESET_CODE_MAX_PER_DAY }, (_, i) => NOW - (9 - i) * 2 * 60 * MIN);
  const decision = decideResetSend(previous, NOW);
  assert(!decision.allowed, "daily cap enforced");
  if (!decision.allowed) {
    const expected = Math.ceil((previous[0] + RESET_CODE_DAY_MS - NOW) / 1000);
    assert(decision.retryAfterSeconds === expected, `retry was ${decision.retryAfterSeconds}s`);
  }
});

// ─── Data hygiene ───────────────────────────────────────────────────────────

test("timestamps older than 24 hours are dropped", () => {
  const old = NOW - RESET_CODE_DAY_MS - 1;
  const recent = NOW - 2 * RESET_CODE_HOUR_MS;
  const decision = decideResetSend([old, recent], NOW);
  assert(decision.allowed, "allowed");
  if (decision.allowed) {
    assert(!decision.timestamps.includes(old), "stale timestamp pruned");
    assert(decision.timestamps.includes(recent), "recent timestamp kept");
    assert(decision.timestamps.length === 2, "kept recent + new");
  }
});

test("invalid and future timestamps are ignored", () => {
  const decision = decideResetSend([Number.NaN, NOW + 60_000], NOW);
  assert(decision.allowed, "allowed");
  if (decision.allowed) {
    assert(decision.timestamps.length === 1, "only the new timestamp remains");
  }
});

test("a retry time is never reported as zero", () => {
  const decision = decideResetSend([NOW - (RESET_CODE_COOLDOWN_MS - 1)], NOW);
  assert(!decision.allowed, "blocked");
  if (!decision.allowed) {
    assert(decision.retryAfterSeconds >= 1, "at least one second");
  }
});

// ─── Report ────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`Failures:\n - ${failures.join("\n - ")}`);
  process.exit(1);
}
