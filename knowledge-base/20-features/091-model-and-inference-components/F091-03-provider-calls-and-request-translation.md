---
id: "F091-03"
type: "feature"
title: "Provider calls and request translation"
aliases: ["Inference request coordinator", "Provider adapter interface", "Provider credential broker", "Request translation", "Multimodal input translation", "Tool-schema translation", "Structured-output translation", "adapter factory", "S91.07-S91.13"]
area: "91 Model and inference components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S91.07", "S91.08", "S91.09", "S91.10", "S91.11", "S91.12", "S91.13"]
depends_on: ["F091-01", "F091-02", "F091-04", "F091-05", "SYS-inference-providers", "SYS-chat-turn-pipeline", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "mode:cloud", "surface:web", "provider:anthropic", "provider:openai"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F091-03 Provider calls and request translation

Server code that takes one chat request, picks the provider adapter built by a factory, supplies the deployment's provider key, and translates messages, images, documents, tools and structured-output requests into that provider's format. Calls happen on our servers for managed cloud; the web chat endpoint is the entry for every app.

Area: [91. Model and inference components](README.md). Requirement items: [S91.07](../../10-requirements/capabilities/091-model-and-inference-components.md#s9107), [S91.08](../../10-requirements/capabilities/091-model-and-inference-components.md#s9108), [S91.09](../../10-requirements/capabilities/091-model-and-inference-components.md#s9109), [S91.10](../../10-requirements/capabilities/091-model-and-inference-components.md#s9110), [S91.11](../../10-requirements/capabilities/091-model-and-inference-components.md#s9111), [S91.12](../../10-requirements/capabilities/091-model-and-inference-components.md#s9112), [S91.13](../../10-requirements/capabilities/091-model-and-inference-components.md#s9113).

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

**What it does.** The chat completions route admits the request, routes it, then asks ADAPTER_PROVIDERS for a builder per provider. Each builder creates a ProviderAdapter (id, auth, catalog, stream) through a shared factory with server credentials (apps/web/app/api/llm/v1/chat/completions/lib/adapter-providers.ts:126-246; apps/web/lib/services/provider-adapter-service.ts:313; packages/contracts/types/src/provider-adapter.ts:595).

**Why it exists.** So every provider is called the same way, keys stay on the server, and each vendor's wire format is handled in one adapter.

**Who uses it.** All apps through the chat endpoint; engineers adding providers.

**Problems it solves**

- Different vendor request formats.
- Attachments a vendor cannot read.
- Strict tool schemas required by some vendors.
- Keys leaking to clients.

**Use cases**

- Send a message with an image and a PDF to a vendor; each becomes the vendor's image and document block.
- Ask for JSON output; the request carries the response format only if the route supports it.
- Model uses tools; schemas are normalised per vendor.
- A free promoted turn uses its reserved credential instead of the shared key.

## 2. User experience

**Where to find it**

- No screen. Visible effect: attaching a file or image in the composer on any app, then asking for a tool or JSON answer.
- Web composer, Mobile ChatInput, Chrome, VS Code and CLI all send through the same endpoint family; CLI path unknown.

**Before you start**

- Cloud mode, signed-in account, a model whose capabilities include what is attached (images need vision) (request-processor.ts:5100-5115).

**Screens and controls**

- Attach control and tool toggles in each composer; picker for model.

**Journey**

1. Person sends a message with optional attachment.
2. Server hydrates attachments (reads stored files within a size budget) (apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:430-470).
3. Server builds a canonical request (toCanonicalChatRequest).
4. Adapter translates to the vendor format and streams the answer back.
5. Person sees the reply, or an error if the route cannot read an attachment.

**What the person sees and gets**

- 400 'The selected model cannot read images. Choose a vision-capable model.' code model_no_vision (request-processor.ts:5100-5110).
- Unsupported-input errors are classified so Auto can move to another route (managed-failover.ts:102-120).

**Settings**

- Server environment: per-provider API key and optional BASE_URL variables (names resolved in provider-adapter-service.ts:55-126); operator only.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Factory: one build function per provider through buildServerProviderAdapter; bespoke providers listed at adapter-providers.ts:126 plus protocol and gateway routes (apps/web/app/api/llm/v1/chat/completions/lib/adapter-providers.ts:240-246).
- Credential broker: resolveServerProviderApiKey reads the first set environment key from a per-provider list; static key wins over the Vercel OIDC token (apps/web/lib/services/provider-adapter-service.ts:55-66, :117-126).
- Base URL from environment is validated against an allow-list; a bad host is ignored with a warning (apps/web/lib/services/provider-adapter-service.ts:128-146).
- Reserved free-turn credential: only the Anthropic builder applies it, and it throws if the credential is not configured (apps/web/app/api/llm/v1/chat/completions/lib/adapter-factory.ts:27-39, :66-74).
- Canonical request: wire id per provider, tools split into function and raw vendor tools, response format kept only when the model supports JSON and the route lists that format (apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts:126-210).
- Anthropic translation: image (base64 or URL), PDF to document, text-like files to text, tool and tool-choice mapping, cache-breakpoint plan (packages/ai/providers/anthropic/src/translate.ts:102-135, :227-245, :336).
- Strict OpenAI tool schemas: additionalProperties false at the top, empty required lists (packages/ai/provider-protocol/src/openai-tool-schema.ts:3-57).
- Structured outputs on the Anthropic route filter schemas with unsupported keywords (packages/ai/providers/anthropic/src/translate.ts:296).
- OpenRouter requests carry a price ceiling from the route sheet, and routers always use zero-retention (canonical-request.ts:145-170).

**Incomplete**

- Strict-schema and structured-output rules differ per provider; I read Anthropic and the shared OpenAI helper only. Other providers' translate files not read.
- Coordinator spans several code paths (single stream, tool loop, research loop), each calling createFailoverPlan (apps/web/app/api/llm/v1/chat/completions/route.ts:603, :1051, :1254, :1365); I read the single-turn stream path only.
- The brief's route.ts:359 is the dispatch function, not a single coordinator class.

**Present but disconnected or switched off**

- Provider 'workers-ai' is built through the factory package but I did not find it in the server's adapter list; unknown.

**Not available**

- Own-key (BYOK) calls through this server path: unknown; the path here uses deployment keys (provider-adapter-service.ts:117-126).
- Local runtime adapters (ollama, lmstudio) exist as packages and desktop lists them as dependencies, but no import in apps/desktop/src was found (grep); how they are used is unknown.

## 4. Required behaviour

**Established requirements**

- One coordinator admits, routes, meters and dispatches each inference request. (source: S91.07 Should)
- Providers implement a common adapter interface selected by a factory. (source: S91.08 Should)
- A credential broker supplies each adapter with the right server credential per provider. (source: S91.09 Should)
- Canonical requests are translated into each provider wire format. (source: S91.10 Should)
- Images and documents are translated into each provider multimodal format. (source: S91.11 Should)
- Tool schemas are translated per provider (including strict-schema normalisation). (source: S91.12 Should)
- Structured-output requests are translated to each provider native structured-output feature. (source: S91.13 Should)
- Security behaviour fails closed; Rust and desktop egress use host-owned policy; secrets never committed. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. Every provider id in the managed list has one adapter built by the factory and a mapError.
2. A base URL environment value on a non-allow-listed host is ignored and a warning is logged.
3. An image sent to a model without vision returns 400 model_no_vision before any provider call.
4. A PDF reaches Anthropic as a document block; an unsupported file type on a route yields an unsupported-input classified error.
5. A tool schema with an empty object and no required list is sent with required [] for strict OpenAI routes.
6. A promoted free turn uses its reserved credential, or fails with a clear error if it is not configured.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Reserved-credential handling should apply to every provider that can serve a promoted turn; code applies it to Anthropic only.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a table in docs listing, for each provider, its document, image and strict-schema behaviour, generated from adapters.
- [proposed] Move reserved-credential handling into the shared factory function.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | chat completions route | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Entry; admits, marks provider started, dispatches (:359, :521-560). |
| service | request processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Builds the processed request used by dispatch. |
| service | adapter providers table | `apps/web/app/api/llm/v1/chat/completions/lib/adapter-providers.ts` | ADAPTER_PROVIDERS: builder, chat request builder, mapError, wire mode per provider (:126-246). |
| service | adapter factory | `apps/web/app/api/llm/v1/chat/completions/lib/adapter-factory.ts` | build*Adapter functions, reserved credential (:27-74), startProviderStream (:132). |
| service | provider adapter service | `apps/web/lib/services/provider-adapter-service.ts` | Credential broker, base URL allow-list, provider resolution (:117-190, :313). |
| service | canonical request | `apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts` | toCanonicalChatRequest (:173), wire id (:126), cache config (:331). |
| service | attachment hydration | `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` | Reads and admits attachments within a budget (:430-470). |
| schema | ProviderAdapter interface | `packages/contracts/types/src/provider-adapter.ts` | ProviderAdapter (:595), StreamChunk (:445), ChatRequest (:168). |
| service | providers factory | `packages/ai/providers/factory/src/index.ts` | Creates adapters for each provider package; config map. |
| service | Anthropic adapter | `packages/ai/providers/anthropic/src/index.ts` | Adapter and stream (:66-140). |
| service | Anthropic translate | `packages/ai/providers/anthropic/src/translate.ts` | Content blocks, tools, request (:102-135, :227, :336). |
| service | OpenAI strict tool schema | `packages/ai/provider-protocol/src/openai-tool-schema.ts` | normalizeStrictOpenAIJsonSchema (:3). |
| service | tool parameter schema | `packages/ai/provider-protocol/src/tool-parameter-schema.ts` | Shared schema normaliser used by the strict helper. |
| service | JSON schema mode | `apps/web/app/api/llm/v1/chat/completions/lib/json-schema-mode.ts` | Server-side schema limits for structured output. |
| config | harnesses and routes | `packages/ai/model-registry/catalog/harnesses.json` | Declares response formats and protocol per harness; model-routes.json lists routes. |
| command | adapter boundary guard | `scripts/check-provider-adapter-boundary.mjs` | check:provider-adapter-boundary guard. |
| test | provider tests | `packages/ai/providers/anthropic/src/__tests__/` | Translate, cache, file input, tools tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client sends the chat request with attachments and tool options. | device | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:591 |
| Server validates, routes, reserves usage, and marks the provider call as started. | our servers | apps/web/app/api/llm/v1/chat/completions/route.ts:521-560 |
| Attachments are read from storage and added within a size budget. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:430-470 |
| Canonical request is built, then the adapter translates it to the vendor wire format. | our servers | canonical-request.ts:173; packages/ai/providers/anthropic/src/index.ts:99-110 |
| Adapter calls the vendor with the deployment key, and streams chunks back. | outside service | packages/ai/providers/anthropic/src/index.ts:113-130; apps/web/lib/services/provider-adapter-service.ts:117-126 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Provider keys | Server environment variables (names only; values never recorded here) | no | Operator managed |
| Attachment bytes read for the turn | Existing file storage; copy lives in memory for the request | n/a | Retention rules are another feature (SYS-files-artifacts-and-storage) |

**Models and providers.** Provider folders under packages/ai/providers: anthropic, deepseek, google, groq, lmstudio, minimax, moonshot, nvidia, ollama, openai, openrouter, perplexity, qwen, vercel-gateway, workers-ai, xai, zhipu. The server list is built from SERVER_PROVIDER_CONFIG (provider-adapter-service.ts:35).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; guest chat has its own library (apps/web/lib/guest-chat/), not read. |
| Permissions | Workspace model policy may block providers (request-processor.ts:2900-2960). |
| Subscription | Plan decides which models are reachable; usage reserved before the call (route.ts:521-560). |
| Limits and metering | One managed-usage reservation spans all attempts; refunded on failure (route.ts:195-250). |
| Feature flags | Gateway routes behind gatewayRoutesEnabled (provider-adapter-service.ts:167-175). |
| Model compatibility | Images need vision (request-processor.ts:5100-5110); JSON output needs the json capability and a route that lists the format (canonical-request.ts:198-207). |
| Provider restrictions | Base URL allow-list; data-collection deny on OpenRouter (provider-adapter-service.ts:75-90). |
| Local mode | This path is the managed cloud path. Local runtime adapters exist as packages; the call path in Local mode is not shown in this feature. unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Provider key missing | Provider not available; managed list excludes it. | provider-adapter-service.ts:167-175 |
| Reserved free-turn key not configured | Error thrown 'The credential this promoted turn reserved its spend on is not configured.' | adapter-factory.ts:27-37 |
| Bad base URL override | Ignored with a warning (potential SSRF). | provider-adapter-service.ts:128-146 |
| Image to non-vision model | 400 model_no_vision. | request-processor.ts:5100-5110 |
| Route cannot read a file | Unsupported-input error; Auto may rotate to a route that can. | managed-failover.ts:102-120 |
| Provider id outside the table | Request is refunded and refused. | route.ts:1345-1350 [inferred from comment] |
| Offline / cancel | See F091-04. | n/a |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.test.ts`: canonical request building [inferred from file name]
- `apps/web/app/api/llm/v1/chat/completions/lib/adapter-factory.free-model-promotion.test.ts`: reserved credential in the factory [inferred from file name]
- `apps/web/app/api/llm/v1/chat/completions/lib/adapter-providers.test.ts`: provider table [inferred from file name]
- `apps/web/lib/services/provider-adapter-service.test.ts`: credential broker and base URL checks [inferred from file name]
- `packages/ai/providers/anthropic/src/__tests__/file-input.test.ts`: file input translation [inferred from file name]
- `packages/ai/provider-protocol/src/__tests__/tool-parameter-schema.test.ts`: tool schema normalisation [inferred from file name]
- `packages/ai/provider-protocol/src/__tests__/file-attachment-round-trip.test.ts`: attachment round trip [inferred from file name]
- `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.test.ts`: attachment hydration [inferred from file name]
- `apps/web/app/api/llm/v1/chat/completions/lib/json-schema-mode.test.ts`: structured output [inferred from file name]
- `scripts/check-provider-adapter-boundary.test.mjs`: adapter boundary guard [inferred from file name]

**Test scenarios**

- **Image and PDF**
  1. Attach an image and a PDF to a message on a vision-capable model.
  2. Send.
  - Expected: Reply refers to both; no unsupported-input error.
- **Image to text-only model**
  1. Pin a model without vision and attach an image.
  - Expected: 400 model_no_vision, no provider call.
- **Bad base URL**
  1. Set a provider BASE_URL variable to a non-allow-listed host in a test environment.
  2. Make a call.
  - Expected: Default host is used; warning logged.
- **Strict tool schema**
  1. Send a tool with an empty object schema to a strict route.
  - Expected: Wire schema has required [] and additionalProperties false.
- **JSON output**
  1. Request JSON output on a model with and without the json capability.
  - Expected: Response format is passed only when supported.

**Where to look when it fails**

- Log 'Refusing *_BASE_URL override pointing to a non-allowlisted host' (provider-adapter-service.ts:136-146).
- Span gen_ai.stream.start with provider request id and response model (adapter-factory.ts:132-175).
- captureModelFailure with provider, model, error code (adapter-factory.ts:173).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Reserved free-turn credential applied in the Anthropic builder only.** Affects: Promoted free turns on other providers.. Evidence: apps/web/app/api/llm/v1/chat/completions/lib/adapter-factory.ts:66-74 versus :76-130. Work needed: Confirm promoted turns only run on that provider, or generalise the helper.
- **No per-provider table of document, image and strict-schema support was found for providers other than Anthropic.** Affects: Engineers and testers.. Evidence: packages/ai/providers/anthropic/src/translate.ts:102-135 only read. Work needed: Read each translate file and record support.
- **Own-key calls through the server path are not shown.** Affects: Own key mode users.. Evidence: provider-adapter-service.ts:117-126 reads only deployment keys. Work needed: Find the own-key call path per app.

**Depends on**

- F091-01
- F091-02
- F091-04
- F091-05
- SYS-inference-providers
- SYS-chat-turn-pipeline
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- mode:cloud
- surface:web
- provider:anthropic
- provider:openai

## Unknown

- Own-key calls through any app.
- Translate behaviour of providers other than Anthropic.
- Whether workers-ai is in the server adapter list.
- How Local mode calls local adapters.
- The harnesses.json response format entries (not opened).
- How the CLI sends requests.
