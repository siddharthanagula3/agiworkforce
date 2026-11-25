---
id: "SYS-inference-providers"
type: "system"
title: "Inference providers"
basis: "code inspection and project documents"
second_reader: "challenged and corrected"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Inference providers

The product reaches models through one adapter contract (ProviderAdapter in @agiworkforce/types). Shared helper packages (provider-protocol, provider-runtime) and 17 provider packages plus a factory implement it. Web owns retry, failover and deadlines for managed cloud. The Rust CLI and desktop use their own engine (agiworkforce-llm). Gateways are declared as data in the model registry. Images, speech and search mostly bypass the provider packages. Local mobile inference uses a separate package. Mobile cloud models are gated by a cloud-unlocked flag and plan tier, and mobile also lists provider-funded Free quota chat models that run in the cloud.

## What it is and why it exists

AGI Workforce must work with many model vendors without product code depending on any one of them. Three layers do this.

1. **Contract.** `ProviderAdapter` is the one interface every provider implements: `id`, `label`, `auth`, `config`, `catalog()` and `stream(req, signal)`. [code] (packages/contracts/types/src/provider-adapter.ts:595-613)
2. **Shared helpers.** `@agiworkforce/provider-protocol` holds pure payload-shaping functions (no IO, no SDK). `@agiworkforce/provider-runtime` holds error classification, retry maths, a stream idle watchdog, base-URL checks and credential-failover memory. [code] (packages/ai/provider-protocol/src/index.ts:1-17; packages/ai/provider-runtime/src/index.ts:1-22)
3. **Adapters.** One package per vendor under `packages/ai/providers/*`, built through one registry, `@agiworkforce/providers-factory`. Apps must not import a leaf package's internals. [code] (packages/ai/providers/README.md, 'Public API / Exports'; packages/ai/providers/factory/src/index.ts:96-160)

Which model runs on which route is data, not code. The catalogs in `packages/ai/model-registry/catalog/` (`harnesses.json`, `gateways.json`, `model-routes.json`, `provider-hosts.json`) decide it. Model ids live only in the generated catalog; this page names none. [requirement] (AGENTS.md section 4)

Two separate engines exist because the languages differ. TypeScript (web, extensions, mobile helpers) uses the packages above. Rust (CLI, desktop Tauri) uses `crates/agiworkforce-llm`, which holds only provider mechanics (wire types, request building per dialect, stream decoding, tool-call assembly, idle watchdog, error classification). Policy such as provider choice, keys, routing and fallback stays in the apps. [code] (crates/agiworkforce-llm/src/lib.rs:1-20)

Product rules that shape this subject: model agnostic and provider agnostic; Local, BYOK and Managed Cloud are separate trust boundaries; nothing may silently move a Local chat to BYOK or cloud. [requirement] (AGENTS.md section 6; docs/architecture/provider-routing.md, 'Enforcement Rules')

## How it works today

### Provider packages (what each is used for)

Adapter registry ids come from `PROVIDER_ADAPTER_IDS`. [code] (packages/ai/providers/factory/src/index.ts:98-117)

| Package folder | Registry id | Use | Notes (basis) |
|---|---|---|---|
| anthropic | anthropic | chat | Uses the official Anthropic SDK; also serves Anthropic-dialect routes via a base URL [code] (anthropic/src/index.ts:73-81; web provider-adapter-service.ts:257-283) |
| openai | openai, openai_compat | chat, plus the shared OpenAI-compatible translation | Responses API for catalog-known models on the native route, Chat Completions for proxies [code] (providers/README.md 'Known Caveats'); compat adapter reused by other vendors and gateways [code] (factory/src/index.ts:127-139) |
| google | google | chat | Gemini; REST, not the Google SDK [code] (google/src/index.ts:206) |
| xai | xai | chat | OpenAI-compatible [code] (xai/src/index.ts:22) |
| deepseek | deepseek | chat | OpenAI-compatible with cache-usage parsing [code] (deepseek/src/cache-usage.ts exists) |
| groq | groq | chat (speed) | OpenAI-compatible [code] (groq/src/index.ts:112) |
| moonshot | moonshot | chat | [code] (moonshot/src/index.ts:130) |
| minimax | minimax | chat | [code] (minimax/src/index.ts:113) |
| qwen | qwen | chat; quota probe | Fallback endpoints and a quota probe helper [code] (qwen/src/quota-probe.ts; factory/src/index.ts:38-44) |
| zhipu | zhipu | chat | [code] (zhipu/src/index.ts:147) |
| perplexity | perplexity | search-grounded chat | Returns a citations list on the last chunk [code] (perplexity/src/index.ts:6-13) |
| nvidia | nvidia_nim | chat (hosted open models) | Default host integrate.api.nvidia.com [code] (nvidia/src/index.ts:25) |
| openrouter | open_router | chat via aggregator; media routes use direct fetch elsewhere | Provider routing prefs, cache control [code] (openrouter/src/provider-routing.ts, cache-control.ts) |
| vercel-gateway | vercel_gateway | chat via aggregator; embeddings; evaluation (decision transport) | [code] (vercel-gateway/src/embeddings.ts, evaluation.ts; harnesses.json keys 'vercel_gateway/embeddings','vercel_gateway/evaluation') |
| workers-ai | workers_ai | chat via Cloudflare AI Gateway compat endpoint | [code] (workers-ai/src/index.ts:1-12) |
| ollama | ollama | local chat (default http://localhost:11434) | Dynamic catalog [code] (ollama/src/index.ts:8-9) |
| lmstudio | lmstudio | local chat (default http://localhost:1234/v1) | Catalog read live from /v1/models [code] (lmstudio/src/index.ts:3-9,39) |
| factory | (registry) | builds any adapter; `createGatewayAdapter` for declarative gateways | Holds no keys [code] (factory/package.json description; factory/src/gateway.ts) |

No leaf package exists for images, speech or search. [code] (packages/ai/providers directory listing)

### Request path on web (managed cloud)

1. `ADAPTER_PROVIDERS` maps a provider id to `buildAdapter`, `buildChatRequest`, `mapError` and a `wireMode`. It is built from three sources: protocol routes from the registry, gateway routes (only if the flag is on), and a hand-written table for 14 named providers. [code] (apps/web/app/api/llm/v1/chat/completions/lib/adapter-providers.ts:54-60,126-258)
2. `resolveProviderFromModel` picks the provider from the catalog; if the vendor key is missing and an OpenRouter slug exists, it falls to OpenRouter. [code] (apps/web/lib/services/provider-adapter-service.ts:185-225)
3. `buildServerProviderAdapter` reads the key from env, validates any `*_BASE_URL` override against the allowlist, and calls `createProviderAdapter`. Keys and endpoints live in the web deployment, never in the factory. [code] (provider-adapter-service.ts:313-399)
4. The adapter streams `StreamChunk` values. Each adapter wraps its stream in `withStreamIdleWatchdog` and maps errors through `classifyError`. [code] (e.g. anthropic/src/index.ts:130; provider-runtime/src/index.ts header)

### Gateways and protocol routes

A gateway is any OpenAI Chat, OpenAI Responses or Anthropic Messages compatible endpoint. It needs no package: add an entry to `gateways.json`, point a harness at it with `gatewayId`, set env var names. [requirement] (docs/development/add-a-gateway.md) The registry lists nine gateway definitions: openrouter_via_gateway (not wired), cheaperinference, cheaperinference_anthropic, deepinfra, together, novita, experientiallabs, experientiallabs_anthropic, workers_ai. [code] (packages/ai/model-registry/catalog/gateways.json keys)

The whole gateway path is off unless `AGI_ROUTING_GATEWAY_ROUTES=1`. The flag is enforced at admission (`admittedHarnessIds` drops gateway harnesses) and at dispatch (`ADAPTER_PROVIDERS` gets no gateway entry). [code] (apps/web/lib/services/gateway-routing.ts:13,52-54; adapter-providers.ts:109-124) The base URL taken from env must match the host the registry declares, or the adapter is refused. [code] (gateway-routing.ts:56-84)

'Protocol routes' are harnesses with a literal `baseUrl`, such as the DeepSeek, Moonshot and Zhipu Anthropic-dialect endpoints; they reuse the generic Anthropic or OpenAI adapters. [code] (harnesses.json 'deepseek-anthropic/messages' etc.; provider-adapter-service.ts:257-283)

### Retry and failover (web)

Retry and failover are owned by web, not by adapters. [code] (provider-runtime/src/index.ts:7-19; no adapter imports `withRetry`)

- **Same-route retry** happens only before any chunk reaches the client: the first chunk is peeked, and a failure there is retried on the same route. Max attempts are 2 for most retryable classes, `MAX_OVERLOAD_RETRIES` (3) for `server_overload`. Never retried on the same route: `auth`, `context_overflow`. [code] (provider-deadlines.ts:27,184-228,241-250; provider-runtime/src/retry.ts:10-14)
- **Rotation** to another route happens above that, in `managed-failover.ts`. Eligible classes: connection, server_error, server_overload, capacity_off_switch, api_timeout, rate_limit, quota_exhausted, empty_response, unsupported_input; plus credential rejection (`auth`), which blocks that provider's remaining routes. Never rotated: billing_exhausted, safety, content_blocked. [code] (managed-failover.ts:102-150,234-248)
- **Auto vs named model.** Across models only for Auto. A named model may rotate to other routes of the same model; it is never answered by a different model. An unfunded account may rotate once, for Auto only. [code] (managed-failover.ts:1-60,171-180)
- **Tool state pins the provider.** Once a provider has minted tool-call ids in the turn (step 2 or later), the turn stays on it. [code] (managed-failover.ts:321-329)
- **Grounded requests** get at most 1 same-provider candidate before a different provider is required. [code] (provider-runtime/src/retry.ts:21, MAX_SAME_PROVIDER_RETRIES_FOR_GROUNDED_REQUEST)
- Rotation does not create a second charge: one reservation spans all attempts and settlement prices the model that served. [code] (managed-failover.ts header comment)

### Timeouts

| Name | Value | Where |
|---|---|---|
| Function limit for chat completions | 300 000 ms | apps/web/lib/deadline-policy.ts:1 |
| Turn first-token budget | 40 000 ms | deadline-policy.ts:12 |
| Per-provider first-token deadline | 25 000 ms (clamped to the turn's remaining budget, floor 1 000 ms) | deadline-policy.ts:14; nestedDeadlineMs |
| Provider stream deadline | equals the tool-loop budget (300 000 - 60 000 ms reserve) | deadline-policy.ts:3-10 |
| Adapter stream idle watchdog (TS) | 90 000 ms default | provider-runtime/src/watchdog.ts:1 |
| Backoff | base 500 ms, max 32 000 ms | provider-runtime/src/retry.ts:13-14 |
| CLI stream idle timeout (Rust) | 300 s | apps/cli/src/models/mod.rs:31 |
| Image generation provider deadline | 55 000 ms | deadline-policy.ts:63 |

### Rust surfaces

CLI and desktop Tauri map their own provider enums onto `ProviderSpec { dialect, base_url, auth, extra_headers }`. Dialects are Anthropic, Gemini, OllamaNative, OpenAiResponses and OpenAiCompat. [code] (crates/agiworkforce-llm/src/spec.rs:48-75; apps/cli/src/models/streaming.rs:412-465) The CLI keeps its own fallback rule that refuses a cloud fallback from a local session. [code] (apps/cli/src/agent/chat.rs:75-86; tests at 4525-4572)

## Implementation map

| Concern | Location | Basis |
|---|---|---|
| Adapter contract | packages/contracts/types/src/provider-adapter.ts | [code] |
| Payload normalisation (OpenAI wire compat, Anthropic cache policy, Gemini schema cleanup, citation filter, thinking-tag splitter, tool schema normalisation) | packages/ai/provider-protocol/src/*.ts | [code] (index.ts:19-114) |
| Error taxonomy, retry maths, watchdog, base-URL allowlist, credential failover state, tracing | packages/ai/provider-runtime/src/{errors,retry,watchdog,base-url,failover,tracing}.ts | [code] |
| Adapter registry and declarative gateway adapter | packages/ai/providers/factory/src/{index,gateway}.ts | [code] |
| Vendor adapters | packages/ai/providers/<name>/src | [code] |
| Catalog, harnesses, gateways, hosts, governance | packages/ai/model-registry/catalog/*.json | [code] |
| Cross-provider routing (ranking, health, task family) | packages/ai/routing/src | [code] (directory); policy prose in docs/architecture/provider-routing.md |
| Web server credentials, base URL checks, adapter build | apps/web/lib/services/provider-adapter-service.ts | [code] |
| Gateway flag and host validation | apps/web/lib/services/gateway-routing.ts | [code] |
| Dispatch table and per-provider error mappers | apps/web/app/api/llm/v1/chat/completions/lib/adapter-providers.ts, adapter-errors.ts, adapter-factory.ts | [code] |
| Deadlines and same-route retry | apps/web/app/api/llm/v1/chat/completions/lib/provider-deadlines.ts; apps/web/lib/deadline-policy.ts | [code] |
| Rotation rules | apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts, failover-plan.ts | [code] |
| Routes | api:POST /api/llm/v1/chat/completions, api:GET /api/llm/v1/models, api:POST /api/llm/v1/embeddings, api:POST /api/llm/v1/audio/transcriptions, api:POST /api/llm/v1/route/preview, api:GET /api/llm/v1/credits/balance | [code] (apps/web/app/api/llm/v1/**/route.ts; HTTP methods not opened, so verbs are [inferred]) |
| Direct provider URLs for media and speech | apps/web/lib/server/provider-endpoints.ts (providers: openai, anthropic, google, openrouter; Runway constants) | [code] (lines 1-130) |
| Web search provider list | apps/web/lib/web-search/web-search-providers.json (one entry: Perplexity Search) | [code] |
| Search capability queries (no execution) | packages/ai/search | [code] (src/index.ts:1-8) |
| Rust engine | crates/agiworkforce-llm/src; fixtures in crates/agiworkforce-llm/tests/fixtures | [code] |
| Local mobile inference | packages/platform/local-llm; apps/mobile/src/features/model-picker | [code] |
| Mobile model list and cloud gating | apps/mobile/src/features/model-picker/service.ts | [code] (service.ts:180-190,275-306) |
| CLI providers | apps/cli/src/models/{mod,streaming,provider_dispatch}.rs | [code] |
| Desktop Tauri providers (retained internal code) | apps/desktop/src-tauri/src/core/llm/providers/{ollama,direct_api_provider,managed_cloud_provider,bedrock,local_endpoint}.rs | [code] |

## Data and state

- **Credentials.** Web reads managed keys from environment variables named in `SERVER_PROVIDER_CONFIG` and `PROVIDER_API_KEY_ENV_KEYS` (for example a `<PREFIX>_API_KEY` per provider, with alternates for Google, Qwen, NVIDIA, Workers AI and the Vercel gateway). Values are never recorded here. [code] (provider-adapter-service.ts:35-68)
- **Base URL overrides** come from `<PREFIX>_BASE_URL` and are accepted only for allowlisted hosts over https (http only for localhost and 127.0.0.1). [code] (provider-adapter-service.ts:128-146; provider-runtime/src/base-url.ts:1-30,60-90)
- **Gateway env names** (`baseUrlEnv`, `apiKeyEnv`, optional extra header envs) are named in `gateways.json`; values come from the process environment. [requirement] (docs/development/add-a-gateway.md) [code] (gateway-routing.ts:56-84)
- **Registry data** is generated into `packages/contracts/types/src/models.json` and a generated registry; do not hand-edit. [requirement] (AGENTS.md section 4)
- **Per-request state.** `CredentialFailoverState` remembers which provider accounts were refused in one request, and can be seeded with credentials a shared breaker already holds open. [code] (provider-runtime/src/failover.ts:15-57)
- **Persisted routing evidence.** Routing decisions are stored in `table:routing_decision_traces` (migration 0212) and rollout benchmarks in `table:model_rollout_benchmarks`. [requirement] (docs/architecture/provider-routing.md, 'Rollout' section). Not opened in the schema; [unknown] whether names match the migrations.
- **Device stores.** Mobile tracks installed on-device models in `storage/installedModels` (store name not verified). [code] (apps/mobile/src/features/model-picker/localModelRuntime.ts:6-10)
- **Model catalog hosts.** `provider-hosts.json` feeds the egress allowlist (`REGISTRY_DECLARED_PROVIDER_HOSTS`). [code] (provider-runtime/src/base-url.ts:1,31-34)

## Rules: access, plans, modes

Modes are declared as runtime profiles in `harnesses.json`. [code] (packages/ai/model-registry/catalog/harnesses.json, runtimeProfiles)

| Profile | Mode | Harness groups | Status in registry |
|---|---|---|---|
| web/cloud-chat | mode:cloud | managed-text, managed-media | implemented |
| desktop/cloud-chat | mode:cloud | managed-text, managed-media | implemented |
| desktop/byok-chat | mode:own-key | byok-text | implemented |
| desktop/local-chat | mode:local | local-text (ollama, lmstudio) | partial |
| mobile/cloud-chat | mode:cloud | managed-text, managed-media | implemented |
| mobile/local-chat | mode:local (on_device) | none | partial |
| cli/byok-chat | mode:own-key | byok-text | implemented |
| cli/managed-chat | mode:cloud | managed-text | implemented |
| cli/local-chat | mode:local | none | partial |
| vscode/byok-chat | mode:own-key | byok-text | unwired |
| vscode/managed-chat | mode:cloud | managed-text | implemented |
| vscode/local-chat | mode:local | none | unwired |
| chrome/managed-chat, chrome/managed-browser-task | mode:cloud | managed-text | implemented |
| chrome/browser-task | mode:local | none | implemented |

- **Trust boundaries.** A Local-to-BYOK move must be an explicit fork with consent and a visible provider label. Managed gateway defaults must never apply to Local or strict BYOK. [requirement] (AGENTS.md section 6; docs/architecture/provider-routing.md; packages/ai/providers/README.md 'What Does Not Belong Here')
- **Local is free of payment.** Local inference needs no paid subscription. [requirement] (task product context). On mobile, the cloud gating described below does not apply to local models. Whether sign-in is required on each app is a separate question: [unknown] from this research.
- **Routing order for managed.** Workspace policy, commercial status, trust mode, harness reachability, lifecycle stage, zero data retention and capabilities admit a route; only then do health, credentials and cost rank them. [requirement] (provider-routing.md, 'Model identity and serving routes')
- **Billing follows the model, cost follows the route.** The user is debited the model's official price; a cheaper host is the company's saving. [requirement] (provider-routing.md)
- **Gateway admission.** Gateway routes ship as `experimental_only` until a reseller agreement is confirmed; that value is refused for managed traffic. [requirement] (add-a-gateway.md) The training opt-out setting refuses gateways whose `trainsOnInputs` is unknown, opt_out or varies_by_route. [requirement] (add-a-gateway.md); enforced in managed failover for every hop. [code] (managed-failover.ts header, 'noTrainingOnly')
- **Plans on web.** Plan-based access to models is checked by `canAccessModel` (apps/web/lib/model-tiers (not found)) during rotation; a tier-restricted refusal rotates. [code] (managed-failover.ts:60-75, 'model_tier_restricted'). The plan names and quotas live in the subscription system (see SYS-subscription-entitlements, id not verified).
- **Plans on mobile.** The mobile model list takes a `cloudUnlocked` flag and a `subscriptionTier`. A cloud model is `locked` when cloud is not unlocked or when `canAccessCloudModelForTier` refuses the tier for that model. Local models are not gated by these checks. This is mobile-side list logic; it is a separate code path from web's server-side `canAccessModel`. [code] (apps/mobile/src/features/model-picker/service.ts:180-190,275-306). Whether both paths read one shared entitlement source is [unknown]; the cited code does not show it.

## Differences between apps

| App | How it reaches models | Basis |
|---|---|---|
| surface:web | Server routes under /api/llm, all adapters via factory, managed keys in env, retry/failover/deadlines | [code] (apps/web/app/api/llm/v1/chat/completions/lib/*) |
| surface:desktop | Public Electron window shows the hosted web app, so it uses web's managed path. The Tauri build is retained internal code with Rust providers (direct API, managed cloud, Ollama, Bedrock) on agiworkforce-llm. `package.json` lists the TS Ollama and LM Studio adapters but I found no source import of them | [requirement] (AGENTS.md section 5); [code] (apps/desktop/src-tauri/src/core/llm/providers/*; apps/desktop/package.json:73-74) |
| surface:mobile | Two execution boundaries. On the device: local chat through `@agiworkforce/local-llm` using llama.rn and ExecuTorch, plus Apple/Android system models. In the cloud: managed cloud chat through web, and a set of provider-funded Free quota chat models (surface `cloud_managed`, label 'Provider-funded Free', described as promotional quota) that are cloud calls, shown only when cloud is unlocked. Mobile lists `provider-runtime` as a dependency but no source file imports it | [code] (packages/platform/local-llm/package.json; apps/mobile/package.json:67; apps/mobile/src/features/model-picker/service.ts:37,180-190,303-330; grep of apps/mobile/src) |
| surface:cli | Rust. Providers: managed cloud, Anthropic, Google, Ollama, pre-registered OpenAI-compatible endpoints (OpenAI, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, LM Studio, MiniMax, OpenRouter, NVIDIA) and user-defined custom endpoints. Endpoint URLs are literals in Rust | [code] (apps/cli/src/models/mod.rs:64-93,102-192; streaming.rs:412-465) |
| surface:vscode | Runs a local runtime process per workspace (`LocalRuntimePool`) rather than calling providers itself; BYOK profile marked unwired | [code] (apps/extension-vscode/src/integrations/localRuntimePool.ts:1-25; harnesses.json vscode profiles) |
| surface:chrome | Imports only `ThinkingTagSplitter` from provider-protocol, in three files (freeTrialClient.ts, conversationHistoryPull.ts, cloudAgentClient.ts). Model calls go to the cloud bridge. package.json also lists `provider-runtime`, but no source import of it was found | [code] (apps/extension/src/features/cloud-bridge/freeTrialClient.ts:91; cloud-bridge/conversationHistoryPull.ts:24; computer-use/cloudAgentClient.ts:24; apps/extension/package.json:49-50) |

### Where provider specifics leak into product code

- Web hand-written table of 14 providers with per-provider error mappers (`toGroqUpstreamError`, etc.). [code] (adapter-providers.ts:126-258; adapter-factory.ts)
- `buildServerProviderAdapter` special-cases anthropic cache config, OpenRouter routing prefs (price sort, deny data collection), Vercel gateway sort, OpenAI diagnostics and Qwen fallback endpoints. [code] (provider-adapter-service.ts:313-399)
- Image generation and speech call OpenAI and Google endpoints directly with `fetch`, not through adapters. [code] (apps/web/app/api/media/image/lib/image-generation-provider.ts:507-640; apps/web/app/api/voice/speech/route.ts:196)
- Transcription is hard-coded to require an OpenAI model in the `voice_transcription` slot, in web and in Rust (`OPENAI_TRANSCRIPTIONS_URL`). [code] (apps/web/app/api/llm/v1/audio/transcriptions/route.ts:500-504; crates/agiworkforce-llm/src/speech.rs:1-20)
- The default image provider is Google if its key exists, else OpenAI. [code] (image-generation-provider.ts:378-387)
- Web search backs onto one Perplexity Search entry. [code] (apps/web/lib/web-search/web-search-providers.json)
- Rust endpoint literals in the CLI and a Rust-only Bedrock provider in desktop Tauri. [code] (apps/cli/src/models/streaming.rs:412-445; apps/desktop/src-tauri/src/core/llm/providers/bedrock.rs)
- OpenAI-native detection by URL substring in Rust (`api.openai.com`, `chatgpt.com`). [code] (crates/agiworkforce-llm/src/spec.rs:8-10)

### Use by capability

| Capability | Where it is served | Basis |
|---|---|---|
| Chat | All adapters above | [code] |
| Images | OpenAI and Google by direct fetch; OpenRouter and Runway media harnesses exist; a Stability branch throws 'not supported' | [code] (image-generation-provider.ts:397-420; harnesses.json managed-media group) |
| Speech to text, text to speech | OpenAI, direct fetch | [code] (above) |
| Search | Perplexity Search via web-search-providers.json; Perplexity chat adapter; provider-native search tools for others | [code] (web-search-providers.json; web-search/required-search.ts) |
| Embeddings | Vercel gateway adapter and a Google embeddings harness | [code] (vercel-gateway/src/embeddings.ts; harnesses.json) |
| Local | Ollama, LM Studio (TS and Rust), llama.rn and ExecuTorch on mobile | [code] |

## Failure handling

- **Classification.** `classifyError` maps any error to a category with `retryable`, `fallbackable`, optional `retryAfterSeconds`. Categories include aborted, api_timeout, rate_limit, server_overload, capacity_off_switch, context_overflow, max_output, tool_validation, invalid_model, invalid_input, unsupported_input, media_too_large, auth, billing_exhausted, quota_exhausted and more. [code] (provider-runtime/src/errors.ts:33-80,817)
- **Money is not auth.** `billing_exhausted` is separate from `auth` so an unfunded account does not look like a bad key and silently push spend onto another paid provider. [code] (errors.ts:58-67; managed-failover.ts:117-140)
- **Retry-After.** A provider-requested wait longer than the ceiling, or longer than the turn's remaining first-token room, ends the retry. [code] (provider-deadlines.ts:198-228)
- **Nothing leaks across attempts.** Rotation happens before the first byte reaches the client, so failed-attempt text cannot appear. After the first chunk the attempt is committed and errors flow out. [code] (provider-deadlines.ts:230-240; managed-failover.ts header)
- **Stream idle.** TS adapters raise `StreamIdleTimeoutError` after the idle window; Rust has `IdleWatchdog` and the CLI sets 300 s. [code] (watchdog.ts; crates/agiworkforce-llm/src/watchdog.rs; apps/cli/src/models/mod.rs:31)
- **Config errors.** A missing key throws `ProviderConfigurationError` naming the env var. A gateway with a missing or off-host base URL throws before any request. [code] (provider-adapter-service.ts:328-345; gateway-routing.ts:56-84)
- **SSRF.** A non-allowlisted base-URL override is ignored with a warning (web) or refused (gateway). [code] (provider-adapter-service.ts:128-146)
- **Rust conformance.** Replay fixtures freeze decode behaviour per dialect and HTTP error classification. [code] (crates/agiworkforce-llm/tests/conformance.rs:1-20)
- **Adapter retries by SDK.** Adapters pass no retry setting to the OpenAI or Anthropic SDK constructors, so any default SDK retry applies underneath web's own retry. Not verified in the SDK source. [inferred]
- **Worked example.** A managed Auto turn gets a 529 on the first route: it retries the same route up to the overload limit within the 40 s first-token budget, then rotates to the next admitted route, even to another model. A pinned model rotates only to another route of the same model. If the error was billing_exhausted it does not rotate (except one Auto exception). [code] (provider-deadlines.ts; managed-failover.ts)

## How it should work

[proposed] These are my suggestions, not statements of current behaviour.

- One place should own provider endpoints and key variable names for web. Today `SERVER_PROVIDER_CONFIG`, `provider-endpoints.ts`, harness `baseUrl`s and `STATIC_ALLOWED_MANAGED_PROVIDER_HOSTS` repeat the same facts.
- Speech, image and media calls should go through the same adapter contract (or a sibling media contract) so a provider swap needs no edit in route files.
- The Rust CLI should read endpoints and dialect from the generated registry mirror (`crates/agiworkforce-model-registry`) rather than literals, to match the 'no hardcoding' rule. [requirement] (AGENTS.md section 4)
- The `harnesses.json` entry for the mistral harness should either point to a real package or be removed.
- Stale docs should be fixed: the code comment pointing at services/api-gateway (not found) and the provider-runtime header claim about mobile and the Chrome extension (see outdated_documents).
- Local and BYOK should each have a single documented rule on whether sign-in is needed, tied to the subscription system.
- Mobile's tier gating and web's `canAccessModel` should read one shared entitlement source, so every app follows the one AGI Subscription system. [proposed]

## Gaps

Implementation status (is it connected) is kept apart from verification status (has anyone run it). No run was performed here and no project document I read records a run, so nothing is [executed].

| Gap | Implementation status | Basis |
|---|---|---|
| The mistral harness names adapter `@agiworkforce/providers-mistral`, which does not exist; no model route mentioning it was found; web has no mistral entry in `ADAPTER_PROVIDERS` | Declared in registry, not dispatchable on the web table | [code] (harnesses.json 'mistral/chat-completions'; packages/ai/providers listing; adapter-providers.ts) |
| vscode/byok-chat and vscode/local-chat | unwired | [code] (harnesses.json runtimeProfiles) |
| desktop/local-chat, mobile/local-chat, cli/local-chat | partial | [code] (harnesses.json) |
| Desktop declares TS Ollama and LM Studio dependencies with no import in source | Unused dependency or build-time only | [code] (apps/desktop/package.json:73-74) [inferred] |
| Mobile and Chrome extension declare provider-runtime with no source import | Unused dependency | [code] (apps/mobile/package.json:67; apps/extension/package.json:50) [inferred] |
| Speech, image and search bypass provider packages | By design today; leaks provider names | [code] |
| Gateway routes are off by default and ship as experimental_only except the first-party ones | Wired, not enabled | [requirement] (add-a-gateway.md) |
| Bedrock appears in Rust and in the Provider type but has no TS adapter | Rust only | [code] (providers/bedrock.rs; contracts provider.ts) |
| Live provider tests are opt-in (AGIWORKFORCE_LIVE_TEST=1) | No recorded run | [requirement] (providers/README.md) |
| Task-family stage, canary, shadow rollout and Jev budget assessment | Described as implemented; kill switches named; flags default per doc; not exercised here | [requirement] (provider-routing.md) |
| Mobile tier gating is separate logic from web's server check | Both exist; shared source unknown | [code] (service.ts:180-190; managed-failover.ts:60-75) [unknown] |

## How to verify

Read-only note: I ran none of these. Run them on a machine that allows builds.

- Provider and runtime unit tests: `pnpm --filter @agiworkforce/providers-openai test` (also anthropic, google) per the provider README; provider-runtime tests in packages/ai/provider-runtime/src/__tests__ (retry, failover, watchdog, errors, base-url). [requirement] (providers/README.md 'Commands')
- Protocol tests: packages/ai/provider-protocol/src/__tests__ (openai-wire-compat, anthropic-payload-policy, clean-for-gemini, banned-provider-policy). [code]
- Factory: test:packages/ai/providers/factory/src/index.test.ts, gateway.test.ts. [code]
- Web dispatch and failover: test:apps/web/app/api/llm/v1/chat/completions/lib/adapter-providers.test.ts (gateway admission and dispatch agree), gateway-route-dispatch.test.ts, protocol-route-dispatch.test.ts, managed-failover.test.ts, managed-failover.policy.test.ts, managed-failover.training-opt-out.test.ts, provider-deadlines.test.ts, tool-loop.same-model-route-failover.test.ts. Run web tests through the web package script, not the root binary. [requirement] (AGENTS.md section 12)
- Rust: crates/agiworkforce-llm tests (conformance.rs, redaction.rs) via cargo, through scripts/dev/heavy-job.sh. [code] [requirement] (CLAUDE.md)
- Registry: `pnpm --filter @agiworkforce/model-registry test` and `check:gateways`; guards `check:model-id-literals`, `check:hardcoded-endpoints`, `check:model-catalog`. [requirement] (add-a-gateway.md; AGENTS.md section 4)
- Live: only with `AGIWORKFORCE_LIVE_TEST=1` and real keys (anthropic.live.test.ts, openai.live.test.ts, ollama.live.test.ts, factory live-stream-smoke.test.ts exist). [code]
- A human check on a real device is the only proof for local inference limits and for failover behaviour under real provider outages. [requirement] (memory note: human-style verification)

## Key facts

| Fact | Basis | Source |
|---|---|---|
| Every vendor adapter implements one interface, ProviderAdapter, with catalog() and stream(req, signal); apps depend on it, not on vendor SDKs. | read in the code | `packages/contracts/types/src/provider-adapter.ts:595-613` |
| There are 17 leaf provider packages plus a factory: anthropic, deepseek, google, groq, lmstudio, minimax, moonshot, nvidia, ollama, openai, openrouter, perplexity, qwen, vercel-gateway, workers-ai, xai, zhipu. | read in the code | `packages/ai/providers/README.md`; `packages/ai/providers/factory/src/index.ts:98-117` |
| The factory has 18 adapter ids, including a generic openai_compat id used for protocol routes and gateways. It holds no keys. | read in the code | `packages/ai/providers/factory/src/index.ts:98-117,127-139`; `packages/ai/providers/factory/package.json` |
| Adapters do not retry. Retry runs at the stream-start seam in web, and rotation runs above it in managed-failover.ts. | read in the code | `packages/ai/provider-runtime/src/index.ts:7-19`; `apps/web/app/api/llm/v1/chat/completions/lib/provider-deadlines.ts:230-250` |
| Same-route retry allows 2 attempts for most retryable classes and 3 for server_overload; auth and context_overflow are never retried on the same route. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/provider-deadlines.ts:27,184-206`; `packages/ai/provider-runtime/src/retry.ts:12` |
| Timeouts: turn first-token budget 40 s, per-provider first-token deadline 25 s, function limit 300 s, TS stream idle default 90 s, CLI stream idle 300 s. | read in the code | `apps/web/lib/deadline-policy.ts:1,12,14`; `packages/ai/provider-runtime/src/watchdog.ts:1`; `apps/cli/src/models/mod.rs:31` |
| Rotation categories: connection, server_error, server_overload, capacity_off_switch, api_timeout, rate_limit, quota_exhausted, empty_response, unsupported_input. Never rotated: billing_exhausted, safety, content_blocked. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts:102-150` |
| Only Auto may switch models during failover; a named model rotates only across routes of the same model. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts:1-60` |
| Once a provider has minted tool-call ids in a turn (step 2 onward) the turn stays on that provider. | read in the code | `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts:321-329` |
| Billing exhaustion is classified separately from auth so unfunded accounts do not rotate onto another paid provider; one Auto-only exception exists. | read in the code | `packages/ai/provider-runtime/src/errors.ts:58-67`; `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts:117-180` |
| Gateway routes are declarative (gateways.json plus a harness gatewayId) and off unless AGI_ROUTING_GATEWAY_ROUTES=1; the flag is enforced at admission and at dispatch. | read in the code | `apps/web/lib/services/gateway-routing.ts:13,52-84`; `apps/web/app/api/llm/v1/chat/completions/lib/adapter-providers.ts:109-124`; `docs/development/add-a-gateway.md` |
| Nine gateway definitions exist in the catalog; openrouter_via_gateway is deliberately not wired. | read in the code | `packages/ai/model-registry/catalog/gateways.json`; `docs/development/add-a-gateway.md` |
| Base URL overrides are accepted only for allowlisted hosts, https only (http for localhost and 127.0.0.1); the allowlist is a static list plus registry-declared hosts. | read in the code | `packages/ai/provider-runtime/src/base-url.ts:5-34,60-90` |
| Web keeps keys in environment variables and builds adapters server-side; unconfigured providers throw ProviderConfigurationError naming the variable. | read in the code | `apps/web/lib/services/provider-adapter-service.ts:35-68,313-345` |
| Perplexity is the search-grounded chat provider (citations on the last chunk), and the only web-search provider entry is Perplexity Search. | read in the code | `packages/ai/providers/perplexity/src/index.ts:6-13`; `apps/web/lib/web-search/web-search-providers.json` |
| Image generation uses OpenAI and Google by direct fetch, defaulting to Google if its key exists, else OpenAI; a Stability branch exists but throws unsupported. | read in the code | `apps/web/app/api/media/image/lib/image-generation-provider.ts:378-420,507-640` |
| Speech to text and text to speech are OpenAI by direct fetch; the transcription route requires the voice_transcription slot to resolve to an OpenAI model. | read in the code | `apps/web/app/api/voice/speech/route.ts:196`; `apps/web/app/api/llm/v1/audio/transcriptions/route.ts:500-504`; `crates/agiworkforce-llm/src/speech.rs:1-20` |
| Rust engine agiworkforce-llm speaks five dialects (Anthropic, Gemini, OllamaNative, OpenAiResponses, OpenAiCompat), never reads keys itself, and redacts auth in Debug output. | read in the code | `crates/agiworkforce-llm/src/spec.rs:48-98`; `crates/agiworkforce-llm/src/lib.rs:1-20` |
| The CLI hard-codes endpoint URLs for Anthropic, Gemini and pre-registered OpenAI-compatible providers in Rust. | read in the code | `apps/cli/src/models/streaming.rs:412-445`; `apps/cli/src/models/mod.rs:102-192` |
| Mobile on-device inference uses @agiworkforce/local-llm with llama.rn, ExecuTorch and system models, not the TS provider packages. | read in the code | `packages/platform/local-llm/package.json`; `apps/mobile/src/features/model-picker/localModelRuntime.ts:1-60`; `apps/mobile/src/features/model-picker/service.ts:131-137` |
| Mobile cloud models are gated by a cloudUnlocked flag and the subscription tier (canAccessCloudModelForTier); a cloud model is 'locked' otherwise. Local models are not gated by these checks. This is mobile-side list logic, separate from web's server-side canAccessModel. | read in the code | `apps/mobile/src/features/model-picker/service.ts:180-190,275-290,300-306` |
| Mobile also lists provider-funded Free quota chat models: surface cloud_managed, runtimeLabel 'Provider-funded Free', described as promotional quota, shown only when cloud is unlocked. They are cloud calls, not on-device. | read in the code | `apps/mobile/src/features/model-picker/service.ts:37,300-330` |
| Runtime profiles mark vscode/byok-chat and vscode/local-chat unwired, and the desktop, mobile and CLI local profiles partial. | read in the code | `packages/ai/model-registry/catalog/harnesses.json runtimeProfiles` |
| A mistral harness is declared in the registry but names a nonexistent package, and web ADAPTER_PROVIDERS has no mistral entry. | read in the code | `packages/ai/model-registry/catalog/harnesses.json 'mistral/chat-completions'`; `apps/web/app/api/llm/v1/chat/completions/lib/adapter-providers.ts:126-258`; `packages/ai/providers directory listing` |
| Apps may not import provider leaf internals; multi-provider code uses the factory. Routing decisions belong to packages/ai/routing. | stated requirement | `packages/ai/providers/README.md 'Public API / Exports','What Does Not Belong Here'` |
| Managed billing debits the model's official price while recording the served route's price as cost, so a cheaper host never changes what the user pays. | stated requirement | `docs/architecture/provider-routing.md 'Model identity and serving routes'` |
| The Chrome extension imports only ThinkingTagSplitter from provider-protocol, in three files; it declares provider-runtime as a dependency but no source import was found. The VS Code extension runs a per-workspace local runtime process instead of calling providers. | read in the code | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts:91`; `apps/extension/src/features/cloud-bridge/conversationHistoryPull.ts:24`; `apps/extension/src/features/computer-use/cloudAgentClient.ts:24`; `apps/extension/package.json:49-50`; `apps/extension-vscode/src/integrations/localRuntimePool.ts:1-25` |
| The provider-runtime header names apps/mobile and apps/extension as consumers of the error taxonomy, but both only declare the dependency in package.json and neither imports it in source. | read in the code | `packages/ai/provider-runtime/src/index.ts:15-16`; `apps/mobile/package.json:67`; `apps/extension/package.json:50` |

## Open questions

- Does the public Electron desktop expose BYOK and local chat? AGENTS.md section 5 and docs/architecture/byok-provider-strategy.md say public Desktop chat is managed-cloud only, while harnesses.json lists desktop/byok-chat as implemented and desktop/local-chat as partial. I did not establish which is live.
- Is sign-in required for local inference on mobile and desktop? The requirement says payment is not, but I did not trace the account gate.
- What does the mistral harness depend on? It names a package that does not exist, and I found no model route using it. Is it planned, dead, or served some other way?
- Which HTTP methods do the /api/llm/v1 routes export (embeddings, models, route/preview, credits/balance)? I listed the route files but did not open each handler.
- Do the OpenAI and Anthropic SDK constructors apply their own default retries under web's retry? Not verified in SDK source.
- Are the table names routing_decision_traces and model_rollout_benchmarks present in the migrations? Taken from a doc only.
- Are the mobile and Chrome extension provider-runtime dependencies used at build time or only left over? No source import was found in either.
- How should audio (speech) and image providers be abstracted so a vendor swap needs no route edit? The code leaves this undecided.
- Who decides when gateway routes move from experimental_only to managed traffic? The doc says a founder-confirmed reseller agreement; no code gate beyond the catalog field was examined.
- Which plan names gate which providers or models for each subscription plan? Held in the subscription system, not read here.
- Do mobile's canAccessCloudModelForTier and web's canAccessModel read one shared entitlement source? The mobile gating is confirmed in service.ts, but I did not trace where its tier data comes from.
- Challenge 'wrong' (Chrome extension imports ThinkingTagSplitter only in freeTrialClient.ts) was checked and is right: the import is in three files (freeTrialClient.ts:91, conversationHistoryPull.ts:24, cloudAgentClient.ts:24). The page now cites all three. The 'only ThinkingTagSplitter from provider-protocol' part still stands, since a grep of apps/extension/src found no other import of provider-protocol or provider-runtime.
- Challenge 'missing' (mobile declares provider-runtime unused; header claims mobile and extension consume it) was checked and is right: apps/mobile/package.json:67 and apps/extension/package.json:50 declare it, and grep of both src trees found no import. Added to gaps and outdated_documents.
- Challenge 'missing' (mobile cloud gating by cloudUnlocked and tier) was checked and is right (service.ts:180-190,275-306). Added. The page does not claim every app shares one subscription check; that stays an open question above.
- Challenge 'missing' (mobile Provider-funded Free quota models) was checked and is right (service.ts:303-330, surface cloud_managed, shown only when cloud is unlocked). Added as a cloud-boundary fact.

## Project documents found out of date

- `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.ts (header comment)`: Says it mirrors the gateway's failover in services/api-gateway/src/routes/llm.ts. The code says: The services directory contains only signaling-server and upload-scanner; no api-gateway exists, so the referenced file is gone. (ls services shows signaling-server and upload-scanner; managed-failover.ts:4-5)
- `packages/ai/provider-runtime/src/index.ts (header comment)`: Lists apps/mobile and apps/extension as consumers of the error taxonomy. The code says: Both apps list @agiworkforce/provider-runtime in package.json, but no source file in either imports it. The Chrome extension imports only provider-protocol (ThinkingTagSplitter, three files). (apps/mobile/package.json:67; apps/extension/package.json:49-50; grep of apps/mobile/src and apps/extension/src; provider-runtime/src/index.ts:12-16)
- `packages/ai/model-registry/catalog/harnesses.json, harness 'mistral/chat-completions'`: Adapter field names @agiworkforce/providers-mistral. The code says: No such package exists in packages/ai/providers, and the web dispatch table has no mistral entry. (packages/ai/providers directory listing; adapter-providers.ts:126-258)
- `docs/architecture/byok-provider-strategy.md`: Says the released CLI and VS Code (when published) must support BYOK and open-model providers including Mistral, Hugging Face, Replicate and Bedrock, and lists them as P0 or P1 work. The code says: There is no TS provider package for Mistral, Hugging Face, Replicate or Bedrock. The CLI pre-registers OpenAI-compatible endpoints for OpenAI, xAI, DeepSeek, Perplexity, Qwen, Moonshot, Zhipu, LM Studio, MiniMax, OpenRouter and NVIDIA. The vscode BYOK profile is marked unwired. (apps/cli/src/models/mod.rs:102-192; harnesses.json runtimeProfiles vscode/byok-chat; packages/ai/providers listing)
- `docs/architecture/byok-provider-strategy.md ('Core Decision') versus harnesses.json`: States public Electron Desktop chat is managed-cloud-only and must not expose BYOK routes. The code says: harnesses.json defines desktop/byok-chat (implemented) and desktop/local-chat (partial) runtime profiles. Whether the Electron window uses them is not established. (packages/ai/model-registry/catalog/harnesses.json runtimeProfiles)
