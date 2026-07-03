# AGI Web — Volume 15 — AI Backend

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md`, `apps/web/AGENTS.md`; grounded in `apps/web/app/api/llm/v1/chat/completions/**`, `apps/web/app/api/{chat,memory,projects}/sync/route.ts`, `apps/web/app/api/media/**`, `apps/web/lib/llm-providers/**`, `apps/web/lib/runtime/memory-context.ts`, `apps/web/lib/e2b/**`, `apps/web/lib/prompt-cache-helper.ts`, `apps/web/lib/cost-tracker.ts`, and `packages/types/src/models.json`.

## Overview & stance

AGI Web is the **cloud-only** surface: no BYOK, no Local mode. Every inference request runs against **server-side provider keys** held only on the Vercel/Next.js backend (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, … read in `apps/web/lib/llm-providers/factory.ts`) — the browser never sees a key and cannot supply one. This volume covers the AI backend that powers Web chat: how context, memory, routing, tools, retrieval, search, vision, image generation, code execution, streaming, retries, and cost controls behave on the managed-cloud trust boundary.

Because the only trust mode here is **Managed Cloud**, all AI work is subscription-backed through Neon account state and metered credits. There is no free env-key chat: the free path is a bounded Auto-Economy trial gated per model (`apps/web/lib/services/free-trial-service.ts`). Managed cloud is public alpha, open by default (`buildManagedComputeGateResponse`; `AGI_MANAGED_COMPUTE_PRIVATE_BETA` remains only as an incident kill-switch). Model IDs are resolved **only** from `packages/types/src/models.json` — never hardcoded.

## Context Management

✅ Built — `apps/web/lib/llm-providers/context-management.ts`. Anthropic context is compacted via the `compact_20260112` beta shape with modes `compact | clear_tool_uses | clear_thinking | none`, triggering at ~80% of the model's context window. Request-level guards live in `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts`: 2 MB body cap, per-message `MAX_MESSAGE_LENGTH`, 1 M-char total cap, and a clamped prompt-token estimate (`MAX_ESTIMATED_PROMPT_TOKENS`). Testable: a conversation exceeding the threshold on an Anthropic model must compact rather than 400; output defaults are capped at `DEFAULT_MAX_OUTPUT_TOKENS` (8192) unless the client raises `max_tokens`.

## Memory Injection

✅ Built — `apps/web/lib/runtime/memory-context.ts` + `apps/web/lib/runtime/WebChatRuntime.ts`. User-curated Settings → Memory facts are formatted into a single leading system message (`buildMemorySystemContent`, `withMemorySystemMessage`) with hard caps `MAX_FACTS=50` and `MAX_TOTAL_CHARS=4000`. Persistence and cross-device sync run through `apps/web/app/api/memory/route.ts` and `apps/web/app/api/memory/sync/route.ts` against the RLS-scoped `user_memories` table. Requirement: memory is Managed-Cloud data only, never sourced from Local/BYOK; injected facts must not be echoed unless the user asks what is remembered.

## Model Routing

✅ Built — `request-processor.ts`. Auto aliases (`auto`, `auto-economy`, `auto-balanced`, `auto-premium` in models.json) resolve via `resolveAutoModeModel` using a synchronous local classifier (`classifyTaskLocally` + `applyConversationContext` from `@agiworkforce/routing`) and tier. Provider is derived by `LLMProviderFactory.getProviderFromModel`; tier access is enforced by `canAccessModel` / `MODEL_TIER_REQUIREMENTS`. Twelve provider adapters are wired (anthropic, openai, google, xai, qwen, moonshot, deepseek, perplexity, zhipu, mistral, groq, openrouter). 🟡 Gap: routing slot identifiers still carry legacy `*_pro_plus` names (`getSlotForModel`) and tier labels default to `PRO`; reconciling these to the Free/Basic/Pro/Max ladder is the tracked billing-catalog task.

## Tool Calling

✅ Built — `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts`. A bounded agentic loop (`DEFAULT_MAX_STEPS=10`) streams the provider, executes MCP tools from `apps/web/lib/mcp-tool-executor.ts`, and re-invokes. Default is **fail-closed manual approval**: `x_tool_approval_request` SSE events suspend the run until `POST /api/llm/v1/chat/completions/approve`; `?approval_mode=auto` runs without prompts. Read-only tools parallelize; mutating tools serialize. Provider-native tools are injected in request-processor. Requirement: unknown/unqualified tool names return an explicit error to the model, never a silent no-op.

## Retrieval

🔭 Planned — no server-side embedding/vector/RAG pipeline exists in `apps/web/lib`. Today, in-scope retrieval is (a) memory injection (above) and (b) 🟡 chat-history search at `apps/web/app/api/search/route.ts` over synced sessions (keyword, not semantic). Planned: RAG over Managed-Cloud chats/projects/artifacts with per-user RLS scoping — must never index Local/BYOK data (which never syncs).

## Web Search

✅ Built — request-processor injects provider-native search: Anthropic `web_search_20260209` / `web_fetch_20260209`, Google `google_search`, OpenAI `web_search_preview`, gated on `capabilities.search`. Deep-research mode (`applyResearchMode`, `RESEARCH_SYSTEM_PROMPT`) forces search on and requires inline bracketed citations; Perplexity `sonar*` models exist in the catalog for search-native routing. Requirement: search is silently skipped (never errored) when the resolved model lacks the capability.

## Vision

✅ Built — request-processor validates every `image_url` through `validateUserImageUrl` (SSRF egress policy, at schema level and runtime), blocks image parts to non-vision models (`model_no_vision`, HTTP 400), and forwards multimodal content to capable providers. Testable: a private/internal image URL is rejected before any provider call; images to a text-only model fail fast without burning credits.

## Image Generation

✅ Built — `apps/web/app/api/media/image/generate/route.ts` unifies catalog-selected image models across google/openai/stability providers, storing results via `apps/web/lib/server/media-storage.ts`. Video generation (`apps/web/app/api/media/video/generate/route.ts`) proxies Runway and Google Veo async tasks with polling. Model IDs come from models.json (e.g. the `image_generation`/`video_generation` slots); third-party image engine identifiers are grounded in the route, not re-listed here.

## Code Execution

🟡 Partial — `apps/web/lib/e2b/{execution-tools,runtime,gate}.ts`. Provider-native code execution (Anthropic/Google sandboxes) ships today; platform-executed E2B sandboxing is behind `AGI_E2B_EXECUTION` (default off) and only offered on streaming, non-free-trial requests routing to E2B. Fail-closed: a missing `E2B_API_KEY` surfaces an explicit "unavailable" error to the model, never a native fallback.

## Streaming

✅ Built — `apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts` emits OpenAI-compatible SSE with TTFT SLO instrumentation (`LLM_TTFT_SLO_TARGET_MS`). The agentic path wraps `runToolLoop` in a `ReadableStream` that drains the generator on cancel. Requirement: all responses are OpenAI-compatible SSE; `x_tool_status`/`x_tool_result` events drive the client tool timeline.

## Retry Logic

✅ Built — `apps/web/lib/llm-providers/base.ts`. Per-attempt timeout + bounded exponential backoff with full jitter, honoring numeric `Retry-After`; retryable on 500/502/503/504 and transient 429/529, capped at `MAX_RETRIES`. On terminal provider failure the reserved credits/free-trial prompt are refunded (`refundFailedReservation`), and an economy fallback model may be substituted (`findCheaperFallbackModel`).

## Cost Optimization

✅ Built — prompt caching (`apps/web/lib/prompt-cache-helper.ts`, `cache-retention.ts`, catalog-driven `capabilities.caching`), reserve-then-reconcile credits (`CreditService`, `reconcileUsage`), tier quota gating with downgrade (`apps/web/lib/assert-quota.ts`), the 8192 output cap, and OTEL-attributed accounting (`apps/web/lib/cost-tracker.ts`, `LLMCostCalculator`). Requirement: over-reserves must reconcile down to actual usage; failed requests must refund.

## Repository map

- `apps/web/app/api/llm/v1/chat/completions/**` — chat entry, auth-gate, request-processor, tool-loop, stream-transform, response-builder, approve.
- `apps/web/app/api/{chat,memory,projects}/sync/route.ts` — Neon delta-sync (cursor + tombstones + idempotent upsert).
- `apps/web/app/api/media/{image,video}/**`, `apps/web/app/api/search/route.ts`, `apps/web/app/api/mcp/route.ts`.
- `apps/web/lib/llm-providers/**` (factory + 12 adapters, base, context-management, cache-retention).
- `apps/web/lib/{runtime/memory-context.ts,mcp-tool-executor.ts,e2b/**,prompt-cache-helper.ts,cost-tracker.ts,egress-policy.ts,assert-quota.ts}`.
- `packages/types/src/models.json`, `packages/routing` (classifier).

## Competitor notes

Claude, ChatGPT, and Codex each front a single first-party model family with server-managed keys and native tools. AGI Web deliberately diverges by fronting **many providers** behind one OpenAI-compatible endpoint with task/tier-aware auto-routing and a shared credit economy. Parity references (server tools, agentic tool loops, deep research, context compaction) inform design, but AGI keeps its **per-surface trust matrix**: BYOK and Local exist on Desktop/CLI/VS Code — never here. Web is intentionally the managed-cloud, no-keys-in-browser surface.

## Acceptance / Definition of Done

Production-ready when: model IDs resolve only from models.json; auth + managed-compute gate + quota + credit reserve precede every provider call; streaming, retries, refunds, and reconciliation are proven under provider failure; and no request path exposes a provider key to the client.

- [ ] Build: chat, tool-loop, media, and sync routes typecheck, unit-test, and build (`pnpm --filter @agiworkforce/web {typecheck,test,build}`).
- [ ] Trust: no BYOK/Local affordance on Web; memory/retrieval scoped to Managed-Cloud rows via RLS; Local/BYOK data never synced or indexed.
- [ ] Security: image/base-URL egress SSRF guards active; tools fail-closed on manual approval; secrets stay server-side; refunds fire on failure.

## Anti-patterns

- Adding a BYOK key field or Local runtime toggle to Web (trust-boundary violation).
- Hardcoding or inventing model IDs instead of reading `packages/types/src/models.json`.
- Presenting `pro_plus`/"Plus"/"Hobby" as tiers, or adding credit top-ups — use Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise.
- Referencing Supabase, renaming `proxy.ts` to `middleware.ts`, or shipping provider keys to the browser.
- Claiming RAG/retrieval or default E2B execution as shipped — they are 🔭/🟡; silent tool no-ops or auto-running unapproved mutating tools.
