/**
 * Outbound email seam.
 *
 * Lasha currently sends only the password-reset email (via the platform email
 * API in `src/convex/auth/email.ts`). There is no general outbound email
 * pipeline yet — this module is the designated seam for one, wired for Resend:
 *
 *   1. Set RESEND_API_KEY in the Convex server environment (Keys/API keys UI).
 *   2. (Once) verify your sending domain in Resend and set RESEND_FROM_EMAIL
 *      (defaults to the onboarding@resend.dev sandbox address otherwise).
 *   3. Call `sendOutboundEmail` (an internal action) from a mutation's
 *      post-commit fan-out via `ctx.scheduler.runAfter(0, ...)` — never inline
 *      in the mutation, so email outages can never fail a domain transaction.
 *
 * Behaviour by configuration state:
 *   - RESEND_API_KEY set  → delivers via Resend's REST API.
 *   - RESEND_API_KEY absent → the request is durably queued in the
 *     `email_outbox` table with status "queued" (and surface-tagged
 *     "unconfigured") instead of failing. Nothing is silently dropped; a
 *     delivery worker can drain the outbox once the key exists.
 *
 * Secret hygiene: the key is read only from `process.env` inside this action,
 * never logged, never returned to callers, and never included in thrown
 * error messages (HTTP error objects can carry request headers).
 */
import { internalAction, internalMutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /** Resend template variables — kept opaque and serializable. */
  templateData?: Record<string, string>;
  /** Links the queued row back to the domain entity that triggered it. */
  entityId?: string;
  orderId?: string;
}

export interface SendEmailResult {
  /** "sent" — delivered via provider. "queued" — stored, awaiting config. */
  status: "sent" | "queued";
  provider: "resend" | "outbox";
  /** Present when status === "queued" so workers can drain the row later. */
  outboxId?: string;
  reason?: "unconfigured" | "delivery_failed";
}

/** Normalized recipients list. */
function recipients(to: string | string[]): string[] {
  return Array.isArray(to) ? to : [to];
}

/**
 * Send (or durably queue) a transactional email.
 *
 * Internal on purpose: authorization lives with the domain mutation that
 * schedules it, and no raw provider response ever crosses back to a client.
 */
export const sendOutboundEmail = internalAction({
  args: {
    to: v.union(v.string(), v.array(v.string())),
    subject: v.string(),
    html: v.string(),
    text: v.string(),
    entityId: v.optional(v.string()),
    orderId: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<SendEmailResult> => {
    const to = recipients(args.to);
    const apiKey = process.env.RESEND_API_KEY;

    // ── Unconfigured: queue durably, never throw, never fake success ──
    if (!apiKey) {
      const outboxId = await ctx.runMutation(internal.email.index.queueEmail, {
        to,
        subject: args.subject,
        html: args.html,
        text: args.text,
        entityId: args.entityId,
        orderId: args.orderId,
      });
      return {
        status: "queued",
        provider: "outbox",
        outboxId,
        reason: "unconfigured",
      };
    }

    const from = process.env.RESEND_FROM_EMAIL ?? "onboarding@resend.dev";

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to,
          subject: args.subject,
          html: args.html,
          text: args.text,
        }),
      });

      if (!response.ok) {
        // Do not serialize the response body — it can echo the API key
        // or infrastructure details. Record a generic failure marker.
        await ctx.runMutation(internal.email.index.queueEmail, {
          to,
          subject: args.subject,
          html: args.html,
          text: args.text,
          entityId: args.entityId,
          orderId: args.orderId,
          failed: true,
        });
        return { status: "queued", provider: "outbox", reason: "delivery_failed" };
      }

      return { status: "sent", provider: "resend" };
    } catch {
      // Network error — queue for retry. Never include the raw error
      // (fetch errors can embed request headers, which carry the key).
      const outboxId = await ctx.runMutation(internal.email.index.queueEmail, {
        to,
        subject: args.subject,
        html: args.html,
        text: args.text,
        entityId: args.entityId,
        orderId: args.orderId,
        failed: true,
      });
      return { status: "queued", provider: "outbox", outboxId, reason: "delivery_failed" };
    }
  },
});

/**
 * Queue an email in the outbox. Internal — called by sendOutboundEmail only.
 */
export const queueEmail = internalMutation({
  args: {
    to: v.array(v.string()),
    subject: v.string(),
    html: v.string(),
    text: v.string(),
    entityId: v.optional(v.string()),
    orderId: v.optional(v.string()),
    failed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("email_outbox", {
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
      status: args.failed ? "failed" : "queued",
      entityId: args.entityId,
      orderId: args.orderId,
      attempts: 0,
      createdAt: Date.now(),
    });
  },
});
