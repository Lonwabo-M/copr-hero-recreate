import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import AdminShell from "@/components/shells/AdminShell";
import { Loader2, PowerOff, Tag, Package, Gauge, Percent } from "lucide-react";
import "@/styles/dashboard.css";
import "@/styles/operations.css";

// ─── Pricing Rules (Admin Portal) ────────────────────────────────────────────
// Platform pricing configuration: the rule matrix that quotes are calculated
// from (base + per-km + per-kg, with platform fee and expedition surcharges).
// Creating rules is a deliberate, versioned backend action; this page exposes
// the live rule set and the retire action (deactivation is audited server-side
// and takes effect on the next quote).

type PricingRuleRow = {
  _id: string;
  name: string;
  packageSize: string;
  parcelType?: string;
  expeditionType: string;
  basePrice: number;
  pricePerKm: number;
  pricePerKg: number;
  minimumPrice: number;
  platformFeeType: "percentage" | "flat";
  platformFeeValue: number;
  expressSurcharge?: number;
  sameDaySurcharge?: number;
  version: number;
  effectiveFrom: number;
};

function money(cents: number): string {
  return `R ${(cents / 100).toFixed(2)}`;
}

function RuleCard({ rule, retiring, onDeactivate }: {
  rule: PricingRuleRow;
  retiring: boolean;
  onDeactivate: (id: string) => void;
}) {
  return (
    <div className="ops-stat-card" style={{ padding: 18, cursor: "default" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="ops-stat-icon" style={{ width: 30, height: 30 }}><Tag size={15} /></span>
            <strong style={{ fontSize: 14 }}>{rule.name}</strong>
          </div>
          <div style={{ marginTop: 6, fontSize: 12.5, color: "#666" }}>
            {rule.packageSize} · {rule.expeditionType}
            {rule.parcelType ? ` · ${rule.parcelType}` : ""}
            <span style={{ color: "#9A9A9A" }}> · v{rule.version}</span>
          </div>
        </div>
        <button
          className="ops-tab"
          style={{ color: "#C62828", borderColor: "rgba(198,40,40,0.35)" }}
          disabled={retiring}
          onClick={() => onDeactivate(rule._id)}
          title="Retire this rule — new quotes stop using it"
        >
          <PowerOff size={13} />
          <span>Retire</span>
        </button>
      </div>

      <div style={{ display: "flex", gap: 18, marginTop: 14, flexWrap: "wrap", fontSize: 12.5 }}>
        <span><Package size={12} style={{ verticalAlign: -1, marginRight: 4, color: "#0794B5" }} />Base {money(rule.basePrice)}</span>
        <span><Gauge size={12} style={{ verticalAlign: -1, marginRight: 4, color: "#0794B5" }} />{money(rule.pricePerKm)}/km</span>
        <span><Gauge size={12} style={{ verticalAlign: -1, marginRight: 4, color: "#0794B5" }} />{money(rule.pricePerKg)}/kg</span>
        <span style={{ color: "#666" }}>min {money(rule.minimumPrice)}</span>
      </div>

      <div style={{ display: "flex", gap: 18, marginTop: 8, flexWrap: "wrap", fontSize: 12, color: "#856404" }}>
        <span>
          <Percent size={12} style={{ verticalAlign: -1, marginRight: 4 }} />
          Platform fee: {rule.platformFeeType === "percentage" ? `${rule.platformFeeValue}%` : money(rule.platformFeeValue)}
        </span>
        {rule.expressSurcharge != null && rule.expressSurcharge > 0 && (
          <span>Express +{money(rule.expressSurcharge)}</span>
        )}
        {rule.sameDaySurcharge != null && rule.sameDaySurcharge > 0 && (
          <span>Same-day +{money(rule.sameDaySurcharge)}</span>
        )}
      </div>
    </div>
  );
}

export default function AdminPricingRules() {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const rules = useQuery(api.pricing.service.getActivePricingRules, {});
  const deactivateRule = useMutation(api.pricing.service.deactivatePricingRule);

  const handleDeactivate = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await deactivateRule({ ruleId: id as any });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not retire the rule");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AdminShell activeItem="Pricing Rules">
      <main className="ops-main">
        <div className="ops-page-head">
          <span className="ops-page-eyebrow">Admin Portal</span>
          <h1 className="ops-page-title">Pricing Rules</h1>
        </div>
        <p style={{ marginTop: -6, marginBottom: 18, fontSize: 13, color: "#666", maxWidth: 640 }}>
          The live rule matrix behind every quote. Retiring a rule stops new quotes
          from using it; the change is audit-logged. Creating new versions is a
          controlled backend action.
        </p>

        {error && (
          <div style={{ marginBottom: 14, fontSize: 13, fontWeight: 600, color: "#C62828" }}>
            {error}
          </div>
        )}

        {rules === undefined ? (
          <div style={{ display: "flex", justifyContent: "center", padding: 48 }}>
            <Loader2 size={22} className="animate-spin" style={{ color: "#999" }} />
          </div>
        ) : rules.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Tag size={24} /></div>
            <div className="empty-state-title">No active pricing rules</div>
            <div className="empty-state-desc">Quotes cannot be calculated until a rule is active.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 14 }}>
            {rules.map((rule) => (
              <RuleCard
                key={rule._id}
                rule={rule as unknown as PricingRuleRow}
                retiring={busyId === rule._id}
                onDeactivate={handleDeactivate}
              />
            ))}
          </div>
        )}
      </main>
    </AdminShell>
  );
}
