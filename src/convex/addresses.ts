/**
 * Customer Address Book
 *
 * Saved pickup and drop-off locations for the signed-in customer. Every
 * function is scoped to the session user — no client-supplied user or address
 * IDs are trusted, and an address can only ever be read, edited or deleted by
 * the person who saved it.
 *
 * `addresses` is also written per-order by the delivery flow (a snapshot of
 * the address used for that order). Those rows belong to the order, not to the
 * address book, but they share the table — this module only exposes the
 * caller's saved locations and never touches order snapshots.
 */

import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./auth/authorization";

// ─── Limits ──────────────────────────────────────────────────────────────────

const LABEL_MAX = 40;
const STREET_MAX = 200;
const CITY_MAX = 80;
const STATE_MAX = 80;
const ZIP_MAX = 12;
const MAX_SAVED_ADDRESSES = 50;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Collapse whitespace and trim — keeps duplicate detection reliable. */
function clean(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function requireText(value: string, field: string, max: number): string {
  const cleaned = clean(value);
  if (!cleaned) throw new Error(`${field} is required`);
  if (cleaned.length > max) throw new Error(`${field} must be ${max} characters or fewer`);
  return cleaned;
}

function optionalText(value: string | undefined, field: string, max: number): string | undefined {
  if (value === undefined) return undefined;
  const cleaned = clean(value);
  if (!cleaned) return undefined;
  if (cleaned.length > max) throw new Error(`${field} must be ${max} characters or fewer`);
  return cleaned;
}

/** Stable identity for duplicate detection: street + city + postal code. */
function addressKey(street: string, city: string, zip: string): string {
  return `${street}|${city}|${zip}`.toLowerCase();
}

// ─── Queries ─────────────────────────────────────────────────────────────────

/**
 * Every address saved by the signed-in customer, default first.
 * Returns the display fields only — no ownership or business metadata.
 */
export const listMyAddresses = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireAuth(ctx);
    const rows = await ctx.db
      .query("addresses")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return rows
      .sort((a, b) => {
        const defaultRank = Number(b.isDefault === true) - Number(a.isDefault === true);
        if (defaultRank !== 0) return defaultRank;
        return a.label.localeCompare(b.label);
      })
      .map((a) => ({
        _id: a._id,
        label: a.label,
        street: a.street,
        city: a.city,
        state: a.state ?? "",
        zip: a.zip,
        isDefault: a.isDefault === true,
      }));
  },
});

// ─── Mutations ───────────────────────────────────────────────────────────────

/**
 * Save a new address for the signed-in customer.
 *
 * A first address automatically becomes the default. Re-saving an address
 * that already exists (same street, city and postal code) returns the existing
 * record instead of creating a duplicate.
 */
export const createAddress = mutation({
  args: {
    label: v.string(),
    street: v.string(),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const label = requireText(args.label, "Address label", LABEL_MAX);
    const street = requireText(args.street, "Street address", STREET_MAX);
    const city = optionalText(args.city, "City", CITY_MAX) ?? "";
    const state = optionalText(args.state, "Province", STATE_MAX);
    const zip = optionalText(args.zip, "Postal code", ZIP_MAX) ?? "";

    const existing = await ctx.db
      .query("addresses")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const duplicate = existing.find(
      (a) => addressKey(a.street, a.city, a.zip) === addressKey(street, city, zip),
    );
    if (duplicate) {
      return { addressId: duplicate._id, created: false };
    }

    if (existing.length >= MAX_SAVED_ADDRESSES) {
      throw new Error(`You can save up to ${MAX_SAVED_ADDRESSES} addresses`);
    }

    const shouldDefault = args.isDefault === true || existing.length === 0;
    if (shouldDefault) {
      await Promise.all(
        existing
          .filter((a) => a.isDefault === true)
          .map((a) => ctx.db.patch(a._id, { isDefault: false })),
      );
    }

    const addressId = await ctx.db.insert("addresses", {
      userId,
      label,
      street,
      city,
      state,
      zip,
      isDefault: shouldDefault,
    });

    return { addressId, created: true };
  },
});

/**
 * Edit one of the signed-in customer's saved addresses.
 * Choosing "default" clears the flag on every other saved address first.
 */
export const updateAddress = mutation({
  args: {
    addressId: v.id("addresses"),
    label: v.optional(v.string()),
    street: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    zip: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const address = await ctx.db.get(args.addressId);
    if (!address || address.userId !== userId) {
      throw new Error("Address not found");
    }

    const patch: {
      label?: string;
      street?: string;
      city?: string;
      state?: string | undefined;
      zip?: string;
      isDefault?: boolean;
    } = {};

    if (args.label !== undefined) patch.label = requireText(args.label, "Address label", LABEL_MAX);
    if (args.street !== undefined) patch.street = requireText(args.street, "Street address", STREET_MAX);
    if (args.city !== undefined) patch.city = optionalText(args.city, "City", CITY_MAX) ?? "";
    if (args.state !== undefined) patch.state = optionalText(args.state, "Province", STATE_MAX);
    if (args.zip !== undefined) patch.zip = optionalText(args.zip, "Postal code", ZIP_MAX) ?? "";

    if (args.isDefault === true) {
      const all = await ctx.db
        .query("addresses")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      await Promise.all(
        all
          .filter((a) => a._id !== address._id && a.isDefault === true)
          .map((a) => ctx.db.patch(a._id, { isDefault: false })),
      );
      patch.isDefault = true;
    } else if (args.isDefault === false) {
      patch.isDefault = false;
    }

    await ctx.db.patch(address._id, patch);
    return { success: true };
  },
});

/**
 * Remove one of the signed-in customer's saved addresses.
 *
 * Order snapshots are separate address rows, so deleting a saved location
 * never breaks an existing delivery or its paperwork.
 */
export const deleteAddress = mutation({
  args: { addressId: v.id("addresses") },
  handler: async (ctx, args) => {
    const userId = await requireAuth(ctx);

    const address = await ctx.db.get(args.addressId);
    if (!address || address.userId !== userId) {
      throw new Error("Address not found");
    }

    await ctx.db.delete(address._id);

    // Never leave the book without a default when it still has entries.
    if (address.isDefault === true) {
      const remaining = await ctx.db
        .query("addresses")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
      if (remaining.length > 0) {
        await ctx.db.patch(remaining[0]._id, { isDefault: true });
      }
    }

    return { success: true };
  },
});
