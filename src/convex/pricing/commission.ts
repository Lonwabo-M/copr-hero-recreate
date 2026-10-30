/**
 * Platform commission policy.
 *
 * Lasha's commercial rule: every completed customer payment is split 30/70.
 * The platform retains 30% of the delivery charge; the driver receives 70%.
 *
 * This is deliberately a single constant rather than a per-rule setting. The
 * split is a business policy, not a pricing experiment: allowing individual
 * pricing rules to drift would make driver payouts and platform revenue
 * disagree with the published split. The commission is deducted FROM the
 * customer's delivery fee — it is never added on top.
 *
 * Amounts are in cents (ZAR). Rounding is applied once, to the platform
 * share; the driver receives the remainder, so the two shares always add up
 * to the exact customer charge (no lost or invented cents).
 */

export const PLATFORM_COMMISSION_PERCENT = 30;
export const DRIVER_SHARE_PERCENT = 100 - PLATFORM_COMMISSION_PERCENT;

export interface ChargeSplit {
  /** Platform's 30% of the customer charge, in cents. */
  platformFee: number;
  /** Driver's 70% of the customer charge, in cents. */
  driverEarnings: number;
}

/**
 * Split the authoritative customer charge into platform and driver shares.
 * Throws on invalid amounts so a bad quote can never create a settlement.
 */
export function splitCustomerCharge(totalCharge: number): ChargeSplit {
  if (!Number.isFinite(totalCharge) || totalCharge < 0) {
    throw new Error("Cannot split an invalid customer charge");
  }
  const amount = Math.round(totalCharge);
  const platformFee = Math.round((amount * PLATFORM_COMMISSION_PERCENT) / 100);
  return {
    platformFee,
    driverEarnings: amount - platformFee,
  };
}
