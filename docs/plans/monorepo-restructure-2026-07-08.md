# Monorepo Restructure And Consolidation Plan

Status: Active
Owner: Founder + platform lead
Last updated: 2026-07-08
Supersedes: extends `docs/plans/pre-release-repo-organization-2026-05-20.md` (package/crate consolidation scope)
Superseded by: -

This is the architecture-level restructure plan produced from a full-repo audit (2026-07-08): six parallel deep maps of `packages/`, `apps/web`+`apps/desktop`, `apps/mobile`+`apps/cli`+extensions+sandbox, `crates/`, repo junk/staleness, and the marketing site. Every claim below is anchored to inspected code, not docs.

The headline: **the macro shape of the monorepo is already correct** (`apps/` seven surfaces, `packages/` shared TS, `crates/` shared Rust, `services/` backends, canonical Neon migrations in `apps/web/db/neon`). What is wrong is one level down: half-finished extractions, the same responsibility implemented 4-6 times across surfaces, dead packages/crates, and pre-release entropy. The restructure is therefore **consolidation into the existing shape**, not a directory reshuffle.

## 1. Maturity Map (what is actually built)

Grades from code inspection: A = production-solid, F = stub.

| Area                                              | Grade | Evidence anchor                                                                                                                                                                                |
| ------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI (`apps/cli`, Rust)                            | A     | ~95k LOC; real agentic loop w/ runaway detection (`src/agent/chat.rs`), MCP client+server, sessions/fork/resume, cross-OS sandbox, full TUI. Only stub: `cloud` subcommand (`src/lib.rs:589`). |
| Web chat + settings + billing (`apps/web`)        | A-    | 211-file chat feature, factored OpenAI-compatible v1 endpoint, full settings/billing/Stripe. Sprawl debt (below).                                                                              |
| Desktop Local mode (`apps/desktop` + `src-tauri`) | A-    | 398k LOC hand-written Rust host; runtime-strategy mode split; rich artifact workbench.                                                                                                         |
| Desktop Cloud mode                                | B+    | `src/runtime/CloudRuntime.ts` + `src/api/cloudApi.ts` calls web REST with Bearer JWT (founder-locked design); contract/egress tests; thin cloud UI remains.                                    |
| Mobile (`apps/mobile`)                            | B+    | 3-tier local inference, 4-layer Local/Cloud enforcement (reference implementation, §5), contract-validated cloud sync. Shipping local models are text-only (§8).                               |
| VS Code extension                                 | B     | Deep IDE integration, ~80 commands, workspace-trust; `preview: true`; reimplements LLM/chat stack.                                                                                             |
| Chrome extension                                  | B-    | Strong security engineering (CDP driver, threat model, fail-closed gates); monolithic entry files (3.3k-line background), unfinished internal migration.                                       |
| Sandbox (`apps/sandbox`)                          | B+    | Real cross-origin artifact renderer used by web; cross-origin isolation is provisioning-gated: `NEXT_PUBLIC_SANDBOX_ORIGIN` unset -> silent same-origin `srcDoc` fallback.                     |
| Services (`services/api-gateway`)                 | C+    | Works, but two near-duplicate LLM proxy routes and a no-op RLS client (`src/lib/neonClients.ts` `getUserScopedClient`) — tracked flaw.                                                         |
| Root `ios/`                                       | C     | Tracked canonical Xcode project (`agiworkforce`) diverges from what `expo prebuild` generates into gitignored `apps/mobile/ios/` (`AGIWorkforce`). Drift hazard (§9).                          |

Load-bearing packages (keep, invest): `types` (model SSOT + suite contracts, 341 imports), `utils`, `runtime` (app/OS dispatch + central state), `services` (shared logic + `cloud-contracts` Zod anchor), `unified-chat` + `ui` (web/desktop UI), `local-llm` (mobile engine), `data-layer` (web DB boundary), `api` (Tauri RPC bridge), `design-tokens` (the only truly six-surface package), `llm-normalize` (canonical cross-provider contract, locked decision #12), `skills`, `mcp`, `compliance`, `apply-patch`, `routing`, `browser-tool`.

Dead or dormant (delete or wire — §7): `providers-{deepseek,lmstudio,perplexity,xai}` (zero importers), `packages/stores` chat store (zero runtime callers; only `createArtifactStore` is live), Rust crates `agiworkforce-apply-patch`, `agiworkforce-plugin-runtime`, `agiworkforce-task-runtime` (zero dependents), dormant ts-rs codegen in `agiworkforce-protocol`.

## 2. The Five Structural Findings

### F1 — Provider/LLM calling is implemented ~6 times; the canonical path is near-orphaned

The same "build request -> stream SSE -> assemble tool-call deltas -> retry/fallback" responsibility exists in:

1. `packages/providers/*` + `packages/llm-runtime` — the _intended_ canonical adapters. Real consumers: exactly one gateway route (`services/api-gateway/src/routes/providerStream.ts`) and mobile streaming.
2. `services/api-gateway/src/routes/llm.ts` (835 LOC) — reimplements raw fetch+SSE+tool assembly for Anthropic/OpenAI/Google.
3. `services/api-gateway/src/routes/cloudChat.ts` (634 LOC) — near-duplicate of #2, text-only.
4. `apps/web/lib/llm-providers/*` (4,721 LOC, 12 providers) — what web's three chat endpoints actually call. Ignores `packages/providers` and the gateway.
5. `apps/desktop/src-tauri/src/core/llm/*` (~48k LOC Rust) — desktop Local/BYOK engine with its own `provider_adapter.rs` (27 match arms) and `sse_parser.rs`.
6. Satellite SSE clients: `apps/mobile/lib/providerStreamClient.ts`, `apps/extension/src/features/{computer-use/cloudAgentClient.ts,native-bridge/providerStreamClient.ts}`, `apps/extension-vscode/src/integrations/providerStreamClient.ts` (header literally says "Mirrors apps/web/lib/providerStreamClient.ts").

Counted concretely: Anthropic SSE conversion exists 5x, OpenAI->Anthropic translation 4x, Gemini conversion 5x, retry/backoff 4x. This is the single largest source of drift risk (models.json discipline cannot save five stream parsers).

### F2 — Rust split-brain: CLI and Desktop share one 121-LOC crate

`apps/cli` consumes six workspace crates including `agiworkforce-protocol` (18k LOC). `apps/desktop/src-tauri` consumes exactly one: `agiworkforce-sandbox-policy` (121 LOC). Agent loop, MCP client, provider HTTP, SSE parsing, and exec policy are each implemented twice in Rust (`src/agent/` vs `core/agent/`+`core/agi/`; `src/mcp/` vs `core/mcp/`; `src/models/` vs `core/llm/providers/`; `agiworkforce-execpolicy` vs `sys/security/command_validator.rs`+`policy/`). The ts-rs codegen in `agiworkforce-protocol` is dormant (annotations present, no export dir wired, no generated output consumed), so `packages/types` hand-mirrors Rust types — three unsynchronized type worlds.

### F3 — UI layering is aspirational: `design-tokens -> ui -> unified-chat` does not exist in code

- Neither `packages/ui` nor `packages/unified-chat` imports `design-tokens` (tokens arrive only via app-level CSS injection).
- `unified-chat` imports `ui` exactly once, and otherwise re-implements `Button`, `Badge`, `Tooltip` (as a no-op stub), `ScrollArea` on a second, incompatible token system (`--chat-*` vs ui's semantic Tailwind tokens).
- Desktop migrated to `@agiworkforce/ui` (its 39 `components/ui/*` are 3-line re-export stubs); **web did not** — `apps/web/components/ui/*` holds 39 full private copies (~4,200 LOC).
- Both apps keep 200+-file parallel chat trees on top of unified-chat; web alone has four message-list variants and two composers.
- Mobile shares only `design-tokens` (`agiNativeColors`); its 50 RN chat components are a third chat UI (expected for RN, but state/contract layers should still be shared).

### F4 — Data/state: shared Zod contracts exist, but CRUD and apply-logic are duplicated

- `packages/services/src/cloud-contracts/` (me/sync Zod schemas) is the healthy anchor: enforced by web route contract tests and consumed at runtime by mobile's `cloudSyncEngine`.
- But wire shapes are still hand-duplicated (`apps/web/lib/server/neon-chat.ts` row types vs `cloud-contracts/sync.ts` schemas), there are **three** DB access layers (`packages/data-layer` with real Neon RLS — web only; `services/api-gateway/src/lib/neonClients.ts` 494-LOC query builder whose `getUserScopedClient` is a no-op RLS; `services/signaling-server/src/db.ts` raw Pool), and sync delta-apply is reimplemented per surface (mobile TS engine, desktop Rust `data/cloud_sync.rs`).
- `packages/stores` is dormant scaffolding superseded by unified-chat stores.

### F5 — Web-internal sprawl

Three parallel LLM endpoints (`api/llm/v1/chat/completions` well-factored; `api/llm/v2/chat/route.ts` 1,159-line monolith; `api/llm/completion/route.ts` 780), media orchestration inline in routes (983-line image route), store sprawl across three homes, an orphaned `apps/web/src/` migration relic, a dead `public/chat/` SPA bundle (plus desktop's dead `dist-web/`), and a stale `next.config.ts:60` comment describing the replaced architecture.

## 3. Target Architecture — Directory Tree

No top-level moves. Annotations mark the delta from today.

```
agiworkforce/
├── apps/                          # surfaces: composition + surface UX + native hosts. No provider calls, no business logic.
│   ├── web/                       # Next.js 16 (proxy.ts). Cloud-only product + marketing + REST API for desktop/mobile cloud modes.
│   │   └── db/neon/               # canonical migrations (unchanged)
│   ├── desktop/                   # Tauri shell. src/ = React; src-tauri/ = local host (shrinks as crates absorb engine code)
│   ├── mobile/                    # Expo. Local (on-device) + Cloud (web REST) modes.
│   ├── cli/                       # Rust agent CLI (`agi`). Engine proving ground; TUI stays app-local.
│   ├── extension/                 # Chrome MV3 companion (CDP computer use, native-messaging bridge)
│   ├── extension-vscode/          # VS Code extension
│   └── sandbox/                   # static cross-origin artifact renderer (web's isolation boundary)
├── packages/                      # shared TypeScript
│   ├── types/                     # CONTRACTS: models.json SSOT, suite-contracts (PrivacyMode etc.), enterprise types. No runtime IO.
│   ├── services/                  # cloud-contracts (Zod wire truth) + pure cross-surface business logic
│   ├── providers/*                # AI-CLIENT: per-provider adapters (openai, anthropic, google, ollama, ...)
│   ├── llm-runtime/               # AI-CLIENT: retry, stream watchdog, error classes, fallback chains
│   ├── llm-normalize/             # AI-CLIENT: canonical cross-provider payload normalization (locked decision #12)
│   ├── routing/                   # AI-CLIENT: task-type classification for explicit auto-routing
│   ├── unified-chat/              # PRODUCT UI: chat components + stores + ChatRuntime port (web/desktop DOM)
│   ├── ui/                        # PRODUCT UI: DOM primitives (Radix/CVA). unified-chat must consume, not fork.
│   ├── design-tokens/             # PRODUCT UI: token data for DOM + RN (only truly six-surface package)
│   ├── local-llm/                 # LOCAL MODE: mobile 3-tier on-device inference + local model catalog
│   ├── runtime/                   # PLATFORM: app/OS detection, command dispatch, event bus, central state
│   ├── data-layer/                # PLATFORM: Neon+Clerk RLS boundary (web + gateway after P5)
│   ├── api/                       # PLATFORM: typed wrappers over Tauri commands (desktop RPC bridge)
│   ├── skills/ mcp/ apply-patch/ browser-tool/ compliance/ utils/   # focused tool/util packages (keep as-is)
│   └── react-native-worklets/     # intentional jest-expo test shim (keep; not a fork)
├── crates/                        # shared Rust
│   ├── agiworkforce-protocol/     # canonical wire/session/config types; ts-rs codegen WIRED -> packages/types consumes generated protocol types
│   ├── agiworkforce-sandbox-policy/  # (dir rename from sandbox-policy/) the CLI+desktop shared seam today
│   ├── agiworkforce-execpolicy/   # command policy — desktop adopts this, deletes its private validator
│   ├── agiworkforce-app-server/   # JSON-RPC/WS/MCP-stdio programmatic access to the engine
│   ├── agiworkforce-command-registry/ agiworkforce-network-proxy/ agiworkforce-utils-*/
│   ├── agiworkforce-llm/          # NEW (P4): provider HTTP + SSE decode (merge desktop core/llm/providers + cli src/models)
│   ├── agiworkforce-agent-core/   # NEW (P4): turn loop + tool dispatch (merge desktop core/agent+core/agi + cli agent/)
│   └── agiworkforce-mcp/          # NEW (P4): one Rust MCP client (desktop core/mcp + cli mcp/)
├── services/
│   ├── api-gateway/               # single LLM proxy route built on packages/providers (llm.ts + cloudChat.ts collapsed)
│   ├── signaling-server/
│   └── skill-vetting/
├── docs/  scripts/  patches/  examples/  ios/   # ios/ stays root-canonical until P6 decision (§9)
└── (root control docs per docs/engineering/naming-conventions.md)
```

Deleted from the tree (dead code): `crates/agiworkforce-{apply-patch,plugin-runtime,task-runtime}`, `packages/providers/{deepseek,lmstudio,perplexity,xai}` (recreate from `providers-openai` configs in minutes when the canonical path is adopted), `crates/node-version.txt`, `apps/web/public/chat/`, `apps/desktop/dist-web/`, `apps/web/src/` relic (after import check), dormant parts of `packages/stores`.

## 4. Package/Crate Responsibility Map (who owns what, who consumes it)

Mapping the conceptual packages from the product vision onto real packages — **do not create new umbrella packages**; the units already exist:

| Concept                                                                                                                             | Real owner(s)                                                                                                                                                                               | Consumed by                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| "core/shared cloud state" (settings sync, connectors, plugins, skills, prefs)                                                       | `packages/services` (`cloud-contracts` = wire truth; business logic), `packages/types` (entities), web REST routes (server truth)                                                           | Web (server+client), Desktop CloudRuntime, Mobile cloud services                                  |
| "ai-client" (cloud API calls, streaming, auto-routing, fallback)                                                                    | `packages/providers/*` + `llm-runtime` + `llm-normalize` + `routing` — after P2 the ONLY TS provider path                                                                                   | api-gateway, web API routes, mobile, both extensions (via a shared browser-safe stream client)    |
| "ui component library" (all cloud-mode UI tools: markdown, code, tool timeline, artifacts, email view, image gen, streaming states) | `design-tokens` -> `ui` -> `unified-chat` (layering enforced by imports, P3)                                                                                                                | Web, Desktop; Mobile consumes `design-tokens` + shared state/contracts only (RN renders natively) |
| "local-mode"                                                                                                                        | Desktop: `src-tauri` host (engine moving into crates, P4). Mobile: `packages/local-llm` + `apps/mobile/storage`. Trust kernel: `packages/types` suite-contracts + per-surface egress guards | Desktop, Mobile, CLI                                                                              |
| Shared Rust engine                                                                                                                  | `agiworkforce-protocol`, `-sandbox-policy`, `-execpolicy`, `-app-server`, new `-llm`/`-agent-core`/`-mcp` (P4)                                                                              | CLI + Desktop src-tauri (+ future services)                                                       |

Rules (unchanged, now enforced targets): packages never import apps; apps never import apps; services never import UI packages; deep cross-package imports go through public exports.

## 5. Mode Architecture — how Local and Cloud stay separated

This part of the codebase is **already well-built**; the restructure canonizes the pattern instead of inventing one.

**Trust kernel (shared):** `packages/types/src/suite-contracts.ts` — `PrivacyMode`, `ProviderMode`, `ChatExecutionMode`, surface sync-boundary assertions (`assertSurfaceCanSyncChats`), generated-file trust validation. All surfaces label and gate from these types; no surface hardcodes trust wording or invents modes.

**Per-surface enforcement points (each surface keeps its own, because the I/O boundary is surface-specific):**

- **Mobile — the reference implementation (4 layers):** mode toggle (`src/features/chat/store/appModeStore.ts`) -> execution cross-check (`stores/chat/chatExecutionStore.ts:660` blocks local-mode+cloud-model and vice versa) -> **network egress guard** (`lib/egressGuard.ts` `guardedFetch` fail-closed refuses cloud HTTP in Local mode before any I/O; 100% of `services/api.ts` routes through it) -> cloud entitlement + compliance gates (`services/remoteChatGate.ts`, `services/llmGate.ts`).
- **Desktop:** runtime strategy objects (`src/runtime/{TauriRuntime,CloudRuntime}.ts`) selected by `stores/appModeStore.ts` (guarded by `desktopCloudGate` tests). Local mode talks only to Tauri IPC; Cloud mode talks only to web REST with the user's Bearer JWT. BYOK keys live in the local encrypted vault (`lib/byok-vault.ts`), never in cloud storage — web's `lib/byok-*` server code is a _different_ trust boundary, intentionally not shared.
- **CLI:** privacy modes in `src/agent/mod.rs` block Local sessions from silently using non-local provider modes.
- **Web/Chrome:** cloud-only / task-scoped respectively; no local mode to separate.

**Settings separation rule:** Cloud settings (connectors, plugins, skills, preferences) have ONE source of truth — web's Neon-backed REST, described by `cloud-contracts`, consumed identically by Web UI, Desktop CloudRuntime, and Mobile cloud services. Local settings are per-surface stores (Desktop Tauri store, Mobile MMKV/sqlite `stores/settings/localSettingsStore`), never synced, never merged with cloud settings objects (mobile's `stores/settings/{local,cloud,sync}SettingsStore.ts` split is the model). A surface renders cloud settings only when authenticated into cloud mode; Local mode renders only the local store. Cross-boundary copy is an explicit reviewed transfer, per the Local->BYOK fork rules.

**One-chat contract:** single chat surface with the Chat / AGI Work toggle in the composer (locked UX). Mode toggles change the runtime strategy behind the same UI; they never re-route history across trust boundaries.

## 6. Dependency Graph

TS (after P2/P3; arrows = imports):

```
types ◄── everything
design-tokens ◄── ui ◄── unified-chat ◄── web, desktop
services (cloud-contracts) ◄── web(routes+tests), desktop(CloudRuntime), mobile(sync), api-gateway
llm-normalize ◄── providers/* ◄── llm-runtime consumers: api-gateway, web api routes, mobile, extensions
routing ◄── web, desktop
runtime ◄── desktop, extensions, mobile, web, unified-chat
local-llm ◄── mobile          data-layer ◄── web, api-gateway (P5)
api (tauri bridge) ◄── desktop          utils ◄── all
skills/mcp/apply-patch/browser-tool/compliance ◄── current consumers (unchanged)
```

Rust: `CLI ─► app-server, protocol, sandbox-policy, execpolicy, command-registry, utils-image`; `protocol ─► async-utils, execpolicy, network-proxy, utils-*`; `Desktop ─► sandbox-policy` today, **plus execpolicy, protocol, llm, agent-core, mcp after P4**.

**Rust <-> TS boundary (all of them, today):**

1. **Tauri IPC** — ~366 `#[tauri::command]` functions registered in one `generate_handler![]` (`apps/desktop/src-tauri/src/lib.rs:1175`); typed TS wrappers live in `packages/api`. This is the only desktop frontend<->Rust channel.
2. **`agiworkforce-app-server`** — JSON-RPC over stdio/WebSocket + MCP-stdio mode; programmatic access to the CLI engine (auth: bearer/origin allowlist). Not an HTTP chat backend.
3. **Native-messaging sidecar** — `src-tauri/src/bin/native_messaging_host.rs` (Tauri externalBin) bridges Chrome extension <-> Desktop. The committed prebuilt binary `binaries/native_messaging_host-aarch64-apple-darwin` should become a CI artifact.
4. **ts-rs codegen (to wire in P4)** — `agiworkforce-protocol` -> generated TS consumed by `packages/types`, ending hand-mirroring. No NAPI/WASM exists or is needed.
5. **HTTP** — Desktop CloudRuntime and Mobile cloud services call web's REST API (Bearer JWT); that API is described by `cloud-contracts`.

## 7. Migration Plan (phased; every phase independently shippable; no moves mixed with behavior changes)

**P0 — Hygiene (this change set, 2026-07-08).** Junk/stale cleanup per §10 ledger; tool-dir deletions reconciled with guard scripts; landing page -> all six surfaces "coming soon" with no install CTAs; docs refreshed (this plan, technical-architecture, agent context). Gate: `pnpm check:llm-operability`, `check:agent-context`, `check:repo-organization`.

**P1 — Dead code (zero-risk deletes, small PRs).** The four dead provider packages; three dead crates + `crates/node-version.txt`; dormant `packages/stores` chat store (keep `createArtifactStore` or fold into unified-chat); `apps/web/public/chat/` + `apps/desktop/dist-web/` + stale `next.config.ts` comment + `VITE_BUILD_TARGET` line; orphaned `apps/web/src/` tree after an import sweep; `src-tauri/test.db`. Gate: `cargo check --workspace`, `pnpm typecheck:all`, targeted tests.

**P2 — One TS ai-client (unblocks the most surfaces; do first among code phases).**

1. Collapse `services/api-gateway/src/routes/{llm.ts,cloudChat.ts}` onto `packages/providers` (smallest consumer; providerStream.ts already proves the pattern).
2. Move web's three endpoints onto the v1 factored pattern backed by `packages/providers` + `llm-runtime`; delete `apps/web/lib/llm-providers/*` (4,721 LOC) once parity tests pass. Port the good parts of `tool-loop.ts` into a shared server-side loop module (in `llm-runtime` or `services`).
3. Publish one browser-safe SSE client from `llm-runtime`; adopt in mobile, Chrome ext, VS Code ext (their stream clients are acknowledged copies today).
   Order rationale: every surface except desktop-local converges on one streaming/fallback/normalize path, and the four "dead" provider configs become recreatable consumers instead of orphans.

**P3 — UI layering real.**

1. Web migrates onto `@agiworkforce/ui` with desktop's proven 3-line stub pattern; delete web's 39 private primitives (~4,200 LOC).
2. `unified-chat` consumes `ui` + `design-tokens`; delete its forked primitives (incl. the no-op Tooltip) and the `--chat-*` parallel token system.
3. Promote ONE markdown/code-block/tool-call renderer set into `unified-chat`; collapse web's four message lists and two composers; shells become thin adapters over `ChatInterface`.
   Gate: visual regression (desktop e2e baselines exist), `check:boundaries`.

**P4 — Rust engine convergence (start when Desktop surface work is active per serial order).**

1. Desktop adopts `agiworkforce-execpolicy` (delete `sys/security/command_validator.rs`+`policy/`).
2. Extract `agiworkforce-llm` (provider HTTP+SSE) from desktop `core/llm/providers` + CLI `src/models`; both binaries consume it.
3. Extract `agiworkforce-agent-core` and `agiworkforce-mcp` the same way.
4. Desktop links `agiworkforce-protocol`; wire ts-rs export -> `packages/types` consumes generated protocol types; delete hand-mirrored duplicates.
5. Rename `crates/sandbox-policy/` -> `crates/agiworkforce-sandbox-policy/` (move-only PR).

**P5 — Data layer.** Derive web row types from `cloud-contracts` (one wire truth); gateway adopts `packages/data-layer` (or a real RLS client — the no-op `getUserScopedClient` is tracked in known-flaws); share sync-delta apply via one TS engine + contract fixtures that desktop's Rust apply is tested against.

**P6 — Mobile multimodal + native project.** Ship the §8 SLM decision; resolve the root `ios/` vs prebuild divergence (§9) with a single canonical path (config-plugin-first, since `apps/mobile/android/` is already generated-only).

## 8. Mobile Local Multimodal SLM Decision (<4B, text+image)

Current state: shipping downloadable local models are text-only (`qwen3-4b-instruct-2507` "AGI Standard", `llama-3.2-1b` "AGI Lite"). The catalog's vision packs are correctly gated off (`shipsInV1:false`, license unverified, no runnable artifacts): `qwen2.5-vl-3b` is research-licensed (non-commercial) — the gate did its job. Only OS-resident models (Apple Intelligence, Gemini Nano) claim vision today.

Decision (verified 2026-07-08 via official sources):

1. **Primary: Qwen3-VL-2B-Instruct** — Apache-2.0 (confirmed on the official HF repos), official GGUF + `mmproj` vision projector published by Qwen, supported by llama.cpp multimodal and by `llama.rn` via `initMultimodal` (Qwen-VL listed; requires `ctx_shift:false`). Integrates through the existing **tier 3** path with catalog additions only (artifact URLs + checksums + license text). ~1.3-1.6 GB at Q4 + mmproj — within the tier-2/3 RAM gate. Upgrade option in the same family/license: Qwen3-VL-4B as a single default model doing text+vision.
2. **Fastest path / tier 2: LFM2-VL-1.6B** — first officially supported multimodal model in `react-native-executorch`'s `useLLM` (added v0.8.0; mobile already ships 0.8.4), so image input works with the dependency already installed. License: LFM Open License v1.0 (Apache-based) — free commercial use **capped at $10M annual revenue**; fine now, must be re-reviewed at scale. Suitable as the low-RAM vision option next to Qwen3-VL-2B.
3. Rejected: Qwen2.5-VL-3B (research license), FastVLM (non-commercial), Moondream3 preview (size/maturity).

Sources: huggingface.co/Qwen/Qwen3-VL-2B-Instruct(-GGUF), ggml-org/llama.cpp docs/multimodal.md, mybigday/llama.rn README (initMultimodal), swmansion.com React Native ExecuTorch v0.8.0 release notes, huggingface.co/LiquidAI/LFM2-VL-1.6B + liquid.ai/lfm-license.

Implementation checklist (P6): add catalog entries with verified license fields + download URLs + checksums; extend `local-llm` tier-3 wrapper for `initMultimodal`/mmproj lifecycle; camera/photo picker -> image message path already exists in chat input; device QA matrix (RAM gate ≥3.5GB, thermal guard); update capability detection so `visionIn` is true only when the mmproj artifact is installed.

## 9. Tracked Gaps And Follow-Ups (explicitly NOT silently dropped)

- **HealthKit (product wants parity with leading mobile assistants):** on-device HealthKit was removed 2026-07 (commit `93ca123df`) as dead code + false store claims. A dormant, flag-gated-off remote "health-context" client remains (`src/features/integrations/services/healthData.ts`) whose backend endpoint does not exist. Decision needed: re-implement on-device HealthKit properly as a spec'd feature (recommended, matches the removed design), and delete or complete the dormant remote-bridge client. Until then mobile ships without health integration and store metadata must not claim it.
- **Root `ios/` divergence:** tracked root project `agiworkforce` vs prebuild-generated `AGIWorkforce` in gitignored `apps/mobile/ios/`; PrivacyInfo.xcprivacy duplicated. Needs a single canonical path (P6).
- **Sandbox isolation is provisioning-gated:** set `NEXT_PUBLIC_SANDBOX_ORIGIN` in the web Vercel project or the cross-origin renderer silently degrades to same-origin srcDoc.
- **Gateway no-op RLS** (`getUserScopedClient`) — add to known-flaws; fix in P5.
- **Chrome extension boundary is JS-state-enforced:** host_permissions are tight, but the content script matches all http(s) pages and `debugger` grants latent CDP; allowlists live in `chrome.storage.local`. Documented in its THREAT_MODEL; revisit platform-level enforcement before store submission.
- **`.codex/` contract conflict:** worktree deletes it while `docs/agent-context/non-md-artifact-status.json` marks it keep-active — reconciled in P0 (ledger updated to match founder deletion).
- **Behavioral reference docs (claude.ai web behavior, Claude-in-Chrome behavior) via computer-use sessions:** optional follow-up after restructure, per founder request; produces AGI-owned behavioral specs (no copied assets) under `docs/research/`.
- **Stale first sentence of locked decision #5** (`docs/decisions/CURRENT_DECISIONS.md`): says "Mobile v1 should ship as Local + explicit BYOK"; current truth is Local + Cloud, no mobile BYOK (source-of-truth.md). Fix wording in P0 docs pass.

## 10. Cleanup Ledger Executed In P0

Tracked deletions (shrink repo ~35.6 MB) — each coupled with the guard-script edits that reference them (`scripts/check-agent-context.mjs`, `scripts/check-repo-organization.mjs`, `scripts/audit_reference_sources.py`, `scripts/audit-rebuild-remaining.mjs`, `scripts/audit-classify-manifest.mjs`, `docs/agent-context/non-md-artifact-status.json`):

- `.minimax/` (31.4 MB vendored skill binaries), `.cursor/`, `.codex/` agents + config, `.claude/agents/*` (founder-initiated deletions already in worktree; committed together with guard updates and CLAUDE.md/AGENTS.md subagent-section updates).
- `apps/web/public/screenshots/mobile-{light,dark}.png` (v1, zero references; `-v2` kept — used by the marketing hero).
- `docs/visual-verification/` historical round-17/18/r22 evidence (3.84 MB) -> `docs/archive/` per the repo's own artifact-status rule.
- Dead build artifacts: `apps/web/public/chat/`, `apps/desktop/dist-web/`, `apps/desktop/src-tauri/test.db`.

Local-only (gitignored, regenerable, ~240 MB): `.code-review-graph/` 174M, `apps/desktop/apps/` 35M stray copy, `.remember/logs` 18M, `apps/desktop/logs/` 7.8M, root `.expo/*.log` 4.3M, `ios/build/`, `_archive/`, empty `.agent/ .agiworkforce/ .worktrees/`, `apps/extension-vscode/{out,coverage}`, `apps/web/playwright-report/`.

Explicit KEEPs (verified load-bearing, listed to prevent future "cleanup" mistakes): `.agents/` (guard input), root `ios/` (canonical tracked native project until P6), `examples/` (`demo:multi-provider` script), `patches/expo@55.0.24.patch` (active pnpm patch), `audit.sh`/`ollama-manifest.json`/`skills-lock.json`/`node-version.txt` root files (guard allowlist), desktop e2e screenshot baselines, `docs/products/` 222-volume spec canon, Tauri icon set, `react-native-worklets` test shim.

NEEDS-DECISION (deferred, listed in §9 or for founder review): `dev-scripts/` (2 tiny reset scripts), `scripts/migrate-structure.mjs`, out-of-taxonomy docs dirs (`docs/00-foundation`, `docs/03-runtimes`, `docs/strategy`, `docs/spec`, `docs/superpowers`, `docs/architecture-review`, `docs/architecture`, `docs/reference`, `docs/design`, `docs/cli`) — per-dir reference pass before archiving; root `AGI_WORKFORCE.md`/`BUILD.md`/`ONBOARDING.md` stay per the locked root keep list; root `ARCHITECTURE.md` reviewed for merge into `docs/current/technical-architecture.md`.

## 11. Verification Gates

Per phase: the P0 gate commands above; plus `pnpm check:boundaries`, `pnpm check:llm-failures`, `pnpm typecheck:all`, `pnpm lint`, `cargo check --workspace`, targeted surface tests from `docs/agent-context/commands.json`, and the locked rule that file-move PRs contain no behavior changes. Do not mark any phase complete from build success alone; inspect the consuming call sites listed in this plan's evidence anchors.
