/**
 * Legal facts used by the public notice pages.
 *
 * Edit this file — not the pages — when the company details, Information
 * Officer, regulator contact or operator list changes. The pages render the
 * published version and effective date from `convex/privacy/policy.ts`, so a
 * wording change and a version bump stay in one place.
 */
import {
  PRIVACY_NOTICE_EFFECTIVE_DATE,
  PRIVACY_POLICY_VERSION,
} from "@/convex/privacy/policy";

export { PRIVACY_NOTICE_EFFECTIVE_DATE, PRIVACY_POLICY_VERSION };

export const LEGAL_ENTITY = {
  /** Name the public sees. */
  tradingName: "Lasha Logistics",
  /** Registered name — used in the PAIA manual and the privacy notice. */
  legalName: "CLADOGRAM (trading as Lasha Logistics)",
  /** Company registration number, per the CIPC registration certificate (COR14.3). */
  registrationNumber: "2024/063751/07",
  website: "https://lasha.co.za",
  /** Registered office, per the CIPC registration certificate (COR14.3). */
  physicalAddress: "333 Main Street, Lemoenkloof, Paarl, Western Cape, 7646",
  /** South African head office region, used where a full address is not needed. */
  region: "Western Cape, South Africa",
};

/** General enquiries and the public contact address. */
export const CONTACT_EMAIL = "info@lasha.co.za";

/** Primary privacy contact — also the Information Officer's desk. */
export const PRIVACY_CONTACT = {
  email: "privacy@lasha.co.za",
  phone: "+27 10 123 4567",
  hours: "Monday to Friday, 08:00–17:00 (SAST)",
};

/** Security reports (security.txt mirrors these values). */
export const SECURITY_CONTACT = {
  email: "security@lasha.co.za",
};

export const INFORMATION_OFFICER = {
  title: "Information Officer",
  /**
   * Named individuals are deliberately not hardcoded: the Information Officer
   * is a statutory appointment that must be registered with the Information
   * Regulator, and naming someone who has not been appointed would be wrong.
   * The role's contact desk is always correct.
   */
  email: PRIVACY_CONTACT.email,
  phone: PRIVACY_CONTACT.phone,
};

/** The Information Regulator (South Africa) — complaints and PAIA appeals. */
export const REGULATOR = {
  name: "The Information Regulator (South Africa)",
  address: "Woodmead North Office Park, 54 Maxwell Drive, Woodmead, Johannesburg, 2191",
  postal: "PO Box 31533, Braamfontein, Johannesburg, 2017",
  phone: "010 023 5200",
  tollFree: "0800 017 160",
  email: "enquiries@inforegulator.org.za",
  paiaComplaintsEmail: "PAIAComplaints@inforegulator.org.za",
  website: "https://inforegulator.org.za",
  portal: "https://eservices.inforegulator.org.za",
};

/**
 * Operators (POPIA s20/s21) that receive personal information, with the
 * country they process it in (s72 cross-border basis is "binding agreement
 * incorporating the POPIA conditions", per the operator agreement on file).
 *
 * Keep this list in step with `docs/popia/operators.md`. Every new SDK or API
 * that sees personal information must be added to both.
 */
export interface Operator {
  name: string;
  service: string;
  data: string;
  country: string;
}

export const OPERATORS: Operator[] = [
  {
    name: "Convex, Inc.",
    service: "Application database, file storage and server functions",
    data: "All platform data — account, order, delivery, driver, payment and audit records",
    country: "United States",
  },
  {
    name: "Vly / Freebuff",
    service: "Application hosting, authentication issuer and integration gateway",
    data: "Account identifiers, session data, outbound email content",
    country: "United States",
  },
  {
    name: "Paystack",
    service: "Card and instant-EFT payment processing",
    data: "Name, email, amount, payment reference. Card details are entered directly with Paystack; Lasha never receives them.",
    country: "South Africa / Nigeria",
  },
  {
    name: "Resend",
    service: "Transactional email delivery (password resets, delivery notices)",
    data: "Email address, name, message content",
    country: "United States",
  },
  {
    name: "Google Ireland / Google LLC",
    service: "Places API address search and Routes API journey calculation",
    data: "Address text and coordinates of pickups and drop-offs",
    country: "Ireland / United States",
  },
  {
    name: "OpenStreetMap Foundation and FOSSGIS e.V.",
    service: "Nominatim geocoding and OSRM routing (fallback when Google is unavailable)",
    data: "Address text and coordinates of pickups and drop-offs",
    country: "European Union",
  },
];

/** Countries outside South Africa where personal information is processed. */
export const CROSS_BORDER_COUNTRIES = [
  "United States",
  "Ireland",
  "Nigeria",
  "the European Union",
];

/** Public legal documents, in the order they appear in navigation. */
export const LEGAL_DOCUMENTS = [
  { path: "/privacy", label: "Privacy Notice", short: "Privacy" },
  { path: "/paia", label: "PAIA Manual", short: "PAIA" },
  { path: "/cookies", label: "Cookie Notice", short: "Cookies" },
  { path: "/terms", label: "Terms of Service", short: "Terms" },
  { path: "/acceptable-use", label: "Acceptable Use Policy", short: "Acceptable use" },
  { path: "/privacy-rights", label: "Your Privacy Rights", short: "Your rights" },
] as const;
