# Technical Architecture

Status: Current
Owner: Platform lead
Last updated: 2026-05-21

## Monorepo Shape

| Path        | Owner             | Purpose                                                                            |
| ----------- | ----------------- | ---------------------------------------------------------------------------------- |
| `apps/`     | Surface leads     | User-facing surfaces. One folder per shippable surface.                            |
| `packages/` | Platform          | Shared TypeScript contracts, providers, runtime, UI, compliance, and utilities.    |
| `crates/`   | Rust platform     | Shared Rust runtime, protocol, command registry, plugin, task, and sandbox crates. |
| `services/` | Backend/platform  | Deployable services such as API gateway and signaling.                             |
| `supabase/` | Data/backend      | Canonical database migrations and Supabase config.                                 |
| `docs/`     | Docs/platform     | Current docs, decisions, plans, support/legal/marketing docs, and archive.         |
| `audit/`    | Platform/security | Evidence ledgers, scan output, parity research, and source-backed claims.          |

## Surface Feature Roots

- Web product features live under `apps/web/features`.
- Mobile product features live under `apps/mobile/src/features`.
- Desktop product features live under `apps/desktop/src/features`.
- CLI is Rust-module based under `apps/cli/src`; reusable runtime moves to `crates/` only when a second consumer needs it.

`pnpm check:structure-conventions` enforces the Web feature-root decision and protects completed Mobile feature moves from regressing.

## Shared Contracts

- Cross-surface schemas and product contracts belong in `packages/types`.
- Provider-specific behavior belongs behind `packages/providers` and AGI-owned adapters.
- App code must not import another app.
- Packages must not import from apps.
- Services must not import UI packages.
- Root `supabase/migrations` is canonical for database schema changes.

## Provider Strategy

OpenAI, Anthropic, Vercel AI SDK, and provider SDKs are adapter dependencies, not AGI architecture. AGI owns:

- runtime event schema,
- privacy modes,
- provider capability metadata,
- routing policy,
- tool contracts,
- usage accounting,
- artifact/generated-file manifests.

Vercel AI Gateway and other managed proxy paths are never default for Local or strict BYOK. They can only be used behind explicit Managed labeling and consent.

## Generated Files And Compute

Desktop is the first local heavy-compute surface. Web and Mobile should request, track, preview, download, and share generated files. Mobile should not be the first heavy local PDF/PPTX/DOCX compute surface.

Generated files need:

- owner session,
- privacy mode,
- source provider/compute session,
- manifest path,
- checksum,
- TTL/retention metadata,
- preview derivative,
- deletion behavior.

## Enterprise Control Plane

Enterprise readiness now spans:

- shared types in `packages/types/src/enterprise`,
- canonical database tables in root `supabase/migrations`,
- API gateway enterprise routes,
- Web admin readiness route,
- docs under `docs/enterprise`.

Enterprise managed compute remains gated on metering, fraud, refund, chargeback, provider terms, and audit/export controls.

## Verification

Use `docs/agent-context/commands.json` for canonical commands. Structural/doc changes must run:

```bash
pnpm check:llm-operability
git diff --check
```
