# SVC — `~/Desktop/reference/src/services/` (all subdirs except `api/` and `mcp/`)

> Reference root: `/Users/siddhartha/Desktop/reference/src/services/`
> Scope: 18 subdirectories (~71 files / ~26,000 LOC) covering compaction, analytics, LSP, OAuth,
> tools orchestration, autoDream, plugins, and 11 smaller services. Excludes `api/` (M8) and
> `mcp/` (M9). Read in full 2026-05-08 against the user-supplied snapshot of the Claude Code
> reference source. All citations are `path:line` relative to that root.

---

## Top-line architectural takeaways

1. **Compaction is layered, not monolithic.** Reference ships _four_ distinct compaction
   strategies, ordered cheapest-first per turn: (a) **time-based microcompact** (cold-cache
   eviction of old tool results, see `compact/microCompact.ts:267-270, 446-530`), (b)
   **cached microcompact** via the `cache_edits` API path (`compact/microCompact.ts:276-285,
305-399`), (c) **session-memory compact** (skip the summarizer entirely, replace
   conversation with the SessionMemory `.md` file — `compact/sessionMemoryCompact.ts:514-630`),
   and finally (d) **legacy summarizer compact** with a forked-agent that reuses the parent
   prompt cache (`compact/compact.ts:387-763`). Plus an API-driven layer
   (`compact/apiMicrocompact.ts`) that emits `clear_tool_uses_20250919` /
   `clear_thinking_20251015` strategies into the API request itself.
2. **Forked-agent pattern is everywhere.** Compaction summary, agent summarization, autoDream,
   prompt-suggestion speculation, magic-docs update, session-memory extraction, and memory
   extraction all use the same `runForkedAgent()` helper (`utils/forkedAgent.ts`). Every fork is
   structured to _share the parent prompt cache_ — meaning identical system prompt, tool list,
   model, thinking config and message prefix. Setting `maxOutputTokens` is forbidden on cache-
   sharing forks (it would clamp `budget_tokens`, busting the cache).
3. **Cache-invalidation hygiene is a separate subsystem.** `notifyCompaction` /
   `notifyCacheDeletion` (from `services/api/promptCacheBreakDetection.ts`) are called at every
   compaction site so the cache-break detector doesn't false-positive on legitimate
   post-compact drops. BQ note: missing this in SM-compact made 20% of
   `tengu_prompt_cache_break` events false positives
   (`compact/autoCompact.ts:295-304`).
4. **Tool execution is _streaming_ and concurrency-aware.** `tools/StreamingToolExecutor.ts`
   queues tools as they arrive, runs read-only batches in parallel (Bash is the _only_ tool that
   cancels siblings on error — `:357-363`). Exclusive tools serialize. Per-tool
   `AbortController`s cascade through `siblingAbortController` and `toolUseContext`'s
   parent controller (so permission-rejection bubbles up to query loop — `:294-318`).
5. **Hooks are first-class, not just observers.** `tools/toolHooks.ts` (650 LOC) defines
   PreToolUse / PostToolUse / PostToolUseFailure with hook permission decisions that compose
   with rule-based permissions. A hook that says `allow` does NOT bypass `deny` rules
   (`:332-433`); a hook that says `ask` overrides forceDecision in the canUseTool dialog.
6. **Three "manage settings remotely" services are near-duplicates with subtly different
   eligibility.** `remoteManagedSettings/` (Console + Enterprise/C4E + Team OAuth),
   `policyLimits/` (Team + Enterprise OAuth only), and `settingsSync/` (interactive CLI only,
   per-user, NOT per-org). All three share: ETag/checksum-based caching, hourly polling,
   30-second loading-promise timeout, fail-open semantics, axios. Different endpoints, different
   schemas, different cache files (`remote-settings.json`, `policy-limits.json`, no local cache
   for settingsSync).
7. **Team Memory has a client-side gitleaks-derived secret scanner.**
   `teamMemorySync/secretScanner.ts:23-224` ports a curated subset of gitleaks rules
   (anthropic, OpenAI, AWS, GCP, GitHub, Slack, Stripe, NPM, Datadog, Sentry, etc.) and is
   called from `teamMemSecretGuard.ts:15-44` inside FileWriteTool/FileEditTool validateInput
   so the model can't write secrets into team memory. The Anthropic key prefix is **assembled at
   runtime** from `['sk', 'ant', 'api'].join('-')` so the literal byte sequence doesn't appear in
   the bundled binary.
8. **OAuth is a localhost listener + manual paste fallback.** Auth code listener
   (`oauth/auth-code-listener.ts:18-211`) spins up an HTTP server on an OS-assigned port, the
   browser is opened to the auth URL with `redirect_uri=http://localhost:<port>/callback`, and
   the user can also fall back to a manual paste flow (`oauth/index.ts:69-86`). PKCE: SHA-256
   code-challenge from a 32-byte randomBytes verifier, base64-url-encoded
   (`oauth/crypto.ts:1-23`).
9. **Analytics has a strict PII discipline at the _type_ level.** Two marker types prevent
   accidental code/path leaks: `AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS`
   (general-access) and `AnalyticsMetadata_I_VERIFIED_THIS_IS_PII_TAGGED` (privileged BQ
   columns). The PII-tagged values use `_PROTO_*` payload keys; a `stripProtoFields()` call
   guards every non-1P sink (`analytics/index.ts:45-58`). A killswitch
   (`analytics/sinkKillswitch.ts:18-25`) reads a GrowthBook JSON config to disable individual
   sinks at runtime.
10. **LSP is plugin-only.** No user/project settings can configure LSP servers — only plugins
    declare them via `getPluginLspServers()` (`lsp/config.ts:26-43`). Plugin LSP servers go
    through `LSPServerManager` with an extension→language mapping (`lsp/LSPServerManager.ts`),
    and diagnostics arrive via the `textDocument/publishDiagnostics` notification path,
    deduped via an LRU of "delivered" hashes (`lsp/LSPDiagnosticRegistry.ts:42-57`).

---

## 1. `compact/` (11 files, ~4,000 LOC) — the single most important subsystem

### Strategy ordering (per turn, in priority)

```
[every turn]
  ├─ time-based MC      compact/microCompact.ts:267-270        (clears old tool results
  │                                                              if last-asst gap > 60min)
  ├─ cached MC          compact/microCompact.ts:276-285         (cache_edits API call —
  │                                                              keeps prompt cache alive)
  └─ no-op fallthrough                                          (returns messages unchanged)

[when token-count > autoCompactThreshold]
  ├─ session-memory     compact/sessionMemoryCompact.ts:514-630 (replace pre-anchor msgs
  │                                                              with the .md content)
  └─ summarizer compact compact/compact.ts:387-763              (forked-agent summarizer)
```

`compact/compact.ts` is **1,705 LOC** — the canonical pipeline. The forked-agent path is
preferred over the legacy streaming path because of cache reuse:
`tengu_compact_cache_prefix` defaults to `true` for 3P, GB-overridable
(`compact/compact.ts:435-438, 1155-1158`). The Jan 2026 experiment confirmed: false path is
98% cache miss, costs ~0.76% of fleet `cache_creation` (~38B tok/day), concentrated in
ephemeral envs (CCR/GHA/SDK).

#### Constants (`compact/compact.ts:122-131`)

- `POST_COMPACT_MAX_FILES_TO_RESTORE = 5` — cap on file re-injection after compact
- `POST_COMPACT_TOKEN_BUDGET = 50_000` — max tokens spent on file re-injection
- `POST_COMPACT_MAX_TOKENS_PER_FILE = 5_000`
- `POST_COMPACT_MAX_TOKENS_PER_SKILL = 5_000`
- `POST_COMPACT_SKILLS_TOKEN_BUDGET = 25_000`
- `MAX_COMPACT_STREAMING_RETRIES = 2`
- `MAX_PTL_RETRIES = 3` (`:227`) — prompt-too-long during compaction
- `PTL_RETRY_MARKER = '[earlier conversation truncated for compaction retry]'` (`:228`)

#### Failure paths

- **PTL during compaction**: `truncateHeadForPTLRetry()` (`compact.ts:243-291`) drops the oldest
  API-round groups until the token gap is covered (or 20% if gap unparseable). Synthesizes a
  user-meta marker if the resulting head starts with assistant. The grouping logic
  (`compact/grouping.ts:22-63`) is **API-round** boundaries, not human-turn — fine-grained
  enough to handle single-prompt agentic sessions.
- **Streaming retry**: `tengu_compact_streaming_retry` GB-gated, default 1 attempt
  (`:1255`), up to `MAX_COMPACT_STREAMING_RETRIES`.
- **Circuit breaker**: `MAX_CONSECUTIVE_AUTOCOMPACT_FAILURES = 3` (`autoCompact.ts:70`).
  Background quote 2026-03-10: 1,279 sessions had 50+ consecutive failures (up to 3,272) in a
  single session, wasting ~250K API calls/day globally. After 3 fails, autocompact
  short-circuits silently (`autoCompact.ts:260-265`).

#### Recompaction info (`compact/compact.ts:317-323`)

```ts
type RecompactionInfo = {
  isRecompactionInChain: boolean;
  turnsSincePreviousCompact: number;
  previousCompactTurnId?: string;
  autoCompactThreshold: number;
  querySource?: QuerySource;
};
```

Lets the `tengu_compact` event disambiguate same-chain loops (H2) from cross-agent (H1/H5)
and manual-vs-auto (H3) compactions without joins.

#### Post-compact attachments (`compact.ts:531-585`)

In _parallel_: re-read recently accessed files (capped 5, 50K tok budget),
async-agent attachments (so the model knows about background tasks), plan-file attachment,
plan-mode reminder if active, invoked-skills attachment (with per-skill truncation, 25K tok
total budget, 5K per skill — sorted most-recent-first), and three delta-attachments for
tools/agents/MCP.

#### Image stripping (`compact.ts:145-200`)

Strips images from user messages and from tool_result content arrays before sending to the
summarizer — they're not needed for summaries and inflate the prompt.

#### Skill non-resets (`compact.ts:524-529`, ~525)

Intentionally NOT resetting `sentSkillNames` post-compact: re-injecting full skill_listing
(~4K tokens) is pure cache_creation with marginal benefit. The model still has SkillTool in
schema, and `invoked_skills` attachment preserves used-skill content.

#### Boundary / preserved-segment (`compact.ts:349-367`)

`annotateBoundaryWithPreservedSegment()` lets `messagesToKeep` (used in partial compact and
session-memory compact) be relinked: head/anchor/tail UUIDs travel on the boundary, the loader
patches head→anchor and anchor's-other-children→tail.

### `compact/autoCompact.ts` — auto-compact gate

- `MAX_OUTPUT_TOKENS_FOR_SUMMARY = 20_000` — based on p99.99 of compact-summary output being
  17,387 tokens (`:30`).
- `AUTOCOMPACT_BUFFER_TOKENS = 13_000` (`:62`)
- `WARNING_THRESHOLD_BUFFER_TOKENS = 20_000` (`:63`)
- `ERROR_THRESHOLD_BUFFER_TOKENS = 20_000`
- `MANUAL_COMPACT_BUFFER_TOKENS = 3_000`
- Recursion guards: `session_memory` and `compact` query sources, plus `marble_origami` (the
  ctx-agent — if its context blows up, autocompact's `runPostCompactCleanup` would
  destroy main-thread state — `:171-183`).
- Reactive-only mode (`tengu_cobalt_raccoon`) suppresses proactive autocompact, lets reactive
  catch the API's prompt-too-long (`:195-199`).
- Context-collapse mode similarly suppresses (`:215-223`) — the 90% commit / 95% blocking-spawn
  flow owns headroom there.

### `compact/microCompact.ts` — three-layer microcompact

- **Time-based**: `evaluateTimeBasedTrigger()` (`:422-444`). When gap-since-last-asst > 60min
  (default), the server cache has expired → content-clear all but the most recent N tool
  results. Fires BEFORE the API call so the shrunk prompt is what gets sent.
- **Cached MC**: deletes tool-results via the `cache_edits` API block. State module-level,
  pinned across turns — `pinCacheEdits()` / `getPinnedCacheEdits()` /
  `consumePendingCacheEdits()` (`:99-118`). Disabled for non-main-thread (would corrupt
  parent state — `:282-285`).
- **Compactable tools** (`:41-50`): FileRead, all shell tools (Bash/PowerShell), Grep, Glob,
  WebSearch, WebFetch, FileEdit, FileWrite. NOT compacted: Task, AskUserQuestion, NotebookEdit
  (notebook edits are clearable for the _clear_tool_uses_ API path — `apiMicrocompact.ts:28-32`).
- `IMAGE_MAX_TOKEN_SIZE = 2000` (`:38`).
- `TIME_BASED_MC_CLEARED_MESSAGE = '[Old tool result content cleared]'` (`:36`).

### `compact/apiMicrocompact.ts` — API-side context-management

Translates client-side decisions into the API's
`clear_tool_uses_20250919` / `clear_thinking_20251015` strategies (`:35-56`). Defaults
`DEFAULT_MAX_INPUT_TOKENS = 180_000`, `DEFAULT_TARGET_INPUT_TOKENS = 40_000` (`:14-17`). Only
ant-only env-vars `USE_API_CLEAR_TOOL_RESULTS` / `USE_API_CLEAR_TOOL_USES` switch tool-clearing
on. Thinking-clear is universal when present.

### `compact/sessionMemoryCompact.ts` — replace messages with .md

Skips the summarizer entirely. Reads SessionMemory `.md` content (extracted by
`SessionMemory/sessionMemory.ts`), replaces all messages prior to `lastSummarizedMessageId`
with that content, and uses `calculateMessagesToKeepIndex()` (`:324-397`) to expand the kept
range backwards until: (a) >= 10K tokens, AND (b) >= 5 messages with text blocks, capped at
40K tokens (`DEFAULT_SM_COMPACT_CONFIG`, `:57-61`). The kept range is index-adjusted to
preserve API invariants — never split tool_use/tool_result pairs OR thinking blocks sharing
message.id (`adjustIndexToPreserveAPIInvariants`, `:232-314`).

GB gates: `tengu_session_memory` && `tengu_sm_compact`, plus env override
`ENABLE_CLAUDE_CODE_SM_COMPACT` (`:404-431`).

### `compact/postCompactCleanup.ts` (77 LOC)

After both auto and manual /compact: reset microcompact state, conditionally reset
context-collapse (only main-thread), reset memory-file cache + getUserContext memoization,
clear system-prompt sections, classifier approvals, speculative bash checks, beta tracing,
session messages cache. **Intentionally does NOT clear `sentSkillNames`** (rationale in
compact.ts) — re-injecting skill_listing post-compact is pure cache_creation.

### `compact/prompt.ts` — the summarizer's system prompt

The opening preamble is a **NO-TOOLS PREAMBLE** (`:19-26`), explicit rejection consequences
because Sonnet 4.6+ adaptive-thinking models occasionally still tool-call despite the trailer.
The summary template has 9 sections (Primary Request and Intent → Optional Next Step) and
asks for an `<analysis>` scratchpad block followed by `<summary>` (`:61-143`). Three variants:
base, partial-from, partial-up_to (the up_to direction's prompt explicitly tells the model
"newer messages will follow your summary").

`getCompactUserSummaryMessage()` (`:337-374`) ends with a "Continue the conversation from
where it left off" directive when `suppressFollowUpQuestions` is set — including a special
proactive/KAIROS-mode continuation that says "you were already working autonomously".

---

## 2. `tools/` (4 files, ~3,100 LOC) — orchestration + hooks

### `tools/toolOrchestration.ts` (188 LOC) — partition into batches

`runTools()` (`:19-82`) partitions tool calls into batches: each batch is either a single
non-read-only tool, or a run of consecutive read-only ones. `partitionToolCalls()` (`:91-116`)
walks the list and groups by `tool.isConcurrencySafe(parsedInput)` — **per-input** safety
check, not just per-tool: a Bash command can be safe for read-only inputs (`ls`) and unsafe
for writes (`rm`). On parse failure or `isConcurrencySafe` throw, it's conservatively treated
as unsafe (`:99-108`).

Concurrency cap: `CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY` env, default 10
(`:8-12`).

### `tools/StreamingToolExecutor.ts` (530 LOC) — _streaming_ tool execution

A queue-based class (one of the few `class`es in the codebase). Tools are added as the
streaming response arrives; concurrent-safe tools run in parallel (limited by `canExecuteTool`
predicate at `:128-135`), exclusive tools wait for siblings to drain. Per-tool child
`AbortController`s cascade error states:

- **Bash failures cancel siblings** (`:357-363`). Other tools' failures don't — Read/WebFetch
  are independent.
- **Permission rejection** bubbles up through the abort-listener at `:301-318` so the query
  loop's post-tool abort check ends the turn (#21056 regression fix).
- **Discarded path**: `discard()` (`:69-72`) called when streaming fallback occurs — pending
  results are abandoned with synthetic `streaming_fallback` errors.
- Synthetic errors: `sibling_error`, `user_interrupted`, `streaming_fallback` (`:153-205`).
  User-interrupt uses `REJECT_MESSAGE` so UI shows "User rejected edit" not "Error editing".

`updateInterruptibleState()` (`:254-260`) tracks whether _all_ in-progress tools are
cancellable — if any are `block`-mode, the user can't ESC. Pending progress messages are
yielded immediately even if the tool's still running (`:412-422`) so spinners stay live.

### `tools/toolHooks.ts` (650 LOC) — Pre/Post + permission integration

`runPreToolUseHooks()` (`:435-649`) is a typed AsyncGenerator that yields seven message kinds:
`message`, `hookPermissionResult`, `hookUpdatedInput`, `preventContinuation`, `stopReason`,
`additionalContext`, `stop`. `resolveHookPermissionDecision()` (`:332-433`) is the core
contract:

- Hook `allow` does NOT bypass `deny` rules. `checkRuleBasedPermissions()` is still consulted
  (`:373`).
- Hook `allow` DOES bypass interactive prompt — unless `requiresUserInteraction()` and the
  hook didn't supply `updatedInput` (`:344-368`).
- Hook `ask` falls into `canUseTool` with `forceDecision` so the user sees the hook's reason
  in the dialog (`:413-430`).
- Hook `deny` is final — but the `deny` message is wrapped via
  `getPreToolHookBlockingMessage()` so the model sees a uniform explanation
  (`:482-498`).

`runPostToolUseHooks()` (`:39-191`) and `runPostToolUseFailureHooks()` (`:193-319`) are
mirror-image — both yield `hook_cancelled`, `hook_blocking_error`,
`hook_stopped_continuation`, `hook_additional_context`, `hook_error_during_execution` as
attachments. Telemetry events `tengu_post_tool_hooks_cancelled`,
`tengu_post_tool_hook_error`, etc.

### `tools/toolExecution.ts` (1,745 LOC) — the per-tool turn

The deepest tool file in the reference, integrating: hook results, `canUseTool` decision,
permission rule evaluation, classifier approvals (Bash speculative classifier check at
`:39`), `RecursivelyAbortControllers`, OTel tracing spans (start/end tool / executionSpan /
blockedOnUserSpan), per-tool timing, MCP detection (`isMcpTool`, `getMcpServerScopeFromToolName`),
cumulative duration tracking via `addToToolDuration`/`getStatsStore`, `extractDiscoveredToolNames`
for tool-search, `processToolResultBlock` for storage normalization. PII-safe error
classification via `classifyToolError()` (`:150-171`) walks Node errno codes, the
`TelemetrySafeError` class, and known names — useful in minified builds where
`error.constructor.name` is mangled to "nJT".

---

## 3. `analytics/` (9 files, ~4,000 LOC)

### Architecture

`index.ts` is **dependency-free** (`analytics/index.ts:7-9`). It defines the `AnalyticsSink`
interface, an event queue (`:81-84`), `attachAnalyticsSink()` (`:95-123`), and
`logEvent()`/`logEventAsync()`. Events logged before sink is attached are queued and drained
via `queueMicrotask` so startup isn't blocked.

`sink.ts` (`:48-114`) is the actual implementation that fans out to Datadog and 1P. Datadog is
gated by `tengu_log_datadog_events` (`:20-43`) and _strips `*PROTO*_`*. 1P (first-party event
logging) gets the full payload including `_PROTO_\*` because the exporter destructures and routes
those keys to proto fields.

### `analytics/firstPartyEventLoggingExporter.ts` (806 LOC) — durable event pipeline

OTel-based BatchLogRecordProcessor with custom resilience layered on top
(`:73-92`):

- Append-only log for failed events (`1p_failed_events.<batch_uuid>.jsonl`) for crash recovery.
- Quadratic backoff retry, dropped after `maxAttempts`.
- Auth fallback: retries without auth on 401.
- Chunking large event sets.
- The exporter is configurable via `tengu_1p_event_batch_config` GB config — `scheduledDelayMillis`,
  `maxExportBatchSize`, `maxQueueSize`, `skipAuth`, `maxAttempts`, `path`, `baseUrl`. Default
  endpoint is prod (`api.anthropic.com/api/event_logging/batch`) unless `ANTHROPIC_BASE_URL`
  is staging.
- Uses two protobuf event types: `ClaudeCodeInternalEvent` and `GrowthbookExperimentEvent`
  (`:16-17`).

### `analytics/datadog.ts` (307 LOC)

- `DATADOG_LOGS_ENDPOINT = 'https://http-intake.logs.us5.datadoghq.com/api/v2/logs'`
- `DATADOG_CLIENT_TOKEN = 'pubbbf48e6d78dae54bceaa4acf463299bf'` (the real token, public)
- `MAX_BATCH_SIZE = 100`, `DEFAULT_FLUSH_INTERVAL_MS = 15000`
- **Allowlist-only** (`:19-65`): only ~30 events ever go to Datadog (Chrome bridge, OAuth, API
  errors, compact failures, voice). General events go to 1P only.
- Tag fields (`:66-83`): arch, clientType, errorType, http_status, kairosActive, model,
  platform, provider, skillMode, subscriptionType, toolName, userBucket, userType, version.

### `analytics/metadata.ts` (973 LOC) — event enrichment

Single source of truth for getEventMetadata. `sanitizeToolNameForAnalytics()` (`:70-77`) maps
`mcp__*` → `mcp_tool` for general-access logs (MCP tool names are PII-medium). The
exception (`isAnalyticsToolDetailsLoggingEnabled`, `:102-116`): for Cowork (entrypoint=local-agent),
claudeai-proxy, or official-MCP-registry URLs, log the full names. `OTEL_LOG_TOOL_DETAILS=1`
opt-in for OTLP traces.

### `analytics/growthbook.ts` (1,155 LOC) — feature flags + experiments

GrowthBook client (`@growthbook/growthbook`). Tracks experiment exposures
(`experimentDataByFeature` map), dedupes via `loggedExposures` to avoid repeat-firing in hot
render loops. `getFeatureValue_CACHED_MAY_BE_STALE()` is the workhorse — used at every flag
site. `getDynamicConfig_CACHED_MAY_BE_STALE()` for JSON configs. Several pieces wait on
GrowthBook init via `reinitializingPromise`; security-gate checks block on init to avoid
returning stale values.

### `analytics/sinkKillswitch.ts` (25 LOC) — runtime sink disable

`tengu_frond_boric` GB config: `{ datadog?: boolean, firstParty?: boolean }`. Per-sink
killswitch checked at every dispatch site so backoff retries also stop. Fail-open (missing
config = sink stays on).

### `analytics/config.ts` — when analytics is disabled

`isAnalyticsDisabled()` returns true for: `NODE_ENV=test`, `CLAUDE_CODE_USE_BEDROCK`,
`CLAUDE_CODE_USE_VERTEX`, `CLAUDE_CODE_USE_FOUNDRY`, or `isTelemetryDisabled()` (privacy
opt-out). `isFeedbackSurveyDisabled()` is laxer — survives 3P providers because it's a
local UI prompt with no transcript data.

---

## 4. `oauth/` (5 files, ~1,051 LOC)

### Flow (`oauth/index.ts:32-132`)

1. Generate PKCE code-verifier (32-byte randomBytes, base64url) + challenge (SHA-256 of
   verifier, base64url) + state (32-byte randomBytes, base64url) — `oauth/crypto.ts:11-23`.
2. Spawn AuthCodeListener on OS-assigned localhost port (`:50-52`).
3. Build TWO auth URLs: manual flow (uses `MANUAL_REDIRECT_URL`) and automatic flow
   (uses `http://localhost:<port>/callback`) — `client.ts:46-105`.
4. Race: open browser to automatic URL, expose manual URL to caller for paste fallback.
5. Either the listener captures `?code=&state=` redirect OR user pastes the auth code.
6. `exchangeCodeForTokens()` (`client.ts:107-144`) with timeout 15s. Wrong state =
   "Invalid state parameter" rejection (`auth-code-listener.ts:163-168`).
7. `fetchProfileInfo()` (`oauth/getOauthProfile.ts`) — separate /api/oauth/profile or
   /api/claude_cli_profile call to populate `subscriptionType` and `rateLimitTier`.
8. `formatTokens()` returns OAuthTokens with accessToken, refreshToken, expiresAt
   (Date.now+expires_in\*1000), scopes, subscriptionType, rateLimitTier, profile, tokenAccount.

### Refresh

`refreshOAuthToken()` (`client.ts:146-225`) handles scope expansion (the backend's refresh
grant allows scope expansion beyond the initial authorize per `ALLOWED_SCOPE_EXPANSIONS`).
Skips the /api/oauth/profile round-trip when both global-config profile AND secure-storage
subscription data are populated — saves ~7M req/day fleet-wide. The
`CLAUDE_CODE_OAUTH_REFRESH_TOKEN` re-login path is a special case: `installOAuthTokens` runs
`performLogout()` AFTER refresh returns, so passing through cached values protects against
data loss.

### Success/error redirect

After token exchange success, the listener's pending response gets a 302 to either
`CLAUDEAI_SUCCESS_URL` or `CONSOLE_SUCCESS_URL` based on whether `CLAUDE_AI_INFERENCE_SCOPE`
is in scopes (`auth-code-listener.ts:80-105`). Errors get the same fallback URL (no separate
error page yet — `:111-123`).

---

## 5. `lsp/` (7 files, ~2,460 LOC)

### Lifecycle (`lsp/manager.ts`)

Singleton `LSPServerManager`, four init states: `not-started` / `pending` / `success` /
`failed`. `--bare` / SIMPLE mode skips entirely (`:148-150`). Async init with generation
counter (`initializationGeneration`, `:35`) so reinit invalidates in-flight promises.
`reinitializeLspServerManager()` (`:226-253`) is called from `refreshActivePlugins()` after
plugin caches are cleared — fixes #15521 where `loadAllPlugins()` is memoized and can be called
very early in startup before marketplaces are reconciled.

### Routing (`lsp/LSPServerManager.ts`)

Extension→server routing. `ensureServerStarted(filePath)` looks up server by extension, lazy-
starts it. `openFile`/`changeFile`/`saveFile`/`closeFile` map to the corresponding LSP
notifications (`textDocument/didOpen` etc). Extension priority: later-loaded plugins win
(`Object.assign` collision precedence — `lsp/config.ts:48-49`).

### LSP client (`lsp/LSPClient.ts`)

`vscode-jsonrpc` over child-process stdio (`spawn` with pipe stdio). Handles initialize
handshake, `onCrash` callback for unexpected exits. `pendingHandlers` queue handles
notification handlers registered before the connection is ready (lazy-init support).

### Server instance (`lsp/LSPServerInstance.ts`)

State machine: stopped → starting → running, running → stopping → stopped, any → error,
error → starting (retry). `LSP_ERROR_CONTENT_MODIFIED = -32801` retried with exponential
backoff (500ms / 1000ms / 2000ms, max 3 retries — `:17-28`). `restartCount` tracked, manual
`restart()` exposed.

### Diagnostics (`lsp/LSPDiagnosticRegistry.ts`)

Volume limits: `MAX_DIAGNOSTICS_PER_FILE = 10`, `MAX_TOTAL_DIAGNOSTICS = 30`,
`MAX_DELIVERED_FILES = 500` (LRU cap to prevent unbounded growth). Cross-turn dedup via
hash(message+severity+range) so the same warning isn't re-attached every turn. Pattern
mirrors `AsyncHookRegistry`.

### Passive feedback (`lsp/passiveFeedback.ts`)

Listens to `textDocument/publishDiagnostics` notifications, converts via
`formatDiagnosticsForAttachment()` to `DiagnosticFile[]`. URI normalization handles both
`file://` and plain paths. Severity map: 1→Error, 2→Warning, 3→Info, 4→Hint, fallback Error.

---

## 6. `teamMemorySync/` (5 files, ~2,000 LOC)

Per-repo (identified by `getRepoRemoteHash()` of git remote URL) team memory shared across
authenticated org members. **Pull overwrites local** (server wins per-key). **Push uploads
only changed entries** (delta upload via `serverChecksums` map).

### API contract (`teamMemorySync/index.ts:10-15`)

- GET `/api/claude_code/team_memory?repo=owner/repo` → `TeamMemoryData` with `entryChecksums`
- GET `?view=hashes` → metadata-only (no entry bodies)
- PUT — upload entries (upsert semantics)
- 404 = no data exists yet
- 412 = conflict (precondition failed via ETag)
- 413 = body too large (two flavors: structured `team_memory_too_many_entries` from app
  server, or unstructured HTML from gateway)

### Body limits

- `MAX_FILE_SIZE_BYTES = 250_000` per entry
- `MAX_PUT_BODY_BYTES = 200_000` per request — headroom under gateway's ~256-512KB cap
  (gateway's HTML 413 vs app's structured 413 distinguishable only by latency: ~750ms gateway
  vs ~2.3s app)
- Batches over the body limit are split into sequential PUTs (server upsert-merge makes that
  safe).
- No client-side max_entries default — server's cap is GB-tunable per-org
  (`claude_code_team_memory_limits`); learned from structured 413 and cached on `SyncState`.

### Watcher (`teamMemorySync/watcher.ts`)

`DEBOUNCE_MS = 2000` (`:35`). Initial pull on startup, then `fs.watch` on the team memory dir.
**Permanent failure suppression** (`:51`): one no_oauth device emitted 167K push events over
2.5 days (BQ Mar 14-16). Now: any 4xx except 409/429 sets `pushSuppressedReason` until next
unlink or session restart.

### Secret scanner (`teamMemorySync/secretScanner.ts`)

Curated subset of gitleaks rules. The Anthropic key prefix is **assembled at runtime**
(`['sk', 'ant', 'api'].join('-')` — `:46`) so the literal byte sequence doesn't ship in the
bundle. JS-regex notes (`:13-19`): gitleaks uses Go regex with `(?i)` and mode groups; affected
rules are rewritten with explicit `[a-zA-Z0-9]` classes. Rules for: AWS, GCP, Azure AD,
DigitalOcean, Anthropic admin/user keys, OpenAI sk-proj/svcacct/admin, HuggingFace, GitHub
PAT/fine-grained/app/oauth/refresh, GitLab PAT/deploy, Slack bot/user/app, Twilio, SendGrid,
NPM, PyPI, Databricks, HashiCorp Terraform, Pulumi, Postman, Grafana (3 variants), Sentry
(2 variants), Stripe, Shopify (2 variants), private keys.

`scanForSecrets()` returns one match per rule (deduplicated). The actual matched text is
_never_ returned. `redactSecrets()` (`:312-324`) replaces only the captured group, preserving
boundary chars.

### `teamMemorySync/teamMemSecretGuard.ts` (44 LOC)

`checkTeamMemSecrets(filePath, content)` is called from `FileWriteTool.validateInput` and
`FileEditTool.validateInput`. Returns an error message if scanner fires, null otherwise.
Inside `feature('TEAMMEM')` for DCE.

---

## 7. `remoteManagedSettings/` (5 files, ~950 LOC)

Enterprise/Console push of settings.json. ETag-based caching. Hourly polling. Fail-open:
fetch failure → continues without remote settings.

### Eligibility (`remoteManagedSettings/syncCache.ts`, `policyLimits/index.ts:167-211`)

- Console (API key): all eligible
- OAuth: only Enterprise/C4E + Team subscribers (`subscriptionType` in `enterprise|team`)

### Security gate (`remoteManagedSettings/securityCheck.tsx`)

Before applying new managed settings, if any "dangerous settings" changed/added, a blocking
modal dialog renders (`ManagedSettingsSecurityDialog`). User Reject = `gracefulShutdownSync(1)`.
Non-interactive mode skips the dialog (matches trust-dialog behavior).

### Cache (`remoteManagedSettings/syncCacheState.ts`)

- File: `~/.claude/remote-settings.json` (`SETTINGS_FILENAME = 'remote-settings.json'`).
- Tri-state eligibility: undefined / false / true. Set once via `setEligibility()` so
  subsequent reads hit cached bool.
- `getRemoteManagedSettingsSyncFromCache()` returns null when ineligible. When reading from
  disk for the first time AND cache hits, `resetSettingsCache()` is called so the merged
  `getSettings_DEPRECATED` cache (which may have been populated before remote layer was
  available) gets re-merged. gh-23085 was a real bug here.

### Checksum (`remoteManagedSettings/index.ts:131-137`)

`computeChecksumFromSettings()` recursively `sortKeysDeep()` then JSON-stringifies with no
spaces (matching Python's `separators=(",", ":"), sort_keys=True`) then SHA-256 →
`sha256:<hex>`. Lock-step with server-side hash for ETag matching.

---

## 8. `policyLimits/` (2 files, ~690 LOC)

Like `remoteManagedSettings/` but for _policy restrictions_ (e.g. `allow_remote_sessions`).
File: `~/.claude/policy-limits.json`. Eligibility same as remote-settings PLUS `enterprise|team`
OAuth subscription type. Schema (`types.ts:8-16`):

```ts
{
  restrictions: Record<string, { allowed: boolean }>;
}
```

Absence = allowed. Used by features like `RemoteAccess` to gate themselves.

---

## 9. `settingsSync/` (2 files, ~648 LOC)

Per-user (NOT per-org) settings + memory sync across Claude Code installs. Endpoint:
`/api/claude_code/user_settings`. Backend ticket: anthropic#218817.

- Keys: `~/.claude/settings.json`, `~/.claude/CLAUDE.md`,
  `projects/<projectId>/.claude/settings.local.json`,
  `projects/<projectId>/CLAUDE.local.md` (`SYNC_KEYS`, `types.ts:61-67`).
- `MAX_FILE_SIZE_BYTES = 500 * 1024` (`:53`) — 500KB per file, matches backend.
- Upload only changed entries (vs server). Two GB gates: `feature('UPLOAD_USER_SETTINGS')` AND
  `tengu_enable_settings_sync_push` (`:62-69`). Interactive CLI only.
- CCR mode (Claude Code Remote): downloads remote settings to local before plugin install.

---

## 10. `autoDream/` (4 files, ~550 LOC)

Background memory consolidation. Forks the `/dream` skill prompt as a subagent when:

1. **Time gate**: hours since `lastConsolidatedAt` >= 24 (default), GB-tunable via
   `tengu_onyx_plover.minHours`.
2. **Session gate**: count of transcript files with mtime > lastConsolidatedAt >= 5 (default),
   GB-tunable via `minSessions`.
3. **Lock**: `~/.claude/<project>/memory/.consolidate-lock`. mtime IS lastConsolidatedAt.
   Holder PID stored in body; PID-stale guard at `HOLDER_STALE_MS = 1h`. Two-process race
   handled by re-read-after-write check (`tryAcquireConsolidationLock`,
   `consolidationLock.ts:46-84`).

Skipped when KAIROS active (KAIROS uses disk-skill dream), remote mode, or auto-memory
disabled (`autoDream.ts:95-100`). Scan throttle: `SESSION_SCAN_INTERVAL_MS = 10 * 60 * 1000`
to avoid re-scanning sessions every turn when time-gate passes but session-gate doesn't.

The forked agent runs with `canUseTool = createAutoMemCanUseTool(memoryRoot)` from
`extractMemories/extractMemories.ts` — only file ops within the memory root are allowed, plus
read-only Bash. Watcher (`makeDreamProgressWatcher`) collapses tool_use blocks to a count and
collects Edit/Write file_paths.

The /dream skill prompt itself (`consolidationPrompt.ts:10-65`) has 4 phases: Orient (ls memory
dir, read entrypoint), Gather recent signal (logs, drift, transcript grep), Consolidate
(merge into existing files, convert relative dates), Prune and index (keep entrypoint <
MAX_ENTRYPOINT_LINES, < ~25KB).

---

## 11. `SessionMemory/` (3 files, ~1,026 LOC)

Per-session `.md` file maintained by background subagent updates. Two thresholds:

- `minimumMessageTokensToInit = 10000` — first time we initialize the SM file
- `minimumTokensBetweenUpdate = 5000` — context growth (delta) between updates
- `toolCallsBetweenUpdates = 3` — alternative trigger

GB gate: `tengu_session_memory`. Config: `tengu_sm_config`. The SM extraction uses
`registerPostSamplingHook` to fire after each turn; bails when `getIsRemoteMode()` or
non-interactive.

The SM file template (`prompts.ts:11-41`) has 10 sections: Session Title, Current State, Task
Specification, Files and Functions, Workflow, Errors & Corrections, Codebase and System
Documentation, Learnings, Key Results, Worklog. Each section has an italic
`_section description_` line that's a TEMPLATE INSTRUCTION — the update prompt has CRITICAL
RULES to never modify those (`:55-77`). Per-section soft cap: ~`MAX_SECTION_LENGTH = 2000`
words. Total cap: `MAX_TOTAL_SESSION_MEMORY_TOKENS = 12000` (`:9`).

`waitForSessionMemoryExtraction()` (`sessionMemoryUtils.ts:89-105`) — used by SM-compact to
avoid racing with an in-progress extraction. 15s timeout; stale extractions (>1min old) are
ignored.

---

## 12. `extractMemories/` (2 files, ~770 LOC)

The "hot" version of memory extraction — runs once per query loop end (when assistant produces
final text with no tool calls), as a forked subagent. Two prompt variants:

- **Auto-only**: `buildExtractAutoOnlyPrompt()` — single memory directory, four-type taxonomy.
- **Combined**: `buildExtractCombinedPrompt()` — auto-mem AND team-mem, with scope guidance.

Strategy (`prompts.ts:34-43`): turn 1 = parallel Reads; turn 2 = parallel Edits/Writes. Don't
interleave. Tools allowed: FileRead, Grep, Glob, read-only Bash, Edit/Write inside memory dir
only. MCP/Agent/write-Bash all denied via `canUseTool` callback.

`hasMemoryWritesSince()` (referenced from extractMemories.ts) skips extraction if main agent
already wrote memories this turn.

Closure-scoped state via `initExtractMemories()` — same pattern as `confidenceRating.ts`. Tests
call it in beforeEach for fresh state.

---

## 13. `MagicDocs/` (2 files, ~381 LOC)

Special markdown docs marked with `# MAGIC DOC: <title>` header. When a Magic Doc is read via
FileReadTool, it's registered (`registerMagicDoc(filePath)`). After session, a forked agent
updates the file in place with new learnings.

Italic line on next line after header is treated as custom instructions (`:32-78`).
`detectMagicDocHeader()` returns `{title, instructions?}`.

The update prompt (`prompts.ts:8-58`) is firmly anti-changelog: "Documentation is for
OVERVIEWS, ARCHITECTURE, and ENTRY POINTS — not detailed code walkthroughs". "BE TERSE.
High signal only."

Custom prompt override at `~/.claude/magic-docs/prompt.md` with `{{variable}}` substitution.

---

## 14. `plugins/` (3 files, ~1,616 LOC)

### `pluginCliCommands.ts` (344 LOC)

Wrappers around core ops (install/uninstall/enable/disable/disable-all/update). Telemetry on
every failure: `tengu_plugin_command_failed` with PII-tagged plugin/marketplace name fields
(`_PROTO_plugin_name`, `_PROTO_marketplace_name`). Error categorization via
`classifyPluginCommandError`.

### `PluginInstallationManager.ts` (184 LOC)

Background marketplace installation at startup. Diffs declared vs materialized marketplaces
(`diffMarketplaces`), updates AppState with `pending` / `installing` / `installed` / `failed`
status per marketplace. After installs, auto-`refreshActivePlugins()` (fixes
"plugin-not-found" errors after fresh homespace).

### `pluginOperations.ts` (1,088 LOC)

Pure library functions (no console output, no process.exit). Returns result objects. Used by
both CLI commands AND the interactive `ManagePlugins.tsx` UI. Scope sets:

- `VALID_INSTALLABLE_SCOPES = ['user', 'project', 'local']`
- `VALID_UPDATE_SCOPES = ['user', 'project', 'local', 'managed']` (managed only updateable, not
  installable from CLI — managed plugins come from managed-settings.json).

Functions: `installPluginOp`, `uninstallPluginOp`, `enablePluginOp`, `disablePluginOp`,
`disableAllPluginsOp`, `updatePluginOp`. Reverse-dependent resolution
(`findReverseDependents`) so removing X warns about plugins that depend on it.

---

## 15. `tips/` (3 files, ~761 LOC)

Onboarding tips shown on the spinner during long ops. `tipRegistry.ts` (686 LOC) is a long
list of `Tip` objects with `id`, `content`, `cooldownSessions`. Tips can be relevance-gated by
`TipContext` (filePath regex, bashTools matched). Marketplace plugin tips check
`isMarketplacePluginRelevant` against detected file/CLI signals (e.g. seeing `*.tf` files
suggests installing terraform plugin).

`tipScheduler.ts` selects "tip with longest time since shown" — round-robin LRU. History in
global config (`numStartups` counter). Setting `spinnerTipsEnabled = false` disables.

`tipHistory.ts` (17 LOC): `recordTipShown` + `getSessionsSinceLastShown`.

---

## 16. `PromptSuggestion/` (2 files, ~1,514 LOC)

Generates suggestion buttons after the model finishes. Forked agent (cache-shared) generates
~3 candidate next-prompts in parallel.

### Gating (`promptSuggestion.ts:37-94`)

- `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION` env override
- `tengu_chomp_inflection` GB gate
- Disabled in non-interactive (print mode, piped input, SDK)
- Disabled for swarm teammates (only leader gets suggestions)
- User setting `promptSuggestionEnabled` (defaults true)

### Speculation (`speculation.ts` 991 LOC)

`startSpeculation()` runs the suggested prompt _speculatively_ in an overlay sandbox before the
user picks. Limits: `MAX_SPECULATION_TURNS = 20`, `MAX_SPECULATION_MESSAGES = 100`. Read-only
tools allowed: `Read, Glob, Grep, ToolSearch, LSP, TaskGet, TaskList`. Write tools (`Edit,
Write, NotebookEdit`) denied.

Bash gating: `commandHasAnyCd` and `checkReadOnlyConstraints` from `BashTool/bashPermissions`
to filter only safe subset.

Overlay: `~/.claude/tmp/speculation/<pid>/<id>` — temporary copy of the working tree. On
acceptance, `copyOverlayToMain()` promotes the changes; on rejection,
`safeRemoveOverlay()` cleans up.

---

## 17. `toolUseSummary/` (1 file, 112 LOC)

`generateToolUseSummary()` — Haiku-based summarization of completed tool batches. Used by the
SDK to show progress to mobile clients. System prompt requests git-commit-subject style under
30 chars (`:15-24`). Truncates input/output JSON to 300 chars before prompt. Errors are
swallowed (summaries are non-critical) but logged with `errorId =
E_TOOL_USE_SUMMARY_GENERATION_FAILED`.

---

## 18. `AgentSummary/` (1 file, 179 LOC)

Background sub-agent summarization for coordinator mode. Polls every 30s
(`SUMMARY_INTERVAL_MS`). For each tick: read latest agent transcript, fork a no-tools
summary call (`canUseTool` denies but tools stay in request for cache match), extract 3-5
word present-tense (-ing) action description.

Prompt examples (`agentSummary.ts:33-44`): "Reading runAgent.ts" / "Fixing null check in
validate.ts". Anti-examples: past tense, too vague, branch names, full sentences.

`forkContextMessages` is dropped from base params at start (`:53-55`) — closure would otherwise
pin original messages forever; transcript is re-read each tick.

---

## Standalone files (top-level `services/`)

Not in scope (M8 = api/, M9 = mcp/) but worth noting they sit alongside:

- `awaySummary.ts`, `claudeAiLimits.ts` (rate-limit messaging),
  `diagnosticTracking.ts`, `internalLogging.ts`, `mockRateLimits.ts`, `notifier.ts`,
  `preventSleep.ts`, `rateLimitMessages.ts`, `rateLimitMocking.ts`, `tokenEstimation.ts`,
  `vcr.ts`, `voice.ts`, `voiceKeyterms.ts`, `voiceStreamSTT.ts`,
  `mcpServerApproval.tsx`.

`tokenEstimation.ts` is referenced from compaction (`roughTokenCountEstimation`,
`roughTokenCountEstimationForMessages`).

---

## Cross-cutting patterns

### Pattern A: Forked-agent that shares parent prompt cache

Used by: compact (compact.ts:1188-1199), agentSummary, autoDream, magicDocs,
sessionMemory, extractMemories, promptSuggestion. **Hard rule** at every site:

> DO NOT set maxOutputTokens here. The fork piggybacks on the main thread's prompt cache
> by sending identical cache-key params (system, tools, model, messages prefix, thinking
> config). Setting maxOutputTokens would clamp budget_tokens via Math.min(budget,
> maxOutputTokens-1) in claude.ts, creating a thinking config mismatch that invalidates the
> cache.

`runForkedAgent()` is the helper. `createCacheSafeParams()` extracts the cache-relevant subset
of the parent's params.

### Pattern B: Module-level state with closure-scoped reset

Used by: extractMemories, autoDream, sessionMemory. `init*()` function creates fresh state in
a closure; tests call it in beforeEach. Avoids `module-level let` that bleeds across tests.

### Pattern C: ETag/checksum-based caching with hourly polling

remoteManagedSettings, policyLimits, teamMemorySync. All use:

- SHA-256 over recursively sorted JSON (`sha256:<hex>` prefix)
- `If-None-Match: <etag>` requests
- 304 = cache valid → no work
- File cache at `~/.claude/<service>.json`
- Hourly background poll (`POLLING_INTERVAL_MS = 60 * 60 * 1000`)
- 30s loading-promise timeout to prevent deadlocks
- Fail-open (network failure → continue without)

### Pattern D: GrowthBook gate + env override + setting cascade

```
env var (USER set) → GB gate (Anthropic) → user setting (default true) → disabled
```

Order matters: env wins everything. GB gate is the kill-switch. User setting is the daily knob.

### Pattern E: Per-Bash-tool error semantics

In StreamingToolExecutor (`:357-363`) and partitioning logic, only Bash errors cancel
sibling tools. Read/WebFetch/Grep errors don't cascade. The implicit assumption: Bash commands
have implicit dependency chains (`mkdir foo && cd foo && npm install` — first failure breaks
all subsequent), but other tools are independent.

### Pattern F: Recursion guards on querySource

compact/autoCompact `shouldAutoCompact` returns false when `querySource ===
'session_memory'` or `'compact'` (forked agents that would deadlock). Also `marble_origami`
(ctx-agent — autocompact's cleanup would destroy main thread's committed log).

### Pattern G: Process-shared module-level state with race-aware writes

autoDream's lock file uses mtime AS lastConsolidatedAt. Two processes both reclaiming a stale
lock both write their PID; last-writer-wins, loser bails on re-read
(consolidationLock.ts:71-83). Same pattern in pinned-cache-edits.

---

## Top 10 findings (cite-anchored)

1. **Compact = 4-strategy ladder** — time-based MC, cached MC, session-memory, summarizer.
   `compact/microCompact.ts:267-285`, `compact/sessionMemoryCompact.ts:514-630`,
   `compact/compact.ts:387-763`.
2. **Forked-agent cache-sharing rule** — never set maxOutputTokens on cache-shared forks.
   `compact/compact.ts:1182-1199`, `AgentSummary/agentSummary.ts:100-119`.
3. **Bash-only sibling cancellation** — `StreamingToolExecutor.ts:357-363`.
4. **PII type system** — two never-typed marker types prevent code/path leaks.
   `analytics/index.ts:19-58`.
5. **Datadog allowlist-only** — only ~30 events go to Datadog despite hundreds in 1P.
   `analytics/datadog.ts:19-65`.
6. **Localhost OAuth listener + manual paste fallback** —
   `oauth/auth-code-listener.ts:18-211`, `oauth/index.ts:69-86`.
7. **Client-side gitleaks-derived secret scanner** for team memory writes —
   `teamMemorySync/secretScanner.ts:23-224`. Anthropic key prefix assembled at runtime.
8. **Three near-duplicate "remote managed" services** with subtly different eligibility — see
   §7-§9 above. RMS = enterprise/team/console; PolicyLimits = enterprise/team OAuth only;
   SettingsSync = per-user, interactive-only.
9. **LSP is plugin-only** — no user/project settings configure LSP servers.
   `lsp/config.ts:26-43`.
10. **Hooks compose with rules, not replace them** — Hook `allow` doesn't bypass `deny` rules.
    `tools/toolHooks.ts:332-433`.

## Top 5 to-port priorities (for AGI Workforce)

1. **Compaction subsystem (P0).** Currently compaction in apps/cli is rudimentary; the
   reference's 4-strategy ladder + cache-aware microcompact + circuit breaker + PTL retry is
   the depth-of-functionality moat. Maps cleanly to Rust traits: `Compactor` trait with 4
   impls, ordered try-and-fall-through. Estimated 2-3 weeks for full port.
2. **Tool orchestration: streaming + permission hook integration (P0).** apps/cli has a
   simpler runner; add `StreamingToolExecutor` semantics (read-only batching, Bash sibling
   cancellation, abort cascading). The hook permission resolution
   (`resolveHookPermissionDecision`) is the key contract. ~1.5 weeks.
3. **OAuth PKCE + localhost listener (P1).** apps/cli auth is OAuth-bearer-via-config-file
   today. Add the localhost listener + manual paste flow. Crypto + listener is
   small (~200 LOC each); the polish is in success-page redirects and scope
   handling. ~1 week.
4. **Team memory secret scanner (P1).** Single file ~325 LOC; the hardest part is keeping
   gitleaks rules in sync. Mandatory before any memory-sync feature ships, given the
   "shared with all repository collaborators" exposure surface.
5. **Analytics PII discipline (P1, before scaling).** Even before we add Datadog/1P, port the
   `_PROTO_*` strip + the `AnalyticsMetadata_I_VERIFIED_*` marker types so the codebase has
   the discipline baked in from day 1. The strip is ~15 LOC; the discipline pays for itself
   the first time someone adds a `tool_input` field to an analytics event.

Bonus port: **`runForkedAgent` helper** — once compaction lands, the same pattern unlocks
agent-summary, dream, prompt-suggestion, magic-docs, session-memory, extract-memories. One
helper, six features.
