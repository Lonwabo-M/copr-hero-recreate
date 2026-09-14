import { Email } from "@convex-dev/auth/providers/Email";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

/**
 * Email delivery via the platform email API (Freebuff/Vly).
 *
 * Used ONLY for password-reset codes. Primary sign-in / sign-up is
 * email + password and needs no email delivery at all.
 *
 * How it sends:
 *   POST https://integrations.vly.ai/v1/email/send
 *   Authorization: Bearer <VLY_INTEGRATION_KEY>
 *   { to: [...], from: "noreply@project.freebuff.dev", subject, html, text }
 *
 * This is the same endpoint the platform's own `@vly-ai/integrations`
 * email client uses, authenticated with the deployment's already-provisioned
 * `VLY_INTEGRATION_KEY` — no separate email provider or extra key required.
 *
 * Secret hygiene:
 * - The key is read only from the server-side Convex environment; it is
 *   never hardcoded, logged, returned to the client, or included in thrown
 *   error messages (HTTP error objects can carry request headers, which
 *   would leak the key).
 * - Missing configuration fails closed with a clear server-side error
 *   naming only the missing variable.
 */
export const emailDelivery = Email({
  id: "email-delivery",
  maxAge: 60 * 15, // 15 minutes
  // Six-digit numeric codes keep the reset experience consistent and simple.
  async generateVerificationToken() {
    const random: RandomReader = {
      read(bytes: Uint8Array) {
        crypto.getRandomValues(bytes);
      },
    };
    const alphabet = "0123456789";
    return generateRandomString(random, alphabet, 6);
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const apiKey = process.env.VLY_INTEGRATION_KEY;
    if (!apiKey) {
      throw new Error(
        "Email delivery is not configured. Add VLY_INTEGRATION_KEY in the project's API keys settings."
      );
    }

    const code = token;
    const response = await fetch("https://integrations.vly.ai/v1/email/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "X-Vly-Version": "0.1.0",
      },
      body: JSON.stringify({
        to: [email],
        from: "noreply@project.freebuff.dev",
        subject: "Your Lasha password reset code",
        text: `Your Lasha password reset code is ${code}. It expires in 15 minutes. If you did not request this, you can ignore this email.`,
        html: [
          '<div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;">',
          '  <h2 style="color:#082631;margin:0 0 8px;">Reset your password</h2>',
          '  <p style="color:#4a5a60;font-size:14px;line-height:1.6;">Use the code below to set a new password for your Lasha account. It expires in 15 minutes.</p>',
          `  <div style="font-size:32px;font-weight:700;letter-spacing:0.3em;color:#082631;background:#f4f6f7;border-radius:12px;padding:16px 24px;text-align:center;margin:20px 0;">${code}</div>`,
          '  <p style="color:#8a959a;font-size:12px;line-height:1.6;">If you did not request a password reset, you can safely ignore this email — your current password remains active.</p>',
          "</div>",
        ].join(""),
      }),
    });

    if (!response.ok) {
      // Do NOT include the response body or any request headers in the
      // thrown error — throw a generic delivery failure instead.
      throw new Error("Failed to send email");
    }
  },
});
