# AGI Desktop — Volume 16 — Local Mode

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon); `apps/desktop/AGENTS.md`; and repo paths — `apps/desktop/src/stores/appModeStore.ts`, `apps/desktop/src/features/v3/LocalCloudToggle.tsx`, `apps/desktop/src-tauri/src/core/llm/providers/{ollama,direct_api_provider,mod}.rs`, `apps/desktop/src-tauri/src/sys/commands/ollama.rs`, `apps/desktop/src-tauri/src/core/llm/models_config.rs`, `apps/desktop/src/features/settings/tabs/ModelsKeys/index.tsx`, `apps/desktop/src/features/chat/LocalByokHandoffDialog.tsx`, `apps/desktop/src-tauri/src/data/db/migrations.rs`, `apps/desktop/src-tauri/src/features/search/fts.rs`, `apps/desktop/src-tauri/src/sys/security/{storage,secret_manager}.rs`, `apps/desktop/src-tauri/Cargo.toml`, `packages/contracts/types/src/models.json`.

## Overview & stance

AGI Desktop is the full-trust surface: Local, BYOK, and Managed Cloud are all reachable with correct visible labels. This volume covers **Local Mode** — the completely independent, on-device execution environment. Local and BYOK are **distinct modes** that both live under the "Local" toggle position on desktop today (`appModeStore.ts` comment: "Local + BYOK both live in Local mode"), but they are different trust boundaries: Local means on-device inference with zero funded/keyed remote calls; BYOK means the user's own provider keys hit a provider directly. Crossing from Local to BYOK is an **explicit fork** — context selection, secret scan, payload preview, visible provider label, consent (`LocalByokHandoffDialog.tsx`). Local chats, files, and sessions are never silently routed to BYOK or Cloud. Local + BYOK are **free access modes, not plans**; the Managed-Cloud ladder (Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise) does not apply to Local operation. Note: desktop Managed Cloud itself is not yet wired — `appModeStore.setMode('cloud')` fails closed (`ERR_CLOUD_NOT_IMPLEMENTED`), so Local Mode is the desktop's working default (`supportsLocalAppMode`).

## Local Workspace

A Local workspace is fully self-contained: on-device model runtime, local SQLite store, local files, and no outbound funded calls. The Local↔Cloud selector is the primary nav (**✅ Built** — `apps/desktop/src/features/v3/LocalCloudToggle.tsx`, `apps/desktop/src/stores/appModeStore.ts`); switching enforces trust-boundary guards and never switches mid-stream. Default chat storage is local (`chatStorageMode` defaults to `"local"`; `settings_load_from_disk` coerces stale `"cloud"` back), per `apps/desktop/AGENTS.md`. **✅ Built.**

## BYOK Providers

BYOK sends the user's own key straight to a provider via the direct adapter (**✅ Built** — `apps/desktop/src-tauri/src/core/llm/providers/direct_api_provider.rs`; UI `apps/desktop/src/features/settings/tabs/ModelsKeys/index.tsx`, `llm_check_provider_status`). Adapters exist for direct APIs plus Azure and Bedrock (`providers/{azure,bedrock}.rs`). Keys are stored locally, health-checked before use, and each response carries a visible provider label. Model IDs come only from `packages/contracts/types/src/models.json` — never hardcoded. **✅ Built.**

## Local Models

Local models run through Ollama (**✅ Built** — `providers/ollama.rs`: streaming SSE, tool calls, image inputs) and OpenAI-compatible local servers (LM Studio, generic) via the direct adapter's `base_url` (**🟡 Partial** — `direct_api_provider.rs` allows loopback but no first-class local-runtime picker UI; gap: model selection is manual). The `models.json` `ollama` provider entry has an empty `defaultModel`, so installed models are discovered at runtime, not hardcoded. **✅ Built (Ollama) / 🟡 (other local servers).**

## Provider Configuration

Local endpoints are restricted to an allow-list of loopback ports (`ALLOWED_LOOPBACK_PORTS` = 11434 Ollama, 1234 LM Studio, 8080/5000/3000 generic; `direct_api_provider.rs`) with SSRF guards blocking private/link-local IPs (e.g. 169.254.169.254) and requiring HTTPS for remote hosts. Provider health/status is surfaced in the Models & Keys tab. **✅ Built** — `direct_api_provider.rs::validate_provider_base_url`. Convergence of desktop settings to the locked Settings IA remains **🟡** (`apps/desktop/AGENTS.md`).

## Ollama

Ollama is the primary local runtime: detect running instance, list installed models, fetch details (**✅ Built** — `apps/desktop/src-tauri/src/sys/commands/ollama.rs` `/api/tags` + status commands; provider `providers/ollama.rs`). Default base URL is centralized (`OLLAMA_DEFAULT_BASE_URL`). **✅ Built.**

## LM Studio

LM Studio is supported as an OpenAI-compatible server on loopback port 1234 via the direct adapter (**🟡 Partial** — `direct_api_provider.rs` port allow-list; `packages/ai/providers/lmstudio/README.md`). Gap: no dedicated discovery command equivalent to Ollama's `/api/tags`, and no first-class LM Studio picker UI. **🟡 Partial.**

## llama.cpp

An embedded llama.cpp path exists only as an optional, feature-gated dependency: `llama-cpp-2` behind the `local-llm` cargo feature (**🔭 Planned** — `apps/desktop/src-tauri/Cargo.toml` lines ~206/265). It is not compiled into default builds and no production code loads a GGUF model through it (`use_local_llm_fallback` in `core/agent` is unrelated routing config, not llama.cpp inference). **🔭 Planned.**

## Model Downloads

Ollama model pulls are initiated from the app (**✅ Built** — `sys/commands/ollama.rs::ollama_pull_model` → `/api/pull`). Gap: pull progress is background-only (no streamed progress UI wired) — **🟡** for the download-manager UX. GGUF direct-download for the embedded runtime is **🔭 Planned** (tied to `local-llm`). **🟡 Partial.**

## Local Conversations

Conversations persist to a local SQLite database with FTS mirror tables (**✅ Built** — `apps/desktop/src-tauri/src/data/db/migrations.rs`: `conversations`, `conversations_fts`). Local rows never sync — Neon delta-sync (`apps/web/app/api/{chat,memory,projects}/sync`) covers Managed-Cloud chats only; `send_message.rs` crosses the cloud boundary only when `chat_storage_mode == "cloud"`. **✅ Built.**

## Local Projects

AGI Work Projects render in the V3 shell (**🟡 Partial** — `apps/desktop/src/features/v3/AgiWorkProjects.tsx`; sync stub `apps/desktop/src-tauri/src/data/projects_sync.rs`). In Local Mode, project rows stay local and are excluded from delta-sync. Gap: project-scoped local model/context binding is not fully wired. **🟡 Partial.**

## Local Memory

Memory persists on-device (**🟡 Partial** — `apps/desktop/src-tauri/src/core/agi/memory_persistence.rs`; `data/memory_sync.rs` gated to cloud rows). Local memory never leaves the device; the sync path is inert unless Managed Cloud is active. Gap: on-device semantic recall/embedding index is not shipped. **🟡 Partial.**

## Local Search

Full-text search over local conversations uses SQLite FTS5 (**✅ Built** — `apps/desktop/src-tauri/src/features/search/fts.rs`, `conversation_search.rs`; command-palette UI `apps/desktop/src/features/v3/SearchModalCmdK.tsx`). Migrations fail closed if FTS5 is unavailable (`db/migrations.rs`). Semantic/vector search over local content is **🔭 Planned**. **✅ Built (FTS).**

## Local Tool Calling

Tool calls flow through the tool executor and prompt tool-injection layer, and the Ollama provider serializes/parses `tools`/`tool_calls` (**✅ Built** — `apps/desktop/src-tauri/src/core/llm/providers/ollama.rs`, `core/llm/prompt_tool_injection.rs`, `core/llm/tool_executor/`). Local tools run against local files/shell under desktop sandbox policy; results stay local. **✅ Built (tool loop) / 🟡 (per-tool local-only guarantees vary).**

## Local Image Generation

Image generation currently routes through the web media API (`{base_url}/api/media/image/generate`), i.e. it is **not** on-device (**🟡 Partial** — `apps/desktop/src-tauri/src/core/agi/executors/media_executor.rs`; provider/engine IDs resolved server-side, not from `models.json` LLM catalog). True on-device local image generation (e.g. a bundled diffusion runtime) is **🔭 Planned**. Until built, image gen must not be labeled "Local." **🟡 Partial / 🔭 Planned.**

## Offline Operation

With Ollama (or an OpenAI-compatible local server) running, chat, FTS search, and local storage work with no network. Cloud entry is refused offline/unauthenticated (`appModeStore.setMode` requires a signed-in eligible account; desktop cloud additionally fails closed today). **✅ Built** for the Local path; comprehensive offline degradation (queued cloud retries) is **🔭 Planned**.

## Local Database

Storage is embedded SQLite via `rusqlite` with a connection pool and at-rest encryption (**✅ Built** — `apps/desktop/src-tauri/src/data/database/sqlite_pool.rs`, `data/db/{migrations,encryption,repository}.rs`). Secrets/keys use AES-256-GCM with **machine-derived keys** in the local store (`sys/security/{storage,secret_manager,machine_key}.rs`), which intentionally avoids OS-keyring permission prompts. **🟡 Partial** vs the stance's "keys in OS keychains" target — reconcile keychain vs machine-key storage. **✅ Built (DB) / 🟡 (keychain gap).**

## Repository map

- `apps/desktop/src/stores/appModeStore.ts`, `apps/desktop/src/features/v3/{LocalCloudToggle,SearchModalCmdK,AgiWorkProjects}.tsx`
- `apps/desktop/src/features/settings/tabs/ModelsKeys/index.tsx`; `apps/desktop/src/features/chat/LocalByokHandoffDialog.tsx`
- `apps/desktop/src-tauri/src/core/llm/providers/{ollama,direct_api_provider,azure,bedrock,mod}.rs`; `core/llm/{models_config,prompt_tool_injection}.rs`; `core/llm/tool_executor/`
- `apps/desktop/src-tauri/src/sys/commands/ollama.rs`; `sys/security/{storage,secret_manager,machine_key}.rs`
- `apps/desktop/src-tauri/src/data/{database,db,memory_sync,projects_sync}` ; `features/search/{fts,conversation_search}.rs`; `core/agi/{memory_persistence, executors/media_executor}.rs`
- `apps/desktop/src-tauri/Cargo.toml` (`local-llm` feature); `packages/ai/providers/{ollama,lmstudio}`; `packages/contracts/types/src/models.json`

## Competitor notes

Claude, ChatGPT, and Codex are cloud-first: inference and history live on vendor servers with no user-run local runtime or BYOK. AGI's deliberate divergence: a genuine on-device execution environment (Ollama/local servers), BYOK-with-no-markup where the trust boundary allows (Desktop/CLI/VS Code only), local-first storage with FTS, and a strict, consent-gated Local→BYOK fork. Desktop is the local-private compute host, not a thin client.

## Acceptance / Definition of Done

Local Mode is production-ready when on-device chat, local storage, and local search run with no outbound funded/keyed calls, and every mode carries a correct visible label.

- [ ] **Build:** Ollama detect/list/pull + streaming chat + FTS search verified on macOS/Windows/Linux; local model list is dynamic (no hardcoded IDs).
- [ ] **Trust:** Local chats/files/memory never sync (`chatStorageMode` default `local`); Local→BYOK only via `LocalByokHandoffDialog` (context selection + secret scan + payload preview + provider label + consent).
- [ ] **Security:** loopback allow-list + SSRF guards enforced; secrets encrypted at rest; keychain-vs-machine-key gap tracked and resolved.

## Anti-patterns

- Silently routing Local chats/files to BYOK or Cloud, or forking to BYOK without the full consent flow.
- Labeling cloud-routed image generation as "Local," or claiming embedded llama.cpp works when it is feature-gated off.
- Hardcoding or inventing model IDs instead of reading `packages/contracts/types/src/models.json` / dynamic Ollama discovery.
- Allowing arbitrary localhost ports or non-loopback provider URLs; bypassing SSRF validation.
- Referencing Supabase (migrated away), or removed tiers ("Plus", `pro_plus`, "Hobby") or credit top-ups.
- Renaming `proxy.ts`/`proxy` back to `middleware.ts` in any shared web build path.
