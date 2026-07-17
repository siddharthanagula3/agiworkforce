# Technical Architecture

Status: Current
Owner: Platform lead
Last updated: 2026-07-17

## Monorepo Restructure (2026-07)

The 2026-07-08 full-repo audit confirmed the monorepo shape below and produced the consolidation plan that governs package/crate ownership going forward: `docs/plans/monorepo-restructure-2026-07-08.md` (maturity map, duplication findings, target tree, dependency graph, mode architecture, migration phases P0-P6). The Rust engine-extraction sub-plan is `docs/plans/rust-engine-extraction-2026-07-09.md`. External-brief adjudication lives in `docs/architecture/shared-packages-decision-log.md`. When this file and a plan disagree on target ownership, the plan wins until its phases land here.

### Execution status (2026-07-09)

- **P0 hygiene, P1 dead-code:** done (dead chat variants, marketing components, SPA build pipeline, dead crates removed; the 4 "dead" provider packages were kept — they are complete adapters, wired in P2).
- **P2 one TS ai-client — DONE.** The canonical provider layer is the single TS path for the gateway, every satellite surface, and the web v1 route. `packages/ai/provider-runtime` exports one `streamFromProvider` SSE client (replacing four near-duplicates); `packages/ai/providers` gained six OpenAI-compat adapters (groq, mistral, moonshot, zhipu, qwen, openrouter) and all eleven cloud adapters are wired into the api-gateway proxy; gateway `llm.ts` + `cloudChat.ts` run on them through `@agiworkforce/provider-protocol` `openai-wire-compat`. The `apps/web` v1 route (the public OpenAI-compatible contract) now dispatches all 12 providers — Anthropic, Google, OpenAI, and 9 openai-compat — through the adapters via a per-provider `ADAPTER_PROVIDERS` table with `wireMode`, byte-for-byte stable against the legacy wire (proven by per-provider golden byte-parity tests); the agentic tool-loop and `agents/execute` are on the same path; the 4,721-LOC `apps/web/lib/llm-providers` layer is DELETED (zero importers). The migration surfaced and fixed ~11 latent bugs (money-path 200-on-failure, Gemini finish_reason, byok pending-badge UI, OpenAI include_usage/logprobs fidelity). `ChatRequest.rawVendorTools` carries provider-native built-in tools; additive StreamChunk variants (server-tool, citation, response-meta) preserve wire fidelity. Only the desktop Rust `core/llm` engine remains (Wave 5 stage c2, live-gated).
- **P3 UI layering — DONE (mechanical):** web adopted `@agiworkforce/ui` (both the `components/ui` and `@shared/ui` private forks migrated — 25 primitives repointed+deleted, 16 dead leaf forks removed, barrel cleaned, ~99 importer files, full web suite 3733/3733); `unified-chat` consumes `ui` + `design-tokens` (forked primitives + parallel token layer removed); one shared markdown/tool-call renderer and BYOK handoff dialog; 18 shadcn primitives ported into `packages/ui/ui`. **Remaining = decision-gated residual only:** ~8 web-divergent primitives whose a11y/error features `packages/ui/ui` should gain before their forks migrate (Button `isLoading`, Input `hasError`, etc.), the `form.tsx` FormField collision, the legacy-toast-vs-sonner retirement, and the bespoke/aceternity + sidebar components (stay web-local or move to a `packages/ui/ui/marketing` subpath). A human visual-QA pass on the force-migrated canonical-look deltas is also queued.
- **P5 data seam:** web sync routes + auth store derive from the `cloud-contracts` Zod schemas (one wire truth); the api-gateway runs real Postgres RLS through `@agiworkforce/data-layer` for policied tables (gap tables stay on explicit `getServiceClient` with `RLS-GAP` markers — see `SVC-GATEWAY-RLS-NOOP-01`, plus a pre-deploy `app_rls` probe gate); `@agiworkforce/sync` at `packages/client/sync` owns the pure apply + bigint-cursor logic, consumed by mobile at runtime and pinned to desktop's Rust apply via cross-language golden fixtures. `@agiworkforce/artifacts` owns derivation, publish, cloud merge/apply, and the injected artifact store. `@agiworkforce/trust-boundaries` owns Managed Cloud host classification, `@agiworkforce/routing` owns model-switch cache consequences, and `@agiworkforce/search` owns registry-derived search harness availability. The old Services/Stores exports are re-export-only compatibility facades.
- **P4/Wave 5 Rust:** all SIX CLI-side stages done and merged — `crates/agiworkforce-sandbox-policy` rename (f); ts-rs codegen wired through the `@agiworkforce/types/protocol` subpath with non-mutating staged drift verification (b1); `agiworkforce-llm` provider crate + CLI facade, byte-identical JSONL (c1); desktop adopts `agiworkforce-execpolicy` via a 338-evaluation same-or-stricter parity corpus (a); `agiworkforce-mcp` client crate + CLI facade (d1); `agiworkforce-agent-core` turn-loop crate + CLI TurnHostAdapter (e1). The CLI/desktop Rust split-brain (which shared only the 121-LOC sandbox-policy crate) is dissolved on the CLI side; provider HTTP/SSE, MCP, exec-policy, and the turn loop are shared crates, each behavior-verified before the old CLI code was deleted. REMAINING (desktop-side adoption of those crates — c2/c3/c4 provider, d2 MCP, e2 turn loop — plus b2 Op-envelope TS derive): gated on live-provider + desktop-device verification the CI/dev environment cannot run; the shared crates are the frozen contracts the desktop adopts, staged as tracked PRs in `docs/plans/rust-engine-extraction-2026-07-09.md`.

## Monorepo Shape

| Path                | Owner             | Purpose                                                                            |
| ------------------- | ----------------- | ---------------------------------------------------------------------------------- |
| `apps/`             | Surface leads     | User-facing surfaces. One folder per shippable surface.                            |
| `packages/`         | Platform          | Shared TypeScript contracts, providers, runtime, UI, compliance, and utilities.    |
| `crates/`           | Rust platform     | Shared Rust runtime, protocol, command registry, plugin, task, and sandbox crates. |
| `services/`         | Backend/platform  | Deployable services such as API gateway and signaling.                             |
| `apps/web/db/neon/` | Data/backend      | Canonical Neon database migrations.                                                |
| `docs/`             | Docs/platform     | Current docs, decisions, plans, support/legal/marketing docs, and archive.         |
| `audit/`            | Platform/security | Evidence ledgers, scan output, parity research, and source-backed claims.          |
| `patches/`          | Platform          | pnpm dependency patches with upstream/version-specific rationale.                  |

## Surface Feature Roots

- Web product features live under `apps/web/features`.
- Mobile product features live under `apps/mobile/src/features`.
- Desktop product features live under `apps/desktop/src/features`.
- CLI is Rust-module based under `apps/cli/src`; reusable runtime moves to `crates/` only when a second consumer needs it.

`pnpm check:structure-conventions` enforces the Web feature-root decision and protects completed Mobile feature moves from regressing.

## Shared Contracts

- Cross-surface schemas and product contracts belong in `packages/contracts/types`.
- Provider-specific behavior belongs behind `packages/ai/providers` and AGI-owned adapters.
- App code must not import another app.
- Packages must not import from apps.
- Services must not import UI packages.
- Root `apps/web/db/neon` is canonical for database schema changes.
- Root `patches/` is reserved for pnpm dependency patches; remove entries when upstream/dependency changes make them unnecessary.

## Cross-Surface Data Ownership

| Data class                | Source of truth                                                                         | Surfaces allowed to write                                              | Surfaces allowed to read                                          | Sync rule                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Projects                  | `packages/contracts/types` contract plus Web/Desktop/Mobile persistence adapters        | Web, Desktop, Mobile                                                   | Web, Desktop, Mobile                                              | Synced app data. CLI/VS Code/Chrome may hand off selected project context only.               |
| App chat conversations    | Web/Desktop/Mobile conversation stores using shared sync contracts                      | Web, Desktop, Mobile                                                   | Web, Desktop, Mobile                                              | Normal chat sync boundary.                                                                    |
| Developer sessions        | CLI session store and future developer-session contract                                 | CLI, VS Code, Chrome                                                   | Owning developer surface                                          | Not synced to app chats unless the user creates a handoff draft.                              |
| Artifacts/generated files | `ComputeSession`, `GeneratedFile`, and `ArtifactManifest` in `packages/contracts/types` | Desktop first, Web managed compute later, Mobile as requester/receiver | Web, Desktop, Mobile                                              | Must carry privacy mode, owner session, checksum, TTL/retention, and source compute metadata. |
| Memory                    | Local/BYOK/Managed memory stores keyed by privacy mode                                  | Surface that collected consent                                         | Only surfaces within the same trust boundary                      | Local memory cannot be promoted to BYOK/Managed without preview and approval.                 |
| Teams/orgs                | Enterprise control-plane tables and `packages/contracts/types/src/enterprise`           | Web admin/API gateway                                                  | Web admin/API gateway; other surfaces through scoped policy reads | Managed/enterprise only; never required for Local/BYOK.                                       |
| Billing/usage             | API gateway/enterprise control plane plus provider-cost ledger                          | Backend services only                                                  | Web/admin and usage-label surfaces                                | No client invents quota, reset, or credit values.                                             |

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

The active Web chat route mounts the artifact workbench sidecar next to the conversation. Assistant messages show compact artifact cards; detected code artifacts and generated-file manifests sync into the sidecar store for inspection instead of rendering duplicate full previews inline.

The active Web chat route projects runtime-validated, monotonically sequenced `x_agent_event` envelopes into one durable activity state per assistant turn. The shared inline activity spine is collapsed by default, expands in bounded pages for long runs, exposes structured tool details and approvals, and carries sources, artifacts, context compaction, cancellation, and failure without exposing provider scratchpads. That projection is saved with the assistant message so reloaded conversations preserve the run; the older compact tool timeline remains only as a fallback while non-canonical emitters are migrated.

Desktop/Web UI direction uses the latest Claude desktop modal references as the default baseline: common settings, connector, plugin, search, project edit, and file-preview flows should open as focused overlays before escalating users into full-screen workspaces. Full-screen/split-pane surfaces are for deep artifact viewing, code dashboards, project indexes, and long-running research or agent traces.

The Desktop settings surface now implements the first pass of that baseline: settings stay in a focused centered modal, the left rail has search, and settings are grouped into primary account/preferences, customization, and desktop-app sections without changing save behavior.

Desktop file previews also use the shared focused dialog shell, keeping generated/local file inspection in a modal unless the user explicitly opens a deeper artifact workspace.

Desktop chat artifact cards now use the persistent artifact workbench as their primary click target. `ChatStream` checks for already persisted artifact ids, promotes legacy message artifacts into the Tauri artifact store when needed, records the persisted id back onto message artifact metadata, and opens `ArtifactPanel`; the preview sidecar remains only as a fallback for artifacts without panel-backed content.

Multi-artifact Desktop responses expose a `Download all` action at the card stack, matching the verified Claude batch-artifact pattern while using the same artifact type mapping and file-extension helpers as the workbench path.

The Desktop artifact workbench keeps artifact selection scoped to the side panel, then exposes preview/source switching and primary actions in the viewer toolbar itself. This matches the verified Claude artifact viewer direction where the split pane is a working surface with title/type context, source toggle, copy/download, refresh, close, and deeper version/history controls.

Desktop tool activity uses the same compact event-rail direction as the verified Claude artifact/tool-call references. `ToolTimeline` keeps the existing live tool-event store and expand/collapse behavior, but presents completed runs as short action summaries and expanded runs as icon-specific steps with result/error pills instead of large generic cards.

Desktop inline search results follow the same compact trace pattern. `InlineSearchResults` keeps registering citations for assistant responses, but renders completed searches as visible favicon/title/domain rows with a result count instead of expanding into large cards by default.

Desktop connector customization now follows the same modal-first rule. The connector gallery owns the browse/connect surface, while `CustomRemoteMcpConnectorDialog` creates remote HTTP MCP server configs through the existing MCP config API instead of sending users into a broad settings detour. The default view exposes only name and URL, with bearer token, headers, timeout, and SSL controls behind collapsed advanced settings. Bearer tokens are stored through the encrypted API-key path and referenced from MCP config placeholders. Connector gallery ownership is single-sourced under `apps/desktop/src/features/connectors/ConnectorGallery.tsx`.

Desktop project editing separates common detail edits from deep configuration. `ProjectEditDetailsDialog` owns the focused name/description modal, while `ProjectSettingsDialog` stays available for files, instructions, knowledge, memory, and conversation settings.

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
