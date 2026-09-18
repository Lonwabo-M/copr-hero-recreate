// ─── Demo requests (Book a Demo) ─────────────────────────────────────────────
// Public sales-lead capture for the marketing site's Book a Demo page.
// Public-mutation hardening, in order:
//   1. No auth — this is the one intentional pre-auth write on the platform,
//      so it validates and sanitises everything server-side.
//   2. Honeypot field ("companyWebsite"): humans never see it; bots fill it.
//      A filled honeypot "succeeds" silently (stores nothing) so bots get no
//      signal to adapt.
//   3. Per-email window rate limit: one request per email per 10 minutes —
//      blocks form-spam loops; a genuine double-submit gets a clear message.
//   4. Field length caps + email/phone validation mirror the UI's own limits.
// Staff work the pipeline via listDemoRequests / getDemoRequestStats /
// setDemoRequestStatus (operations, company admin, super admin).

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { getCurrentAuthUser } from "./auth/authorization";
import { ROLES } from "./schema";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DEMO_STATUSES = ["new", "contacted", "qualified", "closed"] as const;
type DemoStatus = (typeof DEMO_STATUSES)[number];

const requireStaff = async (ctx: Parameters<typeof getCurrentAuthUser>[0]) => {
  const user = await getCurrentAuthUser(ctx);
  if (!user) throw new Error("Authentication required");
  const allowed: string[] = [ROLES.OPERATIONS, ROLES.COMPANY_ADMIN, ROLES.SUPER_ADMIN];
  if (!allowed.includes(user.role)) throw new Error("Access denied");
  return user;
};

export const submitDemoRequest = mutation({
  args: {
    businessName: v.string(),
    contactName: v.string(),
    email: v.string(),
    phone: v.string(),
    businessType: v.optional(v.string()),
    monthlyVolume: v.optional(v.string()),
    message: v.optional(v.string()),
    companyWebsite: v.optional(v.string()), // honeypot — never rendered to humans
    source: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Honeypot: pretend success, store nothing — bots get no adaptive signal.
    if (args.companyWebsite && args.companyWebsite.trim().length > 0) {
      return { ok: true as const, spam: true as const };
    }

    const businessName = args.businessName.trim().slice(0, 120);
    const contactName = args.contactName.trim().slice(0, 120);
    const email = args.email.trim().toLowerCase().slice(0, 200);
    const phone = args.phone.trim().slice(0, 40);
    const businessType = args.businessType?.trim().slice(0, 60);
    const monthlyVolume = args.monthlyVolume?.trim().slice(0, 60);
    const message = args.message?.trim().slice(0, 1000);
    const source = args.source?.trim().slice(0, 60) || "book-demo-page";

    if (businessName.length < 2) throw new Error("Please enter your business name.");
    if (contactName.length < 2) throw new Error("Please enter your name.");
    if (!EMAIL_RE.test(email)) throw new Error("Please enter a valid email address.");
    if (phone.replace(/\D/g, "").length < 7) throw new Error("Please enter a valid phone number.");

    // Rate limit: one request per email per 10 minutes.
    const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
    const recent = await ctx.db
      .query("demo_requests")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    if (recent.some((r) => r.submittedAt >= tenMinutesAgo)) {
      throw new Error("You already submitted a request recently — we'll be in touch shortly.");
    }

    await ctx.db.insert("demo_requests", {
      businessName,
      contactName,
      email,
      phone,
      ...(businessType ? { businessType } : {}),
      ...(monthlyVolume ? { monthlyVolume } : {}),
      ...(message ? { message } : {}),
      status: "new",
      source,
      submittedAt: Date.now(),
    });

    // Notify every operations + company-admin account through the same
    // notification inbox staff already watch for operational alerts.
    const staff = await ctx.db.query("users").collect();
    for (const staffUser of staff) {
      const role = (staffUser as { role?: string }).role;
      if (role === ROLES.OPERATIONS || role === ROLES.COMPANY_ADMIN || role === ROLES.SUPER_ADMIN) {
        await ctx.db.insert("notifications", {
          userId: staffUser._id,
          type: "alert",
          title: "New demo request",
          description: `${contactName} (${businessName}) requested a demo — ${email}`,
          isRead: false,
          createdAt: Date.now(),
        });
      }
    }

    return { ok: true as const, spam: false as const };
  },
});

// ─── Staff pipeline views ────────────────────────────────────────────────────

export const listDemoRequests = query({
  args: {
    status: v.optional(
      v.union(v.literal("new"), v.literal("contacted"), v.literal("qualified"), v.literal("closed"))
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const limit = Math.min(Math.max(args.limit ?? 100, 1), 300);
    if (args.status) {
      return await ctx.db
        .query("demo_requests")
        .withIndex("by_status", (q) => q.eq("status", args.status as DemoStatus))
        .order("desc")
        .take(limit);
    }
    // Newest first across all statuses (bounded scan; the leads table stays small).
    const all = await ctx.db.query("demo_requests").take(1000);
    return all.sort((a, b) => b.submittedAt - a.submittedAt).slice(0, limit);
  },
});

export const getDemoRequestStats = query({
  args: {},
  handler: async (ctx) => {
    await requireStaff(ctx);
    const all = await ctx.db.query("demo_requests").take(1000);
    const byStatus: Record<string, number> = { new: 0, contacted: 0, qualified: 0, closed: 0 };
    for (const r of all) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    const last7d = all.filter((r) => r.submittedAt >= Date.now() - 7 * 86400000).length;
    return { total: all.length, byStatus, last7d };
  },
});

export const setDemoRequestStatus = mutation({
  args: {
    requestId: v.id("demo_requests"),
    status: v.union(v.literal("new"), v.literal("contacted"), v.literal("qualified"), v.literal("closed")),
  },
  handler: async (ctx, args) => {
    await requireStaff(ctx);
    const existing = await ctx.db.get(args.requestId);
    if (!existing) throw new Error("Demo request not found");
    await ctx.db.patch(args.requestId, { status: args.status });
    return { ok: true as const };
  },
});
