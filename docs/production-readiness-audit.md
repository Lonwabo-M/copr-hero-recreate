# Lasha Production-Readiness Audit

**Date:** September 2026
**Scope:** Full platform as-built — Customer Portal, Driver App, Operations Centre, financial system, platform infrastructure.

---

## 1. Executive Summary

### Classification: **PILOT READY** (deployable for a controlled pilot; two blockers must be resolved before uncontrolled production)

**Why:** Every core workflow — customer request → pricing → payment → dispatch → driver delivery → GPS → POD → completion → settlement → reconciliation → notifications → history/earnings — is implemented end-to-end against real Convex data with server-authoritative validation, resource-level authorization, and audit trails. 30 test suites (900+ assertions) pass, TypeScript is clean, and the production build succeeds. However:

1. **No automated role provisioning exists** (no admin UI or mutation to assign DRIVER/OPERATIONS/COMPANY_ADMIN roles). New users default to `customer`; drivers/ops staff must be provisioned manually via the Convex dashboard. Workable for a pilot, not for scale.
2. **Expired dispatch offers are never expired in practice** — `processExpiredOffers` exists but has zero callers and there is no cron. Deliveries whose offers all expire sit in ASSIGNED until an operations user manually re-dispatches. Manually recoverable; must be scheduled or surfaced for pilot.
3. A **hardcoded email-OTP API key** exists in the auth bridge (see Security). Low runtime risk (server-side only, Freebuff-managed endpoint) but must move to environment configuration.

The system is honest about its boundaries: no external payouts, no ETA invention, no fabricated offline state, no financial internals in operational UIs.

---

## 2. Architecture Status

Verified actual architecture — **single backend, single database, single realtime system**:

```
React (Vite SPA, 4 role-separated shells)
→ Convex queries/mutations/actions (src/convex/*)
→ Convex database (24 tables)
```

| Check | Result |
|---|---|
| Second backend (Express/Koa/Fastify etc.) | ✅ None — no server framework in dependencies |
| Second database (Redis/Postgres/Firebase/Supabase) | ✅ None |
| Duplicate realtime (Socket.io/WebSocket custom) | ✅ None — Convex reactive subscriptions only |
| Hidden API surface | ✅ Only Convex http routes: `/health`, `/health/live`, `/health/ready`, `/payments/paystack/webhook` |
| Duplicate domain systems | ✅ None — one state machine, one dispatch engine, one tracking backend, one notification system, one audit system |
| Offline layer | ✅ Client-side resilience only (`src/lib/offline/*`, IndexedDB); replays through the **existing** `updateDeliveryLocation` mutation; Convex remains authoritative |

---

## 3. Role/Application Matrix

Routes are wrapped in `RoleGate` (RequireAuth + AreaGuard); backend RBAC (`src/convex/auth/authorization.ts`) is authoritative regardless of UI.

| Capability | Customer | Driver | Operations | Admin (company_admin / super_admin) |
|---|---|---|---|---|
| Request delivery + pricing | ✅ | — | ✅ | ✅ |
| Pay delivery (Paystack) | ✅ | ❌ blocked | ❌ blocked | ✅ |
| Live delivery tracking (own) | ✅ | — | ✅ (all, ops view) | — |
| POD visibility | ✅ summary | ✅ own | ✅ | ✅ |
| Delivery history | ✅ own | ✅ own | ✅ all | — |
| Notifications | ✅ | ✅ | ✅ | ✅ |
| Delivery offers (accept/reject) | — | ✅ | — | — |
| Active delivery workflow + GPS | — | ✅ | — | — |
| Driver earnings (server-derived, driver-scoped) | — | ✅ | — | — |
| Dispatch / assign driver | — | — | ✅ | ✅ (company-scoped) |
| Reassignment | — | — | ✅ | ✅ (company-scoped, ownership-enforced) |
| Live driver map / exceptions | — | — | ✅ | ✅ (via ops) |
| Settlement/reconciliation internals | ❌ | ❌ | read-only (settlement:view) | ✅ |
| Payout processing | — | — | ❌ (settlement:manage denied) | future |
| Offline GPS buffering | — | ✅ | — | — |

Verified: `/operations` is `RoleGate area=OPERATIONS` (operations, fleet_manager, admins); customer routes cannot reach driver mutations (no mutation exists on any customer page); driver pages have no operations/financial internals. Admin has **no dedicated routes** — admin-role users land in the Operations Centre (documented, intentional gap).

---

## 4. End-to-End Workflow Matrix

| Workflow | Status | Evidence | Blocking Issue |
|---|---|---|---|
| **Customer delivery** (request → geocode → order+delivery → server-side haversine + stored quote → payment → dispatch → tracking → POD → completion → notifications → history) | **COMPLETE** | `RequestDelivery.tsx` → `createOrderAndDelivery` (pricing computed server-side via `calculateAndStoreQuote`; client never supplies price) → `MakePayment.tsx` → `initiateOrderPayment` (server resolves amount from stored order) → `DeliveryTracking.tsx` (`/deliveries/:id`, ownership-checked) | None |
| **Driver delivery** (offers → accept/reject → active → GPS → transitions → POD gate → completion → history → earnings) | **COMPLETE** | `DriverOffers.tsx` → `dispatch.engine.acceptAssignment` (concurrency-guarded) → `DriverActiveDelivery.tsx` → `state_machine.*` mutations → `completeDelivery` requires POD record server-side | None |
| **Operations** (dispatch → offers → monitoring → exceptions → reassignment → history) | **COMPLETE** (with offer-expiry gap) | `OperationsCentre.tsx` on live Convex queries; exceptions derived from real conditions only | Expired offers require manual ops action (see §9) |
| **Payment** (initiate → Paystack → webhook + verify → completion gate) | **COMPLETE** (config-dependent) | `payments/actions.ts`; webhook HMAC-SHA512 verified; provider amount cross-checked against stored charge; deterministic reference idempotency | `PAYSTACK_SECRET_KEY` must be configured; webhook URL registered |
| **Settlement** (on completion, deterministic idempotency) | **COMPLETE** | `pricing.service.createSettlement` — key `settlement-${deliveryId}`, by_idempotency + by_delivery guards | None (creation automated) |
| **Reconciliation** (read-only) | **COMPLETE** | `payments/reconciliation.ts` single query export | None |
| **Payout eligibility** (gated, read-only evaluation) | **COMPLETE** | `payments/payoutEligibility.ts` + `driver_earnings` evaluation | External payout processing intentionally not implemented |
| **Notifications** (lifecycle-wired, idempotent, role-scoped) | **COMPLETE** | `notifications/service.ts` wired at 13 state-machine sites + offer/POD/payment | No SMS/email/push (by design); driver notifications have no deep link |
| **Offline resilience** (buffer → sync → cleanup) | **COMPLETE** | `src/lib/offline/*` + engine started in `DriverShell`; 42 tests | Browser background limitations documented |

No workflow stage relies on mock data, `Math.random()` (except tracking-number/uniqueness-suffix generation, which is legitimate), `setTimeout()` simulation, or client-only financial state. Wallet "Top Up" is UI-only (no charge occurs, no fake balance write) — documented as a future feature.

---

## 5. Security Findings

| # | Severity | Finding | Evidence | Remediation |
|---|---|---|---|---|
| S1 | **Medium** | Hardcoded API key in email-OTP bridge (`x-api-key: "fb_email_…"`) | `src/convex/auth/emailOtp.ts` | Move to Convex env var (Keys settings). Server-side only, so not exploitable from the client; still violates secret hygiene. |
| S2 | **Medium** | No automated role provisioning; no role-management mutation exists | No `setUserRole`-style mutation anywhere; `updateMyProfile` accepts only name/phone | For pilot: manual provisioning via Convex dashboard is acceptable (fail-closed). Before scale: build an admin-only role-assignment mutation with audit events. |
| S3 | **Low** | `assignDriver` (manual ops assignment) lacks the COMPANY_ADMIN company-ownership check that `dispatchDelivery`/`reassignDelivery` enforce | `state_machine.ts` `assignDriver` — permission check only (`DELIVERY_ASSIGN`); COMPANY_ADMIN with that permission could assign a driver on another company's delivery | Add the same ownership resolution used by `reassignDelivery` (order → businessId vs session user's businessId, fail-closed). One-function change; recommended next task. |
| S4 | **Low** | `getMyCurrentDelivery` and several ops queries allow unbounded `.collect()` on driver-scoped indexes | `tracking/queries.ts`, engine queries | Bounded by per-driver data volume in practice; monitor. |
| S5 | **Verified secure** | Payment webhook verifies HMAC-SHA512 signature before processing; replay-safe | `http.ts` `/payments/paystack/webhook` | — |
| S6 | **Verified secure** | No client-controlled identity anywhere in financial/state paths: order payment amount, settlement amounts, recipient IDs all resolved server-side | `payments/actions.ts`, `pricing/service.ts`, `notifications/service.ts` (public `createNotification` ignores client userId), audit queries (resource-scoped) | — |
| S7 | **Verified secure** | No secrets exposed via Vite: only `VITE_CONVEX_URL` and Vly app-monitoring IDs reach the client; Paystack/Google keys are server-side `process.env` | `src/main.tsx`, `payments/actions.ts`, `routing/actions.ts` | — |
| S8 | **Verified secure** | Audit integrity: no arbitrary first-user fallback (removed); system events have optional `actorId` + `actorRole:"system"`; resource-level audit authorization with cross-company/driver/customer isolation; records immutable | `audit/*`, prior hardening tasks + 27 audit tests | — |

**Cross-user access tests pass:** customer A cannot read customer B's delivery/tracking/POD; driver cannot read another driver's data; COMPANY_ADMIN cannot cross company boundaries on reassignment, audit, POD.

---

## 6. Data Integrity Findings

| # | Severity | Finding |
|---|---|---|
| D1 | Low | Tracking-event retention (`HIGH_RES 24h / LOW_RES 30d`) is defined and `cleanupTrackingData` exists, but nothing schedules it — the ops dashboard/grow queries eventually scan more rows. Manual invocation available; a cron is the natural fix. |
| D2 | Low | Delivery creation generates tracking numbers with `Math.random()` suffix — collision chance negligible but not zero; no unique index on `trackingNumber` enforces it. |
| D3 | Low | Orphan-risk is structurally low: order creation is transactional (quote failure rolls back order+addresses+delivery); settlements/POD/payments are keyed to deliveries with idempotency indexes. No cleanup was performed (per audit rules) and none is required for pilot. |
| D4 | Verified | Terminal states (`DELIVERED`, `FAILED`, `CANCELLED`) have **empty transition arrays** — no path back to active states; enforced by `validateTransition` in every mutation. REASSIGNMENT_REQUIRED flows only to PENDING_DISPATCH. |

---

## 7. Financial Readiness

| Aspect | Status |
|---|---|
| Customer amount authoritative | ✅ Server-computed quote stored on order; payment initiation ignores client amounts; provider amount cross-checked at completion (mismatch refuses) |
| Driver earnings authoritative | ✅ Derived from stored quotes/settlements; UI never computes financials |
| Duplicate payments prevented | ✅ Deterministic reference `pay-${orderId}[-rN]`, `by_idempotency` index, already-paid short-circuit |
| Duplicate settlements prevented | ✅ `settlement-${deliveryId}` key + dual guards |
| Reconciliation | ✅ Read-only, single query |
| Payout eligibility | ✅ Gated evaluation (delivery complete, settlement exists, payment verified & matched, no anomalies, not already paid) |
| Driver earnings scoped | ✅ Session-derived driver identity only |
| Wallet vs payout honesty | ✅ Driver Earnings shows "No external payouts recorded"; internal wallet credit is never labelled as bank payout |
| **External payout processing** | ❌ Not implemented (intentional — next major workstream) |
| Refunds | ❌ Not implemented |

**Classification: production-ready for the internal financial loop; external payout remains the known boundary.**

---

## 8. Offline Readiness

**Classification: PILOT READY.**

- Only GPS is queueable (enforced whitelist; sync engine purges anything else defensively).
- Bounded: 100 points/delivery, 300 global, 5-min age (matches server `validateTimestamp`), enforced at enqueue.
- Delivery-bound entries; terminal state discards the buffer; ordered replay through the existing mutation; authoritative server rejections discard, transient failures retry with bounded backoff (30s→5min).
- Connectivity derived from the actual Convex WebSocket state (`useConvexConnectionState` bridge) — not `navigator.onLine`; pre-connection reads OFFLINE.
- Offers/transitions/POD blocked offline in UI **and** at handler execution time; guard re-verifies at execution.
- Logout clears all IndexedDB stores before sign-out; queue holds only GPS operational fields.
- 42 dedicated tests + production-readiness coverage.
- Offline mode **cannot** create fake deliveries, earnings, completion, or payments — those paths require live Convex round-trips.

Known browser limits documented in `docs/offline-driver.md` (no background GPS; IndexedDB unavailability degrades to no-op).

---

## 9. Dispatch/Operations Readiness

**Classification: PILOT READY with one operational gap.**

Works: candidate discovery → scoring (`scoring_service`) → offer creation (duplicate guard: "already has an active offer") → accept (expiry check + double re-read concurrency guard + competing-pending-offer cancellation) → reject → reassignment (company-ownership enforced, re-dispatch inline) → exceptions (failed / reassignment_required / no_driver / stale GPS / no location / offer expired — all derived from real data) → live map (existing tracking records, freshness thresholds) → delivery/driver inspection → history.

**Gap (the only stuck-state risk found):**
- `processExpiredOffers` (expires stale offers, triggers reassignment) has **no callers and no cron**. Consequences: an offer that expires with no competing accept leaves the delivery ASSIGNED with a dead pending offer. The driver's UI filters expired offers client-side; operations can still see the delivery and manually re-dispatch. **Classification: manually recoverable via Operations; not automatically recovered.** Recommended: schedule `processExpiredOffers` via a Convex cron (small, isolated change) or call it from the ops Dispatch tab load path.
- Duplicate dispatch is guarded ("Delivery already has an active offer"); no-driver conditions surface in the exceptions list ("No driver assigned").

---

## 10. Testing Readiness

30 suites, all passing (this audit re-ran them):

| Area | Suites |
|---|---|
| State machine | 59 tests (incl. terminal-state integrity, permissions completeness) |
| Production readiness | 113 tests (lifecycle, concurrency, duplicates, offline, GPS, POD, providers) |
| Authorization / role access | 55 + 55 tests |
| Reassignment authz | 16 |
| Tracking | 29 (+15 location hook) |
| Offline | 42 |
| POD | 17 + 13 |
| Payment / settlement / reconciliation / payout | 28 / 24 / 18 / 20 |
| Driver workflows / offers / history / earnings / profile | 8 / 19 / 18 / 25+27 / 15 |
| Notifications | 21 + 9 |
| Audit | ✅ + 14 (entity authz) + 13 (actor attribution) |
| Operations Centre | 56 |
| Customer tracking | 17 |
| Pricing / profile validation | 19 / 15 |

**Gaps:** no true browser E2E (Playwright-class) suite; concurrency covered logically (re-read guards) but not under real parallel execution; no load/volume tests. Acceptable for pilot; flagged for post-pilot.

---

## 11. Production Configuration

Required before real deployment (managed via the project's Keys/API settings and Convex dashboard):

| Item | Purpose |
|---|---|
| `PAYSTACK_SECRET_KEY` | Payment init/verify + webhook signature verification (server-side) |
| Paystack webhook URL | Register `https://<convex-deployment>.convex.site/payments/paystack/webhook` |
| `GOOGLE_MAPS_API_KEY` | Geocoding + health-check routing provider |
| `CONVEX_SITE_URL` | Convex Auth OIDC issuer (self-issued tokens) |
| `VITE_CONVEX_URL` | Client Convex endpoint (already set) |
| Role provisioning | Manually assign DRIVER/OPERATIONS/COMPANY_ADMIN roles via dashboard for pilot staff |
| Email OTP | Freebuff bridge key currently hardcoded (S1) — move to env |

Observability exists: `/health`, `/health/live`, `/health/ready` + Vly monitoring instrumentation. No feature flags are used; behaviour is code-determined.

---

## 12. Deployment Checklist (Pilot)

1. ✅ TypeScript passes; production build succeeds; all 30 suites green.
2. Configure `PAYSTACK_SECRET_KEY`, `GOOGLE_MAPS_API_KEY` in Keys settings.
3. Register the Paystack webhook URL on the Convex deployment; send a test `charge.success` and confirm idempotent completion.
4. Provision pilot users: customers via sign-up; drivers/ops/company-admin via dashboard role assignment.
5. Verify `/health` returns 200 with providers configured.
6. Smoke-test the full loop with one real order: request → pay (test mode) → dispatch → accept → GPS → POD → complete → settlement + notifications visible to all parties.
7. Confirm the driver offline path: enable airplane mode mid-trip, confirm buffering indicator, restore connectivity, confirm sync and buffer cleanup on completion.
8. Verify customer A cannot open customer B's `/deliveries/:id` (expect identical not-found).
9. Decide the offer-expiry operating procedure: either schedule `processExpiredOffers` or assign an ops owner to check the Exceptions tab.
10. Document on-call access to the Convex dashboard for manual role provisioning and offer recovery.

---

## 13. Remaining Blockers

**Must fix before uncontrolled production:**

| # | Blocker | Type |
|---|---|---|
| B1 | Offer expiry automation (cron or ops-tab trigger for `processExpiredOffers`) | Operational reliability |
| B2 | COMPANY_ADMIN ownership check on `assignDriver` (parity with dispatch/reassign) | Security consistency |
| B3 | Hardcoded email-OTP API key → environment configuration | Secret hygiene |

**Pilot-acceptable (documented, not blocking):** manual role provisioning; no admin-specific pages; no external payout; no SMS/email/push; manual tracking-retention execution; no wallet top-up charging.

---

## 14. Recommended Next Work

Ranked by production risk → customer impact → operational impact → complexity:

1. **B1 — Schedule offer expiry** (Convex cron calling `processExpiredOffers`): removes the only stuck-state path; small, isolated.
2. **B2 — `assignDriver` company-ownership check**: one-function authorization parity fix; reuses the `reassignDelivery` pattern.
3. **B3 — Move the OTP bridge key to env**: trivial secret-hygiene fix.
4. **Driver payout provider integration** (Paystack Transfers) behind the existing eligibility gate — the largest customer/operational value item after the gates are correct.
5. **Admin role-management mutation** (super_admin-only, audited) to replace dashboard provisioning.
6. **Tracking-retention cron** (`cleanupTrackingData`).
7. Post-pilot: browser E2E suite; wallet top-up via Paystack; refund flow.

---

*This audit made no product, pricing, payment, settlement, reconciliation, payout-eligibility, dispatch-scoring, GPS, POD, or notification changes. Verification: `convex dev --once` ✅ · `tsc -b --noEmit` 0 errors · `bun run build` ✅ (10.5s) · all suites green.*
