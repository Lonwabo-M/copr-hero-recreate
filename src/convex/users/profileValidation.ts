/**
 * Lasha Profile Validation
 *
 * Pure validation rules for user profile and business profile updates.
 * Contains no Convex imports so it can be unit-tested outside the Convex runtime.
 *
 * Security model:
 * - The authenticated user's ID always comes from the auth session, never from
 *   client args. There is no way to target another user's profile.
 * - Only the fields listed in PROFILE_EDITABLE_FIELDS / BUSINESS_EDITABLE_FIELDS
 *   are accepted by the corresponding mutations. Privileged fields (role,
 *   email, businessId, verification state, GPS) are structurally absent from
 *   the mutation args and therefore cannot be modified by clients.
 */

// ─── Editable field whitelists (documented contract for the mutations) ───────

/** Fields on the users table a user may change on their own profile. */
export const PROFILE_EDITABLE_FIELDS = ["name", "phone"] as const;

/** Fields on the businesses table a business owner/company admin may change. */
export const BUSINESS_EDITABLE_FIELDS = [
  "name",
  "phone",
  "address",
  "registrationNumber",
] as const;

/** Privileged user fields that must never be user-editable via profile mutations. */
export const PROTECTED_USER_FIELDS = [
  "role",
  "businessId",
  "email",
  "emailVerificationTime",
  "isAnonymous",
  "image",
  "currentLat",
  "currentLng",
  "lastLocationUpdate",
] as const;

// ─── Limits ──────────────────────────────────────────────────────────────────

export const NAME_MAX_LENGTH = 100;
export const PHONE_MAX_LENGTH = 20;
export const BUSINESS_NAME_MAX_LENGTH = 120;
export const BUSINESS_ADDRESS_MAX_LENGTH = 200;
export const BUSINESS_REGISTRATION_MAX_LENGTH = 50;

// Allows international formats: optional leading "+", digits, spaces, parens, hyphens.
const PHONE_PATTERN = /^\+?[0-9\s()-]{3,20}$/;

// ─── Validators (return an error message, or null when valid) ────────────────

/** Name must be non-empty (after trimming) and within the length limit. */
export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return "Name cannot be empty";
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    return `Name is too long (maximum ${NAME_MAX_LENGTH} characters)`;
  }
  return null;
}

/** Phone is optional — an empty string clears it. Non-empty values must look like phone numbers. */
export function validatePhone(phone: string): string | null {
  const trimmed = phone.trim();
  if (trimmed.length === 0) {
    return null; // clearing the phone is allowed
  }
  if (trimmed.length > PHONE_MAX_LENGTH) {
    return `Phone number is too long (maximum ${PHONE_MAX_LENGTH} characters)`;
  }
  if (!PHONE_PATTERN.test(trimmed)) {
    return "Invalid phone number format";
  }
  return null;
}

/** Generic optional free-text validator: empty is allowed, length is capped. */
export function validateOptionalText(
  value: string,
  label: string,
  maxLength: number
): string | null {
  const trimmed = value.trim();
  if (trimmed.length > maxLength) {
    return `${label} is too long (maximum ${maxLength} characters)`;
  }
  return null;
}

/** Business display name is required and length-capped. */
export function validateBusinessName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return "Company name cannot be empty";
  }
  if (trimmed.length > BUSINESS_NAME_MAX_LENGTH) {
    return `Company name is too long (maximum ${BUSINESS_NAME_MAX_LENGTH} characters)`;
  }
  return null;
}
