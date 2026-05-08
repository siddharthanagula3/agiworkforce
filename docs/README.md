# AGI Workforce — Documentation Index

The `docs/` directory is the canonical home for everything that doesn't belong in source comments or memory files. This index links to the load-bearing documents and explains how they relate.

> **Single source of truth at the repo root**: `AGI_WORKFORCE.md` (product spec), `CLAUDE.md` (engineering rules), `BUILD.md` (per-surface commands), `README.md` (user-facing). Read those before non-trivial changes.

## Architecture & scaling

| File                                   | What it covers                                                                                                                                     |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`ARCHITECTURE.md`](./ARCHITECTURE.md) | System map: 6 surfaces, shared packages, backend services, abstraction layers, cross-surface contracts.                                            |
| [`SCALING.md`](./SCALING.md)           | Migration playbooks: Supabase → Neon, Auth0/Clerk swap, S3/R2/B2 storage, Pusher/Ably realtime, connection pooling, read replicas.                 |
| [`HOSTING.md`](./HOSTING.md)           | Multi-cloud deployment: Vercel / Cloudflare / Netlify for web; Fly.io / Railway / Render for services; domain switching, edge vs origin functions. |
| [`PERFORMANCE.md`](./PERFORMANCE.md)   | Heavy-traffic patterns: pool sizing, caching layers, streaming backpressure, provider failover, cost-aware routing.                                |

The `packages/data-layer/` package is the seam that makes Supabase → Neon (or any other Postgres provider) a config change instead of a rewrite. The interfaces in `data-layer/src/types.ts` are the contract every cloud-portable feature consumes.

## Product & business

| File                         | What it covers                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [`PRICING.md`](./PRICING.md) | Locked tier matrix (Local/BYOK Free, Hobby $10, Pro $29.99 waitlist, Pro+ $49.99, Max $299.99).                         |
| [`ROADMAP.md`](./ROADMAP.md) | High-level product roadmap pointing at the per-phase plans.                                                             |
| [`DESIGN.md`](./DESIGN.md)   | Visual unity rules across the 6 surfaces (composer pill, model picker chevron-pill, brand mark, 3-color palette, etc.). |
| [`HANDOFF.md`](./HANDOFF.md) | Cross-team handoff protocol for releases.                                                                               |

## Per-domain references

| Folder                   | Purpose                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `api/`                   | API reference material.                                                                                               |
| `audit/`                 | Cross-surface audits — see `audit/AUDIT_2026-05-03.md`, `audit/AUDIT_REPORT_2026-05-01.md`, and `audit/FIX_QUEUE.md`. |
| `launch/`                | Launch runbooks for each tier (Hobby, Pro+, Max).                                                                     |
| `planning/` and `plans/` | Sprint-level plans and active workstreams.                                                                            |
| `security/`              | Security policies + threat models + audit trails.                                                                     |
| `superpowers/`           | Skill packs + extended capability references.                                                                         |
| `archive/`               | Historical / superseded material.                                                                                     |

## Quickstart for new contributors

1. Read `AGI_WORKFORCE.md` (product) and `CLAUDE.md` (rules).
2. Read [`ARCHITECTURE.md`](./ARCHITECTURE.md) (system).
3. Read the surface guide for whatever you're working on (`applications/<surface>.md`).
4. Run `scripts/verify-surfaces.sh fast` to confirm your environment is green before changes.
5. Commit conventions: lowercase, ≤100 chars, Conventional Commits, with `Co-Authored-By:` footer (commitlint enforces).

## Verification harness

`scripts/verify-surfaces.sh` runs the full 6-surface gate: typecheck + tests + builds where feasible. Modes:

```bash
scripts/verify-surfaces.sh           # all surfaces (slow — runs full builds)
scripts/verify-surfaces.sh fast      # typecheck + test only, skip builds
scripts/verify-surfaces.sh cli       # one surface
scripts/verify-surfaces.sh desktop   # one surface
scripts/verify-surfaces.sh web       # one surface
scripts/verify-surfaces.sh mobile    # one surface
scripts/verify-surfaces.sh chrome    # one surface
scripts/verify-surfaces.sh vscode    # one surface
```

Use this before merging any cross-surface change.

## How docs and memory differ

- **`docs/`** — durable, repo-checked, code-reviewed. Belongs here when it's a reference engineers need to read.
- **`~/.claude/projects/.../memory/`** — Claude's auto-memory. Personal session context, not for cross-team docs.
- **Source comments** — only when the WHY is non-obvious (constraint, invariant, workaround). See `CLAUDE.md` "Doing tasks" section.

If you find yourself adding the same context to multiple memory files or PR descriptions, promote it to `docs/`.
