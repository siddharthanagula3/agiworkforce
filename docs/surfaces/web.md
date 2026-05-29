# Web Surface

Status: Current
Owner: Founder/platform
Last updated: 2026-05-28

## Mission

The web app at `agiworkforce.com` hosts the public marketing site, pricing, cloud waitlist, account settings, synced cloud chat, projects, artifacts, billing, and provider gateway entry points.

Web is a managed cloud surface. It uses Clerk for identity and Neon for durable application data. Web does not offer BYOK chat in v1.

## Stack

| Layer            | Choice                 | Notes                                                          |
| ---------------- | ---------------------- | -------------------------------------------------------------- |
| Framework        | Next.js 16 app router  | Route boundary uses `proxy.ts`; do not create `middleware.ts`. |
| Hosting          | Vercel                 | Production deploys from `main`; previews deploy for PRs.       |
| Auth             | Clerk                  | Session and bearer-token verification.                         |
| Database         | Neon Postgres          | Canonical migrations live in `apps/web/db/neon/`.              |
| Payments         | Stripe                 | Web billing and customer portal.                               |
| Provider gateway | `services/api-gateway` | Managed cloud chat and shared cloud control plane.             |

## Trust Boundary

- Web cloud chat requires Clerk identity and a valid subscription or private-beta invite.
- Web settings persist to Neon where the setting affects cloud behavior.
- Local-only and BYOK-local state belong to Desktop local storage or Mobile local storage, not Web.
- Managed cloud, credits, cloud execution, and public cloud launches remain gated until metering, abuse, refunds, retention, deletion, and provider terms are proven.

## File Layout

```text
apps/web/
├── app/                    Next.js app router pages and API routes
├── app/api/                Web API endpoints
├── db/neon/                canonical Neon migrations
├── features/               product-domain feature code
├── components/             shared web UI
├── core/                   provider, billing, storage, and security internals
├── lib/                    route helpers and server/client utilities
├── public/                 static assets
└── proxy.ts                Next.js 16 request proxy boundary
```

## Key Files

| File                                                | Purpose                                                            |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/web/proxy.ts`                                 | Clerk-aware request boundary and route protection.                 |
| `apps/web/app/api/llm/v1/chat/completions/route.ts` | Cloud chat provider entry point.                                   |
| `apps/web/app/api/stripe-webhook/route.ts`          | Stripe webhook handler.                                            |
| `apps/web/app/api/waitlist/cloud-managed/route.ts`  | Cloud waitlist insert path.                                        |
| `apps/web/db/neon/`                                 | Canonical schema migrations for web and managed cloud data.        |
| `apps/web/features/chat/`                           | Active web chat UI.                                                |
| `apps/web/app/settings/`                            | Account, usage, privacy, memory, billing, and capability settings. |

## Commands

```bash
pnpm --filter @agiworkforce/web dev
pnpm --filter @agiworkforce/web typecheck
pnpm --filter @agiworkforce/web test
pnpm check:neon-migrations
pnpm lint
```

## Current Risks

- Settings must stay backed by Clerk and Neon, not local mock state, when the setting affects account, billing, privacy, usage, memory, or cloud capabilities.
- Chat has to stay on a single canonical `/chat` route. Historical `/chats` and query-flag variants should redirect or be retired as implementation work lands.
- Download and marketing claims must match actual release gates: public release is locked for July 12, 2026, but managed cloud access remains invite-only until the operational controls are proven.
- Provider model IDs must be read from `packages/types/src/models.json`; do not hardcode weekly model releases in Web code.

## References

- `docs/current/source-of-truth.md`
- `docs/current/technical-architecture.md`
- `docs/current/commercial-and-launch.md`
- `docs/agent-context/repo-map.json`
