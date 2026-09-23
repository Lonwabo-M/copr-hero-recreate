import { ConvexReactClient } from "convex/react";

/**
 * Authoritative backend URL for the whole app.
 *
 * The platform injects VITE_CONVEX_URL at dev-server startup pointing at the
 * old platform-managed deployment (keen-octopus-299), which is paused by a
 * usage limit. The backend has been migrated to the user-owned deployment
 * below (Convex dashboard → team lonwabo-matya → project cladogram →
 * deployment incredible-warbler-335), so this constant takes precedence over
 * the injected env var. To retarget the backend, change this single constant.
 */
export const CONVEX_URL = "https://incredible-warbler-335.convex.cloud";

export const convexClient = new ConvexReactClient(CONVEX_URL);
