/**
 * Lasha GPS Buffering Strategy
 *
 * Manages location updates during connectivity loss.
 * Implements bounded buffering with intelligent sampling.
 *
 * Strategy:
 * 1. Buffer location updates locally when offline
 * 2. Apply sampling to reduce data volume
 * 3. Prioritize recent locations over old ones
 * 4. Sync buffered locations when connectivity returns
 * 5. Discard stale points after sync
 *
 * Design principles:
 * - Battery efficient (don't poll GPS when not needed)
 * - Storage efficient (bounded buffer size)
 * - Network efficient (batch uploads)
 * - Operationally useful (keep the most important points)
 */

import {
  addLocation,
  getBufferedLocations,
  clearBufferedLocations,
  trimLocationBuffer,
  StoredLocation,
} from "./db";
import { isOnline, onConnectivityChange } from "./connectivity";

// ─── Configuration ────────────────────────────────────────────────────────────

const GPS_CONFIG = {
  /** Maximum number of locations to buffer */
  maxBufferSize: 500,

  /** Minimum time between location samples (ms) */
  minSampleInterval: 5000, // 5 seconds

  /** Maximum age of buffered locations (ms) */
  maxAge: 24 * 60 * 60 * 1000, // 24 hours

  /** Distance threshold for sampling (meters) */
  minDistanceMeters: 10, // 10 meters

  /** Batch size for syncing locations */
  syncBatchSize: 50,
};

// ─── GPS State ────────────────────────────────────────────────────────────────

let watchId: number | null = null;
let lastSampleTime: number = 0;
let lastSampleLat: number | null = null;
let lastSampleLng: number | null = null;
let isTracking: boolean = false;

// ─── Haversine Distance ───────────────────────────────────────────────────────

/**
 * Calculate distance between two coordinates in meters.
 */
function haversineDistanceMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// ─── Sampling Logic ───────────────────────────────────────────────────────────

/**
 * Determine if a new location should be sampled.
 * Uses both time-based and distance-based sampling.
 */
function shouldSample(
  lat: number,
  lng: number,
  timestamp: number
): boolean {
  const now = Date.now();

  // Always sample if buffer is empty
  if (lastSampleLat === null || lastSampleLng === null) {
    return true;
  }

  // Time-based sampling
  if (now - lastSampleTime < GPS_CONFIG.minSampleInterval) {
    // Check distance-based exception
    const distance = haversineDistanceMeters(
      lastSampleLat, lastSampleLng,
      lat, lng
    );

    if (distance < GPS_CONFIG.minDistanceMeters) {
      return false; // Too close, skip
    }
  }

  return true;
}

/**
 * Update the last sample state.
 */
function updateSampleState(lat: number, lng: number, timestamp: number): void {
  lastSampleTime = timestamp;
  lastSampleLat = lat;
  lastSampleLng = lng;
}

// ─── Location Processing ──────────────────────────────────────────────────────

/**
 * Process a new GPS location.
 * Applies sampling and buffers if offline.
 */
export async function processLocation(
  lat: number,
  lng: number,
  timestamp: number,
  accuracy?: number,
  speed?: number,
  heading?: number
): Promise<{ buffered: boolean; sampled: boolean }> {
  // Apply sampling
  if (!shouldSample(lat, lng, timestamp)) {
    return { buffered: false, sampled: false };
  }

  updateSampleState(lat, lng, timestamp);

  // If online, we don't buffer (Convex handles it)
  if (isOnline()) {
    return { buffered: false, sampled: true };
  }

  // Buffer the location
  const location: Omit<StoredLocation, "id"> = {
    lat,
    lng,
    timestamp,
    accuracy,
    speed,
    heading,
  };

  await addLocation(location);

  // Trim buffer if needed
  await trimLocationBuffer(GPS_CONFIG.maxBufferSize);

  return { buffered: true, sampled: true };
}

// ─── GPS Tracking Control ─────────────────────────────────────────────────────

/**
 * Start GPS tracking.
 * Uses navigator.geolocation.watchPosition.
 */
export function startTracking(
  onLocation: (location: GeolocationPosition) => void,
  onError?: (error: GeolocationPositionError) => void
): void {
  if (!navigator.geolocation) {
    console.error("Geolocation not supported");
    return;
  }

  if (isTracking) {
    return; // Already tracking
  }

  const options: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 5000,
  };

  watchId = navigator.geolocation.watchPosition(
    (position) => {
      onLocation(position);

      // Process for offline buffering
      processLocation(
        position.coords.latitude,
        position.coords.longitude,
        position.timestamp,
        position.coords.accuracy,
        position.coords.speed ?? undefined,
        position.coords.heading ?? undefined
      );
    },
    (error) => {
      console.error("GPS error:", error);
      onError?.(error);
    },
    options
  );

  isTracking = true;
}

/**
 * Stop GPS tracking.
 */
export function stopTracking(): void {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  isTracking = false;
}

/**
 * Check if GPS tracking is active.
 */
export function isTrackingActive(): boolean {
  return isTracking;
}

// ─── Buffer Management ────────────────────────────────────────────────────────

/**
 * Get all buffered locations.
 */
export async function getBufferedLocationsList(): Promise<StoredLocation[]> {
  return getBufferedLocations();
}

/**
 * Get the number of buffered locations.
 */
export async function getBufferCount(): Promise<number> {
  const locations = await getBufferedLocations();
  return locations.length;
}

/**
 * Clear the location buffer (after successful sync).
 */
export async function clearBuffer(): Promise<void> {
  await clearBufferedLocations();
  lastSampleLat = null;
  lastSampleLng = null;
  lastSampleTime = 0;
}

/**
 * Get a summary of the buffer state.
 */
export async function getBufferSummary(): Promise<{
  count: number;
  oldestTimestamp: number | null;
  newestTimestamp: number | null;
  totalSizeEstimate: number;
}> {
  const locations = await getBufferedLocations();

  if (locations.length === 0) {
    return {
      count: 0,
      oldestTimestamp: null,
      newestTimestamp: null,
      totalSizeEstimate: 0,
    };
  }

  const sorted = [...locations].sort((a, b) => a.timestamp - b.timestamp);

  return {
    count: locations.length,
    oldestTimestamp: sorted[0].timestamp,
    newestTimestamp: sorted[sorted.length - 1].timestamp,
    totalSizeEstimate: locations.length * 100, // ~100 bytes per location
  };
}

// ─── Sync Integration ─────────────────────────────────────────────────────────

/**
 * Prepare buffered locations for sync.
 * Returns a batch of locations to upload.
 */
export async function prepareSyncBatch(): Promise<StoredLocation[]> {
  const locations = await getBufferedLocations();
  return locations.slice(0, GPS_CONFIG.syncBatchSize);
}

/**
 * Mark a batch as synced (remove from buffer).
 */
export async function markBatchSynced(count: number): Promise<void> {
  const locations = await getBufferedLocations();
  const sorted = [...locations].sort((a, b) => a.timestamp - b.timestamp);

  // Remove the oldest 'count' locations
  const toRemove = sorted.slice(0, count);
  const idsToRemove = new Set(toRemove.map(l => l.id));

  // Clear and re-add remaining
  await clearBufferedLocations();
  for (const loc of locations) {
    if (!idsToRemove.has(loc.id)) {
      await addLocation(loc);
    }
  }
}

// ─── Initialization ───────────────────────────────────────────────────────────

/**
 * Initialize GPS module.
 * Sets up connectivity-based tracking management.
 */
export function initGPS(): void {
  // When coming back online, we could trigger a sync
  onConnectivityChange((state) => {
    if (state === "ONLINE") {
      // Sync engine will handle uploading buffered locations
      console.log("GPS: Back online, ready to sync buffered locations");
    }
  });
}
