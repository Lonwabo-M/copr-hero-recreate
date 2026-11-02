// ─── Staff provisioning policy ───────────────────────────────────────────────
// Pure rules for the Admin → Accounts screen. The mutations in accounts.ts use
// these helpers, and the negative tests exercise them directly. Keeping the
// rules here makes the role ceiling, self-edit guard and last-super-admin guard
// impossible to accidentally reimplement differently in the UI.

import { ROLES, isStaffRole, type Role } from "../schema";

/** Roles an actor may grant when creating or changing staff access. */
export function assignableStaffRolesFor(actorRole: Role): Role[] {
  switch (actorRole) {
    case ROLES.SUPER_ADMIN:
      // Super admin is deliberately not grantable through the normal form.
      // It remains a break-glass role; a second one requires a runbook action.
      return [ROLES.COMPANY_ADMIN, ROLES.OPERATIONS, ROLES.FLEET_MANAGER];
    case ROLES.COMPANY_ADMIN:
      return [ROLES.OPERATIONS, ROLES.FLEET_MANAGER];
    default:
      return [];
  }
}

export function canGrantStaffRole(actorRole: Role, nextRole: Role): boolean {
  return assignableStaffRolesFor(actorRole).includes(nextRole);
}

/** Whether the actor may manage an existing account at all. */
export function canManageStaffAccount(
  actorRole: Role,
  targetRole: Role,
): boolean {
  if (!isStaffRole(targetRole)) return false;
  if (actorRole === ROLES.SUPER_ADMIN) return true;
  if (actorRole === ROLES.COMPANY_ADMIN) {
    return targetRole === ROLES.OPERATIONS || targetRole === ROLES.FLEET_MANAGER;
  }
  return false;
}

/** Whether the actor may act on this specific account (self-edits denied). */
export function canActOnStaffAccount(
  actorId: string,
  targetId: string,
  actorRole: Role,
  targetRole: Role,
): boolean {
  if (actorId === targetId) return false;
  return canManageStaffAccount(actorRole, targetRole);
}

/** Whether a role change is within the actor's ceiling. */
export function canChangeStaffRole(
  actorId: string,
  targetId: string,
  actorRole: Role,
  currentRole: Role,
  nextRole: Role,
): boolean {
  if (currentRole === nextRole) return false;
  if (!canActOnStaffAccount(actorId, targetId, actorRole, currentRole)) {
    return false;
  }
  return canGrantStaffRole(actorRole, nextRole);
}

/**
 * A super admin cannot be demoted or suspended when they are the only active
 * one left. Reactivation is always safe and is intentionally not covered.
 */
export function wouldRemoveLastSuperAdmin(
  targetRole: Role,
  nextRole: Role | null,
  activeSuperAdminCount: number,
): boolean {
  return (
    targetRole === ROLES.SUPER_ADMIN &&
    nextRole !== ROLES.SUPER_ADMIN &&
    activeSuperAdminCount <= 1
  );
}

export function canSuspendStaffAccount(
  actorId: string,
  targetId: string,
  actorRole: Role,
  targetRole: Role,
  activeSuperAdminCount: number,
): boolean {
  if (!canActOnStaffAccount(actorId, targetId, actorRole, targetRole)) {
    return false;
  }
  return !wouldRemoveLastSuperAdmin(targetRole, null, activeSuperAdminCount);
}

export function canReactivateStaffAccount(
  actorId: string,
  targetId: string,
  actorRole: Role,
  targetRole: Role,
): boolean {
  return canActOnStaffAccount(actorId, targetId, actorRole, targetRole);
}

// ─── Input normalisation and validation ─────────────────────────────────────

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MIN_NAME_LENGTH = 2;
const MAX_NAME_LENGTH = 100;

export function normalizeStaffEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validateStaffEmail(email: string): string | null {
  const normalized = normalizeStaffEmail(email);
  if (!normalized) return "Work email is required";
  if (normalized.length > MAX_EMAIL_LENGTH) return "Work email is too long";
  if (!EMAIL_PATTERN.test(normalized)) return "Enter a valid work email address";
  return null;
}

export function validateStaffName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length < MIN_NAME_LENGTH) return "Full name is required";
  if (trimmed.length > MAX_NAME_LENGTH) return "Full name is too long";
  return null;
}

/**
 * Email is the SSO linking key, so duplicate detection deliberately compares
 * normalised values rather than trusting the exact stored casing.
 */
export function findUserWithNormalizedEmail<T extends { email?: string | null }>(
  users: readonly T[],
  email: string,
): T | undefined {
  const normalized = normalizeStaffEmail(email);
  return users.find(
    (user) => normalizeStaffEmail(user.email ?? "") === normalized,
  );
}
