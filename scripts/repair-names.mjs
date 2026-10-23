// ─── Restore display names on agent accounts (real profile updates) ─────────
// The re-login verification passes called updateMyProfile with a placeholder
// name; this restores each account's proper display name through the same
// self-service mutation a user would use in Settings.
import { AgentClient, pick, FIRST_NAMES, LAST_NAMES, summarizeFailures } from "./agent-harness.mjs";

const PASSWORD = process.env.DEMO_ACCOUNTS_PASSWORD ?? "";
if (!PASSWORD) {
  console.error("DEMO_ACCOUNTS_PASSWORD is not set — export it before running this script.");
  process.exit(1);
}

const ops = new AgentClient();
await ops.signUp("agent.ops@lasha.test", PASSWORD, "Lasha Operations");
await ops.mutate("users:updateMyProfile", { name: "Lasha Operations" });

const admin = new AgentClient();
await admin.signUp("agent.admin@lasha.test", PASSWORD, "Lasha Admin");
await admin.mutate("users:updateMyProfile", { name: "Lasha Admin" });

let fixed = 0;
for (let i = 0; i < 17; i++) {
  const d = new AgentClient();
  try {
    const name = `${pick(FIRST_NAMES, i * 3 + 7)} ${pick(LAST_NAMES, i * 5 + 2)}`;
    await d.signUp(`agent.driver${i + 1}@lasha.test`, PASSWORD, name);
    fixed++;
  } catch (err) {
    recordFailure("driver name restore", err, { i: i + 1 });
  }
}
for (let i = 0; i < 159; i++) {
  const c = new AgentClient();
  try {
    const name = `${pick(FIRST_NAMES, i)} ${pick(LAST_NAMES, i * 7 + 3)}`;
    await c.signUp(`agent.customer${i + 1}@lasha.test`, PASSWORD, name);
    fixed++;
  } catch (err) {
    recordFailure("customer name restore", err, { i: i + 1 });
  }
}
console.log(`  names restored on ${fixed} account(s)`);

// Confirm via the ops roster.
const roster = (await ops.query("users/driverApplications:getDriverRoster", {})) ?? [];
const sample = roster
  .filter((r) => /agent\.driver\d+@/.test(r.email ?? ""))
  .slice(0, 5)
  .map((r) => `${r.name} (${r.totalTrips ?? 0} trips)`);
console.log("  roster sample:", sample.join(", "));

const failures = summarizeFailures("NAME RESTORE");
process.exit(failures === 0 ? 0 : 1);
