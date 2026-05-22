# M1 — CLI / Print / Launchers Deep Dive

**Scope:** `~/Desktop/reference/src/cli/` (all 20 files: `print.ts` + 4 root + 6 handlers + 7 transports + 2 sub-utils) plus `~/Desktop/reference/src/{dialogLaunchers.tsx, replLauncher.tsx, interactiveHelpers.tsx, ink.ts, projectOnboardingState.ts}`. Total = ~12,570 LOC. Cited file:line throughout.

**TL;DR.** This subtree is the _headless / SDK / non-interactive_ spine of Claude Code. `print.ts` is a 5,594-line driver that spawns the same agent loop as the REPL but talks to its caller over an NDJSON-on-stdio control protocol with 30+ control-request subtypes, MCP fan-out, OAuth-over-stdio, prompt suggestions, file rewinds, and remote-control bridge handoff. The `cli/transports/` family (WS / SSE / Hybrid / CCR-v2) implements the wire to claude.ai's session-ingress so a `-p` worker can be driven from a browser. `cli/handlers/` are the lazy-loaded `claude {auth, agents, mcp, plugin, doctor, install, setup-token, auto-mode}` subcommand bodies — the `main.tsx` Commander dispatcher only imports them when invoked. The root-level `dialogLaunchers.tsx` / `replLauncher.tsx` / `interactiveHelpers.tsx` / `ink.ts` quartet is the "wrap-Ink-in-ThemeProvider, mount one screen, await `done`, gracefulShutdown" plumbing — boring scaffolding, but it's the only place trust-dialog sequencing and the GrowthBook trust→reset→reinit dance is centralised.

---

## 1. `cli/print.ts` (5,594 LOC) — the headless driver

### 1.1 Mission

`runHeadless` (exported at `print.ts:455`) is the entry point invoked by `main.tsx` whenever the CLI runs in `--print` (`-p`), `--output-format json|stream-json`, `--sdk-url`, or "stdin-piped" mode. It is the same `ask()` agentic loop the REPL drives, but everything that's a React Ink component in the REPL is replaced by an NDJSON message on stdin/stdout. There is **no UI** in print mode — only a machine-parseable control protocol.

### 1.2 Massive import surface (`print.ts:1-355`)

The module imports from ~140 sibling modules. Notable structural categories:

- **Bootstrap state** (`print.ts:283-296`): `getSessionId`, `setMainLoopModelOverride`, `setMainThreadAgentType`, `getAllowedChannels`, `setAllowedChannels` — these are the few pieces of cross-module mutable state the headless mode mutates.
- **Sandbox** (`print.ts:312`): `SandboxManager.getSandboxUnavailableReason()` and `isSandboxRequired()` — surfaces a hard-error refuse-to-start when `sandbox.failIfUnavailable` is set and deps are missing (`print.ts:601-625`). Soft-warns otherwise.
- **MCP** (`print.ts:217-251`): every MCP plumbing call site, plus channel notifications (`gateChannelServer`, `wrapChannelMessage`, `findChannelEntry`).
- **Conditional dynamic imports** (`print.ts:357-377`): four feature-gated modules (`coordinatorMode`, `proactive`, `cronScheduler`, `cronJitterConfig`, `extractMemories`) loaded via `feature('FOO') ? require(...) : null`. Build-time dead-code elimination is supposed to eliminate them on external builds. **This is what tree-shaking looks like in this codebase.**
- **Anthropic SDK type** (`print.ts:300`): `ContentBlockParam` from `@anthropic-ai/sdk/resources/messages.mjs` — shows the user-prompt shape is hardcoded to Anthropic's content-block schema.

### 1.3 `runHeadless` options (`print.ts:455-493`)

The options bag enumerates every CLI surface flag that affects headless behavior. Highlights:

- `outputFormat: 'text' | 'json' | 'stream-json'` (`:468`) — switches the final-message renderer at `:917-957`.
- `jsonSchema` (`:469`) — forces structured output via a synthetic `SyntheticOutputTool` (`print.ts:203, 1492-1497`).
- `permissionPromptToolName` (`:470`) — name of an MCP tool to call instead of an interactive permission prompt; if `'stdio'` is passed, delegates to `structuredIO.createCanUseTool()` which writes a `can_use_tool` control_request (`print.ts:803-805, 4273-4275`).
- `thinkingConfig` (`:472`) — extended-thinking budget; `set_max_thinking_tokens` control message at `:2945-2956` mutates this live.
- `maxTurns` / `maxBudgetUsd` / `taskBudget` (`:473-475`) — hard stops that produce `error_max_turns` / `error_max_budget_usd` result subtypes (`:947-955`).
- `systemPrompt` / `appendSystemPrompt` (`:476-477`) — the two flavors of `--system-prompt[-file]`. Either can also arrive over stdin via the `initialize` control_request (`print.ts:4370-4378`) which is how the SDK avoids `ARG_MAX` limits on long prompts.
- `userSpecifiedModel` / `fallbackModel` (`:478-479`) — `--model` and `--fallback-model`. Lookup is dynamic: the FAST_STATUS / fast-mode picker at `:1194-1219` resolves capability flags (`supportsEffort`, `supportsAdaptiveThinking`, `supportsFastMode`, `supportsAutoMode`).
- `teleport` (`:480`) — Anthropic-internal feature; resolves a remote session by URL.
- `sdkUrl` (`:481`) — when set, returns `RemoteIO` instead of `StructuredIO` (`print.ts:5230-5232`).
- `replayUserMessages` (`:482`), `includePartialMessages` (`:483`) — SDK consumer opt-ins for echo/streaming.
- `forkSession` (`:484`), `rewindFiles` (`:485`) — lifecycle ops; `--rewind-files` is a standalone op at `:736-771` that restores file history then exits.
- `setupTrigger?: 'init' | 'maintenance'` (`:489`) — fires `processSetupHooks(...)` at `:677` which runs user hooks **before** the first turn.

### 1.4 Initial sequence (`print.ts:494-704`)

In order:

1. **`USER_TYPE === 'ant'` early-exit guard** (`:494-503`) — `CLAUDE_CODE_EXIT_AFTER_FIRST_RENDER` cold-start benchmark for internal CI. Returns "Startup time: Nms" on stderr and `process.exit(0)`.
2. **User-settings download** (`:510-515`) — fired in parallel with MCP setup if remote-managed; `downloadUserSettings()` is memoized so the later `installPluginsAndApplyMcpInBackground` (`:1709`) joins the same in-flight promise.
3. **Settings change detector subscribe** (`:520-532`) — applies live-pushed managed-settings updates; sets `appState.fastMode` denormalised flag.
4. **Proactive activation fallback** (`:538-545`) — if env injected `CLAUDE_CODE_PROACTIVE` after argv parse, activate proactive here.
5. **Bun GC tick** (`:548-551`) — `setInterval(Bun.gc, 1000).unref()` — every second when running under Bun. Foot-gun for memory ceilings on long-lived headless sessions.
6. **Headless profiler** (`:554-555`) — `headlessProfilerStartTurn` + `headlessProfilerCheckpoint`. Used at ~12 checkpoints throughout to log latency phases.
7. **Grove qualification check** (`:558-560`) — non-interactive consumers go through `checkGroveForNonInteractive()` which can short-circuit the run for policy reasons.
8. **GrowthBook init** (`:565`) — feature flags loaded from disk cache + remote.
9. **Argument validation** (`:567-585`) — `--resume-session-at requires --resume`, `--rewind-files requires --resume`, `--rewind-files` cannot have a prompt.
10. **structuredIO selection** (`:587`) — `getStructuredIO()` at `:5199-5233` returns `RemoteIO` if `sdkUrl` is set, else `StructuredIO`. If the prompt is a plain string it's wrapped in an `SDKUserMessage` and turned into a single-element `fromArray` async iterable.
11. **`installStreamJsonStdoutGuard()`** (`:594-596`) — diverts stray `console.log` lines to stderr when emitting NDJSON, so a debug print can't break the parser.
12. **Sandbox init** (`:601-626`) — wired with `structuredIO.createSandboxAskCallback()` so sandbox network permissions pop up as `can_use_tool` control_requests with the synthetic tool name `SandboxNetworkAccess` (`structuredIO.ts:62`).
13. **Hook event handler registration** (`:628-674`) — when `outputFormat === 'stream-json' && verbose`, every hook event (`started`/`progress`/`response`) emits a typed `system.subtype: 'hook_*'` SDK event with full stdout/stderr/exit_code captured.
14. **`processSetupHooks`** (`:676-678`) — fires user setup hooks if `setupTrigger` is set.
15. **`loadInitialMessages`** (`:686-695`) — handles `--continue`, `--teleport`, `--resume`, falls through to `processSessionStartHooks('startup')`. See §1.10 below.
16. **Session-start hook prepended user message** (`:702-705`) — hooks can emit a synthetic first user prompt for orchestrator sessions where stdin is empty.
17. **Agent restoration** (`:709-727`) — re-applies the resumed session's agent (`saveAgentSetting`, `getMainThreadAgentType`).
18. **Rewind-files standalone path** (`:736-771`) — `handleRewindFiles` (file-history snapshot replay) and exit cleanly.

### 1.5 The agentic streaming loop (`print.ts:863-915`)

The classic for-await over `runHeadlessStreaming` (`:976-4143`):

```ts
for await (const message of runHeadlessStreaming(...)) {
  if (transformToStreamlined) { ... }                    // CLAUDE_CODE_STREAMLINED_OUTPUT
  else if (outputFormat === 'stream-json' && verbose) {
    await structuredIO.write(message)                    // ALL events
  }
  // accumulate `messages[]` only when needsFullArray (json+verbose)
  if (filtered) lastMessage = message
}
```

The filter at `:892-908` excludes `control_response`, `control_request`, `control_cancel_request`, SDK-only system events (`session_state_changed`, `task_notification`, `task_started`, `task_progress`, `post_turn_summary`), `stream_event`, `keep_alive`, `streamlined_*`, `prompt_suggestion`. Whatever survives populates `lastMessage`, which becomes the final result. This is the **central design pattern** of stream-json: every event is fanned to stdout when verbose, but only the _result_ type lands in plain-text `--print` output.

### 1.6 Final output rendering (`print.ts:917-957`)

Three switches by `outputFormat`:

- `json` + `verbose`: `writeToStdout(jsonStringify(messages) + '\n')` — entire transcript array.
- `json` (not verbose): just the result message.
- `stream-json`: already streamed above.
- default (text): switches on `lastMessage.subtype`: `success` writes `result` to stdout; otherwise an error string keyed by `error_during_execution`, `error_max_turns`, `error_max_budget_usd`, `error_max_structured_output_retries`.

`gracefulShutdownSync(lastMessage?.is_error ? 1 : 0)` at `:971-973`. Exit code is determined entirely by the final result block.

### 1.7 `runHeadlessStreaming` — the inner generator (`print.ts:976-4143`)

This is the heart. Some 3,000 lines. Key design moves:

**(a) Outbound queue is `structuredIO.outbound`** (`print.ts:1022`). The generator never yields directly — it enqueues into `outbound` (a `Stream<StdoutMessage>`) and the IO layer drains it FIFO. This guarantees ordering across multiple producers (control responses, ask() results, status changes, prompt suggestions, hook events).

**(b) SIGINT handler** (`:1027-1034`) calls `abortController.abort()` then `gracefulShutdown(0)`. There's also a SIGTERM-driven diagnostics dumper at `:1038-1050` that captures `run_active`, `run_phase`, `worker_status`, `internal_events_pending`, and BG-task counts to the diag log — for healthsweeps to identify wedged sessions without parsing transcripts.

**(c) Permission-mode change listener** (`:1060-1079`) wires `setPermissionModeChangedListener` so any code path that mutates `toolPermissionContext.mode` (Shift+Tab, ExitPlanMode, `/plan`, rewind, `set_permission_mode`, query loop, stop_task) emits a `system.subtype: 'status'` SDK event.

**(d) Prompt suggestion state machine** (`:1082-1108`) — push-model prompt suggestions tracked per turn, accepted/rejected via `logSuggestionOutcome`/`logSuggestionSuppressed`. Rate-limit listener at `:1129-1140` for the parallel rate-limit-event channel.

**(e) MCP elicitation** (`:1263-1387`) — in print mode, MCP `ElicitRequest` messages flow through `structuredIO.handleElicitation` which sends a control_request to the SDK consumer. Hook handlers run first and can short-circuit; the result (`accept`/`decline`/`cancel`) is returned to the MCP server. Channel-completion notifications (`ElicitationCompleteNotificationSchema`) are forwarded to consumers as `system.subtype: 'elicitation_complete'`.

**(f) Dynamic SDK MCP setup** (`:1389-1461`) — `updateSdkMcp` called every turn idempotently. Diffs `currentServerNames` vs `connectedServerNames`, with extra checks for `pending` and `failed` clients (handshake retries). Critical fix in code comment: "a client that lands in 'failed' (e.g. handshake timeout on a WS reconnect race) stays failed forever — its name satisfies the connectedServerNames diff but it contributes zero tools."

**(g) Bridge replay** (`:1505-1531`) — when `remote_control` is enabled (claude.ai is driving the session), `bridgeHandle.writeMessages(...)` forwards mutableMessages incrementally so the browser stays alive during permission waits. The `bridgeLastForwardedIndex` cursor avoids O(n) rescans.

**(h) MCP server-set serialization** (`:1536-1608`) — `applyMcpServerChanges` serializes via a chained promise to prevent races between concurrent `mcp_set_servers` and background plugin install.

**(i) Plugin hot-reload** (`:1748-1829`) — on plugin install completion, `refreshPluginState()` clears all caches, reloads commands/agents/hooks, preserves SDK-injected agents (those with `source === 'flagSettings'`).

**(j) Skill change subscription** (`:1824-1829`) — `skillChangeDetector` triggers `clearCommandsCache` + `getCommands()` reload.

**(k) Proactive tick scheduler** (`:1833-1856`) — when proactive mode is on and the queue is empty, `setTimeout(0)` enqueues a synthetic `<TICK>` prompt at priority `'later'` with `isMeta: true` and `WORKLOAD_CRON`.

**(l) Command-queue interrupt** (`:1859-1863`) — any `'now'` priority message aborts the current operation.

**(m) `run()` driver** (`:1865-2681`) — locked via `running` flag (re-entrant returns immediately). Drains command queue, batches consecutive prompt-mode commands with matching workload (`canBatchWith`), feeds `ask()`, fans all events to outbound. Holds back result if BG agents are still running (`heldBackResult` at `:1019, 2222-2235`). Polls 100 ms until BG agents complete. After result, runs file-persistence (`:2256-2272`), prompt-suggestion generation (`:2275-2358`), profiler logging.

**(n) Teammate inbox poll** (`:2497-2635`) — when team-lead, polls `teammateMailbox` every 500 ms while teammates are alive; processes `shutdown_approved` messages by removing teammates from the team file and unassigning their tasks. Mirrors `useInboxPoller` in interactive REPL.

**(o) Shutdown injection** (`:2615-2629, 2659-2666`) — when stdin closes with active teammates, injects the `SHUTDOWN_TEAM_PROMPT` constant (`:379-391`) so the agent must shut down its team before responding.

**(p) UDS inbox** (`:2685-2694`) — `feature('UDS_INBOX')` opens a Unix-domain-socket listener. When a message arrives via UDS, it kicks `run()`. Useful for IPC from sibling processes.

**(q) Cron scheduler** (`:2702-2734`) — when `feature('AGENT_TRIGGERS')` and `isKairosCronEnabled()`, runs `scheduled_tasks.json` cron jobs in headless mode. Fired prompts enqueue + kick `run()` directly. Workload tag `WORKLOAD_CRON` threads through to the billing-header attribution.

### 1.8 Control-request handlers (`print.ts:2813-4029`)

A massive `if/else if` chain inside the stdin reader IIFE. Every subtype:

| Subtype                                                      | Lines        | What it does                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------ | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `interrupt`                                                  | `:2831-2849` | Aborts in-flight request + suggestion gen. Bumps `escapeCount` attribution.                                                                                                                                                                                            |
| `end_session`                                                | `:2850-2862` | Aborts + breaks the for-await, drains, cleans up.                                                                                                                                                                                                                      |
| `initialize`                                                 | `:2863-2917` | Registers SDK MCP servers, applies `systemPrompt`/`appendSystemPrompt`/`agents`/`hooks`/`jsonSchema` from stdin (avoids ARG_MAX). Returns commands+agents+models+account+pid.                                                                                          |
| `set_permission_mode`                                        | `:2918-2932` | Validates and switches mode (gates auto / bypassPermissions).                                                                                                                                                                                                          |
| `set_model`                                                  | `:2933-2944` | Live model switch + breadcrumb injection (`createModelSwitchBreadcrumbs`).                                                                                                                                                                                             |
| `set_max_thinking_tokens`                                    | `:2945-2956` | Mutates `options.thinkingConfig` in place.                                                                                                                                                                                                                             |
| `mcp_status`                                                 | `:2957-2960` | Returns `buildMcpServerStatuses()` — full client+config+tools+capabilities table.                                                                                                                                                                                      |
| `get_context_usage`                                          | `:2961-2978` | Calls `collectContextData()` from `commands/context/context-noninteractive.js`.                                                                                                                                                                                        |
| `mcp_message`                                                | `:2979-2994` | Forwards a JSON-RPC message to an SDK MCP server's transport.onmessage.                                                                                                                                                                                                |
| `rewind_files`                                               | `:2995-3010` | Calls `handleRewindFiles` (`:4520`) — file history rewind, dry-run supported.                                                                                                                                                                                          |
| `cancel_async_message`                                       | `:3011-3017` | Removes queued commands by UUID.                                                                                                                                                                                                                                       |
| `seed_read_state`                                            | `:3017-3054` | Pre-seeds the readFileState cache from a client-supplied path+mtime+content. Strips BOM, normalizes CRLF. Mtime check prevents seeding stale snapshots.                                                                                                                |
| `mcp_set_servers`                                            | `:3055-3064` | Connect/disconnect MCP servers via `applyMcpServerChanges`.                                                                                                                                                                                                            |
| `reload_plugins`                                             | `:3065-3132` | Re-reads user settings, refreshes plugins, returns commands+agents+plugins+mcpServers.                                                                                                                                                                                 |
| `mcp_reconnect`                                              | `:3133-3205` | Disconnects + reconnects a single server, updates `dynamicMcpState` + `appState.mcp`.                                                                                                                                                                                  |
| `mcp_toggle`                                                 | `:3206-3296` | Persistent enable/disable of a server (writes to settings + reconnects).                                                                                                                                                                                               |
| `channel_enable`                                             | `:3297-3309` | IDE-triggered channel registration. Calls `handleChannelEnable` (`:4662`).                                                                                                                                                                                             |
| `mcp_authenticate`                                           | `:3310-3462` | Starts MCP OAuth flow. Handles automatic redirect + manual callback paths. Tracks per-server with `activeOAuthFlows` map.                                                                                                                                              |
| `mcp_oauth_callback_url`                                     | `:3463-3513` | Submits user-pasted callback URL. Validates `code` or `error` param presence.                                                                                                                                                                                          |
| `claude_authenticate`                                        | `:3514-3607` | Anthropic OAuth over the control channel. Hands back `manualUrl` + `automaticUrl`; cleans up prior flows; awaits `installOAuthTokens` (clears caches, returns to caller).                                                                                              |
| `claude_oauth_callback` / `claude_oauth_wait_for_completion` | `:3608-3650` | Manual auth code injection + result delivery.                                                                                                                                                                                                                          |
| `mcp_clear_auth`                                             | `:3651-3698` | Revokes server tokens + reconnects.                                                                                                                                                                                                                                    |
| `apply_flag_settings`                                        | `:3699-3755` | Live merge of flagSettings, with model-change detection + breadcrumb injection.                                                                                                                                                                                        |
| `get_settings`                                               | `:3756-3771` | Returns `getSettingsWithSources()` + applied model+effort.                                                                                                                                                                                                             |
| `stop_task`                                                  | `:3772-3782` | Stops a background task by ID.                                                                                                                                                                                                                                         |
| `generate_session_title`                                     | `:3783-3814` | Fire-and-forget Haiku call → persisted via `saveAiGeneratedTitle`.                                                                                                                                                                                                     |
| `side_question`                                              | `:3815-3874` | Fire-and-forget side-quest fork using `runSideQuestion`. Prefers cache-safe params from last turn for cache hits.                                                                                                                                                      |
| `set_proactive`                                              | `:3875-3891` | Toggles proactive mode.                                                                                                                                                                                                                                                |
| `remote_control`                                             | `:3892-4020` | Initializes/tears down `replBridge`. Wires inbound callbacks (onInboundMessage → enqueue, onPermissionResponse → injectControlResponse, onInterrupt → abort, onSetModel, onSetMaxThinkingTokens, onStateChange). Returns `session_url`/`connect_url`/`environment_id`. |

This is the **complete SDK control protocol**. Every interactive feature in the REPL has a control-request analogue here.

### 1.9 User-message ingestion (`print.ts:4039-4123`)

After all control handling, `message.type === 'user'` falls through to:

- Duplicate check via `doesMessageExistInSession` + `receivedMessageUuids` (10K LRU at `:394`).
- Replay-mode acknowledgement if `replayUserMessages`.
- `enqueue` with `mode: 'prompt'`, `value: resolveAndPrepend(message, content)` (which handles `file_attachments`).
- Attribution snapshot (`incrementPromptCount`, `recordAttributionSnapshot`) when `feature('COMMIT_ATTRIBUTION')`.
- `void run()` to kick the loop.

### 1.10 `loadInitialMessages` (`print.ts:4893-5197`)

Three paths, each with full restoration semantics:

- **`--continue`** (`:4908-4986`): Loads most-recent session via `loadConversationForResume(undefined, undefined)`. Switches to its session ID, resets file pointer, restores state from log, restores metadata. Coordinator-mode-aware (matches resumed session's mode + refreshes agents).
- **`--teleport`** (`:4988-5025`): Anthropic-internal. Validates git state, calls `teleportResumeCodeSession` + `checkOutTeleportedSessionBranch`, processes messages for teleport resume.
- **`--resume <id|url|jsonl>`** (`:5028-5188`): Validates UUID via `parseSessionIdentifier`. Hydrates from CCR v2 internal events if `CLAUDE_CODE_USE_CCR_V2`, else hydrates from session ingress if `ENABLE_SESSION_PERSISTENCE`. Loads conversation. Handles `--resume-session-at <message-uuid>` slicing.

Falls through to `processSessionStartHooks('startup')` which can emit an initial user message (`:5190-5197`).

### 1.11 Permission-prompt-tool plumbing (`print.ts:4145-4334`)

`createCanUseToolWithPermissionPrompt` (`:4149-4263`) wraps an MCP tool as a `CanUseToolFn`. It:

1. Runs `hasPermissionsToUseTool` first (rules / mode).
2. If indeterminate, races `permissionPromptTool.call(...)` against `combinedSignal.aborted`.
3. On abort, returns `'deny'` with reason `permissionPromptTool`.
4. Validates the tool returned a single text-block with parseable JSON.
5. Runs through `permissionPromptToolResultToPermissionDecision` with `permissionToolOutputSchema`.

`getCanUseToolFn` (`:4267-4334`) is the dispatcher: `'stdio'` → `structuredIO.createCanUseTool` (interactive consumer), `undefined` → no-op (rules-only), else lazy-resolve the named MCP tool. The lazy resolution at `:4296-4324` is critical: MCP servers connect incrementally in print mode, so the tool may not be in `appState` at construction time.

### 1.12 `handleInitializeRequest` (`print.ts:4336-4518`)

Returns the canonical `SDKControlInitializeResponse`:

- `commands`: filtered to `userInvocable !== false`.
- `agents`: with `model: 'inherit'` normalized to `undefined`.
- `output_style` + `available_output_styles`: from `getAllOutputStyles(getCwd())`.
- `models`: the `modelInfos` array with capability flags.
- `account`: email/org/subscriptionType/tokenSource/apiKeySource/apiProvider.
- `pid`: `process.pid`.
- `fast_mode_state` (conditional).

Hooks are registered if provided in stdin. The function is idempotent — second call returns `{subtype: 'error', error: 'Already initialized'}` with current `pending_permission_requests`.

### 1.13 `handleMcpSetServers` + `reconcileMcpServers` (`print.ts:5353-5594`)

The two functions implement the public, exported MCP-set-servers API. Three notable design choices:

1. **Enterprise policy enforcement** (`:5364-5369`) — `filterMcpServersByPolicy(servers)` runs the `--mcp-config` filter so SDK-injected servers can't bypass `allowedMcpServers`/`deniedMcpServers`. Blocked servers go into `response.errors`.
2. **SDK vs process split** (`:5371-5381`) — SDK-typed servers are placeholder-tracked; process-typed go through `connectToServer` + `fetchToolsForClient`.
3. **AppState sync** (`:5557-5588`) — removes stale dynamic tools/clients from `prev.mcp`, splices in new ones. So subagents (which read appState) see updates immediately.

---

## 2. `cli/exit.ts` (31 LOC)

Two helpers — `cliError(msg)` and `cliOk(msg)` — that consolidate the "print + exit" pattern repeated ~60 times across MCP/plugin handlers. Returns `never` so TypeScript narrows control flow without explicit `return`s. `cliError` writes to `console.error`; `cliOk` writes to `process.stdout.write`. Eslint comment notes spies-on-mock test compat (`exit.ts:11-16`).

---

## 3. `cli/ndjsonSafeStringify.ts` (32 LOC)

Single concern: `JSON.stringify` emits U+2028/U+2029 raw, but JavaScript line-terminator semantics treat both as newlines. Any receiver that splits NDJSON on newline would cut JSON mid-string. The function escapes both as ` `/` `. `ndjsonSafeStringify.ts:14-19` comment explicitly cites "ECMA-262 §11.3" and "ES2019 Subsume JSON". Used everywhere `RemoteIO.write`/`StructuredIO.write` serialize.

---

## 4. `cli/structuredIO.ts` (859 LOC)

The base class for stdio control. Wraps an `AsyncIterable<string>` (stdin) and produces a `Stream<StdoutMessage>` outbound queue. Critical pieces:

- **`structuredInput`** (`:136`): An AsyncGenerator that splits stdin on `\n`, parses each line via `processLine`, yields `StdinMessage | SDKMessage`. Handles `prependedLines` injection (`:204-213, 222-227`) so an out-of-band synthetic user message can be queued before the next read.
- **`pendingRequests` Map** (`:137`): Keyed by `request_id`, holds resolve/reject/schema/request. `sendRequest` (`:469-531`) writes a `control_request` to outbound and registers a pending entry; the `processLine` `control_response` branch (`:362-430`) resolves/rejects.
- **`resolvedToolUseIds` Set** (`:155`): MAX 1000. Tracks which tool_use IDs have been resolved through the normal permission flow. Duplicate `control_response` deliveries (e.g. from WebSocket reconnects) are caught by `:386-394` and ignored — without this, the orphan handler would push duplicate assistant messages into the conversation, causing API 400 "tool_use ids must be unique" errors.
- **`update_environment_variables`** (`:348-361`): Live-applies env-var updates from stdin to `process.env`. Used by bridge session runner for `CLAUDE_CODE_SESSION_ACCESS_TOKEN` refresh (process-wide, not just child Bash).
- **`createCanUseTool` race** (`:533-659`): Runs PermissionRequest hooks in parallel with the SDK consumer's permission prompt. Whichever resolves first wins; the loser is cancelled/ignored. Hook decisions can carry permission updates (`updatedPermissions`), which `applyPermissionUpdates`/`persistPermissionUpdates` write to settings.
- **`createSandboxAskCallback`** (`:731-753`): Bridges sandbox network permission requests into the can_use_tool protocol with synthetic tool name `SandboxNetworkAccess`.
- **`sendMcpMessage`** (`:758-773`): Forwards JSON-RPC messages to SDK MCP servers via the `mcp_message` control_request subtype.

---

## 5. `cli/remoteIO.ts` (255 LOC) — RemoteIO subclass

Used when `--sdk-url` is set. Extends `StructuredIO` with a network transport replacing stdio. Constructor (`:44-215`):

1. Builds auth headers from `getSessionIngressAuthToken()`.
2. Adds `x-environment-runner-version` header if env-set (Environment Manager integration).
3. Creates `refreshHeaders` callback so transport reconnects can pick up rotated tokens.
4. Calls `getTransportForUrl` (see §10) to pick WS / SSE / Hybrid.
5. **Bridge mode echo**: When `CLAUDE_CODE_ENVIRONMENT_KIND === 'bridge'`, control_request messages are echoed to stdout so the bridge parent can detect permission requests (`:236-241`).
6. **CCR v2 bootstrap**: If `CLAUDE_CODE_USE_CCR_V2`, instantiates `CCRClient` (`:126-168`). Wires:
   - `setInternalEventWriter` → CCR v2 internal events (replaces v1 Session Ingress for transcript persistence).
   - `setInternalEventReader` (foreground + subagent) → reads back internal events on resume.
   - `setCommandLifecycleListener` → reports delivery status (`processing`/`processed`).
   - `setSessionStateChangedListener` → reports session state.
   - `setSessionMetadataChangedListener` → reports metadata.
   - **Critical ordering**: `new CCRClient()` must run before `transport.connect()` — otherwise early SSE frames hit an unwired callback and 'received' acks are silently dropped.
7. **Keep-alive** (`:184-196`): Bridge-mode-only periodic `keep_alive` frames every `session_keepalive_interval_v2_ms` (GrowthBook-controlled, default 120s) to defeat Envoy idle timeouts (#21931).
8. **Initial prompt streaming** (`:202-214`): If `initialPrompt` async iterable provided, pumps it into the input stream (stripping trailing newlines).

Override `flushInternalEvents` (`:217-219`) and `internalEventsPending` (`:221-223`) delegate to `ccrClient`.

---

## 6. `cli/update.ts` (422 LOC) — `claude update` subcommand

The auto-updater. Verifies installation type (npm-local / npm-global / native / development / package-manager), warns on multiple installations, updates config to track install method when stale. Branches:

- **Package manager paths** (`:118-166`): Homebrew → `brew upgrade claude-code`. Winget → `winget upgrade Anthropic.ClaudeCode`. apk → `apk upgrade claude-code`. pacman/deb/rpm → generic message ("multiple frontends").
- **Config/reality mismatch** (`:168-212`): If config says `local` but running `global`, updates config to match reality.
- **Native installation** (`:213-258`): Calls `installLatestNative(channel, true)` from `nativeInstaller`. Gracefully handles lock contention with PID info.
- **JS/npm fallback** (`:260-422`): Detects local vs global, runs `installOrUpdateClaudePackage` or `installGlobalPackage`, regenerates completion cache on success. Five status branches (success / no_permissions / install_failed / in_progress).

Notable: `claude install` (the migration to native binary) is referenced at `:394, :409` as the recommended fix when npm install fails.

---

## 7. `cli/handlers/agents.ts` (70 LOC)

The `claude agents` subcommand. Uses `getAgentDefinitionsWithOverrides(cwd)` + `getActiveAgentsFromList` + `resolveAgentOverrides` from `tools/AgentTool`. Iterates `AGENT_SOURCE_GROUPS` (filesystem/plugin/SDK origins), prints each agent as `agentType · model · memory`. Marks shadowed agents with `(shadowed by <winnerSource>)`. Output footer: `<N> active agents`.

---

## 8. `cli/handlers/auth.ts` (330 LOC)

Three exported functions plus the shared `installOAuthTokens` helper.

**`installOAuthTokens(tokens)`** (`:50-110`): Shared post-token-acquisition logic. Used by both interactive auth and `print.ts`'s `claude_authenticate` control_request.

1. Calls `performLogout({clearOnboarding: false})` to clear stale state.
2. Reuses pre-fetched profile or fetches fresh via `getOauthProfileFromOauthToken`.
3. Stores OAuth account info via `storeOAuthAccountInfo`.
4. Calls `saveOAuthTokensIfNeeded` + `clearOAuthTokenCache`.
5. Best-effort: `fetchAndStoreUserRoles`, `fetchAndStoreClaudeCodeFirstTokenDate` (claude.ai auth) or `createAndStoreApiKey` (Console auth).
6. `clearAuthRelatedCaches` flush.

**`authLogin({email, sso, console, claudeai})`** (`:112-230`):

- Validates `--console` vs `--claudeai` mutual exclusion.
- Honors `forceLoginMethod` enterprise setting (hard constraint, overrides flags).
- **Fast path** (`:140-186`): If `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` env var set, requires `CLAUDE_CODE_OAUTH_SCOPES`, calls `refreshOAuthToken` directly (skips browser).
- **Standard path** (`:188-228`): `OAuthService.startOAuthFlow` with browser open, prints visible URL, calls `installOAuthTokens`, validates `validateForceLoginOrg`, exits 0.

**`authStatus({json, text})`** (`:232-319`): Determines auth method (`third_party` / `claude.ai` / `api_key_helper` / `oauth_token` / `api_key` / `none`). In text mode prints `buildAccountProperties() + buildAPIProviderProperties()`. In JSON mode emits `{loggedIn, authMethod, apiProvider, apiKeySource, email, orgId, orgName, subscriptionType}`. Exits `loggedIn ? 0 : 1`.

**`authLogout()`** (`:321-330`): `performLogout({clearOnboarding: false})` + write success.

---

## 9. `cli/handlers/autoMode.ts` (170 LOC)

Three commands behind `claude auto-mode {defaults, config, critique}`:

- **`autoModeDefaultsHandler`** (`:24-26`): Dumps `getDefaultExternalAutoModeRules()` as JSON.
- **`autoModeConfigHandler`** (`:35-47`): Dumps the **effective** config — user settings where present, defaults where empty. **Per-section REPLACE semantics** (`:30-34`): a non-empty user `allow`/`soft_deny`/`environment` section replaces the corresponding default section _entirely_, not append.
- **`autoModeCritiqueHandler`** (`:73-149`): Runs the user's rules through a Haiku critique. Builds a `userRulesSummary` block listing each user section + the defaults being replaced. Calls `sideQuery` with `querySource: 'auto_mode_critique'`, custom system prompt (`:49-71`), `max_tokens: 4096`. Prints critique text or "No critique was generated."

---

## 10. `cli/handlers/mcp.tsx` (361 LOC)

Lazy-loaded handlers for `claude mcp {serve, remove, list, get, add-json, add-from-claude-desktop, reset-project-choices}`. Notable:

- **`mcpServeHandler`** (`:42-71`): Verifies cwd exists, calls `setup(cwd, 'default', false, false, undefined, false)` (i.e. `setup.ts:1`), then dynamically imports `entrypoints/mcp.js` and calls `startMCPServer(cwd, debug, verbose)`. This is what makes `claude` itself an MCP server when invoked as `claude mcp serve` — it speaks JSON-RPC over stdio.
- **`mcpRemoveHandler`** (`:74-141`): Walks `local`/`project`/`user` scopes. If multiple scopes contain the server, errors with "exists in multiple scopes" + per-scope removal commands. Single-scope auto-removes. Cleans up secure storage (`clearServerTokensFromLocalStorage`, `clearMcpClientConfig`) for SSE/HTTP servers.
- **`mcpListHandler`** (`:144-190`): Health-checks all servers concurrently via `pMap` with `getMcpServerConnectionBatchSize()` concurrency. Renders `<name>: <url|cmd> (<type>) - <status>`. Uses `gracefulShutdown(0)` (not `process.exit`) to clean up child MCP processes.
- **`mcpGetHandler`** (`:193-283`): Detailed view including OAuth state — reads `getMcpClientConfig` to detect whether `client_secret` is configured.
- **`mcpAddJsonHandler`** (`:286-314`): JSON config + `--client-secret` flag triggers `readClientSecret()` (interactive password prompt). Saves via `saveMcpClientSecret`.
- **`mcpAddFromDesktopHandler`** (`:317-349`): Reads `claude_desktop_config.json` and renders the `MCPServerDesktopImportDialog` Ink component for selecting which servers to import. The only handler in this file that uses Ink.
- **`mcpResetChoicesHandler`** (`:352-360`): Wipes `enabledMcpjsonServers`/`disabledMcpjsonServers`/`enableAllProjectMcpServers` so the next session re-prompts for `.mcp.json` server approvals.

---

## 11. `cli/handlers/plugins.ts` (878 LOC)

Lazy-loaded handlers for `claude plugin {validate, list, install, uninstall, enable, disable, update}` and `claude plugin marketplace {add, list, remove, update}`. Per-command notes:

- **`pluginValidateHandler`** (`:101-154`): Validates a manifest with `validateManifest` (returns errors+warnings). If the manifest sits inside `.claude-plugin/`, also validates contents (skills/agents/commands/hooks) via `validatePluginContents`. Pretty-printed warnings/errors.
- **`pluginListHandler`** (`:156-444`): Two paths (JSON vs human). Loads installed-plugins-V2 + GetPluginEditableScopes (active enable state). Surfaces inline-only plugins (`@inline` source) loaded via `--plugin-dir` (which V2 doesn't track). Enriches each plugin with MCP servers. JSON path also supports `--available` (loads marketplaces + filters out installed). Both paths handle the `dirName ≠ manifestName` fallback for inline-load errors (via `'plugin' in e && e.plugin === p.name`).
- **`marketplace{Add,List,Remove,Update}Handler`** (`:447-665`): Add supports github / git / url / directory / file source types with `--sparse` paths (github+git only). Update supports single + bulk modes.
- **`pluginInstallHandler`** (`:668-701`): Validates scope (one of `VALID_INSTALLABLE_SCOPES`). Logs PII-tagged plugin name + marketplace name to BigQuery via `_PROTO_*` columns. Calls `installPlugin(plugin, scope)`.
- **`pluginUninstallHandler`** (`:704-737`): Optional `--keep-data` flag to retain on-disk state.
- **`pluginEnableHandler`** + **`pluginDisableHandler`** (`:740-843`): Per-scope enable/disable; disable supports `--all`. `--cowork` always operates at user scope (other scopes error).
- **`pluginUpdateHandler`** (`:846-877`): Updates from a `VALID_UPDATE_SCOPES` set (looks looser than install scopes).

The whole file is the implementation of Anthropic's plugin marketplace ecosystem on the CLI side.

---

## 12. `cli/handlers/util.tsx` (109 LOC)

Three handlers:

- **`setupTokenHandler`** (`:20-49`): Renders `<ConsoleOAuthFlow mode="setup-token">` inside `<AppStateProvider><KeybindingSetup>`. Shows a warning if env-var auth is already configured. Used for the long-lived (1-year) OAuth token setup.
- **`doctorHandler`** (`:72-87`): Renders `<MCPConnectionManager><DoctorWithPlugins>`. The `DoctorWithPlugins` wrapper (`:56-71`) calls `useManagePlugins()` + `<React.Suspense>` lazy-loads the `Doctor` screen. Provides a diagnostic tree.
- **`installHandler`** (`:90-108`): Calls `setup(cwd, 'default', false, false, undefined, false)`, then imports the install command and runs it via the SDK-style `install.call(callback, args, options)` shape. Exits `result.includes('failed') ? 1 : 0`.

This file is what `claude mcp.tsx` and many other handler-tsx files look like: dynamic import → render Ink screen → unmount → exit.

---

## 13. `cli/transports/transportUtils.ts` (45 LOC)

The transport selector. Pure dispatch:

```ts
if (CLAUDE_CODE_USE_CCR_V2)               → SSETransport      (rewrites url to /worker/events/stream)
else if (ws://|wss://) {
    if (CLAUDE_CODE_POST_FOR_SESSION_INGRESS_V2) → HybridTransport
    else                                  → WebSocketTransport
} else throw
```

So the transport hierarchy is **CCR-v2 SSE > Hybrid (WS-read+POST-write) > WS-only**. Default is WS-only.

---

## 14. `cli/transports/SerialBatchEventUploader.ts` (275 LOC)

**The lowest-level building block.** A serial-ordered batched event uploader with retry+backpressure. Rules (`:3-15`):

- ≤1 POST in-flight at a time.
- Drains up to `maxBatchSize` items per POST (also `maxBatchBytes` if set).
- New events accumulate while in-flight (single in-flight + one batch).
- Retries on failure with exponential backoff (clamped) + jitter, indefinitely or up to `maxConsecutiveFailures`.
- `flush()` blocks until pending is empty.
- `enqueue()` blocks when `maxQueueSize` is reached → backpressure.

Notable details:

- **`RetryableError(message, retryAfterMs?)`** (`:27-33`): A 429-Retry-After thrown from `send()` overrides exponential backoff for that attempt — clamped to `[baseDelayMs, maxDelayMs]` and jittered so misbehaving servers can neither hot-loop nor stall the client.
- **`takeBatch`** (`:213-233`): Respects byte budget. Un-serializable items (BigInt, circular refs, throwing toJSON) are dropped in place — they can never be sent and would otherwise poison the queue and hang flush() forever. **Subtle but real.**
- **`droppedBatchCount`** (`:84-86`): Monotonic counter so callers can snapshot before `flush()` and detect silent drops (since `flush()` resolves normally even when batches were dropped).
- **`releaseBackpressure()`** (`:255-259`): Awakens enqueue waiters in batches.

Used by both `HybridTransport` (for stdout) and `CCRClient` (for events / internal events / delivery).

---

## 15. `cli/transports/HybridTransport.ts` (282 LOC)

Extends `WebSocketTransport`. WebSocket reads, HTTP POST writes. Why? Because WS reads are cheap but WS sends from many sessions concurrently can collide on Firestore write. Fire-and-forget `void transport.write()` from bridge mode meant concurrent POSTs → concurrent Firestore writes to the same document → collisions → retry storms → pages oncall. The fix: serialize writes through `SerialBatchEventUploader`.

- **stream_event delay buffer** (`:60-62`): stream events accumulate for up to 100 ms (`BATCH_FLUSH_INTERVAL_MS`) before enqueue. A non-stream write flushes the buffer first to preserve order.
- **maxQueueSize: 100,000** (`:85`): bridge callers don't await — backpressure can't apply, so this is a memory bound only. Real backpressure tagged as a follow-up.
- **`postOnce`** (`:202-261`): single attempt with a 15 s `POST_TIMEOUT_MS` (`:13`). 200/201 → success. 4xx (non-429) → permanent (drop). 429/5xx → throw → uploader re-queues + backs off.
- **`convertWsUrlToPostUrl`** (`:269-282`): `wss://api.example.com/v2/session_ingress/ws/<id>` → `https://...session/<id>/events`.

---

## 16. `cli/transports/SSETransport.ts` (711 LOC)

CCR v2 transport. SSE for reads, HTTP POST for writes. Notable:

- **Liveness detection** (`:21, :542-558`): server sends keepalives every 15 s; treat as dead after 45 s of silence (`LIVENESS_TIMEOUT_MS`). On timeout, abort + reconnect. The `onLivenessTimeout` is hoisted as a class property so `resetLivenessTimer` (called per-frame) doesn't allocate a closure each time.
- **Sequence number resumption** (`:174-175, :245-265`): tracks `lastSequenceNum` (high-water) + `seenSequenceNums` Set (1000-cap with prune). On reconnect, sends `from_sequence_num` query param + `Last-Event-ID` header so the server resumes from the right point. Without this, recreating a transport (e.g. on `replBridge.onWorkReceived`) would replay the entire session history.
- **Permanent vs transient HTTP codes** (`:27-33, :281-294`): 401/403/404 → permanent → state goes straight to `'closed'` + `onCloseCallback(status)`. 429/5xx → reconnect.
- **`parseSSEFrames`** (`:58-116`): incremental SSE parser. Handles `event:`/`id:`/`data:` fields, comment lines (`:keepalive`) reset liveness without producing a frame. Multiple `data:` lines concatenated with `\n` (per spec). Returns `{frames, remaining}` so the unparsed tail is preserved across read calls.
- **`StreamClientEvent` payload** (`:130-143`): the only SSE event type sent to worker subscribers (per `notifier.go`); other types log diagnostics. The payload's `payload` field is what gets emitted to consumers as NDJSON.
- **POST retry** (`:591-651`): 10 attempts, exponential backoff. Same shape as Hybrid.
- **`convertSSEUrlToPostUrl`** (`:704-711`): strips `/stream` suffix to derive the POST endpoint.

---

## 17. `cli/transports/WebSocketTransport.ts` (800 LOC)

The vanilla WS path. Highlights I read:

- **Bun + Node duplicates**: handles both `globalThis.WebSocket` (Bun native, supports `headers`/`proxy`/`tls`) and `import('ws')` (Node). Class-property arrow handlers (`onBunOpen`/`onBunMessage`/`onBunError`/`onBunClose` and Node equivalents) so they can be removed in `doDisconnect()` — without removal, each reconnect orphans 5 closures per WS object until GC, accumulating under network instability.
- **`messageBuffer: CircularBuffer<StdoutMessage>`** (`:106, :22`): ring buffer of last 1,000 outbound messages for replay on reconnect via `X-Last-Request-Id` header (Node ws path) or full replay (Bun, no upgrade-response header access).
- **Permanent close codes** (`:42-46`): 1002/4001/4003 → `closed`, no retry.
- **Sleep detection** (`:30-36`): `SLEEP_DETECTION_THRESHOLD_MS = 60s`. If gap between reconnects exceeds, machine likely slept — reset budget.
- **Keep-alive frame** (`:20`): `'{"type":"keep_alive"}\n'` — server-side filtered.
- **Telemetry gating**: `isBridge` opt-in for `tengu_ws_transport_*` events so only Cloudflare-idle-population (Remote Control) sessions emit; print-mode workers stay silent.
- **TLS / proxy**: `getWebSocketTLSOptions()`, `getWebSocketProxyAgent()`, `getWebSocketProxyUrl()` — for enterprise mTLS + forward proxies.

I did not read all 800 lines but the structure is clear: state machine (idle/connected/reconnecting/closing/closed) + ping/pong + keepalive timer + replay + activity timestamp tracking for proxy-idle diagnostics.

---

## 18. `cli/transports/ccrClient.ts` (998 LOC) — CCR v2 protocol client

The newest and most complex transport. Wraps `SSETransport` (read) + adds heartbeat loop, epoch management, runtime state reporting. Major exported pieces:

- **`CCRInitError`** + **`CCRInitFailReason`** (`:49-59`): typed `'no_auth_headers' | 'missing_epoch' | 'worker_register_failed'` for diag classifier.
- **`StreamAccumulatorState`** (`:104-114`): `byMessage: Map<msg_id, blocks[][chunks[]]>` + `scopeToMessage: Map<scope_key, msg_id>`. The accumulator is keyed by API message ID so lifetime ties to the assistant message — `clearStreamAccumulatorForMessage` (`:210-223`) is called on the complete `SDKAssistantMessage` arrival (the _reliable_ end-of-stream signal that fires even when abort/error skip stop events).
- **`accumulateStreamEvents`** (`:141-203`): coalesces `text_delta` events per content block into **full-so-far snapshots**. Each emitted event is self-contained so a client connecting mid-stream sees complete text, not a fragment. This is a big design decision — they chose to emit denormalized full-text per delta rather than risk losing a fragment.
- **`CCRClient`** (`:262-end`): heartbeat every 20 s (`DEFAULT_HEARTBEAT_INTERVAL_MS`), liveness 60 s server TTL. 10 consecutive 401/403 with valid-looking token before auth-failure shutdown (`MAX_CONSECUTIVE_AUTH_FAILURES`). 4 separate `SerialBatchEventUploader` instances (events / internal events / delivery / worker-state) — each with its own retry/backoff budget so a stuck delivery report doesn't block primary event flow.
- **Epoch mismatch handler** (`:294-300`): default `process.exit(1)` (correct for spawn-mode children where parent re-spawns); in-process callers (replBridge) override to close gracefully.

I only read the top 300 lines but the export surface (`exports`: `CCRInitError`, `createStreamAccumulator`, `accumulateStreamEvents`, `clearStreamAccumulatorForMessage`, `CCRClient`, types) tells the full story.

---

## 19. Root: `dialogLaunchers.tsx` (132 LOC)

Pure plumbing. Each function:

1. Dynamically imports a screen component.
2. Calls `showSetupDialog<T>(root, done => <Comp .../>)` which wraps in `<AppStateProvider><KeybindingSetup>`.
3. Returns the resolved promise.

The seven launchers are:

- `launchSnapshotUpdateDialog` (`:29-38`): `<SnapshotUpdateDialog>` — agent memory snapshot prompt. Resolves `'merge' | 'keep' | 'replace'`.
- `launchInvalidSettingsDialog` (`:44-52`): `<InvalidSettingsDialog>` — surface settings validation errors.
- `launchAssistantSessionChooser` (`:58-65`): pick a bridge session.
- `launchAssistantInstallWizard` (`:73-85`): install daemon when zero sessions exist. Uses `Promise.race([resultPromise, errorPromise])` so install errors throw cleanly.
- `launchTeleportResumeWrapper` (`:91-96`): `<TeleportResumeWrapper source="cliArg">`.
- `launchTeleportRepoMismatchDialog` (`:102-110`): repo-mismatch picker.
- `launchResumeChooser` (`:117-132`): NOT a dialog — uses `renderAndRun` (drives the actual screen lifecycle, not just modal). Wrapped in `<App><KeybindingSetup>`. Uses `Promise.all` to parallelize worktree path discovery + dynamic imports.

The header comment cites sibling PRs `perf/extract-interactive-helpers` + `perf/launch-repl` — this is part of a `main.tsx` extraction effort.

---

## 20. Root: `replLauncher.tsx` (22 LOC)

Even thinner. `launchRepl(root, appProps, replProps, renderAndRun)` dynamically imports `<App>` + `<REPL>`, calls `renderAndRun` with the composition. `renderAndRun` is passed in (not imported) so testing can stub it.

---

## 21. Root: `interactiveHelpers.tsx` (365 LOC)

The orchestration layer for _interactive_ (non-print) mode startup. Canonical sequence in `showSetupScreens` (`:104-298`):

1. **Skip on test/demo** (`:105-107`): early return when `IS_DEMO`.
2. **Onboarding** (`:111-123`): if no theme or first run, show `<Onboarding onDone>` then `completeOnboarding()`.
3. **Trust dialog** (`:131-140`): always shown unless `CLAUBBIT` env-var. Fast-path: skip import if `checkHasTrustDialogAccepted()` already true. Otherwise, lazy-load `<TrustDialog>`. On done, `setSessionTrustAccepted(true)` (`:144`) — GrowthBook reads this to decide whether to include auth headers.
4. **GrowthBook reset+reinit** (`:149-150`): defense for login/logout — clears any prior client so the next init picks up fresh auth headers. **This is a critical sequencing detail.**
5. **System context prefetch** (`:153`): `void getSystemContext()` after trust.
6. **MCP.json server approvals** (`:156-161`): if settings are valid, run `handleMcpjsonServerApprovals(root)` for any project-scoped servers.
7. **CLAUDE.md external includes** (`:164-170`): if `shouldShowClaudeMdExternalIncludesWarning()`, render `<ClaudeMdExternalIncludesDialog>`.
8. **GitHub repo path mapping** (`:175`): fire-and-forget — must run AFTER trust to prevent untrusted dirs from poisoning the mapping.
9. **`applyConfigEnvironmentVariables`** (`:184`): apply potentially-dangerous env vars from settings — only after trust accepted (or in bypass mode).
10. **Telemetry init** (`:190`): `setImmediate` to avoid pre-render microtask queue collision.
11. **Grove dialog** (`:191-201`): if `isQualifiedForGrove()`, render `<GroveDialog>`. `'escape'` decision exits with `gracefulShutdownSync(0)`.
12. **API key approval** (`:206-217`): if `process.env.ANTHROPIC_API_KEY` and not Homespace, check `getCustomApiKeyStatus(truncated)` — if `'new'`, render `<ApproveApiKey>`.
13. **Bypass permissions dialog** (`:218-223`): if `permissionMode === 'bypassPermissions' || allowDangerouslySkipPermissions` and `!hasSkipDangerousModePermissionPrompt()`, render `<BypassPermissionsModeDialog>`.
14. **Auto mode opt-in** (`:224-235`): if `feature('TRANSCRIPT_CLASSIFIER')` and mode is `auto` and `!hasAutoModeOptIn()`, render `<AutoModeOptInDialog>` (decline → `gracefulShutdownSync(1)`).
15. **Dev channels confirmation** (`:241-288`): `KAIROS` / `KAIROS_CHANNELS` feature. Warms `tengu_harbor` gate via `checkGate_CACHED_OR_BLOCKING`. If channels disabled or no OAuth, append entries silently. Otherwise render `<DevChannelsDialog>`.
16. **Claude in Chrome onboarding** (`:291-296`): if `claudeInChrome && !hasCompletedClaudeInChromeOnboarding`, render `<ClaudeInChromeOnboarding>`.

`getRenderContext` (`:299-365`) sets up:

- `FpsTracker` for frame metrics.
- `StatsStore` (also stored in `bootstrap/state` via `setStatsStore`).
- `onFrame` callback that records duration, reports flickers (skipped when `isSynchronizedOutputSupported()` because DEC 2026 makes redraw atomic).
- Bench-mode hook (`CLAUDE_CODE_FRAME_TIMING_LOG`): `appendFileSync` per-frame phase timings as JSONL for `bench/repl-scroll.ts`.

Other helpers: `completeOnboarding`, `showDialog`, `exitWithError`, `exitWithMessage`, `showSetupDialog`, `renderAndRun`.

---

## 22. Root: `ink.ts` (85 LOC) — the Ink wrapper

Re-exports the `ink/` subdir with a `ThemeProvider` wrapper. Two functions that matter:

- **`render(node, options)`** (`:18-23`): wraps `node` in `<ThemeProvider>` then calls `inkRender`.
- **`createRoot(options)`** (`:25-31`): wraps the root's `render` so every subsequent render gets ThemeProvider automatically. Critical for ThemedBox/ThemedText.

Re-exports include the full Ink API (`Box`, `Text`, `BaseBox`, `BaseText`, `Button`, `Link`, `Spacer`, `useInput`, `useApp`, `useStdin`, `useTerminalFocus`, `useTerminalTitle`, `useTerminalViewport`, `useTabStatus`, `useSelection`, `measureElement`, `wrapText`, `Ansi`, `RawAnsi`, `NoSelect`, focus manager, event types) plus design-system (`color`, `BoxProps`, `TextProps`, `ThemeProvider`, `usePreviewTheme`, `useTheme`, `useThemeSetting`).

So `ink.ts` is the single source of UI primitives — every Ink call site imports from here, never directly from `ink/`. This is what enables centralized theming.

---

## 23. Root: `projectOnboardingState.ts` (83 LOC)

Two public functions and a memoized predicate. State shape (`:11-17`): `{key, text, isComplete, isCompletable, isEnabled}`.

- **`getSteps()`** (`:19-41`): two steps. (1) Empty workspace → "Ask Claude to create a new app or clone a repository" (enabled iff dir is empty). (2) `CLAUDE.md` → "Run /init to create a CLAUDE.md file" (enabled iff dir is NOT empty). Steps drive the in-REPL onboarding ribbon.
- **`isProjectOnboardingComplete()`** (`:43-47`): all _enabled completable_ steps must be `isComplete`.
- **`maybeMarkProjectOnboardingComplete()`** (`:49-61`): short-circuits on cached `hasCompletedProjectOnboarding` config flag (called on every prompt submit, must be cheap). Otherwise checks + persists.
- **`shouldShowProjectOnboarding`** (memoized, `:63-76`): false if config says complete, or seen ≥4 times, or `IS_DEMO`. Else returns `!isProjectOnboardingComplete()`.
- **`incrementProjectOnboardingSeenCount`** (`:78-83`): bumps the counter persistent in project config.

This is what implements the "/init recommended" hint visible in the REPL banner.

---

## 24. Cross-references & call graph

The headless layer's external dependencies cluster around five subsystems:

- **`services/`**: `analytics/index.js` (`logEvent`, `growthbook`), `mcp/{client,config,auth,channelNotification,channelAllowlist,elicitationHandler,vscodeSdkMcp}`, `oauth/index.js`, `claudeAiLimits.js`, `policyLimits/index.js`, `extractMemories/`, `mcpServerApproval.js`, `PromptSuggestion/`, `api/grove.js`, `api/firstTokenDate.js`, `settingsSync/`, `remoteManagedSettings/`, `plugins/pluginCliCommands.js`.
- **`tools/`**: `AgentTool/{loadAgentsDir,agentDisplay,agentMemory}`, `SyntheticOutputTool`. Note that `print.ts` itself never instantiates tools — it imports `assembleToolPool` and `mergeAndFilterTools` from `utils/toolPool.js`.
- **`bridge/`**: `replBridge`, `bridgeStatusUtil`, `inboundMessages`, `inboundAttachments`, `pollConfig`, `jwtUtils`, `initReplBridge`. The bridge subsystem is what makes claude.ai → CLI control work.
- **`commands/`**: `context/context-noninteractive.js` (for `get_context_usage`), `logout/logout.js` (for `installOAuthTokens`), `assistant/assistant.js` (for `launchAssistantInstallWizard`), `install.js` (for `installHandler`).
- **`utils/`**: ~40 utility imports — `auth`, `permissions/*`, `messages/*`, `model/*`, `plugins/*`, `sandbox/sandbox-adapter`, `sessionStorage`, `sessionStart`, `sessionState`, `sessionRestore`, `fileHistory`, `headlessProfiler`, `queryProfiler`, `idleTimeout`, `cleanupRegistry`, `gracefulShutdown`, `toolPool`, etc.

---

## 25. Provider coupling

Anthropic-specific touchpoints that would need to be inverted for multi-provider:

- `print.ts:300`: `import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/messages.mjs'` — used in `PromptValue` (`:417`).
- `print.ts:130-131`: `import type { PermissionMode } from '@anthropic-ai/claude-agent-sdk'`.
- `print.ts:191-192`: `OAuthService` and `installOAuthTokens` — Anthropic-specific OAuth (claude.ai + Console).
- `print.ts:243-244`: `@modelcontextprotocol/sdk/types.js` — MCP is provider-agnostic but the elicitation flow couples to claude.ai's UX expectations.
- `cli/handlers/auth.ts`: every function targets Anthropic OAuth or Console API key — the `apiProvider` parameter is `getAPIProvider()` which returns `'anthropic' | 'aws_bedrock' | 'google_vertex'`. So the existing 1P branching is binary (Anthropic vs cloud-managed Anthropic), not multi-provider.
- `cli/transports/ccrClient.ts`, `SSETransport`, `WebSocketTransport`: all target Anthropic's `session_ingress` v1/v2. `getSessionIngressAuthToken()`, `getSessionIngressAuthHeaders()`, `'anthropic-version': '2023-06-01'` header. **This entire transport stack is Anthropic-specific.**
- `cli/handlers/autoMode.ts`: `sideQuery` uses the user's main-loop model — _is_ multi-provider already, since `getMainLoopModel` honors any selected model.

The `print.ts` core agentic loop itself (`runHeadlessStreaming`, control protocol, `ask()`) is provider-agnostic — it operates on `Message[]` and `Tool[]` abstractions. Changing providers requires substituting `ask()` (in `QueryEngine.ts`) and the OAuth/transport layers, but not the protocol surface. **This is a clean boundary for multi-provider extension.**

---

## 26. Feature inventory matched to `tasks/research/anthropic-claude-suite-may-2026.md`

| May-2026 feature                                                                          | Implementation                                                                           | File:line                         |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------------------------- |
| `--print` (-p) headless mode                                                              | `runHeadless`                                                                            | `print.ts:455`                    |
| `--output-format text\|json\|stream-json`                                                 | switch                                                                                   | `print.ts:917-957`                |
| `--system-prompt` / `--system-prompt-file`                                                | `options.systemPrompt`                                                                   | `print.ts:476, 4370-4378`         |
| `--append-system-prompt`                                                                  | `options.appendSystemPrompt`                                                             | `print.ts:477`                    |
| `--max-turns` / `--max-budget-usd`                                                        | options + result subtypes                                                                | `print.ts:473-475, 947-955`       |
| `--allowed-tools`                                                                         | `options.allowedTools`                                                                   | `print.ts:471`                    |
| `--permission-mode {default\|acceptEdits\|plan\|auto\|bypassPermissions}`                 | `transitionPermissionMode`                                                               | `print.ts:181-182`                |
| `--dangerously-skip-permissions`                                                          | `BypassPermissionsModeDialog`                                                            | `interactiveHelpers.tsx:218-223`  |
| `--continue` / `--resume <id>`                                                            | `loadInitialMessages`                                                                    | `print.ts:4893`                   |
| `--rewind-files <uuid>`                                                                   | standalone op                                                                            | `print.ts:736-771`                |
| `--resume-session-at <uuid>`                                                              | message slicing                                                                          | `print.ts:5106-5120`              |
| `--agents '<json>'` / `--agent <name>`                                                    | merged from stdin                                                                        | `print.ts:4380-4427`              |
| `--mcp-config`                                                                            | filter via `filterMcpServersByPolicy`                                                    | `print.ts:5364-5369`              |
| `--permission-prompt-tool`                                                                | `getCanUseToolFn`                                                                        | `print.ts:4267-4334`              |
| `--plugin-dir` / `--plugin-url`                                                           | `installPluginsForHeadless`                                                              | `print.ts:331, 1721-1744`         |
| `--ide` (VS Code / JetBrains)                                                             | `setupVscodeSdkMcp`                                                                      | `print.ts:250, 1457`              |
| `--worktree`                                                                              | restored via `restoreSessionMetadata`                                                    | `print.ts:215, 4960-4964`         |
| `--exclude-dynamic-system-prompt-sections`                                                | (not directly seen in this scope; deferred to `QueryEngine.ts`)                          | —                                 |
| `claude install` (native migration)                                                       | `installLatestNative`                                                                    | `cli/update.ts:213-258`           |
| `claude doctor`                                                                           | `doctorHandler`                                                                          | `cli/handlers/util.tsx:72-87`     |
| `claude setup-token`                                                                      | `setupTokenHandler`                                                                      | `cli/handlers/util.tsx:20-49`     |
| `claude auth login/status/logout`                                                         | three handlers                                                                           | `cli/handlers/auth.ts:112-330`    |
| `claude agents`                                                                           | `agentsHandler`                                                                          | `cli/handlers/agents.ts:32-69`    |
| `claude mcp serve/list/get/add-json/remove/add-from-claude-desktop/reset-project-choices` | seven handlers                                                                           | `cli/handlers/mcp.tsx`            |
| `claude plugin {validate,list,install,uninstall,enable,disable,update}`                   | seven handlers                                                                           | `cli/handlers/plugins.ts`         |
| `claude plugin marketplace {add,list,remove,update}`                                      | four handlers                                                                            | `cli/handlers/plugins.ts:447-665` |
| `claude auto-mode {defaults,config,critique}`                                             | three handlers                                                                           | `cli/handlers/autoMode.ts`        |
| `claude update`                                                                           | `update()`                                                                               | `cli/update.ts:30`                |
| `/init` (slash command)                                                                   | NOT in this scope — driven by REPL + `projectOnboardingState.getSteps()` step "claudemd" | `projectOnboardingState.ts:34-39` |
| TrustDialog + workspace trust                                                             | `interactiveHelpers.tsx:131-145`                                                         | —                                 |
| Auto mode opt-in dialog                                                                   | `interactiveHelpers.tsx:224-235`                                                         | —                                 |
| Grove policy dialog                                                                       | `interactiveHelpers.tsx:191-201`                                                         | —                                 |
| Custom API key approval                                                                   | `interactiveHelpers.tsx:206-217`                                                         | —                                 |
| Claude in Chrome onboarding                                                               | `interactiveHelpers.tsx:291-296`                                                         | —                                 |
| Dev channels (KAIROS)                                                                     | `interactiveHelpers.tsx:241-288`                                                         | —                                 |
| Remote control (claude.ai → CLI bridge)                                                   | `print.ts:3892-4020` (control_request) + `RemoteIO`                                      | —                                 |
| Cron-scheduled tasks (Agent Triggers)                                                     | `cronScheduler`                                                                          | `print.ts:2702-2734`              |
| Proactive mode                                                                            | `proactiveModule`                                                                        | `print.ts:361-363, 1834-1856`     |
| Coordinator mode                                                                          | `coordinatorModeModule`                                                                  | `print.ts:358-360`                |
| Memory extraction                                                                         | `extractMemoriesModule`                                                                  | `print.ts:374-376, 967-969`       |
| Streamlined output                                                                        | `createStreamlinedTransformer`                                                           | `print.ts:856-861`                |
| Hook events fanout in stream-json                                                         | `registerHookEventHandler`                                                               | `print.ts:629-674`                |
| Session persistence (CCR v2 internal events)                                              | `CCRClient` + `setInternalEventWriter/Reader`                                            | `cli/remoteIO.ts:140-153`         |
| Sandbox network permission prompts                                                        | `createSandboxAskCallback`                                                               | `cli/structuredIO.ts:62, 731-753` |
| Prompt suggestions                                                                        | `tryGenerateSuggestion`                                                                  | `print.ts:2275-2358`              |

The only major May-2026-listed feature that **isn't** evident in this scope is `--exclude-dynamic-system-prompt-sections` (caching), which appears to be a `QueryEngine.ts` concern, and `/team-onboarding` (v2.1.101+) which is a slash command not in this subtree.

---

## 27. Tree-shaken stubs

These conditional `feature(X)` modules at `print.ts:357-377` are dead-code-eliminated on external builds:

- `coordinatorModeModule` — `feature('COORDINATOR_MODE')`.
- `proactiveModule` — `feature('PROACTIVE') || feature('KAIROS')`.
- `cronSchedulerModule`, `cronJitterConfigModule`, `cronGate` — `feature('AGENT_TRIGGERS')`.
- `extractMemoriesModule` — `feature('EXTRACT_MEMORIES')`.

`feature('STREAMLINED_OUTPUT')` is a different beast — gated at `print.ts:857` for the streamlined transformer.

`feature('UDS_INBOX')` at `print.ts:2685` for the Unix-domain-socket inbox.

`feature('FILE_PERSISTENCE')` at `print.ts:2134, 2256` for the file-persistence post-turn hook.

`feature('COMMIT_ATTRIBUTION')` at `print.ts:809-816, 2832-2841, 4112-4121` for attribution snapshots.

`feature('TRANSCRIPT_CLASSIFIER')` at `print.ts:1067, 4604` for auto-mode classifier.

`feature('BASH_CLASSIFIER')` at `cli/structuredIO.ts:72` for permission decision-reason serialization.

`feature('KAIROS')` / `feature('KAIROS_CHANNELS')` at `print.ts:1672, 4674, 4789` for channel notifications.

`feature('LODESTONE')` at `interactiveHelpers.tsx:176` for deep-link terminal preference.

`feature('DOWNLOAD_USER_SETTINGS')` at `print.ts:511, 1710, 3068` for remote-managed user settings download.

This is **a lot** of feature flagging. The build process strips on `USER_TYPE === 'ant'` builds the way most dev boundaries get expressed: `bun:bundle` `feature()` calls that are evaluated at bundle time.

---

End of `m1-cli-print-launchers.md`.
