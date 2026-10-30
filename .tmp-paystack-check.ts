import { writeFileSync } from "node:fs";

const BASE = "https://incredible-warbler-335.convex.cloud";

async function call(
  kind: "action" | "mutation" | "query",
  path: string,
  args: unknown,
  token?: string,
) {
  const res = await fetch(`${BASE}/api/${kind}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ path, args, format: "json" }),
  });
  const body = await res.json();
  if (body.status !== "success") {
    throw new Error(`${kind} ${path} failed: ${body.errorMessage ?? JSON.stringify(body)}`);
  }
  return body.value;
}

const stamp = Date.now().toString(36);
const email = `lasha.paystack.check.${stamp}@gmail.com`;
const password = `PaystackCheck-${stamp}-2026!`;

async function main() {
  const auth = await call("action", "auth:signIn", {
    provider: "password",
    params: { flow: "signUp", email, password },
  });
  const token: string = auth.tokens.token;

  await call("mutation", "users:updateMyProfile", { name: "Paystack Check" }, token);

  const order = await call(
    "mutation",
    "deliveries/state_machine:createOrderAndDelivery",
    {
      orderName: `Paystack 30/70 check ${stamp}`,
      parcelType: "small-parcel",
      expeditionType: "standard",
      width: 40,
      height: 30,
      weight: 8,
      pickupAddress: "12 Bree Street, Cape Town CBD",
      pickupLat: -33.9189,
      pickupLng: 18.4233,
      dropoffAddress: "7 Church Street, Stellenbosch",
      dropoffLat: -33.9321,
      dropoffLng: 18.8602,
      recipientName: "Paystack Test",
      recipientPhone: "+27 71 000 0000",
    },
    token,
  );

  const quote = await call(
    "query",
    "pricing/service:getQuoteForOrder",
    { orderId: order.orderId },
    token,
  );

  const payment = await call(
    "action",
    "payments/actions:initiateOrderPayment",
    { orderId: order.orderId, method: "card" },
    token,
  );

  const summary = {
    email,
    password,
    token,
    orderId: order.orderId,
    deliveryId: order.deliveryId,
    price: order.price,
    quote,
    payment,
  };
  writeFileSync(".tmp-paystack-check.json", JSON.stringify(summary, null, 2));

  const total = quote.totalCharge ?? order.price;
  const platform = quote.platformFee;
  const driver = quote.driverEarnings;
  console.log("ORDER", order.orderId);
  console.log("TOTAL_CENTS", total);
  console.log("PLATFORM_CENTS", platform);
  console.log("DRIVER_CENTS", driver);
  if (typeof total === "number" && typeof platform === "number" && typeof driver === "number") {
    console.log("PLATFORM_PERCENT", ((platform / total) * 100).toFixed(2));
    console.log("DRIVER_PERCENT", ((driver / total) * 100).toFixed(2));
  }
  console.log("REFERENCE", payment.reference);
  console.log("AUTH_URL", payment.authorizationUrl ?? "(none)");
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
