# AGI Desktop — Volume 20 — AI Backend

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`; `apps/desktop/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md`; grounded in `apps/desktop/src-tauri/src/core/llm/**`, `apps/desktop/src-tauri/src/core/embeddings/**`, `apps/desktop/src-tauri/src/core/research/**`, `apps/desktop/src-tauri/src/sys/commands/chat/**`, `apps/desktop/src/features/chat/LocalByokHandoffDialog.tsx`, and `packages/contracts/types/src/models.json` (model-ID SSOT).

## Overview & stance

This volume specifies the two AI backend pipelines that power AGI Desktop chat and agent work. Desktop is the full-trust surface — Local + BYOK + Managed Cloud, each selectable with a correct visible label — so the backend is split into two clearly separated pipelines that map to the trust boundaries. The **Cloud pipeline** covers Managed Cloud and BYOK (both remote provider calls; BYOK is direct with the user's key, Cloud goes through the AGI gateway); the **Local pipeline** covers on-device inference. A Local session is never silently routed to a remote provider: crossing Local→BYOK is an explicit fork (`LocalByokHandoffDialog.tsx`) with context selection, secret scan, payload preview, provider label, and consent. All LLM model IDs come only from `packages/contracts/types/src/models.json`; non-LLM engine IDs (Whisper, `nomic-embed-text`) are grounded in code and referenced, not re-listed.

## Cloud Mode (Managed Cloud + BYOK)

### Conversation Context

Requests assemble system prompt + trimmed history + the current turn, token-budgeted by `token_counter.rs` before dispatch; `provider_adapter.rs` clamps `max_tokens` to a per-request ceiling (16,384) to prevent budget bleed. ✅ Built — `apps/desktop/src-tauri/src/core/llm/token_counter.rs`, `provider_adapter.rs`.

### Memory Injection

Project memories are loaded, decision statements detected, and formatted into the system prompt via `MemoryInjectionConfig`. ✅ Built — `apps/desktop/src-tauri/src/core/llm/memory_integration.rs`, `sys/commands/chat/chat_memory_integration.rs`.

### Model Routing

The router picks provider + model from the selected trust mode; catalog task-routing slots (e.g. anthropic complex-reasoning → `claude-opus-4.8`, chat → `claude-sonnet-4.6`; openai chat → `gpt-5.5`, fast → `gpt-5.4-mini`; managed-cloud default `gemini-3.1-flash-lite`) resolve exclusively from `models.json`. Managed Cloud is registered lazily for signed-in users after a billing `check_cloud_access()` gate. 🟡 Partial — `apps/desktop/src-tauri/src/core/llm/llm_router.rs`, `sys/commands/chat/provider_access.rs`; unified auto-routing across providers is not fully wired.

### Tool Calling

A unified tool schema is translated per provider by `provider_adapter.rs`; a large tool-executor set (file, edit, git, terminal, mcp, memory, media, search, browser) runs the loop. Provider server-side tools (web_search, code_interpreter, image_generation, computer_use) are recognized and prefixed to skip local re-execution. ✅ Built — `apps/desktop/src-tauri/src/core/llm/tool_executor/`, `provider_adapter.rs`.

### Retrieval

Codebase/RAG retrieval indexes and ranks local content for context injection; not yet a first-class multi-corpus retriever. 🟡 Partial — `apps/desktop/src-tauri/src/core/codebase/indexer.rs`, `core/embeddings/indexer.rs`.

### Web Search

Research agents query DuckDuckGo (keyless default) or Perplexity (BYOK key); provider server-side web_search is passed through where the model supports it. 🟡 Partial — `apps/desktop/src-tauri/src/core/research/web_search_config.rs`.

### Vision

Image content parts are adapted per provider (base64/URL, detail level) and gated on catalog vision capability. ✅ Built — `apps/desktop/src-tauri/src/core/llm/tests/vision_tests.rs`, `provider_adapter.rs`.

### Image Generation

Image/video tools normalize provider names and delegate to the media command layer; engine IDs (`gpt-image-2`, Imagen, Veo, Ideogram, Runway) resolve from `models.json`, never hardcoded. 🟡 Partial — `apps/desktop/src-tauri/src/core/llm/tool_executor/media_tools.rs`, `sys/commands/media.rs`.

### Code Execution

Code runs through terminal/worktree tool executors under the desktop security policy; a hosted E2B-style remote sandbox for Cloud runs is not built. 🟡 Partial — `apps/desktop/src-tauri/src/core/llm/tool_executor/terminal_tools.rs`, `worktree_tools.rs`.

### Streaming

SSE is parsed by `sse_parser.rs`; the router wraps streams with a 30 s chunk idle timeout and 90 s connect timeout, re-emitting chunks and tool deltas to the UI. ✅ Built — `apps/desktop/src-tauri/src/core/llm/llm_router.rs` (`CHUNK_IDLE_TIMEOUT`), `sse_parser.rs`, `sys/commands/chat/stream_runtime.rs`.

### Retry Logic

`RetryConfig` (3 retries, exponential backoff, jitter) distinguishes retryable vs permanent errors and falls back to alternate candidates; a $50 session cost safety cap guards direct callers. ✅ Built — `apps/desktop/src-tauri/src/core/llm/llm_router.rs`, `fallback_chain.rs`, `sys/error/retry.rs`.

### Cost Optimization

Response/prompt caching, per-token cost calculation, and a daily budget guard reduce spend; semantic cache reuse is partial. 🟡 Partial — `apps/desktop/src-tauri/src/core/llm/cache_manager.rs`, `cost_calculator.rs`, `daily_budget.rs`.

## Local Mode (on-device)

### Local Context

Local chats build the same context window but never leave the device; history/files stay local unless an explicit BYOK/Cloud fork is confirmed. ✅ Built — `apps/desktop/src-tauri/src/sys/commands/chat/send_message.rs` (`cloud_sync_enabled` derives from `chat_storage_mode`, default `local`).

### Local Routing

Local mode routes to the Ollama provider, registered lazily so an empty-provider Local send fails loudly instead of silently. ✅ Built — `apps/desktop/src-tauri/src/sys/commands/chat/provider_access.rs` (`ensure_ollama`).

### Local Providers

Ollama is the built local backend (chat + tools + images); LM Studio / llama.cpp direct adapters are not yet present. 🟡 Partial — `apps/desktop/src-tauri/src/core/llm/providers/ollama.rs`.

### Local Memory

Memory injection reuses `memory_integration.rs` against the local store; no remote sync occurs in Local mode. ✅ Built — `apps/desktop/src-tauri/src/core/llm/memory_integration.rs`.

### Local Tool Calling

Ollama tool-call schemas are supported by `OllamaAdapter`; local tool execution runs through the shared executor under security policy. 🟡 Partial — `apps/desktop/src-tauri/src/core/llm/providers/ollama.rs`, `core/llm/provider_adapter.rs` (OllamaAdapter).

### Local Vector Store

Embeddings are generated locally (Ollama `nomic-embed-text`/`mxbai-embed-large`, or `fastembed` all-MiniLM fallback), cached in SQLite, and searched by cosine similarity. 🟡 Partial — `apps/desktop/src-tauri/src/core/embeddings/{generator,cache,similarity,indexer}.rs`; no ANN index (linear scan).

### Offline Inference

Ollama chat plus feature-gated local Whisper STT and local TTS run with no network; STT is behind the `local-whisper` build feature. 🟡 Partial — `apps/desktop/src-tauri/src/features/speech/local_stt.rs` (`local-whisper` feature), `local_tts.rs`, `core/llm/providers/ollama.rs`.

## Repository map

- `apps/desktop/src-tauri/src/core/llm/` — router, adapters, providers (ollama/direct_api/managed_cloud), cache, cost, retry, tool executors, sse_parser, token_counter.
- `apps/desktop/src-tauri/src/core/embeddings/` — local embedding generation, cache, similarity, indexer, chunker.
- `apps/desktop/src-tauri/src/core/{codebase,research}/` — retrieval indexer, web-search config, research orchestration.
- `apps/desktop/src-tauri/src/sys/commands/chat/` — send_message, provider_access, stream_runtime, memory integration.
- `apps/desktop/src-tauri/src/sys/security/secret_manager.rs` — BYOK key storage (machine-derived AES-256-GCM primary; OS keychain is the 🟡 target — Volume 19).
- `apps/desktop/src/features/chat/LocalByokHandoffDialog.tsx` — Local→BYOK fork UI.
- `packages/contracts/types/src/models.json` — model-ID and provider catalog (SSOT).

## Competitor notes

Claude, ChatGPT, and Codex each ship a single first-party cloud backend with one provider's models. AGI Desktop deliberately diverges: **multi-provider** (catalog spans Anthropic, OpenAI, Google, and OpenAI-compatible providers via one adapter layer), **BYOK where trust allows** (Desktop/CLI/VS Code only, keys in the OS keychain), **per-surface trust modes**, and **local-first** on-device inference and embeddings so a full pipeline runs with no network. Parity references (Claude Remote Control, Codex remote connections) are windows over a locally running session — not a fourth trust mode and out of scope here.

## Acceptance / Definition of Done

Backend is production-ready when both pipelines run with correct, visible trust labels; no Local request reaches a remote provider without an explicit confirmed fork; all model IDs resolve from `models.json`; and streaming, retry, and cost caps are enforced.

- [ ] Build: `cargo check -p agiworkforce-desktop`; `pnpm --filter @agiworkforce/desktop test` green for router/adapter/vision/cache suites.
- [ ] Trust: Local→BYOK fork enforces context selection + secret scan + payload preview + consent + provider label; Local default never sets `cloud_sync_enabled`.
- [ ] Security: BYOK keys only in OS keychain; `max_tokens` clamp, idle/connect timeouts, session cost cap active; no key or prompt leakage in logs.

## Anti-patterns

- Silently routing a Local chat/file/session to BYOK or Managed Cloud, or skipping the fork's secret scan / payload preview / consent.
- Hardcoding, inventing, or aliasing a model ID instead of reading `packages/contracts/types/src/models.json`.
- Showing a stale or wrong provider/model label, or a fake availability badge.
- Reintroducing removed tiers ("Plus", `pro_plus`, "Hobby") or credit top-ups in cost/billing paths; only Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise exist.
- Referencing Supabase or renaming Next.js `proxy.ts` to `middleware.ts`.
- Claiming a capability shipped without a real repo path, or removing the per-request token clamp / cost cap / idle timeout.
