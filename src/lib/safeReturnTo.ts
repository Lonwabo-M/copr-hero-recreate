/**
 * Return-to validation for authentication redirects.
 *
 * A leading "/" is not enough: browsers normalise backslashes in special URLs,
 * so `/\evil.com` and `///evil.com` resolve to another origin. Validate with
 * the same URL parser the browser uses and reject anything that escapes the
 * internal origin. The returned value is canonical, so callers never navigate
 * with the raw input.
 */
const INTERNAL_BASE = "https://internal.invalid";

export function safeInternalPath(
  value: string | null | undefined,
  fallback: string | null = null,
): string | null {
  if (!value || !value.startsWith("/")) return fallback;
  if (value.includes("\\") || /[\u0000-\u001f\u007f]/.test(value)) {
    return fallback;
  }

  try {
    const resolved = new URL(value, INTERNAL_BASE);
    if (resolved.origin !== INTERNAL_BASE) return fallback;
    // Reject a path that normalises to a protocol-relative form (e.g. /..//host).
    if (resolved.pathname.startsWith("//")) return fallback;
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return fallback;
  }
}
