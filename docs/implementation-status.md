# Lasha — Implementation Recovery Audit

> **Audit date:** 2026-09-10
> **Auditor:** Buffy (principal engineer recovery pass)
> **Method:** Direct inspection of repository source code. No reliance on previous AI-agent claims.
> **TypeScript:** `bun tsc -b --noEmit` passes cleanly (0 errors).
> **Build:** `bun run build` succeeds.

---

## Status Key

| Status | Meaning |
|--------|---------|
| **COMPLETE** | Implementation exists, is real (not mocked), and satisfies the requirement. |
| **PARTIAL** | Core logic exists but has gaps, missing integrations, or incomplete connections. |
| **INCORRECT** | Implementation exists but violates the intended architecture or requirement. |
| **MISSING** | No implementation exists. |
| **BLOCKED** | A concrete technical dependency prevents completion. |

---

## 1. UI and Backend Contract

| | |
|---|---|
| **Status** | **COMPLETE** |
| **Evidence** | `src/hooks/use-lasha.ts` defines domain hooks (useCurrentUser, useMyDeliveries, useActiveDeliveries, useDelivery, useWallet, useTransactions, useNotifications, useUnreadNotificationCount, useCreateOrderAndDelivery, useAcceptAssignment, useRejectAssignment, etc.) that map directly to Convex queries/mutations. Every page uses these hooks or direct `useQuery`/`useMutation` calls. |
| **Relevant files** | `src/hooks/use-lasha.ts`, `src/hooks/use-auth.ts` |
| **What is missing** | No hooks for settlement, POD viewing from React, or profile mutation (Settings read-only). |

---

## 2. Backend Architecture

| | |
|---|---|
| **Status** | **COMPLETE** |
| **Evidence** | Convex functions organized into domain modules: `deliveries/`, `dispatch/`, `tracking/`, `pricing/`, `notifications/`, `audit/`, `pod/`, `logging/`, `metrics/`, `offline/`, `auth/`. HTTP actions in `convex/http.ts` with health endpoints. Schema defines 20+ tables. Internal mutations used for cross-domain calls. |
| **Relevant files** | `src/convex/` (33 files), `src/convex/schema.ts` |
| **What is missing** | Docs reference a `domains/` directory structure (`api.domains.drivers.internal.*`) that does not exist. The actual structure uses flat module directories (`deliveries/state_machine.ts`, `dispatch/engine.ts`). This is a docs-vs-code discrepancy. The architecture is functional but not domain-nested as described in `docs/architecture.md`. |

---

## 3. Database / Data Model

| | |
|---|---|
| **Status** | **COMPLETE** |
| **Evidence** | `src/convex/schema.ts` defines 20+ tables with comprehensive validators, indexes, and relationships: users, businesses, addresses, orders, deliveries, reviews, vehicles, driver_profiles, wallets, transactions, invoices, notifications, notification_preferences, tracking_events, dispatch_offers, pricing_rules, delivery_quotes, settlements, payment_transactions, proof_of_delivery, pod_files, audit_events, metrics_storage. Full delivery state machine (13 states) with valid transitions and transition permissions defined in schema. |
| **Relevant files** | `src/convex/schema.ts` (911 lines) |
| **What is missing** | No `trips` table exists — the docs reference trips but the implementation manages trip state through delivery status and tracking events instead. This is an architectural decision, not a bug, but diverges from the planned architecture. |

---

## 4. Authentication and Authorization

| | |
|---|---|
| **Status** | **COMPLETE** |
| **Evidence** | Email OTP auth via `@convex-dev/auth` with `auth.freebuff.app` OTP endpoint. Anonymous auth supported. Freebuff federated JWT auth via `auth.config.ts`. Full RBAC with 6 roles: customer, driver, fleet_manager, operations, company_admin, super_admin. Permission map in schema. Authorization middleware (`requireAuth`, `requireRole`, `requirePermission`, `requireOwnership`, `requireCompanyAccess`, `requireDriverAccess`, `filterByCompany`, `filterByDriver`) in `src/convex/auth/authorization.ts` (493 lines). Tests in `authorization.test.ts`. |
| **Relevant files** | `src/convex/auth.ts`, `src/convex/auth/authorization.ts`, `src/convex/auth.config.ts`, `src/convex/auth/emailOtp.ts` |
| **What is missing** | No password-based auth (OTP only — by design). No account deletion/soft-delete mutation. ~~No profile mutation~~ **FIXED** — `users.updateMyProfile` (name, phone) and `users.businessProfile.updateMyBusiness` (business fields) added with session-derived identity, server-side validation, protected-field whitelists, and audit logging (user.updated / company.updated). |

---

## 5. Delivery State Machine

| | |
|---|---|
| **Status** | **COMPLETE** |
| **Evidence** | 13 delivery states (REQUESTED → PENDING_DISPATCH → ASSIGNED → DRIVER_ACCEPTED → EN_ROUTE_TO_PICKUP → AT_PICKUP → PICKED_UP → IN_TRANSIT → AT_DROPOFF → DELIVERED, plus CANCELLED, FAILED, REASSIGNMENT_REQUIRED). Valid transitions and role permissions defined in schema. Full mutation set: `createOrderAndDelivery`, `createDelivery`, `dispatchDelivery`, `advanceDeliveryStatus`, `cancelDelivery`, `failDelivery`, `requestReassignment`. Each mutation performs auth check, state validation, transition, tracking event recording, audit logging, and notification creation. State machine tests (552 lines) verify all transition rules. Production-readiness tests (937 lines) cover edge cases, concurrency, and invariants. |
| **Relevant files** | `src/convex/deliveries/state_machine.ts`, `src/convex/deliveries/state_machine.test.ts`, `src/convex/testing/production-readiness.test.ts` |
| **What is missing** | No Convex-side integration test that actually runs mutations against the database (tests are pure-logic validators). |

---

## 6. Dispatch and Driver Matching

| | |
|---|---|
| **Status** | **COMPLETE** |
| **Evidence** | `src/convex/dispatch/engine.ts` (760 lines): candidate discovery (finds available drivers with active vehicles), scoring service (proximity, vehicle capacity match, driver rating, availability — 100-line scoring function), offer management (create, accept, reject, expire), reassignment flow. `src/convex/dispatch/scoring_service.ts` implements haversine distance, capacity scoring, composite ranking. Dispatch scoring tests exist. `dispatch_offers` table with proper status lifecycle (pending → accepted/rejected/expired/cancelled). |
| **Relevant files** | `src/convex/dispatch/engine.ts`, `src/convex/dispatch/scoring_service.ts`, `src/convex/dispatch/scoring_service.test.ts` |
| **What is missing** | No Convex-side integration test against real database. Dispatch is not automatically triggered from order creation — it requires manual `dispatchDelivery` mutation call. |

---

## 7. Real-time Tracking

| | |
|---|---|
| **Status** | **COMPLETE** |
| **Evidence** | `src/convex/tracking/mutations.ts`: driver location update (standalone + delivery-linked), trip start/end, GPS validation (coordinates, timestamps, frequency, movement). `src/convex/tracking/queries.ts`: driver location query, available driver locations, current delivery, driver delivery history, delivery tracking events. `src/convex/tracking/config.ts`: configurable intervals, validation thresholds, retention periods. `src/convex/tracking/validation.ts`: coordinate validation, frequency throttling, movement validation, driver authorization. `src/convex/tracking/retention.ts`: data retention cleanup with downsampling. Tracking tests exist. |
| **Relevant files** | `src/convex/tracking/mutations.ts`, `src/convex/tracking/queries.ts`, `src/convex/tracking/config.ts`, `src/convex/tracking/validation.ts`, `src/convex/tracking/retention.ts` |
| **What is missing** | No map component in React UI to display tracking data. TrackDelivery page shows status steps but no live GPS map. Client-side GPS collection (`src/lib/offline/gps.ts`) exists but is not wired to a driver app UI. |

---

## 8. Offline Synchronization

| | |
|---|---|
| **Status** | **PARTIAL** |
| **Evidence** | Client-side libraries exist: `src/lib/offline/connectivity.ts` (connectivity detection with state machine), `src/lib/offline/db.ts` (IndexedDB persistence for operations, GPS buffer, cached deliveries), `src/lib/offline/operations.ts` (operation queuing with retry), `src/lib/offline/sync.ts` (synchronization engine with conflict detection, exponential backoff), `src/lib/offline/gps.ts` (GPS tracking with offline buffer). Hooks exist: `use-offline.ts` (useConnectivity, usePendingOperations, useSyncEngine, useOfflineAwareMutation, useGPSTracking). Server-side validation: `src/convex/offline/validation.ts` (operation age, delivery state, driver auth, location payload). |
| **Relevant files** | `src/lib/offline/` (6 files), `src/hooks/use-offline.ts`, `src/convex/offline/validation.ts` |
| **What is missing** | The offline system is NOT integrated into any React page or component. No UI shows connectivity status. No page triggers sync or queues operations. The driver-specific pages (active delivery, GPS reporting) do not exist in the current routing. The offline system is **fully implemented in isolation** but **not connected to the application**. |
| **What is incorrect** | None — the isolated code is well-structured, it just is not integrated. |

---

## 9. Routing

| | |
|---|---|
| **Status** | **PARTIAL** |
| **Evidence** | Client-side: `src/lib/routing/index.ts` (RoutingService with Google Maps + OSRM fallback, caching, retry), `src/lib/routing/providers/google-maps.ts`, `src/lib/routing/providers/osrm.ts`, `src/lib/routing/cache.ts`, `src/lib/routing/errors.ts`. Server-side: `src/convex/routing/actions.ts` (Convex actions for server-side routing and geocoding with API key). React hooks: `src/hooks/use-routing.ts` (useRoute, useETA, useDistanceMatrix). **Geocoding now integrated** via `geocodeAddress` Convex action (Google Maps Geocoding API with Nominatim fallback). RequestDelivery calls this action before order creation. |
| **Relevant files** | `src/lib/routing/` (6 files), `src/convex/routing/actions.ts`, `src/hooks/use-routing.ts`, `src/pages/RequestDelivery.tsx` |
| **What is missing** | No React page uses `useRoute` or `useRouting` hooks for turn-by-turn directions. The routing/direction system is fully implemented but not integrated into any user-facing flow. |
| **What was repaired** | `src/convex/routing/actions.ts`: Added `geocodeAddress` Convex action (Google Maps Geocoding API + Nominatim fallback). `src/pages/RequestDelivery.tsx`: Replaced `Math.random()` coordinates with real geocoding via the action. Added geocoding loading state ("Resolving addresses...") and error handling for failed geocoding. |
| **What is incorrect** | None remaining for geocoding. Routing/directions still not used by any page. |

---

## 10. Pricing and Settlement

| | |
|---|---|
| **Status** | **PARTIAL** |
| **Evidence** | `src/convex/pricing/service.ts` (~660 lines): full pricing calculation (base price, distance fee, weight fee, surcharges, platform fee, driver earnings), quote generation, pricing rule CRUD, active rule queries. `pricing_rules` table with versioning, effectiveness dates, platform fee config. `delivery_quotes` table stores per-delivery pricing breakdown. `settlements` table with idempotency. Pricing tests (269+ lines, 19 tests). **`calculateAndStoreQuote` internalMutation** — called by `createOrderAndDelivery` to calculate price using active pricing rules and store a quote. **Pricing is mandatory** — no delivery can be created without a matching pricing rule; the entire transaction rolls back on failure. |
| **Relevant files** | `src/convex/pricing/service.ts`, `src/convex/pricing/pricing.test.ts`, `src/convex/deliveries/state_machine.ts` |
| **What was repaired** | `createOrderAndDelivery` now calls `internal.pricing.service.calculateAndStoreQuote` before delivery creation, computing haversine distance and looking up the active pricing rule matching packageSize + expeditionType. The `calculateAndStoreQuote` call is NOT wrapped in try/catch — if pricing fails (no matching rule, calculation error), the Convex transaction rolls back all writes (addresses, order, delivery, tracking event, audit), leaving no orphaned records. The error propagates to the client as a clear failure. Three pricing failure tests added. |
| **What is missing** | Settlement processing mutation does not exist (only the table schema). No payout/disbursement logic. No UI to view/manage pricing rules. No React hook exposes settlement data. No real routing distance (uses haversine straight-line distance as fallback). |
| **What is incorrect** | None remaining for pricing calculation and failure handling during order creation. Settlement/payout processing still not implemented. |

---

## 11. Proof of Delivery

| | |
|---|---|
| **Status** | **COMPLETE** |
| **Evidence** | `src/convex/pod/service.ts` (735 lines): POD creation with idempotency, file upload (photos, signatures, documents via Convex File Storage), POD queries (by delivery, by order, by submitter), delivery completion with POD, failure recording with reason classification. `proof_of_delivery` and `pod_files` tables with proper indexes. POD tests exist. |
| **Relevant files** | `src/convex/pod/service.ts`, `src/convex/pod/pod.test.ts` |
| **What is missing** | No React UI for POD submission or viewing. No driver-facing POD page. No customer-facing POD receipt view. |

---

## 12. Notifications

| | |
|---|---|
| **Status** | **COMPLETE** |
| **Evidence** | `src/convex/notifications/service.ts` (591 lines): 18+ notification event types with templates, notification creation from domain events, in-app delivery (no external SMS/email), mark as read, bulk mark read, preference management, unread count query. Notifications page (`src/pages/Notifications.tsx`) reads from Convex and allows marking read. `notifications` and `notification_preferences` tables. Notification tests exist. |
| **Relevant files** | `src/convex/notifications/service.ts`, `src/convex/notifications/notifications.test.ts`, `src/pages/Notifications.tsx` |
| **What is missing** | No external notification delivery (SMS, email, push). Notifications are in-app only. Settings page reads preferences but notification preference save is not wired to a Convex mutation on the Settings page (only the dedicated Notifications page has mark-as-read). The notification dropdown in TopNavigation does not exist — notifications are only visible on the dedicated Notifications page. |

---

## 13. Operations Centre

| | |
|---|---|
| **Status** | **PARTIAL** |
| **Evidence** | `src/pages/OperationsCentre.tsx` (519 lines): Overview tab with real-time metrics from Convex queries (active deliveries, pending dispatch, completed today, failed). Tab structure: overview, dispatch, live deliveries, drivers, exceptions, history. All data comes from real Convex queries. |
| **Relevant files** | `src/pages/OperationsCentre.tsx`, `src/styles/operations.css` |
| **What is missing** | The Operations Centre UI exists but is **minimal**. It has tabs but the content within each tab beyond Overview is basic. No driver map view. No dispatch management actions (manual assign, override). No exception management workflow. No delivery history filtering/export. No audit log viewer. The design document (`docs/operations-centre-design.md`) describes a much richer experience. |

---

## 14. Audit Logging

| | |
|---|---|
| **Status** | **COMPLETE** |
| **Evidence** | `src/convex/audit/service.ts` (748 lines): comprehensive audit action constants (50+ actions across delivery, dispatch, tracking, pricing, payment, POD, user, driver, vehicle, company, notification, auth, admin, system categories). Internal mutations for recording events. Query functions for retrieval (by entity, by delivery, by order, by actor, by category, by time range). `audit_events` table with 7 indexes. Delivery state machine integrates audit recording on every transition. Audit tests exist. |
| **Relevant files** | `src/convex/audit/service.ts`, `src/convex/audit/audit.test.ts` |
| **What is missing** | No React UI to view audit logs. Audit data is only accessible via direct Convex queries. No audit viewer in Operations Centre. |

---

## 15. Removal of Mock Data

| | |
|---|---|
| **Status** | **PARTIAL** |
| **Evidence** | Most pages connect to real Convex queries. No mock arrays, fake user objects, or hardcoded driver lists remain. Dashboard transforms delivery data from Convex. Notifications read from Convex. Wallet/Transactions read from Convex. PastDeliveries, Invoices read from Convex. |
| **Relevant files** | All pages in `src/pages/` |
| **What is remaining mock data** | 1. ~~`src/pages/RequestDelivery.tsx`: random Johannesburg coordinates (`Math.random()`)~~ **FIXED** — now uses `geocodeAddress` Convex action. 2. `src/pages/MakePayment.tsx` lines 47-53: `setTimeout` stub instead of real payment processing — no Convex action called. 3. `src/pages/Dashboard.tsx` `transformDeliveryToOrder()`: hardcoded placeholder strings for vehicle ("N/A"), driver ("Unassigned"), customer ("Customer") — these are fallback strings for unpopulated fields, not fake data per se, but the vehicle/driver/customer enrichment is not done (no joins to enrich delivery with driver name, vehicle details). 4. ~~`src/pages/Settings.tsx`: profile fields are read-only display of `currentUser` — no mutation to save profile changes.~~ **FIXED** — profile/business changes now persist to Convex and survive refresh. |

---

## 16. UI/Backend Integration

| | |
|---|---|
| **Status** | **PARTIAL** |
| **Evidence** | All primary pages use Convex queries/mutations. The hook layer (`use-lasha.ts`) provides clean abstractions. Real-time subscriptions work via Convex reactive queries. Auth integration is complete (RequireAuth wrapper, auth redirect, sign-in/sign-out). |
| **Relevant files** | All `src/pages/`, `src/hooks/use-lasha.ts`, `src/components/RequireAuth.tsx` |
| **What is not connected** | 1. MakePayment page does not call any Convex mutation. 2. ~~Settings page cannot save profile changes.~~ **FIXED** — Settings now persists profile, business, and notification changes via `users.updateMyProfile` / `users.businessProfile.updateMyBusiness` / `notifications.service.updatePreferences`, with saving/success/error states. 3. ~~RequestDelivery uses random coordinates.~~ **FIXED** — now uses `geocodeAddress` Convex action. 4. No driver-specific active delivery UI page. 5. No POD submission UI. 6. No dispatch management UI actions. 7. Offline hooks exist but no page uses them. 8. Routing hooks exist but no page uses them. 9. No trip management UI. Settings Security tab (password/2FA/sessions) remains display-only — no password auth exists (OTP-based). |

---

## 17. Testing and Failure Simulation

| | |
|---|---|
| **Status** | **PARTIAL** |
| **Evidence** | 9 test files exist: state machine tests (552 lines), production-readiness tests (937 lines), authorization tests, dispatch scoring tests, audit tests, notification tests, POD tests, pricing tests, tracking tests. All are pure-logic tests that validate schema constants, transition rules, scoring functions, and data structures. |
| **Relevant files** | `src/convex/deliveries/state_machine.test.ts`, `src/convex/testing/production-readiness.test.ts`, `src/convex/auth/authorization.test.ts`, `src/convex/dispatch/scoring_service.test.ts`, `src/convex/audit/audit.test.ts`, `src/convex/notifications/notifications.test.ts`, `src/convex/pod/pod.test.ts`, `src/convex/pricing/pricing.test.ts`, `src/convex/tracking/tracking.test.ts` |
| **What is missing** | 1. No integration tests that run against a real Convex database. 2. No React component tests. 3. No E2E tests. 4. No concurrent acceptance tests against real mutations. 5. No vitest config found — tests use custom simple runners, not a standard test framework. Tests are run via `bunx tsx <file>`, not `vitest`. |

---

## 18. Security

| | |
|---|---|
| **Status** | **COMPLETE** |
| **Evidence** | Full RBAC with 6 roles and explicit permission mapping. Authorization middleware enforces access at every query/mutation. Ownership checks (requireOwnership, requireCompanyAccess, requireDriverAccess). Financial data uses cents (no floating point). Immutability of audit events. Idempotency keys on POD, settlements, payment transactions. JWT-based auth with Convex Auth. Secrets only in Convex actions (server-side). |
| **Relevant files** | `src/convex/auth/authorization.ts`, `src/convex/schema.ts` (roles/permissions section) |
| **What is missing** | No rate limiting. No CSRF protection beyond Convex's built-in. No input sanitization beyond Convex validators. |

---

## 19. Observability / Production Infrastructure

| | |
|---|---|
| **Status** | **PARTIAL** |
| **Evidence** | Structured logging service (`src/convex/logging/service.ts`, 371 lines): correlation ID generation, structured log entries, log levels, log categories. Metrics service (`src/convex/metrics/service.ts`, 343 lines): 30+ metric definitions, recording functions, aggregation queries. Health endpoint (`src/convex/http.ts`): checks routing provider availability, Convex runtime, notifications status. |
| **Relevant files** | `src/convex/logging/service.ts`, `src/convex/metrics/service.ts`, `src/convex/http.ts` |
| **What is missing** | 1. Logging is defined but only used by notifications service — most Convex functions do not call `createLogger`. 2. Metrics recording is defined but no domain function calls `recordMetric` — metrics are collected nowhere. 3. Health endpoint checks routing but not database, dispatch, or other subsystems. 4. No external monitoring integration. 5. No alerting. 6. The `docs/observability.md` and `docs/production-runbook.md` describe a much more comprehensive system than is implemented. |

---

## 20. Final Architecture Review

| | |
|---|---|
| **Status** | **COMPLETE** |
| **Evidence** | The architecture follows the intended pattern: React → Convex queries/mutations/actions → Convex data. No PostgreSQL, MySQL, MongoDB, Firebase, Supabase, Express, NestJS, or separate backend. Convex is the single source of truth. Business logic is server-side. External integrations (routing, email OTP) go through Convex actions. Auth is managed by Convex Auth. |
| **Relevant files** | Entire codebase |
| **What is incorrect** | 1. `docs/architecture.md` references a `domains/` nested structure (`api.domains.drivers.internal.*`) that does not exist in the code. The actual structure uses flat module directories. 2. `docs/architecture.md` references a `trips` table and trip domain that does not exist — trip state is managed through delivery status. 3. `docs/architecture.md` references Paystack payment integration that does not exist — MakePayment is a stub. 4. `docs/architecture.md` references SMS gateway integration that does not exist. |

---

## 21. React/Convex Domain Boundary

| | |
|---|---|
| **Status** | **PARTIAL** |
| **Evidence** | The hook layer (`use-lasha.ts`) properly abstracts Convex calls. Pages use `useQuery`/`useMutation` for server state. Local React state is used only for UI concerns (sidebar, filters, modals, form inputs). Pricing calculation is server-side. Delivery state transitions are server-side. Notification creation is server-side. |
| **Relevant files** | `src/hooks/use-lasha.ts`, all pages |
| **What is incorrect** | 1. `src/pages/Dashboard.tsx` `transformDeliveryToOrder()` performs data transformation in React that could be a Convex view. 2. ~~`src/pages/RequestDelivery.tsx` generates coordinates in React~~ **FIXED** — now uses server-side `geocodeAddress` Convex action. 3. `src/pages/MakePayment.tsx` `handlePayment` uses `setTimeout` — payment logic should be a Convex mutation/action. 4. ~~Settings profile edits were discarded on save~~ **FIXED** — Settings now calls `updateMyProfile` / `updateMyBusiness` Convex mutations; identity is session-derived and privileged fields are structurally excluded from mutation args. |

---

## Summary

### Architecture Compliance

The codebase **correctly follows the intended Vite + React + Convex architecture**. No foreign backends or databases have been introduced. Convex is the single source of truth. The only architectural deviation is that the file structure uses flat module directories instead of the `domains/` nesting described in `docs/architecture.md`.

### What Is COMPLETE

| Area | Evidence |
|------|----------|
| Schema/Data Model | 20+ tables, comprehensive indexes, state machine |
| Auth + RBAC | 6 roles, permission system, authorization middleware |
| Delivery State Machine | 13 states, full lifecycle, audit+notification integration |
| Dispatch Engine | Scoring, offer management, concurrency protection |
| Real-time Tracking | Location updates, queries, validation, retention |
| Pricing Engine | Rule-based calculation, versioning, quote generation |
| Proof of Delivery | File upload, idempotency, failure classification |
| Notification Service | 18+ event types, templates, preferences, in-app delivery |
| Audit Logging | 50+ action constants, immutable events, query functions |
| Offline Sync Libraries | IndexedDB, sync engine, connectivity detection |
| Routing Libraries | Google Maps + OSRM, caching, fallback |
| Logging/Metrics Definitions | Structured logging, 30+ metrics defined |
| Health Endpoint | HTTP health check with routing verification |
| Tests (logic) | 9 test files covering state machine, auth, dispatch, etc. |
| Build | TypeScript compiles, Vite builds successfully |

### What Is PARTIAL

| Area | What Exists | What Is Missing |
|------|-------------|-----------------|
| Offline Sync Integration | Libraries exist, hooks exist | NOT connected to any React page |
| Routing Integration | Client+server routing, hooks exist; geocoding now connected | NOT used for directions; RequestDelivery geocoding fixed |
| Pricing Integration | Engine exists; `calculateAndStoreQuote` mandatory; failure rolls back transaction | No UI for pricing rules; uses haversine distance (not routing distance) |
| Operations Centre | Overview tab with real data | Tabs beyond Overview are minimal; no dispatch actions, no map, no audit viewer |
| Observability | Logging + metrics services defined | Not called by most Convex functions; no external monitoring |
| Testing | 9 pure-logic test files | No integration tests, no React tests, no E2E tests |
| UI/Backend Integration | Primary pages connected; Settings profile/business saving now works | MakePayment stub, no driver/POD/dispatch UI |

### What Is INCORRECT

| Area | Issue |
|------|-------|
| RequestDelivery | ~~Uses `Math.random()` for coordinates~~ **FIXED** — now uses `geocodeAddress` Convex action with Google Maps/Nominatim |
| MakePayment | Uses `setTimeout` stub — should call a Convex action/payment provider |
| Pricing flow | ~~`createOrderAndDelivery` does not use `pricing.service.calculateQuote`~~ **FIXED** — now calls `calculateAndStoreQuote` internalMutation. ~~Previously degraded to price: 0 on failure~~ **FIXED** — pricing failure now causes full transaction rollback, no delivery created. |
| Dashboard transform | `transformDeliveryToOrder()` has hardcoded fallback values for vehicle/driver/customer |
| Settings | Profile fields displayed but no mutation to save changes |
| Docs | `docs/architecture.md` references non-existent `domains/` structure, `trips` table, Paystack integration |

### What Is MISSING

| Area | Status |
|------|--------|
| Driver active delivery UI page | No page exists for drivers to view/manage their active delivery |
| POD submission UI | No page for drivers to submit proof of delivery |
| Trip management UI | No trip viewing/management page |
| Map component | No map display for tracking or dispatch |
| Audit log viewer | No UI to view audit events |
| Dispatch management actions | No UI to manually assign/override dispatch |
| Payment provider integration | No actual payment processing (Paystack, Stripe, etc.) |
| SMS/Email notifications | Only in-app notifications; no external delivery channels |
| Rate limiting | Not implemented |
| Profile mutation | ~~Cannot save profile changes~~ **FIXED** — `users.updateMyProfile` + `users.businessProfile.updateMyBusiness` connected to Settings |
| Driver GPS reporting UI | No page for drivers to report GPS (hooks exist but are unused) |

### Critical Architectural Problems

None. The architecture is sound. The issue is that several subsystems were implemented in isolation (offline, routing, POD, dispatch management) and were never wired into the React UI.

### Important Technical Problems

1. ~~**RequestDelivery uses random coordinates**~~ **FIXED** — Now uses `geocodeAddress` Convex action (Google Maps Geocoding API with Nominatim fallback). Both pickup and dropoff addresses are geocoded via server-side Convex action before order creation. Failed geocoding prevents submission with a clear user-facing error. Button shows "Resolving addresses..." during geocoding phase.
2. ~~**Pricing not called from order creation**~~ **FIXED** — `createOrderAndDelivery` now calls `internal.pricing.service.calculateAndStoreQuote` to calculate price using active pricing rules, then stores the result on the order.
3. **MakePayment is a no-op** — Users cannot actually add funds.
4. **Settings is read-only** — Users cannot update their profile.

### Remaining Dependencies

- Payment provider (Paystack/Stripe) needs to be integrated via Convex action for MakePayment
- ~~Geocoding service needs to be connected to RequestDelivery~~ **FIXED** — `geocodeAddress` Convex action added and connected to RequestDelivery
- Profile mutation needs a Convex mutation and Settings page wiring
- Driver-specific pages need to be built for active delivery management and POD submission

### Recommended Next Step

**Fix the four critical integration gaps, in order of impact:**

1. ~~**Fix RequestDelivery coordinates**~~ **DONE** — Added `geocodeAddress` Convex action to `src/convex/routing/actions.ts` (Google Maps Geocoding API with Nominatim fallback). Updated `src/pages/RequestDelivery.tsx` to call this action via `useAction(api.routing.actions.geocodeAddress)` before creating the order. Removed all `Math.random()` coordinate generation. Added geocoding loading state and error handling.
2. **Wire pricing into order creation** — `createOrderAndDelivery` should call `pricing.service.calculateQuote` instead of using a default price.
3. **Fix MakePayment** — Connect to a payment provider (or at minimum a wallet top-up mutation) so users can actually fund their accounts.
4. **Add profile save mutation** — Add a Convex mutation for updating user profile fields and wire it to the Settings page.

These are small, targeted changes that restore the core business flow integrity without requiring architectural changes.

---

## Audit Classification

**COMPLETE** — The repository has been fully inspected. `/docs/implementation-status.md` has been created. Every implementation area has been evaluated with concrete evidence from the actual codebase.
