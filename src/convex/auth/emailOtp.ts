import { Email } from "@convex-dev/auth/providers/Email";
import axios from "axios";
import { RandomReader, generateRandomString } from "@oslojs/crypto/random";

/**
 * Email OTP provider bridge.
 *
 * The provider credential is read from the server-only Convex environment —
 * never hardcoded, never logged, never returned to the client, and never
 * included in thrown error messages (an axios error object serializes its
 * request headers, which would leak the key). Missing configuration fails
 * clearly on the server before any provider call is attempted.
 *
 * Configure via the project's API-keys settings / Convex env:
 *   EMAIL_OTP_API_KEY
 */
export const emailOtp = Email({
  id: "email-otp",
  maxAge: 60 * 15, // 15 minutes
  // This function can be asynchronous
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
    const apiKey = process.env.EMAIL_OTP_API_KEY;
    if (!apiKey) {
      // Fail closed with a clear server-side configuration error. The
      // message names only the missing variable — no secret material,
      // no provider infrastructure details.
      throw new Error(
        "Email OTP provider is not configured. Add EMAIL_OTP_API_KEY in the project's API keys settings."
      );
    }

    try {
      await axios.post(
        "https://auth.freebuff.app/send_otp",
        {
          to: email,
          otp: token,
          appName: process.env.VLY_APP_NAME || "a freebuff.com application",
        },
        {
          headers: {
            "x-api-key": apiKey,
          },
        },
      );
    } catch (error) {
      // Do NOT serialize the raw axios error: `error.config.headers` contains
      // the API key, and the JSON body would leak provider details. Throw a
      // generic delivery failure instead — Convex Auth surfaces thrown
      // errors from this hook toward the client sign-in flow.
      throw new Error("Failed to send verification email");
    }
  },
});
