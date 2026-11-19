# Technical Architecture

Status: Current
Owner: Platform lead
Last updated: 2026-11-15

## Monorepo Shape

| Path                | Owner             | Purpose                                                                                                |
| ------------------- | ----------------- | ------------------------------------------------------------------------------------------------------ |
| `apps/`             | Surface leads     | User-facing surfaces. One folder per shippable surface.                                                |
| `packages/`         | Platform          | Shared TypeScript contracts, providers, runtime, UI, compliance, and utilities.                        |
| `crates/`           | Rust platform     | Shared Rust protocol, LLM, agent core, MCP, app server, sandbox policy, worktree, and registry crates. |
| `services/`         | Backend/platform  | Deployable backend services: the signaling server and the upload scanner.                              |
| `apps/web/db/neon/` | Data/backend      | Canonical Neon database migrations.                                                                    |
| `docs/`             | Docs/platform     | Current docs, decisions, specs, runbooks, compliance, research, and generated indexes.                 |
| `audit/`            | Platform/security | Evidence ledgers, scan output, parity research, and source-backed claims.                              |
| `patches/`          | Platform          | pnpm dependency patches with upstream/version-specific rationale.                                      |

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
  skills may keep their payload on the device that produced it
  (`cloud-or-device`), so a missing payload is not by itself a failure.

Account Cloud continuity includes Web, Mobile Cloud, Desktop Cloud and
provenance-eligible Chrome Managed Cloud conversations. Chrome remains locally
authoritative and excludes unknown, Local and BYOK turns from Cloud sync. Host
Developer continuity separately joins Desktop Code, CLI and VS Code around the
local workspace/runtime identity. The two domains share account entitlement
but not conversation authority, secrets or storage; movement between them is an
explicit handoff rather than background sync.

## Provider Strategy

OpenAI, Anthropic, and other provider SDKs are adapter dependencies, not AGI architecture. AGI owns:

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
and its chat is managed-cloud-only for inference while its local coding
sessions run the CLI. The Tauri details below are
implementation inventory, not public release evidence. Web and Mobile should
request, track, preview, download, and share generated files. Mobile should not
be the first heavy local PDF/PPTX/DOCX compute surface. Generated-file status,
source, checksum, action availability, and Local/BYOK/Managed labels are derived
from shared contracts instead of surface-local copy.

Retained Tauri document generation has manifest-producing command paths for PDF, DOCX, XLSX, and PPTX. These return the legacy file path plus `ComputeSession`, `GeneratedFile`, and `ArtifactManifest` metadata with local privacy, checksum, byte count, MIME type, and file URI. Each generated-document session also creates a local app-data work directory with `manifest.json`, append-only `audit.jsonl`, and compute-session TTL metadata.

Provider-hosted generated files use the same manifest contract after provider-specific file citations are materialized. The managed chat route collects OpenAI Code Interpreter `container_file_citation` and Anthropic `code_execution_output` file references, fetches the bytes from the provider, and stores them as generated files with checksum and byte count (`apps/web/lib/server/container-files.ts`).

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

Public Electron connector customization uses the hosted account-scoped connector service and its web settings UI. Local MCP servers run through the bundled `agi` app-server and are managed on the Developer settings page; the device profile reports `localMcp: true` when that CLI serves MCP. Retained Tauri `ConnectorGallery` remains internal.

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

## Chat File Uploads

A chat file of 25 MiB or less (`maxBytes` in
`packages/contracts/cloud-contracts/src/chat-attachment-policy.json`) goes
inline into the turn, as every compiled client expects. A larger file, up to
`largeFiles.maxBytes` (500 MiB), takes a separate path built for the web and
the shared upload client. On 2026-11-15 `CHAT_LARGE_FILES_ENABLED` is unset
everywhere, migration 0422 is unapplied (`appliedThrough` 421) and no scanner
speaks protocol 2, so no client is offered a large file. The phone keeps 25 MiB in mobile 0.0.1.

**Who is offered it.** `readChatLargeFileReadiness`
(`apps/web/lib/server/chat-file-intake/readiness.ts`) answers ready only when
each check passes, in order: `CHAT_LARGE_FILES_ENABLED` is `on` (an
environment variable, not a row in the rollout flag store); the plan's
`maxChatFileBytes` is above the inline limit; the caller can send parts
straight to storage (`storageReachableForLargeFiles` in
`apps/web/lib/server/upload-transport.ts`); 0422 is present; and the scanner
answers `/v2/capability` with protocol 2, cached for 60 s per instance and in
the shared key-value store. With the flag unset it makes no query and no
fetch. `/api/me` publishes the larger limits only to a client that sends
`large-chat-files-v1` in `x-agi-client-capabilities`; the web sends it from
`apps/web/shared/services/me-request.ts`.

**The intake.** One row per large file in `chat_file_intakes`, moved through
`awaiting_parts`, `uploaded`, `inspecting`, `scanning`, `sealing` and
`sealed` (or `rejected`, `failed`, `cancelled`) by compare-and-set
transitions with leases (`apps/web/lib/server/chat-file-intake/`):

1. The client hashes the file with an incremental SHA-256, then creates it
   (`POST /api/files/uploads`, kind `chat-large-file`). Create charges the
   daily large-file byte budget, then runs one transaction under a per-user
   advisory lock: it inserts the row, then checks the in-flight count against
   the plan's `maxConcurrentChatFileIntakes` and the storage left. A refusal
   rolls back, aborts the multipart upload and refunds.
2. The client sends parts (8 MiB for a file above 100 MiB, otherwise 5 MiB)
   straight to private storage on presigned URLs; the server never relays a large file's part.
3. Complete answers `202` with the intake id, and a Vercel Workflow run
   inspects the first 256,000 bytes, asks the scanner to fetch and scan the
   object (`/v2/scans` in `services/upload-scanner`, within an hourly source
   byte budget), and seals: a conditional copy to the sealed key and a
   `media_assets` row inserted with `scanned_sha256` by
   `insertScannedChatFileMediaAsset`. The 0422 insert trigger refuses a chat
   file above 25 MiB whose `scanned_sha256` is missing or differs from its
   content hash, and the sandbox reads a large file's storage key only
   through `listScannedChatFileAssets` in
   `apps/web/lib/server/media-assets.ts`, which checks the same equality.
4. The client polls the intake until it is ready or refused. A cancel before
   the `202` ends the row `cancelled: client` and refunds the bytes not yet
   stored.

The cron `sweep-chat-file-intakes` runs every 5 minutes whenever 0422 is
present, with the flag on or off: it re-dispatches rows past their lease,
cancels uploads idle for 2 hours, fails rows with no progress for 24 hours,
purges their objects and deletes orphaned preparations.

**In a turn.** A sealed file is prepared once into text by kind
(`apps/web/lib/server/chat-file-preparation/`) and a keyword index. A turn
that holds one gets a card per file, excerpts within a per-turn ledger of file
tokens, and the `open_file` and `search_files` tools. Each provider call of
the turn, research calls included, is a step of that ledger, and the ledger
and the file tools survive an approval checkpoint. Code execution stages the
file into the sandbox from storage on demand, up to 1 GiB per sandbox. Hydration
decides inline or prepared from the stored `byte_size`, so a build that holds
this path reads a large file correctly even with the flag off.

**Downloads.** `GET /api/files/:id` answers `302` to a 300-second presigned
GET, typed `application/octet-stream`, only for the owner's sealed large chat
file and only for a browser navigation without `Sec-Purpose` or a request with
the capability token. Every other read above 30 MiB keeps the `413`, so a
client that reads a download whole into memory is never sent one.

**Rollback and degradation.** The first web deploy that holds this path is the
rollback floor: `scripts/release/rollback.mjs` refuses an older target once
`scripts/config/rollback-floor.json` names it (it holds `{"web": null}` until
then). Without 0422 every route and reader behaves as before it. With the
flag off no large create is admitted while sealed files keep the prepared
path. An older scanner without `/v2/capability` stops the web offering large
files within 60 s. Open gaps are rows in `audit/registers/known-flaws.md`.

## Stored Assistant Text

Provider citation markup is cleaned from stored assistant text when it is
read, not only when it streams. `withoutStoredCitationMarkup` in
`apps/web/lib/server/stored-assistant-text.ts`, over `stripCitationMarkup`
from `packages/ai/provider-protocol`, is applied by the conversation,
message, sync, search and share routes, the organisation shared-session
service and the resume floor in `assistant-turn-persistence.ts`. The share
route compares and publishes the cleaned text. A continuation rewrites the
stored row to its cleaned form when it is admitted, keeping the same
revision (`assistant-content-edits.ts`). The fence-edit route applies an edit
to the cleaned text, so a client whose copy of the block still holds markup
is refused as a changed block until it reopens the chat.

Tool call ids are unique within a turn. The tool loop reserves every id
already used in the turn's messages and gives a repeated id a fresh one, used
everywhere the call appears. A durable research run carries its own ids
across a hand-off in the checkpoint's optional `toolCallIds`; a checkpoint
without the field still parses, and the strict schema means a build older
than the field cannot resume one that has it.

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
