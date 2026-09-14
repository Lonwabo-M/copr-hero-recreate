// NOTE: This file is managed by the platform template but is intentionally
// updated here to switch the project's primary authentication method from
// email OTP to email + password, per the vly auth provider-configuration
// contract (a standard Convex Auth provider registration).

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";
import { emailDelivery } from "./auth/email";

/**
 * Primary authentication: email + password via Convex Auth's supported
 * `Password` provider.
 *
 * - Passwords are hashed by the provider (Scrypt) — never stored or logged
 *   in plaintext.
 * - `reset: emailDelivery` enables the provider's password-reset flow
 *   ("reset" + "reset-verification"): a 6-digit code is emailed, verified by
 *   the provider, and the new password replaces the old one. It also enables
 *   email-linking on sign-up, which is the legacy-account migration path:
 *   a user whose email was already verified by the previous OTP flow who
 *   signs up with a password is linked to their EXISTING user record
 *   (same user ID, role, businessId) instead of creating a duplicate
 *   identity. See docs/authentication.md.
 * - `validatePasswordRequirements` keeps the provider's baseline strength
 *   (minimum 8 characters) with a clear message; it does not weaken the
 *   default policy.
 * - Roles are NEVER provided by the client. New users have no role until
 *   provisioned server-side (unchanged behaviour — `getCurrentAuthUser`
 *   defaults unprovisioned users to the customer experience, and Convex
 *   remains the authorization authority).
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      id: "password",
      reset: emailDelivery,
      validatePasswordRequirements(password: string) {
        if (!password || password.length < 8) {
          throw new Error("Password must be at least 8 characters");
        }
      },
    }),
    // Pre-existing platform provider (guest/freebuff bridging). Not a
    // competing primary sign-in path — the application UI only ever invokes
    // the password provider.
    Anonymous,
  ],
});
