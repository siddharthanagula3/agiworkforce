# AGI Chrome Extension — Volume 23 — Performance

Status: Draft spec
Owner: Founder + platform lead
Last updated: 2026-07-01

Authority: `AGENTS.md`, `docs/current/source-of-truth.md`, `docs/products/README.md` (canon), `apps/extension/AGENTS.md`, and repo paths cited inline below (manifest, computer-use, content, native-bridge, background, memory-bridge). Model IDs via `packages/contracts/types/src/models.json` only.

## Overview & stance

This volume sets performance requirements for the AGI Browser Companion — a permission-gated browser agent, not a consumer assistant. The trust model bounds every budget: the extension holds **no provider keys and runs no inference of its own**, so heavy compute (LLM calls, computer-use reasoning) leaves the browser and streams back through the cloud gateway (`cloudAgentClient.ts` EGRESS rule; `providerStreamClient.ts` → `/api/v1/providers/<id>/stream`). The extension's own surface is small: an MV3 service worker, one content script per page, CDP-driven automation, and `chrome.storage.local`-only history/memory. There is no conversation sync, no global memory sync, no Projects, and no in-extension inference to budget for. The goal is a responsive browser under agent workloads while respecting the eviction-prone MV3 worker lifecycle and the debugger-attach cost of computer-use.

## Extension Startup

The extension MUST cold-start without blocking the browser. Manifest facts (✅ `apps/extension/manifest.json`): MV3 with a module service worker (`src/background.js`), a single content script injected at `document_idle` with `all_frames:false`, `minimum_chrome_version:132`, and `offline_enabled:false`.

- Startup work MUST be lazy: no synchronous network calls, no debugger attach, no page scanning at worker install/activate. Computer-use CDP attach happens per-action, never at boot (✅ `cdpDriver.ts` — `attach()` per action, `detach()` after every op).
- Scheduled-task alarms MUST be re-registered on worker startup because MV3 restarts clear in-memory state (✅ `tasks.ts`, logs "Restored N scheduled task alarm(s)").
- Target: side-panel first paint under ~300 ms warm; injection adds no measurable input latency at `document_idle`. 🔭 Planned: a measured cold-start budget in CI.

## Background Worker

The MV3 service worker is ephemeral and MUST be treated as such.

- No `setInterval`/`setTimeout` may be relied on for recurring work across evictions; recurring browser tasks use `chrome.alarms` with `periodInMinutes` (✅ `tasks.ts`, `MAX_TASKS = 50`).
- Debugger detach from eviction MUST self-heal: an `onDetach` listener re-attaches registered tabs but distinguishes eviction (re-attach) from a user manual detach (do not re-attach) (✅ `cdpDriver.ts` `ensureOnDetachListener`, installed once at module load).
- The worker MUST not hold large buffers between events; persistent state lives in `chrome.storage.local`.
- 🟡 Partial: history/memory reads are whole-array read-modify-write (`conversation-history.ts`); fine at the 100/200 caps but not a general store — do not raise caps without incremental storage.

## DOM Parsing

Page reads MUST be bounded and treat page content as **data, never instructions**.

- DOM summaries fed to the model are capped at `DOM_SUMMARY_MAX_CHARS = 8_000` (✅ `cdpDriver.ts`) to bound token cost and worker memory.
- JSON-LD / schema extraction MUST cap recursion to avoid hostile deeply-nested payloads: `MAX_JSONLD_RECURSION_DEPTH = 10` (✅ `page-metadata.ts`, audit batch-221 fix).
- Metadata extraction MUST be non-throwing and return a safe fallback object on any error (✅ `page-metadata.ts` try/catch fallback).
- Element targeting uses a per-tab index→selector map rebuilt on every snapshot (✅ `cdpDriver.ts` `elementIndexMaps`), so SPA re-renders never resolve stale indices and avoid repeated full-DOM re-queries.

## Memory Usage

Extension memory footprint MUST stay small and bounded by hard caps.

- Conversation history: `MAX_CONVERSATIONS = 100`, 30-day TTL with prune on write (✅ `conversation-history.ts`). `chrome.storage.local` only, device-scoped, never synced.
- Device memory bridge: `MAX_MEMORY_ITEMS = 200`, `MAX_CONTENT_CHARS = 2000` per item (✅ `memory-bridge.ts`), never synced to cloud or consumer chat tables.
- The service worker MUST release CDP screenshot buffers after each agent step and not retain snapshots beyond the current turn.
- 🔭 Planned: a storage-quota guard prompting a user-visible prune before `chrome.storage.local` nears its quota.

## CPU Usage

Automation MUST not spin the CPU or the debugger.

- The computer-use agent loop is hard-capped at `MAX_STEPS = 20` (`maxSteps` option) to prevent runaway loops (✅ `agentLoop.ts`).
- Page-stability waiting uses bounded polling — default `timeoutMs 3000`, `pollIntervalMs 250`, `stableCount 2` — and resolves rather than rejecting on timeout, so it never busy-waits or crashes the caller (✅ `cdpDriver.ts` `waitForStable`).
- Debugger attach is scoped per action and always detached in a `finally` path (✅ `cdpDriver.ts`), so no idle tab pays CDP overhead.
- 🔭 Planned: adaptive poll backoff on quiet pages to further cut idle CPU.

## Streaming

All model output is streamed; nothing is buffered to completion before display.

- The SSE parser reads the `ReadableStream` incrementally with `TextDecoder({stream:true})`, splits on `\n\n` frame boundaries, and yields each `StreamChunk` as it arrives, honoring `[DONE]` and `AbortSignal` (✅ `providerStreamClient.ts` `streamFromProvider`).
- Malformed frames MUST be skipped without aborting the stream; the reader lock MUST be released in `finally` (✅ `providerStreamClient.ts`).
- Server 429 `{kind:'paywall', requiredTier}` responses MUST be yielded as a first-class `paywall` chunk so upgrade UI renders instead of an error (✅ `providerStreamClient.ts`); entitlements are verified server-side, never in the extension.
- 🟡 Partial: `PaywallRequiredTier` in `providerStreamClient.ts` still lists removed tiers (`hobby`, `pro_plus`); the canonical ladder is Free / Basic $8 (₹399) / Pro $20 / Max $100 & $200 / Enterprise — the tracked billing-catalog reconciliation gap.

## Large Pages

Large or hostile pages MUST degrade gracefully.

- Text sent to the model is truncated at the 8 000-char DOM summary cap (✅ `cdpDriver.ts`); large pages never balloon the request.
- Recursion and iteration over meta/JSON-LD are depth- and count-bounded (✅ `page-metadata.ts`).
- The content script runs `all_frames:false` (✅ `manifest.json`), so nested iframe farms do not multiply injected-script cost.
- 🔭 Planned: region/viewport-scoped capture as the default for very large pages; full-page behind an explicit action.

## Multi-tab Performance

Automation MUST scale predictably across tabs.

- CDP driver state (index maps, attach registry) is keyed by `tabId` (✅ `cdpDriver.ts`), so concurrent tabs do not clobber each other's element maps.
- The agent loop pins one active tab per run and re-validates origin only when a `navigate` tool call changes it (✅ `agentLoop.ts`); off-allowlist navigation aborts the loop.
- Only tabs registered as active are eligible for transparent re-attach after eviction (✅ `cdpDriver.ts`), preventing debugger churn across background tabs.
- 🔭 Planned: a global ceiling on simultaneous CDP-attached tabs, with queueing beyond it.

## Repository map

- `apps/extension/manifest.json` — MV3 manifest, permissions, content-script timing, min Chrome version.
- `apps/extension/src/features/computer-use/{agentLoop,cdpDriver,cloudAgentClient,escalationEngine}.ts` — loop caps, CDP attach lifecycle, gateway egress.
- `apps/extension/src/{page-metadata,nlweb,webmcp}.ts` (top-level, not `features/content/` — that path held a duplicate fork deleted 2026-07-03 for missing security fixes), `apps/extension/src/features/content/browserTool.ts` — DOM/metadata parsing bounds.
- `apps/extension/src/features/native-bridge/providerStreamClient.ts` — SSE streaming parser.
- `apps/extension/src/features/background/{conversation-history,tasks}.ts` — history caps, alarm scheduling.
- `apps/extension/src/background/memory-bridge.ts` — device-scoped memory caps.
- `apps/extension/{THREAT_MODEL,MANIFEST_NOTES}.md` — permission and threat rationale.

## Competitor notes

Claude for Chrome and ChatGPT's browser agents run inference server-side and stream results; Codex remote connections steer a host from a paired client. AGI diverges: (1) **no in-extension inference or provider keys** — all compute leaves via the gateway (`cloudAgentClient.ts`), so the browser only captures, acts, and renders; (2) **per-surface trust** — task-scoped with `chrome.storage.local`-only history/memory (never synced), unlike globally-synced consumer assistants; (3) **local-first host** — heavy sessions can bridge to Desktop over native messaging (`com.agiworkforce.browser`) / localhost 8787. Model selection and gating come from `packages/contracts/types/src/models.json` and server-side entitlements, not hardcoded catalogs.

## Acceptance / Definition of Done

Production-ready when startup is lazy, the worker survives eviction, all reads are bounded, streaming is incremental, and multi-tab automation is `tabId`-isolated — verified against the cited paths, not build success alone.

- [ ] Build/perf: cold-start side panel and content-script injection add no measurable input latency; alarms restore after simulated worker eviction (`tasks.ts`).
- [ ] Trust: no provider host is ever contacted from the extension (gateway-only egress, `cloudAgentClient.ts`); history/memory remain `chrome.storage.local`-only and unsynced.
- [ ] Security: DOM summary (8 000 chars), JSON-LD depth (10), agent steps (20), and storage caps (100 / 200) hold under large/hostile pages; page content is treated as data.

## Anti-patterns

- Do NOT run inference or hold provider keys in the extension; never bypass the gateway egress rule.
- Do NOT rely on `setInterval` for recurring tasks — use `chrome.alarms` (MV3 evicts the worker).
- Do NOT leave the CDP debugger attached between actions or across idle tabs.
- Do NOT raise history/memory caps without incremental storage; do NOT sync history or memory to Neon or any cloud table.
- Do NOT hardcode or invent model IDs — read `packages/contracts/types/src/models.json`.
- Do NOT reintroduce removed tiers (`Plus`, `pro_plus`, `Hobby`) or credit top-ups; use Free / Basic $8·₹399 / Pro $20 / Max $100 & $200 / Enterprise (Pro/Max INR TBD).
- Do NOT reference Supabase; the stack is Clerk + Neon + Stripe. Do NOT rename `proxy.ts` to `middleware.ts`.
