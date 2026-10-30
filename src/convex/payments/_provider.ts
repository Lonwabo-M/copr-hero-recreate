/**
 * Paystack provider helpers (shared, non-function module).
 *
 * The underscore prefix keeps this file out of Convex's function scanner —
 * it holds plain helpers importable by both payments/actions.ts and http.ts.
 */

export type PaystackVerification = {
  status: string;
  id?: string;
  amount?: number;
};

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
