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

// ─── Driver identity validators ──────────────────────────────────────────────
// Used by the driver application (Capture step) so vetting captures real,
// verifiable identity details rather than relying on the sign-up name alone.

/**
 * South African ID number: exactly 13 digits, a plausible YYMMDD birthdate,
 * and a valid Luhn checksum. Spaces are tolerated on input but the stored
 * value is the digit string.
 */
export const SA_ID_LENGTH = 13;

export function validateSaIdNumber(idNumber: string): string | null {
  const trimmed = idNumber.replace(/\s/g, "");
  if (!/^\d+$/.test(trimmed)) {
    return "ID number must contain digits only";
  }
  if (trimmed.length !== SA_ID_LENGTH) {
    return `ID number must be exactly ${SA_ID_LENGTH} digits`;
  }

  // Plausible birthdate embedded in the first six digits (YYMMDD).
  const month = Number(trimmed.slice(2, 4));
  const day = Number(trimmed.slice(4, 6));
  if (month < 1 || month > 12) {
    return "ID number contains an invalid birth month";
  }
  if (day < 1 || day > 31) {
    return "ID number contains an invalid birth day";
  }

  // Luhn checksum (the SA ID uses the same mod-10 scheme as credit cards).
  let sum = 0;
  for (let i = 0; i < trimmed.length; i++) {
    let digit = Number(trimmed[trimmed.length - 1 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  if (sum % 10 !== 0) {
    return "ID number checksum is invalid — please double-check it";
  }
  return null;
}

/**
 * South African cell number: 0[6-8]XXXXXXXXX or +27[6-8]XXXXXXXXX.
 * Spaces, dashes and parentheses are tolerated on input.
 */
export const CELL_MAX_LENGTH = 20;

export function validateCellNumber(cell: string): string | null {
  const trimmed = cell.trim();
  if (trimmed.length === 0) {
    return "Cell number is required";
  }
  if (trimmed.length > CELL_MAX_LENGTH) {
    return `Cell number is too long (maximum ${CELL_MAX_LENGTH} characters)`;
  }
  const digits = trimmed.replace(/[\s()-]/g, "");
  if (!/^(\+27|0)[6-8]\d{8}$/.test(digits)) {
    return "Enter a valid South African cell number (e.g. 082 123 4567)";
  }
  return null;
}

/** Personal name part (first name / surname): required, length-capped. */
export function validatePersonName(
  value: string,
  label: "First name" | "Surname"
): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return `${label} is required`;
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    return `${label} is too long (maximum ${NAME_MAX_LENGTH} characters)`;
  }
  return null;
}
