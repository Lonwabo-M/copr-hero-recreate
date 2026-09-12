/**
 * Paystack provider helpers (shared, non-function module).
 *
 * The underscore prefix keeps this file out of Convex's function scanner —
 * it holds plain helpers importable by both payments/actions.ts and http.ts.
 */

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
