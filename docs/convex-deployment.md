# Convex deployment target

## Active deployment

| | |
|---|---|
| Team | `lonwabo-matya` |
| Project | `cladogram` |
| Deployment | `incredible-warbler-335` |
| Backend URL | `https://incredible-warbler-335.convex.cloud` |
| HTTP actions URL | `https://incredible-warbler-335.convex.site` |

The app's browser client is fixed to this deployment in
`src/lib/convex.ts`. That URL is intentionally independent of the injected
`VITE_CONVEX_URL`.

The old platform deployment, `keen-octopus-299`, is paused by a usage limit.
It must not be used again.

## Why the frontend URL alone was not enough

`src/lib/convex.ts` controls only the browser client. The Convex CLI chooses
its target separately, from `CONVEX_DEPLOY_KEY` / `CONVEX_DEPLOYMENT` in the
workspace environment. The workspace was still configured for
`keen-octopus-299`, so commands such as

```bash
bunx convex dev --once
```

kept pushing backend code to the paused deployment even though the app was
talking to `incredible-warbler-335`.

## Permanent fix: a deployment-scoped key

`CONVEX_DEPLOY_KEY` takes precedence over `CONVEX_DEPLOYMENT` and scopes
**every** `convex` command in the workspace to one deployment. The key must be
a **development deploy key created for `incredible-warbler-335`**. A key for
`keen-octopus-299`, or the `vly-dev-service-account` key, always resolves to
the old deployment even if `CONVEX_DEPLOYMENT` is set.

1. Open the **active deployment** in the Convex dashboard (`lonwabo-matya` →
   `cladogram` → `incredible-warbler-335`) → **Settings → Deploy keys**.
2. Create or copy a **Development** deploy key. Its prefix must contain
   `incredible-warbler-335`, not `keen-octopus-299` or
   `vly-dev-service-account`.
3. Open **Freebuff → Keys/API keys** and **replace** `CONVEX_DEPLOY_KEY` with
   that value. If `CONVEX_DEPLOY_KEY_LIVE` is used by the live app, replace it
   with the same active value too. Do not leave the old key in either place.
4. **Reload or restart the project workspace.** The key is loaded when the
   workspace starts; saving it in the Keys tab does not update the
   already-running Convex process.
5. Verify with `bunx convex dev --once` before trusting the target. The output
   must name `incredible-warbler-335` and must not contain `keen-octopus-299`
   or `freebuff:e8a7572b-81bd-4f6c-9314-69e1c9fa3473`.

Do not commit the value or put it in a source file. If it is ever exposed,
delete it in the Convex dashboard and update both variables.

## Verify the target

With the key in scope, run:

```bash
bunx convex dev --once
```

The output must name the active deployment. It should say something like:

```text
Developing against deployment:
[Development] lonwabo-matya:cladogram/incredible-warbler-335
```

It must **not** contain `keen-octopus-299` or
`freebuff:e8a7572b-81bd-4f6c-9314-69e1c9fa3473`.

Then verify the HTTP routes on the active deployment:

```bash
curl -fsS https://incredible-warbler-335.convex.site/.well-known/openid-configuration
```

The issuer in this response must be
`https://incredible-warbler-335.convex.site`. This is the deployment's **own
Convex Auth issuer**, used for its self-issued session JWTs. It is **not** the
Zitadel issuer, so never use this URL for `ZITADEL_ISSUER`.

For staff SSO, verify Zitadel's discovery document separately:

```bash
curl -fsS https://lasha-staff-xjjjze.eu1.zitadel.cloud/.well-known/openid-configuration
```

That response's issuer must be
`https://lasha-staff-xjjjze.eu1.zitadel.cloud`; this is the value for
`ZITADEL_ISSUER`.

Finally, the OIDC callback route must exist:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://incredible-warbler-335.convex.site/api/auth/callback/zitadel
```

A `404` means the backend code has not been deployed to the active deployment
yet. A redirect or validation error (not `404`) means the route exists; it does
not by itself prove the Zitadel client ID or secret is valid. Complete a
`/staff-login` flow to verify the full exchange.

## Do not do this

- Do not set `CONVEX_DEPLOYMENT` to a bare cross-team deployment name; it is
  resolved against the old Freebuff project. Use the deployment key for a
  separate project.
- Do not add `CONVEX_DEPLOY_KEY` to a committed `.env` file or to client-side
  code.
- Do not remove the hardcoded backend in `src/lib/convex.ts` until the platform
  injects the active URL. The injected value still points at the paused
  deployment.
