# apps/web/src — Normalized Layer Architecture

This directory is the target state for the Phase 5 structural normalization of `apps/web`.

## Layer Map

```
apps/web/
├── app/                       # Next.js router entrypoints — UNCHANGED (router contract sacred)
│   └── ...routes...           # Each route delegates to src/entry/ for non-trivial logic
├── src/
│   ├── entry/                 # bootstrap, layout wrappers, route shells
│   ├── core/                  # state orchestration, shared flows
│   ├── features/              # chat, models, sync, auth, billing, artifacts, marketing, settings
│   ├── platform/              # next-specific hooks, server actions, RSC adapters
│   ├── integrations/          # supabase, stripe, providers, mcp, vercel, posthog, sentry
│   ├── data/                  # zod schemas, RLS clients, query helpers
│   └── ui/                    # reusable client+server primitives
└── (existing components/, lib/, hooks/ retained as legacy + aliased)
```

## Dependency Rules (innermost to outermost)

```
data → (no deps in src/)
ui → data
platform → data, ui
integrations → data
core → platform, integrations, data, ui
features → core, platform, integrations, data, ui
entry → features, core, platform, integrations, data, ui
app/ (Next.js) → entry (for non-trivial delegates)
```

## Migration Status

| Layer                     | Status        | Notes                                        |
| ------------------------- | ------------- | -------------------------------------------- |
| `src/entry/`              | Skeleton only | Pending                                      |
| `src/core/`               | Skeleton only | Pending (source: core/)                      |
| `src/features/analytics/` | MIGRATED      | Pilot feature, 2026-05-18                    |
| `src/features/*`          | Skeleton only | Pending (source: features/)                  |
| `src/platform/`           | Skeleton only | Pending (source: hooks/, utils/)             |
| `src/integrations/`       | Skeleton only | Pending (source: lib/, services/)            |
| `src/data/`               | Skeleton only | Pending (source: types/, lib/validations/)   |
| `src/ui/`                 | Skeleton only | Pending (source: components/ui/, shared/ui/) |

## Invariants

1. `app/` paths are NEVER changed. Route contract is sacred.
2. All file moves include a barrel re-export at the OLD path to preserve public API.
3. Every step runs typecheck + lint + build before committing.
4. Phase 5 is pure structural normalization. Zero behavior change.
