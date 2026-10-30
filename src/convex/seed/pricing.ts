/**
 * Pricing rules seed.
 *
 * `calculateAndStoreQuote` hard-fails when no active pricing rule matches an
 * order's packageSize/expeditionType pair, which broke delivery creation on
 * any deployment whose pricing_rules table was never populated. The table is
 * operational configuration, so instead of requiring a manual seeding step we
 * lazily ensure a stable default rule set before quoting.
 *
 * Runs inline in the caller's transaction (a plain async helper on ctx, not a
 * nested function call), so quoting and seeding are atomic together.
 *
 * The defaults are written in cents (ZAR). The platform/driver split is a
 * fixed commercial policy (30% platform, 70% driver — see
 * pricing/commission.ts); the legacy per-rule fee fields are kept at the same
 * 30% so the admin rule matrix never contradicts the actual split.
 */
import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

/** Default rule set in cents. One row per packageSize × expeditionType. */
const DEFAULT_RULES: Array<{
  name: string;
  packageSize: "small" | "medium" | "large";
  expeditionType: "standard" | "express" | "same_day";
  basePrice: number;
  pricePerKm: number;
  pricePerKg: number;
  minimumPrice: number;
  expressSurcharge?: number;
  sameDaySurcharge?: number;
}> = [
  { name: "Small · Standard",  packageSize: "small",  expeditionType: "standard",  basePrice: 1500, pricePerKm: 350, pricePerKg: 100, minimumPrice: 2500 },
  { name: "Small · Express",   packageSize: "small",  expeditionType: "express",   basePrice: 1500, pricePerKm: 350, pricePerKg: 100, minimumPrice: 2500, expressSurcharge: 1000 },
  { name: "Small · Same-day",  packageSize: "small",  expeditionType: "same_day",  basePrice: 1500, pricePerKm: 350, pricePerKg: 100, minimumPrice: 2500, sameDaySurcharge: 2000 },
  { name: "Medium · Standard", packageSize: "medium", expeditionType: "standard",  basePrice: 3000, pricePerKm: 450, pricePerKg: 150, minimumPrice: 4500 },
  { name: "Medium · Express",  packageSize: "medium", expeditionType: "express",   basePrice: 3000, pricePerKm: 450, pricePerKg: 150, minimumPrice: 4500, expressSurcharge: 1500 },
  { name: "Medium · Same-day", packageSize: "medium", expeditionType: "same_day",  basePrice: 3000, pricePerKm: 450, pricePerKg: 150, minimumPrice: 4500, sameDaySurcharge: 2500 },
  { name: "Large · Standard",  packageSize: "large",  expeditionType: "standard",  basePrice: 5000, pricePerKm: 600, pricePerKg: 200, minimumPrice: 7000 },
  { name: "Large · Express",   packageSize: "large",  expeditionType: "express",   basePrice: 5000, pricePerKm: 600, pricePerKg: 200, minimumPrice: 7000, expressSurcharge: 2000 },
  { name: "Large · Same-day",  packageSize: "large",  expeditionType: "same_day",  basePrice: 5000, pricePerKm: 600, pricePerKg: 200, minimumPrice: 7000, sameDaySurcharge: 3000 },
];

/**
 * Idempotently guarantee the pricing_rules table has rules to quote against.
 * If any rules already exist, this is a no-op read. Returns the active rules.
 */
export async function ensurePricingRules(
  ctx: MutationCtx,
): Promise<Doc<"pricing_rules">[]> {
  const existing = await ctx.db.query("pricing_rules").collect();
  if (existing.length > 0) return existing;

  const now = Date.now();
  for (let i = 0; i < DEFAULT_RULES.length; i++) {
    const rule = DEFAULT_RULES[i];
    await ctx.db.insert("pricing_rules", {
      name: rule.name,
      packageSize: rule.packageSize,
      expeditionType: rule.expeditionType,
      basePrice: rule.basePrice,
      pricePerKm: rule.pricePerKm,
      pricePerKg: rule.pricePerKg,
      minimumPrice: rule.minimumPrice,
      ...(rule.expressSurcharge !== undefined
        ? { expressSurcharge: rule.expressSurcharge }
        : {}),
      ...(rule.sameDaySurcharge !== undefined
        ? { sameDaySurcharge: rule.sameDaySurcharge }
        : {}),
      platformFeeType: "percentage" as const,
      platformFeeValue: 30,
      version: i + 1,
      effectiveFrom: now,
      isActive: true,
      createdAt: now,
    });
  }

  return await ctx.db.query("pricing_rules").collect();
}
