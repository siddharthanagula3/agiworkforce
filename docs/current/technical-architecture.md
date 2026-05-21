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

## Cross-Surface Data Ownership

| Data class                | Source of truth                                                               | Surfaces allowed to write                                              | Surfaces allowed to read                                          | Sync rule                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Projects                  | `packages/types` contract plus Web/Desktop/Mobile persistence adapters        | Web, Desktop, Mobile                                                   | Web, Desktop, Mobile                                              | Synced app data. CLI/VS Code/Chrome may hand off selected project context only.               |
| App chat conversations    | Web/Desktop/Mobile conversation stores using shared sync contracts            | Web, Desktop, Mobile                                                   | Web, Desktop, Mobile                                              | Normal chat sync boundary.                                                                    |
| Developer sessions        | CLI session store and future developer-session contract                       | CLI, VS Code, Chrome                                                   | Owning developer surface                                          | Not synced to app chats unless the user creates a handoff draft.                              |
| Artifacts/generated files | `ComputeSession`, `GeneratedFile`, and `ArtifactManifest` in `packages/types` | Desktop first, Web managed compute later, Mobile as requester/receiver | Web, Desktop, Mobile                                              | Must carry privacy mode, owner session, checksum, TTL/retention, and source compute metadata. |
| Memory                    | Local/BYOK/Managed memory stores keyed by privacy mode                        | Surface that collected consent                                         | Only surfaces within the same trust boundary                      | Local memory cannot be promoted to BYOK/Managed without preview and approval.                 |
| Teams/orgs                | Enterprise control-plane tables and `packages/types/src/enterprise`           | Web admin/API gateway                                                  | Web admin/API gateway; other surfaces through scoped policy reads | Managed/enterprise only; never required for Local/BYOK.                                       |
| Billing/usage             | API gateway/enterprise control plane plus provider-cost ledger                | Backend services only                                                  | Web/admin and usage-label surfaces                                | No client invents quota, reset, or credit values.                                             |

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

Local -> BYOK handoffs are preview-only transfers. A confirmed fork persists the accepted redacted payload, preview hash, redaction report, and selected-context metadata; it does not clone the original Local messages into the BYOK conversation.

## Generated Files And Compute

Desktop is the first local heavy-compute surface. Web and Mobile should request, track, preview, download, and share generated files. Mobile should not be the first heavy local PDF/PPTX/DOCX compute surface. Generated-file status, source, checksum, action availability, and Local/BYOK/Managed labels are derived from the shared `ComputeSession`, `GeneratedFile`, and `ArtifactManifest` presentation helpers instead of surface-local copy.

Desktop document generation now has manifest-producing command paths for PDF, DOCX, XLSX, and PPTX. These return the legacy file path plus `ComputeSession`, `GeneratedFile`, and `ArtifactManifest` metadata with local privacy, checksum, byte count, MIME type, and file URI. Each generated-document session also creates a local app-data work directory with `manifest.json`, append-only `audit.jsonl`, and compute-session TTL metadata.

Provider-hosted generated files use the same manifest contract after provider-specific file citations are materialized. The OpenAI provider adapter extracts Code Interpreter `container_file_citation` annotations but does not create `GeneratedFile` records until the caller supplies URI, byte count, checksum, privacy mode, provider mode, storage scope, owner, and source context.

Generated-file trust-boundary validation lives in `@agiworkforce/types`. It proves Local files remain on local-device storage, BYOK transfer requires preview and explicit approval evidence, and Managed files carry quota, owner, checksum, retention, TTL, and deletion metadata before surfaces present them as available.

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
