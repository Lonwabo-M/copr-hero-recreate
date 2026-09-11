/**
 * Lasha Business Profile Mutations
 *
 * Business profile updates for the Settings > Business tab.
 *
 * Security model:
 * - The business to update is resolved from the authenticated user's
 *   businessId (or business ownership) — never from client-provided IDs.
 * - Only name, phone, address and registrationNumber are accepted.
 *   ownerUserId, createdAt, and industry are not client-editable.
 * - Authorization: the actor must be the business owner, a company admin of
 *   that business, a super admin, or operations (mirroring requireOwnership).
 * - Changes are recorded in the audit log (company.updated).
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { requireAuth, getCurrentAuthUser } from "../auth/authorization";
import { ROLES } from "../schema";
import { AUDIT_ACTIONS } from "../audit/service";
import {
  validateBusinessName,
  validatePhone,
  validateOptionalText,
  BUSINESS_ADDRESS_MAX_LENGTH,
  BUSINESS_REGISTRATION_MAX_LENGTH,
} from "./profileValidation";

/**
 * Get the business record for the authenticated user (or null if none).
 * Used by the Settings > Business tab to display current values.
 */
export const getMyBusiness = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const user = await getCurrentAuthUser(ctx);
    if (!user?.businessId) {
      return null;
    }
    return await ctx.db.get(user.businessId);
  },
});

export const updateMyBusiness = mutation({
  args: {
    name: v.optional(v.string()),
    phone: v.optional(v.string()),
    address: v.optional(v.string()),
    registrationNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await getCurrentAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    // Resolve the business from the session user — no client-provided IDs.
    if (!user.businessId) {
      throw new Error("No business associated with this account");
    }
    const business = await ctx.db.get(user.businessId);
    if (!business) {
      throw new Error("Business not found");
    }

    // Authorization: owner, company admin of this business, super admin, or operations.
    const role = user.role ?? ROLES.CUSTOMER;
    const isOwner = business.ownerUserId === userId;
    const isCompanyAdmin =
      role === ROLES.COMPANY_ADMIN && user.businessId === business._id;
    const isSuperAdmin = role === ROLES.SUPER_ADMIN;
    const isOperations = role === ROLES.OPERATIONS;
    if (!isOwner && !isCompanyAdmin && !isSuperAdmin && !isOperations) {
      throw new Error("Access denied: not authorized to update this business");
    }

    // Server-side validation of the permitted fields
    if (args.name !== undefined) {
      const nameError = validateBusinessName(args.name);
      if (nameError) throw new Error(nameError);
    }
    if (args.phone !== undefined) {
      const phoneError = validatePhone(args.phone);
      if (phoneError) throw new Error(phoneError);
    }
    if (args.address !== undefined) {
      const addressError = validateOptionalText(
        args.address,
        "Business address",
        BUSINESS_ADDRESS_MAX_LENGTH
      );
      if (addressError) throw new Error(addressError);
    }
    if (args.registrationNumber !== undefined) {
      const regError = validateOptionalText(
        args.registrationNumber,
        "Registration number",
        BUSINESS_REGISTRATION_MAX_LENGTH
      );
      if (regError) throw new Error(regError);
    }

    // Build the patch from the whitelisted fields only
    const patch: {
      name?: string;
      phone?: string;
      address?: string;
      registrationNumber?: string;
    } = {};
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.phone !== undefined) {
      patch.phone = args.phone.trim() === "" ? undefined : args.phone.trim();
    }
    if (args.address !== undefined) {
      patch.address = args.address.trim() === "" ? undefined : args.address.trim();
    }
    if (args.registrationNumber !== undefined) {
      patch.registrationNumber =
        args.registrationNumber.trim() === "" ? undefined : args.registrationNumber.trim();
    }

    const changed = Object.keys(patch);
    if (changed.length === 0) {
      return { success: true, updated: [] };
    }

    const before = JSON.stringify({
      name: business.name,
      phone: business.phone ?? null,
      address: business.address ?? null,
      registrationNumber: business.registrationNumber ?? null,
    });

    await ctx.db.patch(business._id, patch);

    const after = JSON.stringify({
      name: patch.name ?? business.name,
      phone: patch.phone ?? null,
      address: patch.address ?? null,
      registrationNumber: patch.registrationNumber ?? null,
    });

    // Audit: record who changed the business profile and what changed
    await ctx.runMutation(internal.audit.service.recordGenericEvent, {
      actorId: userId,
      actorRole: role,
      category: "company",
      action: AUDIT_ACTIONS.COMPANY_UPDATED,
      entityType: "businesses",
      entityId: business._id,
      before,
      after,
      metadata: JSON.stringify({ fields: changed }),
    });

    return { success: true, updated: changed };
  },
});
