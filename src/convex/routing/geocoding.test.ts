/**
 * Geocoding Resolution Tests
 *
 * Verifies the hardened address-resolution strategy in routing/actions.ts:
 * - SA country context normalization
 * - bounded single-token-drop query variants (precision floor: street + ≥1
 *   context segment; never a bare street)
 * - cross-provider fallback structure + clean user-facing failure
 * - no fake coordinates anywhere (every returned coordinate originates from a
 *   provider response to one of the user's own address variants)
 * - secrets stay server-side (key read from Convex env inside the action)
 *
 * Pure functions are tested directly; action-level behaviour is pinned via
 * source-contract assertions (mirrors the repo's existing test style).
 */
import { readFileSync } from "fs";
import { strict as assert } from "assert";
import {
  normalizeAddressForGeocoding,
  geocodeQueryVariants,
  geocodeAddress,
} from "./actions";

let passed = 0;
let failed = 0;
const failures: string[] = [];
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
  } catch (e) {
    failed++;
    failures.push(`${name}\n    ${(e as Error).message}`);
  }
}

const source = readFileSync(new URL("./actions.ts", import.meta.url), "utf8");

// ─── 1. Normalization ────────────────────────────────────────────────────────

test("normalizes whitespace and appends South Africa context", () => {
  assert.equal(
    normalizeAddressForGeocoding("  12   Rivonia Road,  Sandton  "),
    "12 Rivonia Road, Sandton, South Africa"
  );
});

test("does not duplicate country when already present", () => {
  const out = normalizeAddressForGeocoding("Main Road, Cape Town, South Africa");
  assert.equal(out, "Main Road, Cape Town, South Africa");
  assert.equal((out.match(/South Africa/g) || []).length, 1);
});

test("empty address normalizes to empty (validation happens upstream)", () => {
  assert.equal(normalizeAddressForGeocoding("   "), "");
});

// ─── 2. Query variants ──────────────────────────────────────────────────────

test("valid address keeps its verbatim variant first", () => {
  const v = geocodeQueryVariants("12 Rivonia Road, Sandton, Johannesburg");
  assert.equal(v[0], "12 Rivonia Road, Sandton, Johannesburg, South Africa");
  assert.ok(v.length > 1, "fallback variants should exist");
});

test("single unknown token is droppable (the Lemeonkloof case shape)", () => {
  const v = geocodeQueryVariants("333 Main Road, Lemeonkloof, Randburg");
  // A variant dropping exactly the bad token, keeping street + remaining
  // context, must exist.
  assert.ok(
    v.includes("333 Main Road, Randburg, South Africa"),
    `expected street+city variant in ${JSON.stringify(v)}`
  );
});

test("precision floor: never collapses to a bare street + country", () => {
  const v = geocodeQueryVariants("333 Main Road, Lemeonkloof, The towers");
  for (const variant of v) {
    const segs = variant.split(",").map((s) => s.trim());
    // At least street + country plus one more context segment.
    assert.ok(
      segs.length >= 3,
      `variant "${variant}" has too little context (bare-street resolution is unsafe)`
    );
  }
});

test("variants are bounded (no unbounded fan-out)", () => {
  const v = geocodeQueryVariants("a, b, c, d, e, f, g, h");
  assert.ok(v.length <= 10, `expected ≤10 variants, got ${v.length}`);
});

test("variants contain no fabricated text — each is a subset of the user's own segments", () => {
  const user = "333 Main Road, Lemeonkloof, Randburg";
  const v = geocodeQueryVariants(user);
  const allowedTokens = new Set(
    [...user.split(",").map((s) => s.trim()), "South Africa"].map((s) =>
      s.toLowerCase()
    )
  );
  for (const variant of v) {
    for (const seg of variant.split(",").map((s) => s.trim())) {
      assert.ok(
        allowedTokens.has(seg.toLowerCase()),
        `variant "${variant}" contains segment "${seg}" not present in user input`
      );
    }
  }
});

test("single-segment address returns just the normalized form", () => {
  assert.deepEqual(geocodeQueryVariants("Sandton"), ["Sandton, South Africa"]);
});

// ─── 3. Action-level source contract ────────────────────────────────────────

test("geocoder reads the provider key from server-side Convex env only", () => {
  assert.ok(source.includes("process.env.GOOGLE_MAPS_API_KEY"));
  // The key must never appear in any return shape sent to the client.
  const returnBlocks = source.match(/returns: v\.object\(\{[^}]*\}/g) ?? [];
  for (const block of returnBlocks) {
    assert.ok(!block.includes("apiKey"), "API key leaked through a return shape");
  }
});

test("unresolved addresses throw ONE clean user-safe message", () => {
  assert.ok(
    source.includes(
      "We could not find that address. Check the spelling, add a suburb and city, and try again."
    )
  );
  // Raw provider error strings must not propagate to the client from the
  // geocode path — provider errors may only be logged internally.
  const geocodeBlock = source.slice(
    source.indexOf("export const geocodeAddress"),
    source.indexOf("const DEFAULT_COUNTRY")
  );
  assert.ok(!geocodeBlock.includes("throw new Error(`Could not geocode"));
});

test("both providers are exercised: configured primary + explicit cross-provider fallback", () => {
  assert.ok(source.includes("geocodeGoogle("));
  assert.ok(source.includes("geocodeNominatim("));
  const block = source.slice(
    source.indexOf("export const geocodeAddress"),
    source.indexOf("const DEFAULT_COUNTRY")
  );
  assert.ok(block.includes("fallback"), "cross-provider fallback must be wired");
});

test("no fake coordinates anywhere in the geocoder", () => {
  assert.ok(!/Math\.random/.test(source), "Math.random must never produce coordinates");
  // Literal SA-plausible coordinate constants (lat ≈ -22…-35) hardcoded in the
  // geocode section would indicate fabricated fallbacks.
  const geocodeBlock = source.slice(
    source.indexOf("Geocoding"),
    source.indexOf("Internal Handlers")
  );
  assert.ok(!/-2[2-9]\.\d+/.test(geocodeBlock), "hardcoded coordinate detected");
  assert.ok(!/3[0-1]\.\d+/.test(geocodeBlock.replace(/28\.\d+/g, "")), "hardcoded coordinate detected");
});

test("exported geocode action exists with the required output shape", () => {
  assert.ok(typeof geocodeAddress === "object" || typeof geocodeAddress === "function");
  const block = source.slice(
    source.indexOf("export const geocodeAddress"),
    source.indexOf("const DEFAULT_COUNTRY")
  );
  assert.ok(block.includes("lat: v.number()"));
  assert.ok(block.includes("lng: v.number()"));
  assert.ok(block.includes("formattedAddress: v.string()"));
});

// ─── Report ──────────────────────────────────────────────────────────────────

console.log(`\ngeocoding.test: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
