/**
 * POPIA policy constants — the single source of truth for consent wording and
 * notice versions.
 *
 * Why this file is server-side: a consent record is only evidence if it names
 * the exact wording the person agreed to. The client therefore sends only
 * *which* purpose it is recording — never the wording itself — and the server
 * stamps the wording and version from here. A stale or tampered client cannot
 * manufacture a consent record that says something Lasha never published.
 *
 * Published wording lives in `src/pages/legal/PrivacyNotice.tsx`; bump
 * PRIVACY_POLICY_VERSION whenever the notice's purposes, sharing or retention
 * sections change, and re-collect consent where the change is material
 * (POPIA s18; s11(1)(a) consent must be specific and informed).
 */

/** Version shown on the published notice and stamped on every consent row. */
export const PRIVACY_POLICY_VERSION = "1.0";

/** Effective date shown on the published notice. */
export const PRIVACY_NOTICE_EFFECTIVE_DATE = "26 October 2026";

/**
 * Consent purposes Lasha actually acts on.
 *
 * - service:   performance of the delivery contract (s11(1)(b)). Recorded as
 *              an acknowledgement, not because consent is the lawful basis.
 * - marketing: electronic direct marketing (s69(1)). Opt-in only; absence of a
 *              record means "no".
 * - analytics: non-essential cookies and product analytics. Nothing is loaded
 *              today, so this purpose exists to gate anything added later.
 */
export const CONSENT_PURPOSES = ["service", "marketing", "analytics"] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/** Purposes that may never be pre-ticked or bundled into another action. */
export const OPT_IN_ONLY_PURPOSES: readonly ConsentPurpose[] = ["marketing", "analytics"];

/**
 * The wording a data subject sees. Stored verbatim with each record so the
 * registry can prove *what* was agreed to, years later.
 */
export const CONSENT_WORDING: Record<ConsentPurpose, string> = {
  service:
    "I have read the Privacy Notice and agree that Lasha may process the personal information I provide to create and operate my account and to carry out deliveries, as described in that notice.",
  marketing:
    "I would like to receive news, product updates and offers from Lasha by email. I understand I can withdraw this at any time.",
  analytics:
    "I agree to Lasha using optional analytics to understand how the platform is used. This is never required to use Lasha.",
};

/** Where a consent record came from. Free text is not accepted by the server. */
export const CONSENT_SOURCES = ["web-signup", "account-settings", "privacy-centre"] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

/**
 * Wording for the public product-updates form (landing footer).
 * Direct marketing needs prior opt-in evidenced by the wording the person saw
 * (s69(1)); this is stamped server-side for the same reason as CONSENT_WORDING.
 */
export const MARKETING_SUBSCRIPTION_WORDING =
  "I agree to receive product news and offers from Lasha by email. I understand I can stop them at any time.";

/** POPIA s23/s24 give a data subject 30 days; Lasha commits to the same clock. */
export const DSAR_RESPONSE_DAYS = 30;

/** Types of data subject request the platform accepts (s24, s11(3), s69). */
export const PRIVACY_REQUEST_TYPES = [
  "access",
  "correction",
  "deletion",
  "objection",
  "marketing_opt_out",
  "complaint",
] as const;
export type PrivacyRequestType = (typeof PRIVACY_REQUEST_TYPES)[number];

export const PRIVACY_REQUEST_LABELS: Record<PrivacyRequestType, string> = {
  access: "Access to my personal information",
  correction: "Correct or update my personal information",
  deletion: "Delete my personal information / close my account",
  objection: "Object to processing",
  marketing_opt_out: "Stop marketing to me",
  complaint: "Complaint about how my information was handled",
};

/** Internal handling states, mirroring the DSAR runbook. */
export const PRIVACY_REQUEST_STATUSES = ["received", "in_progress", "completed", "refused"] as const;
export type PrivacyRequestStatus = (typeof PRIVACY_REQUEST_STATUSES)[number];

/** Human-readable reference prefix (e.g. PRIV-2026-8F3K2Q). */
export const PRIVACY_REQUEST_PREFIX = "PRIV";
