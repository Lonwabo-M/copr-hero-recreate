import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { requireAdmin, requireAuth } from "../auth/authorization";
import { ROLES } from "../schema";
import { AUDIT_ACTIONS } from "../audit/service";
import {
  validateSaIdNumber,
  validateCellNumber,
  validatePersonName,
} from "./profileValidation";

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

/** KYC upload limits — a copy of the ID and of the driving licence. */
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const ALLOWED_DOCUMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];

const VERIFICATION_CHECKS = [
  "idDocumentChecked",
  "licenseChecked",
  "vehicleRegistrationChecked",
  "sanctionsScreened",
  "pepScreened",
  "adverseMediaScreened",
] as const;

/**
 * Upload ticket for a driver's KYC documents. The client uploads the file
 * straight to Convex file storage with the returned URL and sends the storage
 * id back on submit; no file bytes pass through a Convex function.
 */
export const generateApplicationUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("Authentication required");
    if (user.role !== ROLES.DRIVER) {
      throw new Error("Only driver accounts can upload driver documents");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

async function assertDocument(
  ctx: { storage: { getMetadata: (id: any) => Promise<any> } },
  storageId: any,
  label: string,
): Promise<string | null> {
  const meta = await ctx.storage.getMetadata(storageId);
  if (!meta) return `${label} upload was not found — please upload it again`;
  if (typeof meta.size === "number" && meta.size > MAX_DOCUMENT_BYTES) {
    return `${label} must be smaller than 10 MB`;
  }
  if (meta.contentType && !ALLOWED_DOCUMENT_TYPES.includes(meta.contentType)) {
    return `${label} must be a photo (JPG, PNG, WebP, HEIC) or a PDF`;
  }
  return null;
}

function validateApplicationArgs(args: ApplicationInput): string | null {
  // Identity: first name, surname, SA ID number, cell number.
  const firstNameError = validatePersonName(args.firstName, "First name");
  if (firstNameError) return firstNameError;
  const surnameError = validatePersonName(args.surname, "Surname");
  if (surnameError) return surnameError;
  const idError = validateSaIdNumber(args.idNumber);
  if (idError) return idError;
  const cellError = validateCellNumber(args.cellNumber);
  if (cellError) return cellError;
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
  // Identity
  firstName: string;
  surname: string;
  idNumber: string;
  cellNumber: string;
  // License
  licenseClass: string;
  licenseNumber?: string;
  // Vehicle
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
    // Identity
    firstName: v.string(),
    surname: v.string(),
    idNumber: v.string(),
    cellNumber: v.string(),
    // License
    licenseClass: v.string(),
    licenseNumber: v.optional(v.string()),
    // Vehicle
    vehicleMake: v.string(),
    vehicleModel: v.string(),
    vehicleYear: v.optional(v.number()),
    vehicleCapacityKg: v.number(),
    vehicleRegistration: v.string(),
    vehicleBreaking: v.boolean(),
    vehicleExpress: v.boolean(),
    vehicleFlammable: v.boolean(),
    vehicleTrailer: v.boolean(),
    // KYC documents (required — see the identity-verification policy).
    idDocumentId: v.id("_storage"),
    licenseDocumentId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    if (user.role !== ROLES.DRIVER) {
      throw new Error("Only driver accounts can submit a driver application");
    }

    // Normalise identity input before validating and storing.
    const normalized = {
      ...args,
      firstName: args.firstName.trim(),
      surname: args.surname.trim(),
      idNumber: args.idNumber.replace(/\s/g, ""),
      cellNumber: args.cellNumber.trim(),
    };

    const validationError = validateApplicationArgs(normalized);
    if (validationError) throw new Error(validationError);

    // KYC documents are part of the application, not optional extras: an
    // application cannot enter the review queue without both copies on file.
    const idDocumentError = await assertDocument(ctx, args.idDocumentId, "Identity document");
    if (idDocumentError) throw new Error(idDocumentError);
    const licenseDocumentError = await assertDocument(
      ctx,
      args.licenseDocumentId,
      "Driving licence",
    );
    if (licenseDocumentError) throw new Error(licenseDocumentError);

    const now = Date.now();
    const existing = await ctx.db
      .query("driver_applications")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      if (existing.status === "pending") {
        throw new Error("You already have an application under review");
      }
      // Resubmission after rejection — reset to pending and clear the previous
      // screening record, which applied to the old submission, not this one.
      await ctx.db.patch(existing._id, {
        ...normalized,
        idDocumentId: args.idDocumentId,
        licenseDocumentId: args.licenseDocumentId,
        status: "pending",
        verification: undefined,
        verificationNotes: undefined,
        verifiedBy: undefined,
        verifiedAt: undefined,
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
      ...normalized,
      idDocumentId: args.idDocumentId,
      licenseDocumentId: args.licenseDocumentId,
      createdAt: now,
    });

    // Keep the account itself current: the full legal name and verified cell
    // number flow onto the user record so the admin review card, roster and
    // waybills show the driver's real identity, not just the sign-up name.
    const displayName = `${normalized.firstName} ${normalized.surname}`;
    await ctx.db.patch(userId, {
      name: displayName,
      phone: normalized.cellNumber,
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

/**
 * The signed-in driver's own dispatch identity: profile + ACTIVE vehicle with
 * its real _id (the Operations roster's vehicle is a display projection).
 * Session-derived only — a driver can never select another driver's data.
 * Used by the Driver App vehicle card and by manual-assignment flows that
 * need the driver's active vehicle id.
 */
export const getMyDispatchIdentity = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (userId === null) return null;

    const profile = await ctx.db
      .query("driver_profiles")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!profile) return null;

    const vehicle =
      profile.currentVehicleId != null
        ? await ctx.db.get(profile.currentVehicleId)
        : null;

    return {
      profileId: profile._id,
      licenseClass: profile.licenseClass,
      isAvailable: profile.isAvailable,
      rating: profile.rating,
      totalTrips: profile.totalTrips,
      vehicle:
        vehicle && vehicle.isActive
          ? {
              _id: vehicle._id,
              make: vehicle.make,
              model: vehicle.model,
              registration: vehicle.registration,
              capacityKg: vehicle.capacity,
            }
          : null,
    };
  },
});

// ─── REVIEW (Admin Portal) ───────────────────────────────────────────────────

/** Pending application queue with applicant + review details (admin only). */
export const getApplicationsForReview = query({
  args: {
    status: v.optional(v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected"))),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

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
          // Short-lived signed URLs for the KYC copies. The ids themselves are
          // not useful to a reviewer; the documents are what must be checked.
          idDocumentUrl: app.idDocumentId ? await ctx.storage.getUrl(app.idDocumentId) : null,
          licenseDocumentUrl: app.licenseDocumentId
            ? await ctx.storage.getUrl(app.licenseDocumentId)
            : null,
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
  args: {
    applicationId: v.id("driver_applications"),
    // Enhanced due diligence, recorded by the reviewer at the moment of
    // approval. Every check must be true; an unchecked box is a refusal to
    // approve, not a skipped field.
    verification: v.object({
      idDocumentChecked: v.boolean(),
      licenseChecked: v.boolean(),
      vehicleRegistrationChecked: v.boolean(),
      sanctionsScreened: v.boolean(),
      pepScreened: v.boolean(),
      adverseMediaScreened: v.boolean(),
    }),
    verificationNotes: v.string(),
  },
  handler: async (ctx, args) => {
    const admin = await requireAdmin(ctx);
    const userId = admin.userId;

    const app = await ctx.db.get(args.applicationId);
    if (!app) throw new Error("Application not found");
    if (app.status === "approved") {
      return { success: true, alreadyProcessed: true };
    }
    if (app.status === "rejected") {
      throw new Error("This application was rejected — the driver must resubmit");
    }

    // Identity verification requires the documents. An application captured
    // before document capture existed must be resubmitted, never approved on
    // unchecked identity data.
    if (!app.idDocumentId || !app.licenseDocumentId) {
      throw new Error(
        "KYC documents are missing from this application — ask the driver to resubmit with an identity document and driving licence",
      );
    }
    const missing = VERIFICATION_CHECKS.filter((key) => !args.verification[key]);
    if (missing.length > 0) {
      throw new Error(
        `Complete every due-diligence check before approving (missing: ${missing.join(", ")})`,
      );
    }
    const verificationNotes = args.verificationNotes.trim();
    if (verificationNotes.length < 10) {
      throw new Error(
        "Record what the screening found (at least 10 characters) — it is the evidence for this approval",
      );
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
        idNumber: app.idNumber,
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
        idNumber: app.idNumber,
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
      verification: args.verification,
      verificationNotes,
      verifiedBy: userId,
      verifiedAt: now,
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
      after: JSON.stringify({
        status: "approved",
        profileId,
        vehicleId,
        verification: args.verification,
        verificationNotes,
      }),
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
    const admin = await requireAdmin(ctx);
    const userId = admin.userId;

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
