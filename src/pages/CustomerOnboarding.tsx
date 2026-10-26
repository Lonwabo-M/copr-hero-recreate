import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowRight, ArrowLeft, Loader2, Check, MapPin } from "lucide-react";

// ─── Customer Onboarding ─────────────────────────────────────────────────────
// Multi-step onboarding for newly registered Customer accounts, following the
// Lasha design system (tokens, typography, inputs, buttons from Auth.tsx) and
// the onboarding reference screens: spacious centered form, prominent heading,
// two-column fields on desktop, Back/Next navigation, progress indication.
//
// Steps: 1 Business details → 2 About you → 3 Collections → complete.
//
// Security model: data is saved through users/onboarding.ts, which derives
// identity from the authenticated session — the client never submits user or
// business IDs. Client validation is UX only; the server remains authoritative.
// Completed customers are redirected to /dashboard and never re-onboarded.

const STEPS = ["Business details", "About you", "Collections"] as const;

interface OnboardingForm {
  // Step 1
  businessName: string;
  businessType: string;
  registrationNumber: string;
  businessPhone: string;
  businessAddress: string;
  // Step 2
  fullName: string;
  phone: string;
  // Step 3
  addressLabel: string;
  street: string;
  city: string;
  province: string;
  postalCode: string;
}

const EMPTY_FORM: OnboardingForm = {
  businessName: "",
  businessType: "",
  registrationNumber: "",
  businessPhone: "",
  businessAddress: "",
  fullName: "",
  phone: "",
  addressLabel: "",
  street: "",
  city: "",
  province: "",
  postalCode: "",
};

function validateEmail(email: string): string | null {
  if (!email.trim()) return null; // display-only on this screen
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return "Enter a valid email address";
  return null;
}

/** Per-step validation. Returns the first error, or null when the step is valid. */
function validateStep(step: number, form: OnboardingForm): string | null {
  const req = (v: string, label: string) => (!v.trim() ? `${label} is required` : null);
  switch (step) {
    case 0:
      return (
        req(form.businessName, "Business legal name") ??
        (form.businessPhone.trim() && !/^\+?[0-9\s()-]{3,20}$/.test(form.businessPhone.trim())
          ? "Enter a valid business phone number"
          : null)
      );
    case 1:
      return (
        req(form.fullName, "Full name") ??
        req(form.phone, "Phone number") ??
        (!/^\+?[0-9\s()-]{3,20}$/.test(form.phone.trim())
          ? "Enter a valid phone number"
          : null)
      );
    case 2:
      return (
        req(form.street, "Street address") ??
        req(form.city, "City") ??
        req(form.postalCode, "Postal code")
      );
    default:
      return null;
  }
}

export default function CustomerOnboarding() {
  const navigate = useNavigate();
  const status = useQuery(api.users.onboarding.getOnboardingStatus);
  const completeOnboarding = useMutation(api.users.onboarding.completeCustomerOnboarding);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OnboardingForm>(EMPTY_FORM);
  const [prefilled, setPrefilled] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Prefill once from stored backend data (never lose already-saved values).
  useEffect(() => {
    if (status && !prefilled) {
      setForm({
        ...EMPTY_FORM,
        businessName: status.business?.name ?? "",
        businessType: status.business?.industry ?? "",
        registrationNumber: status.business?.registrationNumber ?? "",
        businessPhone: status.business?.phone ?? "",
        businessAddress: status.business?.address ?? "",
        fullName: status.user.name ?? "",
        phone: status.user.phone ?? "",
        addressLabel: status.defaultAddress?.label ?? "",
        street: status.defaultAddress?.street ?? "",
        city: status.defaultAddress?.city ?? "",
        province: status.defaultAddress?.state ?? "",
        postalCode: status.defaultAddress?.zip ?? "",
      });
      setPrefilled(true);
    }
  }, [status, prefilled]);

  // Already onboarded (or non-customer) → straight to the portal.
  useEffect(() => {
    if (status?.complete) {
      navigate("/dashboard", { replace: true });
    }
  }, [status, navigate]);

  const set = (key: keyof OnboardingForm) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleNext = () => {
    const validationError = validateStep(step, form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0 });
  };

  const handleBack = () => {
    setError("");
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0 });
  };

  const handleComplete = async () => {
    // Validate every step before the final submit.
    for (let i = 0; i < STEPS.length; i++) {
      const validationError = validateStep(i, form);
      if (validationError) {
        setStep(i);
        setError(validationError);
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      await completeOnboarding({
        businessName: form.businessName.trim(),
        businessType: form.businessType.trim() || undefined,
        registrationNumber: form.registrationNumber.trim() || undefined,
        businessPhone: form.businessPhone.trim() || undefined,
        businessAddress: form.businessAddress.trim() || undefined,
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        addressLabel: form.addressLabel.trim() || undefined,
        street: form.street.trim(),
        city: form.city.trim(),
        province: form.province.trim() || undefined,
        postalCode: form.postalCode.trim(),
      });
      // Only a confirmed server success navigates to the portal.
      navigate("/dashboard", { replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not save your information";
      setError(message.length < 160 ? message : "Could not save your information. Please try again.");
      setSaving(false);
    }
  };

  const inputStyle = useMemo(
    (): React.CSSProperties => ({
      width: "100%",
      padding: "14px 18px",
      fontSize: 15,
      fontFamily: "Inter, sans-serif",
      color: "var(--lasha-navy)",
      backgroundColor: "#ffffff",
      border: "1px solid var(--lasha-border-light)",
      borderRadius: 12,
      outline: "none",
      transition: "border-color 0.2s",
      boxSizing: "border-box",
    }),
    []
  );

  const field = (
    label: string,
    key: keyof OnboardingForm,
    opts?: { type?: string; placeholder?: string; autoComplete?: string; required?: boolean; maxLength?: number }
  ) => (
    <div>
      <label
        htmlFor={`onboarding-${key}`}
        className="lasha-label"
        style={{ fontSize: 9, color: "var(--lasha-muted)", display: "block", marginBottom: 8 }}
      >
        {label}
        {opts?.required === false ? " (optional)" : ""}
      </label>
      <input
        id={`onboarding-${key}`}
        type={opts?.type ?? "text"}
        value={form[key]}
        onChange={(e) => set(key)(e.target.value)}
        placeholder={opts?.placeholder}
        autoComplete={opts?.autoComplete}
        maxLength={opts?.maxLength}
        required={opts?.required}
        style={inputStyle}
        onFocus={(e) => (e.currentTarget.style.borderColor = "var(--lasha-cyan)")}
        onBlur={(e) => (e.currentTarget.style.borderColor = "var(--lasha-border-light)")}
      />
    </div>
  );

  if (status === undefined) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "var(--lasha-ivory)",
          fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        }}
      >
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--lasha-cyan)" }} />
      </main>
    );
  }

  if (status === null) {
    // Session failure — send to sign-in rather than faking the flow.
    navigate("/auth?returnTo=%2Fonboarding%2Fcustomer", { replace: true });
    return null;
  }

  const progressPercent = ((step + 1) / STEPS.length) * 100;

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "var(--lasha-ivory)",
        fontFamily: "Inter, system-ui, -apple-system, sans-serif",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header — logo + progress, matching Lasha header treatment */}
      <header
        style={{
          borderBottom: "1px solid var(--lasha-border-light)",
          backgroundColor: "#ffffff",
        }}
      >
        <div
          style={{
            maxWidth: 1040,
            margin: "0 auto",
            padding: "20px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <img
            src="/assets/21.png"
            alt="Lasha"
            style={{ height: 32, width: "auto", objectFit: "contain" }}
            onError={(e) => {
              const img = e.currentTarget;
              if (img.dataset.fallback === "1") return;
              img.dataset.fallback = "1";
              img.style.display = "none";
            }}
          />
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            {/* Abort onboarding → back to the public landing page. */}
            <button
              type="button"
              onClick={() => navigate("/")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                background: "none",
                border: "none",
                color: "var(--lasha-cyan)",
                fontFamily: "Inter, sans-serif",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
                padding: 0,
              }}
            >
              <ArrowLeft size={14} />
              Home
            </button>
            <span
              className="lasha-label"
              style={{ fontSize: 10, color: "var(--lasha-cyan)" }}
            >
              Step {step + 1} of {STEPS.length}
            </span>
          </div>
        </div>
        <div style={{ height: 3, backgroundColor: "var(--lasha-ivory-dark)" }}>
          <div
            style={{
              height: "100%",
              width: `${progressPercent}%`,
              backgroundColor: "var(--lasha-cyan)",
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </header>

      {/* Content — large centered area like the reference screens */}
      <main style={{ flex: 1, width: "100%" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "56px 24px 96px" }}>
          <p className="lasha-label" style={{ fontSize: 10, marginBottom: 14 }}>
            {STEPS[step]}
          </p>
          <h1
            style={{
              fontSize: "clamp(28px, 4vw, 40px)",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: "var(--lasha-navy)",
              lineHeight: 1.1,
              marginBottom: 12,
            }}
          >
            {step === 0 && (
              <>
                Tell us about your
                <br />
                business
              </>
            )}
            {step === 1 && (
              <>
                Now, about
                <br />
                you
              </>
            )}
            {step === 2 && (
              <>
                Where should we
                <br />
                collect?
              </>
            )}
          </h1>
          <p className="lasha-body" style={{ fontSize: 15, color: "var(--lasha-muted)", marginBottom: 40 }}>
            {step === 0 &&
              "We use these details to set up your Lasha account for deliveries."}
            {step === 1 &&
              "Your contact details help drivers and our team reach you about your deliveries."}
            {step === 2 &&
              "This is the default address where drivers will collect your parcels."}
          </p>

          {error && (
            <div
              role="alert"
              style={{
                padding: "12px 16px",
                borderRadius: 10,
                backgroundColor: "#fef2f2",
                border: "1px solid #fecaca",
                marginBottom: 24,
              }}
            >
              <p style={{ fontSize: 13, color: "#b91c1c" }}>{error}</p>
            </div>
          )}

          {/* Step 1 — Business details */}
          {step === 0 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "20px 24px",
              }}
            >
              {field("Business legal name", "businessName", {
                placeholder: "Acme Logistics (Pty) Ltd",
                autoComplete: "organization",
                required: true,
                maxLength: 120,
              })}
              {field("Business type", "businessType", {
                placeholder: "Retail, Manufacturing, E-commerce…",
                required: false,
                maxLength: 60,
              })}
              {field("Registration number", "registrationNumber", {
                placeholder: "2016/123456/07",
                required: false,
                maxLength: 50,
              })}
              {field("Business phone", "businessPhone", {
                type: "tel",
                placeholder: "+27 11 234 5678",
                autoComplete: "tel",
                required: false,
                maxLength: 20,
              })}
              <div style={{ gridColumn: "1 / -1" }}>
                {field("Registered business address", "businessAddress", {
                  placeholder: "12 Main Road, Woodmead, Johannesburg, 2196",
                  autoComplete: "street-address",
                  required: false,
                  maxLength: 200,
                })}
              </div>
            </div>
          )}

          {/* Step 2 — About you */}
          {step === 1 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "20px 24px",
              }}
            >
              {field("Full name", "fullName", {
                placeholder: "Thabo Mokoena",
                autoComplete: "name",
                required: true,
                maxLength: 100,
              })}
              {field("Phone number", "phone", {
                type: "tel",
                placeholder: "+27 82 123 4567",
                autoComplete: "tel",
                required: true,
                maxLength: 20,
              })}
              <div style={{ gridColumn: "1 / -1" }}>
                <label
                  htmlFor="onboarding-email-display"
                  className="lasha-label"
                  style={{ fontSize: 9, color: "var(--lasha-muted)", display: "block", marginBottom: 8 }}
                >
                  Account email
                </label>
                <input
                  id="onboarding-email-display"
                  type="email"
                  value={status.user.email}
                  readOnly
                  aria-readonly="true"
                  style={{ ...inputStyle, backgroundColor: "var(--lasha-ivory-light)", color: "var(--lasha-muted)", cursor: "default" }}
                />
                <p style={{ fontSize: 12, color: "var(--lasha-muted)", marginTop: 10 }}>
                  Your sign-in email — managed from your account settings.
                </p>
              </div>
            </div>
          )}

          {/* Step 3 — Collections */}
          {step === 2 && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                gap: "20px 24px",
              }}
            >
              <div style={{ gridColumn: "1 / -1" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "14px 18px",
                    borderRadius: 12,
                    backgroundColor: "var(--lasha-ivory-light)",
                    border: "1px solid var(--lasha-border-light)",
                    marginBottom: 24,
                  }}
                >
                  <MapPin size={18} style={{ color: "var(--lasha-cyan)", flexShrink: 0 }} />
                  <p style={{ fontSize: 13, color: "var(--lasha-navy)", lineHeight: 1.5 }}>
                    This becomes your default collection point. You can add more
                    delivery addresses later from the Customer Portal.
                  </p>
                </div>
              </div>
              {field("Collection label", "addressLabel", {
                placeholder: "Main collection point",
                required: false,
                maxLength: 60,
              })}
              <div style={{ gridColumn: "1 / -1" }}>
                {field("Street address", "street", {
                  placeholder: "12 Main Road",
                  autoComplete: "address-line1",
                  required: true,
                  maxLength: 200,
                })}
              </div>
              {field("City", "city", {
                placeholder: "Johannesburg",
                autoComplete: "address-level2",
                required: true,
                maxLength: 100,
              })}
              {field("Province", "province", {
                placeholder: "Gauteng",
                autoComplete: "address-level1",
                required: false,
                maxLength: 60,
              })}
              {field("Postal code", "postalCode", {
                placeholder: "2196",
                autoComplete: "postal-code",
                required: true,
                maxLength: 12,
              })}
            </div>
          )}

          {/* Navigation — Back / Next, final Complete */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 48,
              gap: 16,
            }}
          >
            {step > 0 ? (
              <button
                type="button"
                onClick={handleBack}
                className="lasha-btn-secondary"
                style={{ padding: "14px 28px", fontSize: 14, cursor: "pointer" }}
              >
                <ArrowLeft size={16} />
                Back
              </button>
            ) : (
              <span />
            )}

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={handleNext}
                className="lasha-btn-primary"
                style={{ padding: "14px 28px", fontSize: 14, cursor: "pointer" }}
              >
                Next
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleComplete}
                disabled={saving}
                className="lasha-btn-primary"
                style={{
                  padding: "14px 28px",
                  fontSize: 14,
                  opacity: saving ? 0.6 : 1,
                  cursor: saving ? "not-allowed" : "pointer",
                }}
              >
                {saving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Saving…
                  </>
                ) : (
                  <>
                    <Check size={16} />
                    Complete Setup
                  </>
                )}
              </button>
            )}
          </div>

          {/* POPIA s18 notice at collection: the business/contact details entered
              here are personal information, so the notice is linked where it is
              collected, not only in the footer. */}
          <p style={{ marginTop: 18, fontSize: 12, color: "var(--lasha-muted)", lineHeight: 1.6 }}>
            We use these details to set up your account and deliver your parcels. See our{" "}
            <Link to="/privacy" style={{ color: "var(--lasha-cyan)", fontWeight: 600 }}>
              Privacy Notice
            </Link>{" "}
            for what we collect, why, and how to exercise your rights.
          </p>

          {/* Step dots — visual progress indicator */}
          <div style={{ display: "flex", gap: 8, marginTop: 32, justifyContent: "center" }}>
            {STEPS.map((label, i) => (
              <span
                key={label}
                aria-label={`Step ${i + 1}: ${label}${i === step ? " (current)" : ""}`}
                title={label}
                style={{
                  width: i === step ? 24 : 8,
                  height: 8,
                  borderRadius: 999,
                  backgroundColor: i <= step ? "var(--lasha-cyan)" : "var(--lasha-ivory-dark)",
                  transition: "width 0.25s ease, background-color 0.25s ease",
                }}
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
