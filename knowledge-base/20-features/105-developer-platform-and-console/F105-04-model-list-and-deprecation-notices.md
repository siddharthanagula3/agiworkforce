---
id: "F105-04"
type: "feature"
title: "Model list and deprecation notices"
aliases: ["Model list", "Model catalog (developer)", "GET /api/llm/v1/models", "GET /models", "deprecation_date", "Deprecation notices", "Retiring and Leaving labels", "--list-models", "S105.04", "S105.27"]
area: "105 Developer platform and console"
available_on: ["web", "desktop", "cli"]
implementation: {web: "built", desktop: "built", mobile: "n/a", cli: "built", vscode: "n/a", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S105.04", "S105.27"]
depends_on: ["surface:web", "surface:desktop", "surface:cli", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "SYS-observability-and-operations", "F105-02", "F105-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F105-04 Model list and deprecation notices

The gateway endpoint GET /api/llm/v1/models returns the models the caller's plan can run, with context size, capabilities and a deprecation_date that is null until a retirement is scheduled. Operators can hide models with a kill switch. The API docs page lists scheduled retirements; the CLI shows a live managed list without dates.

Area: [105. Developer platform and console](README.md). Requirement items: [S105.04](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10504), [S105.27](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10527).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | does not apply | does not apply | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Returns an OpenAI-style list of models for the caller (id, owner, tier, context window, max output, capabilities, deprecation_date, accepted request parameters) plus an x_agi_workforce block with user_tier, total_available, allowed_auto_modes, routing_profiles and temporarily_unavailable (apps/web/app/api/llm/v1/models/route.ts:41-61, 203-217). The console links to the Models page and to the Deprecations section of the API docs (DeveloperConsolePage.tsx:32-41).

**Why it exists.** Developers must know which models their key can call and when a pinned model will leave, so they can move before it stops working (doc: area brief S105.04 and S105.27; apps/web/app/api-docs/page.tsx:342-368).

**Who uses it.** Developers calling the gateway, the web console playground and prompts (use-gateway-models.ts), and the CLI's managed model picker.

**Problems it solves**

- Guessing which model ids work on a plan.
- Surprise outages when a model is retired.
- Routing clients that need to know which models are temporarily down.

**Use cases**

- curl the list with a key that has models:read before choosing a model id.
- Watch deprecation_date to schedule a migration.
- Run 'agi --list-models' to see the live managed models for the signed-in account.

## 2. User experience

**Where to find it**

- Web: API endpoint GET /api/llm/v1/models; console Reference card items 'Models' (link /models) and 'Deprecations' (link /api-docs#deprecations) (DeveloperConsolePage.tsx:32-41); public pages /models and /api-docs.
- Web console: the Model dropdown of the 'Try a request' card and the prompts editor list models with '(leaving <date>)' (RequestPlayground.tsx:278-286).
- CLI: flag '--list-models' (apps/cli/src/lib.rs:256-258, handler 7833-7845) prints 'AGI MANAGED CLOUD (live · <tier>...)' (apps/cli/src/provider.rs:236-262).
- Desktop: brief says done; same hosted pages expected [inferred from doc: AGENTS.md section 5]; not opened.
- Mobile, VS Code extension, Chrome extension: not covered by this feature in the code I read.

**Before you start**

- For the endpoint: a key with the models:read scope, or a signed-in session; with no Authorization header the endpoint answers with the public free catalog (models/route.ts:316; test 'returns the public free catalog when no credential was presented').
- For the CLI managed list: a saved sign-in (agi login) and a plan tier of pro or above; lower tiers get an empty managed list (apps/cli/src/models/gateway_models.rs picker_models).

**Screens and controls**

- Console Reference card links labelled 'Models' with text 'Every model your plan can call, with its capabilities and context' and 'Deprecations' with 'Models scheduled to leave, with their dates' (DeveloperConsolePage.tsx:32-41).
- API docs section 'Deprecations.' with a ledger 'Scheduled model retirements' or 'No model retirements are scheduled.' (api-docs/page.tsx:342-368).
- Models page card label 'Retiring <date>' (apps/web/features/models/__tests__/ModelCard.retirement.test.tsx:71-73).

**Journey**

1. Create a key with 'Read model catalog' (F105-02).
2. Send GET /api/llm/v1/models with Authorization Bearer.
3. Read data[].id, context_window, capabilities and deprecation_date.
4. Plan a move for any model whose deprecation_date is set, using the retirements ledger on /api-docs#deprecations.
5. In the CLI, run agi --list-models for the live managed list.

**What the person sees and gets**

- JSON list object with data array and x_agi_workforce block (route.ts:203-217).
- Errors: 401 invalid_api_key, 403 insufficient_scope, 403 mfa_required, ip_not_allowed, passkey_required, account_unavailable (route.ts:241-315).
- CLI messages: 'managed model discovery rejected the saved credential (HTTP 401); run `agi login`', 'managed model discovery credential lacks the models:read scope (HTTP 403)', 'managed model discovery is temporarily unavailable (HTTP 503); try again in a few seconds' (gateway_models.rs:86-143).

**Settings**

- Kill-switch flags per model and per provider read through readKillSwitchGate (route.ts:26, 135-138, 180-188).
- CLI limits: 12 second timeout, 1 MiB response, 512 models (gateway_models.rs:19-21).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Endpoint authenticates with scope models:read, rate limits as 'default', serves CORS (route.ts:225-325).
- Lists only models in the web cloud-chat runtime profile that the entitled plan tier admits, minus kill-switched models and providers, with temporarily unavailable ones moved to a separate array (route.ts:140-161).
- For developer-surface credentials (CLI, VS Code) whose plan does not include the developer surface, data is empty and allowed_auto_modes is empty (route.ts:168-173, 198-210).
- deprecation_date comes from the catalogue entry's deprecatedOn (route.ts:116; apps/web/lib/server/model-catalogue.ts:284).
- API docs page builds the retirements ledger from listScheduledModelRetirements, filtered to models with a date and a managed route (apps/web/lib/developer-api/model-retirements.ts:9-26).
- Web hook useGatewayModels loads the list with the session token and marks '(leaving <date>)' (use-gateway-models.ts:12-80).
- CLI discovers the managed list with trusted-host check, caching per account, tier filter and unknown-model defaults (gateway_models.rs:75-84, 116-200; picker_models).

**Incomplete**

- The CLI parser keeps only id, owned_by, tier, context_window, max_output; it drops deprecation_date and capabilities, so the CLI shows no retirement date (gateway_models.rs:24-35, 59-73).
- The API docs text says a model is 'no longer listed' from its date (api-docs/page.tsx text near 350); the removal rule itself was not located in code I read (unknown).
- The brief cites AccountMenuItems.tsx:117 for the catalog; that line is a Learn more or support menu area, not a models link (apps/web/shared/components/layout/AccountMenuItems.tsx:100-135 read).

**Present but disconnected or switched off**

- Kill-switch flags: no flag existing in the repo was inspected; the gate reads whatever operators set (unknown which are set).

**Not available**

- Mobile and the extensions have no developer model list screen found.
- Retirement notice by email or in-app message: not found.

## 4. Required behaviour

**Established requirements**

- Developers can browse the models their key can call, with capabilities and context size. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.04)
- Developers are told ahead of time when a model or API is deprecated. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.27)
- Every listed model carries deprecation_date, null until a retirement is scheduled. (source: apps/web/app/api/llm/v1/models/route.ts:58, 116; apps/web/app/api-docs/page.tsx:350-352)
- A model whose switch is closed, or whose every provider route is closed, is not listed. (source: apps/web/app/api/llm/v1/models/route.ts:135-138; test route.kill-switch.test.ts)
- A failed credential is refused, not downgraded to the anonymous list. (source: apps/web/app/api/llm/v1/models/route.ts:304-315; apps/cli/src/models/gateway_models.rs:200-203 comment)
- CLI shows 'managed model discovery is temporarily unavailable' on HTTP 503. (source: apps/cli/src/models/gateway_models.rs:86-90)

**Acceptance criteria**

1. GET with no Authorization returns the public free catalog (object list).
2. GET with an invalid Bearer returns 401 invalid_api_key; with a key lacking models:read returns 403 insufficient_scope.
3. GET with a valid key returns only models of the key owner's plan; each has context_window above 0 and a deprecation_date string or null.
4. Flipping a model's kill switch removes it from the next response without a deploy.
5. A model with every route degraded appears in x_agi_workforce.temporarily_unavailable and not in data.
6. On a developer-surface credential whose plan excludes the surface, data is empty.
7. API docs page lists every model with a scheduled retirement date, soonest first.
8. agi --list-models prints a managed section for a pro-or-above account and an explanatory line for lower tiers.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Retirement dates are the only deprecation signal; no API deprecation (non-model) is listed anywhere I read [inferred].
- The models page and the endpoint draw on the same catalogue code (buildCatalogueEntries) [inferred from imports; /models page not opened].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Parse and print deprecation_date in the CLI list.
- [proposed] Send a notice in the console when a model the account used recently is within a set number of days of retirement.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET /api/llm/v1/models | `apps/web/app/api/llm/v1/models/route.ts` | Builds and serves the list, kill-switch filter, auth errors, metadata. |
| service | model catalogue builder | `apps/web/lib/server/model-catalogue.ts` | buildCatalogueEntries, admitted flag, deprecatedOn (line 284). |
| service | model retirements | `apps/web/lib/developer-api/model-retirements.ts` | Scheduled retirements for the API docs ledger. |
| screen | API docs page | `apps/web/app/api-docs/page.tsx` | Deprecations section and ledger (lines 335-368). |
| screen | Models page | `apps/web/app/models/page.tsx` | Public model list (contents not opened). |
| component | ModelCard retirement label | `apps/web/features/models/__tests__/ModelCard.retirement.test.tsx` | Test of 'Retiring <date>' label. |
| component | DeveloperConsolePage reference links | `apps/web/features/developers/components/DeveloperConsolePage.tsx` | Links to Models and Deprecations. |
| hook | useGatewayModels | `apps/web/features/developers/hooks/use-gateway-models.ts` | Browser reads the list for the playground and prompts; formats '(leaving <date>)'. |
| service | kill switch gate | `apps/web/lib/feature-flags/capability-gate.ts` | readKillSwitchGate for models and providers. |
| config | model registry and catalog | `packages/contracts/types/src/model-catalog.ts` | Metadata, minimum tier and routes used for each model (generated catalog owner per doc: AGENTS.md section 4). |
| service | free chat surface policy | `apps/web/lib/free-chat-surface-policy.ts` | developer_surfaces capability and canUseManagedCloudChatSurface. |
| service | CLI gateway model discovery | `apps/cli/src/models/gateway_models.rs` | Fetches and bounds the live list, maps refusals, converts to picker rows. |
| command | agi --list-models | `apps/cli/src/lib.rs` | Flag at 256-258; handler at 7833-7845. |
| service | CLI model list formatter | `apps/cli/src/provider.rs` | format_model_list_with_discovery, line 236. |
| config | CLI bundled catalog | `apps/cli/src/model_catalog.rs` | Offline metadata, includes deprecation_date field (line 353) and filters deprecated models. |
| test | models route tests | `apps/web/app/api/llm/v1/models/route.test.ts` | Public catalog, 401, 403 scope, plan catalogs, temporary unavailability. |
| test | kill switch tests | `apps/web/app/api/llm/v1/models/route.kill-switch.test.ts` | Model and provider switches. |
| test | developer API contract test | `apps/web/app/api/llm/v1/__tests__/developer-api-contract.test.ts` | Gateway contract (by name; contents not read). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Client sends GET with or without Authorization; server applies the default rate limit. | our servers | models/route.ts:233-239 |
| Server authenticates with scope models:read; on failure maps to a typed refusal. | our servers | models/route.ts:239-315 |
| Server resolves the account's entitled plan tier. | our servers | models/route.ts:319-324 |
| Server builds catalogue entries for the tier, drops those outside the surface profile or switched off, separates temporarily unavailable ones. | our servers | models/route.ts:140-161, 175-190 |
| Server returns JSON with CORS headers. | our servers | models/route.ts:203-222 |
| CLI fetches the same endpoint with its saved JWT, bounds and validates the response, caches it per account and shows it. | device and our servers | gateway_models.rs:116-200, 297-380 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Model list response | Not stored on the server; built per request from the catalogue. | Not applicable. | CLI keeps an in-memory live catalog for the process (gateway_models.rs LIVE_CATALOG). |
| Catalogue, deprecation dates and kill-switch flags | Generated catalog in packages and the feature flag store | Catalog ships with the build; flags are read at request time. | Edited through the catalog curation file per doc: AGENTS.md section 4. |

**Models and providers.** The list reflects the model catalog and routing registry (SYS-model-catalog-and-routing); provider switches hide models whose routes are all closed; no model is invoked.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Optional: no credential gives the public free catalog; a valid key or session gives the account's catalog. |
| Permissions | Key needs models:read; a session works without scope. MFA, IP allow list, passkey and account state gates can refuse (route.ts:241-283). |
| Subscription | Catalog depends on the entitled plan tier; a trialing subscription keeps its paid catalog (test 'keeps a trialing subscription on its paid catalog'). Developer-surface credentials on a plan without the surface get an empty list (route.ts:168-173). CLI managed list shows only for pro, max, max_15x, team, team_premium, enterprise (gateway_models.rs picker_models). |
| Limits and metering | Rate limit 'default' (route.ts:233); CLI caps at 512 models and 1 MiB. The list call is not charged credits [inferred; no metering call in the route]. |
| Feature flags | Kill switches per model and provider (route.ts:135-138). |
| Model compatibility | Capabilities published: image_input, audio_input, video_input, structured_output, function_calling, reasoning (route.ts:63-70). |
| Provider restrictions | Provider switches can hide all models served only through one provider (route.ts:137). |
| Local mode | none found in the code for this endpoint. The CLI's --list-models also lists locally discovered models through local_models::discover_all in the same command (provider.rs:238-241), separate from the managed list. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No credential | Public free catalog. | models/route.ts:316; route.test.ts line 130 |
| Invalid credential | 401 invalid_api_key, not the public list. | models/route.ts:304-315 |
| Missing scope | 403 insufficient_scope. | models/route.ts:285-296 |
| Account check timed out | 503, not 401. | route.test.ts line 158 |
| Degraded model | Listed under temporarily_unavailable. | models/route.ts:157 |
| Empty plan list | data is an empty array for excluded developer surfaces. | models/route.ts:198-210 |
| Browser list failure | Console dropdown shows the error with 'Retry'. | RequestPlayground.tsx:260-269; use-gateway-models.ts |
| CLI oversized or malformed response | Rejected before or during parsing with a named error. | gateway_models.rs:147-172; test 'oversized_discovery_response_is_rejected_before_parsing' |
| CLI offline | Request failure is reported as 'managed model discovery request failed' and the local part still prints. | gateway_models.rs:129-132; provider.rs:236-245 |
| Timeout | CLI 12 second timeout; endpoint timeout not set in the route. | gateway_models.rs:19 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/models/route.test.ts`: Public catalog, 401, 503 on timeout, 403 lock-down and scope, passkey details, authenticated catalog, chat models only, degraded models, trialing plan, developer surface rules.
- `apps/web/app/api/llm/v1/models/route.kill-switch.test.ts`: Model switch, provider switch, no switch.
- `apps/web/features/models/__tests__/ModelCard.retirement.test.tsx`: 'Retiring <date>' label.
- `apps/cli/src/models/gateway_models.rs`: Rust unit tests (lines 400-545): endpoint forms, authenticated discovery, rejected credential not downgraded, locked-down message, scope and 503 messages, oversized response, tier policy.
- `apps/web/app/api/llm/v1/__tests__/developer-api-contract.test.ts`: Developer API contract (by name; contents not read).

**Test scenarios**

- **Public and keyed**
  1. curl the endpoint with no header.
  2. curl with a valid key with models:read.
  3. curl with a key lacking it.
  - Expected: Public list; account list; 403 insufficient_scope.
- **Retirement visible**
  1. Set a deprecation date on one model in the catalog curation file and sync.
  2. Fetch the list and open /api-docs#deprecations.
  - Expected: The model shows a date in deprecation_date and in the ledger.
- **Kill switch**
  1. Close a model's flag.
  2. Fetch the list again.
  - Expected: Model absent without a deploy.
- **CLI**
  1. agi login on a pro-or-above account.
  2. agi --list-models.
  - Expected: Section 'AGI MANAGED CLOUD (live ...)' with models; none shows a retirement date.
- **CLI refusals**
  1. Use a credential without models:read; then simulate a 503.
  - Expected: Messages naming models:read, then the temporary unavailability text.

**Where to look when it fails**

- Response codes invalid_api_key, insufficient_scope, mfa_required, ip_not_allowed, passkey_required, account_unavailable.
- x_agi_workforce.temporarily_unavailable and total_available in the body.
- CLI error strings from gateway_models.rs.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/105-developer-platform-and-console.md](../../70-qa/test-plans/web/105-developer-platform-and-console.md)
- Desktop: [70-qa/test-plans/desktop/105-developer-platform-and-console.md](../../70-qa/test-plans/desktop/105-developer-platform-and-console.md)
- CLI: [70-qa/test-plans/cli/105-developer-platform-and-console.md](../../70-qa/test-plans/cli/105-developer-platform-and-console.md)

## 10. Gaps and dependencies

- **CLI ignores deprecation_date and capabilities returned by the gateway.** Affects: CLI users.. Evidence: gateway_models.rs:24-35.. Work needed: Add fields and show the date.
- **The rule that removes a model from the list at its date was not found.** Affects: Developers relying on the doc text.. Evidence: api-docs/page.tsx:350-355 text; model-retirements.ts filters deprecated models out of the ledger only.. Work needed: Trace buildCatalogueEntries and add a test.
- **No proactive notice beyond static pages.** Affects: Developers on web and Desktop.. Evidence: No email or in-app notice code found.. Work needed: Decide the notice channel.
- **Desktop and mobile parity unverified.** Affects: Desktop.. Evidence: Brief says Desktop done; not opened.. Work needed: Verify in Electron.

**Depends on**

- surface:web
- surface:desktop
- surface:cli
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- SYS-observability-and-operations
- F105-02
- F105-05

## Unknown

- How a model is removed from the list at its deprecation date (buildCatalogueEntries not read).
- Contents of the /models page (apps/web/app/models/page.tsx) and its labels beyond 'Retiring'.
- Which kill-switch flags are set in production.
- Whether the Desktop shows these pages and whether the Tauri build lists models differently.
