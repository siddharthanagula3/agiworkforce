# Architecture + Design Review

**Scope**: AGI Workforce monorepo — `apps/{web,desktop,cli,mobile,extension,extension-vscode}`, `services/{api-gateway,signaling-server}`, `crates/*`, `packages/*`, `supabase/migrations/*`
**Focus**: Architecture, separation of concerns, abstractions, consistency, maintainability, scalability
**Method**: Static analysis only — no builds, no tests, no `pnpm`/`cargo`/`expo` invocations
**Date**: 2026-05-04

---

## Summary

**3 CRITICAL / 11 HIGH / 9 MEDIUM / 4 LOW**

The repo has the _bones_ of a well-factored multi-surface monorepo — `packages/types`, `packages/runtime`, a `ProviderAdapter` contract, a `@agiworkforce/chat` shared chat package. But almost none of these abstractions are actually consumed where intended. Web, mobile, and the two services have largely re-implemented the same primitives (chat UI, provider adapters, supabase clients, providerStreamClient, rate-limit, logger) inside each surface.

The two largest hotspots are:

1. **packages/chat is consumed only by desktop**; web rebuilt 111 chat components + 20 hooks + 8 stores in `apps/web/features/chat/` (362 files). 4 ChatMessage types coexist with subtly different shapes.
2. **5 distinct Supabase message tables** (`messages`, `vibe_messages`, `vibe_agent_messages`, `dispatch_messages`, `cross_device_messages`) with overlapping columns and no shared base — all created in 2026-03 but never reconciled.

Tauri command files routinely exceed 2,000–3,200 LOC of _business_ logic (e.g. `continuous_job_runner.rs:3249`), violating the "thin controller" pattern. Web API routes follow the same pattern (`chat/completions/route.ts:1414`, `stripe-webhook/route.ts:1720`).

The `apps/desktop/src/components/UnifiedAgenticChat/` directory (207 files) is verified dead code — App.tsx replaced it with `ChatInterface` from `@agiworkforce/chat` but the entire subtree was never removed and 5 files still import from it.

---

## Findings (prioritized)

---

### [SEV-ARCH-01] `packages/chat` is desktop-only; web duplicated 362 chat files — CRITICAL

**Locations**:

- `packages/chat/src/` (51 files: 27 components + stores + hooks + lib)
- `apps/web/features/chat/` (362 files: 111 components + 20 hooks + 8 stores)
- Consumers of `@agiworkforce/chat`: only 3 files, all in `apps/desktop` (`App.tsx`, `runtime/TauriRuntime.ts`, `runtime/WebRuntime.ts`)
- `apps/web/features/chat/components/MessageBubble.tsx` is web's native impl
- `packages/chat/src/components/MessageBubble.tsx` is the shared one — **never imported by web**

**Symptom**: The package was extracted (per AGI_WORKFORCE.md) to be the canonical chat UI shared by desktop and web. Desktop consumes it. Web re-implements the same surface area in `apps/web/features/chat/` and never imports the package.

**Root cause**: Web's chat predates the extraction and was never migrated. The plan documented in `docs/plans/wave2-desktop-v1.md` Task 1.1 still references this migration as work-to-do (per MEMORY); the package extraction completed only one direction.

**Impact**:

- Two chat UIs evolve independently. Bug fixes in MessageBubble must be ported manually (e.g. Markdown rendering wired into the web `MessageBubble.tsx:60` is NOT in `packages/chat/src/components/MessageBubble.tsx`).
- Feature parity gap: ToolCallCard, FollowUpSuggestions, BranchNavigator, ActionTrail, MermaidRenderer exist only in web; ImageGenCard/VideoGenCard exist only in `packages/chat`.
- `ChatMessage` is defined ≥ 4 times with subtly different shapes (see SEV-ARCH-03).
- Disincentive to invest in `packages/chat`: nobody ships from it.

**Fix**:

1. Pick one canonical: either move web → packages/chat (preferred, since desktop already uses it) or kill packages/chat and let desktop import from web (worse, ties desktop to Next.js).
2. Inventory delta: list web-only components (~85 not in packages/chat), package-only components (~5 not in web), then run a 2-pass migration.
3. Lock with ESLint rule: `@agiworkforce/chat` cannot be re-implemented in `apps/web/features/chat/components/`.

**Effort**: XL (4–6 weeks; touches every chat code path)

---

### [SEV-ARCH-02] Five message tables with overlapping concept, no shared base — CRITICAL

**Locations**:

- `supabase/migrations/20260308120002_create_messages.sql` — `messages` (canonical?)
- `supabase/migrations/20260305000002_create_vibe_messages.sql` — `vibe_messages` (vibe sessions)
- `supabase/migrations/20260308100002_create_vibe_agent_messages.sql` — `vibe_agent_messages` (agent log)
- `supabase/migrations/20260324000001_create_dispatch_tables.sql` — `dispatch_messages` (mobile dispatch)
- `supabase/migrations/20260319100003_create_cross_device_threads.sql` — `cross_device_messages` (paired devices)

**Symptom**: All five tables store the same logical entity (a chat message) with overlapping columns: `id uuid`, `user_id`, `role text CHECK (...)`, `content text`, `model`, `provider`, `metadata jsonb`, `created_at`. Each has subtle deltas:

- `messages.tool_calls` jsonb vs `vibe_messages.tool_calls` jsonb DEFAULT '[]'
- `vibe_messages.tokens_input/tokens_output` vs `messages.token_count` (single field)
- `vibe_messages.cost_cents NUMERIC(10,4)` vs `messages.cost NUMERIC(10,6)`
- `cross_device_messages.content_parts jsonb` (structured blocks) — others use unstructured `metadata`
- `dispatch_messages.task_status` (pending/working/completed/failed) — workflow state mixed with message payload
- `vibe_messages.parent_message_id` — only this one supports threading
- Role enums differ: vibe has `(user|assistant|system|tool)`, dispatch has `(user|assistant)`, cross_device has `(user|assistant|tool|system)` — same set, different orders

**Root cause**: Each feature shipped its own table without first reconciling against the existing message schema. No "common-base + extension columns" pattern applied. By the time `messages` was created (2026-03-08), `vibe_messages` (2026-03-05) was already shipping.

**Impact**:

- 5 RLS policy sets, 5 trigger functions, 5 index strategies to keep aligned.
- Cross-table queries (e.g. "show all my messages from any surface") require UNION ALL across 5 schemas with column normalization.
- Realtime replication: 5 tables in `supabase_realtime` publication (per migrations 54, 220, 343-347, plus messages itself) — every chat surface listens to its own channel; cross-surface presence is impossible.
- Type duplication in TypeScript: see SEV-ARCH-03.
- Future migrations are hard: adding `attachments` once means migrating 5 tables.

**Fix** (consolidation plan, two-phase):

1. **Phase 1 (additive, non-breaking)**: Create `public.message_thread (id, kind, source, surface, ...)` parent table. Migrate `dispatch_threads`, `vibe_sessions`, `cross_device_threads`, `conversations` to be views over it (or FK into it). Add a `messages_v2` with all extension columns (`tool_calls`, `content_parts`, `tokens_in/out`, `cost`, `task_status`, `parent_message_id`, `surface`).
2. **Phase 2 (cutover)**: Backfill from old tables, switch readers, drop old tables.
3. Normalize role enum to single CHECK constraint reused via DOMAIN.
4. Adopt the `MessageBase` interface from `packages/types/src/conversation.ts` as the single shape every surface consumes.

**Effort**: XL (multi-month if zero downtime is required)

---

### [SEV-ARCH-03] `ChatMessage` defined ≥ 4 times with conflicting shapes — CRITICAL

**Locations**:

- `packages/types/src/chat.ts:51` — canonical with `role: MessageRole`, `kind`, `status`, `tokenCount`
- `packages/chat/src/lib/types.ts:25` — local with `role: 'user'|'assistant'|'system'` (no `tool`!), no `kind`, `thinking` field
- `apps/web/features/chat/stores/chat-store.ts` — web's local
- `apps/web/features/chat/components/Main/MultiAgentChatInterface.tsx` — `extends MissionMessage`
- `apps/web/types/chat.ts` — separate ArtifactType definition
- `apps/desktop/src/types/chat.ts` — desktop's local
- `apps/mobile/types/chat.ts` — mobile's local

The shared `packages/types/src/conversation.ts` defines `MessageBase` and `MessageRole` correctly, but it's not the only ancestor used.

**Symptom**: A `ChatMessage` value passed across module boundaries gets one of seven shapes. The `tool` role exists in some, not in others. Field names differ (`createdAt` vs `timestamp` vs `created_at`).

**Root cause**: Each feature added its own message type rather than re-exporting from `@agiworkforce/types`. The chat package's local `lib/types.ts` was never reconciled.

**Impact**:

- Type unions/intersections degrade to `unknown` at boundaries.
- Stores re-marshal data on input/output, adding bugs and runtime cost.
- Refactoring (e.g. adding `branch_id`) requires touching N type files.

**Fix**:

1. `packages/types/src/chat.ts:ChatMessage` is the canonical contract.
2. `packages/chat/src/lib/types.ts` should `export type { ChatMessage } from '@agiworkforce/types'`.
3. Replace local definitions in `apps/web`, `apps/desktop`, `apps/mobile`. Where surface-specific extension is needed, intersect: `type WebChatMessage = ChatMessage & { ... }`.
4. Add ESLint rule banning `interface ChatMessage` outside `packages/types/`.

**Effort**: M (mostly mechanical type-import refactor + tests)

---

### [SEV-ARCH-04] Three parallel LLM-provider abstractions in TypeScript + a fourth in Rust — HIGH

**Locations**:

- `apps/web/lib/llm-providers/{factory.ts, anthropic.ts, openai.ts, google.ts, xai.ts, qwen.ts, moonshot.ts, deepseek.ts, perplexity.ts, zhipu.ts, base.ts}` — server-side factory consumed by 7 web API routes
- `apps/web/core/ai/llm/providers/{anthropic-claude.ts, openai-gpt.ts, google-gemini.ts, grok-ai.ts, deepseek-ai.ts, perplexity-ai.ts, qwen-ai.ts}` — frontend-side, plumbs through Netlify proxies + supabase
- `packages/providers/{anthropic,google,ollama,openai}/src/` — implements the canonical `ProviderAdapter` from `packages/types/src/provider-adapter.ts`. Used **only** by `services/api-gateway/src/lib/providerAdapters.ts` and `examples/multi-provider-chat.ts`
- `apps/desktop/src-tauri/src/core/llm/providers/` (Rust) — desktop's own provider tree
- `apps/cli/src/models.rs` — CLI's `Provider` enum + 13 providers via `OpenAICompatible` adapter

The `ProviderAdapter` contract was created in Sprint 2 (per AGI_WORKFORCE.md) explicitly to unify these. Only 4 packages implement it. Web, desktop, CLI all bypass it.

**Symptom**: Adding a provider requires 4-5 separate implementations. Bug fixes (e.g. SSRF allowlist in `lib/llm-providers/factory.ts:132-146`) don't propagate.

**Root cause**: The `ProviderAdapter` interface was extracted but the migration of existing surface-local providers was never done. Each surface's provider code grew independently before extraction.

**Impact**:

- Anthropic prompt-caching, thinking, streaming SSE protocol are reimplemented in 4 places. The "canonical" version in `packages/providers/anthropic/` lags behind web's.
- Provider-specific quirks (e.g. Anthropic Messages API vs OpenAI Chat Completions translation) get inconsistent bug fixes.
- Maintenance burden: 13 LLM providers × 4 implementations = 52 surfaces.

**Fix**:

1. **Web first** (highest leverage): replace `lib/llm-providers/factory.ts` with `packages/providers/<vendor>/createXAdapter()` calls. Keep web's tier-gating + cost calc, push provider HTTP logic to packages.
2. **Mobile / extension / vscode-ext / chrome-ext**: standardize on the shared `streamFromProvider` (already 4× duplicated) → consume from a single shared package (e.g. `packages/api/streamClient.ts`).
3. **CLI**: keep separate (Rust). Document that CLI's `OpenAICompatible` is intentionally narrower for stream-of-bytes performance.
4. **Desktop**: Rust desktop providers can stay; this is fine since desktop is Rust-native. But align the wire format with packages/providers (StreamChunk).

**Effort**: L (web-first migration is M; full rollout XL)

---

### [SEV-ARCH-05] 207-file `UnifiedAgenticChat/` is dead code, never deleted — HIGH

**Locations**:

- `apps/desktop/src/components/UnifiedAgenticChat/` — 207 files
- `apps/desktop/src/App.tsx:88-93, 110-114` — comment "Retained for reference — UnifiedAgenticChat is replaced by ChatInterface from @agiworkforce/chat"
- 5 stale imports remain: `App.tsx`, `stores/chat/toolStore.ts`, `Settings/KeybindingsSettings.tsx`, `ExecutionSidecar/ExecutionSidecarTimeline.tsx`, `__tests__/components/ReactPreview.test.ts`

**Symptom**: 207 files (significant fraction of desktop's frontend) are dead. Build still pulls them through tsc/vite. Frontend bundle bloated. New developers waste time reading them.

**Root cause**: Migration to `@agiworkforce/chat` was completed at the App.tsx level but the old subtree was retained "for reference."

**Impact**:

- ~30% of desktop frontend filesystem is noise.
- Search results in IDE / `grep` are polluted.
- 5 stale imports can resurrect dead components into the live build at any point.
- CI typecheck still type-checks 207 dead files.

**Fix**:

1. Move `UnifiedAgenticChat/` to a separate branch tagged `legacy/unified-agentic-chat`.
2. Delete from main. Migrate the 5 active imports:
   - `KeybindingsSettings.tsx` — lift any keybinding constants into a non-component file
   - `ExecutionSidecarTimeline.tsx` — same
   - `App.tsx` SearchModal/CommandPalette — these are still used (`apps/desktop/src/App.tsx:90-97`); move to `apps/desktop/src/components/CommandPalette/` and `apps/desktop/src/components/SearchModal/`
   - `__tests__/components/ReactPreview.test.ts` — port test or delete
   - `stores/chat/toolStore.ts` — replace import
3. Rename `App.tsx` comment to `// Removed: UnifiedAgenticChat. See branch legacy/unified-agentic-chat for archived code.`

**Effort**: S (1–2 days; mostly mechanical)

---

### [SEV-ARCH-06] Tauri command files are 1k–3k LOC fat controllers — HIGH

**Locations**: largest offenders (LOC)

- `apps/desktop/src-tauri/src/sys/commands/continuous_job_runner.rs` — 3,249 (3 commands at the bottom; 3,000+ LOC of business logic)
- `apps/desktop/src-tauri/src/sys/commands/mcpb.rs` — 2,774
- `apps/desktop/src-tauri/src/sys/commands/voice.rs` — 2,218
- `apps/desktop/src-tauri/src/sys/commands/scheduler.rs` — 2,200
- `apps/desktop/src-tauri/src/sys/commands/mcp_oauth.rs` — 2,084
- `apps/desktop/src-tauri/src/sys/commands/git.rs` — 1,929
- `apps/desktop/src-tauri/src/sys/commands/browser.rs` — 1,869
- `apps/desktop/src-tauri/src/sys/commands/chat/send_message_execution.rs` — 1,864
- `apps/desktop/src-tauri/src/sys/commands/file_ops.rs` — 1,804
- `apps/desktop/src-tauri/src/lib.rs` — 2,751 (entry point, but it's mostly `app.manage(state)` calls + invoke_handler list)

There are **151 files** in `sys/commands/` for **1,478 `#[tauri::command]` annotations**.

**Symptom**: Controllers should be the IPC translation layer (parse args, call domain service, return result). They are instead the implementation. `core/` exists as a domain layer but is bypassed by `sys/commands/*.rs` files that re-implement logic.

**Root cause**: The `sys/commands/` layer was used as a dumping ground when adding a feature: easier to add a command + 2,000 lines of logic in one file than to extract a service into `core/`.

**Impact**:

- Tests must run through the full `tauri::command` plumbing (state injection) to exercise simple logic.
- Code duplication across commands (e.g. error-to-string conversion happens in every command).
- Frontend coupling: changes to a command signature force the frontend to update.
- Compilation slow: changing one large file recompiles everything.

**Fix** (gradual, per-file):

1. Pick a fat controller. Extract pure-logic functions into `core/<domain>/`. Keep only IPC glue + state lookup in `sys/commands/<file>.rs`.
2. Target file size budget: `<= 500 LOC per command file`.
3. Lint rule (clippy custom): warn if `#[tauri::command]` function body is `> 50 LOC`.

**Effort**: XL (months of incremental refactor; budget-able)

---

### [SEV-ARCH-07] Web API route handlers reach 1.4k–1.7k LOC monoliths — HIGH

**Locations**:

- `apps/web/app/api/stripe-webhook/route.ts` — 1,720 LOC
- `apps/web/app/api/llm/v1/chat/completions/route.ts` — 1,414 LOC
- `apps/web/app/api/llm/v2/chat/route.ts` — 1,101 LOC
- `apps/web/app/api/webhooks/directory-sync/route.ts` — 896 LOC
- `apps/web/app/api/media/image/generate/route.ts` — 868 LOC
- `apps/web/app/api/llm/completion/route.ts` — 748 LOC

**Symptom**: A "single file = single endpoint" Next.js convention is being abused — `route.ts` becomes the file in which the entire feature lives (parsing, auth, RLS check, billing, model resolution, provider call, streaming, post-processing).

**Root cause**: Next.js App Router rewards co-location. There's no convention in the codebase that says "controller is `route.ts`, business logic goes elsewhere." `lib/services/` exists but is under-used (only 8 files: api-key, audit, credit, llm-cost-calculator, notification, organization, security-monitoring, subscription).

**Impact**:

- Hard to test (must mock NextRequest, headers, all upstream services together).
- Hard to share logic between routes (e.g. v1/chat/completions and v2/chat duplicate auth/billing/model logic).
- Easy to introduce bugs in one variant that don't get caught by the other.
- Already cited security incidents (WEB-RLS-BYPASS at `apps/web/app/api/llm/v1/chat/completions/route.ts:226-247` — service-role reused for downstream queries) are direct consequences of fat-route pattern.

**Fix**:

1. Decompose v1/chat/completions into a `lib/services/chat-completions/` package with: `schema.ts` (zod), `auth.ts`, `billing.ts`, `provider-routing.ts`, `streaming.ts`, `post-processing.ts`. Route file calls `await chatCompletions(req, deps)` and is < 100 LOC.
2. Adopt this pattern for any route > 200 LOC.
3. Lint rule: warn if `route.ts > 300 LOC`.

**Effort**: L (per-route; chat completions alone is M)

---

### [SEV-ARCH-08] 3 Supabase client patterns in `apps/web` — HIGH

**Locations**:

- `apps/web/lib/supabase.ts` (browser anon) — 3 imports
- `apps/web/lib/supabase-server.ts` (canonical server, RLS-aware) — 12 imports (just shipped per UNIFIED_LAUNCH_PLAN §1)
- `apps/web/services/supabase.ts` (`getSupabaseClient()` PKCE browser) — 17 imports
- `apps/web/services/supabaseAuth.ts` — auth-specific
- `apps/web/services/supabase-server.ts` — duplicate path
- `apps/web/shared/lib/supabase-client.ts` — 74 imports (most-used!)

Plus 15 routes do `createClient()` inline with `SUPABASE_SERVICE_ROLE_KEY` — bypassing both supabase-server.ts options.

**Symptom**: Most-imported supabase factory (`shared/lib/supabase-client.ts`, 74 consumers) is _not_ the canonical one (`lib/supabase-server.ts`, 12 consumers). The newest WEB-RLS-BYPASS mitigation lives in the least-used path.

**Root cause**: Repeated rounds of refactor created supabase clients in `lib/`, `services/`, `shared/lib/` without retiring the old ones. The "canonical" decision (per WEB-RLS-BYPASS plan) was made on `lib/supabase-server.ts` but consumer migration is incomplete.

**Impact**:

- New code uses old patterns; old patterns can leak service-role into RLS-bound contexts.
- Inconsistent auth flow (PKCE vs default).
- Service-role inline `createClient()` is a recurring security smell — every author rolls their own.

**Fix**:

1. Pick `lib/supabase-server.ts` (server) and `lib/supabase.ts` (browser anon) as canonical.
2. Codemod: replace all `services/supabase*` and `shared/lib/supabase-client*` imports with `@/lib/supabase` / `@/lib/supabase-server`.
3. Delete the old files.
4. ESLint rule: ban direct `createClient(...)` calls outside `lib/supabase*.ts`.

**Effort**: M (mechanical migration; ~91 import sites)

---

### [SEV-ARCH-09] 4 duplicated `providerStreamClient.ts` files (web/mobile/extension/vscode-ext) — HIGH

**Locations** (each ≈ 100–200 LOC, ≥ 70% identical):

- `apps/web/lib/providerStreamClient.ts` — uses `/api/v1/providers/:id/stream` proxy (web-side relative URL)
- `apps/mobile/lib/providerStreamClient.ts` — uses absolute gateway URL
- `apps/extension/src/providerStreamClient.ts`
- `apps/extension-vscode/src/services/providerStreamClient.ts`

**Symptom**: Each surface fixes `streamFromProvider` bugs in its own file. The web file imports `StreamChunk from '@agiworkforce/types'`; mobile redefines `StreamChunk` locally.

**Root cause**: When a new surface needed streaming, it copy-pasted from the previous surface and adapted the URL/headers.

**Impact**:

- Bug fixes don't propagate (e.g. SSE buffer handling).
- Stream chunk parsing diverges; e.g. mobile may not handle `thinking-delta` if web added it later.
- Test coverage: each file needs its own tests, but realistically only 1 has them.

**Fix**:

1. Extract `packages/api/src/streamClient.ts` (or new `packages/stream-client/`).
2. Inject URL builder (web-relative vs mobile-absolute) and header builder (`x-requested-with`).
3. All 4 surfaces import from package.

**Effort**: S (≤ 2 days)

---

### [SEV-ARCH-10] Workspace package `@agiworkforce/runtime` not consumed by apps — HIGH

**Locations**:

- `packages/runtime/src/{detect.ts, command.ts, events.ts, registry.ts, http.ts, errors.ts}` (9 files)
- Consumers: 55 files — all in `packages/api/src/*`. **Zero apps consume it directly.**
- `apps/desktop/src/lib/tauri-mock.ts` and `apps/web/lib/tauri-mock.ts` re-implement the same `isTauri/isCloudWeb` detection + invoke-routing.

**Symptom**: The package was designed (per its docstring) to be the universal Tauri-vs-cloud routing layer for _every surface_. Apps don't import it.

**Root cause**: Apps have their own `tauri-mock.ts` that predates `packages/runtime`. The migration was started (`packages/api/*` consumes runtime) but not finished (apps don't go through `packages/api`).

**Impact**:

- Three parallel mechanisms (`apps/desktop/src/lib/tauri-mock.ts`, `apps/web/lib/tauri-mock.ts`, `packages/runtime/src/command.ts`) that "do the same thing".
- Runtime detection may diverge: if `isTauri` evolves in `packages/runtime/detect.ts` but `apps/desktop/src/lib/tauri-mock.ts` doesn't, the apps and the API package disagree.

**Fix**:

1. Replace `apps/desktop/src/lib/tauri-mock.ts` and `apps/web/lib/tauri-mock.ts` with `import { isTauri, isCloudWeb, command, listen, emit } from '@agiworkforce/runtime'`.
2. Delete the two duplicate files.

**Effort**: S–M (compile-driven; a few imports to migrate)

---

### [SEV-ARCH-11] 11 Cargo workspace crates compiled, only 2 actually consumed by shipping binaries — HIGH

**Locations**:

- Workspace = `apps/cli` + `apps/desktop/src-tauri` + `crates/*` (12 crates)
- `apps/cli/Cargo.toml` depends on `agiworkforce-protocol`, `agiworkforce-sandbox-policy`
- `apps/desktop/src-tauri/Cargo.toml` depends on `agiworkforce-sandbox-policy`
- Other 10 crates (`agiworkforce-async-utils`, `agiworkforce-execpolicy`, `agiworkforce-network-proxy`, `agiworkforce-utils-{absolute-path,cache,home-dir,image,rustls-provider,string,template}`) are dependencies of `agiworkforce-protocol` only (not directly used by either binary)

**Symptom**: The repo's `Cargo.toml` line 7-12 documents "Shipping binaries (apps/cli + apps/desktop/src-tauri) only depend on `agiworkforce-protocol` and `agiworkforce-sandbox-policy` via path. Other workspace crates compile cleanly via `cargo check --workspace` and may be pruned in a future pass." That pruning hasn't happened.

**Root cause**: Codex-rs port was scaled back (per AGI_WORKFORCE.md) but the rump structure was retained.

**Impact**:

- `cargo check --workspace` compiles 12 crates; clean build is slower than necessary.
- New contributors don't know which crates are alive vs vestigial.
- Some "utils" are crate-bound — splitting `agiworkforce-utils-absolute-path` from its consumer was premature factoring.

**Fix**:

1. Run `cargo udeps --workspace` (or manually trace) to confirm which crates are reachable from binaries.
2. For unreachable: either inline into the consumer or delete.
3. Suspect candidates for deletion or merge: `agiworkforce-utils-template`, `agiworkforce-utils-cache`, `agiworkforce-utils-home-dir` (utility-only, single-consumer).

**Effort**: M (cautious deletion; need to be sure no `[dev-dependencies]` use them)

---

### [SEV-ARCH-12] No project references in TypeScript — implicit cross-package imports — HIGH

**Locations**:

- `tsconfig.base.json:54-58` — defines paths `@types/*`, `@utils/*`, `@desktop/*` mapping into the monorepo
- `apps/web/tsconfig.json:25-29` — defines `@/*`, `@features/*`, `@core/*`, `@shared/*`
- `apps/desktop/tsconfig.json:13-22` — defines `@/*`, `@components/*`, `@stores/*`, etc.
- No `composite: true` + `references` set up between apps and packages

**Symptom**: TypeScript resolves cross-package imports through path mapping rather than build-graph references. Every consumer compiles every dependency from source.

**Root cause**: Path mapping is easier to set up than project references, and the monorepo grew without enforcing build boundaries.

**Impact**:

- `pnpm typecheck` against just `apps/web` still type-checks `packages/types` source.
- No incremental build; TS doesn't know what to skip.
- Circular import risks (`packages/api` imports `packages/types`; nothing prevents `packages/types` from accidentally importing `packages/api`).
- The build/test pipeline can't isolate package failures.

**Fix**:

1. Each package: `tsconfig.json` adds `composite: true`, `declaration: true`, `outDir`.
2. Each app: `references: [{ path: "../../packages/types" }, ...]`.
3. Replace path mapping with package-level imports (`@agiworkforce/types`).
4. Add `tsc -b` to CI for incremental graph build.

**Effort**: M (well-trodden TS migration; per-package tsconfig sweep)

---

### [SEV-ARCH-13] Inconsistent error-handling patterns: 615 `Result<T, String>` Tauri commands, no shared error type — HIGH

**Locations**:

- 615 occurrences of `Result<T, String>` across `apps/desktop/src-tauri/src/`
- 32 separate `pub enum ...Error` types in desktop
- `apps/cli/src/errors.rs:73 — CliError` is a clean structured error type
- 44 `thiserror::Error` derivations in desktop, but these are _not_ unified
- Web has `apps/web/lib/errors.ts:createError` (used by 57 routes) but 7 still throw `new Error()` and 17 inline-`NextResponse.json({error: ...})`

**Symptom**: Errors flow through Tauri IPC as bare strings; consumers can't reliably classify, retry, or render them.

**Root cause**: `Result<T, String>` is the path of least resistance for Tauri commands (string serializes trivially over IPC). Each developer rolls their own `.map_err(|e| e.to_string())`.

**Impact**:

- Frontend cannot distinguish `auth_expired` from `network` from `validation` because all are strings.
- Retry logic must regex match strings (already happens — see `apps/desktop/src-tauri/src/sys/commands/llm.rs:267-275` matching `"402"`/`"credit limit"`).
- Translation/internationalization of error messages is ad hoc; some commands return user-facing strings, some return developer-facing strings.

**Fix**:

1. Define `agiworkforce_error::AgiError` enum (similar to CLI's `CliError`) in `crates/agiworkforce-protocol/` (already imported by both binaries).
2. Implement `Serialize`/`Deserialize` so it crosses the IPC boundary as a structured object.
3. New tauri commands return `Result<T, AgiError>`. Provide a 1-line conversion from anyhow.
4. Frontend gets a typed error union and can switch on `.kind`.
5. Migrate gradually: tag each module as it migrates with `#[deprecated_string_errors]`.

**Effort**: XL (615 sites; can be incremental)

---

### [SEV-ARCH-14] Two distinct WebSocket protocols in services/ — MEDIUM

**Locations**:

- `services/api-gateway/src/websocket.ts` — `{type:'auth_success'|'auth_error'|'pong'|'command'|'error', ...}`
- `services/signaling-server/src/index.ts` — `{type:'register'|'offer'|'answer'|'signal'|'heartbeat'|'peer_ready'|'sync_request', ...}`

**Symptom**: Both services expose WebSocket endpoints. Schemas, validation libraries (zod in signaling, manual in gateway), and message-type vocabularies are independent.

**Root cause**: The two services serve different purposes (gateway for desktop↔mobile commands; signaling for WebRTC), but both terminate authenticated WS connections from the same mobile client. There's no shared protocol module.

**Impact**:

- Mobile client must implement two distinct WS layers.
- Auth handshake differs (signaling uses register-with-token; gateway uses bearer token in handshake).
- Future cross-service flow (e.g. desktop sends a command to a mobile session) requires manual translation.

**Fix**:

1. Define a single message envelope: `{ id, type, payload, ts }` in `packages/types/src/signaling.ts` (already exists for signaling — extend to gateway).
2. Both services validate against the shared zod schema.
3. Shared client wrapper in `packages/runtime/src/ws-client.ts` for mobile/extension/desktop consumption.

**Effort**: M

---

### [SEV-ARCH-15] No cross-surface request correlation — only 7 routes pass `x-request-id` — MEDIUM

**Locations**:

- `apps/web/lib/error-handler.ts:160` reads `x-request-id` from request — only 7 of 90 web routes propagate it.
- `services/api-gateway/src/routes/llm.ts` mentions `request_id` (1 file).
- Desktop Rust uses `request_id` in MCP transport, tool executor, native_messaging_host (5 files).
- Mobile/extension/CLI: no correlation IDs detected.

**Symptom**: A single user action (mobile → api-gateway → desktop → LLM) cannot be traced end-to-end. Each surface generates new IDs.

**Root cause**: No baseline observability discipline; every PR adds correlation ad hoc.

**Impact**:

- Production debugging requires manual log stitching.
- Latency budgets (TTFT SLO at `chat/completions/route.ts:26-27` = 2500/5000ms) cannot be apportioned across hops.

**Fix**:

1. Define `x-request-id` (UUID) as the canonical header.
2. `apps/web` middleware generates one if absent and propagates downstream.
3. api-gateway propagates to desktop via WS message envelope.
4. Logger configurations include `requestId` in the base context.

**Effort**: M (consistent rollout across 6 surfaces)

---

### [SEV-ARCH-16] Per-surface `logger.ts` (4 implementations) — MEDIUM

**Locations**:

- `apps/web/lib/logger.ts` — pino + pino-pretty
- `apps/web/shared/lib/logger.ts` — duplicate
- `services/api-gateway/src/lib/logger.ts` — pino
- `services/signaling-server/src/logger.ts` — pino
- Mobile/extension/extension-vscode use `console.log` (54 sites in desktop frontend)
- Desktop Rust: `tracing::info/warn/error` (1,314 sites)
- CLI Rust: `tracing` (2,259 sites) plus 546 `println!/eprintln!` (TUI output, not logging)

**Symptom**: Multiple shapes for the same observability concept. Cross-surface log aggregation must understand each shape.

**Root cause**: Each surface picked its own logger.

**Impact**:

- Pino logs from apps/web have a `level/time/pid/hostname/...` shape; tracing logs from desktop have a `target/level/timestamp/fields/...` shape; console.log is unstructured.
- A single "user X had error Y" investigation requires reading 4 log formats.

**Fix**:

1. TS surfaces: standardize on pino + a single `packages/logger/` package. Re-export from `apps/web/lib/logger.ts` for backward compat. Same for services.
2. Frontends should use a thin pino-browser shim or accept that they `console.*` and rely on Sentry/error-reporting service to capture errors structured.
3. Rust: keep `tracing` but configure `tracing-subscriber` with the same JSON layout in both binaries.
4. Document the shape in `docs/observability/log-format.md`.

**Effort**: M

---

### [SEV-ARCH-17] Inconsistent rate-limit primitives — 5 separate implementations — MEDIUM

**Locations**:

- `apps/web/lib/rate-limit.ts` — Upstash Redis + per-endpoint config
- `apps/web/core/auth/rate-limiter.ts` — separate impl
- `services/api-gateway/src/middleware/rateLimit.ts` — express-rate-limit
- `services/signaling-server/src/middleware/rateLimit.ts` — separate impl
- `apps/desktop/src-tauri/src/sys/security/rate_limit.rs` — Rust impl (parking_lot::Mutex token bucket)

Plus inline rate-limit logic in `services/api-gateway/src/websocket.ts:18-19, 31`.

**Symptom**: Each surface invented its own rate limiting. Configuration formats differ (`limit/window` strings vs durations vs counts).

**Root cause**: Different runtimes (Edge, Node, Rust) have different ergonomics; no shared spec.

**Impact**:

- Hard to enforce per-user budgets across surfaces (a user could hit web's limit and switch to mobile freely).
- Duplicate logic for fail-open vs fail-closed decisions.

**Fix**:

1. Per-runtime is fine — TS services share `services/lib/rate-limit/` (or `packages/rate-limit/`); web keeps its Upstash version; Rust keeps its in-memory version.
2. But: define a _spec_ in `packages/types/src/rate-limit.ts` that lists named buckets (`llm-completion`, `auth-login`) with limits. All implementations look up by name.

**Effort**: M

---

### [SEV-ARCH-18] Web has 5 chat-store implementations — MEDIUM

**Locations**:

- `apps/web/stores/chatStore.ts`
- `apps/web/stores/unified/chat/chatStore.ts` (and 3 sibling stores)
- `apps/web/shared/stores/chat-store.ts`
- `apps/web/shared/stores/multi-agent-chat-store.ts`
- `apps/web/features/chat/stores/chat-store.ts`
- Plus `apps/web/features/vibe/stores/vibe-chat-store.ts`

**Symptom**: A single user-facing concept ("the chat I'm in") is split across multiple stores.

**Root cause**: Layered refactors that didn't delete old stores. The "unified" prefix in `apps/web/stores/unified/` suggests an attempt at consolidation that itself wasn't completed.

**Impact**:

- State synchronization bugs (per `dual-store-root-cause.md` in MEMORY: messages vs messagesByConversation).
- Multiple devs can edit different stores believing each is canonical.

**Fix**:

1. Pick one (probably `apps/web/features/chat/stores/chat-store.ts` since features/chat is the active path per MEMORY).
2. Migrate consumers; delete others.

**Effort**: M

---

### [SEV-ARCH-19] State management: 75 desktop stores + 57 web stores + 15 mobile stores = 147 Zustand stores — MEDIUM

**Locations**:

- `apps/desktop/src/stores/` — 75 files (102 incl. tests)
- `apps/web` — 57 stores across `stores/`, `stores/unified/`, `shared/stores/`, `features/*/stores/`
- `apps/mobile/stores/` — 15

**Symptom**: 147 Zustand stores (per project's own MEMORY: "84 stores"; static count is higher). Many duplicate concepts: `auth.ts`/`authStore.ts`/`authentication-store.ts`. Some shadow React Query (e.g. user profile in store + `use-settings-queries`).

**Root cause**: Zustand's lightweight ergonomics encourages new stores per slice rather than consolidation. No store-creation review.

**Impact**:

- Hard to reason about what state is canonical.
- `logoutCleanup.ts` exists (desktop) — proof that cleanup-of-N-stores is its own subsystem.
- Dev velocity drops as new contributors must learn the store map.

**Fix** (incremental):

1. Audit each store: what data, what mutations, who consumes? Tag as `pure-cache` (move to React Query), `pure-ui` (kept), `mixed` (split).
2. Delete stores whose only role is server cache duplication.
3. Set a budget: "no more than N stores per surface."
4. Index store concepts in `apps/<surface>/stores/README.md`.

**Effort**: XL (audit + migration)

---

### [SEV-ARCH-20] No project-level versioning strategy — MEDIUM

**Locations**:

- `package.json:3` — root `1.1.7`
- `apps/desktop/package.json:3` — `1.2.0`, `Cargo.toml:3` — `1.1.7` (mismatch!)
- `apps/web/package.json:3` — `0.1.1`
- `apps/cli/Cargo.toml:3` — `1.0.0`
- `apps/mobile/package.json:3` — `1.0.0`
- `apps/extension/package.json:3` — `1.2.0`
- `apps/extension-vscode/package.json:5` — `0.3.0`
- `services/api-gateway/package.json:3` — `1.0.0`
- `services/signaling-server/package.json:3` — `1.0.0`

**Symptom**: 9 different version numbers; desktop's `package.json` and `Cargo.toml` are 1.2.0 vs 1.1.7. Released artifacts (desktop installer, CLI binary, extension zip) all carry their own.

**Root cause**: No release-train cadence; each surface bumps independently.

**Impact**:

- Cross-surface compat invariants ("desktop ≥ X requires CLI ≥ Y") cannot be expressed.
- Bug reports come in tagged with one version — investigators must figure out matching versions on other surfaces.

**Fix**:

1. Adopt a _release-train tag_ (e.g. `2026.05`) that pins versions of all surfaces released together.
2. Per-surface semver continues internally but the release manifest in repo (`/release-manifest.json`) maps train tag → surface versions.
3. Health-check endpoints (`/api/version`, `agiworkforce --version`) return the train tag in addition to surface version.
4. Sync `apps/desktop/package.json` and `apps/desktop/src-tauri/Cargo.toml` versions in the same commit; add a CI lint that enforces equality.

**Effort**: S (process change) + M (sync pipeline)

---

### [SEV-ARCH-21] Mixed test framework (vitest + jest) — LOW

**Locations**:

- `apps/web/vitest.config.ts`, `apps/extension/vitest.config.ts`, `apps/extension-vscode/vitest.config.ts` — vitest
- `apps/mobile/jest.config.js` — jest
- `apps/desktop` uses vitest via vite.config

**Symptom**: Mobile is the outlier. Both frameworks work but their snapshot formats, mocking APIs, and watch-mode behavior differ.

**Root cause**: React Native/Expo defaults to jest. Migration to vitest hasn't happened (vitest's RN support is recent).

**Impact**: Devs working on multiple surfaces must remember which mocking API to use; CI must run two test runners; coverage tooling is bifurcated.

**Fix**: Migrate mobile to vitest if/when Expo SDK supports it cleanly. Defer; not blocking.

**Effort**: M (when ecosystem allows; today a punt)

---

### [SEV-ARCH-22] Config formats split: TOML (CLI) vs JSON (Desktop) — MEDIUM

**Locations**:

- `apps/cli/src/config.rs:14` — `~/.agiworkforce/config.toml`
- `apps/desktop/src-tauri/src/data/config_hierarchy.rs:43-44` — `~/.agiworkforce/config.json`

**Symptom**: Two binaries that target the same user's `~/.agiworkforce/` use different config formats. Field names differ (TOML uses snake_case via serde; JSON uses camelCase via `#[serde(rename_all = "camelCase")]`).

**Root cause**: CLI is TOML-conventional; Desktop is JSON-conventional (Tauri ecosystem). No coordination.

**Impact**:

- Setting "default model" in CLI doesn't carry to Desktop.
- User documentation must show two formats.
- Sharing config between surfaces (a stated goal in `comp-dotfile-architectures.md`) is impossible.

**Fix**:

1. Pick one (TOML preferred — more editable, comments-friendly, Cargo's pattern).
2. Both binaries read from `~/.agiworkforce/config.toml`.
3. Migrate field names to a single naming convention.
4. Provide migration helper: on first launch, if `config.json` exists and `config.toml` doesn't, convert.

**Effort**: M

---

### [SEV-ARCH-23] No metrics endpoint on api-gateway; signaling-server has Prometheus — LOW

**Locations**:

- `services/signaling-server/src/metrics.ts:1-12` — `/metrics` endpoint, Prometheus format
- `services/api-gateway/` — no metrics file

**Symptom**: One service is observable; the other is not.

**Root cause**: api-gateway predates metrics work; never backfilled.

**Impact**: api-gateway latency, error rates, throughput cannot be tracked in Prometheus/Grafana. Operations is blind.

**Fix**: Port the same MetricsCollector pattern to api-gateway. Expose `/metrics` (Prometheus). Counter on routes per status code.

**Effort**: S

---

### [SEV-ARCH-24] No supabase migration rollback strategy — MEDIUM

**Locations**:

- `supabase/migrations/` contains 17 forward-only `.sql` files
- No `down/` directory, no inverse migrations, no version pinning per migration

**Symptom**: Every migration is `CREATE TABLE IF NOT EXISTS`. There is no plan to roll back if a deploy fails.

**Root cause**: Supabase CLI doesn't enforce inverse migrations; team chose the path of least resistance.

**Impact**:

- A deploy that includes a bad migration must be hot-fixed forward, not rolled back.
- During incident response, it's impossible to run "revert to N-1" cleanly.
- The 5-message-table sprawl (SEV-ARCH-02) means consolidation will be a multi-table coordinated migration with high regression risk and no rollback.

**Fix**:

1. Adopt `00X_up.sql` + `00X_down.sql` naming.
2. Test rollback in `supabase/.tests/`.
3. Document migration policy (additive only by default; never `DROP COLUMN` without a deprecation cycle).

**Effort**: S (going forward) + M (retroactive backfill of 17 down-migrations)

---

### [SEV-ARCH-25] `apps/web/core/ai/llm/` is parallel to `apps/web/lib/llm-providers/` — MEDIUM

**Locations**:

- `apps/web/core/ai/llm/providers/` (7 files, \*.test.ts pairs) — used by `core/integrations/`, `core/ai/orchestration/`
- `apps/web/lib/llm-providers/` (10 files) — used by `app/api/*/route.ts`

**Symptom**: Web has _two_ provider trees side by side: one for "core" (orchestration, employee chat, multi-agent) and one for "API" (route handlers).

**Root cause**: `core/` was an earlier architecture; `lib/llm-providers/` was added when Stripe/multi-tier billing entered. Neither was retired.

**Impact**:

- Adding a model to web's `auto-balanced` setting requires updating both trees if both are exercised.
- Bug fixes (SSRF allowlist) only in `lib/llm-providers/factory.ts`, not in `core/ai/llm/`.

**Fix**: Same as SEV-ARCH-04. Migrate web to `packages/providers/<vendor>/` adapters. Delete both trees in `apps/web`.

**Effort**: L

---

### [SEV-ARCH-26] React Query and Zustand mix without clear boundary — LOW

**Locations**:

- 11 web feature directories use `useQuery/useMutation`: settings, chat, search-history, message-reactions, conversation-history, conversation-branches, workforce
- 45 web stores use `create<...>()` (Zustand)
- Some stores (e.g. `chat-store`) hold what is logically server cache + UI state mixed

**Symptom**: There's no convention for when state goes in Zustand vs React Query.

**Root cause**: Both libraries are present; no architectural decision recorded.

**Impact**: New code chooses based on author preference. Server-cache invalidation logic ends up in stores, where staleness is hard to reason about.

**Fix**: ADR document. Default: server data → React Query. UI state (modal open, current tab) → Zustand. Mutations: React Query. Cross-component derived state: a selector.

**Effort**: S (doc) + L (gradual migration)

---

### [SEV-ARCH-27] CLI hooks/skills/ecosystem code retained behind `#[allow(dead_code)]` — LOW

**Locations** (per CLI MEMORY):

- 6 modules with `#[allow(dead_code)]` retained (DEFER markers)
- Per repo's MEMORY note: "deleted in Sprint A: cloud, sync, ecosystem, policy, project_registry, project_scope; ungated: sdk_io, skills, provider"

**Symptom**: Modules that aren't shipped are still compiled with `#[allow(dead_code)]`. They drift further from working state without being exercised.

**Root cause**: "Maybe we'll ship it" tax — every dev fears deleting code that "might be needed."

**Impact**:

- Compile time tax.
- New contributors waste time reading unreached modules.
- Per the MEMORY snapshot, these modules already had partial deletion; the rump is unhealthy.

**Fix**:

1. Delete defer-marked modules (move to a `legacy/cli-deferred` branch first if needed for reference).
2. Track in a re-port list if/when they come back.

**Effort**: S

---

## Top 5 Action Items

| #   | Priority     | Action                                                                                                                                                                                        | Effort                                     | Why                                                                                                                                                                           |
| --- | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **CRITICAL** | Migrate `apps/web/features/chat/` to `@agiworkforce/chat` (or merge them)                                                                                                                     | XL (4–6 weeks)                             | Eliminates the largest divergence in the codebase. Without this, every chat improvement is implemented twice and bugs persist on whichever side wasn't updated. (SEV-ARCH-01) |
| 2   | **CRITICAL** | Consolidate the 5 message tables behind a `messages_v2` shared schema; document the parent-thread abstraction                                                                                 | XL (multi-month, 2-phase additive→cutover) | Removes the largest data-model fragmentation. Unlocks unified search, single Realtime channel, simpler type system. (SEV-ARCH-02)                                             |
| 3   | **HIGH**     | Decompose `apps/web/app/api/llm/v1/chat/completions/route.ts` (1,414 LOC) and `stripe-webhook/route.ts` (1,720 LOC) into `lib/services/<feature>/` modules; introduce 300-LOC route-file lint | L                                          | Makes the existing security mitigations testable and discoverable; prevents WEB-RLS-BYPASS-style regressions; sets the pattern for the rest of the API. (SEV-ARCH-07)         |
| 4   | **HIGH**     | Define `crates/agiworkforce-protocol/AgiError` enum with serde — replace `Result<T, String>` in tauri commands incrementally                                                                  | XL                                         | Removes the dominant frontend error-handling smell (string-regex matching for `"402"` etc.); enables typed retry logic on the React side. (SEV-ARCH-13)                       |
| 5   | **HIGH**     | Delete the 207-file `apps/desktop/src/components/UnifiedAgenticChat/` dead-code subtree; migrate the 5 stale imports                                                                          | S (1–2 days)                               | Quickest win in the report. Removes ~30% of desktop frontend filesystem noise. Re-asserts that `@agiworkforce/chat` is canonical. (SEV-ARCH-05)                               |

---

## Architectural strengths worth preserving

To balance the above, these are working _well_:

1. **`packages/types/src/models.json`** is genuinely the SSOT for model IDs. CLI (`apps/cli/src/model_catalog.rs:32` uses `include_str!`), web (`apps/web/constants/llm.ts`), desktop (`apps/desktop/src/constants/llm.ts`) all consume it. The lock-file approach (`skills-lock.json`) for skills is similar and good.
2. **`packages/types/src/provider-adapter.ts`** is a well-designed contract (auth/credentials/streaming/hooks). The api-gateway implementation through `packages/providers/<vendor>/` is the cleanest provider code in the repo. The problem is adoption (SEV-ARCH-04), not the design.
3. **`apps/desktop/src/runtime/{TauriRuntime,WebRuntime}.ts`** correctly implement the same `ChatRuntime` interface from `@agiworkforce/chat`. Pattern is sound; just incompletely propagated.
4. **`apps/web/lib/error-handler.ts`** has a security-aware `safeErrorMessage()` and a strict allow-list (`SAFE_TO_EXPOSE_CODES`). The 57 routes consuming `withErrorHandler` are demonstrably safer than the 17 inline-NextResponse routes.
5. **`apps/cli/src/errors.rs:73 — CliError`** is a textbook structured error type with `kind()`, `hint()`, `is_retryable()`. A great template for the desktop migration in SEV-ARCH-13.
6. **Supabase RLS policies** are present on every table (verified across all 17 migrations). Service-role bypass paths are documented (SEV-ARCH-08 mitigation in flight).
7. **api-gateway** uses dedicated provider packages and `@agiworkforce/llm-normalize`, exemplifying the architecture the rest of the codebase should converge on.

---

_End of architecture review._
