/**
 * Auth error mapping.
 *
 * Convex returns server failures as a single string containing a request ID,
 * the error line and a stack trace, for example:
 *
 *   [Request ID: ffeb…] Server Error
 *   Uncaught Error: InvalidAccountId
 *       at retrieveAccount (../../node_modules/@convex-dev/auth/src/server/implementation/index.ts:602:9)
 *       at async authorize [as authorize] (../../node_modules/@convex-dev/auth/src/providers/Password.ts:170:10)
 *
 * Substring-matching that whole string is unsafe: every Convex Auth failure
 * carries `Password.ts` in its stack, so a reset request for an email with no
 * account was reported as "Password does not meet requirements". It also
 * risked surfacing provider internals and configuration instructions.
 *
 * These helpers reduce the error to its actual message and map only known
 * codes to fixed, user-facing copy. Everything else falls back to a caller
 * supplied message — raw provider text is never rendered.
 */

export type AuthFlow = "signIn" | "signUp" | "reset" | "reset-verification";

/** Account-agnostic: must read the same whether or not the email exists. */
export const RESET_REQUEST_NOTICE =
  "If an account exists for this email, a reset code has been sent.";

/** Convex Auth's reset flow emails a 6-digit code (see convex/auth/email.ts). */
export const RESET_CODE_LENGTH = 6;

function rawMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const data = (err as { data?: unknown }).data;
    if (typeof data === "string" && data.trim()) return data;
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return "";
}

/**
 * The meaningful part of a provider failure: the line after `Uncaught Error:`
 * when Convex wrapped it, otherwise the first line without the request prefix.
 */
export function authErrorDetail(err: unknown): string {
  const raw = rawMessage(err);
  if (!raw.trim()) return "";
  const uncaught = raw.match(/Uncaught (?:Convex)?Error:\s*([^\n]+)/i);
  if (uncaught?.[1]) return uncaught[1].trim();
  return (raw.split("\n")[0] ?? "")
    .replace(/^\[Request ID:[^\]]*\]\s*/i, "")
    .replace(/^\[CONVEX [^\]]*\]\s*/i, "")
    .replace(/^Server Error$/i, "")
    .trim();
}

/**
 * Convex Auth throws InvalidAccountId when `flow: "reset"` is used for an
 * email with no password account. Callers treat it as "no code sent" and show
 * the neutral notice, so the page never confirms which emails are registered.
 */
export function isUnknownAccountError(err: unknown): boolean {
  return /\bInvalidAccountId\b/.test(authErrorDetail(err));
}

/**
 * The reset bridge throttles sends only for addresses that have an account.
 * The reset page must not surface that distinction, or the form becomes an
 * account-existence oracle; it treats this like the unknown-account case.
 */
export function isResetRateLimitedError(err: unknown): boolean {
  return /^RESET_RATE_LIMITED(?::\d+)?$/.test(authErrorDetail(err));
}

/** Map a provider failure to fixed, user-safe copy for the flow that made it. */
export function safeAuthError(
  err: unknown,
  flow: AuthFlow,
  fallback: string,
): string {
  const detail = authErrorDetail(err);
  if (!detail) return fallback;

  if (/usage limit|exceeded a configured/i.test(detail)) {
    return "The platform is temporarily unavailable (usage limit reached). Please try again later.";
  }
  if (/TooManyFailedAttempts|too many (failed )?attempts/i.test(detail)) {
    return "Too many attempts. Please try again later.";
  }
  // Thrown by the reset email bridge before a code is sent, once the
  // per-account throttle is exhausted (convex/auth/resetRateLimit.ts).
  const resetLimited = detail.match(/^RESET_RATE_LIMITED(?::(\d+))?$/);
  if (resetLimited) {
    const seconds = Number(resetLimited[1] ?? 0);
    if (seconds >= 60) {
      const minutes = Math.ceil(seconds / 60);
      return `Too many reset requests. Please try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`;
    }
    if (seconds > 1) {
      return `Please wait ${seconds} seconds before requesting another code.`;
    }
    return "Please wait a moment before requesting another code.";
  }
  if (/already exists/i.test(detail)) {
    // Only sign-up creates an account; never confirm existence elsewhere.
    return flow === "signUp" ? "An account with this email already exists" : fallback;
  }
  // Deployment misconfiguration (a missing SITE_URL or email key) leaves the
  // reset endpoint unable to send anything. That is an outage on our side, not
  // something the visitor can retry away, so say so without naming env vars.
  if (/Missing environment variable|not configured/i.test(detail)) {
    return "Password reset is temporarily unavailable. Please try again later.";
  }
  if (/Failed to send email|email delivery/i.test(detail)) {
    return "Email delivery is temporarily unavailable. Please try again later.";
  }

  switch (flow) {
    case "signIn":
      return /InvalidAccountId|InvalidSecret|Invalid credentials/i.test(detail)
        ? "Invalid email or password"
        : fallback;

    case "reset":
      // This step only collects an email — it cannot enforce a password policy,
      // so a password-sounding message here is always a misread error.
      return fallback;

    case "signUp":
    case "reset-verification": {
      const policy = detail.match(/^Password must be at least (\d+) characters\.?$/i);
      if (policy) return `Password must be at least ${policy[1]} characters`;
      if (/^Invalid password$/i.test(detail)) return "Password does not meet requirements";
      if (/^Missing `?newPassword`?/i.test(detail)) return "Choose a new password";
      return fallback;
    }
  }
}
