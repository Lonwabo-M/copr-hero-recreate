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
**every** `convex` command in the workspace to one deployment. Once it is set
to a key for `incredible-warbler-335`, there is no fallback to
`keen-octopus-299`.

1. Open the active deployment's settings:

   <https://dashboard.convex.dev/t/lonwabo-matya/cladogram/incredible-warbler-335/settings>

2. In **Deploy keys**, generate a **dev deploy key**.
3. Give it a clear name, such as `lasha-workspace`.
4. Grant the permissions needed for normal development:
   - `deployment:deploy` (push code/schema)
   - read/write data and environment variables (optional, for seeding and
     checking settings)
5. Copy the key once. It looks like
   `dev:incredible-warbler-335|…` and is a secret.
6. Add it to **Freebuff → Keys/API keys** as `CONVEX_DEPLOY_KEY`. Do not
   commit it or paste it into a source file.

The key is a secret. If it is ever exposed, delete it in the Convex dashboard
and generate a replacement.

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

The issuer must be `https://incredible-warbler-335.convex.site`.

For staff SSO, the OIDC callback route must also exist:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://incredible-warbler-335.convex.site/api/auth/callback/zitadel
```

A `404` means the backend code has not been deployed to the active deployment
yet. A redirect or validation error (not `404`) means the route exists.

## Do not do this

- Do not set `CONVEX_DEPLOYMENT` to a bare cross-team deployment name; it is
  resolved against the old Freebuff project. Use the deployment key for a
  separate project.
- Do not add `CONVEX_DEPLOY_KEY` to a committed `.env` file or to client-side
  code.
- Do not remove the hardcoded backend in `src/lib/convex.ts` until the platform
  injects the active URL. The injected value still points at the paused
  deployment.
