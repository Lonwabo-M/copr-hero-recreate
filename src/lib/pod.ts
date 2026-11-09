/**
 * Client-side POD rules and helpers.
 *
 * These checks are intentionally duplicated on the server. They exist here to
 * give the driver immediate feedback, never to grant authority: Convex
 * re-validates storage metadata, delivery state, and authorization.
 */

export const POD_MAX_FILES = 5;
export const POD_MAX_PHOTOS = 4; // one slot is reserved for the signature
export const POD_MAX_FILE_SIZE = 10 * 1024 * 1024;
export const POD_IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const POD_ACCEPT = POD_IMAGE_MIME_TYPES.join(",");

export interface PODFileLike {
  name: string;
  size: number;
  type: string;
}

export function validatePODPhoto(file: PODFileLike): string | null {
  if (!POD_IMAGE_MIME_TYPES.includes(file.type as (typeof POD_IMAGE_MIME_TYPES)[number])) {
    return `${file.name} is not a supported image (JPEG, PNG or WebP)`;
  }
  if (file.size <= 0) {
    return `${file.name} is empty`;
  }
  if (file.size > POD_MAX_FILE_SIZE) {
    return `${file.name} exceeds the 10MB limit`;
  }
  return null;
}

export function validatePODSubmission(input: {
  recipientName: string;
  hasSignature: boolean;
  photoCount: number;
}): string | null {
  if (!input.recipientName.trim()) {
    return "Recipient name is required";
  }
  if (!input.hasSignature && input.photoCount === 0) {
    return "Add a recipient signature or at least one delivery photo";
  }
  if (input.photoCount > POD_MAX_PHOTOS) {
    return `You can attach at most ${POD_MAX_PHOTOS} photos (the fifth slot is for the signature)`;
  }
  if (input.photoCount + (input.hasSignature ? 1 : 0) > POD_MAX_FILES) {
    return `A proof of delivery can have at most ${POD_MAX_FILES} files`;
  }
  return null;
}

export function podOutcomeLabel(outcome: string): string {
  switch (outcome) {
    case "delivered":
      return "Delivered";
    case "partial":
      return "Partially delivered";
    case "failed":
      return "Not delivered";
    default:
      return outcome;
  }
}

export function formatPODBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
