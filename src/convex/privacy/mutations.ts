/**
 * POPIA consent registry and data subject requests.
 *
 * Two obligations drive this module:
 *
 * 1. Consent must be specific, informed and demonstrable (s11(1)(a), s18). A
 *    consent record is therefore written server-side with the published
 *    wording and policy version, and never updated in place.
 * 2. A data subject may ask what we hold, ask for correction or deletion,
 *    object, and opt out of marketing (s23, s24, s11(3), s69). Every request
 *    lands in `privacy_requests` with a 30-day due date, a reference the person
 *    can quote, and a status staff work from the Admin Portal.
 *
 * The public submission path is hardened the same way as demo.ts: honeypot,
 * bounded per-email rate limit, length caps and server-side validation. It
 * never reveals whether an email has an account.
 */

import { mutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { getCurrentAuthUser, requireAuth } from "../auth/authorization";
import { ROLES } from "../schema";
import {
  CONSENT_PURPOSES,
  CONSENT_SOURCES,
  CONSENT_WORDING,
  DSAR_RESPONSE_DAYS,
  MARKETING_SUBSCRIPTION_WORDING,
  PRIVACY_POLICY_VERSION,
  PRIVACY_REQUEST_PREFIX,
  PRIVACY_REQUEST_TYPES,
  type ConsentPurpose,
  type ConsentSource,
  type PrivacyRequestType,
} from "./policy";


const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Staff who may work the privacy queue. Customer-facing company admins are
 * deliberately excluded: a business admin must not see another business's
 * data subject requests.
 */
async function requirePrivacyStaff(ctx: Parameters<typeof getCurrentAuthUser>[0]) {
  const user = await getCurrentAuthUser(ctx);
  if (!user) throw new Error("Authentication required");
  const allowed: string[] = [ROLES.OPERATIONS, ROLES.SUPER_ADMIN];
  if (!allowed.includes(user.role)) throw new Error("Access denied");
  return user;
}

const purposeValidator = v.union(
  v.literal(CONSENT_PURPOSES[0]),
  v.literal(CONSENT_PURPOSES[1]),
  v.literal(CONSENT_PURPOSES[2]),
);

const sourceValidator = v.union(
  v.literal(CONSENT_SOURCES[0]),
  v.literal(CONSENT_SOURCES[1]),
  v.literal(CONSENT_SOURCES[2]),
);

const requestTypeValidator = v.union(
  v.literal(PRIVACY_REQUEST_TYPES[0]),
  v.literal(PRIVACY_REQUEST_TYPES[1]),
  v.literal(PRIVACY_REQUEST_TYPES[2]),
  v.literal(PRIVACY_REQUEST_TYPES[3]),
  v.literal(PRIVACY_REQUEST_TYPES[4]),
  v.literal(PRIVACY_REQUEST_TYPES[5]),
);

const requestStatusValidator = v.union(
  v.literal("received"),
  v.literal("in_progress"),
  v.literal("completed"),
  v.literal("refused"),
);

// ─── Consent ────────────────────────────────────────────────────────────────

/**
 * Record a consent decision for the signed-in user.
 *
 * The client sends which purpose changed and whether it was granted. The
 * wording and version are stamped here from policy.ts, so a record always
 * shows what Lasha actually published. Repeating the same decision is a no-op
 * (the UI may call this on every settings save without inflating the log).
 */
export const recordConsent = mutation({
  args: {
    purpose: purposeValidator,
    granted: v.boolean(),
    source: sourceValidator,
    /** The version of the notice the person was looking at. */
    policyVersion: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    if (args.policyVersion !== PRIVACY_POLICY_VERSION) {
      // Do not silently record agreement to a notice the person did not see.
      throw new Error(
        "The privacy notice has changed. Reload the page and review the current notice before continuing.",
      );
    }

    const latest = await ctx.db
      .query("consent_records")
      .withIndex("by_user_purpose", (q) =>
        q.eq("userId", userId).eq("purpose", args.purpose as ConsentPurpose),
      )
      .order("desc")
      .first();

    // A repeat at the same notice version is a no-op. A repeat against a new
    // notice version is a fresh record: the person has now agreed to the
    // wording in force, and the evidence must name that version.
    if (
      latest &&
      latest.granted === args.granted &&
      latest.policyVersion === args.policyVersion
    ) {
      return { ok: true as const, unchanged: true as const };
    }

    await ctx.db.insert("consent_records", {
      userId,
      purpose: args.purpose as ConsentPurpose,
      granted: args.granted,
      policyVersion: PRIVACY_POLICY_VERSION,
      wording: CONSENT_WORDING[args.purpose as ConsentPurpose],
      source: args.source as ConsentSource,
      createdAt: Date.now(),
    });

    // Keep the legacy notification flag in step with the consent registry. The
    // registry is authoritative; this mirror exists because older preference UI
    // and tests still read `notification_preferences.marketingEmails`.
    if (args.purpose === "marketing") {
      const prefs = await ctx.db
        .query("notification_preferences")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      if (prefs) await ctx.db.patch(prefs._id, { marketingEmails: args.granted });
    }

    return { ok: true as const, unchanged: false as const };
  },
});

/** Withdraw a consent purpose. A withdrawal is a new row, never a deletion. */
export const withdrawConsent = mutation({
  args: {
    purpose: purposeValidator,
    source: sourceValidator,
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const latest = await ctx.db
      .query("consent_records")
      .withIndex("by_user_purpose", (q) =>
        q.eq("userId", userId).eq("purpose", args.purpose as ConsentPurpose),
      )
      .order("desc")
      .first();

    if (!latest || latest.granted === false) {
      return { ok: true as const, unchanged: true as const };
    }

    await ctx.db.insert("consent_records", {
      userId,
      purpose: args.purpose as ConsentPurpose,
      granted: false,
      policyVersion: PRIVACY_POLICY_VERSION,
      wording: CONSENT_WORDING[args.purpose as ConsentPurpose],
      source: args.source as ConsentSource,
      createdAt: Date.now(),
    });

    if (args.purpose === "marketing") {
      const prefs = await ctx.db
        .query("notification_preferences")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique();
      if (prefs) await ctx.db.patch(prefs._id, { marketingEmails: false });
    }

    return { ok: true as const, unchanged: false as const };
  },
});

/**
 * Public opt-in for the landing footer's product-updates form (s69).
 *
 * Nothing is sent to the address yet — the point of this mutation is that any
 * future sender can prove opt-in: the wording, notice version, source and time
 * are recorded, and a repeat submission is idempotent. A filled honeypot is
 * accepted and dropped so bots learn nothing.
 */
export const subscribeToMarketing = mutation({
  args: {
    email: v.string(),
    companyWebsite: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.companyWebsite && args.companyWebsite.trim().length > 0) {
      return { ok: true as const, spam: true as const };
    }

    const email = args.email.trim().toLowerCase().slice(0, 200);
    if (!EMAIL_RE.test(email)) throw new Error("Please enter a valid email address.");

    const history = await ctx.db
      .query("marketing_subscriptions")
      .withIndex("by_email", (q) => q.eq("email", email))
      .order("desc")
      .take(10);

    const latest = history[0];
    if (latest?.status === "subscribed") {
      return { ok: true as const, spam: false as const };
    }

    // Rate limit: an unsubscribe followed by repeated re-subscribes should not
    // become a write loop. One write per email per 10 minutes.
    if (latest && Date.now() - latest.createdAt < 10 * 60 * 1000) {
      return { ok: true as const, spam: false as const };
    }

    await ctx.db.insert("marketing_subscriptions", {
      email,
      status: "subscribed",
      wording: MARKETING_SUBSCRIPTION_WORDING,
      policyVersion: PRIVACY_POLICY_VERSION,
      source: "landing-footer",
      createdAt: Date.now(),
    });

    return { ok: true as const, spam: false as const };
  },
});

// ─── Data subject requests ──────────────────────────────────────────────────

/** Uppercase, unambiguous reference: no O/0, I/1 to survive being read aloud. */
function newReference(year: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let suffix = "";
  for (let i = 0; i < 6; i += 1) {
    suffix += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `${PRIVACY_REQUEST_PREFIX}-${year}-${suffix}`;
}

/**
 * Submit a privacy request. Public: a person must be able to exercise their
 * rights without an account (s23 does not require one).
 *
 * The response contains only the reference and due date. It never says whether
 * an account exists for the email, so the form cannot be used to enumerate
 * customers.
 */
export const submitPrivacyRequest = mutation({
  args: {
    type: requestTypeValidator,
    name: v.string(),
    email: v.string(),
    phone: v.optional(v.string()),
    details: v.string(),
    /** Honeypot — hidden from humans; a filled value is accepted and dropped. */
    companyWebsite: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.companyWebsite && args.companyWebsite.trim().length > 0) {
      return { ok: true as const, reference: "", dueAt: 0, spam: true as const };
    }

    const name = args.name.trim().slice(0, 120);
    const email = args.email.trim().toLowerCase().slice(0, 200);
    const phone = args.phone?.trim().slice(0, 40);
    const details = args.details.trim().slice(0, 4000);

    if (name.length < 2) throw new Error("Please enter your name.");
    if (!EMAIL_RE.test(email)) throw new Error("Please enter a valid email address.");
    if (details.length < 10) {
      throw new Error("Please describe your request so we can identify the right records.");
    }

    // Rate limit: one submission per email per 10 minutes.
    const recent = await ctx.db
      .query("privacy_requests")
      .withIndex("by_email", (q) => q.eq("email", email))
      .order("desc")
      .take(20);
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    if (recent.some((request) => request.submittedAt >= tenMinutesAgo)) {
      throw new Error(
        "We already received a request from this email address. Please wait for our reply, or email privacy@lasha.co.za if it is urgent.",
      );
    }

    // Cap open requests so a scripted mailbox cannot flood the queue.
    const open = recent.filter(
      (request) => request.status === "received" || request.status === "in_progress",
    );
    if (open.length >= 5) {
      throw new Error(
        "There are several open requests for this email address. Please reply to our latest email instead of opening another request.",
      );
    }

    const now = Date.now();

    // Global ceiling: the per-email limit above cannot stop a scripted mailbox
    // from flooding the queue (and every staff member's notifications) with
    // requests. Bound the whole intake per hour as well. A legitimate burst of
    // 60 privacy requests in an hour is not a real pattern for this platform.
    const recentAny = await ctx.db
      .query("privacy_requests")
      .withIndex("by_submitted")
      .order("desc")
      .take(100);
    const hourAgo = now - 60 * 60 * 1000;
    if (recentAny.filter((request) => request.submittedAt >= hourAgo).length >= 60) {
      throw new Error(
        "The privacy desk is receiving an unusually high number of requests. Please email privacy@lasha.co.za directly.",
      );
    }

    const dueAt = now + DSAR_RESPONSE_DAYS * DAY_MS;

    // Unique reference without an unbounded scan: retry a few times on clash.
    let reference = newReference(new Date(now).getUTCFullYear());
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const clash = await ctx.db
        .query("privacy_requests")
        .withIndex("by_reference", (q) => q.eq("reference", reference))
        .first();
      if (!clash) break;
      reference = newReference(new Date(now).getUTCFullYear());
    }

    // Attach the account only when the submitter is signed in. We do not look
    // the email up, so a signed-out request cannot confirm an account exists.
    const authUser = await getCurrentAuthUser(ctx);

    await ctx.db.insert("privacy_requests", {
      reference,
      type: args.type as PrivacyRequestType,
      name,
      email,
      ...(phone ? { phone } : {}),
      details,
      status: "received",
      ...(authUser ? { userId: authUser.userId } : {}),
      submittedAt: now,
      dueAt,
    });

    // Put the 30-day clock in front of staff. Bounded scan — this write path is
    // public, so it must never walk an unbounded users table.
    const staff = await ctx.db.query("users").take(500);
    for (const staffUser of staff) {
      const role = (staffUser as { role?: string }).role;
      if (role === ROLES.OPERATIONS || role === ROLES.SUPER_ADMIN) {
        await ctx.db.insert("notifications", {
          userId: staffUser._id,
          type: "alert",
          title: "New privacy request",
          description: `${reference} — ${args.type.replace(/_/g, " ")} — respond by ${new Date(dueAt).toLocaleDateString("en-ZA")}`,
          isRead: false,
          createdAt: now,
        });
      }
    }

    return { ok: true as const, reference, dueAt, spam: false as const };
  },
});

/** Staff: move a request through the queue and record the outcome. */
export const updatePrivacyRequestStatus = mutation({
  args: {
    requestId: v.id("privacy_requests"),
    status: requestStatusValidator,
    resolutionNote: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const staff = await requirePrivacyStaff(ctx);
    const existing = await ctx.db.get(args.requestId);
    if (!existing) throw new Error("Privacy request not found");

    const note = args.resolutionNote?.trim().slice(0, 2000);
    const resolved = args.status === "completed" || args.status === "refused";

    await ctx.db.patch(args.requestId, {
      status: args.status,
      handledBy: staff.userId,
      ...(note ? { resolutionNote: note } : {}),
      ...(resolved ? { resolvedAt: Date.now() } : {}),
    });

    await ctx.runMutation(internal.audit.service.recordGenericEvent, {
      actorId: staff.userId,
      actorRole: staff.role,
      category: "admin",
      action: "privacy.request_status_changed",
      entityType: "privacy_requests",
      entityId: existing.reference,
      before: JSON.stringify({ status: existing.status }),
      after: JSON.stringify({ status: args.status }),
      metadata: "Privacy request handled in the Admin Portal",
    });

    return { ok: true as const };
  },
});

