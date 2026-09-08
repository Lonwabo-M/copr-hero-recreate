/**
 * Lasha Authorization Middleware
 *
 * This module provides server-side authorization functions that enforce
 * role-based access control. All authorization checks happen in Convex
 * functions — never trust the frontend to enforce permissions.
 *
 * Usage:
 *   import { requireAuth, requirePermission, requireOwnership } from "../auth/authorization";
 *
 *   export const getOrder = query({
 *     args: { orderId: v.id("orders") },
 *     handler: async (ctx, args) => {
 *       const userId = await requireAuth(ctx);
 *       const order = await ctx.db.get(args.orderId);
 *       await requireOwnership(ctx, userId, order, { ownerField: "senderId" });
 *       return order;
 *     },
 *   });
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id, Doc } from "../_generated/dataModel";
import {
  Role,
  Permission,
  ROLES,
  ROLE_PERMISSIONS,
} from "../schema";

// ─── Types ────────────────────────────────────────────────────────────────────

type Ctx = QueryCtx | MutationCtx;

export interface AuthUser {
  userId: Id<"users">;
  role: Role;
  businessId?: Id<"businesses">;
  isAnonymous?: boolean;
}

export interface OwnershipCheck {
  /** Field on the record that holds the owner's user ID */
  ownerField: string;
  /** Field on the record that holds the business ID (optional) */
  businessField?: string;
}

// ─── Core Auth Functions ──────────────────────────────────────────────────────

/**
 * Require an authenticated user. Throws if not authenticated.
 * Returns the authenticated user's ID.
 */
export async function requireAuth(ctx: Ctx): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    throw new Error("Authentication required");
  }
  return userId;
}

/**
 * Get the current user with role information. Returns null if not authenticated.
 */
export async function getCurrentAuthUser(ctx: Ctx): Promise<AuthUser | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return null;
  }

  const user = await ctx.db.get(userId);
  if (!user) {
    return null;
  }

  // Type assertion: we know the user table has these fields
  const userDoc = user as Doc<"users">;

  return {
    userId,
    role: (userDoc.role as Role) ?? ROLES.CUSTOMER,
    businessId: userDoc.businessId,
    isAnonymous: userDoc.isAnonymous,
  };
}

/**
 * Require an authenticated user with a specific role.
 * Returns the authenticated user with role information.
 */
export async function requireRole(
  ctx: Ctx,
  ...roles: Role[]
): Promise<AuthUser> {
  const userId = await requireAuth(ctx);
  const user = await ctx.db.get(userId);

  if (!user) {
    throw new Error("User not found");
  }

  const userDoc = user as Doc<"users">;
  const userRole = (userDoc.role as Role) ?? ROLES.CUSTOMER;

  if (!roles.includes(userRole)) {
    throw new Error(
      `Access denied: requires one of [${roles.join(", ")}] role`
    );
  }

  return {
    userId,
    role: userRole,
    businessId: userDoc.businessId,
    isAnonymous: userDoc.isAnonymous,
  };
}

// ─── Permission Functions ─────────────────────────────────────────────────────

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role: Role, permission: Permission): boolean {
  const permissions = ROLE_PERMISSIONS[role];
  if (!permissions) {
    return false;
  }
  return permissions.includes(permission);
}

/**
 * Check if a user has a specific permission.
 */
export async function checkPermission(
  ctx: Ctx,
  permission: Permission
): Promise<boolean> {
  const user = await getCurrentAuthUser(ctx);
  if (!user) {
    return false;
  }
  return hasPermission(user.role, permission);
}

/**
 * Require a specific permission. Throws if not authorized.
 */
export async function requirePermission(
  ctx: Ctx,
  permission: Permission
): Promise<AuthUser> {
  const user = await getCurrentAuthUser(ctx);

  if (!user) {
    throw new Error("Authentication required");
  }

  if (!hasPermission(user.role, permission)) {
    throw new Error(
      `Access denied: requires [${permission}] permission`
    );
  }

  return user;
}

/**
 * Require any of the specified permissions. Throws if user has none.
 */
export async function requireAnyPermission(
  ctx: Ctx,
  ...permissions: Permission[]
): Promise<AuthUser> {
  const user = await getCurrentAuthUser(ctx);

  if (!user) {
    throw new Error("Authentication required");
  }

  const hasAny = permissions.some((p) => hasPermission(user.role, p));

  if (!hasAny) {
    throw new Error(
      `Access denied: requires one of [${permissions.join(", ")}] permission`
    );
  }

  return user;
}

// ─── Ownership Checks ─────────────────────────────────────────────────────────

/**
 * Check if the current user owns a record.
 *
 * Ownership is determined by:
 * 1. The user is a SUPER_ADMIN (always owns everything)
 * 2. The user is a COMPANY_ADMIN and the record belongs to their company
 * 3. The user is an OPERATIONS user (can access company records)
 * 4. The record's owner field matches the user's ID
 *
 * @param ctx - Convex context
 * @param userId - Current user's ID
 * @param record - The record to check ownership of
 * @param check - Ownership configuration
 * @throws Error if not authorized
 */
export async function requireOwnership(
  ctx: Ctx,
  userId: Id<"users">,
  record: Record<string, any> | null,
  check: OwnershipCheck
): Promise<void> {
  if (!record) {
    throw new Error("Record not found");
  }

  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const userDoc = user as Doc<"users">;
  const userRole = (userDoc.role as Role) ?? ROLES.CUSTOMER;

  // Super admin can access everything
  if (userRole === ROLES.SUPER_ADMIN) {
    return;
  }

  // Operations can access company records
  if (userRole === ROLES.OPERATIONS) {
    // Operations can access all records (within reason)
    return;
  }

  // Company admin can access their company's records
  if (userRole === ROLES.COMPANY_ADMIN && userDoc.businessId) {
    if (check.businessField && record[check.businessField] === userDoc.businessId) {
      return;
    }
    // Also check if the user is the owner
    if (record[check.ownerField] === userId) {
      return;
    }
  }

  // Check direct ownership
  if (record[check.ownerField] === userId) {
    return;
  }

  throw new Error("Access denied: not the owner of this resource");
}

/**
 * Check if the current user owns a record (without throwing).
 */
export async function checkOwnership(
  ctx: Ctx,
  userId: Id<"users">,
  record: Record<string, any> | null,
  check: OwnershipCheck
): Promise<boolean> {
  try {
    await requireOwnership(ctx, userId, record, check);
    return true;
  } catch {
    return false;
  }
}

// ─── Company Isolation ────────────────────────────────────────────────────────

/**
 * Require that a record belongs to the current user's company.
 * Used for company-level access isolation.
 */
export async function requireCompanyAccess(
  ctx: Ctx,
  userId: Id<"users">,
  record: Record<string, any> | null,
  businessField: string
): Promise<void> {
  if (!record) {
    throw new Error("Record not found");
  }

  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const userDoc = user as Doc<"users">;
  const userRole = (userDoc.role as Role) ?? ROLES.CUSTOMER;

  // Super admin can access everything
  if (userRole === ROLES.SUPER_ADMIN) {
    return;
  }

  // Operations can access all companies
  if (userRole === ROLES.OPERATIONS) {
    return;
  }

  // Company admin and customer must belong to the same company
  if (!userDoc.businessId) {
    throw new Error("Access denied: no company association");
  }

  if (record[businessField] !== userDoc.businessId) {
    throw new Error("Access denied: record belongs to another company");
  }
}

/**
 * Filter records to only those belonging to the current user's company.
 * Used for query-level isolation.
 */
export async function filterByCompany<T extends Record<string, any>>(
  ctx: Ctx,
  records: T[],
  businessField: string
): Promise<T[]> {
  const user = await getCurrentAuthUser(ctx);
  if (!user) {
    return [];
  }

  // Super admin and operations see everything
  if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.OPERATIONS) {
    return records;
  }

  // Others only see their company's records
  if (!user.businessId) {
    return [];
  }

  return records.filter(
    (record) => record[businessField] === user.businessId
  );
}

// ─── Driver Isolation ─────────────────────────────────────────────────────────

/**
 * Require that a delivery is assigned to the current driver.
 * Used for driver-level access isolation.
 */
export async function requireDriverAccess(
  ctx: Ctx,
  userId: Id<"users">,
  delivery: Record<string, any> | null
): Promise<void> {
  if (!delivery) {
    throw new Error("Delivery not found");
  }

  const user = await ctx.db.get(userId);
  if (!user) {
    throw new Error("User not found");
  }

  const userDoc = user as Doc<"users">;
  const userRole = (userDoc.role as Role) ?? ROLES.CUSTOMER;

  // Super admin and operations can access all deliveries
  if (userRole === ROLES.SUPER_ADMIN || userRole === ROLES.OPERATIONS) {
    return;
  }

  // Fleet manager can access their drivers' deliveries
  if (userRole === ROLES.FLEET_MANAGER) {
    // Check if the driver belongs to the same company
    if (userDoc.businessId && delivery.courierId) {
      const driver = await ctx.db.get(delivery.courierId);
      if (driver) {
        const driverDoc = driver as Doc<"users">;
        if (driverDoc.businessId === userDoc.businessId) {
          return;
        }
      }
    }
  }

  // Driver can only access their own deliveries
  if (userRole === ROLES.DRIVER) {
    if (delivery.courierId !== userId) {
      throw new Error("Access denied: not assigned to this delivery");
    }
    return;
  }

  throw new Error("Access denied: not authorized to access this delivery");
}

/**
 * Filter deliveries to only those assigned to the current driver.
 */
export async function filterByDriver<T extends Record<string, any>>(
  ctx: Ctx,
  records: T[],
  courierField: string
): Promise<T[]> {
  const user = await getCurrentAuthUser(ctx);
  if (!user) {
    return [];
  }

  // Super admin, operations, and fleet manager see all
  if (
    user.role === ROLES.SUPER_ADMIN ||
    user.role === ROLES.OPERATIONS ||
    user.role === ROLES.FLEET_MANAGER
  ) {
    return records;
  }

  // Driver only sees their own
  if (user.role === ROLES.DRIVER) {
    return records.filter(
      (record) => record[courierField] === user.userId
    );
  }

  // Customer and others don't see driver-filtered data
  return [];
}

// ─── Convenience Functions ────────────────────────────────────────────────────

/**
 * Require that the user is not anonymous.
 */
export async function requireNonAnonymous(ctx: Ctx): Promise<AuthUser> {
  const user = await getCurrentAuthUser(ctx);

  if (!user) {
    throw new Error("Authentication required");
  }

  if (user.isAnonymous) {
    throw new Error("Access denied: anonymous users cannot perform this action");
  }

  return user;
}

/**
 * Require that the user has a specific business ID.
 */
export async function requireBusiness(
  ctx: Ctx,
  businessId?: Id<"businesses">
): Promise<AuthUser> {
  const user = await requireNonAnonymous(ctx);

  if (!user.businessId) {
    throw new Error("Access denied: no company association");
  }

  // If a specific business ID is required, check it matches
  if (businessId && user.businessId !== businessId) {
    throw new Error("Access denied: not authorized for this company");
  }

  return user;
}

/**
 * Get the current user's effective business ID for queries.
 * Returns null if the user has no business or is super admin/operations.
 */
export async function getEffectiveBusinessId(
  ctx: Ctx
): Promise<Id<"businesses"> | null> {
  const user = await getCurrentAuthUser(ctx);
  if (!user) {
    return null;
  }

  // Super admin and operations see all businesses
  if (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.OPERATIONS) {
    return null; // null means "no filter"
  }

  return user.businessId ?? null;
}
