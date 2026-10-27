/**
 * Self-service password change for a signed-in user.
 *
 * `currentPassword` is verified by Convex Auth's own `retrieveAccount`, which
 * uses the provider's Scrypt hash comparison and the library's failed-attempt
 * rate limiter — the same protections as signing in. The new secret is written
 * through `modifyAccountCredentials`, so hashing stays inside the provider
 * configuration and never in this file.
 *
 * Expected failures are returned as data (`success: false`) rather than thrown,
 * because Convex wraps thrown errors with a request id and a stack trace.
 */
import { v } from "convex/values";
import {
  getAuthSessionId,
  getAuthUserId,
  invalidateSessions,
  modifyAccountCredentials,
  retrieveAccount,
} from "@convex-dev/auth/server";
import { action, internalQuery } from "../_generated/server";
import { internal } from "../_generated/api";
import { AUDIT_ACTIONS } from "../audit/service";

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

export type ChangePasswordResult =
  | { success: true; otherSessionsSignedOut: boolean }
  | {
      success: false;
      code:
        | "NOT_AUTHENTICATED"
        | "USER_NOT_FOUND"
        | "NO_PASSWORD_ACCOUNT"
        | "INVALID_CURRENT_PASSWORD"
        | "TOO_MANY_ATTEMPTS"
        | "WEAK_PASSWORD"
        | "SAME_PASSWORD"
        | "UPDATE_FAILED";
      message: string;
    };

function failure(
  code: Extract<ChangePasswordResult, { success: false }>["code"],
  message: string,
): ChangePasswordResult {
  return { success: false, code, message };
}

/** The signed-in user's own row. Never accepts a user id from the client. */
export const getPasswordChangeTarget = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return {
      email: user.email ?? null,
      role: (user.role as string) ?? "customer",
    };
  },
});

export const changePassword = action({
  args: {
    currentPassword: v.string(),
    newPassword: v.string(),
  },
  handler: async (ctx, args): Promise<ChangePasswordResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return failure(
        "NOT_AUTHENTICATED",
        "Your session has expired. Sign in again to change your password.",
      );
    }

    const target = await ctx.runQuery(
      internal.auth.passwordChange.getPasswordChangeTarget,
      { userId },
    );
    if (!target) {
      return failure("USER_NOT_FOUND", "We couldn't find your account.");
    }
    if (!target.email) {
      return failure(
        "NO_PASSWORD_ACCOUNT",
        "This account doesn't have an email address to match a password against. Contact support.",
      );
    }

    // Bound the Scrypt verification input; the provider only ever stores
    // passwords within this range.
    if (args.currentPassword.length > PASSWORD_MAX_LENGTH * 2) {
      return failure("INVALID_CURRENT_PASSWORD", "Current password is incorrect.");
    }
    if (args.newPassword.length < PASSWORD_MIN_LENGTH) {
      return failure(
        "WEAK_PASSWORD",
        `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
      );
    }
    if (args.newPassword.length > PASSWORD_MAX_LENGTH) {
      return failure(
        "WEAK_PASSWORD",
        `Password must be ${PASSWORD_MAX_LENGTH} characters or fewer.`,
      );
    }
    if (args.newPassword === args.currentPassword) {
      return failure(
        "SAME_PASSWORD",
        "Choose a new password that is different from your current one.",
      );
    }

    let verified;
    try {
      verified = await retrieveAccount(ctx, {
        provider: "password",
        account: { id: target.email, secret: args.currentPassword },
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : "";
      if (detail.includes("TooManyFailedAttempts")) {
        return failure(
          "TOO_MANY_ATTEMPTS",
          "Too many failed attempts. Please try again later.",
        );
      }
      if (detail.includes("InvalidAccountId")) {
        // A legacy/guest identity with no password account. It cannot be
        // changed here because there is no secret to verify.
        return failure(
          "NO_PASSWORD_ACCOUNT",
          "This account doesn't have a password set. Contact support to set one.",
        );
      }
      if (detail.includes("InvalidSecret") || detail.includes("Invalid credentials")) {
        return failure("INVALID_CURRENT_PASSWORD", "Current password is incorrect.");
      }
      console.error("[auth] password verification failed unexpectedly");
      return failure(
        "UPDATE_FAILED",
        "We couldn't verify your current password. Please try again.",
      );
    }

    // Defense in depth: the account resolved from the session user's own email
    // must belong to that same user.
    if (verified.user._id !== userId) {
      console.error("[auth] password account did not match the session user");
      return failure("UPDATE_FAILED", "We couldn't update your password.");
    }

    try {
      await modifyAccountCredentials(ctx, {
        provider: "password",
        account: { id: target.email, secret: args.newPassword },
      });
    } catch {
      // Never log the provider error: it can name the account (email).
      console.error("[auth] password update failed");
      return failure(
        "UPDATE_FAILED",
        "We couldn't update your password. Please try again.",
      );
    }

    // Sign out every other session. The current one is kept so the user is not
    // logged out of the browser they are using.
    const sessionId = await getAuthSessionId(ctx);
    let otherSessionsSignedOut = false;
    if (sessionId) {
      try {
        await invalidateSessions(ctx, { userId, except: [sessionId] });
        otherSessionsSignedOut = true;
      } catch {
        // The password change already succeeded; report it honestly rather
        // than failing the whole action. Do not log the provider error.
        console.error("[auth] password changed but other sessions were not invalidated");
      }
    }

    try {
      await ctx.runMutation(internal.audit.service.recordGenericEvent, {
        actorId: userId,
        actorRole: target.role,
        category: "auth",
        action: AUDIT_ACTIONS.AUTH_PASSWORD_CHANGED,
        entityType: "users",
        entityId: userId,
        metadata: JSON.stringify({ otherSessionsSignedOut }),
      });
    } catch {
      console.error("[auth] password changed but audit record failed");
    }

    return { success: true, otherSessionsSignedOut };
  },
});
