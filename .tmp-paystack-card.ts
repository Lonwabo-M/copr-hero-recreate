import { readFileSync } from "node:fs";

const BASE = "https://incredible-warbler-335.convex.cloud";
const state = JSON.parse(readFileSync(".tmp-paystack-check.json", "utf8"));

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

async function main() {
  const result = await call(
    "action",
    "payments/actions:chargeOrderPaymentWithCard",
    {
      orderId: state.orderId,
      card: {
        holderName: "Paystack Test",
        number: "4084084084084081",
        expiryMonth: "12",
        expiryYear: "30",
        cvv: "408",
      },
    },
    state.token,
  );
  console.log("CHARGE_RESULT", JSON.stringify(result));
  if (result.status === "otp_required") {
    const otpResult = await call(
      "action",
      "payments/actions:submitPaymentOtp",
      { reference: result.reference, otp: "123456" },
      state.token,
    );
    console.log("OTP_RESULT", JSON.stringify(otpResult));
  }
}

main().catch((err) => {
  console.error("FAILED:", err instanceof Error ? err.message : err);
  process.exit(1);
});
