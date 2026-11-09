# Lasha Proof of Delivery Architecture

## Overview

Proof of Delivery (POD) is the immutable handover record for a delivery. It
answers three questions with server-verified data:

1. **Who received the parcel?** Recipient name and optional phone.
2. **What evidence proves it?** At least one recipient signature or delivery
   photo, stored in Convex File Storage.
3. **Where and when did it happen?** Server timestamp plus optional, validated
   handover coordinates.

POD is a separate domain from delivery state. The delivery state machine owns
the transition to `delivered`; the POD domain owns the evidence that authorizes
that transition.

### Design principles

- The server is authoritative. The browser cannot mark a delivery delivered,
  invent file metadata, or attach an empty POD.
- Completion is atomic. Evidence records, delivery/order status, tracking,
  audit, settlement, and customer notification commit in one Convex mutation.
- Evidence is immutable once the delivery is terminal.
- Evidence URLs are issued only through an authorized POD query.
- Operations can review evidence, but cannot fabricate a handover on the
  driver's behalf from the Operations Centre.

---

## End-to-end flow

```
Driver at dropoff (AT_DROPOFF)
  │
  ├─ Capture recipient name (required)
  ├─ Capture recipient phone / notes (optional)
  ├─ Capture signature (canvas → PNG) and/or photos
  ├─ Capture browser location (optional, best effort)
  │
  ├─ POST each blob to Convex File Storage
  │     generateUploadUrl() → upload URL → storageId
  │
  └─ completeDeliveryWithPOD({
       deliveryId, recipientName, recipientPhone, deliveryNotes,
       signatureFileId?, photoFileIds?, latitude?, longitude?, locationAccuracy?
     })
        │
        ├─ authenticate + authorize assigned driver
        ├─ verify state is AT_DROPOFF
        ├─ verify at least one evidence file
        ├─ verify every storageId against actual size/MIME metadata
        ├─ validate coordinate ranges and accuracy
        ├─ insert proof_of_delivery + pod_files
        ├─ set recipientSignatureId when a signature exists
        ├─ patch delivery DELIVERED, order delivered
        ├─ insert tracking event + audit event
        ├─ create driver settlement + trip counter
        └─ notify the order sender
             │
             ▼
Authorized POD query returns record + storage URLs
  ├─ Customer tracking page
  ├─ Driver active/history page
  └─ Operations delivery detail
```

A lost response is safe to retry: the deterministic key
`pod-complete-${deliveryId}` returns the existing POD instead of creating a
second one. Uploaded storage objects are cached client-side across retries so a
failed completion does not re-upload the same evidence.

### Components

| Layer | File | Responsibility |
|---|---|---|
| Driver capture | `src/pages/DriverActiveDelivery.tsx` | Recipient fields, signature/photo capture, location, upload, atomic submit |
| Signature canvas | `src/components/pod/SignaturePad.tsx` | Pointer/touch drawing, clear, PNG output |
| Client rules | `src/lib/pod.ts` | File type/size/count validation and display labels |
| Shared viewer | `src/components/pod/PODSummary.tsx` | Recipient, notes, location, signature/photo/document previews |
| POD domain | `src/convex/pod/service.ts` | Authorized queries, atomic completion, failure recording, evidence validation |
| Completion gate | `src/convex/deliveries/state_machine.ts` | Legacy completion path requires a POD **and** at least one evidence file |
| Styles | `src/styles/pod.css` | Responsive POD card, gallery, signature surface |

---

## Data model

### `proof_of_delivery`

```typescript
{
  deliveryId: Id<"deliveries">,
  orderId: Id<"orders">,
  submittedBy: Id<"users">,
  outcome: "delivered" | "partial" | "failed",
  recipientName: string,
  recipientPhone?: string,
  recipientSignatureId?: string,   // storage id; pod_files is authoritative
  deliveryNotes?: string,
  latitude?: number,
  longitude?: number,
  locationAccuracy?: number,
  deliveredAt: number,
  createdAt: number,
  updatedAt: number,
  failureReason?: FailureReason,   // required for outcome "failed"
  failureNotes?: string,
  idempotencyKey: string,
}
```

Indexes: `by_delivery`, `by_order`, `by_submitter`, `by_outcome`,
`by_idempotency`.

### `pod_files`

```typescript
{
  podId: Id<"proof_of_delivery">,
  deliveryId: Id<"deliveries">,
  fileId: string,                  // Convex storage id
  fileType: "photo" | "signature" | "document",
  fileName: string,
  fileSize: number,                // resolved from storage metadata
  mimeType: string,                // resolved from storage metadata
  description?: string,
  uploadedBy: Id<"users">,
  createdAt: number,
}
```

Indexes: `by_pod`, `by_delivery`, `by_type`.

> Client-supplied `fileSize` and `mimeType` are never trusted. The server reads
> `ctx.storage.getMetadata()` and records those authoritative values.

---

## Evidence rules

| Rule | Value |
|---|---|
| Maximum files per POD | 5 total (including signature) |
| Maximum photos | 4 when a signature is present |
| Maximum file size | 10 MB |
| Accepted successful-handover images | JPEG, PNG, WebP |
| Signature format | PNG, generated by the canvas |
| Successful handover evidence | At least one signature or photo |
| Failure photos | Up to 5 images, optional |
| Signature count | At most one per POD |
| Accepted coordinates | lat −90…90, lng −180…180, accuracy 0…100,000 m |
| Location requirement | Optional; denial never blocks a valid handover |

Legacy `createPOD` + `addPODEvidence` calls remain available for staged
records, but the state-machine completion gate rejects a POD with zero evidence
files. The driver UI uses only the atomic completion call.

---

## Authorization

`canAccessPOD` resolves ownership through `orderId`; it never trusts a
client-supplied user or business identity.

| Action | Customer | Driver | Operations | Company / Super Admin |
|---|---|---|---|---|
| View POD | own orders | assigned delivery | any | company-scoped / any |
| Submit signature/photos | ❌ | assigned delivery | ❌ | ❌ |
| Complete via POD UI | ❌ | assigned delivery | ❌ | ❌ |
| Record failed delivery | ❌ | assigned delivery | API only | API only |
| Review evidence in Operations | ❌ | ❌ | ✅ | ✅ |

Operations deliberately has no “Mark delivered” control. It can reassign, fail,
or cancel, but a handover record must originate from the delivery workflow. The
server-side `completeDeliveryWithPOD` authorization remains available for
trusted automation; it still requires validated evidence.

Evidence URLs are resolved by `loadPODFiles()` only after the query has passed
`canAccessPOD`. The browser never receives raw storage IDs as a download path
and never constructs an evidence URL.

---

## API reference

### Queries

| Query | Description | Auth |
|---|---|---|
| `getPODForDelivery` | Latest POD + evidence URLs for a delivery | `canAccessPOD` |
| `getPOD` | POD by id + evidence URLs | `canAccessPOD` |
| `getMyPODs` | PODs submitted by the session user | submitter |

### Mutations

| Mutation | Description | Auth |
|---|---|---|
| `completeDeliveryWithPOD` | Atomic POD + DELIVERED transition | `canManagePOD`, AT_DROPOFF, evidence required |
| `recordFailedDelivery` | Failure POD + FAILED transition | `canManagePOD`, failable state |
| `createPOD` | Staged POD record (legacy) | `canManagePOD`, non-terminal state |
| `addPODEvidence` | Add one validated file (legacy) | `canManagePOD`, non-terminal state |
| `generateUploadUrl` | Mint a Convex storage upload URL | driver / operations / admin |

`completeDeliveryWithPOD` performs, in order:

1. authenticate and resolve the actor from the session;
2. verify delivery access (`canManagePOD`);
3. return an existing POD for the deterministic completion key;
4. require `AT_DROPOFF`;
5. require a non-empty recipient name;
6. require at least one evidence id and reject duplicates;
7. validate every storage object’s size, MIME type, and image requirement;
8. validate optional coordinates;
9. insert POD + evidence, transitioning the delivery/order;
10. record tracking + audit, create settlement, update trip count;
11. notify the customer.

If any step throws, the Convex transaction rolls back. A delivery cannot appear
`delivered` with a partial POD or missing settlement.

---

## Failure flow

1. Driver selects a failure reason and optional notes.
2. Driver can attach up to five optional photos (validated the same way).
3. `recordFailedDelivery` creates a POD with `outcome: "failed"`.
4. Delivery moves to `failed`; order moves to `cancelled`.
5. Tracking/audit events are recorded and the customer is notified with a
   customer-safe reason.
6. Customer tracking, driver history, and operations detail show the failure
   POD and any evidence.

Failure reasons: `recipient_unavailable`, `incorrect_address`,
`refused_delivery`, `damaged_goods`, `missing_goods`, `vehicle_problem`,
`safety_issue`, `other`.

---

## Customer, driver, and operations views

All three use the same `PODSummary` component with the same authorized query
result:

- outcome badge (`Delivered`, `Partially delivered`, `Not delivered`);
- recipient name and optional phone;
- recorded timestamp;
- handover location (coordinates only for driver/operations; customers see
  “Captured at the delivery point” plus accuracy);
- delivery notes / failure details;
- signature preview;
- photo gallery with open/download links;
- document links (legacy PODs);
- an explicit empty-evidence warning if an older record has no files.

The customer page shows the POD for `delivered` and `failed` attempts. A
`cancelled` delivery has no POD section.

---

## Testing

| Command | Coverage |
|---|---|
| `bunx tsx src/lib/pod.test.ts` | Client evidence rules, labels, limits |
| `bunx tsx src/convex/testing/pod-workflow.test.ts` | Evidence gate, atomic driver call, signature link, URL authorization, no operations bypass |
| `bunx tsx src/convex/testing/driver-workflow.test.ts` | Driver state/action alignment |
| `bunx tsx src/pages/driverHistory.test.ts` | Driver POD read authorization |
| `bunx tsx src/convex/testing/settlement.test.ts` | Settlement side effect remains wired |
| `bun tsc -b --noEmit` | Full TypeScript contract |

No browser automation or authenticated staging session is available in this
environment, so the flows are verified at the source/contract level and with
TypeScript, not with end-to-end visual clicks.

---

## Future work

1. Cryptographic signature verification / signing certificates.
2. Operations proxy capture for exceptional cases, with a distinct audit trail.
3. Evidence retention policy, legal hold, and redaction controls.
4. Batch handover for multi-parcel deliveries.
5. Customer-facing evidence download as a combined PDF.
