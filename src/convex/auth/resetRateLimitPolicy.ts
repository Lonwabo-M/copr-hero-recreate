/**
 * Password-reset send throttle — pure decision logic.
 *
 * Convex Auth rate-limits failed password guesses, but it does NOT rate-limit
 * reset-code requests. Without a limit here, anyone who knows an account's
 * email can make the reset endpoint send that inbox a new code repeatedly.
 *
 * Limits are per account email (stored as a hash, see resetRateLimit.ts):
 *   - 1 code per minute (absorbs double-submits and retries),
 *   - 5 codes per rolling hour,
 *   - 10 codes per rolling 24 hours.
 *
 * Denied attempts are NOT recorded. Otherwise repeated clicking would keep
 * pushing the cooldown forward and lock the owner out indefinitely.
 */

export const RESET_CODE_COOLDOWN_MS = 60_000;
export const RESET_CODE_HOUR_MS = 60 * 60 * 1000;
export const RESET_CODE_DAY_MS = 24 * 60 * 60 * 1000;
export const RESET_CODE_MAX_PER_HOUR = 5;
export const RESET_CODE_MAX_PER_DAY = 10;
/** Rows untouched for this long are deleted by the retention sweep. */
export const RESET_RATE_LIMIT_RETENTION_MS = 2 * RESET_CODE_DAY_MS;

export type ResetSendDecision =
  | { allowed: true; timestamps: number[] }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Decide whether a send is allowed now and return the send history to store.
 * `previous` is untrusted (it comes from the database): invalid values and
 * timestamps outside the rolling day are dropped rather than trusted.
 */
export function decideResetSend(
  previous: readonly number[],
  now: number,
): ResetSendDecision {
  const dayCutoff = now - RESET_CODE_DAY_MS;
  const recent = previous
    .filter((t) => Number.isFinite(t) && t > dayCutoff && t <= now)
    .sort((a, b) => a - b);

  let waitMs = 0;

  const last = recent.length > 0 ? recent[recent.length - 1] : undefined;
  if (last !== undefined) {
    waitMs = Math.max(waitMs, last + RESET_CODE_COOLDOWN_MS - now);
  }

  const hourCutoff = now - RESET_CODE_HOUR_MS;
  const inLastHour = recent.filter((t) => t > hourCutoff);
  if (inLastHour.length >= RESET_CODE_MAX_PER_HOUR) {
    // The oldest send that must leave the window before another is allowed.
    const blocking = inLastHour[inLastHour.length - RESET_CODE_MAX_PER_HOUR];
    waitMs = Math.max(waitMs, blocking + RESET_CODE_HOUR_MS - now);
  }

  if (recent.length >= RESET_CODE_MAX_PER_DAY) {
    const blocking = recent[recent.length - RESET_CODE_MAX_PER_DAY];
    waitMs = Math.max(waitMs, blocking + RESET_CODE_DAY_MS - now);
  }

  if (waitMs > 0) {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)) };
  }

  return { allowed: true, timestamps: [...recent, now] };
}
