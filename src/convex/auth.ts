// NOTE: This file is managed by the platform template but is intentionally
// updated here to switch the project's primary authentication method from
// email OTP to email + password, per the vly auth provider-configuration
// contract (a standard Convex Auth provider registration).

import { convexAuth } from "@convex-dev/auth/server";
import { Anonymous } from "@convex-dev/auth/providers/Anonymous";
import { Password } from "@convex-dev/auth/providers/Password";
import Zitadel from "@auth/core/providers/zitadel";
import { emailDelivery } from "./auth/email";
import { isStaffRole } from "./schema";

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

// Zitadel is the staff identity provider. The issuer and client ID are public;
// the client secret is only ever read from the Convex deployment environment
// and never shipped to the browser. A missing secret leaves staff sign-in
// unavailable without affecting the customer/driver password provider.
const ZITADEL_ISSUER = process.env.ZITADEL_ISSUER ?? "";
const ZITADEL_CLIENT_ID = process.env.ZITADEL_CLIENT_ID ?? "";
const ZITADEL_CLIENT_SECRET = process.env.ZITADEL_CLIENT_SECRET ?? "";

const zitadel = Zitadel({
  clientId: ZITADEL_CLIENT_ID,
  clientSecret: ZITADEL_CLIENT_SECRET,
  issuer: ZITADEL_ISSUER,
  // Convex Auth exchanges the code server-side. Zitadel's Web application
  // type therefore needs its client secret configured on the deployment;
  // the User Agent type (no secret) is not supported by this token exchange.
  client: { token_endpoint_auth_method: "client_secret_basic" },
  checks: ["pkce", "state", "nonce"],
  authorization: { params: { scope: "openid profile email" } },
  // Linking is still allowed only because profile() supplies an explicit,
  // verified email; this flag remains off so an unverified/absent claim can
  // never trigger the library's dangerous fallback linking.
  allowDangerousEmailAccountLinking: false,
  profile(profile) {
    if (!profile.sub) throw new Error("ZITADEL profile is missing sub");
    return {
      id: profile.sub,
      name: profile.name ?? profile.preferred_username ?? profile.email,
      email: profile.email,
      image: profile.picture,
      // This is what lets the default Convex Auth linking path find an
      // existing staff record. The after-create guard below still rejects the
      // link if that record is not in the staff realm.
      emailVerified: profile.email_verified === true,
    };
  },
});

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
    zitadel,
  ],
  callbacks: {
    async afterUserCreatedOrUpdated(_ctx, { existingUserId, provider, profile, type }) {
      if (provider.id !== "zitadel") return;

      // A ZITADEL user is never auto-provisioned. The account must already
      // exist as an internal Lasha staff account, and the verified email in
      // ZITADEL must have linked to it before this callback runs.
      if (type !== "oauth") {
        throw new Error("ZITADEL sign-in must use the OAuth flow");
      }
      if (profile.emailVerified !== true) {
        throw new Error("ZITADEL email must be verified before staff sign-in");
      }
      if (existingUserId === null) {
        throw new Error("No provisioned Lasha staff account matches this ZITADEL identity");
      }

      const user = await _ctx.db.get(existingUserId);
      if (!user || !isStaffRole(user.role)) {
        throw new Error("This ZITADEL identity is not linked to an internal staff account");
      }
    },
  },
});
