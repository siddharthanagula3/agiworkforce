# M8 — `services/api/` Deep Dive (Anthropic-coupled HTTP layer)

> **Scope.** Every file in `~/Desktop/reference/src/services/api/` (20 files, ~290 KB total). This is the wire-protocol layer that `packages/providers/anthropic/` mirrors. It IS the Anthropic SDK contract — beta headers, streaming events, retry semantics, prompt-cache marker placement, fallback model selection, three-provider client construction (Bedrock / Vertex / Foundry / direct), session-ingress JWT logging, files-API download. We need to invert almost every Anthropic-specific assumption when porting to multi-provider.
> **Total LOC.** `claude.ts` 3,419 + `errors.ts` 1,208 + `withRetry.ts` 823 + `promptCacheBreakDetection.ts` 728 + `logging.ts` 789 + `client.ts` 390 + `sessionIngress.ts` 515 + `filesApi.ts` 600+ + small files. ~7,500+ LOC in this directory.
> **Files inventoried.** `adminRequests.ts`, `bootstrap.ts`, `claude.ts`, `client.ts`, `dumpPrompts.ts`, `emptyUsage.ts`, `errors.ts`, `errorUtils.ts`, `filesApi.ts`, `firstTokenDate.ts`, `grove.ts`, `logging.ts`, `metricsOptOut.ts`, `overageCreditGrant.ts`, `promptCacheBreakDetection.ts`, `referral.ts`, `sessionIngress.ts`, `ultrareviewQuota.ts`, `usage.ts`, `withRetry.ts`. (20 files.)

---

## 1. `claude.ts` — the streaming generator (3,419 LOC, 100 KB)

### 1.1 Top-level exports

| Symbol                                                                  | Lines     | What it does                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getExtraBodyParams(betaHeaders?)`                                      | 272-331   | Parse `CLAUDE_CODE_EXTRA_BODY` env var, merge `anthropic_beta` array, inject `anti_distillation: ['fake_tools']` for 1P CLI per `tengu_anti_distill_fake_tool_injection` GrowthBook flag                                                                                                                                                                                        |
| `getPromptCachingEnabled(model)`                                        | 333-356   | 4 disable env vars: global, Haiku, Sonnet, Opus                                                                                                                                                                                                                                                                                                                                 |
| `getCacheControl({scope, querySource})`                                 | 358-374   | Returns `{type:'ephemeral', ttl?:'1h', scope?:'global'}`                                                                                                                                                                                                                                                                                                                        |
| `should1hCacheTTL(querySource)`                                         | 393-434   | Bedrock-PAYG bypass via `ENABLE_PROMPT_CACHING_1H_BEDROCK`; subscriber + non-overage gate; GrowthBook `tengu_prompt_cache_1h_config.allowlist` with `*` prefix matching; **latched** in bootstrap state to prevent mid-session TTL flip (~20K token cache bust)                                                                                                                 |
| `configureEffortParams(...)`                                            | 440-466   | `output_config.effort` for string; `extraBodyParams.anthropic_internal.effort_override` for numeric (ant-only)                                                                                                                                                                                                                                                                  |
| `configureTaskBudgetParams(...)`                                        | 479-501   | EAP `task_budget = {type:'tokens', total, remaining?}`; only with `shouldIncludeFirstPartyOnlyBetas()`; pushes `TASK_BUDGETS_BETA_HEADER`                                                                                                                                                                                                                                       |
| `getAPIMetadata()`                                                      | 503-528   | Builds `metadata.user_id` containing `device_id` + `account_uuid` (OAuth) + `session_id` + custom `CLAUDE_CODE_EXTRA_METADATA`                                                                                                                                                                                                                                                  |
| `verifyApiKey(apiKey, isNonInteractive)`                                | 530-586   | Sends `max_tokens:1` Haiku ping; classifies `"authentication_error"` from JSON body                                                                                                                                                                                                                                                                                             |
| `userMessageToMessageParam(...)`                                        | 588-631   | Adds `cache_control` to last block; **clones array content** (line 627) to prevent in-place mutations from `insertCacheEditsBlock`                                                                                                                                                                                                                                              |
| `assistantMessageToMessageParam(...)`                                   | 633-674   | Skips cache_control on `thinking` / `redacted_thinking` / `connector_text` blocks                                                                                                                                                                                                                                                                                               |
| `Options` type                                                          | 676-707   | The 28-field options bag — `getToolPermissionContext`, `model`, `toolChoice`, `extraToolSchemas`, `maxOutputTokensOverride`, `fallbackModel`, `onStreamingFallback`, `querySource`, `agents`, `mcpTools`, `agentId`, `outputFormat`, `fastMode`, `advisorModel`, `taskBudget`, `enablePromptCaching`, `skipCacheWrite`, `temperatureOverride`, `effortValue`, `addNotification` |
| `queryModelWithoutStreaming`                                            | 709-750   | Wraps `queryModel` in `withStreamingVCR`; collects single assistant message                                                                                                                                                                                                                                                                                                     |
| `queryModelWithStreaming`                                               | 752-780   | Same but yields all events                                                                                                                                                                                                                                                                                                                                                      |
| `executeNonStreamingRequest`                                            | 818-917   | Generator that yields `SystemAPIErrorMessage`s during retry, returns final `BetaMessage`. Per-attempt timeout: 120s for `CLAUDE_CODE_REMOTE`, 300s otherwise (807-811). Caps `max_tokens` to `MAX_NON_STREAMING_TOKENS = 64_000` (line 3354) to bypass SDK 21,333-token derived cap                                                                                             |
| `queryModel` (private)                                                  | 1017-2892 | **The 1,876-line streaming generator** — see §1.2                                                                                                                                                                                                                                                                                                                               |
| `cleanupStream(stream)`                                                 | 2898-2912 | Aborts via `stream.controller.abort()`                                                                                                                                                                                                                                                                                                                                          |
| `updateUsage(usage, partUsage)`                                         | 2924-2987 | **Non-overwrite of input/cache tokens** when `partUsage` has 0 (line 2932-2945); `service_tier`, `inference_geo`, `iterations`, `speed` all carried                                                                                                                                                                                                                             |
| `accumulateUsage`                                                       | 2993-3038 | Sums input/output/cache tokens; latest service_tier/iterations/speed                                                                                                                                                                                                                                                                                                            |
| `addCacheBreakpoints(...)`                                              | 3063-3211 | **Exactly one cache_control marker per request** (line 3089: `markerIndex = skipCacheWrite ? len-2 : len-1`); cached-microcompact `cache_edits` block insertion via `insertBlockAfterToolResults`; auto-tags `cache_reference: tool_use_id` on tool_result blocks before last cache_control                                                                                     |
| `buildSystemPromptBlocks`                                               | 3213-3237 | Splits system prompt by cache scope; max blocks = N (warn against more — 400 error)                                                                                                                                                                                                                                                                                             |
| `queryHaiku({systemPrompt, userPrompt, outputFormat, signal, options})` | 3241-3291 | One-shot Haiku via VCR with `getEmptyToolPermissionContext()`                                                                                                                                                                                                                                                                                                                   |
| `queryWithModel({...})`                                                 | 3300-3348 | Same shape but generic over `options.model`                                                                                                                                                                                                                                                                                                                                     |
| `MAX_NON_STREAMING_TOKENS = 64_000`                                     | 3354      | Cap for non-streaming fallback (10-min API limit; SDK derives 21,333 from 128k/hr, this overrides via client-level timeout)                                                                                                                                                                                                                                                     |
| `adjustParamsForNonStreaming`                                           | 3364-3392 | Caps `max_tokens` AND adjusts `thinking.budget_tokens` to `cap-1`                                                                                                                                                                                                                                                                                                               |
| `getMaxOutputTokensForModel(model)`                                     | 3399-3418 | `tengu_otk_slot_v1` flag → 8K default cap; `CLAUDE_CODE_MAX_OUTPUT_TOKENS` env override capped at `upperLimit`                                                                                                                                                                                                                                                                  |

### 1.2 The `queryModel` streaming generator — phases (1017-2892)

Phase 1 (1031-1255): **Pre-flight — model gate, beta resolution, tool filtering**

- L1031-1049: Off-switch check via `tengu-off-switch.activated` GrowthBook flag, but **only for non-subscribers running Opus** — yields `CUSTOM_OFF_SWITCH_MESSAGE = "Opus is experiencing high load, please use /model to switch to Sonnet"`.
- L1057-1062: Bedrock-only — resolve `application-inference-profile` model strings via `getInferenceProfileBackingModel`.
- L1065-1071: Classify `isAgenticQuery` from `querySource` prefix (`repl_main_thread`, `agent:`, `sdk`, `hook_agent`, `verification_agent`).
- L1071: `getMergedBetas(model, {isAgenticQuery})` — **central beta resolver** (utils/betas.ts).
- L1076-1115: Advisor: server-side tool with `type: 'advisor_20260301'` and `model: advisorModel`; pushed into `extraToolSchemas` at L1390-1394 with sentinel cast `as unknown as BetaToolUnion`.
- L1118-1182: ToolSearch handling — defers loading of MCP tools when count > threshold; uses `extractDiscoveredToolNames(messages)` to learn from prior `tool_reference` blocks; provider-aware beta header (`getToolSearchBetaHeader()`: 1P/Foundry get `advanced-tool-use`, Vertex/Bedrock get `tool-search-tool`); **for Bedrock the header goes in `extraBodyParams`, NOT betas array**.
- L1188-1205: Cached microcompact (`CACHED_MICROCOMPACT` feature) — first-party + `repl_main_thread` only, model-supported gate via `isModelSupportedForCacheEditing`.
- L1207-1228: Global cache strategy resolver — `useGlobalCacheFeature && needsToolBasedCacheMarker` (some MCP tool will render and not defer).

Phase 2 (1248-1326): **Tool schema build, message normalization, fingerprinting**

- L1235-1246: `Promise.all(filteredTools.map(toolToAPISchema))` — schema build is async because LSP tools may need init status.
- L1266: `normalizeMessagesForAPI(messages, filteredTools)` — strips internal fields, coerces tool inputs.
- L1283-1296: **Mid-conversation model-switch repair** — strip `tool_reference` blocks and `caller` field if model doesn't support tool-search but the messages already have them.
- L1301: `ensureToolResultPairing` — inserts synthetic error tool_results for orphaned tool_use; strips orphan tool_results. (Critical for `--resume` and remote/teleport recovery.)
- L1304-1306: Strip advisor blocks if `ADVISOR_BETA_HEADER` not in betas.
- L1312-1315: `stripExcessMediaItems(messages, API_MAX_MEDIA_PER_REQUEST=100)` — silently drops oldest images/PDFs to stay under API's 100-media limit.
- L1325: `computeFingerprintFromMessages` — for attribution header. **Must run BEFORE injecting deferred-tools synthetic message** (L1330-1345).

Phase 3 (1358-1494): **System prompt assembly, latched headers, prompt-state recording**

- L1358-1369: System prompt = `[attribution, CLI sysprompt prefix, ...userSystemPrompt, advisor instructions, chrome instructions]`.
- L1376-1379: `buildSystemPromptBlocks` returns `TextBlockParam[]` with cache_control markers per scope.
- L1412-1456: **Sticky-on latches** — once first set, these headers keep being sent for the rest of session to preserve cache key (~50-70K tokens):
  - `afkHeaderLatched` (Auto Mode / TRANSCRIPT_CLASSIFIER)
  - `fastModeHeaderLatched` (`speed='fast'`)
  - `cacheEditingHeaderLatched` (CACHED_MICROCOMPACT)
  - `thinkingClearLatched` (set when last call > 1hr ago)
- L1471-1485: `recordPromptState` — captures everything cache-relevant.
- L1498: `startLLMRequestSpan` — telemetry.

Phase 4 (1538-1729): **`paramsFromContext` closure — builds the API request body**

This closure is invoked **once for the request, then again for each retry** with `RetryContext` from `withRetry` (so retries see updated `maxTokensOverride`, `model`, `fastMode`).

- L1559-1609: thinking config — adaptive (no budget) when `modelSupportsAdaptiveThinking`; otherwise `{type:'enabled', budget_tokens: min(maxTokens-1, getMaxThinkingTokensForModel)}`.
- L1632-1637: `context_management` from `apiMicrocompact.getAPIContextManagement` (returns `{edits: ...}` for the `context-management-2025-XX-XX` beta).
- L1653: `speed = 'fast'` when fast mode active and not in cooldown.
- L1655-1657, L1664-1670: lazily-pushed beta headers `FAST_MODE_BETA_HEADER`, `AFK_MODE_BETA_HEADER`.
- L1693-1695: **temperature is only sent when thinking is disabled** — API requires `temperature: 1` with thinking and that is the default.
- L1699-1728: assembled `BetaMessageStreamParams` body with `model`, `messages` (post `addCacheBreakpoints`), `system`, `tools`, `tool_choice`, `betas`, `metadata`, `max_tokens`, `thinking`, `temperature`, `context_management`, `output_config`, `speed`, plus `extraBodyParams` spread.

Phase 5 (1776-2403): **`withRetry`-wrapped streaming attempt loop**

- L1822-1832: `anthropic.beta.messages.create({...params, stream:true}, {signal, headers:{...}}).withResponse()` — uses raw stream (NOT `BetaMessageStream`) to avoid O(n²) `partialParse()` on every `input_json_delta`.
- L1814-1816: **First-party only**: inject `x-client-request-id` UUID header for timeout-correlation server-side log lookup (3P providers don't log it; some strict proxies reject unknown headers — inc-4029 class).
- L1874-1929: **Stream watchdog** (`CLAUDE_ENABLE_STREAM_WATCHDOG`): fires after `STREAM_IDLE_TIMEOUT_MS = 90s` (`CLAUDE_STREAM_IDLE_TIMEOUT_MS` overrideable), with a half-time warning. Critical because SDK's request timeout only covers initial fetch(), NOT streaming body — silent-drop connections would hang forever.
- L1940-2304: **The streaming event switch** — every event type:
  - `message_start` (1980-1994): captures `partialMessage`; computes `ttftMs`; updates `usage` from `message_start.usage`; ant-only `research` field.
  - `content_block_start` (1995-2052): for `tool_use` + `server_tool_use`, initializes `input: ''` (string, accumulated via `input_json_delta`); for `text`, initializes `text: ''` (the SDK awkwardly returns text in content_block_start AND repeats it in content_block_delta — comments at L2022-2027); for `thinking`, initializes `thinking: ''` AND `signature: ''` (so signature-delta-never-arrives doesn't crash); for `advisor_tool_result` server tool, sets `isAdvisorInProgress = false`.
  - `content_block_delta` (2053-2169): sub-switch on `delta.type`:
    - `citations_delta` (2084): TODO — citations not handled.
    - `input_json_delta` (2087-2112): assert tool_use/server_tool_use, append `partial_json` to `input` string.
    - `text_delta` (2113-2126): assert text block, append.
    - `signature_delta` (2127-2147): two cases — `connector_text` (FEATURE) or `thinking`.
    - `thinking_delta` (2148-2161): append.
    - `connector_text_delta` (2068-2081): FEATURE-gated (`CONNECTOR_TEXT`); appends to `connector_text` field.
  - `content_block_stop` (2171-2212): builds `AssistantMessage`, runs `normalizeContentFromAPI` (which executes the per-tool input transforms registered in `Tool.ts`), pushes to `newMessages`, **yields** the message immediately.
  - `message_delta` (2213-2294): cumulative `usage` (NOT incremental — Anthropic streaming sends totals each event); writes back to last message via **direct mutation** (NOT object replace — the transcript write queue holds a 100ms-delayed reference, replacement would disconnect it); records final `stop_reason`; computes USD cost via `calculateUSDCost(resolvedModel, usage)` and adds to `addToTotalSessionCost`; refusal handling via `getErrorMessageIfRefusal`; `max_tokens` AND `model_context_window_exceeded` both yield `apiError: 'max_output_tokens'` recovery message.
  - `message_stop` (2295-2296): no-op (info already in message_delta).
  - **Every event** also yielded as `{type: 'stream_event', event: part, ttftMs?}` (2299-2303) so consumers see raw SDK events.
- L2310-2335: If watchdog fired → throw `'Stream idle timeout'`; falls into catch block.
- L2350-2363: **Empty-stream detection** — `!partialMessage` (proxy returned 200 + non-SSE) OR `newMessages.length===0 && !stopReason` (proxy returned message_start then ended) — both throw `'Stream ended without receiving any events'` to trigger fallback.
- L2382-2392: `checkResponseForCacheBreak` (PROMPT_CACHE_BREAK_DETECTION feature).
- L2394-2403: Process fallback-percentage header + quota status from `streamResponse.headers` via `extractQuotaStatusFromHeaders` (in `claudeAiLimits.ts`).

Phase 6 (2404-2807): **Catch — non-streaming fallback OR final error**

- L2434-2462: User abort path. Distinguishes user-press-ESC (signal.aborted) from SDK internal timeout (which spuriously throws `APIUserAbortError`). The latter is rethrown as `APIConnectionTimeoutError`.
- L2469-2502: `CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK` env / `tengu_disable_streaming_to_non_streaming_fallback` GrowthBook flag — short-circuit the fallback because mid-stream fallback can cause double tool execution (incident-4258 — partial stream starts a tool, fallback non-streaming retry produces same tool_use, runs again).
- L2541-2569: **The fallback path** — calls `executeNonStreamingRequest` with `initialConsecutive529Errors: is529Error(streamingError) ? 1 : 0` so total 529-count toward fallback model is consistent regardless of which path hit overload.
- L2607-2749: **404 stream-creation fallback** — gateways often return 404 for streaming endpoints but accept non-streaming. Pre-v2.1.8 `BetaMessageStream` threw 404 during iteration (caught above); now raw streams throw 404 during creation (caught here).
- L2598-2605: `FallbackTriggeredError` always rethrown — it must propagate to `query.ts` for actual model switch.
- L2808-2831: `finally` — **`releaseStreamResources`** must run to free Response object's native TLS/socket buffers (V8 heap leak per GH #32920); cost accumulation for fallback path that yielded outside try.
- L2843-2849: `setLastMainRequestId` for `repl_main_thread`/`sdk` so shutdown can send cache eviction hint.
- L2857-2888: `logAPISuccessAndDuration` fire-and-forget — uses precomputed scalars to avoid pinning the entire `messagesForAPI` closure until promise resolves.

### 1.3 The `addCacheBreakpoints` algorithm (3063-3211)

Per L3082-3089 comments, **exactly one message-level `cache_control` marker** per request — Mycro's page_manager evicts local-attention KV pages at any cached prefix position not in `cache_store_int_token_boundaries`, and a second marker would protect the second-to-last position needlessly while still freeing locals. For fire-and-forget forks (`skipCacheWrite=true`), the marker shifts to the second-to-last message so the write is a no-op merge on Mycro and the fork doesn't leave its own tail in the KVCC.

Then for cached-microcompact: re-insert all `pinnedEdits` at their original positions (deduplicating against `seenDeleteRefs`), insert new `cache_edits` block in the last user message (post-tool-result via `insertBlockAfterToolResults`), and add `cache_reference: tool_use_id` to all tool_result blocks **strictly before** the last cache_control marker (not "before or on" — strict to avoid edge cases where edits-splicing shifts indices).

---

## 2. `client.ts` — provider-multiplexing (390 LOC)

### 2.1 Headers

`defaultHeaders` (L105-116):

- `x-app: cli`
- `User-Agent: getUserAgent()`
- `X-Claude-Code-Session-Id: getSessionId()`
- `x-claude-remote-container-id` if `CLAUDE_CODE_CONTAINER_ID`
- `x-claude-remote-session-id` if `CLAUDE_CODE_REMOTE_SESSION_ID`
- `x-client-app: clientApp` if `CLAUDE_AGENT_SDK_CLIENT_APP`
- Custom headers from `ANTHROPIC_CUSTOM_HEADERS` (newline-separated `Name: Value` curl-style; split on FIRST colon — no regex backtracking on malformed long lines)
- `x-anthropic-additional-protection: true` if `CLAUDE_CODE_ADDITIONAL_PROTECTION`

### 2.2 Five client constructors

| Provider            | Env trigger               | SDK                                            | Constructor args                                                                                                                                                                                                                                                                                                                                                  | Auth path                                                                                                                                                 |
| ------------------- | ------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Direct** (1P)     | (default)                 | `Anthropic`                                    | `apiKey` (subscriber-null) + `authToken` (OAuth access token if subscriber) + optional `baseURL` from `OAUTH_BETA_HEADER` config when `USE_STAGING_OAUTH`                                                                                                                                                                                                         | `getAnthropicApiKey()` or `Bearer ${getClaudeAIOAuthTokens().accessToken}`                                                                                |
| **Bedrock**         | `CLAUDE_CODE_USE_BEDROCK` | `@anthropic-ai/bedrock-sdk` `AnthropicBedrock` | `awsRegion` (per-model override `ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION` for Haiku) + `awsAccessKey/SecretKey/SessionToken` from `refreshAndGetAwsCredentials()`                                                                                                                                                                                                   | `AWS_BEARER_TOKEN_BEDROCK` (sets `skipAuth:true` + `Authorization: Bearer ${token}`) OR refreshed AWS credentials OR `CLAUDE_CODE_SKIP_BEDROCK_AUTH` mock |
| **Foundry** (Azure) | `CLAUDE_CODE_USE_FOUNDRY` | `@anthropic-ai/foundry-sdk` `AnthropicFoundry` | optional `azureADTokenProvider` from `@azure/identity` `getBearerTokenProvider(new DefaultAzureCredential(), 'https://cognitiveservices.azure.com/.default')`                                                                                                                                                                                                     | `ANTHROPIC_FOUNDRY_API_KEY` (default; SDK reads it) OR Azure AD AAD via DefaultAzureCredential                                                            |
| **Vertex**          | `CLAUDE_CODE_USE_VERTEX`  | `@anthropic-ai/vertex-sdk` `AnthropicVertex`   | `region` from `getVertexRegionForModel(model)` (priority: `VERTEX_REGION_CLAUDE_*` per-model env vars > `CLOUD_ML_REGION` > config default > `us-east5`); `googleAuth` from `new GoogleAuth({scopes: ['https://www.googleapis.com/auth/cloud-platform']})` with `projectId` only set as last-resort fallback (avoids 12s GCE-metadata-server timeout outside GCP) | `GOOGLE_APPLICATION_CREDENTIALS` ADC OR `GCLOUD_PROJECT/GOOGLE_CLOUD_PROJECT` env                                                                         |
| **Common**          | All                       | All                                            | `defaultHeaders`, `maxRetries`, `timeout: API_TIMEOUT_MS \|\| 600_000`, `dangerouslyAllowBrowser: true`, `fetchOptions: getProxyFetchOptions({forAnthropicAPI:true})`                                                                                                                                                                                             | —                                                                                                                                                         |

Notable: `getAnthropicClient()` is called **inside** `withRetry`'s `getClient` callback, so client creation re-runs on auth errors (clearing AWS/GCP credential caches). Comment at L153-189 about why this is necessary for Bedrock auth refresh.

### 2.3 The `buildFetch(fetchOverride, source)` function (358-389)

Wraps native fetch. Generates `x-client-request-id: randomUUID()` per-request **only if first-party** (`getAPIProvider() === 'firstParty' && isFirstPartyAnthropicBaseUrl()`) — Bedrock/Vertex/Foundry don't log it and unknown headers risk strict-proxy rejection (inc-4029 class). Logs every API request with path + request-id + source for `--debug`.

`CLIENT_REQUEST_ID_HEADER = 'x-client-request-id'` (L356) — **the timeout-correlation handle**. When SDK throws timeout, server can't supply request-id; this client-side UUID is logged and given to the API team to grep server logs.

---

## 3. `errors.ts` — the classification matrix (1,208 LOC)

### 3.1 Constants

- `API_ERROR_MESSAGE_PREFIX = 'API Error'`
- `PROMPT_TOO_LONG_ERROR_MESSAGE = 'Prompt is too long'`
- `CREDIT_BALANCE_TOO_LOW_ERROR_MESSAGE = 'Credit balance is too low'`
- `INVALID_API_KEY_ERROR_MESSAGE = 'Not logged in · Please run /login'`
- `INVALID_API_KEY_ERROR_MESSAGE_EXTERNAL = 'Invalid API key · Fix external API key'`
- `ORG_DISABLED_ERROR_MESSAGE_ENV_KEY` and `..._WITH_OAUTH`
- `TOKEN_REVOKED_ERROR_MESSAGE = 'OAuth token revoked · Please run /login'`
- `CCR_AUTH_ERROR_MESSAGE = 'Authentication error · This may be a temporary network issue, please try again'` (Claude Code Remote — JWT-based auth, transient blip)
- `REPEATED_529_ERROR_MESSAGE = 'Repeated 529 Overloaded errors'`
- `CUSTOM_OFF_SWITCH_MESSAGE = 'Opus is experiencing high load, please use /model to switch to Sonnet'`
- `OAUTH_ORG_NOT_ALLOWED_ERROR_MESSAGE`

### 3.2 The 30-branch `getAssistantMessageFromError` (425-934)

This is the user-facing translation layer. Each branch matches a specific error pattern → returns an `AssistantMessage` with `apiError` field. Full inventory of branches in matching order:

1. `APIConnectionTimeoutError` or `APIConnectionError` w/ "timeout" → `'Request timed out'`.
2. `ImageSizeError` / `ImageResizeError` → `'Image was too large.'`.
3. `CUSTOM_OFF_SWITCH_MESSAGE` substring → off-switch (rate_limit).
4. **429 with new rate-limit headers** (the heart of the rate-limit UX):
   - Reads `anthropic-ratelimit-unified-representative-claim` (`five_hour | seven_day | seven_day_opus`)
   - `anthropic-ratelimit-unified-overage-status` (`allowed | allowed_warning | rejected`)
   - `anthropic-ratelimit-unified-reset` (Unix-sec reset timestamp)
   - `anthropic-ratelimit-unified-overage-reset`
   - `anthropic-ratelimit-unified-overage-disabled-reason` (typed `OverageDisabledReason`)
   - Builds `ClaudeAILimits` object → `getRateLimitErrorMessage(limits, model)` returns specific message OR null (silent — let fallback handle, user sees nothing).
5. 429 without unified headers — **NOT a quota limit** (entitlement rejection like 1M context without Extra Usage). Surfaces actual API wording.
6. `'prompt is too long'` → set `errorDetails: error.message` (reactive compact's `getPromptTooLongTokenGap` parses `actualTokens`/`limitTokens` from this raw string).
7. `/maximum of \d+ PDF pages/` → `getPdfTooLargeErrorMessage()`.
8. `'The PDF specified is password protected'`.
9. `'The PDF specified was not valid'` (HTML renamed to .pdf).
10. 400 + `'image exceeds'`/`'maximum'`.
11. 400 + `'image dimensions exceed'`/`'many-image'` (2000px stricter limit).
12. 400 + AFK_MODE_BETA_HEADER mention (plan doesn't include auto mode).
13. 413 → `'Request too large'`.
14. 400 + `tool_use ids were found without tool_result blocks immediately after` → `tengu_tool_use_tool_result_mismatch_error` log (with normalized + pre-normalized message sequences for Statsig; ant message includes `/share` link).
15. 400 + `unexpected tool_use_id found in tool_result` → log `tengu_unexpected_tool_result`.
16. 400 + `tool_use ids must be unique` → log `tengu_duplicate_tool_use_id` + `/rewind` recovery hint.
17. **Subscriber-Opus invalid model name** — guides to `/logout && /login` after plan upgrade.
18. **Ant-only invalid model name** — surfaces orgId for support hand-off.
19. `'Your credit balance is too low'`.
20. 400 + `'organization has been disabled'` — special-cases stale `ANTHROPIC_API_KEY` overriding subscription auth.
21. `'x-api-key'` substring — branches on CCR mode (transient JWT blip), external source (`ANTHROPIC_API_KEY` / `apiKeyHelper`), or stored OAuth.
22. 403 + `'OAuth token has been revoked'`.
23. 401/403 + `'OAuth authentication is currently not allowed for this organization'`.
24. Generic 401/403 — CCR-mode aware.
25. Bedrock + `'model id'` (no model ID in error) → suggests `/model` switch with **`get3PModelFallbackSuggestion`** (Opus-4-6 → opus41, Sonnet-4-6 → sonnet45, Sonnet-4-5 → sonnet40).
26. 404 → same fallback suggestion path.
27. `APIConnectionError` → `formatAPIError(error)` from `errorUtils.ts`.
28. Generic `Error` → `${API_ERROR_MESSAGE_PREFIX}: ${message}`.

### 3.3 `classifyAPIError` (965-1161)

Returns Datadog-tagged string: `aborted`, `api_timeout`, `repeated_529`, `capacity_off_switch`, `rate_limit`, `server_overload`, `prompt_too_long`, `pdf_too_large`, `pdf_password_protected`, `image_too_large`, `tool_use_mismatch`, `unexpected_tool_result`, `duplicate_tool_use_id`, `invalid_model`, `credit_balance_low`, `invalid_api_key`, `token_revoked`, `oauth_org_not_allowed`, `auth_error`, `bedrock_model_access`, `server_error` (5xx), `client_error` (4xx), `ssl_cert_error`, `connection_error`, `unknown`.

### 3.4 `categorizeRetryableAPIError` (1163-1182)

For SDK consumers — maps to `SDKAssistantMessageError`: `rate_limit` (429/529/overloaded_error), `authentication_failed` (401/403), `server_error` (>=408), `unknown`.

### 3.5 `getErrorMessageIfRefusal` (1184-1207)

`stop_reason === 'refusal'` → AUP-violation message. **Cross-model suggestion**: if model isn't `claude-sonnet-4-20250514`, suggests `/model claude-sonnet-4-20250514` for repeated refusals.

---

## 4. `withRetry.ts` — the retry state machine (823 LOC)

### 4.1 Constants

- `DEFAULT_MAX_RETRIES = 10`
- `FLOOR_OUTPUT_TOKENS = 3000`
- `MAX_529_RETRIES = 3` (consecutive 529s before fallback)
- `BASE_DELAY_MS = 500`
- `PERSISTENT_MAX_BACKOFF_MS = 5 * 60 * 1000` (5 min, ant-only `CLAUDE_CODE_UNATTENDED_RETRY`)
- `PERSISTENT_RESET_CAP_MS = 6 * 60 * 60 * 1000` (6 hr cap)
- `HEARTBEAT_INTERVAL_MS = 30_000` (chunk long sleeps so host doesn't mark session idle)
- `DEFAULT_FAST_MODE_FALLBACK_HOLD_MS = 30 * 60 * 1000` (30 min fast→standard cooldown)
- `SHORT_RETRY_THRESHOLD_MS = 20_000` (under this → retry with fast mode active to preserve cache; over → cooldown)
- `MIN_COOLDOWN_MS = 10 * 60 * 1000` (10 min min cooldown floor — prevents flip-flopping)

### 4.2 `FOREGROUND_529_RETRY_SOURCES` (62-82)

Whitelist of `QuerySource` strings that DO retry on 529: `repl_main_thread` + outputStyle variants, `sdk`, `agent:custom/default/builtin`, `compact`, `hook_agent`/`hook_prompt`, `verification_agent`, `side_question`, `auto_mode` (security classifier — must complete for correctness), `bash_classifier` (BASH_CLASSIFIER feature, ant-only). Everything else (summaries, titles, suggestions, classifiers) bails immediately on 529 — during a capacity cascade each retry is 3-10× gateway amplification.

### 4.3 The `withRetry` generator (170-517)

For each attempt 1..maxRetries+1:

1. Check abort signal.
2. Mock rate limit injection (ant-only `/mock-limits`).
3. **Client refresh conditions** (L218-251): stale connection (ECONNRESET/EPIPE), 401 status, OAuth token revoked, Bedrock auth, Vertex auth, **OR first attempt** → call `getClient()`. On 401 OR token-revoked, also call `handleOAuth401Error(failedAccessToken)` to force token refresh.
4. Run operation.
5. On error, branch:
   - **Fast mode** + 429/529: read `anthropic-ratelimit-unified-overage-disabled-reason`, either `handleFastModeOverageRejection` (permanent disable + retry without fast mode) OR `triggerFastModeCooldown` (30-min cooldown switching to standard speed) OR retry with fast mode if retry-after < 20s (preserve cache).
   - **Fast mode** + 400 + "Fast mode is not enabled" → `handleFastModeRejectedByAPI` (permanent disable).
   - 529 + non-foreground source → log `tengu_api_529_background_dropped` + `CannotRetryError`.
   - **529 fallback path** (L327-365): `consecutive529Errors++`; at 3 → emit `FallbackTriggeredError` if `fallbackModel` set, else `CannotRetryError`. Gated by `FALLBACK_FOR_ALL_PRIMARY_MODELS` env OR (non-subscriber + Opus model).
   - `parseMaxTokensContextOverflowError` (L388-426): regex `input length and \`max_tokens\` exceed context limit: (\d+) \+ (\d+) > (\d+)`. Computes `availableContext = contextLimit - inputTokens - 1000`, sets `retryContext.maxTokensOverride = max(FLOOR_OUTPUT_TOKENS, availableContext, thinking_budget+1)`.
   - Otherwise: `getRetryDelay(attempt, retry-after, maxDelayMs=32000)` → `min(BASE_DELAY * 2^(attempt-1), maxDelayMs) + Math.random()*0.25*baseDelay` (full jitter).
6. **Persistent mode** (`CLAUDE_CODE_UNATTENDED_RETRY`): chunks long sleeps into 30-second blocks, yielding `SystemAPIErrorMessage` each chunk so host doesn't mark session idle; uses `getRateLimitResetDelayMs` to wait until window reset (5hr/Max-Pro) instead of polling.

### 4.4 `shouldRetry(error)` (696-787)

In order:

- Mock rate limit → never retry.
- Persistent + 429/529 → always retry (bypass subscriber gate + x-should-retry).
- CCR-mode 401/403 → retry (JWT auth, transient).
- `"type":"overloaded_error"` substring → retry.
- `parseMaxTokensContextOverflowError` matches → retry (with adjusted max_tokens).
- `x-should-retry: true` → retry only if non-subscriber OR enterprise.
- `x-should-retry: false` → don't retry, EXCEPT ant-user 5xx.
- `APIConnectionError` → retry.
- 408 (timeout), 409 (lock), 401, 403-token-revoked, >=500 → retry.
- 429 → retry only if non-subscriber OR enterprise.

### 4.5 Error classes

```typescript
class CannotRetryError extends Error {
  constructor(originalError: unknown, retryContext: RetryContext);
  // Preserves originalError.stack
}
class FallbackTriggeredError extends Error {
  constructor(originalModel: string, fallbackModel: string);
  // Must propagate to query.ts for actual model switch
}
```

---

## 5. `promptCacheBreakDetection.ts` — the cache key tracker (728 LOC)

Two-phase per query:

**Phase 1 (recordPromptState, 247-430)**: Snapshot system blocks, tool schemas, model, fast mode, global cache strategy, sorted betas, AFK active flag, overage flag, cached-MC flag, effort value, extra-body params hash. Computes 13 separate hash/equality checks against previous state; sets `pendingChanges` if any changed. **MAX_TRACKED_SOURCES = 10** to prevent unbounded growth across subagents (each agentId becomes a key).

**Phase 2 (checkResponseForCacheBreak, 437-666)**: Compare `cacheReadTokens` vs previous. Skip if drop < 5% OR < `MIN_CACHE_MISS_TOKENS = 2_000`. If a cache deletion was pending (cached-MC), skip — that's expected. Build reason string from `pendingChanges`; if no client-side change but >5min/1hr gap, label as TTL-expiry; else "likely server-side". Log `tengu_prompt_cache_break` with sanitized tool names (MCP → 'mcp'). Write a unified diff via `createPatch` to `~/.claude/temp/cache-break-{4chars}.diff`.

**Tracked sources**: `repl_main_thread*`, `sdk`, `agent:custom`, `agent:default`, `agent:builtin`. `compact` aliased to `repl_main_thread`. Subagents distinguished by `agentId` to prevent false-positives on concurrent same-type agents.

`CACHE_TTL_5MIN_MS` and `CACHE_TTL_1HOUR_MS` exported (L125-126).

---

## 6. `usage.ts` — rate-limit + extra-usage utilization (64 LOC)

Polls `${BASE_API_URL}/api/oauth/usage` (5-second timeout). Returns:

```typescript
type Utilization = {
  five_hour?: RateLimit | null;
  seven_day?: RateLimit | null;
  seven_day_oauth_apps?: RateLimit | null;
  seven_day_opus?: RateLimit | null;
  seven_day_sonnet?: RateLimit | null;
  extra_usage?: ExtraUsage | null;
};
type RateLimit = { utilization: number | null; resets_at: string | null };
type ExtraUsage = {
  is_enabled: boolean;
  monthly_limit: number | null;
  used_credits: number | null;
  utilization: number | null;
};
```

Returns `{}` if not subscriber or no profile scope. Returns `null` if OAuth expired (skip API call to avoid 401). Throws on auth-header error.

---

## 7. `sessionIngress.ts` — session JWT log persistence (515 LOC)

Per-session sequential append wrapper (`getOrCreateSequentialAppend`) prevents concurrent log writes interleaving. `MAX_RETRIES = 10`, `BASE_DELAY_MS = 500`, exponential cap 8s.

PUT request to session URL with **`Last-Uuid: <uuid>` optimistic-concurrency header**. On **409 conflict**:

- Check `x-last-uuid` response header — if matches our entry's UUID, our entry was already stored → recover.
- Else, adopt server's `x-last-uuid` from header, retry.
- Else, re-fetch session via GET, find last UUID via `findLastUuid` (walks backwards skipping non-UUID entry types like SummaryMessage/TagMessage), retry.
- Else, give up (`session_persist_fail_concurrent_modification`).

401 → non-retryable (token expired). 5xx + 429 → retryable.

`getTeleportEvents(sessionId, accessToken, orgUUID)` — paginated via `next_cursor`; CCR v2 Sessions API; max 100 pages × 1000/page = 100k events. Replaces `session-ingress` once retired. 404 ambiguous (session genuinely not found OR threadstore not yet backfilled to Spanner) — returns null on page 0 to let caller fall back to session-ingress.

---

## 8. `filesApi.ts` — Files API client (600+ LOC, partial)

Beta header: `'files-api-2025-04-14,oauth-2025-04-20'` (L27 — `oauth-2025-04-20` enables Bearer OAuth on public-API routes; without it returns 404).

`ANTHROPIC_VERSION = '2023-06-01'` (L28).

Base URL: `process.env.ANTHROPIC_BASE_URL || process.env.CLAUDE_CODE_API_BASE_URL || 'https://api.anthropic.com'`.

`downloadFile(fileId, config)`: GET `/v1/files/{fileId}/content` with `Bearer ${oauthToken}`, 60s timeout, max 500MB, retries with exponential backoff. 404 → throw immediately, 401 → throw immediately, 403 → throw immediately, otherwise retry.

`buildDownloadPath(basePath, sessionId, relativePath)`: rejects `..` traversal, builds `${basePath}/${sessionId}/uploads/${normalized}`.

---

## 9. `bootstrap.ts` — first-party config bootstrap (142 LOC)

Hits `${BASE_API_URL}/api/claude_cli/bootstrap` with OAuth (`OAUTH_BETA_HEADER` + Bearer) OR x-api-key. **Skipped for 3P providers** (L48-51) — bootstrap is 1P-only. Returns:

```typescript
{
  client_data: Record<string, unknown> | null;
  additional_model_options: Array<{ value: model; label: name; description: string }> | null;
}
```

Persisted to `globalConfig.clientDataCache` + `additionalModelOptionsCache` only on change (`isEqual` from lodash).

---

## 10. `metricsOptOut.ts` — org metrics setting (160 LOC)

Two-tier cache: in-memory 1hr + disk 24hr. Disk cache makes `claude -p` invocations collapse to ~1 API call/day. Hits `https://api.anthropic.com/api/claude_code/organizations/metrics_enabled`. Skipped if `isEssentialTrafficOnly()` (kill switch), or subscriber without profile scope.

---

## 11. `grove.ts`, `referral.ts`, `overageCreditGrant.ts`, `ultrareviewQuota.ts`, `firstTokenDate.ts`, `adminRequests.ts` — Account API surface

These fetch various consumer-plan account data via OAuth from `${BASE_API_URL}/api/oauth/...` endpoints:

- **grove.ts**: Privacy notification settings (`grove_enabled`, `grove_notice_viewed_at`). Memoized per-session.
- **referral.ts**: Guest-pass eligibility/redemptions (Max-only). 24hr cache; in-flight dedupe prevents concurrent fetch.
- **overageCreditGrant.ts**: Per-org overage grant info (`available`, `eligible`, `granted`, `amount_minor_units`, `currency`). 1hr cache. USD-only formatting.
- **ultrareviewQuota.ts**: `/v1/ultrareview/quota` — `reviews_used`, `reviews_limit`, `reviews_remaining`, `is_overage`.
- **firstTokenDate.ts**: One-time post-login capture of `claude_code_first_token_date`.
- **adminRequests.ts**: Team/Enterprise non-billing-admin "request a limit increase / seat upgrade" CRUD. POST/GET to `/api/oauth/organizations/{orgUUID}/admin_requests`.

Common pattern: `prepareApiRequest()` → `{accessToken, orgUUID}`; headers `getOAuthHeaders(accessToken) + 'x-organization-uuid': orgUUID`; cache via `globalConfig` writes.

---

## 12. Streaming protocol — every event type emitted

Events emitted by `queryModel`'s for-await loop (1940-2304):

| Event type                                                                                                                        | Source | Yielded as                                                           | Side effect                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `message_start`                                                                                                                   | API    | `{type:'stream_event', event, ttftMs}`                               | Sets `partialMessage`, `usage`, `ttftMs`; ant-only `research`                                                                                                      |
| `content_block_start` (text)                                                                                                      | API    | `{type:'stream_event', event}`                                       | Init content block with empty text                                                                                                                                 |
| `content_block_start` (tool_use / server_tool_use)                                                                                | API    | `{type:'stream_event', event}`                                       | Init content block with empty input string; advisor flag                                                                                                           |
| `content_block_start` (thinking)                                                                                                  | API    | `{type:'stream_event', event}`                                       | Init thinking block with empty thinking + signature                                                                                                                |
| `content_block_delta` (text_delta / input_json_delta / signature_delta / thinking_delta / citations_delta / connector_text_delta) | API    | `{type:'stream_event', event}`                                       | Append to corresponding field on content block; assert block type matches delta type                                                                               |
| `content_block_stop`                                                                                                              | API    | `{type:'stream_event', event}` + emit `AssistantMessage` immediately | Run `normalizeContentFromAPI`, push to newMessages                                                                                                                 |
| `message_delta`                                                                                                                   | API    | `{type:'stream_event', event}`                                       | Update cumulative usage; record stop_reason; **mutate** last message in-place; calculate USD cost; refusal handling; max_tokens / context_window_exceeded recovery |
| `message_stop`                                                                                                                    | API    | `{type:'stream_event', event}`                                       | No-op                                                                                                                                                              |
| `ping`                                                                                                                            | API    | yielded as `stream_event`                                            | (No special handling per file — covered by switch's default fall-through.)                                                                                         |
| `error`                                                                                                                           | SDK    | thrown → caught by withRetry                                         | Triggers retry / fallback                                                                                                                                          |

`StreamEvent` shape (from `src/types/message.ts`): `{type:'stream_event', event: BetaRawMessageStreamEvent, ttftMs?: number}`.

The generator can also yield `SystemAPIErrorMessage` from withRetry's heartbeat loop (persistent mode), and the final `AssistantMessage` (after content_block_stop).

---

## 13. Beta headers — full inventory used in this directory

Imports from `src/constants/betas.js`:

- `AFK_MODE_BETA_HEADER` (Auto Mode / TRANSCRIPT_CLASSIFIER feature)
- `CONTEXT_1M_BETA_HEADER` (Sonnet 1M experiment)
- `CONTEXT_MANAGEMENT_BETA_HEADER` (`context-management-2025-XX-XX`)
- `EFFORT_BETA_HEADER` (effort string param)
- `FAST_MODE_BETA_HEADER` (fast mode dedicated rate limits)
- `PROMPT_CACHING_SCOPE_BETA_HEADER` (`prompt-caching-scope-2025-XX-XX` for global cache)
- `REDACT_THINKING_BETA_HEADER`
- `STRUCTURED_OUTPUTS_BETA_HEADER` (output_format / json_schema)
- `TASK_BUDGETS_BETA_HEADER` (`task-budgets-2026-03-13` EAP, claude-strudel-eap only)
- `ADVISOR_BETA_HEADER` (`advisor_20260301`)
- `OAUTH_BETA_HEADER` (`oauth-2025-04-20` from constants/oauth.ts)

Inventory headers from spec §10.6 / §12: `skills-2025-10-02`, `computer-use-2025-01-24`, `managed-agents-2026-04-01`, `files-api-2025-04-14`. **`files-api-2025-04-14` is hard-coded at `filesApi.ts:27`.** Tool-search header from `getToolSearchBetaHeader()`: 1P/Foundry get `advanced-tool-use`, Vertex/Bedrock get `tool-search-tool` — provider-aware split. Bedrock receives the tool-search header via `extraBodyParams.anthropic_beta`, NOT the betas array — different SDK contract.

`getMergedBetas(model, {isAgenticQuery})` (utils/betas.ts) is the central beta resolver — adds `advisor` if enabled, `prompt-caching-scope` if global-cache, `context-1m` for 1M experiment treatment, etc.

---

## 14. Service tiers (claudeAiLimits.ts surface)

The `BetaUsage.service_tier` field (`'standard' | 'priority' | 'flex' | 'batch'`) is read in `EMPTY_USAGE` (default `'standard'`) and carried through `updateUsage` (line 2955: `service_tier: usage.service_tier` — the most recent), `accumulateUsage` (line 3013: `service_tier: messageUsage.service_tier`). Latest one wins in cumulative summaries. Inventory §10.3 confirms tiers Standard / Priority / Flex / Batch with Batch=50% discount, Priority=committed-spend.

`BetaUsage.speed` (`'standard' | 'fast'`) similarly carried — fast mode dedicated rate limits per inventory §10.3.

`BetaUsage.inference_geo` (string) — for Trust-center US-only/EU residency tracking per inventory §11.1. Stored in Usage but not directly inspected in this file.

---

## 15. Critical security findings (cross-reference inventory §F.6)

**CVE-2026-21852 (CVSS 5.3) ANTHROPIC_BASE_URL override**: Per inventory §F.6, attackers exploited `ANTHROPIC_BASE_URL` to exfiltrate API keys. In this directory, `process.env.ANTHROPIC_BASE_URL` is read at:

- `claude.ts` (logging only, via `getAnthropicEnvMetadata` in logging.ts L143)
- `client.ts` (no direct read — relies on SDK's `baseURL` priority)
- `filesApi.ts:34` — `process.env.ANTHROPIC_BASE_URL || ... || 'https://api.anthropic.com'`
- `logging.ts:143-148, 277` — embedded in analytics metadata as-is (potential PII leak in telemetry if user pastes a malicious URL, but this is metadata-only, not auth)

**Patched behavior**: Inventory documents that `ANTHROPIC_BASE_URL` is no longer used to override OAuth-flow target — but the SDK still respects it. The `isFirstPartyAnthropicBaseUrl()` check at `client.ts:367` and `claude.ts:1814` controls whether `x-client-request-id` is sent — when env var points to non-1P URL, header is suppressed.

---

## 16. What we'll need to invert for multi-provider (provider-coupling points)

Every one of the following assumptions is Anthropic-only and breaks for OpenAI/Google/Ollama/xAI/etc.:

1. **`anthropic.beta.messages.create()`** — every SDK call is on this path. OpenAI uses `chat.completions.create` or `responses.create`; Google uses `generateContent`/`streamGenerateContent`; Ollama uses `/api/chat`. We need a `ProviderAdapter.stream(req)` wrapper (already in `packages/types/provider-adapter.ts` per CLAUDE.md), and the entire `queryModel` body must move into the adapter.
2. **Beta headers via `betasParams: string[]`** — OpenAI and Google have nothing equivalent. They use top-level fields (e.g., OpenAI's `response_format`, Google's `safetySettings`). Our adapter contract needs `req.options` namespace.
3. **`cache_control: {type:'ephemeral', ttl:'1h', scope:'global'}`** — OpenAI has no client-controlled prompt-cache marker (server-side automatic since GPT-4-turbo). Google's prompt-caching is via separate `cachedContents` API. Cross-provider continuity requires stripping cache_control on egress to non-Anthropic providers.
4. **`thinking: {type:'adaptive'} | {type:'enabled', budget_tokens}`** — OpenAI's reasoning is via `reasoning: {effort: 'low'|'medium'|'high'|'minimal'}` on Responses API; Google's via `thinking_config`. Different name AND different shape.
5. **Streaming events `message_start / content_block_* / message_delta / message_stop`** — OpenAI streams `chat.completion.chunk` deltas; Google streams JSON parts. The `content_block_start` initial-text quirk noted at L2022-2027 is Anthropic-specific.
6. **Tool-use `{type:'tool_use', id, name, input:{}}` + `{type:'tool_result', tool_use_id, content}`** — OpenAI uses `tool_calls: [{id, type:'function', function:{name, arguments: stringified}}]` + `{role:'tool', tool_call_id, content}`. Google uses `functionCall: {name, args}` + `functionResponse: {name, response}`. The packages/llm-normalize layer is what handles these — and the FINAL_AUDIT calls out P0s in google + ollama tool_result handling.
7. **`stop_reason: 'end_turn'|'max_tokens'|'tool_use'|'refusal'|'model_context_window_exceeded'|'pause_turn'|'stop_sequence'`** — OpenAI uses `finish_reason: 'stop'|'length'|'tool_calls'|'content_filter'|'function_call'`. Google uses `finishReason: 'STOP'|'MAX_TOKENS'|'SAFETY'|'RECITATION'`. Refusal handling assumes Anthropic-specific `'refusal'` stop reason (errors.ts L1184-1207).
8. **Five-client constructor in `client.ts`** — direct/Bedrock/Foundry/Vertex are all wrappers around the same Anthropic Messages contract. Multi-provider needs N×5 constructors OR a clean `ProviderAdapter.makeClient()` interface.
9. **All claudeAiLimits tracking** (`anthropic-ratelimit-unified-*` headers) — OpenAI has `x-ratelimit-limit-requests/tokens` + `x-ratelimit-remaining-*`; Google has none. Rate-limit handling must be per-adapter.
10. **OAuth subscriber flow** (`isClaudeAISubscriber()`, `getClaudeAIOAuthTokens()`) — only Anthropic accepts this auth model. xAI/DeepSeek/Perplexity/Moonshot/Qwen/Zhipu are all API-key-only. OpenAI has its own OAuth (per `memory/oauth-providers.md`). Our auth state needs `provider` discriminant.
11. **`anthropic.beta.messages` specifically** — Anthropic's stable `messages` endpoint diverged from beta for some features. Any port must decide which endpoint maps to which capability.
12. **`@anthropic-ai/foundry-sdk` / `@anthropic-ai/bedrock-sdk` / `@anthropic-ai/vertex-sdk`** — these are Anthropic-published wrappers around 3P clouds. OpenAI on Azure uses `openai` SDK with `apiVersion`; Google on Vertex uses `@google-cloud/aiplatform`. Port must replicate the per-cloud adapter pattern.
13. **`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_CUSTOM_HEADERS`, `ANTHROPIC_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL`, `CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY`, `AWS_BEARER_TOKEN_BEDROCK`, `ANTHROPIC_FOUNDRY_API_KEY`, `ANTHROPIC_VERTEX_PROJECT_ID`, `VERTEX_REGION_*`** — every env var is `ANTHROPIC_*`-namespaced. Multi-provider needs `<PROVIDER>_*` namespacing OR a unified `LLM_PROVIDER`+`LLM_API_KEY`+`LLM_BASE_URL`.
14. **All `tengu_*` analytics events** — single-provider naming. Generic events should not contain provider-specific names.

---

## 17. Reusable patterns for `packages/api/`

Despite the Anthropic coupling, the following architecture patterns are 100% portable and should be lifted as-is:

1. **The `withRetry` generator with sticky `RetryContext`** — `model`, `maxTokensOverride`, `thinkingConfig`, `fastMode` all carry across attempts. The `getClient` callback inside withRetry enables per-attempt auth refresh. The `CannotRetryError` + `FallbackTriggeredError` taxonomy cleanly separates "retried but exhausted" from "model fallback should happen". Generic over any provider error class.
2. **Streaming watchdog** (90-second idle timeout via `setTimeout` reset on each chunk) — provider-agnostic. SDK-level timeouts only cover initial fetch, NOT streaming body. Any streaming provider needs this.
3. **Latched session-stable beta flags** to preserve cache key — applies to any provider with prompt caching where header changes break cache (OpenAI's reasoning summary, Google's cached_content references).
4. **`x-client-request-id` UUID injection** for timeout correlation when server doesn't return request-id — provider-agnostic, just need a correlation header per provider.
5. **`addCacheBreakpoints` "exactly one marker" pattern** with cloned content arrays to avoid in-place mutation contamination from secondary queries — directly applicable to any provider with explicit cache markers.
6. **`stripExcessMediaItems` silent-truncation** instead of erroring on the >100-media limit — graceful degradation pattern useful for any media-bearing provider.
7. **`ensureToolResultPairing` orphan repair** for resume/teleport flows — any provider with tool-call/result-id pairing needs this. (The FINAL_AUDIT notes packages/google has a tool_result.name break — this exact repair logic ports.)
8. **The `getAssistantMessageFromError` 30-branch matcher** — pattern-matches error message strings to user-actionable messages with recovery hints. Needs per-provider matchers since error wording differs, but the structural pattern (errorDetails preserved separately for downstream parsing like `getPromptTooLongTokenGap`) is reusable.
9. **`PromptCacheBreakDetection` two-phase tracker** — the snapshot-then-diff pattern for per-call cache delta with `pendingChanges` carry-forward is a great model for any cross-provider cache-effectiveness telemetry.
10. **`detectGateway` from `logging.ts:107-139`** — fingerprints LiteLLM, Helicone, Portkey, Cloudflare AI Gateway, Kong, Braintrust, Databricks via response-header prefixes OR baseURL host suffixes. Critical for multi-provider since users routing through gateways need correct attribution.
11. **`adjustParamsForNonStreaming`**: cap `max_tokens` AND adjust `thinking.budget_tokens` to `cap-1` in concert. Generalize to any "budget < ceiling" relationship.
12. **`buildFetch` per-request UUID injection** + log line is a clean pattern for any provider needing client-side request-id correlation.
13. **The `Options` 28-field shape** is closely tied to features but the discipline of one big options bag — instead of positional args — is a model for any complex client.
14. **Service-tier aware usage accumulation** (`updateUsage` carries latest service_tier rather than first/last) — applies to any provider with tiered quotas.

---

## 18. Closing notes

The single biggest takeaway: this directory is the **complete contract** with the Anthropic Messages API. Every header, every event, every error code, every cache marker, every retry condition. Porting it to multi-provider isn't "swap out the SDK" — it's defining a `ProviderAdapter` interface that abstracts the **wire format**, the **error vocabulary**, the **streaming-event shape**, the **rate-limit headers**, the **cache-control mechanism**, the **auth mechanism**, AND the **cloud-deploy variants** (Bedrock/Vertex/Foundry equivalents per provider).

The good news: the architecture (withRetry generator, streaming for-await loop with idle watchdog, sticky-on latched headers for cache stability, per-call PromptStateSnapshot) is provider-agnostic and should be reused verbatim in `packages/api/` shared code. The bad news: the Anthropic-specific bits (the 30-branch error matcher, the cache_control marker placement, the beta-header soup) all need 1:N replication for our 12 named providers.

For Differentiator #1 (multi-provider in one chat) and Differentiator #3 (cross-provider continuity), the key inversion point is making `addCacheBreakpoints` and `normalizeContentFromAPI` call into adapter-specific normalizers (already in `packages/llm-normalize`). The streaming generator stays generic; the per-event handlers fan out to per-adapter delta-handlers.

`Tool-call normalization` between providers is already locked as differentiator #3. The `ensureToolResultPairing` + `stripCallerFieldFromAssistantMessage` + `stripToolReferenceBlocksFromUserMessage` trio at `claude.ts:1283-1306` is the model for what cross-provider switch-mid-conversation needs to do — strip Anthropic-specific fields when handing the messages to a non-Anthropic adapter.
