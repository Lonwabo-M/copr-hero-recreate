# Lasha Routing Architecture

## Overview

Lasha implements a provider-agnostic routing layer that abstracts mapping and routing services behind a unified interface. The rest of the application never directly depends on a specific mapping provider.

**Key design principles:**
- Provider abstraction: Swap providers without changing business logic
- Caching: Minimize API calls and reduce latency
- Fallback: Automatic failover to alternative providers
- Error handling: Graceful degradation on provider failures

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ │
│  │ React Hooks  │  │ Convex      │  │ Dispatch Engine │ │
│  │ useRoute()   │  │ Actions     │  │                 │ │
│  │ useETA()     │  │ getRoute()  │  │ scoreRoute()    │ │
│  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘ │
│         │                │                   │           │
│  ┌──────┴────────────────┴───────────────────┴────────┐ │
│  │              Routing Service Facade                 │ │
│  │  • Provider selection                              │ │
│  │  • Caching                                         │ │
│  │  • Fallback logic                                  │ │
│  │  • Error handling                                  │ │
│  └──────────────────────┬─────────────────────────────┘ │
│                         │                               │
│  ┌──────────────────────┴─────────────────────────────┐ │
│  │            Provider Abstraction Layer               │ │
│  │  ┌─────────────────┐  ┌─────────────────────────┐ │ │
│  │  │ RoutingProvider  │  │ RoutingProvider          │ │ │
│  │  │ Interface        │  │ Interface                │ │ │
│  │  └────────┬────────┘  └────────┬─────────────────┘ │ │
│  └───────────┼─────────────────────┼───────────────────┘ │
│              │                     │                     │
│  ┌───────────┴───────────┐ ┌──────┴──────────────────┐ │
│  │ Google Maps Provider  │ │ OSRM Provider           │ │
│  │ (Primary)             │ │ (Fallback)              │ │
│  └───────────────────────┘ └─────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Provider Interface

All routing providers must implement the `RoutingProvider` interface:

```typescript
interface RoutingProvider {
  readonly name: string;
  
  isAvailable(): boolean;
  
  getRoute(request: RouteRequest): Promise<RouteResult>;
  
  getETA(
    origin: Waypoint,
    destination: Waypoint,
    travelMode?: TravelMode
  ): Promise<{ duration: number; eta: number }>;
  
  calculateDistance(
    origin: Waypoint,
    destination: Waypoint,
    travelMode?: TravelMode
  ): Promise<DistanceResult>;
  
  optimizeStops(request: OptimizeStopsRequest): Promise<OptimizedRoute>;
}
```

---

## Normalized Route Format

All providers return routes in the same normalized format:

```typescript
interface RouteResult {
  routeId: string;           // Unique identifier
  provider: string;          // Provider name
  distance: number;          // Total distance in meters
  duration: number;          // Total duration in seconds
  eta: number;               // Estimated arrival time (timestamp)
  geometry: string;          // Encoded polyline
  legs: RouteLeg[];          // Segments between waypoints
  steps: RouteStep[];        // Turn-by-turn instructions
  warnings: RouteWarning[];  // Road warnings/notices
  bounds: {                  // Route bounding box
    northeast: LatLng;
    southwest: LatLng;
  };
}
```

---

## Provider Implementations

### Google Maps (Primary)

- **Requires:** API key
- **Features:** Full routing, ETA, traffic data, directions
- **Limits:** 40,000 requests/month (free tier)
- **Configuration:**

```typescript
{
  name: "google-maps",
  apiKey: process.env.GOOGLE_MAPS_API_KEY,
  priority: 1,
  timeoutMs: 10000,
}
```

### OSRM (Fallback)

- **Requires:** Nothing (uses public server)
- **Features:** Basic routing, distance calculation
- **Limits:** Public server has rate limits
- **Configuration:**

```typescript
{
  name: "osrm",
  priority: 2,
  isFallback: true,
  timeoutMs: 15000,
  baseUrl: "https://router.project-osrm.org",
}
```

---

## Caching Strategy

### Cache Layers

| Cache Type | TTL | Max Size | Purpose |
|------------|-----|----------|---------|
| Route | 5 min | 1000 | Full route results |
| Distance | 15 min | 1000 | Distance calculations |
| ETA | 5 min | 1000 | ETA calculations |
| Optimized | 5 min | 1000 | Stop optimization |

### Cache Key Generation

```typescript
// Route cache key
`${origin.lat},${origin.lng}:${dest.lat},${dest.lng}:${travelMode}`
```

### Cache Events

```typescript
cache.onEvent((event) => {
  switch (event.type) {
    case "hit":    // Cache hit
    case "miss":   // Cache miss
    case "set":    // Cache set
    case "evict":  // Cache eviction
  }
});
```

---

## Provider Fallback

When a provider fails, the system automatically falls back to the next provider:

```
Request → Google Maps (Primary)
         ↓ (fails)
         → OSRM (Fallback)
         ↓ (fails)
         → Error
```

### Fallback Rules

1. Try providers in priority order
2. Only fallback on retryable errors (network, timeout, rate limit)
3. Non-retryable errors (invalid address) stop fallback
4. All errors are logged for monitoring

---

## Error Handling

### Error Codes

| Code | Description | Retryable |
|------|-------------|-----------|
| `NETWORK_ERROR` | Network connectivity issue | Yes |
| `TIMEOUT` | Request timed out | Yes |
| `RATE_LIMITED` | Provider rate limit exceeded | Yes |
| `PROVIDER_UNAVAILABLE` | Provider service unavailable | Yes |
| `INVALID_ORIGIN` | Invalid origin address | No |
| `INVALID_DESTINATION` | Invalid destination address | No |
| `NO_ROUTE_FOUND` | No route exists | No |
| `PROVIDER_ERROR` | General provider error | Yes |

### Retry Strategy

```typescript
{
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
}
```

---

## React Integration

### Basic Route Fetching

```typescript
import { useRoute } from "@/hooks/use-routing";

function RouteDisplay() {
  const { route, isLoading, error, fetchRoute } = useRoute();
  
  useEffect(() => {
    fetchRoute({
      origin: { lat: -33.9249, lng: 18.4241 }, // Cape Town
      destination: { lat: -26.2041, lng: 28.0473 }, // Johannesburg
    });
  }, []);
  
  if (isLoading) return <Spinner />;
  if (error) return <Error message={error.message} />;
  
  return (
    <div>
      <p>Distance: {(route.distance / 1000).toFixed(1)} km</p>
      <p>Duration: {Math.round(route.duration / 60)} min</p>
    </div>
  );
}
```

### Debounced Route Search

```typescript
import { useDebouncedRoute } from "@/hooks/use-routing";

function RouteSearch() {
  const { 
    origin, 
    destination, 
    route, 
    updateOrigin, 
    updateDestination 
  } = useDebouncedRoute({ delay: 500 });
  
  return (
    <div>
      <input 
        placeholder="Origin"
        onChange={(e) => updateOrigin(parseLocation(e.target.value))}
      />
      <input 
        placeholder="Destination"
        onChange={(e) => updateDestination(parseLocation(e.target.value))}
      />
      {route && <RouteInfo route={route} />}
    </div>
  );
}
```

---

## Convex Integration

### Server-Side Routing

For operations requiring API keys or authenticated access:

```typescript
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

function DeliveryEstimate() {
  const getRoute = useAction(api.routing.actions.getRoute);
  
  const estimate = async () => {
    const result = await getRoute({
      origin: { lat: -33.9249, lng: 18.4241 },
      destination: { lat: -26.2041, lng: 28.0473 },
    });
    
    console.log(`ETA: ${new Date(result.eta).toLocaleTimeString()}`);
  };
  
  return <button onClick={estimate}>Get Estimate</button>;
}
```

---

## Configuration

### Default Configuration

```typescript
const DEFAULT_CONFIG: RoutingConfig = {
  providers: [
    { name: "google-maps", priority: 1, timeoutMs: 10000 },
    { name: "osrm", priority: 2, isFallback: true, timeoutMs: 15000 },
  ],
  cache: {
    enabled: true,
    routeTtlMs: 5 * 60 * 1000,
    distanceTtlMs: 15 * 60 * 1000,
    maxSize: 1000,
  },
  defaultTravelMode: "driving",
  defaultPreference: "fastest",
  globalTimeoutMs: 30000,
};
```

### Custom Configuration

```typescript
import { createRoutingService } from "@/lib/routing";

const customService = createRoutingService({
  providers: [
    { name: "osrm", priority: 1 }, // Use OSRM as primary
  ],
  cache: {
    enabled: false, // Disable caching
  },
});
```

---

## Adding a New Provider

1. Create a new file in `src/lib/routing/providers/`:

```typescript
import { RoutingProvider, RouteRequest, RouteResult } from "../types";

export class MyProvider implements RoutingProvider {
  readonly name = "my-provider";
  
  isAvailable(): boolean {
    return !!this.apiKey;
  }
  
  async getRoute(request: RouteRequest): Promise<RouteResult> {
    // Implement routing logic
  }
  
  // ... implement other methods
}
```

2. Register in `src/lib/routing/index.ts`:

```typescript
switch (config.name) {
  case "my-provider":
    providers.push(new MyProvider(config));
    break;
}
```

3. Add to configuration:

```typescript
{
  name: "my-provider",
  apiKey: process.env.MY_PROVIDER_API_KEY,
  priority: 3,
}
```

---

## Integration with Dispatch

The dispatch engine uses routing for:

1. **Proximity scoring** - Calculate distance from driver to pickup
2. **Route compatibility** - Check if driver is on the way
3. **ETA estimation** - Provide delivery time estimates

```typescript
// In dispatch scoring service
const routingService = getRoutingService();

const distanceResult = await routingService.calculateDistance(
  { lat: driverLat, lng: driverLng },
  { lat: pickupLat, lng: pickupLng }
);

// Use routeDistance for scoring
const proximityScore = linearScore(
  distanceResult.routeDistance / 1000, // Convert to km
  0,
  config.maxProximityDistance
);
```

---

## Monitoring

### Events

```typescript
const service = getRoutingService();

service.onEvent((event) => {
  console.log(`[${event.provider}] ${event.type}: ${event.operation}`);
  
  // Track metrics
  if (event.type === "error") {
    metrics.track("routing_error", {
      provider: event.provider,
      code: event.error?.code,
    });
  }
});
```

### Cache Statistics

```typescript
const stats = service.getCacheStats();
console.log(`Cache: ${stats.routes} routes, ${stats.distances} distances`);
```

---

## File Structure

```
src/lib/routing/
├── types.ts              # Interfaces and types
├── cache.ts              # In-memory caching
├── errors.ts             # Error handling and fallback
├── index.ts              # Main service facade
└── providers/
    ├── google-maps.ts    # Google Maps implementation
    └── osrm.ts           # OSRM implementation

src/hooks/
└── use-routing.ts        # React hooks

src/convex/routing/
└── actions.ts            # Convex server-side actions
```
