# apps/web/features

Status: Current
Owner role: Web lead
Last updated: 2026-05-21
Purpose: Canonical Web product-domain root for Next.js feature code.

## Rules

- New Web product features land in a top-level domain folder here.
- Do not recreate `apps/web/src/features`; structure checks forbid it.
- Shared framework code stays in `app/`, `components/`, `lib/`, or `shared/` as appropriate.
- Each top-level feature folder owns its public barrel and local README.
