/**
 * Lasha Real-Time Tracking Configuration
 *
 * This module defines all configurable constants for the tracking system.
 * Separating configuration from logic makes it easy to tune without
 * modifying business logic.
 */

// ─── Location Update Frequency ────────────────────────────────────────────────

/** Minimum interval between location updates from the same driver (ms) */
export const MIN_UPDATE_INTERVAL_MS = 10_000; // 10 seconds

/** Maximum interval before a driver is considered stale (ms) */
export const MAX_STALENESS_MS = 60_000; // 1 minute

/** Interval for active trip tracking (more frequent) */
export const ACTIVE_TRIP_INTERVAL_MS = 5_000; // 5 seconds

// ─── Coordinate Validation ────────────────────────────────────────────────────

/** Valid latitude range */
export const LAT_MIN = -90;
export const LAT_MAX = 90;

/** Valid longitude range */
export const LNG_MIN = -180;
export const LNG_MAX = 180;

/** Maximum speed in km/h (for "reasonable movement" validation) */
export const MAX_SPEED_KMH = 200; // Covers vehicles on highways

// ─── Haversine Constants ──────────────────────────────────────────────────────

/** Earth's radius in kilometers */
export const EARTH_RADIUS_KM = 6371;

// ─── Data Retention ───────────────────────────────────────────────────────────

/** How long to keep high-resolution tracking data (ms) */
export const HIGH_RES_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 hours

/** How long to keep low-resolution tracking data (ms) */
export const LOW_RES_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** Downsample interval for historical data (ms) */
export const DOWNSAMPLE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** Batch size for retention cleanup */
export const RETENTION_BATCH_SIZE = 100;

// ─── Real-Time Subscription ───────────────────────────────────────────────────

/** Maximum number of tracking events to return per query */
export const MAX_TRACKING_EVENTS = 200;

/** Maximum number of recent locations for route history */
export const MAX_ROUTE_HISTORY = 500;
