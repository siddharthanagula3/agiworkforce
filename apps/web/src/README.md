# apps/web/src - Layer Primitives

This directory is reserved for Web layer primitives. Product-domain code belongs in
`apps/web/features`, which is the canonical Web feature root.

## Layer Map

```
apps/web/
├── app/                       # Next.js router entrypoints — UNCHANGED (router contract sacred)
│   └── ...routes...           # Each route delegates to features/ or src/entry/ as needed
├── features/                  # product-domain code: chat, billing, admin, analytics, etc.
├── src/
│   ├── entry/                 # bootstrap, layout wrappers, route shells
│   ├── core/                  # state orchestration, shared flows
│   ├── platform/              # next-specific hooks, server actions, RSC adapters
│   ├── integrations/          # supabase, stripe, providers, mcp, vercel, posthog, sentry
│   ├── data/                  # zod schemas, RLS clients, query helpers
│   └── ui/                    # reusable client+server primitives
└── (components/, lib/, hooks/ retained only where a documented boundary needs them)
```

## Dependency Rules (innermost to outermost)

```
data → (no deps in src/)
ui → data
platform → data, ui
integrations → data
core → platform, integrations, data, ui
entry → features, core, platform, integrations, data, ui
app/ (Next.js) → entry (for non-trivial delegates)
```

## Migration Status

| Layer               | Status        | Notes                                        |
| ------------------- | ------------- | -------------------------------------------- |
| `src/entry/`        | Skeleton only | Pending                                      |
| `src/core/`         | Skeleton only | Pending (source: core/)                      |
| `src/platform/`     | Skeleton only | Pending (source: hooks/, utils/)             |
| `src/integrations/` | Skeleton only | Pending (source: lib/, services/)            |
| `src/data/`         | Skeleton only | Pending (source: types/, lib/validations/)   |
| `src/ui/`           | Skeleton only | Pending (source: components/ui/, shared/ui/) |
| `src/features/`     | Forbidden     | Product domains live in `apps/web/features`. |

## Invariants

1. `app/` paths are NEVER changed. Route contract is sacred.
2. Product-domain code is created under `apps/web/features/<domain>/`.
3. `apps/web/src/features` must stay empty or absent.
4. Every structural step runs typecheck and the repo operability checks before merging.
