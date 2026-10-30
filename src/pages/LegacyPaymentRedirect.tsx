import { Navigate, useSearchParams } from "react-router";

/**
 * Compatibility shim for Paystack checkouts initialized before the callback URL
 * moved from `/make-payment` to `/checkout/:orderId`.
 *
 * The old action's reference is `pay-{orderId}` (retry attempts add `-r{n}`),
 * so the order can be recovered and the reference handed to the order-scoped
 * Checkout for server-side verification. After the backend is deployed, new
 * checkouts return to `/checkout/:orderId` directly and this route is unused.
 *
 * Without a recognizable reference this is just the legacy route redirect.
 */
export default function LegacyPaymentRedirect() {
  const [searchParams] = useSearchParams();
  const reference = searchParams.get("reference");
  const match = reference?.match(/^pay-([a-z0-9]+)(?:-r\d+)?$/i);

  if (reference && match?.[1]) {
    return (
      <Navigate
        to={`/checkout/${match[1]}?reference=${encodeURIComponent(reference)}`}
        replace
      />
    );
  }

  return <Navigate to="/dashboard" replace />;
}
