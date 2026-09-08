/**
 * Lasha Dispatch Scoring Service
 *
 * A configurable scoring algorithm that evaluates candidate drivers for a delivery.
 * The scoring is decoupled from the dispatch engine to allow future replacement
 * with a more sophisticated optimization system (ML, OR-Tools, etc.).
 *
 * Design principles:
 * - All weights and thresholds are configurable
 * - Scoring is pure: given the same inputs, always produces the same output
 * - No side effects: scoring does not modify the database
 * - Testable: easy to unit test individual scoring components
 */

import { Doc, Id } from "../_generated/dataModel";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Delivery context for scoring */
export interface DeliveryContext {
  deliveryId: Id<"deliveries">;
  orderId: Id<"orders">;
  pickupLat: number;
  pickupLng: number;
  dropoffLat: number;
  dropoffLng: number;
  packageWeight: number;      // kg
  packageSize: "small" | "medium" | "large";
  requiresBreaking: boolean;
  requiresExpress: boolean;
  requiresFlammable: boolean;
  requiresTrailer: boolean;
}

/** Driver candidate with all relevant data for scoring */
export interface DriverCandidate {
  driverId: Id<"users">;
  vehicleId: Id<"vehicles">;
  // Driver data
  currentLat: number | undefined;
  currentLng: number | undefined;
  lastLocationUpdate: number | undefined;
  rating: number;              // 0-5
  totalTrips: number;
  isAvailable: boolean;
  // Vehicle data
  vehicleCapacity: number;     // kg
  vehicleBreaking: boolean;
  vehicleExpress: boolean;
  vehicleFlammable: boolean;
  vehicleTrailer: boolean;
  vehicleIsActive: boolean;
  // Workload data
  activeAssignmentCount: number;
  pendingOfferCount: number;
}

/** Individual score component */
export interface ScoreComponent {
  name: string;
  score: number;      // 0-100
  weight: number;     // relative weight
  reason: string;
}

/** Final scoring result */
export interface ScoringResult {
  candidate: DriverCandidate;
  totalScore: number;
  components: ScoreComponent[];
  isEligible: boolean;
  ineligibilityReason?: string;
}

/** Scoring configuration */
export interface ScoringConfig {
  // Weights for each scoring dimension (must sum to 1.0)
  weights: {
    proximity: number;
    availability: number;
    capacity: number;
    rating: number;
    workload: number;
    routeCompatibility: number;
  };
  // Thresholds
  maxProximityDistance: number;      // km - drivers beyond this get 0 proximity score
  maxActiveAssignments: number;      // max concurrent assignments per driver
  maxPendingOffers: number;          // max pending offers per driver
  offerExpiryMs: number;             // milliseconds until offer expires
  // Eligibility requirements
  minDriverRating: number;           // minimum rating to be eligible
  minDriverTrips: number;            // minimum trips for new drivers
  locationStalenessThresholdMs: number; // max age of location data
}

// ─── Default Configuration ────────────────────────────────────────────────────

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  weights: {
    proximity: 0.35,
    availability: 0.15,
    capacity: 0.20,
    rating: 0.15,
    workload: 0.10,
    routeCompatibility: 0.05,
  },
  maxProximityDistance: 50,          // 50 km
  maxActiveAssignments: 3,
  maxPendingOffers: 2,
  offerExpiryMs: 2 * 60 * 1000,     // 2 minutes
  minDriverRating: 3.0,
  minDriverTrips: 5,
  locationStalenessThresholdMs: 15 * 60 * 1000, // 15 minutes
};

// ─── Utility Functions ────────────────────────────────────────────────────────

/**
 * Calculate Haversine distance between two coordinates.
 * Returns distance in kilometers.
 */
export function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371; // Earth's radius in km
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

/**
 * Linear interpolation from a value to a 0-100 score.
 * value closer to min gets 100, value closer to max gets 0.
 */
function linearScore(value: number, min: number, max: number): number {
  if (max === min) return 100;
  const normalized = (value - min) / (max - min);
  return Math.max(0, Math.min(100, (1 - normalized) * 100));
}

// ─── Scoring Components ───────────────────────────────────────────────────────

/**
 * Score proximity: how close the driver is to the pickup location.
 * Closer drivers score higher.
 */
export function scoreProximity(
  candidate: DriverCandidate,
  delivery: DeliveryContext,
  config: ScoringConfig
): ScoreComponent {
  // If no location data, give neutral score
  if (candidate.currentLat === undefined || candidate.currentLng === undefined) {
    return {
      name: "proximity",
      score: 50,
      weight: config.weights.proximity,
      reason: "No location data available",
    };
  }

  const distance = haversineDistance(
    candidate.currentLat, candidate.currentLng,
    delivery.pickupLat, delivery.pickupLng
  );

  // Check if location data is stale
  const now = Date.now();
  const locationAge = candidate.lastLocationUpdate
    ? now - candidate.lastLocationUpdate
    : Infinity;

  let score: number;
  let reason: string;

  if (locationAge > config.locationStalenessThresholdMs) {
    // Stale location: reduce score but don't zero it
    score = linearScore(distance, 0, config.maxProximityDistance) * 0.5;
    reason = `${distance.toFixed(1)}km away (stale location)`;
  } else {
    score = linearScore(distance, 0, config.maxProximityDistance);
    reason = `${distance.toFixed(1)}km away`;
  }

  return {
    name: "proximity",
    score,
    weight: config.weights.proximity,
    reason,
  };
}

/**
 * Score availability: is the driver available and not overloaded?
 */
export function scoreAvailability(
  candidate: DriverCandidate,
  _delivery: DeliveryContext,
  config: ScoringConfig
): ScoreComponent {
  let score = 0;
  const reasons: string[] = [];

  // Driver must be available
  if (!candidate.isAvailable) {
    return {
      name: "availability",
      score: 0,
      weight: config.weights.availability,
      reason: "Driver not available",
    };
  }

  // Vehicle must be active
  if (!candidate.vehicleIsActive) {
    return {
      name: "availability",
      score: 0,
      weight: config.weights.availability,
      reason: "Vehicle not active",
    };
  }

  // Base score for being available
  score = 60;
  reasons.push("available");

  // Bonus for low workload
  const assignmentRatio = candidate.activeAssignmentCount / config.maxActiveAssignments;
  const workloadScore = linearScore(assignmentRatio, 0, 1);
  score = score * 0.5 + workloadScore * 50;
  reasons.push(`${candidate.activeAssignmentCount} active assignments`);

  // Penalty for pending offers (driver might be busy deciding)
  if (candidate.pendingOfferCount > 0) {
    score *= (1 - candidate.pendingOfferCount * 0.15);
    reasons.push(`${candidate.pendingOfferCount} pending offers`);
  }

  return {
    name: "availability",
    score,
    weight: config.weights.availability,
    reason: reasons.join(", "),
  };
}

/**
 * Score capacity: can the vehicle handle the package?
 */
export function scoreCapacity(
  candidate: DriverCandidate,
  delivery: DeliveryContext,
  config: ScoringConfig
): ScoreComponent {
  const reasons: string[] = [];

  // Weight capacity check
  if (candidate.vehicleCapacity < delivery.packageWeight) {
    return {
      name: "capacity",
      score: 0,
      weight: config.weights.capacity,
      reason: `Vehicle capacity ${candidate.vehicleCapacity}kg < ${delivery.packageWeight}kg required`,
    };
  }
  reasons.push(`${candidate.vehicleCapacity}kg capacity`);

  // Capability matching
  let capabilityScore = 100;
  if (delivery.requiresBreaking && !candidate.vehicleBreaking) {
    capabilityScore -= 40;
    reasons.push("missing breaking capability");
  }
  if (delivery.requiresFlammable && !candidate.vehicleFlammable) {
    capabilityScore -= 40;
    reasons.push("missing flammable capability");
  }
  if (delivery.requiresTrailer && !candidate.vehicleTrailer) {
    capabilityScore -= 40;
    reasons.push("missing trailer capability");
  }

  // Capacity headroom bonus (more headroom = better)
  const capacityRatio = delivery.packageWeight / candidate.vehicleCapacity;
  const headroomScore = linearScore(capacityRatio, 0, 1);
  const score = capabilityScore * 0.6 + headroomScore * 40;

  return {
    name: "capacity",
    score,
    weight: config.weights.capacity,
    reason: reasons.join(", "),
  };
}

/**
 * Score rating: driver's historical performance.
 */
export function scoreRating(
  candidate: DriverCandidate,
  _delivery: DeliveryContext,
  config: ScoringConfig
): ScoreComponent {
  // Map 0-5 rating to 0-100 score
  const score = (candidate.rating / 5) * 100;
  let reason = `Rating: ${candidate.rating.toFixed(1)}/5`;

  // Bonus for experienced drivers
  if (candidate.totalTrips > 100) {
    reason += ` (${candidate.totalTrips} trips)`;
  } else if (candidate.totalTrips > 20) {
    reason += ` (${candidate.totalTrips} trips)`;
  }

  return {
    name: "rating",
    score,
    weight: config.weights.rating,
    reason,
  };
}

/**
 * Score workload: prefer drivers with lighter current workload.
 */
export function scoreWorkload(
  candidate: DriverCandidate,
  _delivery: DeliveryContext,
  config: ScoringConfig
): ScoreComponent {
  const assignmentRatio = candidate.activeAssignmentCount / config.maxActiveAssignments;
  const score = linearScore(assignmentRatio, 0, 1);

  return {
    name: "workload",
    score,
    weight: config.weights.workload,
    reason: `${candidate.activeAssignmentCount}/${config.maxActiveAssignments} assignments`,
  };
}

/**
 * Score route compatibility: does the driver's likely route match?
 * This is a simplified version - in production, this would use
 * route optimization data from a mapping service.
 */
export function scoreRouteCompatibility(
  candidate: DriverCandidate,
  delivery: DeliveryContext,
  config: ScoringConfig
): ScoreComponent {
  // Simple heuristic: if driver is roughly between pickup and dropoff
  // or heading in the right direction, they get a higher score.
  // This would be replaced by actual route data in production.

  if (candidate.currentLat === undefined || candidate.currentLng === undefined) {
    return {
      name: "routeCompatibility",
      score: 50,
      weight: config.weights.routeCompatibility,
      reason: "No location data for route analysis",
    };
  }

  // Check if driver is roughly on the way
  const distToPickup = haversineDistance(
    candidate.currentLat, candidate.currentLng,
    delivery.pickupLat, delivery.pickupLng
  );
  const distToDropoff = haversineDistance(
    candidate.currentLat, candidate.currentLng,
    delivery.dropoffLat, delivery.dropoffLng
  );
  const directDistance = haversineDistance(
    delivery.pickupLat, delivery.pickupLng,
    delivery.dropoffLat, delivery.dropoffLng
  );

  // If driver is between pickup and dropoff (roughly), score higher
  const detour = (distToPickup + directDistance) - distToDropoff;
  const score = linearScore(Math.max(0, detour), 0, config.maxProximityDistance);

  return {
    name: "routeCompatibility",
    score,
    weight: config.weights.routeCompatibility,
    reason: `Detour factor: ${detour.toFixed(1)}km`,
  };
}

// ─── Scoring Service ──────────────────────────────────────────────────────────

/**
 * DispatchScoringService: Configurable scoring for driver candidates.
 *
 * This service is intentionally stateless and pure. Given the same inputs,
 * it always produces the same output. This makes it:
 * - Easy to test
 * - Easy to swap with a different algorithm
 * - Safe to run multiple times without side effects
 */
export class DispatchScoringService {
  private config: ScoringConfig;

  constructor(config: Partial<ScoringConfig> = {}) {
    this.config = { ...DEFAULT_SCORING_CONFIG, ...config };
    // Merge nested weights
    if (config.weights) {
      this.config.weights = { ...DEFAULT_SCORING_CONFIG.weights, ...config.weights };
    }
  }

  /**
   * Get the current scoring configuration.
   */
  getConfig(): ScoringConfig {
    return { ...this.config };
  }

  /**
   * Check if a candidate is eligible for assignment.
   * Returns eligibility status and reason if ineligible.
   */
  checkEligibility(candidate: DriverCandidate): { eligible: boolean; reason?: string } {
    // Driver must be available
    if (!candidate.isAvailable) {
      return { eligible: false, reason: "Driver not available" };
    }

    // Vehicle must be active
    if (!candidate.vehicleIsActive) {
      return { eligible: false, reason: "Vehicle not active" };
    }

    // Rating threshold
    if (candidate.rating < this.config.minDriverRating) {
      return {
        eligible: false,
        reason: `Rating ${candidate.rating.toFixed(1)} below minimum ${this.config.minDriverRating}`,
      };
    }

    // Experience threshold
    if (candidate.totalTrips < this.config.minDriverTrips) {
      return {
        eligible: false,
        reason: `${candidate.totalTrips} trips below minimum ${this.config.minDriverTrips}`,
      };
    }

    // Workload threshold
    if (candidate.activeAssignmentCount >= this.config.maxActiveAssignments) {
      return {
        eligible: false,
        reason: `At max capacity (${candidate.activeAssignmentCount}/${this.config.maxActiveAssignments} assignments)`,
      };
    }

    // Pending offer threshold
    if (candidate.pendingOfferCount >= this.config.maxPendingOffers) {
      return {
        eligible: false,
        reason: `Too many pending offers (${candidate.pendingOfferCount}/${this.config.maxPendingOffers})`,
      };
    }

    return { eligible: true };
  }

  /**
   * Score a single candidate against a delivery.
   * Returns detailed scoring breakdown.
   */
  scoreCandidate(
    candidate: DriverCandidate,
    delivery: DeliveryContext
  ): ScoringResult {
    // Check eligibility first
    const eligibility = this.checkEligibility(candidate);
    if (!eligibility.eligible) {
      return {
        candidate,
        totalScore: 0,
        components: [],
        isEligible: false,
        ineligibilityReason: eligibility.reason,
      };
    }

    // Calculate individual scores
    const components: ScoreComponent[] = [
      scoreProximity(candidate, delivery, this.config),
      scoreAvailability(candidate, delivery, this.config),
      scoreCapacity(candidate, delivery, this.config),
      scoreRating(candidate, delivery, this.config),
      scoreWorkload(candidate, delivery, this.config),
      scoreRouteCompatibility(candidate, delivery, this.config),
    ];

    // Calculate weighted total
    let totalScore = 0;
    let totalWeight = 0;
    for (const component of components) {
      totalScore += component.score * component.weight;
      totalWeight += component.weight;
    }

    // Normalize if weights don't sum to 1
    if (totalWeight > 0) {
      totalScore = totalScore / totalWeight;
    }

    return {
      candidate,
      totalScore: Math.round(totalScore * 100) / 100, // 2 decimal places
      components,
      isEligible: true,
    };
  }

  /**
   * Score and rank multiple candidates.
   * Returns candidates sorted by total score (highest first).
   */
  rankCandidates(
    candidates: DriverCandidate[],
    delivery: DeliveryContext
  ): ScoringResult[] {
    const results = candidates.map(c => this.scoreCandidate(c, delivery));

    // Sort by total score descending
    return results.sort((a, b) => {
      // Eligible candidates always rank higher
      if (a.isEligible !== b.isEligible) {
        return a.isEligible ? -1 : 1;
      }
      return b.totalScore - a.totalScore;
    });
  }

  /**
   * Get the offer expiry time in milliseconds.
   */
  getOfferExpiryMs(): number {
    return this.config.offerExpiryMs;
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a DispatchScoringService with custom configuration.
 */
export function createScoringService(
  config?: Partial<ScoringConfig>
): DispatchScoringService {
  return new DispatchScoringService(config);
}

/**
 * Create a scoring service with production-ready defaults.
 */
export function createProductionScoringService(): DispatchScoringService {
  return new DispatchScoringService(DEFAULT_SCORING_CONFIG);
}
