// Probe: is the Convex deployment serving functions again after the usage-limit pause?
import { ConvexHttpClient } from "convex/browser";
import { loadEnv } from "vite";
const env = loadEnv("development", process.cwd(), "");
const c = new ConvexHttpClient(env.VITE_CONVEX_URL);
try {
  const res = await c.query("users:currentUser", {});
  console.log("PLATFORM-OK anonymous currentUser =", res);
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e);
  console.log(msg.includes("usage limit") ? "STILL-PAUSED" : "ERROR: " + msg.slice(0, 180));
}
try { c.close(); } catch { /* client versions without close() */ }
