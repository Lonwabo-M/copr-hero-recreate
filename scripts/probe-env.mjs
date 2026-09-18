// Probe: read VITE_CONVEX_URL the same way the app does (via Vite's env
// loading) without printing the value, then verify the deployment answers.
import { loadEnv } from "vite";

const env = loadEnv("development", process.cwd(), "");
console.log("VITE_CONVEX_URL present:", Boolean(env.VITE_CONVEX_URL));
if (!env.VITE_CONVEX_URL) {
  console.error("FATAL: VITE_CONVEX_URL not found in project env files");
  process.exit(1);
}
const u = new URL(env.VITE_CONVEX_URL);
console.log("host:", u.host, "protocol:", u.protocol);

// Connectivity probe — Convex deployments answer a POST of an empty query
// batch on /api/query; any HTTP response (even 4xx) proves reachability.
const res = await fetch(u.origin + "/instance_name", { method: "GET" }).catch(
  (e) => null
);
console.log("reachability probe status:", res ? res.status : "network error");
