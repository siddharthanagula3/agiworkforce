---
id: "SYS-chat-turn-pipeline"
type: "system"
title: "Chat turn pipeline"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Chat turn pipeline

In Cloud mode, pressing Send makes the web hook useChatStream draw the bubbles and POST to /api/llm/v1/chat/completions. The route authenticates, takes a turn slot, applies policy gates, builds context, picks model and route, reserves usage, then streams via a tool loop (durable workflow transport) or a plain adapter stream. It settles billing and saves the answer on the server and client. Local turns skip the route; own-key runs only in CLI/VS Code.

## What it is and why it exists

The chat turn pipeline is everything between the user pressing Send in a Cloud-mode chat and the answer being stored and billed. It exists so that one consistent experience works over many models and many inference providers, while subscription rules (entitlements, quotas, credits, concurrency) are enforced in one place on our servers.

- **Cloud mode (mode:cloud, also called Managed Cloud)** is the only mode that reaches the completions route (api:POST /api/llm/v1/chat/completions). The route's own code comment says Local and BYOK never reach it. [code] (apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-session-grants.ts:21; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4876)
- The route is OpenAI-compatible (same wire shape as the OpenAI Chat Completions API), with AGI extensions such as `x_tool_status`, `x_tool_approval_request`, `x_run_detached` and a per-frame `envelope` for sequencing. [code] (route.ts:162-196; lib/stream-envelope.ts; useChatStream.ts:3507)
- The same route serves Web, Desktop (Electron loads the hosted web app), Mobile, the Chrome extension and the VS Code extension. [code] (apps/mobile/services/streaming.ts:402; apps/desktop/src/api/cloudApi.ts:903; apps/extension-vscode/src/utils/api.ts:1115). The surface is read from the `X-AGI-Surface` header and the credential (lib/request-surface.ts) [code].
- Model and provider agnostic: callers send a model id or an Auto alias; routing resolves it against the generated catalog (packages/ai/model-registry/catalog/*, packages/contracts/types/src/models.json). No model identifier is named on this page on purpose. [requirement] (AGENTS.md section 4; docs/architecture/provider-routing.md)

There is a separate free-quota path for promotional offerings: the web client sends those to /api/models/free-quota/completions (or /api/models/experiential-free/completions) instead. [code] (apps/web/features/chat/lib/free-quota-selection.ts:40-46). Its internals are out of scope here.

## How it works today

Order of steps for a normal Cloud turn on the web. Basis for all rows: [code] unless marked.

| # | Step | What happens | Source |
|---|---|---|---|
| 1 | Client send | `useChatStream().sendMessage` decides Local vs Cloud from the model id (`local:` prefix). For Cloud it paints the user bubble and an assistant placeholder synchronously, claims an AbortController, gets a token and CSRF token, builds the message array (system style/artifact blocks first), then POSTs JSON with `stream: true`, `conversation_id`, `assistant_message_id`, `user_message`, flags (web_search, research, work_mode, thinking, effort, memory, mcp_context...) and headers `Authorization`, `X-AGI-Surface`, `Idempotency-Key`. | apps/web/lib/hooks/useChatStream.ts:4149-4600 |
| 2 | Route entry | `POST` = CORS wrapper, rate-limit-headers wrapper, error handler around `handleChatCompletions`, inside a tracing span with a phase timer. `maxDuration` is 300 s. | route.ts:161, 1463-1530 |
| 3 | Auth gate | IP rate limit, identity verify (Clerk token or API key; MFA, passkey, IP allow-list, account checks), CSRF, user rate limit, terms-of-service check, adult-eligibility (age) gate, subscription lookup. No subscription row means the Free website plan. A lapsed paid plan is treated as Free, not refused. Enterprise plans past read-only collection are refused 403. Surface is checked against the plan (managedCloudSurfaceRefusal). | lib/auth-gate.ts:139-363 |
| 4 | Turn slot | Per-plan cap on concurrent managed turns (plan limit read from billing-catalog `maxConcurrentTurns`); over the cap returns 429 `concurrent_turn_limit_reached`; limiter outage returns 503. The slot is held until the stream ends. | route.ts:1475-1512; lib/turn-slot.ts; apps/web/lib/rate-limit.ts:1366 |
| 5 | Gates before spend | Managed-compute gate (private-beta kill switch; Free requests always pass), organization policy gate, workspace spend-limit gate, workspace controls. Run in parallel, before any credit is reserved. | route.ts:396-459 |
| 6 | Free-quota-first | Optional replay lane: a Free request may first be tried on a free-quota route, and a refusal can fall back to it. | route.ts:1488-1512 |
| 7 | Request processing | `processRequest`: idempotency key to requestId; body size cap (413); JSON + zod schema parse; model-tier and workspace-policy checks; persist the user message BEFORE any model call (failure returns 503 `user_message_persistence_failed`, no model request sent); hydrate attachments; resolve context; select model and route; check credits; reserve usage; apply custom instructions; compact the context window. | lib/request-processor.ts:3386-6770 (phases listed in lib/turn-phases.ts) |
| 8 | Secret gate | Messages that look like secrets are blocked (400 `secret_detected`, reservation refunded) or redacted (count returned in a header). | route.ts:483-530 |
| 9 | Provider-start mark | `markManagedUsageProviderStarted` records that an external side effect is about to start, so a crash is recoverable by the lifecycle migration. | route.ts:528-557 |
| 10 | Dispatch | Three streaming branches, then a non-streaming branch: (a) Deep Research loop (paid only); (b) agentic tool loop when tools are in play or the turn is AGI Work; (c) plain adapter stream. | route.ts:567, 898, 1239, 1359 |
| 11 | Stream to client | SSE frames with a 2 s heartbeat; response headers carry the resolved model, quota warning, fallback reason, project sources, route lane. | lib/sse-heartbeat.ts:6-29; route.ts:1233 |
| 12 | Settle and save | Billing is finalized once from observed usage; the server upserts the assistant row; the client also saves its richer copy. | lib/stream-transform.ts:191-375, 484-973; lib/assistant-turn-persistence.ts:262 |
| 13 | After | Title generation (first message only), auto-memory recording, source-URL patch. | see Data and state |

### Context building (memory, project, attachments) [code]

- **Attachments** are hydrated per message up to a plan limit (`getPlanMaxAttachmentsPerMessage`); oversize files go through a prepared-attachment resolver that returns passages for the user's query; truncated names are reported in a header the client reads. (request-processor.ts:4160-4215; lib/prepared-attachments.ts; lib/chat-attachment-hydration.ts)
- **Memory, project files and past chats** come from `resolveInteractiveTurnContext`. Memory is included only if the memory policy is enabled, the chat is not temporary, and the request asks for it (`accountMemoryRequested`: on API surface only when `memory_enabled === true`, elsewhere unless false). Past-chat recall needs the policy switch, a non-API surface, memory not disabled, a non-temporary chat and a non-empty query. Loaders run through `resolveContext` under the organization's context policy; a loader failure is logged and the turn continues without that source. A manifest of what was admitted is written fire-and-forget (not for temporary chats). (apps/web/lib/services/turn-context-service.ts:82-250)
- **Project context**: if a project is attached and its context cannot be admitted, the turn fails closed with no model request (`projectContextLoadFailure`); the project instruction joins the cached system preamble, other project blocks are added as separate system messages at their own layers, capped at `MAX_PROJECT_CONTEXT_CHARS`. (request-processor.ts:4236-4272; turn-context-service.ts:62-80)
- **Connector context** (`mcp_context`) is loaded and added as an untrusted-context system message; failure returns 422/503 `mcp_context_unavailable`. (request-processor.ts:4274-4330)
- **Custom instructions** are read late (phase `custom_instructions`). **Context compaction** trims or summarizes old history to fit the model's window; if the latest user message alone cannot fit, the turn is refused before the provider and the reservation released (`message_too_long`). Summarization is controlled by env `AGI_CONTEXT_COMPACTION_ENABLED`. (request-processor.ts:6466, 6702-6760; lib/context-compaction.ts:36-60)
- Citations for memory, past chats and project sources are sent back in response headers and shown by the client. (useChatStream.ts:2000-2050)

### Model and provider choice [code]

1. `Auto` aliases and the user's routing profile are resolved; a Free-plan promotion turn may substitute a promotional model; Free plans get a default model; a no-training requirement (user opt-out, health space, Google user data) restricts to models/providers that keep inputs out of training. (request-processor.ts:3585-3660)
2. Route resolution reads in parallel: route health, conversation route affinity, zero-data-retention policy, workspace model policy, user routing preferences, rollout flags, workspace region. It builds a policy snapshot (noTrainingOnly, zeroDataRetentionOnly, organization policy, residency region, usOnly) and picks a route; a free-lane outcome can dispatch, or strand the turn with a capacity-unavailable response. The decision trace is persisted. (request-processor.ts:4640-4860)
3. An explicit model choice is never answered by a different model; Auto may change model and route. Only failover plan entries admitted at attempt time are served. [requirement + code] (docs/architecture/provider-routing.md; lib/managed-failover.ts:1-60)
4. Dispatch uses `ADAPTER_PROVIDERS` (lib/adapter-providers.ts), a table mapping a provider id to an adapter in packages/ai/providers/*; an unlisted provider fails with an explicit unsupported-provider error. (route.ts:1239, 1359-1440)

### Tool loop [code]

- Entered when the model supports tools and there are operator MCP tools, connector tools, or request tools that need the loop (`classifyToolLoopInputs`), or the turn is AGI Work. A model whose capability `tools` is false takes the single-turn path. (route.ts:802-910; lib/tool-loop-routing.ts)
- `runToolLoop` streams a provider step, executes tool calls, appends results, calls the model again. Step budget is cumulative: defaults 10 (chat), 100 (AGI Work), 20 (caller-handed tools). Exhausting it pauses on a checkpoint instead of killing the run. Fail-closed approvals: in manual mode a signed checkpoint is saved before `x_tool_approval_request` is emitted; the client resumes with run id and decisions. Read-only tools run in parallel (max 4), mutating tools one at a time. (lib/tool-loop.ts:1-40, 541; packages/contracts/cloud-contracts/src/tool-call-limits.ts:3-5)
- Saved allow/ask/deny tool verdicts and a per-chat connector opt-out are applied server-side; denied tools are never advertised. Provider-native web search is swapped for our own function tool when the policy would not auto-approve it. (route.ts:817-890)
- Each run is registered as a cloud agent run (table:cloud_agent_runs) so it can be paused, resumed, steered, cancelled and reattached. (route.ts:898-905; apps/web/db/neon/0061_cloud_agent_runs.sql:9; app/api/llm/v1/chat/completions/runs/**)
- **Durable transport**: for the tool-loop branch the turn starts on the Vercel Workflow transport so it outlives the request, unless env kill switch `AGI_DURABLE_INITIAL_TURNS` is 0/false/off, the transport breaker is open, or the first event misses its budget (default 500 ms, env `AGI_DURABLE_FIRST_EVENT_BUDGET_MS`; not applied to AGI Work). On any failure it falls back to the request-scoped inline stream with the same wire. Plain no-tool chat does NOT use the durable transport. (route.ts:943-1024; lib/workflows/durable-initial-turns.ts; lib/workflows/durable-stream-liveness.ts:11-16)

### Streaming, stop, and failure [code]

See Failure handling. Streaming path: `buildAdapterStreamResponse` assembles OpenAI-style frames with `OpenAIWireAssembler`, turns inline clarify tool calls into cards, persists generated files, observes time to first token (SLO target and breach thresholds read from env `LLM_TTFT_SLO_TARGET_MS` and `LLM_TTFT_SLO_BREACH_MS`), then settles billing, saves the assistant turn, and sends `data: [DONE]`. (lib/stream-transform.ts:484-973)

### Titles [code]

Stage 1: when the first user message is saved, the server sets a truncated provisional title (only if no earlier user message and no assistant answer exist). Stage 2: unless the conversation uses a free-quota offering model, a fire-and-forget utility-model call (non-streaming, 24 output tokens, source capped at 4000 chars) replaces it with a title of 6 words or fewer; it goes through managed-cloud route admission, an exact-response cache, and a background usage lease under the quota feature `conversation_title`; any failure keeps the truncated title. (app/api/chat/conversations/[id]/messages/lib/persist-message.ts:179-209; lib/generate-title.ts:1-230)

### Usage charging [code]

One reservation (`reserveManagedUsageRequest`) is taken in request processing, keyed by the idempotency key and a request hash, with a lease; rotation across providers stays inside that one reservation. Settlement happens once, priced by the model that actually served: billed cost uses the catalog list price (`calculateListCostMicrousd`) while provider cost records the served route's price (provider-reported cost is used only inside a sanity band around the estimate). Failed or cancelled-with-no-output turns bill zero; a cancelled turn with delivered text is billed for the estimated tokens delivered. Free-trial turns settle through `settleFreeTrialRequest`. Usage fields include tokens, cache read/write, server-tool requests, compaction and CPST telemetry. (request-processor.ts:6100-6215; lib/stream-transform.ts:131-375; docs/architecture/provider-routing.md)

## Implementation map

| Concern | Where | Basis |
|---|---|---|
| Client stream hook (web) | file:apps/web/lib/hooks/useChatStream.ts (`useChatStream` 3883; `sendMessage` 4149; `consumeAssistantStream` 1975; `stopGeneration` ~5400; `saveMessageToDb` 736) | [code] |
| Endpoint choice client-side | file:apps/web/features/chat/lib/free-quota-selection.ts (`chatCompletionEndpoint` 40) | [code] |
| Local turn (client) | file:apps/web/features/chat/lib/local-turn.ts; file:apps/web/features/desktop-host/lib/runtime-client.ts (`startLocalChat` 621) | [code] |
| Route | file:apps/web/app/api/llm/v1/chat/completions/route.ts (dispatch 396; admit 1475) | [code] |
| Auth gate | file:.../lib/auth-gate.ts | [code] |
| Turn slot | file:.../lib/turn-slot.ts; file:apps/web/lib/rate-limit.ts | [code] |
| Request processing | file:.../lib/request-processor.ts (about 7000 lines) | [code] |
| Context building | file:apps/web/lib/services/turn-context-service.ts; managed-memory-context-service; past-chat-context-service; project-context-service | [code] |
| Attachments | file:.../lib/chat-attachment-hydration.ts; prepared-attachments.ts; attachment-turn-budget.ts | [code] |
| Compaction / window | file:.../lib/context-compaction.ts; context-window.ts | [code] |
| Tool loop | file:.../lib/tool-loop.ts (about 8000 lines); tool-loop-anthropic.ts (table-driven per-provider dispatch despite the name); tool-loop-routing.ts; tool-approval-policy.ts | [code] |
| Research loop | file:.../lib/research-loop.ts | [code] |
| Durable transport | file:apps/web/lib/workflows/*; file:.../lib/managed-agent-stream.ts | [code] |
| Provider table | file:.../lib/adapter-providers.ts; file:.../lib/adapter-factory.ts; packages/ai/providers/* | [code] |
| Deadlines | file:apps/web/lib/deadline-policy.ts; file:.../lib/provider-deadlines.ts | [code] |
| Failover | file:.../lib/managed-failover.ts; failover-plan.ts; route-breaker.ts | [code] |
| Stream building | file:.../lib/stream-transform.ts; response-builder.ts; sse-heartbeat.ts; stream-envelope.ts; adapter-response.ts | [code] |
| Saving the turn | file:.../lib/assistant-turn-persistence.ts; failed-turn-record.ts; file:apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts | [code] |
| Titles | file:apps/web/app/api/chat/conversations/[id]/messages/lib/generate-title.ts | [code] |
| Billing | file:apps/web/lib/services/managed-usage-request-service.ts; credit-service; free-trial settle | [code] |
| Run control endpoints | api:POST /api/llm/v1/chat/completions/approve, /resume-input, /resume-caller, /resume-device, api:GET and POST /api/llm/v1/chat/completions/runs/{runId} (GET status, POST cancel), .../runs/{runId}/pause, /resume, /steer, /archive, /resume/stream | [code] (directory listing; runs/[runId]/route.ts:111-112) |
| Guest route | api:POST /api/llm/v1/chat/completions/guest (not read) | [unknown] behaviour |
| Other apps' clients | file:apps/mobile/services/streaming.ts; file:apps/desktop/src/api/cloudApi.ts and runtime/CloudRuntime.ts (Tauri build only); file:apps/extension-vscode/src/utils/api.ts; shared hook file:packages/ui/unified-chat/src/hooks/useChat.ts with ChatRuntime interface (packages/ui/unified-chat/src/lib/runtime.ts:127) | [code] |
| Tests (exist; not run by this author) | test:apps/web/app/api/llm/v1/chat/completions/__tests__/route.managed-failover.test.ts; route.first-token-deadline.test.ts; route.free-quota-first.test.ts; stream-transform.byte-parity.test.ts; stream-transform.upstream-error.test.ts; test:.../lib/request-processor.memory.test.ts; turn-context.test.ts; assistant-turn-persistence.finish-reason.test.ts; test:apps/web/lib/hooks/useChatStream.local.test.ts | [code] |

## Data and state

**Database tables** (Neon Postgres, user-scoped through row-level security) [code]

| Table | Role in a turn | Source |
|---|---|---|
| table:web_conversations | Conversation row, title, `active_leaf_message_id`, temporary flag, project link. | db/neon/0001_mvp_chat.sql:3; persist-message.ts:179-195 |
| table:web_messages | User row (saved by the route before the model call) and assistant row (upsert by client-supplied id with `on conflict`, so server and client writes converge). Holds content, model, provider, token counts, metadata JSON, parent_id (branching). | assistant-turn-persistence.ts:56-75 |
| table:managed_usage_requests | The one reservation per turn: reserve, provider-started mark, finalize, client-delivered mark. | db/neon/0056_managed_usage_request_lifecycle.sql:13; managed-usage-request-service.ts |
| table:cloud_agent_runs | Run record for tool-loop, research and AGI Work turns; checkpoints for approval, input, device and caller steps; steer messages; cancellation. | db/neon/0061_cloud_agent_runs.sql:9; route.ts:20-30 imports |
| Context manifest store | Written per non-temporary turn by `createPostgresContextManifestStore`; table name not read. | turn-context-service.ts:158-170 [unknown table name] |
| Memory, past chats, custom instructions, project files | Read as context; auto-memory is written after a successful turn (`recordManagedAutoMemoryTurn`). | route.ts:1326-1345 |

**Idempotency**: the client builds the key from surface, purpose (`send`, `continue`, retry suffix) and the assistant message id; the server reuses it as the reservation key, so a network retry does not double-charge. API-key callers with no header get a generated `agi.chat.api.*` key. [code] (useChatStream.ts:4420; request-processor.ts:3410-3425)

**Client state**: Zustand chat store (messages, streaming flags, search results, tool timeline, research state), per-conversation AbortController map, active-run map for cancellation, pending approval and input turns, a send-queue per conversation, and settlements that stop a stale session from writing. [code] (useChatStream.ts:3926-3990)

**Where the answer is stored**: the server writes the assistant row at stream end (including truncated turns, marked `truncated` with reason `stream_cancelled`), skipping temporary conversations and requests without `assistant_message_id`. The client then saves its copy through the shared client for api:POST /api/chat/conversations/{id}/messages; the SQL merges metadata and refuses to overwrite user-edited content (`ASSISTANT_CONTENT_CHANGED` conflict). If the client save fails after retries it marks the message `metadataNotSaved`. [code] (assistant-turn-persistence.ts:262-480; useChatStream.ts:2800-2870)

**Local state**: a Local turn is held only in the client store; it is not uploaded. [code] (local-turn.ts:80-92)

## Rules: access, plans, modes

**Plans and access** [code unless noted]

- Free users (no subscription row, or a free tier) are on the free-trial path: they always pass the managed-compute gate, and their turns reserve through a free-trial reservation instead of paid credits. (route.ts:404-424; request-processor.ts:3660-3700)
- Deep Research is refused for free-trial turns (paid only). (route.ts:567-570)
- Connectors, attachment counts per message, custom connector limits, concurrent turns and model tiers are read per plan from the billing catalog and model-tier tables; exact numbers live in file:packages/contracts/types/src/billing-catalog.ts and are not copied here. (request-processor.ts:4180; route.ts:846-855; lib/turn-slot.ts)
- A lapsed paid plan is served as Free, with the client told why; an unpaid enterprise plan is refused 403 `subscription_inactive`; read-only billing returns `billing_read_only`. (auth-gate.ts:296-340)
- Plan names in current memory notes (Free, Premium, Max, Ultra) are a product decision recorded outside the code read here; use the billing catalog for the live set. [requirement, secondary] (owner memory; not re-verified in code for this page)
- Credits: paid turns check credit balance, may fall back to a cheaper model when credits are short (`insufficient_credits`), or are funded by usage credits (extra usage) when the plan limit is reached; otherwise a monthly-limit refusal is returned. Users see credits, not model price. (request-processor.ts:6100-6130; docs/architecture/provider-routing.md)
- Workspace (organization) rules: policy gate, spend limit, model policy, zero data retention, region residency, training opt-out are all applied before or during routing. (route.ts:425-459; request-processor.ts:4640-4720)
- Terms-of-service acceptance and an adult-eligibility gate run in the auth gate for sessions (API-key callers are treated under the commercial terms their owner accepted). (auth-gate.ts:86-136, 279-290)

**Modes** [requirement + code]

| Mode | Reaches the completions route | Where inference runs | Billing |
|---|---|---|---|
| mode:cloud | Yes | AGI servers call providers through packages/ai/providers/* adapters | One AGI Subscription ledger: reservation, settlement, credits |
| mode:local | No | On the device through a local server (Ollama or LM Studio) via the desktop host bridge; text only, no attachments | None: no usage figures are produced |
| mode:own-key (BYOK) | No | Direct from the client to the user's provider | The user's provider bills them; AGI cloud does not meter it |

- Boundary rule: Local never crosses to AGI cloud; BYOK goes direct to the provider with a visible label; Managed Cloud is the only metered egress and the only path writing to the shared cloud chat store. [requirement] (docs/architecture/trust-boundaries.md is the file named by AGENTS.md; the matrix text read is docs/generated/trust-mode-surface-matrix.md header and the Trust-Mode matrix document that owns these invariants, the first file in docs that carries the heading 'Trust-Mode x Surface Matrix')
- A conversation that already holds a Local turn cannot continue with a cloud model from the web client (`LOCAL_TURN_IN_CLOUD_CHAT`), so nothing local is uploaded. [code] (useChatStream.ts:4194; local-turn.ts:16)
- Local models are free of any paid subscription by requirement; whether a Local chat needs sign-in is a separate question. In the web client the Local branch does not call getAuthToken, but the shell hosting it is signed-in web. [requirement + inferred] (useChatStream.ts:4259-4265)

## Differences between apps

| Surface | Chat path to the server | Local | Own-key (BYOK) | Notes | Basis |
|---|---|---|---|---|---|
| surface:web | useChatStream posts to api:POST /api/llm/v1/chat/completions, SSE parse, replay by cursor, run follow | Code path exists but needs a host bridge (`local_chat_start`); policy says Web has no Local | None | Policy matrix says Web is Cloud only | [code] useChatStream.ts; runtime-client.ts:621; [requirement] trust-mode matrix |
| surface:desktop (public Electron) | Loads the hosted web app, so it runs the same useChatStream | Electron refuses all on-device inference commands (`LOCAL_INFERENCE_COMMANDS`) for chat; local coding sessions use the bundled CLI | No provider key for chat; BYOK only through CLI coding sessions | The Tauri build (internal, retained) uses `CloudRuntime` over the shared unified-chat hook, hitting the same endpoint | [code] apps/desktop/electron/runtime/dispatcher.ts:3235-3244; CloudRuntime.ts:1-40; AGENTS.md section 5 |
| surface:mobile | apps/mobile/services/streaming.ts to the same route; understands `x_run_detached` (the function budget ended the connection, not the run) | Yes, on-device, Local mode | No BYOK | Cloud needs current provider-sharing consent; in Local mode the egress guard blocks managed-cloud hosts apart from account controls | [code] streaming.ts:385-402; [requirement] trust-mode matrix |
| surface:cli | Rust CLI; managed models need a subscription | Yes | Yes | Coding sessions are separate from the chat store; the CLI's own pipeline was not read | [requirement] matrix; [unknown] CLI turn internals |
| surface:vscode | apps/extension-vscode/src/utils/api.ts posts `${endpoint}/chat/completions` with an `agi.vscode.chat.*` idempotency key and a bearer token | Policy yes; harness catalog lists vscode local and BYOK chat as unwired | Policy permits; harness catalog marks it unwired | `endpoint` can differ by configuration, details not read | [code] api.ts:1095-1125; [requirement] docs/generated/trust-mode-surface-matrix.md |
| surface:chrome | Cloud only; managed chat; eligible conversations mirror into the shared store | No | No | Local-first storage; any Local/BYOK turn disqualifies mirroring | [requirement] matrix; [code] apps/extension/src/features/cloud-bridge/freeTrialClient.ts exists |

Same wire, different clients: Desktop (Tauri), Chrome and VS Code reuse packages/ui/unified-chat (`useChat`, `ChatRuntime`), while the web app has its own hook; both parse the same SSE deltas (`x_tool_status`, `x_agent_event`, `x_search_results`, `x_generated_files`). [code] (packages/ui/unified-chat/src/hooks/useChat.ts; CloudRuntime.ts header)

## Failure handling

**Deadlines** (all in apps/web/lib/deadline-policy.ts) [code]

| Name | Value | Meaning |
|---|---|---|
| Function limit (`CHAT_COMPLETIONS_FUNCTION_LIMIT_MS`) | 300 s | Matches route `maxDuration` |
| Teardown reserve | 60 s | Kept for cleanup |
| Tool loop budget / provider stream deadline | 240 s | Limit minus reserve |
| Tool call deadline | 120 s | Per tool, clamped to remaining loop budget (`nestedDeadlineMs`, floor 1 s) |
| Turn first-token budget | 40 s | Whole turn across attempts |
| Provider first-token deadline | 25 s | Per attempt, clamped by what is left of the 40 s |
| Durable stream silence | 150 s | Tool-call deadline plus 30 s margin; silent runs end with code `run_stream_silent`, 'nothing further was charged' |
| Durable stream detach | 240 s | Connection is detached with `x_run_detached` reason `function_budget`; the run continues and the client follows by run id |
| SSE heartbeat | every 2 s | Keeps intermediaries from timing out |

**Provider failures before the first byte**: `startProviderStreamWithinTurnDeadlines` peeks the first chunk. A retryable error is retried on the SAME route with backoff (up to 2 attempts; overload class has its own larger limit; never for auth or context overflow) while the first-token budget has room. If that fails, `failover.next` may rotate to the next planned route, only if the first-token budget is not spent. (lib/provider-deadlines.ts:27-312; route.ts:1284-1325)

**Failover rules** (lib/managed-failover.ts) [code]: rotate on availability classes (connection, server error, overload, capacity off-switch, timeout, rate limit, quota exhausted, empty response, unsupported input) and on a rejected credential (that provider account is skipped). Never rotate on billing exhausted, safety or content-blocked, or aborts. A pinned model may cross providers but is never answered by another model; Auto may change model. Once a provider minted tool-call ids the turn stays on it (from the second step). An unfunded account gets at most one Auto rotation. Rotation happens only before any content reaches the client, so failed-attempt text cannot leak. All attempts share one reservation; settlement is priced by the serving model.

**When no route works**: the reservation is refunded (`refundFailedReservation`, settles a free-trial or finalizes managed usage as failed with zero cost), a failed-turn record is stored (`recordFailedTurn`), and an upstream error response is built with provider-neutral copy. (route.ts:1301-1330; lib/failed-turn-record.ts; lib/upstream-error-copy.ts)

**Errors after streaming began**: the stream cannot change status, so the error is sent as a frame, billing settles as failed (zero), the partial answer is saved as truncated, and the stream errors. (stream-transform.ts:700-760)

**Stop**: closing the request aborts the provider call. For plain streams `cancel()` settles billing as failed-cancelled (billed on delivered text only) and saves the partial answer with `truncated` true. For runs, `stopGeneration` aborts locally and calls the cancel endpoint, then confirms; if not confirmed it shows 'Cloud task has not confirmed it stopped'. The finish reason of a stopped turn is `STOPPED_FINISH_REASON` and it keeps a Continue action. (stream-transform.ts:921-940; useChatStream.ts:5390-5460, 3793-3830)

**Client recovery**: on a dropped connection with a run handle the client replays the durable run; without one it resumes from the persisted turn by cursor; frames carry a sequence envelope, duplicates are skipped, and a gap makes the client wait for cursor replay instead of trusting `[DONE]`. An empty answer with no tool call and no error gets one silent retry (`-retry` idempotency suffix). A 401 or terms/passkey requirement parks the unsent draft and redirects. (useChatStream.ts:3232-3262, 3780-3830, 4440-4460, 4795-4830)

**Other refusals**: 413 payload too large, 400 validation or `secret_detected`, 403 policy/spend/terms, 429 `concurrent_turn_limit_reached`, 503 `user_message_persistence_failed`, `billing_unavailable`, `attachment_load_unavailable`, `mcp_context_unavailable`, project-context failure. (code citations above)

## How it should work

Status labels: [requirement] means a project document states it; [proposed] is this page's suggestion.

- **One metered path**: Cloud is the only mode that reaches the completions route and the AGI Subscription ledger; Local and own-key never route to it silently, and a move from Local to cloud is an explicit fork with consent. [requirement] (AGENTS.md section 6; trust-mode matrix)
- **Routing order**: workspace policy, commercial status, trust mode, harness reachability, lifecycle stage, zero data retention and capabilities admit routes; health, credentials and cost then rank them. An explicit model choice rotates among same-model routes first. [requirement] (docs/architecture/provider-routing.md)
- **Billing follows the model, cost follows the route**: the user is debited the model's official price, the served route's price is recorded as provider cost. [requirement] (same document); implemented in settleStreamBilling [code]
- **Every managed turn survives the connection**: the route header comment says a turn holding a free-tier or managed reservation starts on the durable transport. [requirement-in-code-comment] Today only tool-loop turns do (see Gaps). [proposed] Either make plain chat durable, or correct the comment.
- **Execution boundaries made visible**: the client should show which of Device, AGI servers or an outside provider ran each part of a turn (tool runs on our sandbox, connector calls to outside services, model on a provider). [proposed]
- **Cost as a design constraint**: routing weighs cost and quality; a stronger model is not a default. [requirement] (AGENTS.md section 7)

## Gaps

Implementation status (is it there and connected) is separated from verification (has anyone run it).

**Implementation gaps** [code unless noted]

1. The route's header comment says a managed or free-tier turn starts on the durable Workflow transport 'whatever the tier'. In the code read, the durable attempt sits inside the tool-loop and research branches only; the plain adapter stream and non-stream branches are request-scoped and die with the connection (the server still saves what it had, as truncated). (route.ts:162-196 vs 898-1024, 1239-1345)
2. The web client contains a Local turn path while the policy matrix says Web has no Local. It is only reachable when a host bridge answers `local_chat_start`; the public Electron shell refuses these commands, so the reachable host is the internal Tauri build. (runtime-client.ts:621-646; dispatcher.ts:3235-3244; trust-mode matrix)
3. The harness catalog lists `vscode/byok-chat` and `vscode/local-chat` as unwired and `cli/local-chat` as partial, though policy permits them. (docs/generated/trust-mode-surface-matrix.md)
4. Deep Research is paid-only and its durable path starts only after a plan is approved (`approvedResearchRun`); an unapproved research run uses the request-scoped loop. (route.ts:628-700)
5. Title generation is skipped for free-quota offering models, which keep the truncated title. (persist-message.ts:198)

**Verification gaps** [unknown]

- No project document read records a real end-to-end run of this pipeline. No test, build or app was run for this page, so every statement is from reading code, not execution. Tests exist for failover, first-token deadline, stream parity, memory and persistence (see Implementation map), but their pass state is unknown.
- Real provider behaviour under outage, durable transport breaker behaviour in production, and the 500 ms durable first-event default under load are unverified.

**Documentation maintenance**: the pipeline spans files of 7000 and 8000 lines (request-processor.ts, tool-loop.ts); there is no single maintained architecture page for it before this one. [inferred]

## How to verify

Read-only checks first (what this page did), then runs that someone with permission should do. Nothing below has been executed by this author.

1. Trace a turn by phase names: `CHAT_TURN_PHASE` in lib/turn-phases.ts matches span attributes emitted by `runWithPhaseTimer`, so a trace of `chat.turn` shows auth, turn slot, policy gates, process request, route selection, usage reservation, provider stream, durable start. [code]
2. Failover and deadlines: run test:apps/web/app/api/llm/v1/chat/completions/__tests__/route.managed-failover.test.ts, route.first-token-deadline.test.ts and lib/managed-failover.policy.test.ts through the apps/web package script (not the root vitest; AGENTS.md section 12 warns the versions differ). [requirement]
3. Wire stability: stream-transform.byte-parity, openai-byte-parity and response-builder.golden tests. Persistence: assistant-turn-persistence tests; memory: request-processor.memory.test.ts and turn-context.test.ts.
4. Local boundary: test:apps/web/lib/hooks/useChatStream.local.test.ts and each surface's `trust-boundary.test.ts`; the guard `pnpm check:trust-boundaries`. [requirement] (AGENTS.md section 6)
5. Human check (owner's stated standard is that it works for a person): sign in on a seeded account on a compiled local build, send a plain turn, a tool turn and a stopped turn; confirm in the database that table:web_messages has one assistant row, table:managed_usage_requests shows a finalized row with the served model, and that stopping mid-answer leaves a truncated row and a reduced charge. [proposed] (owner memory notes on local testing; not executed)
6. Deadline math: DEADLINE_HIERARCHY in deadline-policy.ts is the machine-readable parent/child list; a guard or test comparing it to the route's `maxDuration` is [unknown].

## Key facts

| Fact | Basis | Source |
|---|---|---|
| Only Cloud (Managed Cloud) turns reach api:POST /api/llm/v1/chat/completions; Local and BYOK never do. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/connector-tool-session-grants.ts:21`; `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4876`; `apps/web/lib/hooks/useChatStream.ts:4155-4170` |
| The route has maxDuration 300 s; the tool-loop and provider stream budget is 240 s (300 s minus a 60 s teardown reserve). | read in the code | `apps/web/app/api/llm/v1/chat/completions/route.ts:161`; `apps/web/lib/deadline-policy.ts:1-9` |
| The whole turn has a 40 s first-token budget; each provider attempt gets 25 s, clamped to what is left of the 40 s. Each tool call has a 120 s deadline. | read in the code | `apps/web/lib/deadline-policy.ts:11-15`; `apps/web/app/api/llm/v1/chat/completions/lib/provider-deadlines.ts:58-68` |
| Request order in the route: auth gate (rate limit, identity, CSRF, terms, age, subscription), turn slot, policy and spend gates, processRequest, secret gate, provider-start mark, dispatch. | read in the code | `apps/web/app/api/llm/v1/chat/completions/route.ts:396-560, 1475-1512`; `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:139-363` |
| The user message is persisted before any model call; if that fails the route returns 503 user_message_persistence_failed and sends no model request. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4083-4122` |
| Context building (account memory, past chats, project files) runs in resolveInteractiveTurnContext; a loader failure continues without that source, but a project context failure fails closed with no model request. | read in the code | `apps/web/lib/services/turn-context-service.ts:82-250`; `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4236-4272` |
| Memory is off for temporary chats and, on the API surface, only on when memory_enabled is true; past-chat recall is never used on the API surface. | read in the code | `apps/web/lib/services/turn-context-service.ts:92-124` |
| Provider dispatch goes through the ADAPTER_PROVIDERS table to adapters in packages/ai/providers/*; a provider not in the table fails as unsupported-provider and the reservation is refunded. | read in the code | `apps/web/app/api/llm/v1/chat/completions/route.ts:1239, 1348-1358`; `apps/web/app/api/llm/v1/chat/completions/lib/adapter-providers.ts` |
| Failover rotates only before the first byte reaches the client, only on availability-class errors (and credential rejection), never on billing, safety or content-blocked; a pinned model is never answered by a different model; all attempts share one reservation settled at the serving model's price. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts:1-60, 85-160`; `apps/web/app/api/llm/v1/chat/completions/route.ts:1284-1325` |
| Same-route retry happens first: up to 2 attempts (overload class has its own limit), never for auth or context-overflow errors, and only while the 40 s first-token budget has room. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/provider-deadlines.ts:27, 176-240` |
| Tool loop default step budgets are 10 (chat), 100 (AGI Work), 20 (caller tools); exhausting the budget pauses the run on a checkpoint rather than killing it; manual approval saves a signed checkpoint before emitting x_tool_approval_request. | read in the code | `packages/contracts/cloud-contracts/src/tool-call-limits.ts:3-5`; `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:1-40` |
| Tool-loop and research turns start on the durable Workflow transport unless AGI_DURABLE_INITIAL_TURNS is off, the breaker is open, or the first event misses a 500 ms default budget (AGI_DURABLE_FIRST_EVENT_BUDGET_MS); then they fall back to an inline stream with the same wire. Plain chat is always inline. | read in the code | `apps/web/app/api/llm/v1/chat/completions/route.ts:943-1024, 1239-1345`; `apps/web/lib/workflows/durable-initial-turns.ts`; `apps/web/lib/workflows/durable-stream-liveness.ts:11-16` |
| A detached durable stream ends the connection with x_run_detached (reason function_budget) while the run continues; the web client and mobile follow the run by id. | read in the code | `apps/web/lib/workflows/durable-stream-bounds.ts:23-70`; `apps/web/lib/hooks/useChatStream.ts:3507`; `apps/mobile/services/streaming.ts:385-392` |
| Managed usage uses one reservation per turn (table managed_usage_requests) keyed by the Idempotency-Key; settlement bills list price of the serving model and records the served route's price as provider cost; failed turns bill zero; a stopped turn bills on delivered text only. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:6147-6175`; `apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:131-375`; `apps/web/db/neon/0056_managed_usage_request_lifecycle.sql:13` |
| The server saves the assistant row (upsert by client-supplied assistant_message_id) at stream end, marking cancelled or incomplete turns truncated with reason stream_cancelled; temporary conversations are not saved. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.ts:51, 256-480`; `apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts:921-940` |
| The web client also saves its own copy through api:POST /api/chat/conversations/{id}/messages; a server-side edit guard returns a content-changed conflict, and a failed save marks metadataNotSaved. | read in the code | `apps/web/lib/hooks/useChatStream.ts:736-815, 2800-2870`; `packages/contracts/cloud-contracts/src/conversations.ts:16, 454-460` |
| Titles are two-stage: a truncated first-message title is set synchronously by the server; a fire-and-forget utility-model call (6 words, 24 output tokens, via managed route admission, cache and a conversation_title usage lease) replaces it; failures keep the truncated one. | read in the code | `apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts:179-209`; `apps/web/app/api/chat/conversations/[id]/messages/lib/generate-title.ts:1-230` |
| Concurrent managed turns are capped per plan (billing catalog maxConcurrentTurns); over the cap returns 429 concurrent_turn_limit_reached and a limiter outage returns 503 concurrency_limiter_unavailable. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/turn-slot.ts:15-60`; `apps/web/lib/rate-limit.ts:1366-1378`; `packages/contracts/types/src/billing-catalog.ts:529` |
| Local turns are decided from the model id prefix local:, run through a desktop-host bridge command local_chat_start (Ollama or LM Studio), accept text only, and never call the route, reserve compute or persist to the cloud. | read in the code | `packages/contracts/local-runtime/src/inference.ts:1-60`; `apps/web/features/chat/lib/local-turn.ts:80-130`; `apps/web/features/desktop-host/lib/runtime-client.ts:621-646` |
| The public Electron Desktop refuses on-device inference commands for chat; its local coding sessions use the bundled CLI. | read in the code | `apps/desktop/electron/runtime/dispatcher.ts:3235-3244` |
| Own-key (BYOK) is available in CLI by policy, permitted but marked unwired for VS Code in the harness catalog, and absent on Web, Desktop chat, Mobile and Chrome. | stated requirement | `docs/generated/trust-mode-surface-matrix.md`; `apps/web/lib/hooks/useChatStream.ts (no BYOK branch)` |
| A conversation that holds Local turns cannot be continued with a cloud model from the web client, so local content is never uploaded. | read in the code | `apps/web/lib/hooks/useChatStream.ts:4194-4197`; `apps/web/features/chat/lib/local-turn.ts:16` |
| Auth gate: a missing subscription is the Free website plan; a lapsed paid plan is served as Free; an unpaid enterprise plan gets 403 subscription_inactive; terms and adult-eligibility checks apply to session callers. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:279-340` |
| The route comment claims every managed turn starts durable; code shows only tool-loop and research branches try the durable transport. | read in the code | `apps/web/app/api/llm/v1/chat/completions/route.ts:162-196 vs 898-1024` |
| Secret-looking content is blocked (400 secret_detected, reservation refunded) or redacted before dispatch, and the count is returned in a header. | read in the code | `apps/web/app/api/llm/v1/chat/completions/route.ts:483-530` |
| No document read records an executed end-to-end run of this pipeline; this page is from code reading only. | unknown | `no [executed] source in docs read` (not found) |

## Open questions

- Is plain (no-tool) chat meant to run on the durable Workflow transport? The route header says every managed or free-tier turn does; the code only does it for tool-loop and research turns.
- What is the CLI and VS Code Cloud and BYOK turn pipeline? Only the VS Code client call site and the policy matrix were read; CLI Rust internals and the VS Code endpoint configuration were not.
- What does api:POST /api/llm/v1/chat/completions/guest do and which limits apply? The file was not read.
- What is the table name behind the context manifest store (createPostgresContextManifestStore)? Not read.
- How does the free-quota completions route (/api/models/free-quota/completions) differ from the main pipeline in routing, billing and persistence? Not read.
- Should web code that has a Local turn path stay in the hosted web bundle while policy says Web has no Local? The code leaves it reachable only through a host bridge; the product choice is undecided.
- Exact per-plan limits (concurrent turns, attachments per message, connector tools) were not copied; read the billing catalog. Current plan names should be confirmed from the catalog, not from memory notes.
- Whether a local chat requires sign-in on mobile and desktop is a separate, undecided question from payment; not established here.
- Failed-turn records (recordFailedTurn) were read only as a call site; where they are stored and who reads them is unknown.
- No executed verification exists in the documents read; which of the listed tests currently pass is unknown.

## Project documents found out of date

- `apps/web/app/api/llm/v1/chat/completions/route.ts (header comment, lines 162-196; a code comment, not a doc)`: States that a turn holding a free-tier or managed reservation starts on the Workflow transport so it outlives the request, and 'Routes to 10+ LLM providers'. The code says: The durable attempt is made only in the tool-loop branch (and in the approved-research branch). The plain adapter stream and the non-streaming branch run request-scoped. Providers are whatever ADAPTER_PROVIDERS lists. (route.ts:898-1024 and 1239-1345 versus the comment at route.ts:162-196)
- `docs/generated/trust-mode-surface-matrix.md and the trust-mode matrix policy table (Web: Local no)`: Policy says Web has no Local; the web chat hook still contains a full Local turn path (runLocalTurn, local: model ids, desktop-host bridge). The code says: The Local branch exists in useChatStream and runs only where a host bridge answers local_chat_start; the Electron shell refuses it. This is a policy-versus-code tension, not proof the doc is wrong, because the doc says 'allowed, not shipped'. (apps/web/lib/hooks/useChatStream.ts:4155-4170, 4259-4290; apps/web/features/desktop-host/lib/runtime-client.ts:621; apps/desktop/electron/runtime/dispatcher.ts:3235-3244)
