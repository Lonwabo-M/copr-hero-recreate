# Customer Onboarding

Multi-step onboarding for newly registered Customer accounts, ahead of entering
the existing Customer Portal.

## Customer Onboarding

### Entry route

`/onboarding/customer` — registered in `src/main.tsx` behind the standard
`RoleGate area={APP_AREAS.CUSTOMER}` wrapper (authentication + customer-area
convenience guard; Convex remains the authorization authority).

### Step structure

Three steps, following the onboarding reference screens' visual and structural
pattern (spacious centered content, prominent heading + explanatory subtitle,
two-column fields on larger screens, full-width fields where appropriate, large
rounded inputs, Back/Next navigation, final completion action):

1. **Business details** — the information that identifies the customer's
   business account.
2. **About you** — the customer's personal contact details.
3. **Collections** — the default collection point drivers will use.

Progress is shown as `Step N of 3` in the header plus a progress bar and step
dots. Moving between steps is pure React state — no page reload — and entered
values are preserved in both directions.

### Fields (backend-determined)

Only fields with a legitimate destination in the existing Lasha data model are
collected. Fields from the reference screens with no backend destination
(website, VAT number, dispatcher contact, nationality/ID/position) are
intentionally omitted.

| Step | Field | Backing field |
|---|---|---|
| 1 | Business legal name * | `businesses.name` |
| 1 | Business type | `businesses.industry` |
| 1 | Registration number | `businesses.registrationNumber` |
| 1 | Business phone | `businesses.phone` |
| 1 | Registered business address | `businesses.address` |
| 2 | Full name * | `users.name` |
| 2 | Phone number * | `users.phone` |
| 2 | Account email (display-only) | `users.email` |
| 3 | Collection label | `addresses.label` (default: "Main collection point") |
| 3 | Street address * | `addresses.street` |
| 3 | City * | `addresses.city` |
| 3 | Province | `addresses.state` |
| 3 | Postal code * | `addresses.zip` |

(\* = required)

### Validation

- **Client-side (UX only):** required fields per step, phone format
  (`^\+?[0-9\s()-]{3,20}$`, shared with the backend's validator), field-length
  caps matching backend limits. The final submit re-validates every step.
- **Server-side (authoritative):** `src/convex/users/onboarding.ts` re-validates
  all input with the shared validators from `users/profileValidation.ts`
  (`validateBusinessName`, `validateName`, `validatePhone`, capped optional
  text) plus required-field checks for address fields. All validation runs
  **before the first write**, so a failed save leaves nothing half-written.

### Persistence

React state holds the in-progress form. Saving happens once, at completion,
through `api.users.onboarding.completeCustomerOnboarding` — a single atomic
mutation that:

1. updates the user (`name`, `phone` — whitelisted profile fields only),
2. creates the business and links it via `users.businessId` (or updates the
   linked business in place if one already exists — never a duplicate identity
   record; `ownerUserId` is always the session user), and
3. creates the default collection address (or updates the existing default in
   place).

Nothing is stored authoritatively in localStorage; the page holds no onboarding
state across sessions beyond what the backend already has. Already-saved values
prefill the form from `getOnboardingStatus` on load, so a refresh never loses
backend-persisted information.

### Completion detection

Deterministic, backend-derived — no client-asserted flag:

```
complete = user.name && user.phone && user.businessId && business && defaultAddress
```

`api.users.onboarding.getOnboardingStatus` returns this `complete` flag plus
the stored values. Because the check is derived from stored data, customers who
were fully profiled before onboarding existed bypass the flow automatically.

A successful save is audited with the existing audit actions (`user.updated`,
`company.created` / `company.updated`, category `user`/`company`) with
`context: "customer_onboarding"`.

### Customer ownership / security

- Identity is always the authenticated session user. No query or mutation
  accepts a client-supplied user ID, business ID, customer ID, or address ID —
  one customer cannot modify another's data.
- Onboarding is customer-only: driver/operations/admin roles are denied
  server-side (`Access denied: onboarding is only available to customer
  accounts`). Roles are never derived from client input.
- Idempotent: re-submitting after completion is a safe no-op
  (`{ alreadyComplete: true }`), so retries cannot create duplicate
  businesses/addresses.
- Fail-closed: validation errors throw before any write; the UI navigates to
  the dashboard only after the mutation resolves successfully, and a failed
  save shows the error instead of pretending success.

### Post-auth routing

`src/pages/PostAuthRedirect.tsx` (unchanged role model):

| Authenticated role | Onboarding incomplete | Onboarding complete |
|---|---|---|
| Customer (or unprovisioned) | `/onboarding/customer` | `/dashboard` |
| Driver | — | `/driver` (unchanged) |
| Operations / Fleet Manager | — | `/operations` (unchanged) |
| Company Admin / Super Admin | — | `/operations` (unchanged) |

Deep-link `?returnTo=` destinations are preserved by the auth page and are not
intercepted by onboarding. Returning customers who already completed onboarding
go straight to `/dashboard` and never see the flow again; onboarding data
remains editable later via Settings/Profile for supported fields.

## Design

Onboarding follows the **current Lasha platform design system exactly** — the
same `--lasha-*` CSS tokens, `lasha-label` / `lasha-btn-primary` /
`lasha-btn-secondary` classes, typography (Inter, tight-tracked display
headings), input treatment (large rounded fields, cyan focus border), pill
buttons, and header treatment used across the auth page and portal — and
reproduces the layout, spacing, form styling, progress behaviour, and visual
hierarchy of the supplied onboarding reference screens.

Responsive: the two-column field grid (`repeat(auto-fit, minmax(280px, 1fr))`)
collapses to one column on small screens; spacing, navigation, and the progress
indicators remain accessible; no horizontal scrolling. Accessibility: real
`<label>` elements with `htmlFor`, semantic inputs, `autoComplete` attributes
(organization, name, tel, street-address, address-level1/2, postal-code),
`role="alert"` error messaging, keyboard-navigable controls, visible focus
states.

## Existing Customer Portal

Onboarding only **prepares** the customer — it does not change the portal.
Dashboard, CustomerShell, Request Delivery, Payments, Live Delivery Tracking,
Notifications, and Settings are untouched. After completion the customer lands
in the existing `/dashboard` experience.
