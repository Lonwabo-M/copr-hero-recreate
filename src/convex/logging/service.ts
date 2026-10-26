/**
 * Lasha Structured Logging Service
 *
 * Provides structured, correlated logging for all Convex operations.
 * Every important request/event gets a correlation ID for traceability.
 *
 * Log categories align with the audit system but are lighter-weight
 * and designed for operational monitoring rather than compliance.
 *
 * Convex captures console.log/warn/error output from mutations and queries.
 * This module formats those logs as structured JSON for easy parsing
 * by log aggregation tools.
 */

import { query, mutation, internalMutation } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentAuthUser } from "../auth/authorization";
import { redactMetadata, redactPII } from "./redact";

// ─── Log Levels ──────────────────────────────────────────────────────────────

export const LOG_LEVELS = {
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error",
  CRITICAL: "critical",
} as const;

export type LogLevel = (typeof LOG_LEVELS)[keyof typeof LOG_LEVELS];

// ─── Log Categories ──────────────────────────────────────────────────────────

export const LOG_CATEGORIES = {
  DELIVERY: "delivery",
  DISPATCH: "dispatch",
  TRACKING: "tracking",
  PRICING: "pricing",
  PAYMENT: "payment",
  POD: "pod",
  NOTIFICATION: "notification",
  ROUTING: "routing",
  AUTH: "auth",
  OFFLINE_SYNC: "offline_sync",
  SYSTEM: "system",
  HEALTH: "health",
} as const;

export type LogCategory = (typeof LOG_CATEGORIES)[keyof typeof LOG_CATEGORIES];

// ─── Structured Log Entry ────────────────────────────────────────────────────

interface StructuredLogEntry {
  /** Unique correlation ID for tracing across operations */
  correlationId: string;
  /** Log severity */
  level: LogLevel;
  /** Domain category */
  category: LogCategory;
  /** Human-readable message */
  message: string;
  /** Operation/action being performed */
  operation?: string;
  /** Entity type (e.g., "delivery", "order") */
  entityType?: string;
  /** Entity ID */
  entityId?: string;
  /** User ID (resolved server-side) */
  userId?: string;
  /** User role (resolved server-side) */
  userRole?: string;
  /** Duration in milliseconds */
  durationMs?: number;
  /** Whether the operation succeeded */
  success?: boolean;
  /** Error information */
  error?: {
    name: string;
    message: string;
    code?: string;
  };
  /** Additional structured data */
  metadata?: Record<string, unknown>;
  /** Unix timestamp */
  timestamp: number;
}

// ─── Correlation ID Generation ───────────────────────────────────────────────

/**
 * Generate a correlation ID for tracing.
 * Format: lash-{timestamp}-{random}
 */
export function generateCorrelationId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `lash-${ts}-${rand}`;
}

// ─── Structured Logger ───────────────────────────────────────────────────────

/**
 * Create a structured logger bound to a correlation ID and category.
 *
 * Usage:
 * ```
 * const log = createLogger("delivery");
 * log.info("Delivery created", { operation: "createDelivery", entityId: deliveryId });
 * log.error("Delivery failed", { error: err, entityId: deliveryId });
 * ```
 */
export function createLogger(category: LogCategory, correlationId?: string) {
  const cid = correlationId ?? generateCorrelationId();

  function formatEntry(
    level: LogLevel,
    message: string,
    data?: Partial<Omit<StructuredLogEntry, "level" | "message" | "category" | "correlationId" | "timestamp">>
  ): StructuredLogEntry {
    return {
      correlationId: cid,
      level,
      category,
      message,
      timestamp: Date.now(),
      ...data,
    };
  }

  function logToConsole(entry: StructuredLogEntry) {
    const prefix = `[${entry.level.toUpperCase()}][${entry.category}][${entry.correlationId}]`;

    // POPIA s19: logs are copied off-platform and outlive the record they
    // describe, so personal information and credentials are scrubbed before
    // anything is written. See logging/redact.ts. Stringify defensively: a
    // cyclic metadata object must never turn a log call into a thrown error.
    const message = redactPII(entry.message);
    const metadata = redactMetadata(entry.metadata);
    let suffix = "";
    if (metadata) {
      try {
        suffix = ` ${JSON.stringify(metadata)}`;
      } catch {
        suffix = " [metadata unserializable]";
      }
    }

    switch (entry.level) {
      case LOG_LEVELS.DEBUG:
        console.log(`${prefix} ${message}${suffix}`);
        break;
      case LOG_LEVELS.INFO:
        console.log(`${prefix} ${message}${suffix}`);
        break;
      case LOG_LEVELS.WARN:
        console.warn(`${prefix} ${message}${suffix}`);
        break;
      case LOG_LEVELS.ERROR:
      case LOG_LEVELS.CRITICAL:
        console.error(`${prefix} ${message}${suffix}`);
        break;
    }
  }

  return {
    correlationId: cid,

    debug(message: string, data?: Partial<Omit<StructuredLogEntry, "level" | "message" | "category" | "correlationId" | "timestamp">>) {
      const entry = formatEntry(LOG_LEVELS.DEBUG, message, data);
      logToConsole(entry);
    },

    info(message: string, data?: Partial<Omit<StructuredLogEntry, "level" | "message" | "category" | "correlationId" | "timestamp">>) {
      const entry = formatEntry(LOG_LEVELS.INFO, message, data);
      logToConsole(entry);
    },

    warn(message: string, data?: Partial<Omit<StructuredLogEntry, "level" | "message" | "category" | "correlationId" | "timestamp">>) {
      const entry = formatEntry(LOG_LEVELS.WARN, message, data);
      logToConsole(entry);
    },

    error(message: string, data?: Partial<Omit<StructuredLogEntry, "level" | "message" | "category" | "correlationId" | "timestamp">>) {
      const entry = formatEntry(LOG_LEVELS.ERROR, message, data);
      logToConsole(entry);
    },

    critical(message: string, data?: Partial<Omit<StructuredLogEntry, "level" | "message" | "category" | "correlationId" | "timestamp">>) {
      const entry = formatEntry(LOG_LEVELS.CRITICAL, message, data);
      logToConsole(entry);
    },

    /**
     * Log an operation with timing.
     * Records start, completes with success/failure and duration.
     */
    async trackOperation<T>(
      operation: string,
      entityType: string,
      entityId: string | undefined,
      fn: () => Promise<T>,
      data?: Record<string, unknown>
    ): Promise<T> {
      const startTime = Date.now();
      logToConsole(formatEntry(LOG_LEVELS.INFO, `${operation} started`, {
        operation,
        entityType,
        entityId,
        metadata: data,
      }));

      try {
        const result = await fn();
        const durationMs = Date.now() - startTime;
        logToConsole(formatEntry(LOG_LEVELS.INFO, `${operation} completed`, {
          operation,
          entityType,
          entityId,
          durationMs,
          success: true,
          metadata: { ...data, durationMs },
        }));
        return result;
      } catch (err) {
        const durationMs = Date.now() - startTime;
        const errorObj = err instanceof Error
          ? { name: err.name, message: err.message }
          : { name: "UnknownError", message: String(err) };

        logToConsole(formatEntry(LOG_LEVELS.ERROR, `${operation} failed`, {
          operation,
          entityType,
          entityId,
          durationMs,
          success: false,
          error: errorObj,
          metadata: data,
        }));

        throw err;
      }
    },

    /**
     * Log an external service call with graceful failure handling.
     * Returns null if the call fails, allowing the caller to degrade gracefully.
     */
    async callExternalService<T>(
      serviceName: string,
      operation: string,
      fn: () => Promise<T>,
      fallback: () => T,
      data?: Record<string, unknown>
    ): Promise<T> {
      const startTime = Date.now();
      logToConsole(formatEntry(LOG_LEVELS.INFO, `External call: ${serviceName}.${operation}`, {
        operation: `${serviceName}.${operation}`,
        metadata: { serviceName, ...data },
      }));

      try {
        const result = await fn();
        const durationMs = Date.now() - startTime;
        logToConsole(formatEntry(LOG_LEVELS.INFO, `External call succeeded: ${serviceName}.${operation}`, {
          operation: `${serviceName}.${operation}`,
          durationMs,
          success: true,
          metadata: { serviceName, durationMs, ...data },
        }));
        return result;
      } catch (err) {
        const durationMs = Date.now() - startTime;
        const errorObj = err instanceof Error
          ? { name: err.name, message: err.message }
          : { name: "UnknownError", message: String(err) };

        logToConsole(formatEntry(LOG_LEVELS.WARN, `External call failed, using fallback: ${serviceName}.${operation}`, {
          operation: `${serviceName}.${operation}`,
          durationMs,
          success: false,
          error: errorObj,
          metadata: { serviceName, degraded: true, ...data },
        }));

        return fallback();
      }
    },
  };
}

// ─── Critical Event Log Storage ──────────────────────────────────────────────

/**
 * Store critical log events for persistent querying.
 * Only ERROR and CRITICAL events are stored to avoid database bloat.
 */
export const storeCriticalEvent = internalMutation({
  args: {
    correlationId: v.string(),
    level: v.string(),
    category: v.string(),
    message: v.string(),
    operation: v.optional(v.string()),
    entityType: v.optional(v.string()),
    entityId: v.optional(v.string()),
    userId: v.optional(v.string()),
    userRole: v.optional(v.string()),
    errorName: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    metadata: v.optional(v.string()),
    timestamp: v.number(),
  },
  handler: async (ctx, args) => {
    // Write to audit_events for persistent storage.
    // This creates a bridge between the logging and audit systems.
    //
    // Actor attribution: these events are SYSTEM-generated (a backend log
    // sink, not a user action), so they are recorded with actorRole "system"
    // and NO actorId — the audit schema deliberately allows omitting actorId
    // for system events. This replaces the former unsafe fallback that picked
    // the first user in the database, which falsely attributed system errors
    // to an arbitrary real user. If the calling context knows which user was
    // involved, that ID is preserved in metadata for traceability — it is
    // never used as the actor.
    await ctx.db.insert("audit_events", {
      actorRole: "system",
      category: "system",
      action: `system.log.${args.level}`,
      entityType: args.entityType ?? "unknown",
      entityId: args.entityId ?? "unknown",
      metadata: JSON.stringify({
        correlationId: args.correlationId,
        level: args.level,
        message: args.message,
        operation: args.operation,
        errorName: args.errorName,
        errorMessage: args.errorMessage,
        ...(args.userId ? { involvedUserId: args.userId } : {}),
        ...(args.userRole ? { involvedUserRole: args.userRole } : {}),
        ...JSON.parse(args.metadata ?? "{}"),
      }),
      timestamp: args.timestamp,
    });
  },
});

// ─── Query for Log Monitoring ────────────────────────────────────────────────

/**
 * Get recent critical events for the Operations Centre.
 */
export const getRecentCriticalEvents = query({
  args: {
    limit: v.optional(v.number()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentAuthUser(ctx);
    if (!user) throw new Error("Authentication required");

    // Only operations and super_admin can view critical events
    const allowed = ["operations", "super_admin"];
    if (!allowed.includes(user.role)) {
      throw new Error("Access denied: requires operations or super_admin role");
    }

    const limit = args.limit ?? 50;

    let q = ctx.db
      .query("audit_events")
      .withIndex("by_category", (q) =>
        q.eq("category", "system")
      )
      .order("desc");

    const events = await q.take(limit * 2);

    // Filter to log events and optionally by category
    return events
      .filter((e) => {
        if (!e.action?.startsWith("system.log.")) return false;
        if (args.category) {
          const meta = e.metadata ? JSON.parse(e.metadata) : {};
          if (meta.category !== args.category) return false;
        }
        return true;
      })
      .slice(0, limit)
      .map((e) => ({
        ...e,
        metadata: e.metadata ? JSON.parse(e.metadata) : {},
      }));
  },
});
