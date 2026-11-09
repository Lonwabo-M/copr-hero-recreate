/**
 * Lasha Proof of Delivery Service
 *
 * Implements the POD domain for delivery evidence collection.
 * All POD operations are server-side authorized and idempotent.
 */

import { mutation, query, internalMutation, QueryCtx, MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { Id, Doc } from "../_generated/dataModel";
import { DELIVERY_STATUS, ROLES } from "../schema";
import { requireAuth, getCurrentAuthUser } from "../auth/authorization";
import { AUDIT_ACTIONS } from "../audit/service";
import { internal } from "../_generated/api";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Maximum file size for uploads (10MB) */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Allowed MIME types for POD files */
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

/** Maximum evidence files per POD. Mirrors the Driver App picker cap. */
const MAX_FILES_PER_POD = 5;

const TERMINAL_DELIVERY_STATUSES = new Set([
  DELIVERY_STATUS.DELIVERED,
  DELIVERY_STATUS.FAILED,
  DELIVERY_STATUS.CANCELLED,
]);

/**
 * Validate optional handover coordinates. Latitude/longitude must be supplied
 * together, stay inside the valid geographic range, and use a sane accuracy.
 * Absence is allowed: a device may deny location permission, and that must not
 * block a valid handover.
 */
function validatePODLocation(
  latitude?: number,
  longitude?: number,
  accuracy?: number,
): void {
  if (latitude === undefined && longitude === undefined) {
    if (accuracy !== undefined) {
      throw new Error("Location accuracy requires a latitude and longitude");
    }
    return;
  }
  if (latitude === undefined || longitude === undefined) {
    throw new Error("Latitude and longitude must be supplied together");
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("Location coordinates must be finite numbers");
  }
  if (latitude < -90 || latitude > 90) {
    throw new Error("Latitude must be between -90 and 90");
  }
  if (longitude < -180 || longitude > 180) {
    throw new Error("Longitude must be between -180 and 180");
  }
  if (
    accuracy !== undefined &&
    (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100_000)
  ) {
    throw new Error("Location accuracy must be between 0 and 100000 metres");
  }
}

/**
 * Load evidence with short-lived, authorized storage URLs. The POD query has
 * already checked delivery ownership before this helper is called; storage IDs
 * themselves are never returned as the customer-facing download path.
 */
async function loadPODFiles(
  ctx: QueryCtx,
  podId: Id<"proof_of_delivery">,
) {
  const files = await ctx.db
    .query("pod_files")
    .withIndex("by_pod", (q) => q.eq("podId", podId))
    .collect();

  const withUrls = await Promise.all(
    files.map(async (file) => {
      let url: string | null = null;
      try {
        url = await ctx.storage.getUrl(file.fileId as Id<"_storage">);
      } catch {
        // An orphaned storage object must not make the whole POD unreadable.
        // The UI shows the file as unavailable instead.
        url = null;
      }
      return { ...file, url };
    }),
  );

  const rank: Record<string, number> = { signature: 0, photo: 1, document: 2 };
  return withUrls.sort(
    (a, b) =>
      (rank[a.fileType] ?? 3) - (rank[b.fileType] ?? 3) ||
      a.createdAt - b.createdAt,
  );
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Get POD for a delivery.
 */
export const getPODForDelivery = query({
  args: { deliveryId: v.id("deliveries") },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    // Get the delivery to verify access
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // Check access
    if (!(await canAccessPOD(ctx, user, delivery))) {
      throw new Error("Access denied");
    }

    // Get POD
    const pod = await ctx.db
      .query("proof_of_delivery")
      .withIndex("by_delivery", (q) => q.eq("deliveryId", args.deliveryId))
      .order("desc")
      .first();

    if (!pod) return null;

    const files = await loadPODFiles(ctx, pod._id);
    return { ...pod, files };
  },
});

/**
 * Get POD by ID.
 */
export const getPOD = query({
  args: { podId: v.id("proof_of_delivery") },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    const pod = await ctx.db.get(args.podId);
    if (!pod) throw new Error("POD not found");

    // Get delivery to verify access
    const delivery = await ctx.db.get(pod.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    if (!(await canAccessPOD(ctx, user, delivery))) {
      throw new Error("Access denied");
    }

    const files = await loadPODFiles(ctx, pod._id);
    return { ...pod, files };
  },
});

/**
 * Get all PODs for a user's deliveries.
 */
export const getMyPODs = query({
  args: {
    outcome: v.optional(v.union(v.literal("delivered"), v.literal("partial"), v.literal("failed"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    let query = ctx.db
      .query("proof_of_delivery")
      .withIndex("by_submitter", (q) => q.eq("submittedBy", user.userId));

    if (args.outcome) {
      query = query.filter((q) => q.eq(q.field("outcome"), args.outcome));
    }

    const pods = await query.order("desc").take(args.limit ?? 50);
    return pods;
  },
});

// ─── Mutations ────────────────────────────────────────────────────────────────

/**
 * Create a POD record for a delivery.
 * This is the primary entry point for POD creation.
 */
export const createPOD = mutation({
  args: {
    deliveryId: v.id("deliveries"),
    outcome: v.union(v.literal("delivered"), v.literal("partial"), v.literal("failed")),
    recipientName: v.string(),
    recipientPhone: v.optional(v.string()),
    deliveryNotes: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    locationAccuracy: v.optional(v.number()),
    failureReason: v.optional(v.union(
      v.literal("recipient_unavailable"),
      v.literal("incorrect_address"),
      v.literal("refused_delivery"),
      v.literal("damaged_goods"),
      v.literal("missing_goods"),
      v.literal("vehicle_problem"),
      v.literal("safety_issue"),
      v.literal("other"),
    )),
    failureNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("User not found");

    // Get delivery
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // Validate authorization (company admins are scoped to their own company;
    // they must not be able to create PODs on another business's delivery).
    if (!(await canManagePOD(ctx, user, delivery))) {
      throw new Error("Access denied: cannot create POD for this delivery");
    }

    // Validate delivery state
    const validStates = [
      DELIVERY_STATUS.AT_DROPOFF,
      DELIVERY_STATUS.IN_TRANSIT,
      DELIVERY_STATUS.AT_PICKUP,
      DELIVERY_STATUS.PICKED_UP,
    ];

    if (!validStates.includes(delivery.status as any)) {
      throw new Error(
        `Cannot create POD: delivery is in "${delivery.status}" state`
      );
    }

    // Idempotency check
    const idempotencyKey = `pod-${args.deliveryId}-${userId}`;
    const existing = await ctx.db
      .query("proof_of_delivery")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();

    if (existing) {
      return { podId: existing._id, alreadyExists: true };
    }

    // Validate failure outcome has reason
    if (args.outcome === "failed" && !args.failureReason) {
      throw new Error("Failure reason is required for failed deliveries");
    }

    const recipientName = args.recipientName.trim();
    if (!recipientName) {
      throw new Error("Recipient name is required for proof of delivery");
    }
    validatePODLocation(args.latitude, args.longitude, args.locationAccuracy);

    const now = Date.now();

    // Create POD
    const podId = await ctx.db.insert("proof_of_delivery", {
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      submittedBy: userId,
      outcome: args.outcome,
      recipientName: recipientName.slice(0, 200),
      recipientPhone: args.recipientPhone?.trim().slice(0, 40),
      deliveryNotes: args.deliveryNotes?.trim().slice(0, 1000),
      latitude: args.latitude,
      longitude: args.longitude,
      locationAccuracy: args.locationAccuracy,
      deliveredAt: now,
      createdAt: now,
      updatedAt: now,
      failureReason: args.failureReason,
      failureNotes: args.failureNotes?.trim().slice(0, 1000),
      idempotencyKey,
    });

    // Record audit event
    await ctx.runMutation(internal.audit.service.recordPODEvent, {
      actorId: userId,
      actorRole: user.role,
      action: AUDIT_ACTIONS.POD_CREATED,
      deliveryId: args.deliveryId,
      entityId: podId,
      metadata: JSON.stringify({ outcome: args.outcome, recipientName: recipientName.slice(0, 200) }),
    });

    return { podId, alreadyExists: false };
  },
});

/**
 * Add file evidence to a POD.
 * Files are stored in Convex File Storage.
 */
export const addPODEvidence = mutation({
  args: {
    podId: v.id("proof_of_delivery"),
    fileId: v.string(),
    fileType: v.union(v.literal("photo"), v.literal("signature"), v.literal("document")),
    fileName: v.string(),
    fileSize: v.number(),
    mimeType: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("User not found");

    // Get POD
    const pod = await ctx.db.get(args.podId);
    if (!pod) throw new Error("POD not found");

    // Get delivery to verify access
    const delivery = await ctx.db.get(pod.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // Validate authorization
    if (!(await canManagePOD(ctx, user, delivery))) {
      throw new Error("Access denied: cannot add evidence to this POD");
    }

    // Evidence is immutable once the delivery is terminal. Without this gate a
    // driver could keep attaching files to a completed/failed/cancelled POD.
    if (TERMINAL_DELIVERY_STATUSES.has(delivery.status as any)) {
      throw new Error("Cannot add evidence to a completed delivery");
    }

    // Validate file against the ACTUAL stored object, not client-supplied
    // size/type claims. The client used to be trusted for both, which allowed
    // an enormous or non-image file to be recorded as valid evidence.
    const storageId = args.fileId as Id<"_storage">;
    const metadata = await ctx.storage.getMetadata(storageId);
    if (!metadata) {
      throw new Error("Uploaded file was not found — please upload it again");
    }

    const fileSize = metadata.size;
    const mimeType = metadata.contentType ?? "";
    if (typeof fileSize !== "number" || fileSize <= 0) {
      throw new Error("Uploaded file is empty or has no size");
    }
    if (fileSize > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new Error(`File type ${mimeType || "unknown"} is not allowed`);
    }
    if (args.fileType !== "document" && !mimeType.startsWith("image/")) {
      throw new Error("Photos and signatures must be image files");
    }

    const existingFiles = await ctx.db
      .query("pod_files")
      .withIndex("by_pod", (q) => q.eq("podId", args.podId))
      .collect();
    // Make retries safe: a driver whose submission failed after the first
    // file was stored must be able to retry the same POD without the earlier
    // evidence blocking every subsequent attempt.
    const existingFile = existingFiles.find(
      (file) => file.fileId === args.fileId
    );
    if (existingFile) {
      // A retry of an already-linked signature should also repair the
      // denormalized pointer on legacy POD records.
      if (args.fileType === "signature" && pod.recipientSignatureId !== args.fileId) {
        await ctx.db.patch(args.podId, {
          recipientSignatureId: args.fileId,
          updatedAt: Date.now(),
        });
      }
      return { fileId: existingFile._id };
    }
    if (existingFiles.length >= MAX_FILES_PER_POD) {
      throw new Error(`A proof of delivery can have at most ${MAX_FILES_PER_POD} files`);
    }

    const fileName = args.fileName.trim().slice(0, 200) || "evidence";

    if (args.fileType === "signature") {
      const existingSignature = existingFiles.find(
        (file) => file.fileType === "signature",
      );
      if (existingSignature && existingSignature.fileId !== args.fileId) {
        throw new Error("A proof of delivery can only have one signature");
      }
    }

    // Create file record using the storage metadata as the source of truth.
    const fileId = await ctx.db.insert("pod_files", {
      podId: args.podId,
      deliveryId: pod.deliveryId,
      fileId: args.fileId,
      fileType: args.fileType,
      fileName,
      fileSize,
      mimeType,
      description: args.description?.trim().slice(0, 500),
      uploadedBy: userId,
      createdAt: Date.now(),
    });

    // Keep the denormalized signature pointer in sync. Older PODs may have the
    // signature only in pod_files, so readers always resolve by fileType too.
    await ctx.db.patch(args.podId, {
      updatedAt: Date.now(),
      ...(args.fileType === "signature"
        ? { recipientSignatureId: args.fileId }
        : {}),
    });

    // Record audit event
    await ctx.runMutation(internal.audit.service.recordPODEvent, {
      actorId: userId,
      actorRole: user.role,
      action: AUDIT_ACTIONS.POD_EVIDENCE_ADDED,
      deliveryId: pod.deliveryId,
      entityId: args.podId,
      metadata: JSON.stringify({ fileType: args.fileType, fileName, fileSize, mimeType }),
    });

    return { fileId };
  },
});

/**
 * Complete delivery with POD.
 * This is the atomic operation that creates POD and transitions delivery state.
 */
export const completeDeliveryWithPOD = mutation({
  args: {
    deliveryId: v.id("deliveries"),
    recipientName: v.string(),
    recipientPhone: v.optional(v.string()),
    deliveryNotes: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    locationAccuracy: v.optional(v.number()),
    signatureFileId: v.optional(v.string()),
    photoFileIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("User not found");

    // Get delivery
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // Validate authorization
    if (!(await canManagePOD(ctx, user, delivery))) {
      throw new Error("Access denied: cannot complete this delivery");
    }

    // Idempotency check BEFORE the state check: retrying after a committed
    // completion (lost response) must return the existing POD, not fail
    // because the delivery is no longer at_dropoff.
    const idempotencyKey = `pod-complete-${args.deliveryId}`;
    const existingPOD = await ctx.db
      .query("proof_of_delivery")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();

    if (existingPOD) {
      return { podId: existingPOD._id, deliveryId: args.deliveryId, alreadyExists: true };
    }

    // Validate delivery state
    if (delivery.status !== DELIVERY_STATUS.AT_DROPOFF) {
      throw new Error(
        `Cannot complete delivery: delivery is in "${delivery.status}" state, expected "at_dropoff"`
      );
    }

    const recipientName = args.recipientName.trim();
    if (!recipientName) {
      throw new Error("Recipient name is required for proof of delivery");
    }

    // Validate every evidence id against the ACTUAL storage object. This path
    // inserts pod_files directly (bypassing addPODEvidence), so without these
    // checks a client could attach arbitrary storage ids or unvalidated files.
    const evidenceIds = [
      ...(args.signatureFileId ? [args.signatureFileId] : []),
      ...(args.photoFileIds ?? []),
    ];
    if (evidenceIds.length > MAX_FILES_PER_POD) {
      throw new Error(`A proof of delivery can have at most ${MAX_FILES_PER_POD} files`);
    }
    if (new Set(evidenceIds).size !== evidenceIds.length) {
      throw new Error("The same proof file cannot be attached twice");
    }
    if (evidenceIds.length === 0) {
      throw new Error(
        "At least one recipient signature or delivery photo is required for proof of delivery",
      );
    }
    validatePODLocation(args.latitude, args.longitude, args.locationAccuracy);
    const evidenceMetadata = new Map<
      string,
      { size: number; contentType: string | null }
    >();
    for (const storageId of evidenceIds) {
      const metadata = await ctx.storage.getMetadata(storageId as Id<"_storage">);
      if (!metadata) {
        throw new Error("An uploaded proof file was not found — please upload it again");
      }
      const contentType = metadata.contentType ?? "";
      if (metadata.size <= 0 || metadata.size > MAX_FILE_SIZE) {
        throw new Error(`Proof files must be non-empty and smaller than ${MAX_FILE_SIZE / 1024 / 1024}MB`);
      }
      if (!ALLOWED_MIME_TYPES.includes(contentType)) {
        throw new Error(`File type ${contentType || "unknown"} is not allowed`);
      }
      if (!contentType.startsWith("image/")) {
        throw new Error("Signature and photo evidence must be image files");
      }
      evidenceMetadata.set(storageId, {
        size: metadata.size,
        contentType,
      });
    }

    const now = Date.now();

    // Create POD
    const podId = await ctx.db.insert("proof_of_delivery", {
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      submittedBy: userId,
      outcome: "delivered",
      recipientName: recipientName.slice(0, 200),
      recipientPhone: args.recipientPhone?.trim().slice(0, 40),
      recipientSignatureId: args.signatureFileId,
      deliveryNotes: args.deliveryNotes?.trim().slice(0, 1000),
      latitude: args.latitude,
      longitude: args.longitude,
      locationAccuracy: args.locationAccuracy,
      deliveredAt: now,
      createdAt: now,
      updatedAt: now,
      idempotencyKey,
    });

    // Add signature file if provided
    if (args.signatureFileId) {
      const meta = evidenceMetadata.get(args.signatureFileId)!;
      await ctx.db.insert("pod_files", {
        podId,
        deliveryId: args.deliveryId,
        fileId: args.signatureFileId,
        fileType: "signature",
        fileName: "signature",
        fileSize: meta.size,
        mimeType: meta.contentType ?? "image/png",
        uploadedBy: userId,
        createdAt: now,
      });
    }

    // Add photo files if provided
    if (args.photoFileIds) {
      for (const photoId of args.photoFileIds) {
        const meta = evidenceMetadata.get(photoId)!;
        await ctx.db.insert("pod_files", {
          podId,
          deliveryId: args.deliveryId,
          fileId: photoId,
          fileType: "photo",
          fileName: "delivery-photo",
          fileSize: meta.size,
          mimeType: meta.contentType ?? "image/jpeg",
          uploadedBy: userId,
          createdAt: now,
        });
      }
    }

    // Transition delivery to DELIVERED
    await ctx.db.patch(args.deliveryId, {
      status: DELIVERY_STATUS.DELIVERED,
      completedAt: now,
      actualArrival: now,
    });

    // Update order status
    await ctx.db.patch(delivery.orderId, {
      status: "delivered",
      updatedAt: now,
    });

    // Record tracking event
    await ctx.db.insert("tracking_events", {
      deliveryId: args.deliveryId,
      type: "delivered",
      lat: args.latitude,
      lng: args.longitude,
      timestamp: now,
      metadata: JSON.stringify({
        action: "delivery_completed",
        podId,
        recipientName: recipientName.slice(0, 200),
      }),
    });

    // Record audit event
    await ctx.runMutation(internal.audit.service.recordPODEvent, {
      actorId: userId,
      actorRole: user.role,
      action: AUDIT_ACTIONS.POD_COMPLETED,
      deliveryId: args.deliveryId,
      entityId: podId,
      metadata: JSON.stringify({ recipientName: recipientName.slice(0, 200), hasSignature: !!args.signatureFileId, photoCount: args.photoFileIds?.length ?? 0 }),
    });

    // Create the driver settlement (POD validation → completion → settlement).
    // Runs inside the same mutation transaction: a settlement failure fails
    // the POD-completion (never an apparently-completed delivery with missing
    // financial records), and the deterministic settlement-${deliveryId} key
    // makes retries safe. The driver is the delivery's authoritative assigned
    // courier — never a client-supplied ID.
    if (delivery.courierId) {
      await ctx.runMutation(internal.pricing.service.createSettlement, {
        deliveryId: args.deliveryId,
        orderId: delivery.orderId,
        driverId: delivery.courierId,
      });

      // This completion path must maintain the same driver performance metrics
      // as state_machine.completeDelivery; otherwise the Operations roster and
      // dispatch scoring under-report trips for POD-completed deliveries.
      const courierProfile = await ctx.db
        .query("driver_profiles")
        .withIndex("by_user", (q) => q.eq("userId", delivery.courierId!))
        .unique();
      if (courierProfile) {
        await ctx.db.patch(courierProfile._id, {
          totalTrips: (courierProfile.totalTrips ?? 0) + 1,
        });
      }
    }

    // Notify the customer their delivery is complete (authoritative sender
    // recipient, idempotent per (event, delivery, user)).
    const order = await ctx.db.get(delivery.orderId);
    if (order?.senderId) {
      await ctx.runMutation(internal.notifications.service.sendDeliveryNotification, {
        deliveryId: args.deliveryId,
        eventType: "delivery_completed",
        recipientUserIds: [order.senderId],
      });
    }

    return { podId, deliveryId: args.deliveryId, alreadyExists: false };
  },
});

/**
 * Record a failed delivery with POD.
 */
export const recordFailedDelivery = mutation({
  args: {
    deliveryId: v.id("deliveries"),
    failureReason: v.union(
      v.literal("recipient_unavailable"),
      v.literal("incorrect_address"),
      v.literal("refused_delivery"),
      v.literal("damaged_goods"),
      v.literal("missing_goods"),
      v.literal("vehicle_problem"),
      v.literal("safety_issue"),
      v.literal("other"),
    ),
    failureNotes: v.optional(v.string()),
    recipientName: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    photoFileIds: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("User not found");

    // Get delivery
    const delivery = await ctx.db.get(args.deliveryId);
    if (!delivery) throw new Error("Delivery not found");

    // Validate authorization
    if (!(await canManagePOD(ctx, user, delivery))) {
      throw new Error("Access denied: cannot record failure for this delivery");
    }

    // Idempotency check BEFORE the state check: if the first request committed
    // and only the response was lost, a retry must return the existing failure
    // rather than reporting that a failed delivery cannot be failed.
    const idempotencyKey = `pod-fail-${args.deliveryId}`;
    const existingPOD = await ctx.db
      .query("proof_of_delivery")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();

    if (existingPOD) {
      return { podId: existingPOD._id, alreadyExists: true };
    }

    // Validate delivery state
    const failableStates = [
      DELIVERY_STATUS.AT_DROPOFF,
      DELIVERY_STATUS.IN_TRANSIT,
      DELIVERY_STATUS.AT_PICKUP,
      DELIVERY_STATUS.PICKED_UP,
    ];

    if (!failableStates.includes(delivery.status as any)) {
      throw new Error(
        `Cannot record failure: delivery is in "${delivery.status}" state`
      );
    }

    validatePODLocation(args.latitude, args.longitude);

    // Validate any failure photos against real storage metadata. This mutation
    // accepts file IDs from the client, so it must not let a caller attach
    // arbitrary IDs or fabricate file sizes/MIME types.
    const failurePhotoIds = args.photoFileIds ?? [];
    if (failurePhotoIds.length > MAX_FILES_PER_POD) {
      throw new Error(
        `Too many failure photos (max ${MAX_FILES_PER_POD})`
      );
    }
    if (new Set(failurePhotoIds).size !== failurePhotoIds.length) {
      throw new Error("Duplicate failure photo files are not allowed");
    }
    const failurePhotos: {
      fileId: string;
      fileSize: number;
      mimeType: string;
    }[] = [];
    for (const photoId of failurePhotoIds) {
      const metadata = await ctx.storage.getMetadata(
        photoId as Id<"_storage">
      );
      if (!metadata || metadata.size === 0) {
        throw new Error("Failure photo file is missing or empty");
      }
      if (metadata.size > MAX_FILE_SIZE) {
        throw new Error(
          `Failure photo exceeds the ${MAX_FILE_SIZE / (1024 * 1024)}MB limit`
        );
      }
      const contentType = metadata.contentType;
      if (!contentType?.startsWith("image/")) {
        throw new Error("Failure photos must be images");
      }
      failurePhotos.push({
        fileId: photoId,
        fileSize: metadata.size,
        mimeType: contentType,
      });
    }

    const now = Date.now();

    // Create POD with failure outcome
    const podId = await ctx.db.insert("proof_of_delivery", {
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      submittedBy: userId,
      outcome: "failed",
      recipientName: (args.recipientName?.trim() || "N/A").slice(0, 200),
      latitude: args.latitude,
      longitude: args.longitude,
      deliveredAt: now,
      createdAt: now,
      updatedAt: now,
      failureReason: args.failureReason,
      failureNotes: args.failureNotes?.trim().slice(0, 1000),
      idempotencyKey,
    });

    // Add validated photo files
    for (const photo of failurePhotos) {
      await ctx.db.insert("pod_files", {
        podId,
        deliveryId: args.deliveryId,
        fileId: photo.fileId,
        fileType: "photo",
        fileName: "failure-photo",
        fileSize: photo.fileSize,
        mimeType: photo.mimeType,
        uploadedBy: userId,
        createdAt: now,
      });
    }

    // Transition delivery to FAILED
    await ctx.db.patch(args.deliveryId, {
      status: DELIVERY_STATUS.FAILED,
      completedAt: now,
    });

    // Update order status
    await ctx.db.patch(delivery.orderId, {
      status: "cancelled",
      updatedAt: now,
    });

    // Record tracking event
    await ctx.db.insert("tracking_events", {
      deliveryId: args.deliveryId,
      type: "failed",
      lat: args.latitude,
      lng: args.longitude,
      timestamp: now,
      metadata: JSON.stringify({
        action: "delivery_failed",
        podId,
        failureReason: args.failureReason,
      }),
    });

    // Record audit event
    await ctx.runMutation(internal.audit.service.recordPODEvent, {
      actorId: userId,
      actorRole: user.role,
      action: AUDIT_ACTIONS.POD_FAILED,
      deliveryId: args.deliveryId,
      entityId: podId,
      metadata: JSON.stringify({ failureReason: args.failureReason, failureNotes: args.failureNotes }),
    });

    // A failed delivery is customer-facing news. The state-machine failure
    // path already notifies the sender; this POD path used to change the
    // order/delivery status silently, leaving the customer waiting.
    const order = await ctx.db.get(delivery.orderId);
    if (order?.senderId) {
      await ctx.runMutation(internal.notifications.service.sendDeliveryNotification, {
        deliveryId: args.deliveryId,
        eventType: "delivery_failed",
        recipientUserIds: [order.senderId],
        templateData: {
          reason: args.failureNotes?.trim() || args.failureReason.replace(/_/g, " "),
        },
      });
    }

    return { podId, alreadyExists: false };
  },
});

// ─── File Storage Actions ────────────────────────────────────────────────────

/**
 * Generate upload URL for POD files.
 *
 * This was previously an unauthenticated action: any anonymous caller could
 * mint Convex file-storage upload URLs and use the deployment as free storage.
 * It is now a mutation so the caller can be authenticated and authorized
 * before a URL is issued (same pattern as driver KYC uploads).
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");
    const allowedRoles: readonly string[] = [
      ROLES.DRIVER,
      ROLES.OPERATIONS,
      ROLES.COMPANY_ADMIN,
      ROLES.SUPER_ADMIN,
    ];
    if (!user.role || !allowedRoles.includes(user.role)) {
      throw new Error("Access denied: cannot upload proof of delivery");
    }
    return await ctx.storage.generateUploadUrl();
  },
});

// ─── Internal Mutations ──────────────────────────────────────────────────────

/**
 * Internal: Create POD (for use by other Convex functions).
 */
export const createPODInternal = internalMutation({
  args: {
    deliveryId: v.id("deliveries"),
    orderId: v.id("orders"),
    submittedBy: v.id("users"),
    outcome: v.union(v.literal("delivered"), v.literal("partial"), v.literal("failed")),
    recipientName: v.string(),
    recipientPhone: v.optional(v.string()),
    deliveryNotes: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    failureReason: v.optional(v.string()),
    failureNotes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const idempotencyKey = `pod-internal-${args.deliveryId}-${now}`;

    const podId = await ctx.db.insert("proof_of_delivery", {
      deliveryId: args.deliveryId,
      orderId: args.orderId,
      submittedBy: args.submittedBy,
      outcome: args.outcome,
      recipientName: args.recipientName,
      recipientPhone: args.recipientPhone,
      deliveryNotes: args.deliveryNotes,
      latitude: args.latitude,
      longitude: args.longitude,
      deliveredAt: now,
      createdAt: now,
      updatedAt: now,
      failureReason: args.failureReason as any,
      failureNotes: args.failureNotes,
      idempotencyKey,
    });

    return { podId };
  },
});

// ─── Authorization Helpers ────────────────────────────────────────────────────

/**
 * Server-side POD access authorization.
 *
 * Ownership is resolved through the delivery's order (the authoritative
 * customer/business record) — never from client-supplied identity. Mirrors the
 * ownership rules of deliveries/state_machine.getDelivery and
 * tracking/queries.authorizeTrackingAccess:
 *   - SUPER_ADMIN / OPERATIONS: any delivery
 *   - DRIVER: only their assigned deliveries
 *   - COMPANY_ADMIN: only deliveries whose order belongs to their company
 *     (fails closed when the admin has no company association)
 *   - CUSTOMER: only deliveries whose order they sent
 */
async function canAccessPOD(
  ctx: QueryCtx | MutationCtx,
  user: AuthUser,
  delivery: Doc<"deliveries">,
): Promise<boolean> {
  // Super admin and operations can access all
  if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.OPERATIONS) {
    return true;
  }

  // Driver can access their assigned deliveries
  if (user.role === ROLES.DRIVER && delivery.courierId === user.userId) {
    return true;
  }

  // Company admin can access company deliveries via the order's business
  if (user.role === ROLES.COMPANY_ADMIN) {
    if (!user.businessId) return false;
    const order = await ctx.db.get(delivery.orderId);
    return !!order && order.businessId === user.businessId;
  }

  // Customer can access their own deliveries via the order's sender
  if (user.role === ROLES.CUSTOMER) {
    const order = await ctx.db.get(delivery.orderId);
    return !!order && order.senderId === user.userId;
  }

  return false;
}

/**
 * POD creation/evidence/completion authorization.
 *
 * This is deliberately the same ownership rule as canAccessPOD: drivers only
 * their assigned delivery, operations/super_admin any delivery, and company
 * admins ONLY deliveries belonging to their own company (fail closed when the
 * admin has no company association). The previous synchronous helper let any
 * company admin create/complete a POD for another company's delivery.
 */
async function canManagePOD(
  ctx: QueryCtx | MutationCtx,
  user: AuthUser,
  delivery: Doc<"deliveries">,
): Promise<boolean> {
  if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.OPERATIONS) {
    return true;
  }

  if (user.role === ROLES.DRIVER) {
    return delivery.courierId === user.userId;
  }

  if (user.role === ROLES.COMPANY_ADMIN) {
    if (!user.businessId) return false;
    const order = await ctx.db.get(delivery.orderId);
    return !!order && order.businessId === user.businessId;
  }

  return false;
}

type AuthUser = {
  userId: Id<"users">;
  role: string;
  businessId?: Id<"businesses">;
};
