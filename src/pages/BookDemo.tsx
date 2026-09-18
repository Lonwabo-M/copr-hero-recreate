import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Loader2, CheckCircle2, Building2, CalendarClock, ShieldCheck } from "lucide-react";
import LashaLogo from "@/components/branding/LashaLogo";

// ─── Book a Demo ─────────────────────────────────────────────────────────────
// Public sales page: the single CTA target for "Book a Demo" across the
// landing page. Submits through the demo_requests backend — server-side
// validation, honeypot spam protection, and a per-email rate limit. No auth:
// this is a pre-sales funnel page, so the layout is self-contained (own
// glass navbar + footer strip) rather than the app shells.

const BUSINESS_TYPES = [
  "Retail",
  "Food & Beverage",
  "eCommerce",
  "Manufacturing",
  "Pharmacy",
  "Courier / Logistics",
  "Wholesale",
  "Other",
];

const VOLUMES = [
  "1–50 deliveries / month",
  "50–200 deliveries / month",
  "200–1 000 deliveries / month",
  "1 000+ deliveries / month",
];

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 10,
  border: "1px solid var(--lasha-border-dark)",
  backgroundColor: "rgba(255, 255, 255, 0.05)",
  color: "var(--lasha-ivory)",
  padding: "0 14px",
  fontFamily: "Inter, sans-serif",
  fontSize: 14,
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11.5,
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
  color: "rgba(244, 242, 233, 0.6)",
  marginBottom: 7,
};

export default function BookDemo() {
  const submit = useMutation(api.demo.submitDemoRequest);
  const [form, setForm] = useState({
    businessName: "",
    contactName: "",
    email: "",
    phone: "",
    businessType: "",
    monthlyVolume: "",
    message: "",
  });
  // Honeypot — visually hidden, never announced; bots auto-fill it.
  const [honeypot, setHoneypot] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setStatus("submitting");
    try {
      await submit({
        businessName: form.businessName,
        contactName: form.contactName,
        email: form.email,
        phone: form.phone,
        ...(form.businessType ? { businessType: form.businessType } : {}),
        ...(form.monthlyVolume ? { monthlyVolume: form.monthlyVolume } : {}),
        ...(form.message ? { message: form.message } : {}),
        companyWebsite: honeypot,
        source: "book-demo-page",
      });
      setStatus("done");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Something went wrong — please try again.");
    }
  };

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "var(--lasha-navy)", color: "var(--lasha-ivory)" }}>
      <style>{`
        .bd-input:focus { border-color: var(--lasha-cyan) !important; box-shadow: 0 0 0 3px rgba(7, 148, 181, 0.18); }
        .bd-select { appearance: none; -webkit-appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23f4f2e9' stroke-opacity='0.6' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 14px center; }
        .bd-select option { color: var(--lasha-navy); }
      `}</style>

      {/* Glass navbar — same language as the landing pill, static variant */}
      <header style={{ padding: "16px 16px 0" }}>
        <div
          style={{
            maxWidth: 1280,
            margin: "0 auto",
            height: 64,
            borderRadius: 22,
            backgroundColor: "rgba(8, 38, 49, 0.55)",
            backdropFilter: "blur(10px) saturate(130%)",
            WebkitBackdropFilter: "blur(10px) saturate(130%)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            boxShadow: "0 6px 20px rgba(4, 20, 26, 0.18)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 28px",
          }}
        >
          <a href="/" aria-label="Lasha home" style={{ lineHeight: 0 }}>
            <LashaLogo height={30} asset="landing" />
          </a>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <span style={{ fontSize: 13.5, color: "rgba(244,242,233,0.6)" }}>
              Already shipping with us?
            </span>
            <a href="/auth" className="lasha-btn-primary text-[13px]">
              Login
            </a>
          </div>
        </div>
      </header>

      {/* Hero band */}
      <section style={{ padding: "72px 24px 56px", textAlign: "center" }}>
        <p className="lasha-label" style={{ marginBottom: 18, display: "block" }}>
          Book a Demo
        </p>
        <h1
          className="lasha-heading lasha-heading-dark"
          style={{ fontSize: "clamp(34px, 4.4vw, 58px)", margin: "0 auto", maxWidth: 720 }}
        >
          See your deliveries run{" "}
          <span style={{ color: "var(--lasha-cyan)" }}>before you commit.</span>
        </h1>
        <p
          style={{
            fontSize: 16.5,
            lineHeight: 1.7,
            color: "rgba(244,242,233,0.65)",
            maxWidth: 560,
            margin: "22px auto 0",
          }}
        >
          A 30-minute walkthrough with our operations team — your routes, your
          volumes, live on the Lasha platform. No slides, the real product.
        </p>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 28,
            flexWrap: "wrap",
            marginTop: 30,
          }}
        >
          {[
            { icon: <CalendarClock size={15} />, label: "30 minutes, online" },
            { icon: <Building2 size={15} />, label: "Built for your volumes" },
            { icon: <ShieldCheck size={15} />, label: "No obligation" },
          ].map((c) => (
            <span
              key={c.label}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 500,
                color: "rgba(244,242,233,0.6)",
              }}
            >
              <span style={{ color: "var(--lasha-cyan-light)", display: "inline-flex" }}>{c.icon}</span>
              {c.label}
            </span>
          ))}
        </div>
      </section>

      {/* Form card */}
      <section style={{ padding: "0 24px 110px" }}>
        <div
          style={{
            maxWidth: 760,
            margin: "0 auto",
            borderRadius: 24,
            border: "1px solid rgba(255, 255, 255, 0.12)",
            backgroundColor: "rgba(6, 35, 44, 0.72)",
            backdropFilter: "blur(18px) saturate(150%)",
            WebkitBackdropFilter: "blur(18px) saturate(150%)",
            boxShadow: "0 24px 64px rgba(4, 20, 26, 0.4)",
            padding: "44px 48px",
          }}
        >
          {status === "done" ? (
            <div style={{ textAlign: "center", padding: "36px 0" }}>
              <CheckCircle2 size={52} style={{ color: "var(--lasha-lime)", marginBottom: 22 }} />
              <h2 className="lasha-heading lasha-heading-dark" style={{ fontSize: 28, marginBottom: 14 }}>
                Request received.
              </h2>
              <p style={{ fontSize: 15, lineHeight: 1.7, color: "rgba(244,242,233,0.65)", maxWidth: 420, margin: "0 auto 28px" }}>
                Our operations team will reach out within one business day to
                schedule your walkthrough.
              </p>
              <a href="/" className="lasha-btn-primary text-[14px]">
                Back to home
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
                <div>
                  <label style={labelStyle} htmlFor="bd-business">Business name *</label>
                  <input id="bd-business" className="bd-input" style={inputStyle} value={form.businessName} onChange={set("businessName")} placeholder="e.g. Naidoo Wholesalers (Pty) Ltd" required />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="bd-contact">Your name *</label>
                  <input id="bd-contact" className="bd-input" style={inputStyle} value={form.contactName} onChange={set("contactName")} placeholder="Full name" required />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="bd-email">Work email *</label>
                  <input id="bd-email" type="email" className="bd-input" style={inputStyle} value={form.email} onChange={set("email")} placeholder="you@company.co.za" required />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="bd-phone">Phone *</label>
                  <input id="bd-phone" type="tel" className="bd-input" style={inputStyle} value={form.phone} onChange={set("phone")} placeholder="+27 82 000 0000" required />
                </div>
                <div>
                  <label style={labelStyle} htmlFor="bd-type">Business type</label>
                  <select id="bd-type" className="bd-input bd-select" style={inputStyle} value={form.businessType} onChange={set("businessType")}>
                    <option value="">Select…</option>
                    {BUSINESS_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle} htmlFor="bd-volume">Monthly delivery volume</label>
                  <select id="bd-volume" className="bd-input bd-select" style={inputStyle} value={form.monthlyVolume} onChange={set("monthlyVolume")}>
                    <option value="">Select…</option>
                    {VOLUMES.map((v) => <option key={v} value={v}>{v}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginTop: 18 }}>
                <label style={labelStyle} htmlFor="bd-message">What should we focus on?</label>
                <textarea id="bd-message" style={{ ...inputStyle, height: 96, padding: "12px 14px", resize: "vertical" }} value={form.message} onChange={set("message")} placeholder="Routes, volumes, system integrations — anything you want the demo centred on." />
              </div>

              {/* Honeypot — hidden from humans via CSS, present in the DOM */}
              <div aria-hidden="true" style={{ position: "absolute", left: -9999, top: -9999, height: 0, overflow: "hidden" }}>
                <label htmlFor="bd-website">Company website</label>
                <input id="bd-website" type="text" tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
              </div>

              {error && (
                <p role="alert" style={{ marginTop: 16, fontSize: 13.5, fontWeight: 500, color: "#ff9d9d", backgroundColor: "rgba(198, 40, 40, 0.12)", border: "1px solid rgba(198, 40, 40, 0.3)", borderRadius: 10, padding: "11px 14px" }}>
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={status === "submitting"}
                className="lasha-btn-primary"
                style={{ width: "100%", justifyContent: "center", marginTop: 24, height: 48, fontSize: 15, opacity: status === "submitting" ? 0.7 : 1 }}
              >
                {status === "submitting" ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Sending request…
                  </>
                ) : (
                  "Book my demo"
                )}
              </button>
              <p style={{ marginTop: 14, fontSize: 12, color: "rgba(244,242,233,0.45)", textAlign: "center" }}>
                We use your details only to arrange the demo — no marketing lists.
              </p>
            </form>
          )}
        </div>
      </section>
    </div>
  );
}
