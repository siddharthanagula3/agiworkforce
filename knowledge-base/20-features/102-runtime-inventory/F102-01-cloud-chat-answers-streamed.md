---
id: "F102-01"
type: "feature"
title: "Cloud chat answers, streamed"
aliases: ["Cloud chat", "Streaming gateway", "Chat completions route", "LLM gateway", "Managed chat stream", "Browser application runtime", "Server-rendered web runtime", "Backend API runtime", "S102.01", "S102.02", "S102.03", "S102.04"]
area: "102 Runtime inventory"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S102.01", "S102.02", "S102.03", "S102.04"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-api-and-contracts", "SYS-execution-boundaries", "surface:web", "surface:desktop", "mode:cloud", "table:web_conversations", "table:user_projects", "table:managed_usage_requests", "file:apps/web/app/api/llm/v1/chat/completions/route.ts", "file:apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F102-01 Cloud chat answers, streamed

The web server (Next.js) renders pages, serves the HTTP API, and streams model answers to clients over server-sent events from one long route, sending a keepalive line after 2 seconds of silence. Desktop's chat uses this same Cloud path. Local and own-key chat do not use this route.

Area: [102. Runtime inventory](README.md). Requirement items: [S102.01](../../10-requirements/capabilities/102-runtime-inventory.md#s10201), [S102.02](../../10-requirements/capabilities/102-runtime-inventory.md#s10202), [S102.03](../../10-requirements/capabilities/102-runtime-inventory.md#s10203), [S102.04](../../10-requirements/capabilities/102-runtime-inventory.md#s10204).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Runs the Cloud (managed) side of chat. The web app is a React app in the browser, its pages are rendered by Next.js on the server, its HTTP API is a set of route handlers, and the chat route streams a model answer back as it is written, with a keepalive so proxies do not close the connection.

**Why it exists.** Cloud mode needs one server place that checks the account, plan and quota, picks a model and provider, streams the answer, and records usage. Every Cloud client (web, desktop's hosted window, extensions, CLI cloud mode) can then share one subscription system.

**Who uses it.** Signed-in people chatting in the web app or in the Electron desktop window (which shows the hosted web app); the Chrome extension and other clients that call the same managed route; engineers operating the server.

**Problems it solves**

- A browser cannot hold provider keys, so a server must call the model for Cloud mode.
- Long answers over HTTP need a live one-way feed and a keepalive so idle gaps do not drop the connection.
- A dropped client must be visible to operators (log and failure counter) instead of silently wasting a turn.
- A conversation must not be attached to a project the user does not own.

**Use cases**

- A Premium user types a question in the web chat and watches the answer appear as it is written.
- A user on the Electron desktop app chats; the window is the hosted web app, so the request goes to the same route.
- A user closes the tab mid-answer; the server logs a stream_disconnected event with bytes already sent.
- A user creates a conversation inside a project they own; creating one in another person's or an archived project is refused.

## 2. User experience

**Where to find it**

- Web: the chat box on the signed-in web app (apps/web/app/layout.tsx:114 root layout; the composer is packages/ui/unified-chat/src/components/ChatInput.tsx).
- Desktop (Electron): the same hosted web chat inside the window (apps/desktop/electron/config.ts:17 production origin; main.ts:1328 loads the entry URL).
- Chrome extension: calls the managed route through its cloud client (apps/extension/src/features/computer-use/cloudAgentClient.ts:1-15 imports the managed agent helpers) [inferred: the exact side-panel label was not read].
- Mobile, VS Code, CLI: whether their Cloud mode reaches this exact route was not established (see unknowns).

**Before you start**

- A signed-in account: the route's auth gate uses the Clerk identity helper (apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:6) and also accepts an API key (route.ts:1481-1483).
- A plan or free allowance that admits Cloud chat: Free users go through the free-quota lanes (route.ts:1489-1509); capability 'managed_chat' lists Free-through-Enterprise tiers (packages/contracts/types/src/billing-catalog.ts:350) [inferred from CLOUD_CHAT_TIERS name; list not fully read].
- Network access to the server.

**Screens and controls**

- Message box and send control in ChatInput (packages/ui/unified-chat/src/components/ChatInput.tsx:173 onStop prop; the send button doubles as the stop control, line 1024 comment).
- No separate UI for the heartbeat; it is a transport detail.

**Journey**

1. 1. The person types a message and sends it.
2. 2. The client calls the chat completions route (public alias /v1/chat/completions rewritten to /api/llm/v1/chat/completions, apps/web/lib/api-host-route-contract.ts:3-4).
3. 3. The server checks sign-in, rate limit, terms and subscription, then dispatches the turn (route.ts:1475-1515).
4. 4. The answer streams back as text/event-stream; the person sees words appear.
5. 5. If nothing is written for 2 seconds the server sends a ': keepalive' comment line (sse-heartbeat.ts:6, :29).
6. 6. The stream ends and the answer is saved; leaving the page early drops the connection and the server logs it.

**What the person sees and gets**

- Streamed answer text.
- Response headers such as X-AGI-Resolved-Model, X-Quota-Warning and X-AGI-Tool-Loop (route.ts:1195-1235 area; baseAgentHeaders at route.ts:~905-935).
- On refusal or failure the route returns an error response; the brief describes no automatic retry of a dropped stream.

**Settings**

- Server environment: AGI_DURABLE_INITIAL_TURNS (kill switch for detachable turns, apps/web/lib/workflows/durable-initial-turns.ts:6).
- No per-user setting for the heartbeat was found (none found in the code).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Next.js 16 web app: root layout is an async server component (apps/web/app/layout.tsx:114); Providers.tsx starts with 'use client' (apps/web/app/Providers.tsx:1); a public share page builds metadata on the server (apps/web/app/shared-artifact/[token]/page.tsx:50-58); next ^16.4.5 (apps/web/package.json:148).
- Chat route allows 300 seconds per request (apps/web/app/api/llm/v1/chat/completions/route.ts:161) and is exported through CORS, rate-limit and error wrappers (route.ts:1526).
- Heartbeat wrapper: 2000 ms interval, keepalive comment line, SSE headers with X-Accel-Buffering no (apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts:6-12, :29).
- Client-drop detection: cancel before the source ends records a failure counter 'stream_disconnected' and logs event 'sse_stream_disconnected' with bytesDelivered, elapsedMs and reason (sse-heartbeat.ts:23-26).
- Plain (non-tool) chat is streamed by stream-transform and wrapped with the heartbeat (lib/stream-transform.ts:956-972); an aborted client settles the stream as cancelled and saves the partial answer (stream-transform.ts:737-750).
- Conversation creation checks that a given project belongs to the user, is not archived and not deleted, else returns 'Project not found' (apps/web/app/api/chat/conversations/route.ts:236-250).
- A temporary chat cannot be placed in a project (route.ts:231-233).

**Incomplete**

- The brief gives only one platform status and no per-app status; per-app reach (mobile, VS Code, CLI) is not confirmed (unknowns).
- No retry of a dropped stream is described in the brief; the code path for plain chat has no reattach (not handled in the code for plain request-scoped turns). Detachable turns can be followed through the run journal (see F102-02).

**Present but disconnected or switched off**

- Detachable (durable) turns are switched off by AGI_DURABLE_INITIAL_TURNS being 0, false or off (durable-initial-turns.ts:6-14); then turns run request-scoped and end with the connection.

**Not available**

- Local and own-key (BYOK) chat never reach this route (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4876 comment).
- Desktop (Electron) has no on-device chat: the dispatcher refuses local-inference commands with 'AGI Desktop answers every conversation in the cloud' (apps/desktop/electron/runtime/dispatcher.ts:3236-3244).

## 4. Required behaviour

**Established requirements**

- The web app runs as a client-side React application in the browser. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S102.01)
- Pages are rendered on the server by Next.js server components. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S102.02)
- A backend HTTP API runs as Next.js route handlers. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S102.03)
- Model output streams to clients over SSE with heartbeats from a long-lived route. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S102.04)
- Desktop chat is Cloud only; on-device inference is refused in the Electron shell. (source: (apps/desktop/electron/runtime/dispatcher.ts:3236-3244))

**Acceptance criteria**

1. With a valid sign-in, POST to the chat route returns Content-Type text/event-stream and words arrive before the stream ends.
2. When the model is silent for more than 2 seconds the stream contains a ': keepalive' line.
3. If the client cancels mid-answer, the server logs event sse_stream_disconnected with a bytesDelivered number and increments the stream_disconnected failure counter.
4. Creating a conversation with a projectId of another user's, an archived or a deleted project returns a not-found error and creates no row.
5. A turn with no sign-in is refused before any model call.
6. A Free-plan user's chat is served through the free lanes and never bills a paid reservation [inferred from route.ts:1489-1509].

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Every Cloud client should show a visible provider/mode label so a Local or own-key chat is never silently sent here (AGENTS.md section 6 requires explicit consent for crossing).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add per-app status rows to the brief so reach on mobile, VS Code and CLI is recorded.
- [proposed] Expose the heartbeat interval as configuration if operators need to tune proxies (today it is a constant, sse-heartbeat.ts:6).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Main Cloud chat route; auth, quota, dispatch, SSE response; maxDuration 300 (line 161). |
| service | withSseHeartbeat | `apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts` | Wraps a stream, adds keepalive every 2 s, reports client drops. |
| service | stream-transform | `apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts` | Turns provider stream chunks into the SSE wire; settles billing on abort or error. |
| service | request-processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Validates the request, resolves model, plan gates, reservations. |
| service | auth-gate | `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts` | Sign-in, rate limit, CSRF and subscription check before dispatch. |
| service | adapter-providers | `apps/web/app/api/llm/v1/chat/completions/lib/adapter-providers.ts` | Table of provider adapters the route may dispatch to (anthropic, google, openai, minimax, moonshot seen at lines 127-151). |
| endpoint | POST /api/chat/conversations | `apps/web/app/api/chat/conversations/route.ts` | Creates a conversation; checks project ownership (lines 236-250); POST export line 331. |
| table | web_conversations | `apps/web/app/api/chat/conversations/[id]/code-runs/route.ts` | Conversation rows (queried at line ~82). |
| table | user_projects | `apps/web/app/api/chat/conversations/route.ts` | Project ownership, archive and delete flags read at line ~236. |
| config | API host rewrites | `apps/web/lib/api-host-route-contract.ts` | Maps /v1/chat/completions to the internal route. |
| component | Providers | `apps/web/app/Providers.tsx` | Client-side provider tree (use client). |
| component | RootLayout | `apps/web/app/layout.tsx` | Server-rendered root layout. |
| screen | Shared artifact page | `apps/web/app/shared-artifact/[token]/page.tsx` | Example server-rendered page with server-built metadata. |
| component | ChatInput | `packages/ui/unified-chat/src/components/ChatInput.tsx` | Shared composer: send, stop, Research toggle. |
| config | local inference refusal | `apps/desktop/electron/runtime/dispatcher.ts` | Refuses local-inference commands in the Electron shell (lines 3236-3244, 3358-3365). |
| config | desktop cloud origin | `apps/desktop/electron/config.ts` | Production origin the desktop window loads; header comment says desktop chat has no Local mode. |
| service | free quota lanes | apps/web/app/api/llm/v1/chat/completions/lib/free-lane/runtime-state-service.ts (not found) (not found) | Free-tier serving state imported by the route (route.ts:31) [path inferred from import]. |
| event | sse_stream_disconnected | `apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts` | Log event and stream_disconnected failure counter on client drop. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The browser (or desktop window) sends the message to the chat route. | device | (apps/web/lib/api-host-route-contract.ts:3-4; packages/ui/unified-chat/src/components/ChatInput.tsx:173) |
| The server authenticates, rate-limits, checks terms and subscription, takes a turn slot and dispatches. | our servers | (apps/web/app/api/llm/v1/chat/completions/route.ts:1475-1487) |
| Free users are first tried on free-quota lanes; a refusal may be retried by the fallback lane. | our servers | (route.ts:1489-1509) |
| The request is validated and a provider adapter is chosen from the adapter table; an unlisted provider is an explicit failure. | our servers | (route.ts:~190-195 doc comment; lib/adapter-providers.ts:127-151) |
| The adapter calls the model provider and the answer is converted to SSE chunks. | outside service | (lib/stream-transform.ts:956-972) |
| The stream is wrapped with the heartbeat; a keepalive is enqueued after 2 s of silence; a cancel before the end is logged as a client drop. | our servers | (lib/sse-heartbeat.ts:29, :23-26) |
| Usage is settled (success, failure, or cancelled with the partial answer saved). | our servers | (lib/stream-transform.ts:725-750) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Conversation and message rows, assistant turn snapshot | Neon Postgres (table web_conversations and related) | Yes, it is server data shown on every Cloud client | Temporary chats are purged by a cron (vercel.json lists /api/cron/purge-temporary-chats); other retention not read here |
| Managed usage request and reservation | table managed_usage_requests (settled after the stream) | Server only | unknown |
| Failure counter stream_disconnected and log line | observability metrics and logs | No | unknown |

**Models and providers.** The model is chosen per request by the server from the model catalog and the plan; the adapter table names the providers it can call (anthropic, google, openai, minimax, moonshot visible). The route is provider agnostic by design: an unlisted provider fails explicitly (route.ts doc comment near line 190). Models are not named here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account or API key required (auth-gate.ts:6; route.ts:1481-1483). Desktop signs in through the hosted pages. |
| Permissions | Workspace policy, model policy and spend limits are checked in the turn path [inferred from imports route.ts:1-140]; per-conversation project ownership is checked at conversation creation (conversations/route.ts:236-250). |
| Subscription | Cloud chat is part of the one AGI Subscription system: plan tier read from the subscription at the gate (route.ts:1481-1483); Free users get quota lanes. |
| Limits and metering | Managed usage is reserved before and settled after the stream (stream-transform.ts:725-750); a per-user turn slot limits concurrency (route.ts:1486, withManagedTurnSlot); rate limit wrapper withAdmittedRateLimitHeaders (route.ts:1526). Exact numbers: unknown. |
| Feature flags | AGI_DURABLE_INITIAL_TURNS controls detachable turns (durable-initial-turns.ts:6). Heartbeat has no flag. |
| Model compatibility | Any model whose provider is in the adapter table; tools and research depend on model capabilities (request-processor.ts:60 imports modelSupportsResearch). |
| Provider restrictions | Only providers listed in ADAPTER_PROVIDERS (adapter-providers.ts:127-151 and beyond). |
| Local mode | Local mode and own-key never reach this route (request-processor.ts:4876). In the Electron desktop, on-device inference commands are refused (dispatcher.ts:3236-3244), so desktop chat is Cloud only today. This conflicts with the stated requirement that desktop local inference be free; see gaps. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading / first token | A first-token deadline test exists; the client sees keepalive lines while waiting. | (apps/web/app/api/llm/v1/chat/completions/__tests__/route.first-token-deadline.test.ts; sse-heartbeat.ts:29) |
| Client leaves mid-answer (plain chat) | Cancel is logged; the provider call is aborted through request.signal; partial answer is saved and billing settled as cancelled. | (lib/stream-transform.ts:725-750; sse-heartbeat.ts:23-26) |
| Provider error mid-stream | An error event is presented and billing is settled as failed. | (lib/stream-transform.ts:~800-830 event llm_stream_error_mid_stream) |
| Provider failover | A managed failover plan exists with tests. | (apps/web/app/api/llm/v1/chat/completions/__tests__/route.managed-failover.test.ts) |
| Project not owned / archived / deleted | Not found error, no conversation created. | (apps/web/app/api/chat/conversations/route.ts:236-250) |
| Offline / reconnect | not handled in the code for plain chat: no reattach found; detachable turns use the run journal (F102-02). | (searched route.ts and stream-transform.ts) |
| Accessibility | unknown: no accessibility work on the streaming display was read. | not read |
| App difference | Desktop is the hosted web app in a window; only the shell differs (apps/desktop/electron/main.ts:1103-1115 webPreferences). | (apps/desktop/electron/main.ts:1103-1115) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.test.ts`: Heartbeat wrapper and SSE headers (header constants and interval imported at line 2).
- `apps/web/app/api/llm/v1/chat/completions/__tests__/route.first-token-deadline.test.ts`: First-token deadline behaviour of the route.
- `apps/web/app/api/llm/v1/chat/completions/__tests__/route.free-quota-first.test.ts`: Free-quota-first lane.
- `apps/web/app/api/llm/v1/chat/completions/__tests__/route.free-quota-fallback.test.ts`: Free-quota fallback lane.
- `apps/web/app/api/llm/v1/chat/completions/__tests__/route.managed-failover.test.ts`: Managed provider failover.
- `apps/web/app/api/llm/v1/chat/completions/__tests__/stream-transform.upstream-error.test.ts`: Upstream provider errors during streaming.
- `apps/web/app/api/llm/v1/chat/completions/__tests__/stream-transform.byte-parity.test.ts`: Wire byte parity of the stream.
- `apps/web/app/api/llm/v1/chat/completions/__tests__/auth-gate-free-surfaces.test.ts`: Auth gate on Free surfaces.
- `apps/web/app/api/chat/conversations/route.organization-scope.test.ts`: Conversation creation scoped to workspace.

**Test scenarios**

- **Stream with keepalive**
  1. Sign in on web as a paid user.
  2. Send a prompt to a slow model.
  3. Watch the network panel for the event stream.
  - Expected: Words stream in; during pauses over 2 seconds a ': keepalive' line appears.
- **Client drop**
  1. Start a long answer.
  2. Close the tab mid-answer.
  3. Search server logs for sse_stream_disconnected.
  - Expected: One warn log with bytesDelivered greater than 0 and the stream_disconnected failure counter incremented; the partial answer is saved.
- **Project guard**
  1. Call POST /api/chat/conversations with a projectId owned by another user.
  2. Repeat with an archived project of your own.
  - Expected: Both return not found; no conversation row is created.
- **Desktop refuses local inference**
  1. Open the Electron desktop app.
  2. Invoke a local-inference runtime command through the bridge.
  - Expected: Failure 'unsupported-platform' with the message that desktop answers every conversation in the cloud.
- **Kill switch**
  1. Set AGI_DURABLE_INITIAL_TURNS to 0 on a test deployment.
  2. Send a tool-using turn and close the tab.
  - Expected: The turn runs request-scoped and ends with the connection; a warn log names the kill switch.

**Where to look when it fails**

- Log events: sse_stream_disconnected, llm_stream_error_mid_stream, llm_stream_threw_mid_stream, llm_ttft_slo_breach.
- Failure counter: stream_disconnected.
- Tables: web_conversations, managed_usage_requests, cloud_agent_runs.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Desktop (Electron) has no local inference: the dispatcher refuses it.** Affects: Desktop users who expect free on-device chat; requirement says local inference is free of any subscription.. Evidence: (apps/desktop/electron/runtime/dispatcher.ts:3236-3244; apps/desktop/electron/config.ts:1-12). Work needed: Product decision, then a local runtime path in the Electron shell with explicit Local label; or record the decision as intended in docs/decisions.
- **No reattach for plain request-scoped chat after a dropped connection.** Affects: All Cloud clients on plain chat.. Evidence: (lib/stream-transform.ts:725-750 settles and ends the turn). Work needed: Route plain turns through the run journal, or document the limitation.
- **Per-app reach for mobile, VS Code and CLI is not recorded.** Affects: Knowledge base completeness.. Evidence: (brief S102.04 gives platform status only). Work needed: Read each client and record whether it calls this route.
- **Heartbeat interval is a constant, not configuration.** Affects: Operators behind unusual proxies.. Evidence: (sse-heartbeat.ts:6). Work needed: Optional: move to configuration (AGENTS.md section 8 says limits are configuration).

**Depends on**

- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-api-and-contracts
- SYS-execution-boundaries
- surface:web
- surface:desktop
- mode:cloud
- table:web_conversations
- table:user_projects
- table:managed_usage_requests
- file:apps/web/app/api/llm/v1/chat/completions/route.ts
- file:apps/web/app/api/llm/v1/chat/completions/lib/sse-heartbeat.ts

## Unknown

- Whether the mobile app calls this route directly and with what label (no call to /llm/v1 found in apps/mobile/src or apps/mobile/app).
- Whether the VS Code extension and the CLI Cloud mode call this managed route or only user-configured endpoints (extension-vscode/src/utils/api.ts:1115 posts to a configured endpoint).
- Exact rate limits and turn-slot numbers.
- Visible label of the stop control and the exact label for the chat entry on each app.
- Whether stream-transform.ts:796 (cited by the brief) is the line named in the brief; not opened at that line.
