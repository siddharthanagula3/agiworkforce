# Gap Matrix — `packages/api/`, `packages/providers/`, `packages/llm-normalize/`

**Compared against:** Anthropic Claude Code's `services/api/` (~7,500 LOC across 20 files) plus its 8-transport `services/mcp/` provider-routing surface and the cross-provider invariants spelled out in `tasks/research/deep/m8-services-api.md` and `tasks/research/deep/m9-services-mcp.md`.

**Surface in scope (verified count, 2026-05-08):**

- `packages/api/src/` = 57 modules, 7,376 LOC. **Pure typed Tauri-command wrappers.** Not a provider/wire layer at all — `chat.ts`, `mcp.ts`, `models.ts`, `ollama.ts`, `completion.ts` etc. are 1:1 IPC bindings to `#[tauri::command]` Rust handlers (`packages/api/src/index.ts:1-77`). No HTTP, no SSE parsing, no retry/fallback/normalization logic lives here. The Anthropic-equivalent for everything in `m8-services-api.md` is the **Rust** side of the desktop / `apps/cli/`, not this package.
- `packages/providers/` = 8 adapters (`anthropic`, `openai`, `google`, `ollama`, `xai`, `deepseek`, `perplexity`, `lmstudio`) — 41 source files (excluding tests + tsbuildinfo). All implement `ProviderAdapter` from `packages/types/src/provider-adapter.ts:321-343`. Generator pattern: `async *stream(req, signal): AsyncIterable<StreamChunk>` — yields the canonical 8-variant union (`StreamChunkText` / `Thinking` / `ToolUseStart` / `ToolUseDelta` / `ToolUseEnd` / `Usage` / `Error` / `Stop`) defined at `provider-adapter.ts:236-244`.
- `packages/llm-normalize/` = 12 source files (10 top-level + 3 lib + 4 tests), 2,633 LOC total verified by `wc -l`. Pure functions, OpenClaw-derived. No IO, no SDK couplings.

**Bottom line: across all three packages combined, the multi-provider routing layer matches roughly 25-30% of Anthropic's `services/api/` capability surface.** The vendor-SDK plumbing (per-provider `stream()`, request translation, SSE parse) is solid; the cross-cutting infrastructure (retry generator, sticky-latched headers, stream watchdog, fallback model state machine, gateway fingerprinting, cloud-provider constructors, error classification matrix, prompt-cache-break tracker) is **almost entirely absent** and lives nowhere in the TS workspace today.

---

## Have

### packages/providers/anthropic

- `createAnthropicAdapter` wraps `@anthropic-ai/sdk` `messages.stream()` with `signal` plumb-through (`anthropic/src/index.ts:69-141`).
- `translateChatRequest` produces `AnthropicTranslatedRequest` with `system` block split, `cache_control` per-block passthrough, `thinking: enabled|disabled` config, `tool_choice` of `{auto|any|tool|none}` (`anthropic/src/translate.ts:188-220`).
- `translateAnthropicStream` maps the 6 canonical events (`message_start` / `content_block_start` / `content_block_delta` / `content_block_stop` / `message_delta` / `message_stop`) to `StreamChunk`s (`anthropic/src/stream.ts:49-149`).
- `buildAnthropicReplayPolicy` drops unsigned `thinking` blocks before round-trip (`anthropic/src/replay-policy.ts:11-33`).
- `parseRetryAfter` honours both delta-seconds and HTTP-date forms of `Retry-After` (`anthropic/src/retry-after.ts:18-47`).
- `ANTHROPIC_MODEL_CATALOG` derives entries from `models.json` filtered by `provider === 'anthropic'` — locked-rule compliant (`anthropic/src/catalog.ts:33-37`).
- Single `betaFeatures: string[]` config knob produces an `anthropic-beta` default header on construct (`anthropic/src/index.ts:74-80`).
- `service_tier: 'auto' | 'standard_only'` config knob applied via `applyAnthropicPayloadPolicyToParams` only when `allowsAnthropicServiceTier` gate matches (`anthropic-payload-policy.ts:222-229`).

### packages/providers/openai

- Two-path adapter: Chat Completions (`/v1/chat/completions`) by default; opt-in Responses API (`/v1/responses`) via `useResponsesApi` flag (`openai/src/index.ts:136-169 / 202-227`).
- `translateChatRequest` honours `OpenAICompletionsCompatDefaults`: `supportsDeveloperRole`, `supportsStrictMode`, `supportsReasoningEffort`, `supportsUsageInStreaming`, `maxTokensField` toggle (`openai/src/translate.ts:204-248`).
- `translateChatRequestToResponses` produces full Responses input-item array with `function_call` / `function_call_output` ordering preserved (`openai/src/translate-responses.ts:200-241`).
- `translateOpenAIStream` accumulates tool_call deltas per-`index` (rebuilding id+name from first chunk), maps `delta.reasoning_content` → `thinking-delta`, drains trailing-usage chunk (`openai/src/stream.ts:44-142`).
- `translateOpenAIResponsesStream` maps 11 typed Responses events incl. `output_text.delta`, `function_call_arguments.delta`, `reasoning_summary_text.delta`, `refusal.delta`, `incomplete`, `failed` (`openai/src/stream-responses.ts:47-183`).
- `parseRetryAfterFromError` reads `err.headers` or `err.response.headers` (`openai/src/retry-after.ts`).
- /models discovery merges with curated catalog (`openai/src/index.ts:101-125`).

### packages/providers/google

- Direct HTTP (no SDK) to `generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse` (`google/src/index.ts:79-141`).
- API key sent via `x-goog-api-key` header (FINAL_AUDIT P0 PACKAGES-GOOGLE-APIKEY-IN-URL fixed at `google/src/index.ts:91-106`).
- `parseGeminiStream` handles SSE frame buffering + trailing-chunk flush (`google/src/stream.ts:35-79`).
- `translateGeminiStream` maps `STOP` / `MAX_TOKENS` / safety reasons to canonical stop reasons; surfaces `cachedContentTokenCount` + `thoughtsTokenCount` (`google/src/stream.ts:15-33, :134-153`).
- `buildToolUseNameMap` rebuilds `functionResponse.name` from prior `tool_use` blocks — fixes FINAL_AUDIT P0 PACKAGES-GOOGLE-TOOL-RESULT-NAME (`google/src/translate.ts:48-86`).
- `cleanSchemaForGemini` strips 17 unsupported keywords + flattens literal anyOf to enum + resolves `$ref` (`packages/llm-normalize/src/lib/clean-for-gemini.ts:25-55`).

### packages/providers/ollama

- Direct HTTP to `${baseUrl}/api/chat` (`ollama/src/index.ts:71-132`).
- `translateChatRequest` splits multiple `tool_result` blocks each into its own `role:'tool'` message — fixes FINAL_AUDIT P0 PACKAGES-OLLAMA-TOOL-RESULT-LOSS (`ollama/src/translate.ts:55-86`).
- `forceContextWindow` + `keepAliveSeconds` config knobs (`ollama/src/index.ts:75-83`).
- `think: true` toggle when `req.thinking?.type === 'enabled'` (`ollama/src/translate.ts:135`).

### packages/providers/{xai,deepseek,perplexity,lmstudio}

- All four reuse `@agiworkforce/providers-openai`'s `translateChatRequest` + `translateOpenAIStream` via `provider:` discriminant routing through `detectOpenAICompletionsCompat` (`xai/src/index.ts:91-126`, `deepseek/src/index.ts:88-122`, `perplexity/src/index.ts:132-168`, `lmstudio/src/index.ts:84-118`).
- Perplexity adds `withCitationFooter` to inject markdown-formatted citations as a synthetic `text-delta` before stop (`perplexity/src/index.ts:81-110`).
- LMStudio dynamic-only catalog (no curated list) — every call hits `/v1/models` (`lmstudio/src/index.ts:69-82`).
- xAI / DeepSeek / Perplexity use OpenAI npm SDK with `baseURL` override.

### packages/llm-normalize

- `resolveAnthropicPayloadPolicy` + `applyAnthropicPayloadPolicyToParams` — gate `service_tier` on (provider, api, endpointClass) tuple; apply ephemeral `cache_control` to system prompt + last user turn only when `enableCacheControl: true`; respects `AGIWORKFORCE_CACHE_RETENTION` env (`anthropic-payload-policy.ts:199-244`).
- `resolveOpenAIResponsesPayloadPolicy` + `applyOpenAIResponsesPayloadPolicy` — gate `store`, strip `prompt_cache_key`, strip `reasoning: 'none'`, set `compactThreshold` (`openai-responses-payload-policy.ts:341-410`).
- `detectOpenAICompletionsCompat` returns `(capabilities, defaults)` per (provider, baseUrl, model). Knows 19 endpoint classes — `openai-public`, `azure-openai`, `openai-codex`, `xai-native`, `deepseek-native`, `cerebras-native`, `chutes-native`, `groq-native`, `mistral-public`, `moonshot-native`, `modelstudio-native`, `opencode-native`, `openrouter`, `zai-native`, `anthropic-public`, `github-copilot-native`, `google-generative-ai`, `google-vertex`, `local`, `custom` (`openai-completions-compat.ts:50-113`, `openai-responses-payload-policy.ts:159-225`).
- `resolveOpenAISupportedReasoningEfforts` with 9 model-family-specific arrays (GPT-5, 5.1, 5.2+, Pro, Codex, 5.1-codex-mini, 5.1-codex-max) plus `GENERIC_REASONING_EFFORTS` fallback (`openai-reasoning-effort.ts:73-110`).
- `resolveOpenAIReasoningEffortForModel` with intelligent fallback ladder (`minimal`→`low`→`medium`; `xhigh`→`high`) (`openai-reasoning-effort.ts:121-146`).
- `normalizeStrictOpenAIJsonSchema` + `findOpenAIStrictToolSchemaDiagnostics` — strip-and-fail-fast for OpenAI strict-mode tools (`openai-tool-schema.ts:35-238`).
- `normalizeToolParameterSchema` — flattens top-level `anyOf|oneOf` of object variants into single object schema with merged properties + intersected required (`tool-parameter-schema.ts:187-297`).
- `cleanSchemaForGemini` — 17 unsupported keywords stripped + literal-anyOf → enum + ref-resolution + null-stripping (`lib/clean-for-gemini.ts:25-55`).
- `SYSTEM_PROMPT_CACHE_BOUNDARY` sentinel comment + 3 helpers (`splitSystemPromptCacheBoundary`, `stripSystemPromptCacheBoundary`, `prependSystemPromptAdditionAfterCacheBoundary`) for stable-prefix vs dynamic-suffix cache scoping (`system-prompt-cache-boundary.ts`).
- `createAnthropicToolPayloadCompatibilityWrapper` — opt-in OpenAI-shape tool transform for Vertex-Anthropic / OpenRouter passthrough (`anthropic-tool-payload-compat.ts:166-203`).
- `resolveProviderRequestCapabilities` — 14-field capabilities object (allowsServiceTier×2, allowsResponsesStore, supportsResponsesStoreField, shouldStripResponsesPromptCache, etc.) (`provider-attribution.ts:130-198`).

---

## Partial

### Stream watchdog — Watchdog absent; only abort-via-signal (P1)

Anthropic's `claude.ts:1874-1929` runs a 90-second `STREAM_IDLE_TIMEOUT_MS` watchdog over each streaming attempt with a half-time warning, throwing `'Stream idle timeout'` to feed the catch-block fallback path. Our adapters propagate `signal` into `sdk.messages.stream(...)` / `sdk.chat.completions.create(...)` / fetch calls, but the SDK request-timeout only covers the initial `fetch()` head — not the streaming body. **Symptom:** silent-drop connections (cellular handover, NAT timeout) hang the chat indefinitely. **Effort:** 1 day per adapter to wrap each `for await` in a refresh-on-chunk `setTimeout` with `clearTimeout` on completion.

### Per-provider model fallback — `FallbackTriggeredError` shape absent; only `retryable` flag on `StreamChunkError` (P0 for differentiator #1)

Anthropic's `claude.ts:2541-2569 / withRetry.ts:327-365` increments `consecutive529Errors`, threshold-3 emits `FallbackTriggeredError(originalModel, fallbackModel)` that propagates to `query.ts` which actually swaps the adapter. We expose `retryable: true` and `retryAfterSeconds` (`provider-adapter.ts:218-228`) but no error class to communicate "switch to a different model NOW", and no caller-side state machine that listens for it. The `chat` layer in `apps/web/features/chat` and `packages/unified-chat` therefore can't gracefully degrade Opus → Sonnet on overload. **Effort:** 2-3 days for `FallbackTriggeredError` class + caller-side adapter swap loop.

### Stop-reason mapping — Map exists but truncates 7 cases to "end_turn" (P1)

`anthropic/src/stream.ts:30-42` maps `null|undefined|unknown → 'end_turn'`, losing visibility into `pause_turn`, `refusal`, `model_context_window_exceeded` distinctions that `claude.ts:2213-2294` uses to drive recovery messages. `openai/src/stream.ts:26-42` collapses `function_call` into `tool_use` (legacy field) and `content_filter` into `error` without preserving the safety reason. Google adapter collapses 5 distinct safety/recitation reasons into a single `error` (`google/src/stream.ts:23-29`). **Symptom:** UI cannot distinguish "model refused" from "network error" from "context limit" — same red banner. **Effort:** 1-2 days to extend `StreamChunkStop.reason` union with `pause_turn | refusal | safety_blocked | context_window_exceeded` + per-adapter mapping fix.

### Beta header handling — Single string-array passthrough; no model-aware merge (P1)

`anthropic/src/index.ts:74-80` joins `betaFeatures[]` with comma into `anthropic-beta` default header. `claude.ts:271-331 + utils/betas.ts` runs `getMergedBetas(model, {isAgenticQuery})` per-call: enables `prompt-caching-scope-2025-XX-XX` only when `useGlobalCacheFeature`, `context-1m-2025-XX-XX` only for Sonnet 1M experiment, `effort-2025-XX-XX` only when effort param sent, `task-budgets-2026-03-13` only when `shouldIncludeFirstPartyOnlyBetas()`, **`advanced-tool-use` for 1P/Foundry** vs **`tool-search-tool` for Vertex/Bedrock** (provider-aware split via `getToolSearchBetaHeader()`), and Bedrock receives the tool-search header in `extraBodyParams.anthropic_beta` rather than in the betas array (different SDK contract). Our adapter has none of this — every beta you set ships on every request whether or not the model supports it (400 errors on stale flags) and Bedrock pathway is missing entirely. **Effort:** 4-6 days for a `betaResolver(model, capabilities, querySource) → string[]` plus the Bedrock-specific extraBody path.

### Cache-control breakpoints — Last-user-turn only; no "exactly one marker" rule + no cached-microcompact (P1)

`applyAnthropicPayloadPolicyToParams` tags the system prompt + the LAST user turn (`anthropic-payload-policy.ts:153-197`). Anthropic's `claude.ts:3063-3211` enforces "exactly one cache_control marker" and shifts to second-to-last when `skipCacheWrite=true` (per the Mycro page_manager constraint); also handles `cache_edits` block insertion via `insertBlockAfterToolResults` and `cache_reference: tool_use_id` tagging on tool_result blocks. None of this exists in our payload policy. **Symptom:** Cache hit rate drops on long histories; cached-microcompact is not supported at all (5-10× cache cost penalty on long sessions). **Effort:** 3-5 days to port `addCacheBreakpoints` + `insertBlockAfterToolResults`.

### Tool schema normalization — Per-target only; no central dispatcher per `(provider, strict)` tuple (P1)

We have `normalizeStrictOpenAIJsonSchema` (OpenAI strict), `cleanSchemaForGemini` (Gemini), `normalizeToolParameterSchema` (generic anyOf flatten + xAI strip-keywords), and the unwired `ProviderAdapter.normalizeToolSchemas` hook (`provider-adapter.ts:334`). No adapter actually implements that hook — schema normalization is hard-coded inside each adapter's `translateChatRequest` (`openai/src/translate.ts:175-187`, `google/src/translate.ts:136-145`). New providers must hand-roll. **Effort:** 1-2 days to wire `adapter.normalizeToolSchemas` and have each translator call it.

### Cross-provider message normalization — Per-provider and brittle on edge cases (P0 for differentiator #3)

`buildToolUseNameMap` (`google/src/translate.ts:48-86`) is the only example of cross-message-history fixup. Anthropic's `claude.ts:1283-1306` has a battery: `ensureToolResultPairing` (insert synthetic error tool_results for orphaned tool_use; strip orphan tool_results — critical for `--resume` and teleport recovery), `stripCallerFieldFromAssistantMessage`, `stripToolReferenceBlocksFromUserMessage`, `stripExcessMediaItems` (silently drop oldest images/PDFs to stay under 100-media limit), `normalizeMessagesForAPI`. Without these, a Claude → GPT mid-conversation switch breaks when the assistant's last turn has a tool_use that was already executed: GPT sees an unresolved function_call. **Effort:** 5-7 days for the full repair toolkit + adapter-aware orphan policy.

### Provider abstraction — `ProviderAdapter` works for direct API; no Bedrock/Vertex/Foundry constructors (P0 for enterprise)

`provider-adapter.ts:304-311` `ProviderAdapterConfig` exposes `apiKey`, `baseUrl`, `credentials`, `fetch` — sufficient for direct API. Anthropic's `client.ts:144-189` ships **5 client constructors** (Direct + Bedrock + Foundry + Vertex + Common) wrapping `@anthropic-ai/sdk`, `@anthropic-ai/bedrock-sdk`, `@anthropic-ai/foundry-sdk`, `@anthropic-ai/vertex-sdk` with per-cloud auth refresh inside `withRetry`'s `getClient` callback (clearing AWS/GCP credential caches on 401). `AuthMethod` (`provider-adapter.ts:33-65`) has `aws-signature` + `gcp-adc` kinds defined but **no adapter implements them**. **Effort:** 7-10 days per cloud (4 clouds × 4 providers = 16 constructor variants).

### detectGateway fingerprinting — Wholly absent (P1)

`m8 §17 #10` calls out `detectGateway` from Anthropic's `logging.ts:107-139` that fingerprints LiteLLM, Helicone, Portkey, Cloudflare AI Gateway, Kong, Braintrust, Databricks via response-header prefixes OR baseURL host suffixes. `packages/unified-chat/src/lib/promptClassifier.ts:4` _references_ LiteLLM's complexity-router architecture but doesn't fingerprint anything. Our analytics emit a fixed `provider` string with no gateway visibility. **Effort:** 2 days for the matcher table + telemetry plumb.

---

## Missing

### Streaming protocol parity (P0 — anchor for differentiators #1 + #3)

- Watchdog tied to `STREAM_IDLE_TIMEOUT_MS = 90_000` with reset-on-chunk + half-time `'Stream idle timeout warning'`.
- Empty-stream detection: throw on `!partialMessage` (proxy returned 200 + non-SSE) OR `newMessages.length===0 && !stopReason` to trigger fallback (Anthropic `claude.ts:2350-2363`).
- 404 stream-creation fallback: gateways that return 404 on `?stream=true` but accept non-streaming (`claude.ts:2607-2749`).
- Per-attempt timeout escalation: 120s for `CLAUDE_CODE_REMOTE`, 300s otherwise.
- `cleanupStream(stream)` via `stream.controller.abort()` on early-exit (`claude.ts:2898-2912`).
- `releaseStreamResources` in `finally` to free Response native TLS/socket buffers (V8 GH#32920 leak class) — currently each adapter relies on the SDK's `for await` cleanup which does not call `.cancel()` on the underlying ReadableStream.
- Direct mutation (NOT object replace) of last `AssistantMessage` on `message_delta` so the transcript-write queue's 100ms-delayed reference stays connected (`claude.ts:2218-2294`).
- Streaming TTFT measurement (`ttftMs` field on `StreamChunk` events; we don't track it).
- Yield raw `stream_event` chunks alongside translated chunks so consumers can observe Anthropic-shape events directly (`claude.ts:2299-2303`).

### Beta header handling (P0 — differentiator #2 reach)

- `getMergedBetas(model, {isAgenticQuery})` central resolver.
- Per-feature gates on `prompt-caching-scope-2025-XX-XX`, `context-management-2025-XX-XX`, `context-1m-2025-XX-XX`, `effort-2025-XX-XX`, `task-budgets-2026-03-13`, `redact-thinking-2025-XX-XX`, `structured-outputs-2025-XX-XX`, `advisor_20260301`, `oauth-2025-04-20`, `files-api-2025-04-14`, `skills-2025-10-02`, `computer-use-2025-01-24`, `managed-agents-2026-04-01`.
- Provider-aware tool-search header split: `advanced-tool-use` (1P/Foundry) vs `tool-search-tool` (Vertex/Bedrock).
- Bedrock-specific `extraBodyParams.anthropic_beta` injection (vs betas array on direct API).
- `CLAUDE_CODE_EXTRA_BODY` env-var parsing for arbitrary extraBody keys (`claude.ts:272-331`).
- `anti_distillation: ['fake_tools']` injection for 1P CLI per `tengu_anti_distill_fake_tool_injection` GrowthBook flag.

### Cache-control breakpoints (P0 — multi-provider cache stability)

- `addCacheBreakpoints({messages, skipCacheWrite, useGlobalCache, ...})` enforcing exactly-one-marker + skipCacheWrite shift to len-2.
- `insertBlockAfterToolResults` for cached-microcompact `cache_edits` block insertion.
- `cache_reference: tool_use_id` auto-tagging on tool_result blocks strictly before last cache_control.
- Cloned-array-content invariant to avoid in-place mutation contamination from secondary queries (`claude.ts:625-627`).
- `buildSystemPromptBlocks` splitting by cache scope with N-block ceiling and 400-error guard.

### Stop-reason mapping (P1)

- Extend canonical union to include `pause_turn`, `refusal`, `safety_blocked`, `context_window_exceeded`.
- Anthropic: surface `pause_turn` (server-tool execution) + `refusal` for AUP violations (`getErrorMessageIfRefusal` from `errors.ts:1184-1207`).
- OpenAI: distinguish `length` vs `content_filter` vs `function_call` legacy.
- Google: 5-way fan-out on `SAFETY` / `RECITATION` / `BLOCKLIST` / `PROHIBITED_CONTENT` / `SPII` / `IMAGE_SAFETY` (currently all → `error`).
- Refusal recovery hint: cross-model suggestion on repeated refusal (Anthropic `errors.ts:1184-1207`).

### withRetry generator + sticky RetryContext (P0)

- `RetryContext` carrying `model`, `maxTokensOverride`, `thinkingConfig`, `fastMode`, `consecutive529Errors` across attempts.
- `paramsFromContext` closure invoked once per request, then again on each retry with updated `RetryContext`.
- 10-attempt default, `BASE_DELAY_MS = 500`, full-jitter exponential `min(BASE * 2^(attempt-1), 32000) + rand*0.25*BASE`.
- `MAX_529_RETRIES = 3` consecutive-529 threshold for fallback.
- `FOREGROUND_529_RETRY_SOURCES` allow-list (15 entries: `repl_main_thread`, `sdk`, `agent:*`, `compact`, `hook_agent`, `hook_prompt`, `verification_agent`, `side_question`, `auto_mode`, `bash_classifier`); everything else bails on 529.
- `parseMaxTokensContextOverflowError` regex `input length and \`max_tokens\` exceed context limit: (\d+) \+ (\d+) > (\d+)`→ set`RetryContext.maxTokensOverride = max(FLOOR_OUTPUT_TOKENS=3000, contextLimit-inputTokens-1000, thinking_budget+1)`.
- Persistent mode (`CLAUDE_CODE_UNATTENDED_RETRY`) chunking long sleeps into 30s heartbeat blocks.
- Fast-mode cooldown state machine: `DEFAULT_FAST_MODE_FALLBACK_HOLD_MS=1800000`, `SHORT_RETRY_THRESHOLD_MS=20000`, `MIN_COOLDOWN_MS=600000`.
- `shouldRetry(error)` 10-clause matrix (mock rate-limit, persistent, CCR, overloaded, max_tokens overflow, x-should-retry, APIConnectionError, 408/409/401/403-revoked/5xx, 429-non-subscriber).
- `CannotRetryError` + `FallbackTriggeredError` taxonomy distinguishing "exhausted retries" from "switch model".

### Stream watchdog (P0)

- See "Streaming protocol parity" item 1; lift verbatim.
- `CLAUDE_STREAM_IDLE_TIMEOUT_MS` env override.
- Half-time warning event so UI shows "Server slow…" before the full timeout fires.
- Distinguish user-abort (signal.aborted) from SDK internal timeout (which spuriously throws `APIUserAbortError`).

### Latched session-stable header flags (P0 — cache key preservation)

- Module-level `Map<sessionId, LatchedFlags>` storing `afkHeaderLatched`, `fastModeHeaderLatched`, `cacheEditingHeaderLatched`, `thinkingClearLatched`.
- Once set, headers ship for rest of session even after the originating feature toggles off — preserves the cache key to keep ~50-70K tokens cached across turns.
- `recordPromptState` snapshot tracker per `(querySource, agentId)` capturing `system-blocks-hash`, `tool-schemas-hash`, `model`, `fastMode`, `betas-sorted-hash`, `extra-body-params-hash`, `pendingChanges` flag.
- `MAX_TRACKED_SOURCES = 10` cap to bound per-subagent state.

### detectGateway fingerprinting (P1)

- Header-prefix matchers: `x-litellm-*`, `x-helicone-*`, `x-portkey-*`, `cf-aig-*`, `x-kong-*`, `x-braintrust-*`, `x-databricks-*`.
- Hostname-suffix matchers: `*.litellm.ai`, `*.helicone.ai`, `*.portkey.ai`, `*.aig.cloudflare.com`, `*.konghq.com`.
- Emit `gateway: 'litellm' | 'helicone' | ...` field on telemetry alongside `provider`.

### Provider-cloud constructors (P0 for enterprise)

- `AnthropicBedrock` constructor: AWS region per-model override (`ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION`); `awsAccessKey/SecretKey/SessionToken` via STS; `AWS_BEARER_TOKEN_BEDROCK` skipAuth path; `CLAUDE_CODE_SKIP_BEDROCK_AUTH` mock.
- `AnthropicVertex` constructor: region from `getVertexRegionForModel(model)` priority chain (`VERTEX_REGION_CLAUDE_*` per-model env vars > `CLOUD_ML_REGION` > config default > `us-east5`); `googleAuth = new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']})` with `projectId` only as last-resort fallback (avoid 12s GCE-metadata-server timeout outside GCP); ADC chain.
- `AnthropicFoundry` constructor: optional `azureADTokenProvider` from `@azure/identity` `getBearerTokenProvider(new DefaultAzureCredential(), 'https://cognitiveservices.azure.com/.default')`.
- OpenAI on Azure: `apiVersion` + Azure deployment-name routing.
- Google on Vertex: `@google-cloud/aiplatform` `predictionServiceClient.streamGenerateContent`.
- Per-cloud auth refresh inside withRetry's `getClient` callback (clear AWS STS / GCP refresh-token cache on 401).

### Per-provider model fallback (P0)

- `OPUS → SONNET → HAIKU` fallback chain on Anthropic.
- `GPT-5.4 → GPT-5.4-mini → GPT-4.1` chain on OpenAI.
- `gemini-3.1-pro → gemini-3.1-flash` chain on Google.
- `get3PModelFallbackSuggestion(model)` for Bedrock/Vertex (`Opus-4-6 → opus41`, `Sonnet-4-6 → sonnet45`, `Sonnet-4-5 → sonnet40`) (Anthropic `errors.ts:425-934`).
- `onStreamingFallback` callback option fired when fallback engages (Anthropic `Options` field at `claude.ts:676-707`).
- `FALLBACK_FOR_ALL_PRIMARY_MODELS` env vs subscriber+Opus gate.
- Initial-consecutive529 carry across streaming-vs-fallback paths so both paths increment a single counter (`claude.ts:2541-2569`).

### Tool schema normalization (P1)

- Wire `ProviderAdapter.normalizeToolSchemas(ctx)` hook (`provider-adapter.ts:334`) — currently dead.
- Per-(provider, strict, model) dispatcher table.
- Tool-search EAP support: `extractDiscoveredToolNames(messages)` from prior `tool_reference` blocks (Anthropic `claude.ts:1118-1182`).
- Server-tool sentinel cast `as unknown as BetaToolUnion` for advisor + computer-use (`claude.ts:1390-1394`).
- Tool description truncation per `MAX_MCP_DESCRIPTION_LENGTH = 2048` (per `m9 §1.4` for OpenAPI-generated MCP servers).

### Cross-provider message normalization (P0 for differentiator #3)

- `ensureToolResultPairing` — insert synthetic error tool_results for orphaned `tool_use`; strip orphan tool_results.
- `stripCallerFieldFromAssistantMessage` for tool-search EAP backward compat.
- `stripToolReferenceBlocksFromUserMessage`.
- `stripExcessMediaItems(messages, API_MAX_MEDIA_PER_REQUEST=100)` graceful-drop policy.
- `normalizeContentFromAPI` — execute per-tool input transforms registered at tool-definition time.
- Mid-conversation model-switch repair: strip Anthropic-only fields when handing to non-Anthropic adapter (`tool_reference`, `caller`, server_tool blocks) — directly enables Claude → GPT mid-thread.
- Mid-conversation tool-name-collision detection.
- Provider-aware `assistantMessageToMessageParam` skipping cache_control on `thinking` / `redacted_thinking` / `connector_text` blocks (Anthropic `claude.ts:633-674`).
- Image format conversion: Anthropic base64 ↔ OpenAI data-url ↔ Gemini inlineData when switching providers mid-session.

### Error classification (P1)

- 30-branch `getAssistantMessageFromError` (Anthropic `errors.ts:425-934`) with rate-limit-header-aware variants:
  - `anthropic-ratelimit-unified-representative-claim` (`five_hour | seven_day | seven_day_opus`)
  - `anthropic-ratelimit-unified-overage-status` (`allowed | allowed_warning | rejected`)
  - `anthropic-ratelimit-unified-reset` Unix-sec + `-overage-reset`
  - `anthropic-ratelimit-unified-overage-disabled-reason` (typed `OverageDisabledReason`)
- `classifyAPIError` returning Datadog tag (25-value enum: `aborted`, `api_timeout`, `repeated_529`, `capacity_off_switch`, `rate_limit`, `server_overload`, `prompt_too_long`, `pdf_too_large`, …).
- `categorizeRetryableAPIError` mapping to SDK consumer enum (4-value).
- Per-provider error matchers — OpenAI's error wording differs (`insufficient_quota`, `model_not_found`, `context_length_exceeded`); Google's is structured (`error.status: 'RESOURCE_EXHAUSTED'`).
- PDF-specific errors: `password_protected`, `not_valid_pdf`, `maximum of N PDF pages`.
- Image-specific errors: `image_exceeds`, `image_dimensions_exceed` (2000px stricter limit), `many-image`.
- 413 Request Too Large.
- 400 + tool-validation errors: `tool_use ids without tool_result`, `unexpected tool_use_id`, `tool_use ids must be unique` — with `/share` link + `/rewind` recovery hint.
- `errorDetails` separation so downstream `getPromptTooLongTokenGap` can parse `actualTokens/limitTokens`.

### Multi-provider routing (P0)

- Provider registry like `apps/cli/src/models.rs:287-310` — currently nothing on the TS side. The `ProviderAdapterFactory` shape exists (`provider-adapter.ts:346`) but no central `ProviderRegistry.register(id, factory)` + `dispatch(modelOrProvider) → adapter` exists in any of these 3 packages.
- `Custom` provider with user-defined endpoint (the `apps/cli` Custom registry) — closest is `LMStudioAdapter` but it's hard-bound to OpenAI compat.
- Cross-adapter parallel `Promise.all` for fan-out (consensus, advisor, ensemble).
- `agentId` discriminant carried across cross-adapter calls for cache-state isolation.
- Health-check pings (analogous to `verifyApiKey` from Anthropic `claude.ts:530-586`) — currently no adapter implements an "is this provider reachable + auth valid" probe. UI cannot show provider status.
- Model availability discovery: `catalog()` exists per-adapter but no aggregator. Current chat layer (`packages/unified-chat`) calls each adapter's `catalog()` separately and merges client-side.
- Provider-tier routing: free vs Hobby vs Pro vs Pro+ tier gating per `auto-routing-spec-2026-05-07.md` referenced from MEMORY.md — implementation lives in `apps/web/middleware`, not in this layer.

### Files API client (P1)

- `filesApi.ts:600+` LOC equivalent: GET `/v1/files/{fileId}/content` with Bearer OAuth, 60s timeout, max 500MB, retry-on-5xx, throw-on-401/403/404.
- `buildDownloadPath(basePath, sessionId, relativePath)` rejecting `..` traversal.
- `'files-api-2025-04-14,oauth-2025-04-20'` beta header.
- File upload + download lifecycle.

### Bootstrap, account API, session ingress (P2 — Anthropic-only consumer SaaS)

- `bootstrap.ts` — first-party config bootstrap from `${BASE_API_URL}/api/claude_cli/bootstrap`.
- `usage.ts` — extra-usage utilization polling.
- `sessionIngress.ts` — session JWT log persistence with `Last-Uuid` optimistic-concurrency header + `findLastUuid` walk-back recovery.
- `grove.ts`, `referral.ts`, `overageCreditGrant.ts`, `ultrareviewQuota.ts`, `firstTokenDate.ts`, `adminRequests.ts` — consumer-plan account-data RPCs.
- `metricsOptOut.ts` — org metrics setting with two-tier cache (1hr in-memory + 24hr disk).

### Stream-event parity (P1)

- Yield `{type:'stream_event', event: rawSDKEvent, ttftMs?}` alongside translated chunks for opt-in raw-event consumers.
- `ping` event handling (Anthropic emits keep-alive pings inside long thinking blocks; we silently drop via switch fall-through).
- `service_tier`, `inference_geo` carry through `updateUsage` (preserve latest non-null) — Anthropic's `claude.ts:2924-2987` pattern.
- `iterations`, `speed`, `research` ant-only fields propagation as opaque metadata.
- `connector_text_delta` for FEATURE-gated managed-agent connector results.
- `citations_delta` (currently TODO in Anthropic — skipped here too; required for differentiator with Perplexity).

### Anthropic's `Options` 28-field shape (P1 — config taxonomy)

Our `ProviderAdapterConfig` has 5 fields (`apiKey`, `baseUrl`, `credentials`, `defaultMaxOutputTokens`, `fetch`). Anthropic's `Options` (`claude.ts:676-707`) carries 28: `getToolPermissionContext`, `model`, `toolChoice`, `extraToolSchemas`, `maxOutputTokensOverride`, `fallbackModel`, `onStreamingFallback`, `querySource`, `agents`, `mcpTools`, `agentId`, `outputFormat`, `fastMode`, `advisorModel`, `taskBudget`, `enablePromptCaching`, `skipCacheWrite`, `temperatureOverride`, `effortValue`, `addNotification`. We're missing: `agents` (subagent list), `mcpTools` (MCP-discovered tool list), `agentId` (subagent isolation), `advisorModel` (server-side tool config), `taskBudget` (EAP), `skipCacheWrite` (fork mode), `effortValue` (numeric reasoning override), `addNotification` (UI hook), `onStreamingFallback` (fallback observer).

### `x-client-request-id` UUID injection (P2)

- `randomUUID()` per-request via `buildFetch` wrapper (Anthropic `client.ts:358-389`).
- 1P-only injection (`getAPIProvider() === 'firstParty' && isFirstPartyAnthropicBaseUrl()`) — Bedrock/Vertex/Foundry don't log it; some strict proxies reject unknown headers.
- Logging the UUID for support hand-off when SDK throws timeout.
- Provider-agnostic generalization: each adapter could inject a correlation header.

### Custom-headers passthrough (P2)

- `ANTHROPIC_CUSTOM_HEADERS` env var (newline-separated `Name: Value` curl-style; split on FIRST colon — no regex backtracking on malformed long lines) (`client.ts:105-116`).
- `x-anthropic-additional-protection` opt-in.
- OpenAI org header (`OpenAI-Organization`) — exists at `openai/src/index.ts:90` but no env var bridging.

### `releaseStreamResources` / V8 leak avoidance (P2)

- Native `ReadableStream.cancel()` in `finally` after `for await` exit-by-error.
- `stream.controller.abort()` for SDK-wrapped streams.
- Cost-accumulation outside try-block for fallback path that yielded.

### Telemetry hooks (P2)

- `startLLMRequestSpan` / `logAPISuccessAndDuration` lifecycle hooks (Anthropic `claude.ts:1498, 2857-2888`).
- `tengu_*` Statsig-event analog (we have nothing — no per-request span emission, no error-class telemetry).
- Firehose/PostHog/Datadog adapter pluggable target.
- Fire-and-forget pattern using precomputed scalars to avoid pinning the `messagesForAPI` closure until promise resolves.

### Test coverage gap (P0 — invariant guarantee)

- 22 test files across all 3 packages = 22 test files / 105 source files = 21% test-file coverage by file.
- `packages/llm-normalize` has 4 test files for 13 source modules (31%); zero tests on `anthropic-tool-payload-compat.ts`, `openai-completions-compat.ts`, `openai-responses-payload-policy.ts`, `openai-tool-schema.ts`, `provider-attribution.ts`, `clean-for-gemini.ts`.
- Per FINAL_AUDIT, OpenClaw-derived packages (`apply-patch`, `browser-tool`, `mcp`, `skills`, `llm-normalize`) have zero or near-zero test coverage. Many cross-provider invariants (e.g., "Claude → GPT switch preserves tool-result pairing") have NO automated regression test.
- Live tests exist (`anthropic.live.test.ts`, `openai.live.test.ts`, `ollama.live.test.ts`) but require API keys + are gated. No mock-driven SSE replay tests exercising the full event taxonomy.

---

## Per-axis percentage

| Axis                   | Percentage | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Streaming protocol     | **40%**    | Per-provider SSE parsing solid (Anthropic 6 events, OpenAI Chat Completions, OpenAI Responses 11 events, Gemini, Ollama). Missing: watchdog, empty-stream detection, 404 stream-creation fallback, `releaseStreamResources`, raw-event-passthrough, ping handling, ttftMs, in-place message_delta mutation.                                                                                                                                                     |
| Cache control          | **45%**    | Anthropic ephemeral cache_control on system + last user turn shipped via `applyAnthropicPayloadPolicyToParams`; system-prompt boundary sentinel + 3 helpers; cacheRetention 'short'/'long' with hostname gating. Missing: addCacheBreakpoints "exactly one marker" rule, skipCacheWrite shift, cached-microcompact `cache_edits`, `cache_reference: tool_use_id` tagging, cloned-array invariant, prompt-cache-break detection two-phase tracker.               |
| Beta headers           | **15%**    | Single string-array passthrough only. No model-aware merge, no per-feature gates, no `getMergedBetas`, no provider-aware tool-search split, no Bedrock-specific extraBodyParams path, no `CLAUDE_CODE_EXTRA_BODY` env parsing. Just `defaultHeaders['anthropic-beta'] = config.betaFeatures.join(',')`.                                                                                                                                                         |
| Retry/recovery         | **5%**     | Only `parseRetryAfter(headers) → seconds` and a `retryAfterSeconds` field on `StreamChunkError`. No retry generator, no `RetryContext`, no consecutive-529 counter, no `MAX_529_RETRIES` threshold, no max-tokens-context-overflow regex, no FOREGROUND_529_RETRY_SOURCES allowlist, no shouldRetry matrix, no `CannotRetryError`/`FallbackTriggeredError` taxonomy. Caller of `adapter.stream()` gets `retryable: true` but must implement its own retry loop. |
| Tool normalization     | **65%**    | OpenAI strict, Gemini 17-keyword strip, generic anyOf/oneOf flatten, xAI strip-keywords all shipped as pure functions. `ProviderAdapter.normalizeToolSchemas` hook DEFINED in interface but NO adapter implements it — schema cleaning is hard-coded inside translate.ts. Missing: tool-search EAP `extractDiscoveredToolNames`, server-tool sentinel casts, MAX_MCP_DESCRIPTION_LENGTH truncation.                                                             |
| Provider abstraction   | **40%**    | 8 adapters all conform to `ProviderAdapter`, sharing the same `stream() → AsyncIterable<StreamChunk>` shape. ✓ Direct API. ✗ Bedrock / Vertex / Foundry / Azure-OpenAI (`AuthMethod` types defined for `aws-signature` + `gcp-adc` but no adapter implements them). ✗ Provider registry / runtime dispatcher. ✗ Health-check probes. ✗ Cross-adapter parallel fan-out.                                                                                          |
| Model fallback         | **0%**     | Nowhere in any of these 3 packages does a stream() return with model-switched fallback. The `retryable: true` flag is the closest we get; caller must catch + retry with a different `req.model`. No `FallbackTriggeredError` class. No `onStreamingFallback` callback. No 3P fallback table (Opus → Sonnet → Haiku).                                                                                                                                           |
| Stop reasons           | **40%**    | Canonical 6-value union (`end_turn`, `max_tokens`, `tool_use`, `stop_sequence`, `error`, `cancel`) on `StreamChunkStop`. Per-adapter mapping exists. Lossy: 7 Anthropic reasons → 4 categories (`pause_turn`, `refusal`, `model_context_window_exceeded` collapsed); 5 Google safety reasons → `error`. No refusal-recovery cross-model suggestion.                                                                                                             |
| Error classification   | **15%**    | Only the `retryable` boolean + `code: String(status)` on `StreamChunkError`. None of: 30-branch `getAssistantMessageFromError`, `classifyAPIError` 25-value Datadog tag, `categorizeRetryableAPIError` 4-value enum, rate-limit unified header parsing, PDF errors, image errors, tool-validation errors, `errorDetails` separation.                                                                                                                            |
| Multi-provider routing | **20%**    | 8 adapter implementations + `ProviderAdapterFactory` shape. ✗ Central `ProviderRegistry`. ✗ Custom-endpoint registry. ✗ `dispatch(modelOrProvider) → adapter`. ✗ Cross-adapter parallel/consensus/ensemble. ✗ Health-check ping. ✗ Auto-routing tier gating. ✗ Mid-conversation provider switch with message normalization.                                                                                                                                     |

---

## Surface percentage for these 3 packages combined

**~28% of Anthropic's services/api-equivalent capability surface.**

Calculated as the area-weighted mean of the ten axes above (rounding axis weights to (Streaming 12%, Cache 10%, Beta 8%, Retry 12%, Tool norm 10%, Provider abstraction 12%, Model fallback 10%, Stop reasons 6%, Error classification 10%, Routing 10%) → sum-product = 27.65%).

Breakdown by package:

| Package                   | Have count                                   | Coverage %                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/api/`           | 57 typed Tauri-command modules               | **N/A — wrong layer.** This is the IPC binding to Rust. The Anthropic-equivalent of `m8 services/api/` lives in our **Rust** desktop/CLI, not in this TS package.                                                                                                                                                                                                                                |
| `packages/providers/`     | 8 adapters, all `ProviderAdapter`-conforming | **35% of Anthropic services/api/** for direct API path; 0% on cloud (Bedrock/Vertex/Foundry); 0% on retry infrastructure.                                                                                                                                                                                                                                                                        |
| `packages/llm-normalize/` | 12 normalization modules                     | **65% of pure-function quirk-encoder logic** (Tier-1 OpenClaw normalizers are nearly complete: payload policies, reasoning effort, tool schema, system prompt cache boundary, gemini scrub, Anthropic-tool-payload OpenAI-shape compat). Missing the Tier-2 stateful pieces (retry, latched flags, prompt-state tracker) — which are by-design out of `llm-normalize`'s "pure function" charter. |

The packages that need the missing pieces are **not these three** — `llm-normalize` is correctly scoped to pure functions, `providers/` are correctly scoped to "translate + stream", and `api/` is the Tauri IPC layer. The strategic gap is that **a fourth shared package (`packages/llm-runtime` or similar) doesn't exist** to host the retry generator, watchdog, latched flags, fallback state machine, error classifier, gateway fingerprinter, message-history repair toolkit. Today every consumer (api-gateway, web/api/llm route, unified-chat) re-implements ad-hoc fragments of that infrastructure inline.

---

## Effort to reach 100% (days)

Estimating senior-engineer days assuming all dependent types are in place and tests are written alongside implementation. Numbers do not include enterprise integration testing, which doubles the figure.

### Sprint 1 — Critical-path multi-provider invariants (locks differentiator #3) — **22-30 days, 1 engineer**

| Item                                                                                                                                                        | Days |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| `packages/llm-runtime` package scaffolding (`withRetry` generator + `RetryContext` + sticky latches + watchdog)                                             | 5-7  |
| Cross-provider message normalization (`ensureToolResultPairing`, `stripExcessMediaItems`, `normalizeContentFromAPI`, mid-switch repair)                     | 5-7  |
| Per-provider model fallback + `FallbackTriggeredError` + `onStreamingFallback` callback                                                                     | 3-4  |
| Stream watchdog wired into all 8 adapters                                                                                                                   | 1-2  |
| Stop-reason union extension + per-adapter remap                                                                                                             | 2    |
| Error classification matrix per provider (30-branch matcher × 4 providers = 120 cases; ports the Anthropic taxonomy and adds OpenAI/Google/Ollama variants) | 6-8  |

### Sprint 2 — Cache + beta header machinery (recovers token cost on long sessions, locks differentiator #2 reach) — **14-20 days**

| Item                                                                        | Days |
| --------------------------------------------------------------------------- | ---- |
| `addCacheBreakpoints` "exactly one marker" + skipCacheWrite shift           | 3    |
| `cache_edits` block insertion + cached-microcompact                         | 4-5  |
| `getMergedBetas(model, …)` central resolver + 13 beta-header gates          | 4-5  |
| Provider-aware tool-search beta header split (1P vs Bedrock-extraBody path) | 2    |
| `recordPromptState` two-phase prompt-cache-break tracker                    | 3    |
| Latched header `Map<sessionId, LatchedFlags>` + 4 flags                     | 2    |
| `CLAUDE_CODE_EXTRA_BODY` env-var parsing + custom-headers passthrough       | 1    |

### Sprint 3 — Provider abstraction + cloud constructors (locks enterprise) — **35-50 days**

| Item                                                                 | Days |
| -------------------------------------------------------------------- | ---- |
| Provider registry + dispatch + health-check ping                     | 4    |
| AnthropicBedrock adapter (AWS auth refresh, region-per-model, STS)   | 7-10 |
| AnthropicVertex adapter (GCP ADC, region priority chain, GoogleAuth) | 7-10 |
| AnthropicFoundry adapter (Azure AD `getBearerTokenProvider`)         | 4-6  |
| OpenAI on Azure (`apiVersion`, deployment routing)                   | 4-6  |
| Google on Vertex (`@google-cloud/aiplatform`)                        | 5-7  |
| `detectGateway` fingerprinter + telemetry plumb                      | 2    |
| `x-client-request-id` UUID injection + provider-aware header gates   | 1    |

### Sprint 4 — Test coverage to invariant-guarantee level — **10-14 days**

| Item                                                                                          | Days |
| --------------------------------------------------------------------------------------------- | ---- |
| Mock-driven SSE replay test fixtures (10 fixtures × 4 streaming providers = 40 fixtures)      | 4-5  |
| Cross-provider switch property tests (Claude → GPT → Llama round-trip preserves tool pairing) | 3-4  |
| `withRetry` state-machine tests (529 cascade, max_tokens overflow, persistent-mode heartbeat) | 2-3  |
| Beta-header gating tests (every gate × every model permutation)                               | 1-2  |

### Total

**~80-115 engineer-days = 16-23 weeks single-engineer or 6-8 weeks parallel-3-engineer cadence.**

That is the cost to reach **80-90% of Anthropic services/api/ parity**. The remaining 10-20% is consumer-SaaS-only Anthropic operations (`bootstrap.ts`, `usage.ts`, `sessionIngress.ts`, `grove.ts`, `referral.ts`, `firstTokenDate.ts`, `adminRequests.ts`, `metricsOptOut.ts`, `filesApi.ts`) that are largely irrelevant for our multi-provider charter and add maybe 8-12 more days only when needed (e.g., for the Anthropic-only OAuth subscriber tier).
