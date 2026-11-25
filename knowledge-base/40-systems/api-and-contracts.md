---
id: "SYS-api-and-contracts"
type: "system"
title: "API and shared contracts"
basis: "code inspection and project documents"
second_reader: "not challenged"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# API and shared contracts

Every app talks to one hosted API (apps/web/app/api, 609 route files) through shared contract packages. cloud-contracts holds wire schemas, header names, the API version and typed clients. types holds shared types, the error taxonomy and TypeScript generated from Rust (crates/agiworkforce-protocol). An OpenAI-compatible gateway has a hand-written OpenAPI file. Rate limits and errors are centralized. Guards catch drift.

## What it is and why it exists

One server, six apps. Web, Desktop, Mobile, CLI, VS Code and Chrome all reach the same hosted API when they use managed cloud. To keep them in step, the repository holds the wire shapes in shared packages instead of letting each app keep its own copy. [requirement] (AGENTS.md section 3: one canonical owner per concept; a consumer never keeps a private copy of canonical data).

The pieces:

| Piece | What it is | Source |
| --- | --- | --- |
| `@agiworkforce/cloud-contracts` | Managed-cloud wire schemas, endpoint paths, stream deltas and typed HTTP clients, shared by Web, Desktop, Mobile and the services facade | [code] (packages/contracts/cloud-contracts/package.json:4; packages/contracts/cloud-contracts/src/index.ts:1-8) |
| `@agiworkforce/types` | Cross-surface contracts, the generated protocol bindings and trust-boundary invariants. Holds the error codes and taxonomy, the billing and plan catalog, and the model catalog reader | [code] (packages/contracts/types/package.json:4; packages/contracts/types/src/errors.ts:11; packages/contracts/types/src/error-taxonomy.ts:1) |
| `@agiworkforce/context` | Pure taxonomy of context classes a turn can carry (provenance, authorship, trust); does no I/O | [code] (packages/contracts/context/package.json:4; packages/contracts/context/src/index.ts:1-6) |
| Other contract packages | `compliance` (provider disclosure and jurisdiction policy), `licensing` (signed enterprise licence checks), `local-runtime` (typed contract for privileged desktop runtimes), `trust-boundaries` (classifies AGI-owned cloud hosts) | [code] (each package.json description under packages/contracts/) |
| Protocol crate | Rust types exported to TypeScript with ts-rs | [code] (crates/agiworkforce-protocol/Cargo.toml:8, :43) |
| HTTP API | Next.js route handlers under apps/web/app/api | [code] (apps/web/app/api) |
| Public API description | A hand-kept OpenAPI 3.0 file served at /openapi.json, plus the /api-docs page | [code] (apps/web/public/openapi.json; apps/web/e2e/public-openapi-bundle.spec.ts:18-24) |

Product requirements this serves: managed-cloud access is one AGI Subscription system for every app, and local inference does not need it. [requirement] (task brief). Local and own-key chats do not use these routes for inference; whether other calls such as sign-in or sync happen in those modes is [unknown] here and belongs to SYS-chat-turn-pipeline. The trust-boundaries package exists to classify cloud hosts. [code] (packages/contracts/trust-boundaries/src/index.ts:1-9).

## How it works today

### 1. The API surface

The web app has 609 `route.ts` files under `apps/web/app/api`, counted by `find`. [code] (apps/web/app/api). Top-level groups, with route-file counts:

| Group | What it holds (inferred from folder names) | Route files |
| --- | --- | --- |
| `llm` (`/api/llm/v1`) | The OpenAI-compatible gateway: models, chat completions, embeddings, transcriptions, route preview, credits balance, run control | 19 |
| `settings` | Account, organization, team, spend-limit and key settings | 80 |
| `admin`, `cron` | Operator tools and scheduled jobs | 43, 47 |
| `chat`, `memory`, `projects`, `files`, `uploads`, `library`, `artifacts` | Conversations, sync, memory, projects, files, artifacts | 15, 10, 13, 7, 5, 1, 23 |
| `code`, `agents`, `custom-agents`, `schedules`, `triggers`, `automation`, `mission` | Cloud code sessions, agents, schedules, triggers | 23, 9, 15, 6, 5, 1, 1 |
| `connectors`, `plugins`, `skills`, `mcp-apps`, `slack`, `github`, `webhooks`, `scim` | Integrations and extension points | 22, 28, 8, 2, 8, 10, 5, 7 |
| `billing`, `checkout`, `upgrade`, `usage`, `stripe-webhook`, `referrals`, `trial` | Payment, plan change, usage | 11, 1, 2, 10, 1, 2, 1 |
| `account-security`, `auth`, `devices`, `pair`, `user`, `me`, `consent`, `eligibility` | Identity, device pairing, account state | 15, 8, 1, 3, 6, 2, 1, 1 |
| `mobile`, `voice`, `media`, `maps`, `web-push`, `notifications` | Phone intents, voice, media, push | 11, 8, 12, 3, 1, 1 |
| `support`, `feedback`, `help`, `telemetry`, `health`, `status`, `version`, `releases`, `download*` | Support, health and release info | 23, 1, 1, 1, 1, 1, 1, 5, 2 |
| `v1/providers/[providerId]/stream` | A retired endpoint; it answers 410 `CANONICAL_COMPLETION_REQUIRED` for every caller | 1 |

The `__tests__`, `og` folders hold no route file. [code] (apps/web/app/api/v1/providers/[providerId]/stream/route.ts:1-10; apps/web/lib/server/retired-managed-execution.ts:7-13). The group list above is read from the folder listing and counts. What each group does beyond its name is [inferred].

Authentication coverage: `route-authentication.json` lists the routes that deliberately skip the account and tenant gate and says why; `check:route-account-gate` enforces it. [code] (packages/contracts/types/src/route-authentication.json:1-5).

### 2. The developer gateway

Base URL `https://agiworkforce.com/api/llm/v1`, OpenAI-compatible. [requirement] (docs/standards/http-api-surface.md:16-23). An alias host `api.agiworkforce.com` maps `/v1/models`, `/v1/chat/completions`, `/v1/embeddings`, `/v1/credits/balance`, `/v1/audio/transcriptions` and `/health`. [code] (apps/web/lib/api-host-route-contract.ts:1-26). The proxy reads that same list. [code] (apps/web/proxy.ts:13, :241-243). Route files exist for these, plus `route/preview`, `chat/completions/{approve,resume-input,resume-device,resume-caller,guest}` and `chat/completions/runs/{runId}/{pause,archive,resume,resume/stream,steer,steer/{steerId}}`. [code] (find apps/web/app/api/llm).

| Endpoint | Session token | API key scope | Source |
| --- | --- | --- | --- |
| api:GET /api/llm/v1/models | yes | `models:read` | [code] (apps/web/app/api/llm/v1/models/route.ts:239) |
| api:POST /api/llm/v1/chat/completions | yes | `inference:write` via the shared auth gate | [code] (apps/web/app/api/llm/v1/__tests__/developer-api-contract.test.ts:93-95 reads scopes from auth-gate.ts) |
| api:POST /api/llm/v1/audio/transcriptions | yes | `inference:write` | [requirement] (docs/standards/http-api-surface.md:53) |
| api:POST /api/llm/v1/route/preview | yes | `inference:write` | [code] (apps/web/app/api/llm/v1/route/preview/route.ts:120) |
| api:GET /api/llm/v1/credits/balance | yes | `usage:read` | [code] (apps/web/app/api/llm/v1/credits/balance/route.ts:36) |
| api:POST /api/llm/v1/embeddings | yes | none; API key refused | [code] (apps/web/app/api/llm/v1/embeddings/route.ts:198 passes no `apiKeyScope`; apps/web/lib/api-auth.ts:439-442) |

Three scopes exist: `models:read`, `inference:write`, `usage:read`. A key issued with no scopes gets all three. [code] (apps/web/lib/api-key-scopes.ts:1, :28-32).

### 3. Public API description

`apps/web/public/openapi.json` is OpenAPI 3.0.0, titled "AGI Workforce API", version 1.0.0, server `https://agiworkforce.com/api`. It documents 29 paths: the gateway and run-resume endpoints, voice live sessions, usage, checkout/upgrade, `/me`, organization members and invitations, schedule runs and connector permissions. It names three credential types: session bearer, AGI API key (`sk_live_`/`sk_test_`) and workspace key (`agiadm_`). [code] (apps/web/public/openapi.json, read with a script). It is hand-written, not generated from the routes [inferred: no generator found]. A test checks it against the code: every route an API key can reach is documented, scopes match, and the published rate-limit table matches `rateLimitConfigs`. [code] (apps/web/app/api/llm/v1/__tests__/developer-api-contract.test.ts:56-110, :233-262). It is public to signed-out callers. [code] (apps/web/e2e/public-openapi-bundle.spec.ts:18-24; a written test, run status [unknown]).

### 4. Shared contracts and managed cloud clients

`cloud-contracts` exports typed client factories, each taking a `fetchImpl` so each app supplies its own authenticated fetch. [code] (packages/contracts/cloud-contracts/src/managed-cloud-chat-client.ts:250; apps/mobile/services/managedCloudChat.ts:1-6). Clients exist for chat, chat attachments, projects, project knowledge, resumable uploads, settings and agent runs, plus code sessions. [code] (packages/contracts/cloud-contracts/src/index.ts; file names managed-cloud-*-client.ts).

Users of the factories, from a grep: Web (`apps/web/lib/hooks/useChatStream.ts`, `apps/web/features/projects/services/managed-cloud-projects.ts`), Desktop (`apps/desktop/src/api/cloudApi.ts`, `desktopCloudProjects.ts`, `managedCloudSettingsSync.ts`), Mobile (`apps/mobile/services/managedCloudChat.ts`, `managedCloudProjects.ts`), VS Code (`apps/extension-vscode/src/utils/managedCloudChat.ts`, `projectsClient.ts`), Chrome (`apps/extension/src/features/cloud-bridge/projectsClient.ts`, `conversationSyncClient.ts`). [code] (grep). The CLI is Rust and keeps its own clients in `apps/cli/src/cloud/*.rs`, held to the TypeScript shapes by golden fixtures and `check:cli-wire-parity`. [code] (apps/cli/src/cloud/contract_fixtures.rs:1-12; scripts/check-cli-wire-parity.mjs:1-30).

### 5. Handshake and versioning

Every surface sends three headers: `x-agi-surface`, `x-agi-client-version`, `x-agi-api-version`. The shared builder is `clientHandshakeHeaders`. [code] (packages/contracts/cloud-contracts/src/client-handshake.ts:11-15, :60-). The API contract version is `2026-09-17`, and the minimum supported is the same; a bump appends to `API_CONTRACT_VERSIONS`. [code] (packages/contracts/cloud-contracts/src/client-handshake.ts:19-30). A caller that names a version below the floor is refused with `CLIENT_UPDATE_REQUIRED`; a caller that names none is served. [code] (scripts/config/client-upgrade-refusals.json:3-8). The CLI mirrors it in Rust and treats status 426 as that refusal. [code] (apps/cli/src/cloud/handshake.rs:6-9, :28-30). `withErrorHandler` stamps `x-agi-api-version` and the minimum on responses. [code] (apps/web/lib/error-handler.ts:~346-351, from a grep hit at relative lines 227-231).

### 6. Protocol types from Rust

The crate `agiworkforce-protocol` (developer sessions, agent events, approvals, projects, worktree apply and more, in src/*.rs) uses `ts-rs`. A test `export_bindings` walks root types and writes `.ts` files. `scripts/generate-protocol-types.mjs` runs that test with `TS_RS_EXPORT_DIR` set to a staging dir, then writes or compares against `packages/contracts/types/src/generated/protocol` (654 files). `pnpm generate:protocol-types` writes; `pnpm check:protocol-types` compares without changing the tree. [code] (crates/agiworkforce-protocol/tests/export_bindings.rs:1-40; scripts/generate-protocol-types.mjs:11-45; package.json:420-421). TypeScript reads them through `@agiworkforce/types/protocol`. [code] (packages/contracts/types/package.json:14-16). Rust consumers of the crate: CLI, desktop Tauri, desktop gpui, app-server, mcp. [code] (grep of Cargo.toml files).

The generated types are consumed in TypeScript by at least the Chrome extension. [code] (apps/extension/src/types.ts, grep hit).

## Implementation map

| Concern | Owner | Source |
| --- | --- | --- |
| Wire schemas, paths, clients | file:packages/contracts/cloud-contracts/src/index.ts and the files it re-exports | [code] (index.ts:9-80) |
| Subpath exports | `./account-security`, `./client-request`, `./me`, `./support`, `./waitlist` | [code] (cloud-contracts/package.json:8-13) |
| Handshake and version | file:packages/contracts/cloud-contracts/src/client-handshake.ts; contract JSON file:packages/contracts/types/src/client-handshake-contract.json | [code] |
| Header names, request id | file:packages/contracts/cloud-contracts/src/header-names.ts | [code] (client-request.ts:1-2) |
| Route lane header `X-AGI-Route-Lane` (free or managed) | file:packages/contracts/cloud-contracts/src/route-lane.ts | [code] (route-lane.ts:8-14) |
| Error codes and taxonomy | file:packages/contracts/types/src/errors.ts, error-taxonomy.ts, error-taxonomy.json | [code] |
| Shared plan limits (concurrent turns) | file:packages/contracts/types/src/billing-catalog.ts | [requirement] (docs/standards/api-rate-limits.md:109-111) |
| Model catalog (never hand-edit models.json) | file:packages/contracts/types/src/models.json, model-catalog.ts | [requirement] (AGENTS.md section 4) |
| Generated protocol | file:packages/contracts/types/src/generated/protocol; crate file:crates/agiworkforce-protocol | [code] |
| Rate limiter | file:apps/web/lib/rate-limit.ts (1480 lines); headers in file:apps/web/lib/rate-limit-headers.ts | [code] |
| Error wrapper, gateway policy | file:apps/web/lib/error-handler.ts; file:apps/web/lib/api-gateway-policy.ts | [code] |
| API key scopes | file:apps/web/lib/api-key-scopes.ts; file:apps/web/lib/api-key-scope-error.ts; auth at file:apps/web/lib/api-auth.ts | [code] |
| Auth-scoped database handle | file:apps/web/lib/server/rls-db.ts (`getUserScopedDb`) | [code] (rls-db.ts:116) |
| Alias API host | file:apps/web/lib/api-host-route-contract.ts, file:apps/web/proxy.ts | [code] |
| Public OpenAPI | file:apps/web/public/openapi.json | [code] |
| Per-app handshake builders | web `apps/web/lib/client/csrf.ts`; desktop `apps/desktop/src/lib/platformHeaders.ts`; mobile `apps/mobile/src/platform/platformHeaders.ts`; vscode `apps/extension-vscode/src/platform/platformHeaders.ts`; chrome `apps/extension/src/platformHeaders.ts`; CLI `apps/cli/src/cloud/handshake.rs` | [code] (scripts/config/client-sdk-contract.json:21-40) |
| Old location | `packages/services/src/cloud-contracts` was moved; the ownership guard names it | [code] (scripts/check-cloud-contract-ownership.mjs:9-11). The directory packages/services/src no longer exists [code] (ls failed). |

Tests: test:apps/web/app/api/llm/v1/__tests__/developer-api-contract.test.ts; test:packages/contracts/cloud-contracts/src/__tests__ (client-handshake.test.ts and many more); test:crates/agiworkforce-protocol/tests/export_bindings.rs; test:apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.test.ts. Implementation status of all of these is present in the tree; whether any has been run is [unknown] (no run record read).

## Data and state

- **Rate-limit counters.** Held in a shared key-value store (Redis) under the prefix `agi-rl`; with no store, an in-memory fallback is used, which is per instance. [code] (apps/web/lib/rate-limit.ts:968, :1111-1135, :906). The doc says in-memory counting is no limit at all on serverless. [requirement] (docs/standards/api-rate-limits.md:45-48).
- **Managed turn slots.** A sorted set per user caps concurrent managed turns; a slot ages out after 360 seconds, just above the chat route's 300 second `maxDuration`. [code] (apps/web/lib/rate-limit.ts:1311-1366 area, MANAGED_TURN_SLOT_TTL_SECONDS).
- **Contract state in files.** Version constants (client-handshake.ts:19-30), golden JSON fixtures (cloud-contracts/src/__fixtures__/*.golden.json) and baselines such as scripts/config/route-shared-contracts-baseline.json, which only shrinks. [code] (scripts/check-route-shared-contracts.mjs:3-7).
- **API keys and users.** Keys are checked in `api-auth.ts`; a key request gets a database handle with claimed user scope instead of a user-token handle. [code] (apps/web/lib/server/rls-db.ts:93-101). Table names for key storage: [unknown] (not opened).
- **Device stores.** Each app keeps its own copy of tokens and caches; which store names apply is [unknown] for this page (see per-app pages).

## Rules: access, plans, modes

### Credentials

Three kinds, not interchangeable: session bearer (Clerk session JWT or first-party device token), AGI API key, workspace admin key (`agiadm_`). [code] (apps/web/public/openapi.json, securitySchemes). A key missing the scope gets 403 `insufficient_scope`. [requirement] (docs/standards/http-api-surface.md:30-35), and the models route emits that code. [code] (apps/web/app/api/llm/v1/models/route.ts:289-291).

### Rate limits (mode:cloud only)

Limits are configuration in `rateLimitConfigs`; the doc table is pinned by test so it cannot drift. [code] (apps/web/lib/rate-limit.ts:79; developer-api-contract.test.ts:233-262).

| Endpoint | Config key | Limit per minute | On Redis outage | Source |
| --- | --- | --- | --- | --- |
| GET /models | `default` | 100 | open | [code] (rate-limit.ts:836-840; models/route.ts:233) |
| GET /credits/balance | `credits-balance` | 60 | open | [code] (rate-limit.ts:182-186) |
| POST /audio/transcriptions | `audio-transcription` | 20 | closed | [code] (rate-limit.ts:399-403) |
| POST /chat/completions, per IP, before auth | `llm-completion-ip` | 1500 | closed | [code] (rate-limit.ts:354-358; auth-gate.ts:146) |
| POST /chat/completions, per user | `llm-completion` | 30 | closed | [code] (rate-limit.ts:359-363; auth-gate.ts:274) |
| POST /embeddings | `chat-conversation` | 60 | open | [code] (rate-limit.ts:282-286; embeddings/route.ts:126) |

The bucket is the verified user when the request carries a Clerk JWT or first-party device token; an `sk_live_`/`sk_test_` key is not verified locally, so it falls back to the client IP. [code] (rate-limit.ts:1034-1068). Chat completions passes an explicit `user:<id>` so it is per user for every credential. [code] (auth-gate.ts:274).

Plan scaling: keys in `TIER_SCALED_KEYS` multiply the base by the plan's `maxConcurrentTurns`. `llm-completion`, `audio-transcription` and `chat-conversation` are in the set. [code] (rate-limit.ts:934-966). The doc says no developer route passes a plan tier today, so developer limits are flat. [requirement] (docs/standards/api-rate-limits.md:64-66). I did not verify the caller side of that claim for every route [unknown].

A non-production env var can scale all ceilings up; production ignores it and logs an error. [code] (rate-limit.ts:40-77).

### Plans and quotas

Request-rate limits are separate from spend limits. Managed usage over quota answers 402 `insufficient_quota`. [requirement] (docs/standards/api-rate-limits.md:105-111); the embeddings route maps 402 and 429 to `insufficient_quota` (embeddings/route.ts:52-58). Concurrent managed turns per plan come from `BILLING_PLAN_PRODUCT_LIMITS.maxConcurrentTurns`. [requirement] (api-rate-limits.md:109-111). Plan names are in billing-catalog.ts; I did not read it, so plan-by-plan numbers are [unknown] here (see SYS-subscription pages).

### Modes

- mode:cloud uses this API and these limits.
- mode:local needs no payment and no inference call to these routes. [requirement] (task brief). Whether sign-in is demanded for local use is a separate question and [unknown] here.
- mode:own-key sends provider calls from the device and not through `/api/llm/v1`. [inferred]; the old provider stream route is retired. [code] (apps/web/app/api/v1/providers/[providerId]/stream/route.ts).

## Differences between apps

| App | How it reaches the contracts | Handshake builder | Source |
| --- | --- | --- | --- |
| surface:web | Imports TypeScript packages directly; server and client share files | `apps/web/lib/client/csrf.ts` sets clientVersion and apiVersion; the caller names the surface because the same bundle also runs inside the desktop shell | [code] (client-handshake-contract.json:20-35) |
| surface:desktop | `apps/desktop/src/api/cloudApi.ts` and service files use the cloud-contracts clients. The public Desktop is Electron showing the hosted web app; the Tauri code is internal | `apps/desktop/src/lib/platformHeaders.ts` | [code]; [requirement] (AGENTS.md section 5) |
| surface:mobile | `apps/mobile/services/managedCloudChat.ts` wraps `apiFetch` | `apps/mobile/src/platform/platformHeaders.ts` | [code] |
| surface:vscode | `apps/extension-vscode/src/utils/managedCloudChat.ts` | `apps/extension-vscode/src/platform/platformHeaders.ts`; client name `vscode-extension` | [code] (client-handshake.ts:32-33) |
| surface:chrome | `apps/extension/src/features/cloud-bridge/*Client.ts`; also uses generated protocol types | `apps/extension/src/platformHeaders.ts` | [code] |
| surface:cli | Rust. Own clients in `apps/cli/src/cloud/`, checked against golden JSON and wire-parity guard; uses the Rust crate directly | `apps/cli/src/cloud/handshake.rs` | [code] |

The one allowed place that writes the handshake header literals itself is `useChatStream.ts` on Web. [code] (scripts/config/client-sdk-contract.json:29). The CLI cannot import the TypeScript helper, so it is a recorded gap held by a guard. [code] (client-sdk-contract.json:44-46).

Rust types reach TypeScript in one direction only. [requirement] (AGENTS.md section 5).

## Failure handling

### Error shape

`withErrorHandler` wraps route handlers. It reads or makes a request id (a well-formed inbound `x-request-id` is kept), checks payload ceilings, applies the gateway policy (idempotency key, deadline, circuit breaker), and turns thrown errors into JSON. [code] (apps/web/lib/error-handler.ts:237-290, :84-117; apps/web/lib/api-gateway-policy.ts:60-175).

Body for an `AppError`: `{ "error": { "code", "message", "details"? }, "requestId" }`. The message is the real text only if the error is marked user-safe or its code is in `SAFE_TO_EXPOSE_CODES` (credit, subscription, rate limit, validation, invalid model, CSRF, conflict, step-up, MFA, IP, passkey, account unavailable, capability unavailable and the denial codes). Otherwise a generic text per status is used. `details` is sent only for safe codes. [code] (apps/web/lib/error-handler.ts:44-110). SERVICE_UNAVAILABLE adds retry headers. [code] (error-handler.ts:~118-122).

Error classes (authentication, authorization, policy, entitlement, validation, unsupported, conflict, not_found, rate_limit, quota, provider_unavailable, timeout, network, storage and more) group codes into one meaning for every surface, with fields `retryable`, `providerDetail` and `suggestedAction`. [code] (packages/contracts/types/src/error-taxonomy.ts:20-45; error-taxonomy.json:1-30). `check:error-model` checks every code has a class; `check:error-contract-parity` holds clients to the codes the Rust protocol sends. [code] (scripts/check-error-contract-parity.mjs:1-12).

The gateway also speaks an OpenAI-style body for usage errors (`insufficient_quota`, `invalid_request_error`, `insufficient_scope`). [code] (embeddings/route.ts:52-58; models/route.ts:289-291). So two body shapes exist on the same API: AGI `{error:{code,...}}` and OpenAI-style `{error:{type/code,...}}`. The exact OpenAI-style fields were not read [unknown].

### Rate-limit refusals

HTTP 429 with `error.code = RATE_LIMIT_EXCEEDED`, `message`, `reason` (`rate_limit:<key>`), `appeal_path`, `retry_after_seconds`, `reset_at`, and a `rateLimit` block (`limit`, `remaining`, `reset`, `reset_at`, `retry_after_seconds`). Headers come from the limiter. [code] (apps/web/lib/rate-limit.ts:1234-1300). The doc names `Retry-After`, `X-RateLimit-Limit/Remaining/Reset`, and `X-RateLimit-Error: rate-limiter-unavailable` with `Retry-After: 60`. [requirement] (docs/standards/api-rate-limits.md:90-93). Fail closed means 429 when Redis is down in production; fail open lets the request through. [code] (rate-limit.ts:1111-1160; docs/standards/api-rate-limits.md:45-48).

### Other statuses

426 or `CLIENT_UPDATE_REQUIRED` for an old build [code] (apps/cli/src/cloud/handshake.rs:28-30). 410 for the retired provider stream and agents/completion execute endpoints [code] (retired-managed-execution.ts:7-13; route-authentication.json lists those two routes as public). 413 via payload ceiling [inferred from `PayloadCeilingExceededError`, error-handler.ts:30-35]. 403 `IP_NOT_ALLOWED` for workspace keys outside the allow list [code] (openapi.json securitySchemes).

Clients: `ManagedCloudChatHttpError` carries `status`, `code` and `reason`; the chat client treats 429 specially. [code] (managed-cloud-chat-client.ts:121-137). Parse failures raise `ManagedCloudChatContractError`. [code] (managed-cloud-chat-client.ts:139).

## How it should work

How a new endpoint or a changed type reaches each app. Steps are what the repository's guards and owners imply; the order is [inferred]. Whether the whole flow has been run is [unknown].

### New endpoint

1. Add `route.ts` under `apps/web/app/api/...`, wrapped in `withErrorHandler`. A route missing tests, observability or states fails `check:route-tests`, `check:route-observability`, `check:route-states`. [requirement] (docs/standards/http-api-surface.md:81-92).
2. Put the request and response schemas in `packages/contracts/cloud-contracts/src`, export from `index.ts`, and register the module in the ownership guard's list. [code] (scripts/check-cloud-contract-ownership.mjs:14-40). `check:route-shared-contracts` fails a client-called route that does not import a shared contract unless it is in the shrinking baseline. [code] (scripts/check-route-shared-contracts.mjs:3-7).
3. Add a rate-limit entry to `rateLimitConfigs` and choose fail open or closed; call `withRateLimit`. [code] (rate-limit.ts:79, :1234).
4. If the route is public or skips the account gate, add it to `route-authentication.json` with a reason. [code] (route-authentication.json:1-5).
5. If an API key may call it, add a scope check via `getUserScopedDb(request, { apiKeyScope })` and document it in `openapi.json`; the contract test fails on an undocumented key route. [code] (developer-api-contract.test.ts:93-110).
6. Add the typed client method in the managed-cloud client and use it from each app. Each app passes its own fetch, so the same client works on Web, Desktop, Mobile, VS Code, Chrome. [code] (managedCloudChat.ts:1-6).
7. For the CLI, add the Rust struct in `apps/cli/src/cloud/` and a golden fixture in `cloud-contracts/src/__fixtures__`; `check:cli-wire-parity` compares them. [code] (scripts/check-cli-wire-parity.mjs:12-30).
8. Adding an endpoint or an optional field is compatible; removing or narrowing is breaking and follows the deprecation policy. [requirement] (docs/standards/http-api-surface.md:107-111).
9. An app that needs the new endpoint and lacks it should check what it knows before calling; the version header and `CLIENT_UPDATE_REQUIRED` exist for forced updates. [code] (client-upgrade-refusals.json). Desktop (Electron) shows the hosted web app, so it gets web changes on deploy. [requirement] (AGENTS.md section 5). Store apps (Mobile, extensions) reach users only after a release. [inferred]

### Changed Rust protocol type

Edit the Rust type, run `pnpm generate:protocol-types`, commit the regenerated files; `check:protocol-types` and `check:protocol-parity` fail on drift. [requirement] (AGENTS.md section 5; package.json:205, :420-421). Never hand-edit the generated files [inferred from the check that compares to staging].

### Changed model

Edit `models.curation.json`, run `pnpm sync:models`; never hand-edit `models.json`. [requirement] (AGENTS.md section 4). Model ids are not written in this page; see the catalog file.

### Bumping the API version

Append to `API_CONTRACT_VERSIONS`; raise the floor only on purpose. The Rust CLI constant and every client builder must follow; `check:client-handshake` checks it. [code] (client-handshake.ts:27-30; handshake.rs:1-3).

## Gaps

| Gap | Basis |
| --- | --- |
| The OpenAPI file covers 29 paths of 609 route files. Most first-party routes are undescribed publicly. | [code] (openapi.json paths; apps/web/app/api route count) |
| The OpenAPI file is hand-kept; no generator was found. Only key-reachable routes and error statuses are tested against code. | [inferred] (developer-api-contract.test.ts:56-110) |
| API-key traffic shares one bucket per client IP on `/models`, `/credits/balance` and others, so effective per-key limits are lower. | [requirement] (docs/standards/api-rate-limits.md:57-62), [code] (rate-limit.ts:1034-1068) |
| `/embeddings` reuses the `chat-conversation` limit key, so it shares a bucket class with conversation operations; `/models` reuses the generic `default` key. | [code] (embeddings/route.ts:126; models/route.ts:233) |
| The `api.agiworkforce.com` alias is stated as not release-verified until a deploy and a live request are recorded. | [requirement] (docs/standards/api-rate-limits.md:23-29) |
| The CLI handshake builder and wire structs are duplicates held by guards, not generated from the TypeScript. | [code] (client-sdk-contract.json:44-46) |
| Two error body shapes (AGI and OpenAI-style) coexist. | [code] (embeddings/route.ts:52-58; error-handler.ts:84-110) |
| Minimum supported API version equals latest, so any bump needs every installed build updated or a longer supported list. | [code] (client-handshake.ts:19-30) |
| No run records were read: nothing here is [executed]. |

## How to verify

Commands from the repo. I did not run them (read-only task), so all results are [unknown].

| Question | Command or file |
| --- | --- |
| Do the doc rate limits match the limiter? | Run the vitest file `apps/web/app/api/llm/v1/__tests__/developer-api-contract.test.ts` from inside `apps/web` |
| Are protocol types current? | `pnpm check:protocol-types`, `pnpm check:protocol-parity` |
| Is every route tested, observable and stateful? | `pnpm check:route-tests`, `check:route-observability`, `check:route-states` |
| Do clients agree on handshake and SDK usage? | `pnpm check:client-handshake`, `check:client-sdk-usage`, `check:client-version-compatibility` |
| Do CLI wire shapes match? | `pnpm check:cli-wire-parity` |
| Is each error code classed and handled by every client? | `pnpm check:error-model`, `pnpm check:error-contract-parity` |
| Is contract ownership kept? | `pnpm check:cloud-contract-ownership`, `pnpm check:route-shared-contracts` |
| Which guards exist and what do they cover? | `pnpm check:llm-operability` (chain in package.json:397), inventory `docs/agent-context/commands.json` |
| Live: does the alias host work? | A real authenticated request to the alias host after deploy; the doc says none is recorded. |

Note from AGENTS.md section 12: `apps/web` runs its own Vitest major, so use the package script there.

## Key facts

| Fact | Basis | Source |
|---|---|---|
| apps/web/app/api holds 609 route.ts files across about 90 top-level groups. | seen in a real run | `find apps/web/app/api -name route.ts | wc -l returned 609 in this session (a read-only listing, not a project run record)` (not found) |
| The developer gateway base is /api/llm/v1 and is OpenAI-compatible; an alias host maps five /v1 paths plus /health. | read in the code | `apps/web/lib/api-host-route-contract.ts:1-26`; `docs/standards/http-api-surface.md:16-23` |
| Three API key scopes exist: models:read, inference:write, usage:read; a key with no scopes gets all three. | read in the code | `apps/web/lib/api-key-scopes.ts:1`; `apps/web/lib/api-key-scopes.ts:28-32` |
| Embeddings accepts a session token only; an API key is refused because the route declares no scope. | read in the code | `apps/web/app/api/llm/v1/embeddings/route.ts:198`; `apps/web/lib/api-auth.ts:439-442`; `apps/web/public/openapi.json (/llm/v1/embeddings description)` |
| Chat completions is limited twice: 1500 per minute per IP before auth, then 30 per minute per user, both fail closed. | read in the code | `apps/web/lib/rate-limit.ts:354-363`; `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:146`; `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:274` |
| Other limits per minute: models 100 (key default, fail open), credits balance 60 (open), transcriptions 20 (closed), embeddings 60 (open, key chat-conversation). | read in the code | `apps/web/lib/rate-limit.ts:836-840`; `apps/web/lib/rate-limit.ts:182-186`; `apps/web/lib/rate-limit.ts:399-403`; `apps/web/lib/rate-limit.ts:282-286` |
| API-key requests are not verified locally by the limiter, so their bucket is the client IP, except chat completions which passes user:<id>. | read in the code | `apps/web/lib/rate-limit.ts:1034-1068`; `apps/web/app/api/llm/v1/chat/completions/lib/auth-gate.ts:274` |
| A 429 body has error.code RATE_LIMIT_EXCEEDED, retry_after_seconds, reset_at and a rateLimit block. | read in the code | `apps/web/lib/rate-limit.ts:1234-1300` |
| A test pins the doc rate-limit table to rateLimitConfigs. | read in the code | `apps/web/app/api/llm/v1/__tests__/developer-api-contract.test.ts:233-262` |
| The API contract version is 2026-09-17 and the minimum supported equals it; callers naming an older version get CLIENT_UPDATE_REQUIRED, callers naming none are served. | read in the code | `packages/contracts/cloud-contracts/src/client-handshake.ts:19-30`; `scripts/config/client-upgrade-refusals.json:3-8` |
| Every surface sends x-agi-surface, x-agi-client-version and x-agi-api-version; each app has its own header builder, and the CLI's is a Rust copy. | read in the code | `packages/contracts/types/src/client-handshake-contract.json`; `scripts/config/client-sdk-contract.json:21-46`; `apps/cli/src/cloud/handshake.rs:6-9` |
| Rust protocol types are exported by ts-rs through a test and a staging directory into packages/contracts/types/src/generated/protocol (654 files); pnpm generate:protocol-types writes and pnpm check:protocol-types compares. | read in the code | `scripts/generate-protocol-types.mjs:11-45`; `crates/agiworkforce-protocol/tests/export_bindings.rs:1-20`; `package.json:420-421` |
| The public OpenAPI file is hand-kept, version 1.0.0, with 29 paths and three credential schemes (session bearer, sk_ API key, agiadm_ workspace key). | read in the code | `apps/web/public/openapi.json` |
| withErrorHandler wraps routes, assigns a request id, hides unsafe error text behind generic messages, and stamps API version headers. | read in the code | `apps/web/lib/error-handler.ts:44-110`; `apps/web/lib/error-handler.ts:237-290` |
| Errors are classed once (authentication, entitlement, rate_limit, quota, provider_unavailable and others) with retryable and suggestedAction fields. | read in the code | `packages/contracts/types/src/error-taxonomy.ts:20-45`; `packages/contracts/types/src/error-taxonomy.json:1-30` |
| Managed cloud clients are factories taking a fetch function; Web, Desktop, Mobile, VS Code and Chrome call them, while the CLI uses Rust clients guarded by golden fixtures. | read in the code | `packages/contracts/cloud-contracts/src/managed-cloud-chat-client.ts:250`; `apps/mobile/services/managedCloudChat.ts:1-6`; `apps/cli/src/cloud/contract_fixtures.rs:1-12` |
| /api/v1/providers/{providerId}/stream is retired and answers 410 CANONICAL_COMPLETION_REQUIRED. | read in the code | `apps/web/app/api/v1/providers/[providerId]/stream/route.ts:1-10`; `apps/web/lib/server/retired-managed-execution.ts:7-13` |
| Concurrent managed turns are capped per plan by BILLING_PLAN_PRODUCT_LIMITS.maxConcurrentTurns, separate from request-rate limits; usage over quota answers 402 insufficient_quota. | stated requirement | `docs/standards/api-rate-limits.md:105-111` |
| Routes that skip the account and tenant gate are listed with reasons in route-authentication.json and enforced by check:route-account-gate. | read in the code | `packages/contracts/types/src/route-authentication.json:1-5` |
| Rate-limit ceilings can be scaled up only outside production; production ignores the env scale and logs an error. | read in the code | `apps/web/lib/rate-limit.ts:40-77` |
| The public Desktop shows the hosted web app, so route changes reach it on web deploy; the Tauri build reaches Rust only through registered commands. | stated requirement | `AGENTS.md section 5` |
| Contract ownership moved from packages/services/src/cloud-contracts to packages/contracts/cloud-contracts and a guard enforces the new home. | read in the code | `scripts/check-cloud-contract-ownership.mjs:9-11` |
| check:route-shared-contracts requires client-called routes to import a shared contract; legacy routes sit in a baseline that only shrinks. | read in the code | `scripts/check-route-shared-contracts.mjs:3-7`; `scripts/config/route-shared-contracts-baseline.json` |
| The api.agiworkforce.com alias is described as not release-verified until a production deploy and live authenticated request are recorded. | stated requirement | `docs/standards/api-rate-limits.md:23-29` |
| Redis fail-closed behavior: with the shared limiter unavailable in production, fail-closed keys refuse with 429 and fail-open keys pass. | read in the code | `apps/web/lib/rate-limit.ts:1111-1160`; `docs/standards/api-rate-limits.md:45-48` |

## Open questions

- Which database tables store API keys, workspace keys and request audit data was not opened here.
- Does the web route set a plan tier on any developer route, so that tier scaling applies? The doc says none do; each route was not checked.
- How the OpenAPI file is kept in step with routes beyond the key-reachable ones: no generator found, process is unconfirmed.
- What exact fields the OpenAI-style error body carries on every gateway route, and whether a single error shape is intended.
- Whether the api.agiworkforce.com alias has been deployed and verified live; no run record was read.
- Whether local-mode and own-key-mode users must sign in for any call to these routes (sync, entitlements); this is the account question the brief separates from payment.
- Plan-by-plan concurrency and usage numbers in billing-catalog.ts were not read.
- When the minimum supported API version should rise above the latest, since the supported list currently has one entry.
- Whether the services facade named in cloud-contracts docs still exists: packages/services/src is gone, but services/ holds signaling-server and upload-scanner only.
- Which other Rust consumers beyond CLI and desktop use the generated protocol types in TypeScript apps (only the Chrome extension was confirmed).

## Project documents found out of date

- `packages/contracts/cloud-contracts/src/index.ts header comment`: Says the typed clients are shared by Web, Desktop, Mobile, and the Services compatibility facade, and omits VS Code and Chrome, which also use them. The code says: VS Code and Chrome extension files call createManagedCloud* factories, and no packages/services/src directory exists. (packages/contracts/cloud-contracts/src/index.ts:1-8; apps/extension-vscode/src/utils/managedCloudChat.ts; apps/extension/src/features/cloud-bridge/projectsClient.ts; ls packages/services/src failed)
- `docs/standards/http-api-surface.md`: Describes run control as `runs/{runId}` carrying pause, resume, steer and archive, and does not name the extra `chat/completions/guest` route or the `resume/stream` and `steer/{steerId}` routes in the tree. The OpenAPI file lists only runs/{runId}/resume for run control. The code says: Route files exist for runs/[runId]/{pause,archive,resume,resume/stream,steer,steer/[steerId]} and chat/completions/guest. (find apps/web/app/api/llm; apps/web/public/openapi.json paths; docs/standards/http-api-surface.md:76-79)
- `docs/standards/api-rate-limits.md`: No contradiction found in the limits table; the table matches rateLimitConfigs and is pinned by a test. Its Last updated date (2026-09-27) predates later rate-limit changes I could not date, so freshness is unverified. The code says: Limits and fail modes match rate-limit.ts at the cited lines. (apps/web/lib/rate-limit.ts:282-286, :354-363, :399-403, :836-840; developer-api-contract.test.ts:233-262)
