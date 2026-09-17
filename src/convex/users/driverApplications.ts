import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { requireAuth } from "../auth/authorization";
import { ROLES } from "../schema";
import { AUDIT_ACTIONS } from "../audit/service";

// ─── Driver Applications ─────────────────────────────────────────────────────
// The driver onboarding pipeline: Capture → Review → Accept.
//
//   1. CAPTURE  (Driver App): a driver-role user submits their license and
//      vehicle details → driver_applications row, status "pending".
//   2. REVIEW   (Admin Portal): admins (company_admin / super_admin) see the
//      pending queue with full captured details.
//   3. ACCEPT   (Admin Portal): approving an application provisions the
//      driver_profile + active vehicle that dispatch's candidate discovery
//      requires (driver_profiles.isAvailable + by_active_driver index) —
//      so approval, and nothing else, is what makes a driver dispatchable.
//      Rejection records the reviewer and notes.
//
// This flow deliberately does NOT live in the Operations Centre: operations
// dispatches approved drivers; hiring/approving them is an admin function.
// Both paths are audit-logged (category "driver" / "user").

const MAX_CAPACITY_KG = 50_000;
const MIN_CAPACITY_KG = 1;

function validateApplicationArgs(args: ApplicationInput): string | null {
  if (args.licenseClass.trim().length < 2) return "License class is required";
  if (args.vehicleMake.trim().length < 2) return "Vehicle make is required";
  if (args.vehicleModel.trim().length < 2) return "Vehicle model is required";
  if (args.vehicleRegistration.trim().length < 3) return "Vehicle registration (license plate) is required";
  if (
    !Number.isFinite(args.vehicleCapacityKg) ||
    args.vehicleCapacityKg < MIN_CAPACITY_KG ||
    args.vehicleCapacityKg > MAX_CAPACITY_KG
  ) {
    return `Capacity must be between ${MIN_CAPACITY_KG} and ${MAX_CAPACITY_KG} kg`;
  }
  if (args.vehicleYear !== undefined && (args.vehicleYear < 1980 || args.vehicleYear > 2100)) {
    return "Vehicle year looks invalid";
  }
  return null;
}

interface ApplicationInput {
  licenseClass: string;
  licenseNumber?: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear?: number;
  vehicleCapacityKg: number;
  vehicleRegistration: string;
  vehicleBreaking: boolean;
  vehicleExpress: boolean;
  vehicleFlammable: boolean;
  vehicleTrailer: boolean;
}

// ─── CAPTURE (Driver App) ────────────────────────────────────────────────────

/**
 * Submit (or resubmit) the driver's application with captured details.
 * A driver has at most one live application — resubmission after a rejection
 * updates the same record back to pending (the pipeline keeps one row per
 * driver via the by_user index).
 */
export const submitMyDriverApplication = mutation({
  args: {
    licenseClass: v.string(),
    licenseNumber: v.optional(v.string()),
    vehicleMake: v.string(),
    vehicleModel: v.string(),
    vehicleYear: v.optional(v.number()),
    vehicleCapacityKg: v.number(),
    vehicleRegistration: v.string(),
    vehicleBreaking: v.boolean(),
    vehicleExpress: v.boolean(),
    vehicleFlammable: v.boolean(),
    vehicleTrailer: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    if (user.role !== ROLES.DRIVER) {
      throw new Error("Only driver accounts can submit a driver application");
    }

    const validationError = validateApplicationArgs(args as ApplicationInput);
    if (validationError) throw new Error(validationError);

    const now = Date.now();
    const existing = await ctx.db
      .query("driver_applications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      if (existing.status === "pending") {
        throw new Error("You already have an application under review");
      }
      // Resubmission after rejection — reset to pending.
      await ctx.db.patch(existing._id, {
        ...args,
        status: "pending",
        reviewNotes: undefined,
        reviewedBy: undefined,
        reviewedAt: undefined,
        createdAt: now,
      });
      return { applicationId: existing._id, resubmitted: true };
    }

    const applicationId = await ctx.db.insert("driver_applications", {
      userId,
      status: "pending",
      ...args,
      createdAt: now,
    });

    await ctx.runMutation(internal.audit.service.recordGenericEvent, {
      actorId: userId,
      actorRole: ROLES.DRIVER,
      category: "driver",
      action: "driver.application_submitted",
      entityType: "driver_applications",
      entityId: applicationId,
      after: JSON.stringify({ status: "pending" }),
      metadata: "Driver application captured (Driver App)",
    });

    return { applicationId, resubmitted: false };
  },
});

/** The signed-in driver's own application (session-derived; drives the
 *  Driver App's application status card). */
export const getMyDriverApplication = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const application = await ctx.db
      .query("driver_applications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (!application) return null;

    // Attach the reviewer's name for the status card.
    const reviewer = application.reviewedBy
      ? await ctx.db.get(application.reviewedBy)
      : null;

    return {
      ...application,
      reviewerName: reviewer?.name ?? null,
    };
  },
});

// ─── REVIEW (Admin Portal) ───────────────────────────────────────────────────

function requireAdmin(user: { role?: string }): void {
  if (user.role !== ROLES.COMPANY_ADMIN && user.role !== ROLES.SUPER_ADMIN) {
    throw new Error("Access denied: admin only");
  }
}

/** Pending application queue with applicant + review details (admin only). */
export const getApplicationsForReview = query({
  args: {
    status: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"))),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Authentication required");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Authentication required");
    requireAdmin(user);

    const status = args.status ?? "pending";
    const rows = await ctx.db
      .query("driver_applications")
      .withIndex("by_status", (q) => q.eq("status", status))
      .order("desc")
      .take(100);

    return await Promise.all(
      rows.map(async (app) => {
        const applicant = await ctx.db.get(app.userId);
        const reviewer = app.reviewedBy ? await ctx.db.get(app.reviewedBy) : null;
        return {
          ...app,
          applicantName: applicant?.name ?? "—",
          applicantEmail: applicant?.email ?? null,
          applicantPhone: applicant?.phone ?? null,
          reviewerName: reviewer?.name ?? null,
        };
      }),
    );
  },
});

/**
 * ACCEPT — final step of the pipeline. Provisions everything dispatch needs:
 *   driver_profiles (isAvailable: true) + active vehicle.
 * Idempotent: re-approving an already-approved application is a no-op.
 */
export const acceptDriverApplication = mutation({
  args: { applicationId: v.id("driver_applications") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const admin = await ctx.db.get(userId);
    if (!admin) throw new Error("Authentication required");
    requireAdmin(admin);

    const app = await ctx.db.get(args.applicationId);
    if (!app) throw new Error("Application not found");
    if (app.status === "approved") {
      return { success: true, alreadyProcessed: true };
    }
    if (app.status === "rejected") {
      throw new Error("This application was rejected — the driver must resubmit");
    }

    const now = Date.now();
    const applicant = await ctx.db.get(app.userId);
    if (!applicant) throw new Error("Applicant account no longer exists");

    // Provision the driver_profile (dispatch's candidate source).
    const existingProfile = await ctx.db
      .query("driver_profiles")
      .withIndex("by_user", (q) => q.eq("userId", app.userId))
      .first();

    let profileId = existingProfile?._id ?? null;
    if (!profileId) {
      profileId = await ctx.db.insert("driver_profiles", {
        userId: app.userId,
        licenseClass: app.licenseClass,
        licenseNumber: app.licenseNumber,
        rating: 5,
        totalTrips: 0,
        totalEarnings: 0,
        isAvailable: true,
        createdAt: now,
      });
    } else {
      await ctx.db.patch(profileId, {
        licenseClass: app.licenseClass,
        licenseNumber: app.licenseNumber,
        isAvailable: true,
      });
    }

    // Provision the vehicle (dispatch requires an active vehicle).
    const existingVehicles = await ctx.db
      .query("vehicles")
      .withIndex("by_driver", (q) => q.eq("driverId", app.userId))
      .collect();
    const existingByReg = existingVehicles.find(
      (v) => v.registration.toLowerCase() === app.vehicleRegistration.trim().toLowerCase(),
    );

    let vehicleId = existingByReg?._id ?? null;
    if (!vehicleId) {
      vehicleId = await ctx.db.insert("vehicles", {
        driverId: app.userId,
        registration: app.vehicleRegistration.trim(),
        make: app.vehicleMake.trim(),
        model: app.vehicleModel.trim(),
        year: app.vehicleYear,
        capacity: app.vehicleCapacityKg,
        breaking: app.vehicleBreaking,
        express: app.vehicleExpress,
        flammable: app.vehicleFlammable,
        trailer: app.vehicleTrailer,
        isActive: true,
        createdAt: now,
      });
    } else {
      await ctx.db.patch(vehicleId, {
        make: app.vehicleMake.trim(),
        model: app.vehicleModel.trim(),
        year: app.vehicleYear,
        capacity: app.vehicleCapacityKg,
        breaking: app.vehicleBreaking,
        express: app.vehicleExpress,
        flammable: app.vehicleFlammable,
        trailer: app.vehicleTrailer,
        isActive: true,
      });
    }

    // Point the profile at its active vehicle.
    await ctx.db.patch(profileId, { currentVehicleId: vehicleId });

    await ctx.db.patch(app._id, {
      status: "approved",
      reviewedBy: userId,
      reviewedAt: now,
    });

    await ctx.runMutation(internal.audit.service.recordGenericEvent, {
      actorId: userId,
      actorRole: (admin.role as string) ?? "admin",
      category: "driver",
      action: "driver.application_approved",
      entityType: "driver_applications",
      entityId: app._id,
      before: JSON.stringify({ status: "pending" }),
      after: JSON.stringify({ status: "approved", profileId, vehicleId }),
      metadata: `Driver approved: ${applicant.name ?? applicant.email ?? app.userId}`,
    });

    return { success: true, alreadyProcessed: false, profileId, vehicleId };
  },
});

// ─── Driver Roster (Operations Centre) ──────────────────────────────────────

/**
 * Full driver roster for the Operations Centre Drivers tab: every driver-role
 * user with their profile, vehicle, and application state — not just the
 * available-with-GPS subset. Operations/admin only. The live GPS subset
 * (getAvailableDriverLocations) joins onto this by driverId in the UI.
 */
export const getDriverRoster = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) throw new Error("Authentication required");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Authentication required");

    const allowedRoles = [
      ROLES.OPERATIONS,
      ROLES.FLEET_MANAGER,
      ROLES.COMPANY_ADMIN,
      ROLES.SUPER_ADMIN,
    ];
    if (!allowedRoles.includes(user.role as any)) {
      throw new Error("Access denied: operations only");
    }

    const drivers = await ctx.db
      .query("users")
      .withIndex("by_role", (q) => q.eq("role", ROLES.DRIVER))
      .collect();

    return await Promise.all(
      drivers.map(async (driver) => {
        const profile = await ctx.db
          .query("driver_profiles")
          .withIndex("by_user", (q) => q.eq("userId", driver._id))
          .first();

        const vehicle =
          profile?.currentVehicleId != null
            ? await ctx.db.get(profile.currentVehicleId)
            : null;

        const application = await ctx.db
          .query("driver_applications")
          .withIndex("by_user", (q) => q.eq("userId", driver._id))
          .first();

        return {
          driverId: driver._id,
          name: driver.name ?? "—",
          phone: driver.phone ?? null,
          email: driver.email ?? null,
          hasProfile: profile != null,
          isAvailable: profile?.isAvailable ?? false,
          rating: profile?.rating ?? null,
          totalTrips: profile?.totalTrips ?? null,
          licenseClass: profile?.licenseClass ?? null,
          vehicle: vehicle
            ? {
                make: vehicle.make,
                model: vehicle.model,
                registration: vehicle.registration,
                capacityKg: vehicle.capacity,
              }
            : null,
          hasGps: driver.currentLat !== undefined && driver.currentLng !== undefined,
          applicationStatus: application?.status ?? null,
        };
      }),
    );
  },
});

/** REJECT — records reviewer + notes; driver can resubmit. */
export const rejectDriverApplication = mutation({
  args: { applicationId: v.id("driver_applications"), notes: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const admin = await ctx.db.get(userId);
    if (!admin) throw new Error("Authentication required");
    requireAdmin(admin);

    const app = await ctx.db.get(args.applicationId);
    if (!app) throw new Error("Application not found");
    if (app.status === "approved") {
      throw new Error("This application is already approved");
    }
    if (app.status === "rejected") {
      return { success: true, alreadyProcessed: true };
    }

    const now = Date.now();
    await ctx.db.patch(app._id, {
      status: "rejected",
      reviewNotes: args.notes,
      reviewedBy: userId,
      reviewedAt: now,
    });

    await ctx.runMutation(internal.audit.service.recordGenericEvent, {
      actorId: userId,
      actorRole: (admin.role as string) ?? "admin",
      category: "driver",
      action: "driver.application_rejected",
      entityType: "driver_applications",
      entityId: app._id,
      before: JSON.stringify({ status: "pending" }),
      after: JSON.stringify({ status: "rejected", notes: args.notes ?? null }),
      metadata: "Driver application rejected",
    });

    return { success: true, alreadyProcessed: false };
  },
});
