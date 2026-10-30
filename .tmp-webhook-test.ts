import crypto from "node:crypto";
import { readFileSync } from "node:fs";

const BASE = "https://incredible-warbler-335.convex.cloud";
const WEBHOOK = "https://incredible-warbler-335.convex.site/payments/paystack/webhook";

const secret = readFileSync("paystack-test-secret.txt", "utf8").trim();
if (!secret || secret.includes("PASTE_PAYSTACK")) {
  throw new Error("Paystack test secret key is still missing from paystack-test-secret.txt");
}

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

async function sendSigned(event: unknown) {
  const raw = JSON.stringify(event);
  const signature = crypto.createHmac("sha512", secret).update(raw).digest("hex");
  const res = await fetch(WEBHOOK, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-paystack-signature": signature,
    },
    body: raw,
  });
  return { status: res.status, body: await res.text() };
}

async function main() {
  const stamp = Date.now().toString(36);
  const email = `lasha.webhook.${stamp}@gmail.com`;
  const password = `WebhookTest-${stamp}-2026!`;

  const auth = await call("action", "auth:signIn", {
    provider: "password",
    params: { flow: "signUp", email, password },
  });
  const token: string = auth.tokens.token;

  await call("mutation", "users:updateMyProfile", { name: "Webhook Test" }, token);

  const order = await call(
    "mutation",
    "deliveries/state_machine:createOrderAndDelivery",
    {
      orderName: `Webhook test ${stamp}`,
      parcelType: "small-parcel",
      expeditionType: "standard",
      width: 35,
      height: 25,
      weight: 5,
      pickupAddress: "12 Bree Street, Cape Town CBD",
      pickupLat: -33.9189,
      pickupLng: 18.4233,
      dropoffAddress: "7 Church Street, Stellenbosch",
      dropoffLat: -33.9321,
      dropoffLng: 18.8602,
      recipientName: "Webhook Test",
      recipientPhone: "+27 71 000 0001",
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

  const event = {
    event: "charge.success",
    data: {
      id: 987654321,
      reference: payment.reference,
      amount: order.price,
      status: "success",
      currency: "ZAR",
      channel: "card",
      paid_at: new Date().toISOString(),
      customer: { email },
      metadata: { orderId: order.orderId },
    },
  };

  const first = await sendSigned(event);
  console.log("WEBHOOK_FIRST", first.status, first.body);

  const overview = await call("query", "payments/queries:getMyPaymentOverview", {}, token);
  const afterFirst = overview.find((row: any) => row.orderId === order.orderId);
  console.log("PAYMENT_AFTER_FIRST", JSON.stringify({
    orderId: order.orderId,
    amount: afterFirst?.amount,
    paymentStatus: afterFirst?.payment?.status,
    providerTransactionId: afterFirst?.payment?.providerTransactionId,
    platformFee: quote.platformFee,
    driverEarnings: quote.driverEarnings,
  }));

  const duplicate = await sendSigned(event);
  console.log("WEBHOOK_DUPLICATE", duplicate.status, duplicate.body);

  const overviewAfterDuplicate = await call(
    "query",
    "payments/queries:getMyPaymentOverview",
    {},
    token,
  );
  const afterDuplicate = overviewAfterDuplicate.find((row: any) => row.orderId === order.orderId);
  console.log("PAYMENT_AFTER_DUPLICATE", JSON.stringify({
    paymentStatus: afterDuplicate?.payment?.status,
    amount: afterDuplicate?.payment?.amount,
  }));

  if (first.status !== 200 || duplicate.status !== 200) {
    throw new Error("Webhook did not return HTTP 200");
  }
  if (afterFirst?.payment?.status !== "completed") {
    throw new Error("Webhook did not complete the pending payment");
  }
  if (afterDuplicate?.payment?.status !== "completed") {
    throw new Error("Duplicate webhook changed the completed payment");
  }
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
