# Technical Architecture

Status: Current
Owner: Platform lead
Last updated: 2026-09-22

## Monorepo Shape

| Path                | Owner             | Purpose                                                                            |
| ------------------- | ----------------- | ---------------------------------------------------------------------------------- |
| `apps/`             | Surface leads     | User-facing surfaces. One folder per shippable surface.                            |
| `packages/`         | Platform          | Shared TypeScript contracts, providers, runtime, UI, compliance, and utilities.    |
| `crates/`           | Rust platform     | Shared Rust runtime, protocol, command registry, plugin, task, and sandbox crates. |
| `services/`         | Backend/platform  | Deployable backend services; currently the signaling server only.                  |
| `apps/web/db/neon/` | Data/backend      | Canonical Neon database migrations.                                                |
| `docs/`             | Docs/platform     | Current docs, decisions, plans, support/legal/marketing docs, and archive.         |
| `audit/`            | Platform/security | Evidence ledgers, scan output, parity research, and source-backed claims.          |
| `patches/`          | Platform          | pnpm dependency patches with upstream/version-specific rationale.                  |

## Surface Feature Roots

- Web product features live under `apps/web/features`.
- Mobile product features live under `apps/mobile/src/features`.
- Public Desktop host features live under `apps/desktop/electron`; its hosted
  product UI lives under `apps/web`. `apps/desktop/src/features` belongs to the
  retained Tauri implementation and is not a second public Desktop surface.
- CLI is Rust-module based under `apps/cli/src`; reusable runtime moves to `crates/` only when a second consumer needs it.

`pnpm check:structure-conventions` enforces the Web feature-root decision and protects completed Mobile feature moves from regressing.

## Shared Contracts

- Cross-surface schemas and product contracts belong in `packages/contracts/types`.
- Provider-specific behavior belongs behind `packages/ai/providers` and AGI-owned adapters.
- App code must not import another app.
- Packages must not import from apps.
- Services must not import UI packages.
- Root `apps/web/db/neon` is canonical for database schema changes. Apply it
  only through `pnpm db:migrate`; Docker init mounts and one-off migration
  appliers are not schema authorities.
- Root `patches/` is reserved for pnpm dependency patches; remove entries when upstream/dependency changes make them unnecessary.

## Cross-Surface Data Ownership

| Data class                | Source of truth                                                                                                  | Surfaces allowed to write                                              | Surfaces allowed to read                                        | Sync rule                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Projects                  | `packages/contracts/types` contract plus Web/Desktop/Mobile persistence adapters                                 | Web, Desktop, Mobile                                                   | Web, Desktop, Mobile                                            | Synced app data. CLI/VS Code/Chrome may hand off selected project context only.                              |
| App chat conversations    | Shared Cloud conversation contract plus Web/Desktop/Mobile adapters and Chrome's provenance-gated replica writer | Web, Desktop, Mobile, eligible Chrome Managed Cloud chats              | Web, Desktop, Mobile; Chrome keeps its local authoritative copy | Normal Cloud chat sync boundary; unknown/Local/BYOK Chrome turns never enter it.                             |
| Developer sessions        | Host-owned developer runtime and shared developer-session contract                                               | Desktop Code, CLI, VS Code                                             | Desktop Code, CLI, VS Code                                      | Same session identity within the host domain; never merged into app chats without an explicit handoff draft. |
| Artifacts/generated files | `ComputeSession`, `GeneratedFile`, and `ArtifactManifest` in `packages/contracts/types`                          | Desktop first, Web managed compute later, Mobile as requester/receiver | Web, Desktop, Mobile                                            | Must carry privacy mode, owner session, checksum, TTL/retention, and source compute metadata.                |
| Memory                    | Local/BYOK/Managed memory stores keyed by privacy mode                                                           | Surface that collected consent                                         | Only surfaces within the same trust boundary                    | Local memory cannot be promoted to BYOK/Managed without preview and approval.                                |
| Teams/orgs                | Enterprise control-plane tables and `packages/contracts/types/src/enterprise`                                    | Web admin routes                                                       | Web admin; other surfaces through scoped policy reads           | Managed/enterprise only; never required for Local/BYOK.                                                      |
| Billing/usage             | Enterprise control plane plus provider-cost ledger                                                               | Backend services only                                                  | Web/admin and usage-label surfaces                              | No client invents quota, reset, or credit values.                                                            |

## Cross-Device Sync Semantics

`packages/contracts/types/src/sync/object-semantics.ts` is canonical: it names
every synced object type with its conflict rule, deletion mode, and whether the
cloud holds its bytes. This section is a reading of that file, not a second
source. `packages/client/sync/src` implements the client half.

Three rules the registry encodes and every surface has to honour:

- Deletion is a tombstone, never a dropped row. A client that forgets a
  deletion re-creates the row on its next push and undoes it. `deletedAt` is
  the one spelling; `isDeleted` on memory is kept beside it, not instead of it.
- A consent control is not content. Memory controls resolve a conflict to the
  more restrictive side, because losing "memory off" to a stale device collects
  what the user refused.
- A synced row does not promise the bytes are in the cloud. Artifacts and
  skills may keep their payload on the device that produced it, so a surface
  asks `resourceAvailability` and can say which device holds it rather than
  showing a failure.

Account Cloud continuity includes Web, Mobile Cloud, Desktop Cloud and
provenance-eligible Chrome Managed Cloud conversations. Chrome remains locally
authoritative and excludes unknown, Local and BYOK turns from Cloud sync. Host
Developer continuity separately joins Desktop Code, CLI and VS Code around the
local workspace/runtime identity. The two domains share account entitlement
but not conversation authority, secrets or storage; movement between them is an
explicit handoff rather than background sync.

### Session continuation

`packages/contracts/types/src/sync/session-continuation.ts` answers three
separate questions per workflow: locally persisted (opens with no network),
rehydratable (rebuildable on a device that has never seen it), resumable
(carries on rather than starting again). A workflow that answers no to any of
them carries the line a surface must show instead of offering to continue.

| Workflow | Locally persisted | Rehydratable | Resumable |
| -------- | ----------------- | ------------ | --------- |
| Chat     | yes               | yes          | yes       |
| Agent    | no                | yes          | yes       |
| Work     | no                | yes          | yes       |
| Research | no                | yes          | no        |
| Code     | no                | yes          | yes       |
| Browser  | no                | yes          | no        |
| Schedule | no                | yes          | no        |
| Study    | no                | yes          | no        |

Code is the one with a lease: resuming claims the session, so
`readCloudCodeSessionContinuation` reports whether it can be claimed now and,
when it cannot, until when another run holds it.

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

The retained Tauri implementation contains the repository's first local
heavy-compute paths, but D-2026-09-15-04 makes Electron the sole public Desktop
and that shell is managed-cloud-only for inference. The Tauri details below are
implementation inventory, not public release evidence. Web and Mobile should
request, track, preview, download, and share generated files. Mobile should not
be the first heavy local PDF/PPTX/DOCX compute surface. Generated-file status,
source, checksum, action availability, and Local/BYOK/Managed labels are derived
from shared contracts instead of surface-local copy.

Retained Tauri document generation has manifest-producing command paths for PDF, DOCX, XLSX, and PPTX. These return the legacy file path plus `ComputeSession`, `GeneratedFile`, and `ArtifactManifest` metadata with local privacy, checksum, byte count, MIME type, and file URI. Each generated-document session also creates a local app-data work directory with `manifest.json`, append-only `audit.jsonl`, and compute-session TTL metadata.

Provider-hosted generated files use the same manifest contract after provider-specific file citations are materialized. The OpenAI provider adapter extracts Code Interpreter `container_file_citation` annotations but does not create `GeneratedFile` records until the caller supplies URI, byte count, checksum, privacy mode, provider mode, storage scope, owner, and source context.

Generated-file trust-boundary validation lives in `@agiworkforce/types`. It proves Local files remain on local-device storage, BYOK transfer requires preview and explicit approval evidence, and Managed files carry quota, owner, checksum, retention, TTL, and deletion metadata before surfaces present them as available.

The active Web chat route mounts the artifact workbench sidecar next to the conversation. Assistant messages show compact artifact cards; detected code artifacts and generated-file manifests sync into the sidecar store for inspection instead of rendering duplicate full previews inline.

The active Web chat route projects runtime-validated, monotonically sequenced `x_agent_event` envelopes into one durable activity state per assistant turn. Public Electron Desktop loads that same hosted Managed Cloud surface, including the shared inline activity spine, structured tool details, approvals, sources, artifacts, context compaction, cancellation, and failures without provider scratchpads. Retained Tauri and other non-canonical emitters keep their older fallback timeline until they are migrated or removed.

Web and public Electron UI direction uses focused overlays for common settings, connector, plugin, search, project-edit, and file-preview flows before escalating users into full-screen workspaces. Full-screen/split-pane surfaces are for deep artifact viewing, code dashboards, project indexes, and long-running research or agent traces.

Public Electron Desktop uses the hosted web settings surface. Shell-owned settings such as launch-at-login and shortcuts cross the origin-gated preload contract; account, privacy, billing, connector, and workspace settings remain owned by the web application.

Public Electron file previews use the hosted web dialog shell; approved device-file operations cross the Electron dispatcher and remain bounded to approved roots.

Public Electron chat artifact cards use the same hosted artifact workbench as Web. The retained Tauri `ChatStream` and artifact store are internal compatibility paths, not the public persistence owner.

Multi-artifact responses in Web and public Electron expose the shared card-stack and download behavior owned by the hosted surface.

The hosted artifact workbench used by Web and public Electron keeps artifact selection scoped to the side panel and exposes preview/source switching plus primary actions in the viewer toolbar.

Retained Tauri Local and legacy non-canonical tool activity uses the compact event-rail direction as a fallback. `ToolTimeline` keeps the existing live tool-event store and expand/collapse behavior, but presents completed runs as short action summaries and expanded runs as icon-specific steps with result/error pills instead of large generic cards; public Electron Desktop uses the canonical managed-cloud activity spine above.

Hosted inline search results used by Web and public Electron follow the same compact trace pattern and keep citations attached to assistant responses.

Public Electron connector customization uses the hosted account-scoped connector service and its web settings UI. It reports `localMcp: false`; retained Tauri `ConnectorGallery` and local MCP configuration remain internal and do not authorize public Desktop local-MCP claims.

Public Electron project editing uses the hosted Web project and settings owners, so project state stays on the shared account contract rather than a private Desktop copy.

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

- shared types in `packages/contracts/types/src/enterprise`,
- canonical database tables in root `apps/web/db/neon`,
- enterprise routes in `apps/web`,
- Web admin readiness route,
- docs under `docs/compliance`.

Enterprise managed compute remains gated on metering, fraud, refund, chargeback, provider terms, and audit/export controls.

## Rollout Feature Flags

One flag store and one evaluator serve every surface:

- `feature_flag_definitions` (0211) holds the definition: variants, an ordered
  rule list targeting user, workspace, role, plan, region, country, surface,
  client version and a stable percentage bucket, a kill switch, an expiry and a
  version.
- `feature_flags` (0016, extended by 0211) holds per-user and per-workspace
  overrides, which outrank the rules and lose only to the kill switch.
- `apps/web/lib/feature-flags` evaluates them; `/api/me` returns the evaluated
  flags in `feature_flags` beside the computed keys, with the variant of each in
  `feature_flag_variants`, and the `routing.` namespace stays server-side.
- `/api/admin/feature-flags` and the operator console's flags tab are the only
  write path, and every change is an audit event.

Flags are rollout, not policy: what a workspace is allowed to do stays in the
workspace policy layers, and a flag only decides who has received a change yet.

## Verification

Use `docs/agent-context/commands.json` for canonical commands. Structural/doc changes must run:

```bash
pnpm check:llm-operability
git diff --check
```
