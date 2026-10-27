/**
 * Server-side throttle for password-reset code emails.
 *
 * Called from the reset email bridge (`auth/email.ts`) immediately before a
 * code is sent. The provider's own failed-sign-in limiter does not cover reset
 * requests, so this is the only place that can stop a known inbox from being
 * spammed through the public `auth:signIn` reset flow.
 *
 * Privacy: rows are keyed by a SHA-256 hash of the normalised email, not the
 * address itself, and hold only recent send timestamps. The retention sweep
 * deletes rows untouched for 48 hours (privacy/retention.ts).
 */
import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import { decideResetSend } from "./resetRateLimitPolicy";

const MAX_EMAIL_LENGTH = 320;

export async function hashResetIdentifier(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(normalized),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export const consumeResetSend = internalMutation({
  args: { email: v.string() },
  handler: async (ctx, args) => {
    const emailHash = await hashResetIdentifier(args.email);
    const now = Date.now();

    const row = await ctx.db
      .query("password_reset_rate_limits")
      .withIndex("by_email_hash", (q) => q.eq("emailHash", emailHash))
      .unique();

    const decision = decideResetSend(row?.timestamps ?? [], now);

    if (!decision.allowed) {
      return {
        allowed: false as const,
        retryAfterSeconds: decision.retryAfterSeconds,
      };
    }

    if (row) {
      await ctx.db.patch(row._id, {
        timestamps: decision.timestamps,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("password_reset_rate_limits", {
        emailHash,
        timestamps: decision.timestamps,
        updatedAt: now,
      });
    }

    return { allowed: true as const, retryAfterSeconds: 0 };
  },
});
