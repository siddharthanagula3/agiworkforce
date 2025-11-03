# Milestone 4 – LLM Router & Cost Tracking

## Current State Snapshot
- Rust providers for OpenAI, Anthropic, Google, and Ollama are wired through the shared `LLMProvider` trait and expose token/cost metadata (`apps/desktop/src-tauri/src/router/providers`).
- `LLMRouter` classifies tasks, applies routing strategies, and cascades fallbacks with cache-aware invocations (`apps/desktop/src-tauri/src/router/llm_router.rs`).
- Cost calculation, caching, and analytics backends persist data in SQLite and power the React dashboard + sidebar widgets (`apps/desktop/src-tauri/src/router/cost_calculator.rs`, `router/cache_manager.rs`, `commands/chat.rs`).
- Frontend cost dashboard and sidebar widget load analytics via the cost store, including budget management (`apps/desktop/src/components/Analytics`).

## Deliverable Checklist
1. **Provider implementations** ✅ – All four providers support latest flagship models, with usage → cost mapping and configuration via `llm_configure_provider`.
2. **Router & strategy logic** ✅ – Task classification, routing strategies, and fallback order live in `LLMRouter::candidates`, feeding `chat_send_message` and `llm_send_message`.
3. **Cost calculator** ✅ – Pricing tables, per-message cost computation, and aggregation into conversations/providers implemented via `CostCalculator` and repository helpers.
4. **Caching layer** ✅ – `CacheManager` stores hashed prompts with TTL/LRU trimming; `chat_send_message` reads/writes cache hits to avoid duplicate spend.
5. **Cost analytics UI** ✅ – `CostDashboard` and `CostSidebarWidget` fetch overview + analytics, expose filters, and allow monthly budget management.
6. **Backend integration** ✅ – `chat_send_message` routes through the new stack, stores provider/model/cost metadata, emits streaming events, and updates stats consumed by the UI.

## Follow-Up Opportunities
- Add true streaming support per provider once long-lived responses are surfaced (currently simulated chunking for UI smoothness).
- Expand cache schema with separate prompt/completion token columns to improve analytics granularity on cache hits.
- Add integration tests behind mocked providers once Node/Rust toolchains are available in CI.
