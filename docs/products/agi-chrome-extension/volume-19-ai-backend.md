# AGI Chrome Extension — Volume 19 — AI Backend

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-11

Authority: `AGENTS.md` (repo root); `apps/extension/AGENTS.md`; `docs/current/source-of-truth.md`; `docs/products/README.md` (canon). Grounded in `apps/extension/src/features/native-bridge/providerStreamClient.ts`, `apps/extension/src/features/computer-use/{cloudAgentClient,agentLoop,escalationEngine,cdpDriver}.ts`, `apps/extension/src/background/policy.ts`, `apps/extension/src/page-metadata.ts`, `apps/extension/src/features/background/conversation-history.ts`, `apps/extension/src/background/memory-bridge.ts`, and `packages/contracts/types/src/models.json`. (Corrected 2026-07-11: `page-metadata.ts`/`nlweb.ts`/`webmcp.ts` live at the top level of `apps/extension/src/`, not under `features/content/` — that path held a duplicate fork deleted by commit `59c8f4650` for missing security fixes.)

## Overview & stance

The Chrome product is a permission-gated **browser agent**, not a consumer assistant, and it holds **no provider keys and runs no inference of its own**. Every token the extension consumes is produced server-side (AGI Cloud gateway) or, for paired flows, desktop-side over the native-messaging bridge. There is exactly one hard rule this volume enforces above all others: the **EGRESS rule** — no provider host (`openai.com`, `anthropic.com`, `googleapis.com`, an Ollama endpoint, etc.) is ever contacted from the extension. All AI traffic goes to an exact-match gateway allowlist. This surface never exposes BYOK (Desktop/CLI/VS Code only) and never routes Local data; its only inference trust mode is **Managed Cloud** (public alpha, open by default for signed-in users), with entitlements verified server-side and the paywall rendered from server `429 {kind:'paywall', requiredTier}` responses. No image generation is in scope.

## Conversation Context

Chat history is **device-scoped `chrome.storage.local` only** — capped at 100 conversations with a 30-day TTL (`MAX_CONVERSATIONS = 100`, `TTL_MS = 30 days` in `apps/extension/src/features/background/conversation-history.ts`) ✅. Agent memory is `agi_memories` in `chrome.storage.local`, max 200 items, `MAX_CONTENT_CHARS = 2000`, **never synced** (`apps/extension/src/background/memory-bridge.ts`) ✅. Consumer conversation sync and global memory sync are **removed scope** — Neon delta-sync (Web↔Mobile↔Desktop) must never carry extension rows. When the model is invoked, prior turns are assembled into the request `messages[]` array in-memory per task (`callCloud(messages, …)` in `cloudAgentClient.ts`) ✅. Requirement: history read/write must stay local; any handoff to app chat is explicit and redacted, never automatic.

## Page Context Injection

Page context is captured and passed to the model as **untrusted data, never instructions**. The computer-use loop injects a DOM summary via `cdp.getPageContent()` plus a first-turn screenshot into the initial user message (`agentLoop.ts` `runAgentLoop`) ✅. Structured metadata (title, description, OpenGraph, JSON-LD, schema types) is extracted by `extractPageMetadata()` in `apps/extension/src/page-metadata.ts` ✅, with recursion depth capped (`MAX_JSONLD_RECURSION_DEPTH = 10`). Prompt-injection defense is mandatory: the system prompt marks `read_dom` output UNTRUSTED, and `scanForInjection()` hard-stops the loop with `InjectionDetectedError` when a `SECURITY WARNING` sentinel appears (`agentLoop.ts` `executeTool` → `read_dom`) ✅. Requirement: no page content is ever elevated to system-role or executed as an instruction.

## Model Routing — server-side

Model selection is **server-side by design**; the extension only names a slot. `COMPUTER_USE_MODEL` is read from `packages/contracts/types/src/models.json` `providers.managed_cloud.taskRouting.computer_use` (`cloudAgentClient.ts`) ✅ — never invented or hardcoded per SSOT rules. 🟡 **Gap:** `managed_cloud.taskRouting` is currently `{}` (cleared, "superseded by SLOT_REGISTRY" — `models.json`), so the constant falls back to the literal `'gpt-5.4-mini'` in code; this must be reconciled so the extension resolves a live slot rather than a stale fallback. Model-by-plan gating mirrors Claude-in-Chrome plan gating and is enforced by the gateway, not the client. Thin bridged chat routes provider-tagged requests (`'anthropic' | 'openai' | 'ollama' | 'google'`) to `/api/v1/providers/<id>/stream` (`providerStreamClient.ts`) ✅, but the actual model IDs still resolve from `models.json` server-side.

## Tool Calling

Tools are declared as OpenAI-style function definitions in `BROWSER_TOOL_DEFINITIONS` — `screenshot`, `click`, `scroll`, `type`, `read_dom`, `navigate`, `find` — with `tool_choice: 'auto'` (`cloudAgentClient.ts`) ✅. The agent loop assembles streamed `tool_calls` deltas, dispatches each to `cdpDriver` via `executeTool`, and appends `role:'tool'` results (`agentLoop.ts`) ✅. Every action passes an **ask-before-acting** gate (`onBeforeAction`) that is **fail-closed**: a 30s timeout resolves DENY, bound to the specific pending action (`dispatchToolCall`, `APPROVAL_TIMEOUT_MS = 30_000`) ✅. `navigate`/`click` re-verify the post-action URL against the site allowlist and hard-abort with `NavigationOffAllowlistError` on redirect off-allowlist ✅. Loop is capped at `MAX_STEPS = 20`. Escalation from deterministic autofill to computer-use is handled by `escalationEngine.ts` ✅.

## Web Search

🔭 **Planned.** There is **no `web_search` taskRouting slot** in `models.json` and no model-driven web-search tool wired into the extension's tool set (`BROWSER_TOOL_DEFINITIONS` has none). NLWeb/WebMCP discovery primitives exist (`apps/extension/src/{nlweb,webmcp}.ts`) but are page-interaction helpers, not a server-side search tool. When built, web search must run server-side (gateway tool), obey the EGRESS rule, and never let the extension call a search provider directly.

## Vision

Vision is real for computer-use: screenshots are base64-encoded and injected as `image_url` content blocks with `detail: 'high'` (`agentLoop.ts`) ✅, routed to the vision-capable slot resolved from `models.json` `taskRouting.vision`. **Screenshot discipline** is enforced — one screenshot on the first turn, `read_dom` text thereafter unless the model explicitly requests a capture ✅. 🔭 Vision inside the thin bridged chat (image attachments) is not yet wired. No image _generation_ — out of scope.

## Streaming

Both clients consume **SSE** (`data: …\n\n`). `providerStreamClient.ts` parses framed SSE into typed `StreamChunk`s (`text-delta`, `thinking-delta`, `tool-use-*`, `usage`, `error`, `paywall`, `stop`) ✅; `cloudAgentClient.callCloud` consumes OpenAI-style SSE, merges `tool_calls` deltas, and returns an assembled `CloudAgentResponse` with `tokensUsed` ✅. Requirement: streams are cancelable via `AbortSignal`, and `[DONE]` terminates cleanly.

## Retry Logic

`providerStreamClient` classifies upstream `>= 500` as `retryable: true` and surfaces `429` paywalls as a first-class `paywall` chunk rather than an error ✅. 🟡 **Gap:** there is no automatic client-side backoff/retry loop — retry is currently the caller's or gateway's responsibility. The computer-use loop instead feeds tool errors back to the model so it can adapt, and reserves hard aborts for security errors (navigation off-allowlist, injection) ✅. Planned: bounded exponential backoff on retryable stream errors 🔭.

## Cost Optimization

Levers in place: single first-turn screenshot + text-first `read_dom` observation (`agentLoop.ts`) ✅; `max_tokens: 2048` per call ✅; token accounting via `tokensUsed` / `onUsageUpdate` / `AgentLoopUsage` for a usage meter ✅; `MAX_STEPS` cap to bound runaway loops ✅; memory/history size caps reduce prompt bloat ✅. 🔭 Planned: prompt caching and per-plan token ceilings surfaced to the user.

## Repository map

- `apps/extension/src/features/native-bridge/providerStreamClient.ts` — thin-chat SSE client → `/api/v1/providers/<id>/stream`.
- `apps/extension/src/features/computer-use/{cloudAgentClient,agentLoop,cdpDriver,escalationEngine}.ts` — cloud gateway client, agent loop, CDP driver, autofill→computer-use escalation.
- `apps/extension/src/background/policy.ts` — `GATEWAY_URL_ALLOWLIST_EXACT`, `validateGatewayUrl`, message policy.
- `apps/extension/src/{page-metadata,nlweb,webmcp}.ts` — page context extraction / discovery.
- `apps/extension/src/features/background/conversation-history.ts`; `apps/extension/src/background/memory-bridge.ts` — local history + device-scoped memory.
- `packages/contracts/types/src/models.json` — model-ID + taskRouting SSOT.

## Competitor notes

Claude for Chrome and ChatGPT's browsing/operator features run a single first-party model behind their own key with server-side tooling; Codex pairs a phone/host over remote connections. AGI's deliberate divergence: the extension is a **keyless client** over a **multi-provider** gateway (`models.json`-resolved slots), with **per-surface trust** (BYOK never on Chrome), an explicit **EGRESS allowlist**, fail-closed action approvals, and device-local history/memory that **never syncs** — the opposite of a cloud-synced consumer assistant.

## Acceptance / Definition of Done

- [ ] Build: `pnpm --filter @agiworkforce/extension typecheck` and `test` pass; SSE parsers handle partial frames and `[DONE]`.
- [ ] Trust: every AI request resolves through `validateGatewayUrl`; no provider host reachable from extension code; model IDs resolve from `models.json` (fix the empty `managed_cloud.taskRouting` fallback).
- [ ] Security: `read_dom` treated as untrusted; injection sentinel hard-stops; approvals fail-closed; off-allowlist navigation aborts; paywall rendered from server `429`.

## Anti-patterns

- Contacting any provider host directly, or bypassing `GATEWAY_URL_ALLOWLIST_EXACT` — EGRESS violation.
- Hardcoding or inventing a model ID instead of resolving `models.json` slots (the `gpt-5.4-mini` literal fallback is a bug to fix, not a pattern to copy).
- Treating page/DOM content as instructions; skipping the injection sentinel or the ask-before-acting gate.
- Syncing extension history/memory to Neon, adding Projects, or image generation — all removed scope.
- Encoding removed tiers. `providerStreamClient.ts` still lists `PaywallRequiredTier` `'hobby' | 'pro' | 'pro_plus' | 'max'` 🟡 — reconcile to Free / Basic ($7·₹399) / Pro ($20) / Max ($100 & $200) / Team ($30/seat) / Enterprise; never "Plus", `pro_plus`, or "Hobby". Top-ups are enabled for paid tiers (capped, opt-in) — do not encode them as banned.
- Referencing Supabase, or renaming Next.js `proxy.ts` back to `middleware.ts`.
