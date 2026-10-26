/**
 * Log redaction (POPIA s19; build default "logs without personal
 * information").
 *
 * Application logs are copied to the hosting provider's log store, where they
 * outlive the record they describe and are readable by more people than the
 * database is. Personal information therefore must not be written to them in
 * the first place. This module is the last line of defence for the structured
 * logger: it scrubs values that look like contact details, identifiers, card
 * numbers and credentials before anything reaches console.log.
 *
 * It is deliberately conservative — it masks patterns, it does not try to
 * understand context. Callers should still log identifiers and events rather
 * than values; this only catches mistakes.
 *
 * Not a substitute for scrubbing: `console.log` calls outside the logger are
 * not covered. Lint/CI should keep new ones out.
 */

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;

/** JWT-shaped values (Convex Auth session, provider tokens). */
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g;

/** Bearer credentials in headers copied into error messages. */
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi;

/** Provider API keys (Paystack, Resend, Vly). */
const API_KEY = /\b(?:sk|pk|rk)_(?:live_|test_)?[A-Za-z0-9]{8,}\b/g;

/** South African identity numbers: exactly 13 digits. */
const SA_ID = /\b\d{13}\b/g;

/** Payment card numbers: 16 to 19 digits, optionally grouped. */
const CARD = /\b(?:\d[ -]?){15,18}\d\b/g;

/**
 * South African mobile and landline numbers, national or +27 form.
 *
 * No leading \b: "+27 ..." starts with a non-word character, so a word
 * boundary never exists between the space before it and the plus sign — the
 * old pattern silently missed every international-format number. Digit
 * lookaround keeps it from biting a fragment out of a longer number.
 */
const SA_PHONE = /(?<!\d)(?:\+27[\s-]?|0)\d{2}[\s-]?\d{3}[\s-]?\d{4}(?!\d)/g;

const PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: JWT, replacement: "[token]" },
  { pattern: BEARER, replacement: "Bearer [token]" },
  { pattern: API_KEY, replacement: "[key]" },
  { pattern: EMAIL, replacement: "[email]" },
  { pattern: SA_ID, replacement: "[id-number]" },
  { pattern: CARD, replacement: "[card]" },
  { pattern: SA_PHONE, replacement: "[phone]" },
];

/** Metadata keys whose values are never logged, whatever they contain. */
const SENSITIVE_KEY =
  /(password|passcode|secret|token|apikey|api_key|authorization|cookie|card|cvv|pin|idnumber|id_number|identity|email|phone|cell|address|bank|accountnumber|account_number|signature)/i;

export function redactPII(value: string): string {
  let output = value;
  for (const { pattern, replacement } of PATTERNS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

/**
 * Deep-copy metadata with sensitive keys masked and string values redacted.
 * Depth-limited so a cyclic or pathological object can never stall a log call.
 */
export function redactMetadata(
  value: Record<string, unknown> | undefined,
  depth = 0,
): Record<string, unknown> | undefined {
  if (!value) return undefined;
  if (depth > 4) return { truncated: true };

  const output: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) {
      output[key] = "[redacted]";
      continue;
    }
    output[key] = redactValue(entry, depth + 1);
  }
  return output;
}

function redactValue(entry: unknown, depth: number): unknown {
  if (typeof entry === "string") {
    return redactPII(entry.length > 2000 ? entry.slice(0, 2000) : entry);
  }
  if (entry instanceof Error) {
    return { name: entry.name, message: redactPII(entry.message) };
  }
  if (Array.isArray(entry)) {
    return entry.slice(0, 50).map((item) => redactValue(item, depth + 1));
  }
  if (entry && typeof entry === "object") {
    return redactMetadata(entry as Record<string, unknown>, depth + 1);
  }
  return entry;
}
