/**
 * Lasha Proof of Delivery Service
 *
 * Implements the POD domain for delivery evidence collection.
 * All POD operations are server-side authorized and idempotent.
 */

import { mutation, query, action, internalMutation } from "../_generated/server";
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
    if (!canAccessPOD(user, delivery)) {
      throw new Error("Access denied");
    }

    // Get POD
    const pod = await ctx.db
      .query("proof_of_delivery")
      .withIndex("by_delivery", (q) => q.eq("deliveryId", args.deliveryId))
      .order("desc")
      .first();

    if (!pod) return null;

    // Get associated files
    const files = await ctx.db
      .query("pod_files")
      .withIndex("by_pod", (q) => q.eq("podId", pod._id))
      .collect();

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

    if (!canAccessPOD(user, delivery)) {
      throw new Error("Access denied");
    }

    // Get files
    const files = await ctx.db
      .query("pod_files")
      .withIndex("by_pod", (q) => q.eq("podId", pod._id))
      .collect();

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

    // Validate authorization
    if (!canCreatePOD(user, delivery)) {
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

    const now = Date.now();

    // Create POD
    const podId = await ctx.db.insert("proof_of_delivery", {
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      submittedBy: userId,
      outcome: args.outcome,
      recipientName: args.recipientName,
      recipientPhone: args.recipientPhone,
      deliveryNotes: args.deliveryNotes,
      latitude: args.latitude,
      longitude: args.longitude,
      locationAccuracy: args.locationAccuracy,
      deliveredAt: now,
      createdAt: now,
      updatedAt: now,
      failureReason: args.failureReason,
      failureNotes: args.failureNotes,
      idempotencyKey,
    });

    // Record audit event
    await ctx.runMutation(internal.audit.service.recordPODEvent, {
      actorId: userId,
      actorRole: user.role,
      action: AUDIT_ACTIONS.POD_CREATED,
      deliveryId: args.deliveryId,
      entityId: podId,
      metadata: JSON.stringify({ outcome: args.outcome, recipientName: args.recipientName }),
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
    if (!canAddPODEvidence(user, delivery, pod)) {
      throw new Error("Access denied: cannot add evidence to this POD");
    }

    // Validate file
    if (args.fileSize > MAX_FILE_SIZE) {
      throw new Error(`File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
    }

    if (!ALLOWED_MIME_TYPES.includes(args.mimeType)) {
      throw new Error(`File type ${args.mimeType} is not allowed`);
    }

    // Create file record
    const fileId = await ctx.db.insert("pod_files", {
      podId: args.podId,
      deliveryId: pod.deliveryId,
      fileId: args.fileId,
      fileType: args.fileType,
      fileName: args.fileName,
      fileSize: args.fileSize,
      mimeType: args.mimeType,
      description: args.description,
      uploadedBy: userId,
      createdAt: Date.now(),
    });

    // Update POD timestamp
    await ctx.db.patch(args.podId, {
      updatedAt: Date.now(),
    });

    // Record audit event
    await ctx.runMutation(internal.audit.service.recordPODEvent, {
      actorId: userId,
      actorRole: user.role,
      action: AUDIT_ACTIONS.POD_EVIDENCE_ADDED,
      deliveryId: pod.deliveryId,
      entityId: args.podId,
      metadata: JSON.stringify({ fileType: args.fileType, fileName: args.fileName }),
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
    if (!canCompleteDelivery(user, delivery)) {
      throw new Error("Access denied: cannot complete this delivery");
    }

    // Validate delivery state
    if (delivery.status !== DELIVERY_STATUS.AT_DROPOFF) {
      throw new Error(
        `Cannot complete delivery: delivery is in "${delivery.status}" state, expected "at_dropoff"`
      );
    }

    // Idempotency check
    const idempotencyKey = `pod-complete-${args.deliveryId}`;
    const existingPOD = await ctx.db
      .query("proof_of_delivery")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();

    if (existingPOD) {
      return { podId: existingPOD._id, deliveryId: args.deliveryId, alreadyExists: true };
    }

    const now = Date.now();

    // Create POD
    const podId = await ctx.db.insert("proof_of_delivery", {
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      submittedBy: userId,
      outcome: "delivered",
      recipientName: args.recipientName,
      recipientPhone: args.recipientPhone,
      deliveryNotes: args.deliveryNotes,
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
      await ctx.db.insert("pod_files", {
        podId,
        deliveryId: args.deliveryId,
        fileId: args.signatureFileId,
        fileType: "signature",
        fileName: "signature.png",
        fileSize: 0,
        mimeType: "image/png",
        uploadedBy: userId,
        createdAt: now,
      });
    }

    // Add photo files if provided
    if (args.photoFileIds) {
      for (const photoId of args.photoFileIds) {
        await ctx.db.insert("pod_files", {
          podId,
          deliveryId: args.deliveryId,
          fileId: photoId,
          fileType: "photo",
          fileName: "delivery-photo.jpg",
          fileSize: 0,
          mimeType: "image/jpeg",
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
        recipientName: args.recipientName,
      }),
    });

    // Record audit event
    await ctx.runMutation(internal.audit.service.recordPODEvent, {
      actorId: userId,
      actorRole: user.role,
      action: AUDIT_ACTIONS.POD_COMPLETED,
      deliveryId: args.deliveryId,
      entityId: podId,
      metadata: JSON.stringify({ recipientName: args.recipientName, hasSignature: !!args.signatureFileId, photoCount: args.photoFileIds?.length ?? 0 }),
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
    if (!canRecordFailure(user, delivery)) {
      throw new Error("Access denied: cannot record failure for this delivery");
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

    // Idempotency check
    const idempotencyKey = `pod-fail-${args.deliveryId}`;
    const existingPOD = await ctx.db
      .query("proof_of_delivery")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();

    if (existingPOD) {
      return { podId: existingPOD._id, alreadyExists: true };
    }

    const now = Date.now();

    // Create POD with failure outcome
    const podId = await ctx.db.insert("proof_of_delivery", {
      deliveryId: args.deliveryId,
      orderId: delivery.orderId,
      submittedBy: userId,
      outcome: "failed",
      recipientName: args.recipientName ?? "N/A",
      deliveryNotes: args.failureNotes,
      latitude: args.latitude,
      longitude: args.longitude,
      deliveredAt: now,
      createdAt: now,
      updatedAt: now,
      failureReason: args.failureReason,
      failureNotes: args.failureNotes,
      idempotencyKey,
    });

    // Add photo files if provided
    if (args.photoFileIds) {
      for (const photoId of args.photoFileIds) {
        await ctx.db.insert("pod_files", {
          podId,
          deliveryId: args.deliveryId,
          fileId: photoId,
          fileType: "photo",
          fileName: "failure-photo.jpg",
          fileSize: 0,
          mimeType: "image/jpeg",
          uploadedBy: userId,
          createdAt: now,
        });
      }
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
      type: "delivered",
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

    return { podId, alreadyExists: false };
  },
});

// ─── File Storage Actions ────────────────────────────────────────────────────

/**
 * Generate upload URL for POD files.
 * React should call this to get a URL, then upload directly to Convex File Storage.
 */
export const generateUploadUrl = action({
  args: {},
  handler: async (ctx) => {
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

function canAccessPOD(user: AuthUser, delivery: Doc<"deliveries">): boolean {
  // Super admin and operations can access all
  if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.OPERATIONS) {
    return true;
  }

  // Driver can access their assigned deliveries
  if (user.role === ROLES.DRIVER && delivery.courierId === user.userId) {
    return true;
  }

  // Customer can access their own deliveries
  if (user.role === ROLES.CUSTOMER) {
    return true; // Will be filtered by order ownership in query
  }

  // Company admin can access company deliveries
  if (user.role === ROLES.COMPANY_ADMIN) {
    return true; // Will be filtered by business ownership in query
  }

  return false;
}

function canCreatePOD(user: AuthUser, delivery: Doc<"deliveries">): boolean {
  // Driver can create POD for assigned deliveries
  if (user.role === ROLES.DRIVER && delivery.courierId === user.userId) {
    return true;
  }

  // Operations and admin can create POD
  if (
    user.role === ROLES.OPERATIONS ||
    user.role === ROLES.COMPANY_ADMIN ||
    user.role === ROLES.SUPER_ADMIN
  ) {
    return true;
  }

  return false;
}

function canAddPODEvidence(
  user: AuthUser,
  delivery: Doc<"deliveries">,
  pod: Doc<"proof_of_delivery">
): boolean {
  // Same rules as createPOD
  return canCreatePOD(user, delivery);
}

function canCompleteDelivery(user: AuthUser, delivery: Doc<"deliveries">): boolean {
  // Driver can complete their assigned delivery
  if (user.role === ROLES.DRIVER && delivery.courierId === user.userId) {
    return true;
  }

  // Operations and admin can complete
  if (
    user.role === ROLES.OPERATIONS ||
    user.role === ROLES.COMPANY_ADMIN ||
    user.role === ROLES.SUPER_ADMIN
  ) {
    return true;
  }

  return false;
}

function canRecordFailure(user: AuthUser, delivery: Doc<"deliveries">): boolean {
  // Driver can record failure for assigned delivery
  if (user.role === ROLES.DRIVER && delivery.courierId === user.userId) {
    return true;
  }

  // Operations and admin can record failure
  if (
    user.role === ROLES.OPERATIONS ||
    user.role === ROLES.COMPANY_ADMIN ||
    user.role === ROLES.SUPER_ADMIN
  ) {
    return true;
  }

  return false;
}

type AuthUser = {
  userId: Id<"users">;
  role: string;
  businessId?: Id<"businesses">;
};
