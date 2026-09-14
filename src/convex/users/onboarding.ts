/**
 * Customer Onboarding Backend
 *
 * Backend support for the Customer Onboarding flow (/onboarding/customer).
 *
 * Security model:
 * - Identity is ALWAYS the authenticated session user. No mutation or query
 *   here accepts a userId, businessId, customerId, or addressId from the
 *   client — a customer can only ever modify their own onboarding data.
 * - Only customers (or users whose role is not yet provisioned, which the
 *   authorization layer defaults to customer) may complete onboarding.
 *   Driver/operations/admin roles are denied.
 * - All input is validated server-side (shared validators from
 *   users/profileValidation.ts where they exist).
 * - Completion is atomic: user profile, business record, and default
 *   collection address are written in a single mutation. Any validation
 *   failure throws before the first write, so onboarding can never be
 *   half-saved or marked complete without its data.
 * - Completeness is DETERMINISTIC, derived from stored profile/business data
 *   (not a client-asserted flag, not localStorage):
 *     user.name && user.phone && linked business && default collection address
 *   Existing customers whose profiles already satisfy this check are never
 *   forced back through onboarding.
 * - Changes are recorded in the audit log (user.updated / company.created /
 *   company.updated) with context: customer_onboarding.
 */

import { mutation, query, QueryCtx, MutationCtx } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { requireAuth, getCurrentAuthUser } from "../auth/authorization";
import { Id, Doc } from "../_generated/dataModel";
import { ROLES, type Role } from "../schema";
import { AUDIT_ACTIONS } from "../audit/service";
import {
  validateName,
  validatePhone,
  validateBusinessName,
  validateOptionalText,
  BUSINESS_ADDRESS_MAX_LENGTH,
  BUSINESS_NAME_MAX_LENGTH,
  BUSINESS_REGISTRATION_MAX_LENGTH,
  NAME_MAX_LENGTH,
} from "./profileValidation";

// ─── Limits ───────────────────────────────────────────────────────────────────

const INDUSTRY_MAX_LENGTH = 60;
const ADDRESS_LABEL_MAX_LENGTH = 60;
const CITY_MAX_LENGTH = 100;
const STREET_MAX_LENGTH = 200;
const PROVINCE_MAX_LENGTH = 60;
const POSTAL_CODE_MAX_LENGTH = 12;

/** Longest non-empty string a field accepts, shared by before/after audit snapshots. */
function trim(value: string): string {
  return value.trim();
}

// ─── Validators (required variants for address fields) ───────────────────────

/** Required non-empty text with a length cap. Returns an error message or null. */
function validateRequiredText(value: string, label: string, maxLength: number): string | null {
  const t = trim(value);
  if (t.length === 0) return `${label} is required`;
  if (t.length > maxLength) return `${label} is too long (maximum ${maxLength} characters)`;
  return null;
}

/** Business industry is optional free text with a cap. */
function validateIndustry(value: string): string | null {
  return validateOptionalText(value, "Business type", INDUSTRY_MAX_LENGTH);
}

// ─── Completeness ─────────────────────────────────────────────────────────────

/**
 * Resolve the pieces of stored data the deterministic completeness check uses.
 * Shared by the status query (read path) so the definition cannot drift.
 */
async function resolveOnboardingData(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  const user = await ctx.db.get(userId);
  if (!user) return null;

  const business = user.businessId ? await ctx.db.get(user.businessId) : null;

  // The user's default collection address (isDefault). The addresses table
  // indexes by_user; a user's address list is small, so filter in memory.
  const addresses = await ctx.db
    .query("addresses")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const defaultAddress = addresses.find((a) => a.isDefault === true) ?? null;

  return { user, business, defaultAddress };
}

/**
 * Deterministic onboarding completeness: the customer has a name, a contact
 * phone, a linked business, and a default collection address.
 */
export function isOnboardingComplete(
  user: Pick<Doc<"users">, "name" | "phone" | "businessId">,
  business: Doc<"businesses"> | null,
  defaultAddress: Doc<"addresses"> | null
): boolean {
  return Boolean(
    user.name?.trim() && user.phone?.trim() && user.businessId && business && defaultAddress
  );
}

// ─── Status Query ─────────────────────────────────────────────────────────────

/**
 * Onboarding status for the authenticated user: whether onboarding is
 * complete (deterministic check) plus the stored values to prefill the form.
 *
 * Authorization: identity is the session user only. There is no client
 * argument that could select another user's data.
 */
export const getOnboardingStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const data = await resolveOnboardingData(ctx, userId);
    if (!data) {
      throw new Error("User not found");
    }
    const { user, business, defaultAddress } = data;

    return {
      complete: isOnboardingComplete(user, business, defaultAddress),
      user: {
        name: user.name ?? "",
        phone: user.phone ?? "",
        email: user.email ?? "",
      },
      business: business
        ? {
            name: business.name,
            industry: business.industry ?? "",
            phone: business.phone ?? "",
            address: business.address ?? "",
            registrationNumber: business.registrationNumber ?? "",
          }
        : null,
      defaultAddress: defaultAddress
        ? {
            label: defaultAddress.label,
            street: defaultAddress.street,
            city: defaultAddress.city,
            state: defaultAddress.state ?? "",
            zip: defaultAddress.zip,
          }
        : null,
    };
  },
});

// ─── Completion Mutation ──────────────────────────────────────────────────────

/**
 * Complete customer onboarding.
 *
 * Writes, atomically and in order:
 *  1. users: name, phone (whitelisted profile fields only)
 *  2. businesses: created (and linked via users.businessId) or updated when
 *     the user already has one — never a duplicate identity record
 *  3. addresses: the default collection point, created or updated in place
 *
 * Authorization: the actor is the session user; only customers/unprovisioned
 * users may onboard. No client-supplied IDs are accepted, so one user cannot
 * modify another user's profile, business, or addresses.
 *
 * Idempotency: re-submitting after completion is a safe no-op returning
 * { alreadyComplete: true }.
 */
export const completeCustomerOnboarding = mutation({
  args: {
    // Step 1 — business details
    businessName: v.string(),
    businessType: v.optional(v.string()),
    registrationNumber: v.optional(v.string()),
    businessPhone: v.optional(v.string()),
    businessAddress: v.optional(v.string()),
    // Step 2 — about you
    fullName: v.string(),
    phone: v.string(),
    // Step 3 — collections
    addressLabel: v.optional(v.string()),
    street: v.string(),
    city: v.string(),
    province: v.optional(v.string()),
    postalCode: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);
    const user = await ctx.db.get(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Role boundary: onboarding belongs to the Customer experience. The role
    // itself is always server-assigned — never derived from client input.
    const role: Role = (user.role as Role) ?? ROLES.CUSTOMER;
    if (role !== ROLES.CUSTOMER) {
      throw new Error("Access denied: onboarding is only available to customer accounts");
    }

    // Idempotency: already complete → nothing to write.
    const existing = await resolveOnboardingData(ctx, userId);
    if (existing && isOnboardingComplete(existing.user, existing.business, existing.defaultAddress)) {
      return { success: true, alreadyComplete: true };
    }

    // ─── Server-side validation (authoritative; runs before ANY write) ──────
    const businessNameError = validateBusinessName(args.businessName);
    if (businessNameError) throw new Error(businessNameError);
    if (args.businessType !== undefined) {
      const err = validateIndustry(args.businessType);
      if (err) throw new Error(err);
    }
    if (args.registrationNumber !== undefined) {
      const err = validateOptionalText(
        args.registrationNumber,
        "Registration number",
        BUSINESS_REGISTRATION_MAX_LENGTH
      );
      if (err) throw new Error(err);
    }
    if (args.businessPhone !== undefined) {
      const err = validatePhone(args.businessPhone);
      if (err) throw new Error(err);
    }
    if (args.businessAddress !== undefined) {
      const err = validateOptionalText(
        args.businessAddress,
        "Business address",
        BUSINESS_ADDRESS_MAX_LENGTH
      );
      if (err) throw new Error(err);
    }

    const fullNameError = validateName(args.fullName);
    if (fullNameError) throw new Error(fullNameError);
    const phone = trim(args.phone);
    if (phone.length === 0) throw new Error("Phone number is required");
    const phoneError = validatePhone(phone);
    if (phoneError) throw new Error(phoneError);

    if (args.addressLabel !== undefined) {
      const err = validateOptionalText(args.addressLabel, "Collection label", ADDRESS_LABEL_MAX_LENGTH);
      if (err) throw new Error(err);
    }
    const streetError = validateRequiredText(args.street, "Street address", STREET_MAX_LENGTH);
    if (streetError) throw new Error(streetError);
    const cityError = validateRequiredText(args.city, "City", CITY_MAX_LENGTH);
    if (cityError) throw new Error(cityError);
    if (args.province !== undefined) {
      const err = validateOptionalText(args.province, "Province", PROVINCE_MAX_LENGTH);
      if (err) throw new Error(err);
    }
    const postalError = validateRequiredText(args.postalCode, "Postal code", POSTAL_CODE_MAX_LENGTH);
    if (postalError) throw new Error(postalError);

    // ─── Writes (all validation passed) ─────────────────────────────────────

    const now = Date.now();

    // 1. Business: update the linked business, or create one and link it.
    //    There is exactly one business identity per onboarding — a retry can
    //    never create a duplicate.
    let businessId: Id<"businesses">;
    if (existing?.business && user.businessId === existing.business._id) {
      businessId = existing.business._id;
      const businessBefore = JSON.stringify({
        name: existing.business.name,
        industry: existing.business.industry ?? null,
        phone: existing.business.phone ?? null,
        address: existing.business.address ?? null,
        registrationNumber: existing.business.registrationNumber ?? null,
      });
      await ctx.db.patch(businessId, {
        name: trim(args.businessName),
        industry: args.businessType !== undefined && trim(args.businessType) !== ""
          ? trim(args.businessType)
          : existing.business.industry,
        phone: args.businessPhone !== undefined && trim(args.businessPhone) !== ""
          ? trim(args.businessPhone)
          : existing.business.phone,
        address: args.businessAddress !== undefined && trim(args.businessAddress) !== ""
          ? trim(args.businessAddress)
          : existing.business.address,
        registrationNumber:
          args.registrationNumber !== undefined && trim(args.registrationNumber) !== ""
            ? trim(args.registrationNumber)
            : existing.business.registrationNumber,
      });
      await ctx.runMutation(internal.audit.service.recordGenericEvent, {
        actorId: userId,
        actorRole: role,
        category: "company",
        action: AUDIT_ACTIONS.COMPANY_UPDATED,
        entityType: "businesses",
        entityId: businessId,
        before: businessBefore,
        after: JSON.stringify({
          name: trim(args.businessName),
          industry: args.businessType !== undefined && trim(args.businessType) !== "" ? trim(args.businessType) : null,
          phone: args.businessPhone !== undefined && trim(args.businessPhone) !== "" ? trim(args.businessPhone) : null,
          address: args.businessAddress !== undefined && trim(args.businessAddress) !== "" ? trim(args.businessAddress) : null,
          registrationNumber:
            args.registrationNumber !== undefined && trim(args.registrationNumber) !== ""
              ? trim(args.registrationNumber)
              : null,
        }),
        metadata: JSON.stringify({ context: "customer_onboarding" }),
      });
    } else {
      businessId = await ctx.db.insert("businesses", {
        name: trim(args.businessName),
        ownerUserId: userId,
        industry: args.businessType !== undefined && trim(args.businessType) !== "" ? trim(args.businessType) : undefined,
        phone: args.businessPhone !== undefined && trim(args.businessPhone) !== "" ? trim(args.businessPhone) : undefined,
        address:
          args.businessAddress !== undefined && trim(args.businessAddress) !== ""
            ? trim(args.businessAddress)
            : undefined,
        registrationNumber:
          args.registrationNumber !== undefined && trim(args.registrationNumber) !== ""
            ? trim(args.registrationNumber)
            : undefined,
        createdAt: now,
      });
      await ctx.runMutation(internal.audit.service.recordGenericEvent, {
        actorId: userId,
        actorRole: role,
        category: "company",
        action: AUDIT_ACTIONS.COMPANY_CREATED,
        entityType: "businesses",
        entityId: businessId,
        before: undefined,
        after: JSON.stringify({ name: trim(args.businessName) }),
        metadata: JSON.stringify({ context: "customer_onboarding" }),
      });
    }

    // 2. User profile: whitelisted fields only, then link the business.
    const userBefore = JSON.stringify({
      name: user.name ?? null,
      phone: user.phone ?? null,
      businessId: user.businessId ?? null,
    });
    await ctx.db.patch(userId, { name: trim(args.fullName), phone, businessId });
    await ctx.runMutation(internal.audit.service.recordGenericEvent, {
      actorId: userId,
      actorRole: role,
      category: "user",
      action: AUDIT_ACTIONS.USER_UPDATED,
      entityType: "users",
      entityId: userId,
      before: userBefore,
      after: JSON.stringify({ name: trim(args.fullName), phone, businessId }),
      metadata: JSON.stringify({ context: "customer_onboarding", fields: ["name", "phone", "businessId"] }),
    });

    // 3. Default collection address: update the existing default in place,
    //    otherwise create one. Never a duplicate default.
    const label = trim(args.addressLabel ?? "") || "Main collection point";
    if (existing?.defaultAddress) {
      await ctx.db.patch(existing.defaultAddress._id, {
        label,
        street: trim(args.street),
        city: trim(args.city),
        state: args.province !== undefined && trim(args.province) !== "" ? trim(args.province) : undefined,
        zip: trim(args.postalCode),
        isDefault: true,
      });
    } else {
      await ctx.db.insert("addresses", {
        userId,
        label,
        street: trim(args.street),
        city: trim(args.city),
        state: args.province !== undefined && trim(args.province) !== "" ? trim(args.province) : undefined,
        zip: trim(args.postalCode),
        isDefault: true,
      });
    }

    return { success: true, alreadyComplete: false };
  },
});
