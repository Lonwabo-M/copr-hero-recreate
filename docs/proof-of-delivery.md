# Lasha Proof of Delivery Architecture

## Overview

Lasha implements a server-side Proof of Delivery (POD) system using Convex. POD captures evidence that a delivery was completed (or failed) and associates it with the delivery record.

**Key principles:**
- All POD operations are server-side authorized
- POD is the evidence associated with a delivery
- Delivery is the business object
- POD supports both successful and failed delivery outcomes
- Files are stored in Convex File Storage
- Operations are idempotent

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    React UI                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐│
│  │ Capture      │  │ Upload      │  │ View POD        ││
│  │ Signature    │  │ Photos      │  │                 ││
│  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘│
│         │                │                   │          │
│  ┌──────┴────────────────┴───────────────────┴────────┐│
│  │              POD Service Layer                      ││
│  └──────────────────────┬─────────────────────────────┘│
└─────────────────────────┼───────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────┐
│                    Convex                               │
│  ┌──────────────────────┴─────────────────────────────┐│
│  │           POD Domain (server-side)                  ││
│  │  • createPOD                                        ││
│  │  • addPODEvidence                                   ││
│  │  • completeDeliveryWithPOD                          ││
│  │  • recordFailedDelivery                             ││
│  │  • generateUploadUrl                                ││
│  └──────────────────────┬─────────────────────────────┘│
│                         │                               │
│  ┌──────────────────────┴─────────────────────────────┐│
│  │         Convex File Storage                         ││
│  │  • Photos                                          ││
│  │  • Signatures                                      ││
│  │  • Documents                                       ││
│  └────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

---

## Data Model

### Proof of Delivery

```typescript
proof_of_delivery: {
  deliveryId: v.id("deliveries"),
  orderId: v.id("orders"),
  submittedBy: v.id("users"),
  
  // Delivery outcome
  outcome: "delivered" | "partial" | "failed",
  
  // Recipient information
  recipientName: string,
  recipientPhone?: string,
  recipientSignatureId?: string,
  
  // Delivery notes
  deliveryNotes?: string,
  
  // Location evidence
  latitude?: number,
  longitude?: number,
  locationAccuracy?: number,
  
  // Timestamps
  deliveredAt: number,
  createdAt: number,
  updatedAt: number,
  
  // Failure information
  failureReason?: string,
  failureNotes?: string,
  
  // Idempotency
  idempotencyKey: string,
}
```

### POD Files

```typescript
pod_files: {
  podId: v.id("proof_of_delivery"),
  deliveryId: v.id("deliveries"),
  fileId: string,          // Convex File Storage ID
  fileType: "photo" | "signature" | "document",
  fileName: string,
  fileSize: number,
  mimeType: string,
  description?: string,
  uploadedBy: v.id("users"),
  createdAt: number,
}
```

---

## POD Lifecycle

### Successful Delivery

```
Driver arrives at dropoff (AT_DROPOFF)
    ↓
Driver captures POD:
  • Recipient name
  • Signature (optional)
  • Photos (optional)
  • Delivery notes (optional)
  • GPS location (optional)
    ↓
completeDeliveryWithPOD()
    ↓
1. Validate authorization
2. Validate delivery state
3. Check idempotency
4. Create POD record
5. Store files
6. Transition delivery to DELIVERED
7. Update order status
8. Record tracking event
    ↓
Delivery completed with evidence
```

### Failed Delivery

```
Driver encounters issue
    ↓
Driver records failure:
  • Failure reason
  • Failure notes
  • Photos (optional)
  • GPS location (optional)
    ↓
recordFailedDelivery()
    ↓
1. Validate authorization
2. Validate delivery state
3. Check idempotency
4. Create POD record (outcome: failed)
5. Store files
6. Transition delivery to FAILED
7. Update order status
8. Record tracking event
    ↓
Delivery marked as failed with evidence
```

---

## API Reference

### Queries

| Query | Description | Auth |
|-------|-------------|------|
| `getPODForDelivery` | Get POD for a delivery | owner/driver/ops |
| `getPOD` | Get POD by ID | owner/driver/ops |
| `getMyPODs` | Get user's PODs | submitter |

### Mutations

| Mutation | Description | Auth |
|----------|-------------|------|
| `createPOD` | Create POD record | driver/ops |
| `addPODEvidence` | Add file to POD | driver/ops |
| `completeDeliveryWithPOD` | Complete delivery with POD | driver/ops |
| `recordFailedDelivery` | Record failed delivery | driver/ops |

### Actions

| Action | Description |
|--------|-------------|
| `generateUploadUrl` | Get upload URL for files |

---

## File Storage Flow

### 1. Get Upload URL

```typescript
const uploadUrl = await generateUploadUrl();
```

### 2. Upload File

```typescript
const response = await fetch(uploadUrl, {
  method: "POST",
  headers: { "Content-Type": fileType },
  body: fileBlob,
});

const { storageId } = await response.json();
```

### 3. Associate with POD

```typescript
await addPODEvidence({
  podId,
  fileId: storageId,
  fileType: "photo",
  fileName: file.name,
  fileSize: file.size,
  mimeType: file.type,
});
```

---

## Authorization Model

| Action | Customer | Driver | Operations | Super Admin |
|--------|----------|--------|------------|-------------|
| View POD | ✅ (own) | ✅ (assigned) | ✅ | ✅ |
| Create POD | ❌ | ✅ (assigned) | ✅ | ✅ |
| Add Evidence | ❌ | ✅ (assigned) | ✅ | ✅ |
| Complete Delivery | ❌ | ✅ (assigned) | ✅ | ✅ |
| Record Failure | ❌ | ✅ (assigned) | ✅ | ✅ |

---

## Supported Evidence

### Photos

- Maximum 10MB per file
- Allowed types: JPEG, PNG, WebP
- Multiple photos per POD
- Metadata: fileName, fileSize, mimeType

### Signatures

- Stored as image files
- One signature per POD
- Captured via signature pad component

### Documents

- PDF files
- Delivery notes as text

---

## Failure Workflow

### Failure Reasons

| Reason | Description |
|--------|-------------|
| `recipient_unavailable` | Nobody to receive |
| `incorrect_address` | Wrong address |
| `refused_delivery` | Recipient refused |
| `damaged_goods` | Package damaged |
| `missing_goods` | Items missing |
| `vehicle_problem` | Vehicle issue |
| `safety_issue` | Safety concern |
| `other` | Other reason |

### Failure Process

1. Driver selects failure reason
2. Adds notes and photos
3. System creates POD with outcome: "failed"
4. Delivery transitions to FAILED
5. Order status updated to "cancelled"

---

## Idempotency

All POD operations use idempotency keys:

```typescript
// POD creation
idempotencyKey: `pod-${deliveryId}-${userId}`

// Delivery completion
idempotencyKey: `pod-complete-${deliveryId}`

// Failure recording
idempotencyKey: `pod-fail-${deliveryId}`
```

Duplicate requests return the existing POD without creating duplicates.

---

## Security Considerations

1. **Authorization** - All operations verify user role and delivery assignment
2. **File Validation** - File type and size limits enforced
3. **IDOR Prevention** - Delivery access verified server-side
4. **Idempotency** - Duplicate submissions prevented
5. **Immutability** - Historical POD data preserved

---

## React Integration

### Use POD Hook

```typescript
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

function DeliveryPOD({ deliveryId }) {
  const pod = useQuery(api.pod.service.getPODForDelivery, { deliveryId });
  const completeDelivery = useMutation(api.pod.service.completeDeliveryWithPOD);
  
  const handleComplete = async (data) => {
    await completeDelivery({
      deliveryId,
      recipientName: data.recipientName,
      signatureFileId: data.signatureId,
      photoFileIds: data.photoIds,
    });
  };
  
  return (
    <div>
      {pod ? (
        <PODDetails pod={pod} />
      ) : (
        <PODCapture onComplete={handleComplete} />
      )}
    </div>
  );
}
```

### File Upload

```typescript
import { useAction } from "convex/react";

function FileUpload() {
  const generateUploadUrl = useAction(api.pod.service.generateUploadUrl);
  
  const uploadFile = async (file) => {
    const uploadUrl = await generateUploadUrl();
    
    const response = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    });
    
    const { storageId } = await response.json();
    return storageId;
  };
  
  return <input type="file" onChange={(e) => uploadFile(e.target.files[0])} />;
}
```

---

## File Structure

```
src/convex/
├── pod/
│   ├── service.ts          # POD mutations and queries
│   └── pod.test.ts         # Tests
└── schema.ts               # Enhanced with POD tables

docs/
└── proof-of-delivery.md    # This document
```

---

## Future Enhancements

1. **Batch POD** - Complete multiple deliveries at once
2. **POD Templates** - Custom forms per delivery type
3. **Digital Signatures** - Cryptographic verification
4. **POD Sharing** - Share proof with customers
5. **POD Analytics** - Delivery success rates
6. **Automated POD** - IoT-based delivery confirmation
