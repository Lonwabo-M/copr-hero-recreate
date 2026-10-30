/**
 * Paystack provider helpers (shared, non-function module).
 *
 * The underscore prefix keeps this file out of Convex's function scanner —
 * it holds plain helpers importable by both payments/actions.ts and http.ts.
 */

const PAYSTACK_BASE = "https://api.paystack.co";

export type PaystackVerification = {
  status: string;
  id?: string;
  amount?: number;
};

export type PaystackRefundStatus =
  | "pending"
  | "processing"
  | "processed"
  | "failed";

export type PaystackRefundRecord = {
  id?: string;
  status?: string;
  amount?: number;
  refundReference?: string;
};

export function normalizePaystackRefundStatus(
  status: unknown,
): PaystackRefundStatus | null {
  if (
    status === "pending" ||
    status === "processing" ||
    status === "processed" ||
    status === "failed"
  ) {
    return status;
  }
  return null;
}

function parseProviderAmount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parseRefundRecord(raw: unknown): PaystackRefundRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as {
    id?: unknown;
    status?: unknown;
    amount?: unknown;
    refund_reference?: unknown;
  };
  return {
    id:
      typeof record.id === "number" || typeof record.id === "string"
        ? String(record.id)
        : undefined,
    status: typeof record.status === "string" ? record.status : undefined,
    amount: parseProviderAmount(record.amount),
    refundReference:
      typeof record.refund_reference === "string"
        ? record.refund_reference
        : undefined,
  };
}

/**
 * List existing refunds for one original Paystack transaction. Used before
 * creating an automatic refund so a retried action, or a manual refund already
 * made in the Paystack dashboard, cannot lead to a second refund.
 */
export async function listPaystackRefunds(
  secretKey: string,
  transactionReference: string,
): Promise<PaystackRefundRecord[]> {
  const response = await fetch(
    `${PAYSTACK_BASE}/refund?reference=${encodeURIComponent(transactionReference)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );

  if (!response.ok) {
    throw new Error(`Refund lookup failed (HTTP ${response.status})`);
  }

  const data = (await response.json()) as {
    status: boolean;
    data?: unknown;
  };
  if (!data.status || !Array.isArray(data.data)) {
    throw new Error("Refund lookup returned an invalid response");
  }

  return data.data
    .map(parseRefundRecord)
    .filter((record): record is PaystackRefundRecord => record !== null);
}

/** Create a full refund for a verified duplicate charge. */
export async function createPaystackRefund(
  secretKey: string,
  input: {
    transaction: string;
    amount: number;
    currency: "ZAR";
    merchantNote: string;
    customerNote: string;
  },
): Promise<PaystackRefundRecord> {
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new Error("Refund amount must be a positive integer in cents");
  }

  const response = await fetch(`${PAYSTACK_BASE}/refund`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      transaction: input.transaction,
      amount: input.amount,
      currency: input.currency,
      merchant_note: input.merchantNote,
      customer_note: input.customerNote,
    }),
  });

  if (!response.ok) {
    throw new Error(`Refund request failed (HTTP ${response.status})`);
  }

  const data = (await response.json()) as {
    status: boolean;
    data?: unknown;
  };
  const record = parseRefundRecord(data.data);
  if (!data.status || !record || !normalizePaystackRefundStatus(record.status)) {
    throw new Error("Refund request returned an invalid response");
  }

  return record;
}

/**
 * Fetch Paystack's authoritative transaction state. Shared by the customer
 * return-verify, the wallet gate, and wallet top-up verification so all paths
 * interpret provider statuses identically. Provider response bodies are never
 * relayed to the client.
 */
export async function verifyPaystackTransaction(
  secretKey: string,
  reference: string,
): Promise<PaystackVerification> {
  const response = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${secretKey}` } },
  );

  if (!response.ok) {
    throw new Error(`Payment verification failed (HTTP ${response.status})`);
  }

  const data = (await response.json()) as {
    status: boolean;
    data?: {
      status: string; // "success" | "failed" | "abandoned" | "ongoing"
      id?: number;
      amount?: number;
    };
  };

  if (!data.status || !data.data) {
    throw new Error("Payment verification returned an invalid response");
  }

  return {
    status: data.data.status,
    id: data.data.id ? String(data.data.id) : undefined,
    amount: data.data.amount,
  };
}

/** Require a positive integer cents amount before applying provider success. */
export function requireProviderAmount(
  verification: PaystackVerification,
): number {
  if (
    verification.amount === undefined ||
    !Number.isInteger(verification.amount) ||
    verification.amount <= 0
  ) {
    throw new Error("Payment verification did not include a valid charged amount");
  }
  return verification.amount;
}

/**
 * Compute Paystack's HMAC-SHA512 signature over the raw webhook body with the
 * secret key. Uses WebCrypto (available in the Convex runtime).
 */
export async function computePaystackSignature(
  rawBody: string,
  secretKey: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secretKey),
    { name: "HMAC", hash: "SHA-512" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Constant-time string comparison. Used for webhook signature verification so
 * a caller cannot recover the expected digest one byte at a time from response
 * timing. Both inputs here are fixed-length hex digests.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const left = encoder.encode(a);
  const right = encoder.encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}
