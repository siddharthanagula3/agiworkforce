# Web container portability drill

Status: Current
Owner: Platform lead
Last updated: 2026-09-05

The web app is deployed on Vercel. This drill proves it also boots and serves
outside it, in a plain OCI container with no platform services at all, so that
"we could move" is a measured claim rather than an assumption. It runs weekly in
`.github/workflows/web-container-drill.yml`, on demand, and on any pull request
that touches the container path.

Nothing here changes the hosted build. Standalone output, the bot-protection
provider and the extra file trace are all opt-in, and with none of them set
`next build` produces exactly what it produced before.

## What the drill replaces

| Platform service       | Substitute in the drill                   |
| ---------------------- | ----------------------------------------- |
| Managed Postgres       | a `postgres:17-alpine` service container  |
| Managed key-value      | `AGI_KV_PROVIDER=memory`                  |
| Managed object storage | `AGI_STORAGE_PROVIDER=memory`             |
| Bot protection         | `AGI_BOT_PROTECTION=off`                  |
| Durable workflow world | the local world, in the app's own process |
| Platform env backend   | the neutral `AGI_*` names below           |

## Hosting facts are read through one module

`apps/web/lib/server/hosting.ts` is the only place the app asks where it is
running. Each fact resolves from a neutral name first and falls back to the
platform's own name, so nothing has to be edited to move:

| Fact                   | Neutral name        | Platform fallback                          |
| ---------------------- | ------------------- | ------------------------------------------ |
| commit served          | `AGI_RELEASE_SHA`   | `VERCEL_GIT_COMMIT_SHA`, then `GITHUB_SHA` |
| deployment environment | `AGI_DEPLOY_ENV`    | `VERCEL_ENV`                               |
| region                 | `AGI_DEPLOY_REGION` | `VERCEL_REGION`                            |
| deployment id          | `AGI_DEPLOYMENT_ID` | `VERCEL_DEPLOYMENT_ID`                     |

`AGI_DEPLOY_ENV` is the one with teeth. It decides whether production-only
invariants arm, most visibly the rate limiter's refusal to serve a production
process without a shared Redis. A single-instance container names itself
`preview` here instead of borrowing a platform variable it is not running under.

The app origin is already vendor-neutral: every call site reads
`NEXT_PUBLIC_APP_URL`, so there is nothing to route and no second name for it.

## Bot protection

`AGI_BOT_PROTECTION` selects the provider, `platform` or `off`. Unset, it
resolves to `platform` wherever the hosting platform's own variables are present
and to `off` everywhere else, so an image built for a container never calls a
bot-protection service that only exists on the platform.

The browser half cannot detect its host, so it reads
`NEXT_PUBLIC_AGI_BOT_PROTECTION`, inlined at build time, and the server accepts
that name as a fallback. Setting only the public name therefore configures both
halves consistently. When the mode is off, `next.config.ts` does not wrap the
config with the platform plugin, the client never initialises the classifier,
and the server-side check returns a passing verdict without calling it.

`AGI_BOT_CHALLENGE_ENFORCED` is a separate axis and still means what it meant:
whether a request classified as a bot is rejected rather than only measured. It
now requires a provider, so enforcement with bot protection off is off.

## Durable workflows

The workflow SDK picks its world from `WORKFLOW_TARGET_WORLD`, defaulting to the
platform world when a platform deployment id is present and to `local`
otherwise. The image sets `WORKFLOW_TARGET_WORLD=local` explicitly rather than
relying on that default.

The local world needs no sidecar. Its queue delivers by posting back to the
app's own HTTP listener, resolving the base URL from `PORT`, which the image
sets, and it persists to `WORKFLOW_LOCAL_DATA_DIR`, a directory the image
creates and hands to the non-root user. `WORKFLOW_NODE_HTTP=1` moves those
requests onto Node's core HTTP client, which is what the app's own undici
version requires.

## The image

`apps/web/Dockerfile` builds from the repository root, not from `apps/web`:

```bash
DOCKER_BUILDKIT=1 docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_APP_URL=http://127.0.0.1:3000 \
  --build-arg NEXT_PUBLIC_AGI_BOT_PROTECTION=off \
  -t agiworkforce-web .
```

The root `.dockerignore` keeps `.git`, `node_modules` and every `.env` out of
the context.

Two stages. The builder runs on the full Node image, because the workspace
install compiles native modules, installs the whole workspace with a frozen
lockfile, and builds with `AGI_WEB_STANDALONE=1`. The runner is the slim image
and carries only the standalone output, the static assets and `public`, owned by
the unprivileged `node` user, with a `HEALTHCHECK` that polls `/api/health`.

`AGI_WEB_STANDALONE=1` also adds `pg` to the traced files, because a container
run uses the Postgres adapter rather than the serverless driver the platform
uses, and the adapter reaches it through a dynamic import.

## What the drill asserts

1. `/api/health` answers 200. Stripe is absent, so the payload is `degraded`,
   which is a 200; the database and environment probes must both pass.
2. `/` answers 200 for a signed-out visitor.
3. `/settings` answers 307 to `/login`.
4. `POST /api/llm/v1/chat/completions` with no credentials answers 401, which is
   the app's own gate rather than a platform error page.
5. `/api/version` reports the deployment environment the neutral name asked for.

Clerk is configured with the same public, non-routable `clerk-ci.invalid`
live-format fixture the packaging and accessibility jobs use. A `pk_test_` key
names a development instance, which answers any page calling `auth()` with a
handshake redirect to a host that does not resolve.

## When it fails

The workflow prints the container logs on every outcome. Read those first: a
container that exits during boot is almost always environment validation or the
rate limiter's Redis requirement, both of which name themselves in the log. A
container that boots but fails the health assertion is usually the database
probe, which means either the connection string or the Postgres adapter's
dynamic import of `pg`.
