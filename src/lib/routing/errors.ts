/**
 * Lasha Routing Error Handling
 *
 * Provides error classification, retry logic, and provider fallback.
 */

import {
  RoutingError,
  RoutingErrorCode,
  RoutingProvider,
  RoutingProviderConfig,
} from "./types";

// ─── Error Classification ─────────────────────────────────────────────────────

/**
 * Classify an error from a routing provider.
 */
export function classifyError(error: unknown, provider: string): RoutingError {
  const message = error instanceof Error ? error.message : String(error);

  // Network errors
  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("ECONNREFUSED") ||
    message.includes("ENOTFOUND")
  ) {
    return {
      code: "NETWORK_ERROR",
      message: `Network error from ${provider}: ${message}`,
      provider,
      retryable: true,
      originalError: error,
    };
  }

  // Timeout
  if (
    message.includes("timeout") ||
    message.includes("TIMEOUT") ||
    message.includes("timed out")
  ) {
    return {
      code: "TIMEOUT",
      message: `Request timed out for ${provider}: ${message}`,
      provider,
      retryable: true,
      originalError: error,
    };
  }

  // Rate limiting
  if (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("quota")
  ) {
    return {
      code: "RATE_LIMITED",
      message: `Rate limited by ${provider}: ${message}`,
      provider,
      retryable: true,
      originalError: error,
    };
  }

  // Invalid inputs
  if (
    message.includes("invalid_origin") ||
    message.includes("ZERO_RESULTS") ||
    message.includes("geocode")
  ) {
    return {
      code: "INVALID_ORIGIN",
      message: `Invalid origin address: ${message}`,
      provider,
      retryable: false,
      originalError: error,
    };
  }

  if (
    message.includes("invalid_destination") ||
    message.includes("destination")
  ) {
    return {
      code: "INVALID_DESTINATION",
      message: `Invalid destination address: ${message}`,
      provider,
      retryable: false,
      originalError: error,
    };
  }

  // No route found
  if (
    message.includes("no route") ||
    message.includes("ZERO_RESULTS") ||
    message.includes("NOT_FOUND")
  ) {
    return {
      code: "NO_ROUTE_FOUND",
      message: `No route found: ${message}`,
      provider,
      retryable: false,
      originalError: error,
    };
  }

  // Provider unavailable
  if (
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("unavailable")
  ) {
    return {
      code: "PROVIDER_UNAVAILABLE",
      message: `${provider} is unavailable: ${message}`,
      provider,
      retryable: true,
      originalError: error,
    };
  }

  // Default to provider error
  return {
    code: "PROVIDER_ERROR",
    message: `${provider} error: ${message}`,
    provider,
    retryable: true,
    originalError: error,
  };
}

// ─── Provider Fallback ────────────────────────────────────────────────────────

/**
 * Manages provider fallback logic.
 * Tries providers in priority order, falling back on failure.
 */
export class ProviderFallback {
  private providers: Array<{
    provider: RoutingProvider;
    config: RoutingProviderConfig;
  }> = [];

  constructor(configs: RoutingProviderConfig[], providers: RoutingProvider[]) {
    // Match configs to providers and sort by priority
    const matched = configs
      .map((config) => {
        const provider = providers.find((p) => p.name === config.name);
        if (!provider) return null;
        return { provider, config };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    this.providers = matched.sort(
      (a, b) => (a.config.priority ?? 100) - (b.config.priority ?? 100)
    );
  }

  /**
   * Get available providers in priority order.
   */
  getAvailableProviders(): RoutingProvider[] {
    return this.providers
      .filter(({ provider }) => provider.isAvailable())
      .map(({ provider }) => provider);
  }

  /**
   * Get the primary provider.
   */
  getPrimaryProvider(): RoutingProvider | null {
    const available = this.getAvailableProviders();
    return available[0] ?? null;
  }

  /**
   * Get fallback providers (all except primary).
   */
  getFallbackProviders(): RoutingProvider[] {
    const available = this.getAvailableProviders();
    return available.slice(1);
  }

  /**
   * Get the provider name for error messages.
   */
  getProviderNames(): string[] {
    return this.providers.map(({ provider }) => provider.name);
  }
}

// ─── Retry Logic ──────────────────────────────────────────────────────────────

/**
 * Configuration for retry behavior.
 */
export interface RetryConfig {
  /** Maximum number of retries */
  maxRetries: number;
  /** Base delay in milliseconds */
  baseDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Execute a function with retry logic.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const { maxRetries, baseDelayMs, maxDelayMs, backoffMultiplier } = {
    ...DEFAULT_RETRY_CONFIG,
    ...config,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on last attempt
      if (attempt === maxRetries) break;

      // Calculate delay with exponential backoff
      const delay = Math.min(
        baseDelayMs * Math.pow(backoffMultiplier, attempt),
        maxDelayMs
      );

      // Add jitter to prevent thundering herd
      const jitter = delay * (0.5 + Math.random() * 0.5);

      await sleep(jitter);
    }
  }

  throw lastError;
}

/**
 * Execute with fallback across multiple providers.
 */
export async function withFallback<T>(
  providers: RoutingProvider[],
  operation: (provider: RoutingProvider) => Promise<T>,
  providerErrors: RoutingError[] = []
): Promise<{ result: T; provider: string; errors: RoutingError[] }> {
  const errors = [...providerErrors];

  for (const provider of providers) {
    try {
      const result = await operation(provider);
      return { result, provider: provider.name, errors };
    } catch (error) {
      const routingError = classifyError(error, provider.name);
      errors.push(routingError);

      // Don't fallback on non-retryable errors
      if (!routingError.retryable) {
        throw routingError;
      }
    }
  }

  // All providers failed
  const lastError = errors[errors.length - 1];
  throw lastError ?? {
    code: "PROVIDER_UNAVAILABLE" as RoutingErrorCode,
    message: "All routing providers failed",
    provider: "none",
    retryable: false,
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Sleep for a given duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create an abort controller with timeout.
 */
export function createTimeoutController(timeoutMs: number): AbortController {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Clean up timeout when signal is triggered
  controller.signal.addEventListener("abort", () => {
    clearTimeout(timeoutId);
  });

  return controller;
}
