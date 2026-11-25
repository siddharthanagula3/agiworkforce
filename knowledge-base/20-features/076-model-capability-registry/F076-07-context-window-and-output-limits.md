---
id: "F076-07"
type: "feature"
title: "Context window and output limits"
aliases: ["Context window and output limits", "Context ceiling", "Output ceiling", "Context budget", "Max output tokens", "S76.28", "S76.29", "S76.30", "message_too_long", "context compaction", "Per-model file and media size limits (not built)"]
area: "76 Model-capability registry"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "partial", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S76.28", "S76.29", "S76.30"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-local-inference", "SYS-memory-projects-and-context", "table:conversations", "file:packages/contracts/types/src/model-catalog.ts", "api:POST /api/llm/v1/chat/completions", "api:GET /api/llm/v1/models", "mode:cloud", "mode:local", "surface:web", "surface:mobile", "surface:cli", "surface:vscode"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F076-07 Context window and output limits

Each chat model has a context window (how much it can read) and an output limit (how long its reply can be). The server trims or summarises old chat history to fit, refuses a turn that cannot fit, and caps reply length. Pickers show the sizes. Per-model file, picture, audio and video size limits do not exist.

Area: [76. Model-capability registry](README.md). Requirement items: [S76.28](../../10-requirements/capabilities/076-model-capability-registry.md#s7628), [S76.29](../../10-requirements/capabilities/076-model-capability-registry.md#s7629), [S76.30](../../10-requirements/capabilities/076-model-capability-registry.md#s7630).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Stores two numbers per model in the model catalog (contextWindow, maxOutputTokens) (packages/contracts/types/src/model-catalog.ts:654-655). Uses them to show limits in pickers, to warn before a model switch, to shrink saved history before a Cloud turn, to refuse a message that cannot fit, and to choose how many reply tokens to ask for (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5879-5882, 6702-6752).

**Why it exists.** A model that is sent more than it can hold fails or silently loses text. A fixed reply cap would cut long answers at the same point for every model. The registry brief states: the registry records each context window, the product shows it and trims or refuses over-long requests; requests are capped by the output limit and it is shown (doc: knowledge-base/data/area-briefs/076-model-capability-registry.md S76.28, S76.29).

**Who uses it.** People chatting on Web, Desktop, Mobile, CLI and VS Code who pick models or keep long chats; developers calling the chat completions API; QA and support staff diagnosing 'message too long' errors.

**Problems it solves**

- Long chats do not fail when the model is switched to a smaller one: history is summarised or dropped with a marker (apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts:16-19).
- A single message that cannot fit is refused before any provider call, and the credit reservation is released (request-processor.ts:6728-6752).
- Reply length follows the model instead of one fixed number (packages/contracts/types/src/model-catalog.ts:1516-1550).
- People can compare models by size before choosing (apps/web/features/chat/components/Composer/ModelCatalogue.tsx:262-263).

**Use cases**

- A user on Web opens the model picker, opens a model card and reads 'Context ceiling' and 'Output ceiling' before choosing it.
- A user with a very long chat switches to a model with a smaller window; the composer warns that older messages will be left out of the next reply (apps/web/features/chat/components/Composer/model-compatibility.ts:178-186).
- A developer sends an oversized prompt to the API and receives HTTP 400 with code message_too_long (request-processor.ts:3311-3325).
- A CLI user lists models and sees context and output sizes beside each id (apps/cli/src/provider.rs:250-265).

## 2. User experience

**Where to find it**

- Web (and the public Desktop, which shows the hosted web app, doc: AGENTS.md section 5): model picker, open a model card; rows 'Context ceiling' and 'Output ceiling' (apps/web/features/chat/components/Composer/ModelCatalogue.tsx:262-263).
- Mobile: Context details sheet shows 'About N of M tokens (P%)' for the chat (apps/mobile/src/features/chat/components/ContextDetailsSheet.tsx:93) and a context warning chip (apps/mobile/src/features/chat/components/ContextWarningChip.tsx). The model row itself does not show context or output sizes: ModelRow.tsx has no context or output field, and formatContextWindow in apps/mobile/lib/models.ts:147 has no caller outside its definition (searched apps/mobile).
- CLI: the models listing prints '<id> <N>K ctx <N>K out' per managed cloud model (apps/cli/src/provider.rs:250-265).
- VS Code: model quick pick description ends with 'N context' and 'N output' (apps/extension-vscode/src/features/model-picker/modelConstants.ts:286-294); switching warns with text such as 'holds X of context instead of Y, so a long chat may be trimmed' (modelConstants.ts:347-364).
- Chrome extension: no context or output display found (searched apps/extension for contextWindow and maxOutputTokens).

**Before you start**

- A chat model in the catalog with the numbers filled in; a model without them shows no row (ModelCatalogue.tsx:265 filters null values).
- Cloud trimming needs a Cloud chat turn; Local and own-key runs are handled by each app (see access_and_usage).

**Screens and controls**

- Web: model card rows 'Context ceiling' and 'Output ceiling' (read only).
- Web composer: a compatibility notice when the conversation exceeds the model budget, text 'This conversation is about X tokens and <model> holds Y. Older messages will be left out of the next reply.' (model-compatibility.ts:179-185).
- Mobile: Context details sheet with percent used and breakdown rows (contextBudgeter.ts:52-67) and warning chip.
- CLI: models listing; interactive '/compact' summarising compaction (apps/cli/src/agent/chat.rs:1015-1018).
- VS Code: model quick pick and a pre-switch warning.

**Journey**

1. 1. The person opens the model picker or the models listing and reads the sizes.
2. 2. The person picks a model; if it is smaller than the previous one the app warns (Web composer notice, VS Code warning).
3. 3. The person sends a message; the app sends the history to the server (Cloud) or to the local runtime.
4. 4. On Cloud the server estimates tokens, compacts or trims history to the budget, and refuses only if the latest message alone cannot fit (request-processor.ts:6702-6752).
5. 5. The model replies up to the output cap chosen for the turn (request-processor.ts:5879-5882).
6. 6. If refused, the person sees 'This message is too long for the selected model. Shorten it or send it in parts, or choose a model with a larger context window.' (request-processor.ts:3313-3320).

**What the person sees and gets**

- Error text above with HTTP 400 and code message_too_long (request-processor.ts:3317-3325).
- In the history sent to the model, a marker line '[Earlier messages in this conversation were omitted to fit the model context window.]' replaces dropped turns, or a short summary replaces them when compaction runs (context-window.ts:16-17, context-compaction.ts:411-468).
- Mobile percent-used readout; CLI notice 'Context compacted' or 'Context unchanged, nothing earlier could be summarized' (apps/cli/src/agent/chat.rs:1230-1235).
- API: /v1/models returns context_window and max_output per model (apps/web/app/api/llm/v1/models/route.ts:55-57, 112-114).

**Settings**

- Server switch AGI_CONTEXT_COMPACTION_ENABLED: '0', 'false' or 'off' turns summarising compaction off and leaves mechanical trimming (apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts:38, 59-62).
- CLI config key max_tokens (default 8192) (apps/cli/src/config.rs:185-186, 288-290).
- Temporary chats are never summarised, they are trimmed mechanically (context-compaction.ts:433-441).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Catalog fields contextWindow and maxOutputTokens exist on each model (packages/contracts/types/src/model-catalog.ts:654-655).
- Web model card shows both limits (ModelCatalogue.tsx:262-263).
- Server fits history to the window before each Cloud turn: budget is window minus reply allowance minus a fixed 2,048 reserve, with a floor of 1,024 (apps/web/features/chat/components/Composer/model-compatibility.ts:9-10, 47-53).
- Server compacts old turns into a summary when the plan drops messages, the conversation is saved and not temporary, and compaction is on; otherwise it trims mechanically (context-compaction.ts:433-441).
- Server refuses a turn whose latest user message cannot fit, releases the managed-usage reservation, and returns code message_too_long (request-processor.ts:6728-6752).
- Output cap when the caller names none: the model's declared maximum, bounded by the window and by a product ceiling of 8,192 tokens; 4,096 when the catalog has no value; 1,024 for non-text models (model-catalog.ts:1525-1550).
- For Auto, router and free-promotion turns on non-API surfaces the adaptive response budget takes the smallest of the depth ceiling, the caller's max_tokens and the model's limit (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3675-3680, 5863-5882; packages/ai/routing/src/response-budget.ts:196-214).
- API /v1/models publishes context_window and max_output (apps/web/app/api/llm/v1/models/route.ts:112-114).
- Composer pre-switch check uses the same budget function as the server (model-compatibility.ts:42-53, 176-186).
- Mobile computes a context budget with warn at 70 percent and compact at 80 percent of the window (apps/mobile/src/features/memory/services/contextBudgeter.ts:82-96).
- CLI summarising compaction uses the model's window from its catalog (apps/cli/src/agent/chat.rs:1031, 1190-1195) and maps a provider overflow to a context_overflow error with the model's limit (apps/cli/src/models/streaming.rs:350-355).
- CLI listing and VS Code quick pick show sizes (provider.rs:250-265; modelConstants.ts:286-294).

**Incomplete**

- Per-model file, picture, audio and video size limits are not in the registry; the web composer checks only plan-level byte limits (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:944-955, 921; packages/contracts/types/src/billing-catalog.ts:757).
- For a fixed model on the API surface the caller's max_tokens is passed through; no clamp to the model's maximum was found in request-processor.ts (lines 5879-5882) and no per-adapter clamp was found for OpenAI-style routes. Anthropic's translator does resolve a value from the model's maximum (packages/ai/providers/anthropic/src/translate.ts:395). Whether upstream providers reject it is unknown.
- Mobile local models get a made-up output limit, a quarter of the window between 1,024 and 8,192 (apps/mobile/src/features/model-picker/service.ts:152-153, 163); the output value is not shown anywhere (searched apps/mobile).
- Mobile unknown-model fallback uses 4,096 as the window (apps/mobile/src/features/memory/services/contextBudgeter.ts:36-43).
- Desktop (Tauri, internal) keeps contextWindow and maxOutput in its model store (apps/desktop/src/stores/modelStore.ts:42-67); whether a screen shows them is unknown.

**Present but disconnected or switched off**

- apps/mobile/lib/models.ts:147 formatContextWindow is exported but nothing calls it (searched apps/mobile excluding node_modules).
- Summarising compaction is disabled when AGI_CONTEXT_COMPACTION_ENABLED is 0, false or off (context-compaction.ts:59-62).

**Not available**

- Per-model maximum file, image, audio and video sizes on every app and the API (doc: knowledge-base/data/area-briefs/076-model-capability-registry.md S76.30).
- Chrome extension display of limits and its own trimming: none found in apps/extension.

## 4. Required behaviour

**Established requirements**

- The registry records each model's context window; the product shows it and trims or refuses over-long requests accordingly. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.28)
- The registry records each model's output-token limit; requests are capped by it and it is shown. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.29)
- The registry records per-model maximum file, image, audio and video sizes and uploads are checked against the chosen model. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.30)
- Model IDs and limits come from the generated catalog, never a literal in a consumer. (source: doc: AGENTS.md section 4)
- Local, own-key and Cloud stay separate; Cloud trimming must not route a Local chat to Cloud. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. Given a model with a 200K window, the Web model card shows 'Context ceiling' and 'Output ceiling' with rounded K or M values.
2. Given a Cloud chat whose latest message alone exceeds the window budget, the API returns HTTP 400 with code message_too_long and no credit is kept.
3. Given a long saved chat on a smaller model, the turn is sent with a summary or the omission marker and succeeds.
4. With AGI_CONTEXT_COMPACTION_ENABLED=0 the same turn is trimmed with the omission marker and no summary call is made.
5. A request with no max_tokens to a fixed text model asks the provider for at most 8,192 tokens.
6. The Web composer warns before sending when the conversation exceeds the selected model's budget.
7. The CLI listing prints a context size and an output size for every managed cloud model.
8. An upload larger than a chosen model's media limit is refused (required by S76.30; currently fails, see gaps).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The output limit shown in the picker is the catalog value, not the capped 8,192 value used for a turn [inferred from ModelCatalogue.tsx:263 versus model-catalog.ts:1525].
- Token counts are estimates, not provider counts, so the real window can be hit slightly before or after the estimate [inferred from estimateTokens use in model-compatibility.ts:22-30].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Clamp a caller's max_tokens to the registry maximum on every surface including the API, and say so in the response.
- [proposed] Add per-model input size fields (file, image, audio, video bytes and counts) to the catalog and check them in the composer and on upload routes.
- [proposed] Show context and output sizes on the Mobile model row, as the brief says Mobile is done.
- [proposed] Remove or use the unused formatContextWindow on Mobile.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | ModelMetadata.contextWindow / maxOutputTokens | `packages/contracts/types/src/model-catalog.ts` | Catalog fields that hold the two limits (lines 654-655). |
| service | resolveMaxOutputTokens | `packages/contracts/types/src/model-catalog.ts` | Chooses the reply cap when the caller names none (lines 1516-1550). |
| service | request-processor (chat completions) | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Picks maxTokens (5879-5882), runs compaction (6702-6712), refuses over-long turns (6728-6752, 3311-3325). |
| service | context-window planner | `apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts` | Plans which messages to drop or shrink and inserts the omission marker. |
| service | context-compaction | `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts` | Summarises dropped history with a cheaper route; holds AGI_CONTEXT_COMPACTION_ENABLED. |
| service | model-compatibility budget | `apps/web/features/chat/components/Composer/model-compatibility.ts` | contextBudgetTokens and the composer's pre-switch overflow finding, shared by server and composer. |
| service | response budget planner | `packages/ai/routing/src/response-budget.ts` | Minimum of depth ceiling, caller max and model max for Auto turns. |
| component | ModelCatalogue | `apps/web/features/chat/components/Composer/ModelCatalogue.tsx` | Web picker card rows 'Context ceiling' and 'Output ceiling' (262-263). |
| endpoint | GET /api/llm/v1/models | `apps/web/app/api/llm/v1/models/route.ts` | Publishes context_window and max_output (112-114). |
| service | Mobile context budgeter | `apps/mobile/src/features/memory/services/contextBudgeter.ts` | Used-versus-window percentages and warn/compact status for Mobile. |
| component | ContextDetailsSheet | `apps/mobile/src/features/chat/components/ContextDetailsSheet.tsx` | Mobile 'About N of M tokens' readout. |
| component | ContextWarningChip | `apps/mobile/src/features/chat/components/ContextWarningChip.tsx` | Mobile warning chip when the budget is nearly used. |
| service | Mobile model definitions | `apps/mobile/src/features/model-picker/service.ts` | Builds ModelDef with contextWindow and maxOutput for cloud and local models (152-163, 321-322). |
| command | CLI models listing | `apps/cli/src/provider.rs` | Prints context and output sizes (250-265, 330-336). |
| service | CLI compaction | `apps/cli/src/compaction.rs` | Summarising compaction against the model's window; driven from apps/cli/src/agent/chat.rs:1190-1235. |
| config | CLI max_tokens default | `apps/cli/src/config.rs` | Default reply cap 8192 (288-290). |
| service | CLI model catalog | `apps/cli/src/model_catalog.rs` | context_window and max_output_tokens per model, default 4,096 output (192, 1041-1045). |
| component | VS Code model constants | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | Picker description with sizes (286-294) and model-switch loss warning (347-364). |
| store | Desktop model store | `apps/desktop/src/stores/modelStore.ts` | Tauri desktop keeps contextWindow and maxOutput per model (42-67). |
| component | Attachment limits in composer | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Plan-level file and image byte limits (944-955); not per model. |
| config | AGI_CONTEXT_COMPACTION_ENABLED | `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts` | Environment switch for summarising compaction (38, 59-62). |
| test | context-window tests | `apps/web/app/api/llm/v1/chat/completions/lib/context-window.test.ts` | Covers trimming and fitting. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web, Desktop, Mobile, CLI or VS Code shows catalog sizes and (Web composer, VS Code) compares the old and new model. | device | ModelCatalogue.tsx:262-263; model-compatibility.ts:176-186; modelConstants.ts:347-364 |
| The app sends the chat history to the Cloud chat completions route. | device and our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:635 |
| The server picks the reply cap: the caller's max_tokens if given, otherwise the model-based cap, adjusted by the adaptive budget for Auto turns. | our servers | request-processor.ts:5863-5895; model-catalog.ts:1539-1550 |
| The server plans a trim, and compacts the dropped span into a summary through a cheaper managed route, unless temporary chat or switch off. | our servers | request-processor.ts:6702-6712; context-compaction.ts:411-468 |
| If the latest user message still cannot fit, the server returns 400 message_too_long and releases the reservation. | our servers | request-processor.ts:6728-6752 |
| Otherwise the provider is called with the fitted messages and the cap (provider may be an outside service). | outside service | request-processor.ts:6668, 6706 |
| CLI and Mobile run their own budgeting and compaction on the device before or around the request. | device | apps/cli/src/agent/chat.rs:1190-1235; apps/mobile/src/features/memory/services/contextBudgeter.ts:82-96 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Conversation compaction summary, the message id it covers, and a digest | Conversation row columns compaction_summary, compaction_summary_through_message_id, compaction_summary_digest (apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.ts:111-115) | Stored server side with the conversation; sync to apps beyond that unknown | Follows the conversation; unknown whether it is cleared on edit |
| Trimmed history sent to the model | Not stored; the saved chat keeps all messages (the trim edits the request copy) [inferred from context-window.ts mutating the messages array of the request] | No | Lives for the request only |
| Catalog limits | packages/contracts/types/src/models.json generated from packages/ai/model-registry/catalog/models.curation.json (doc: AGENTS.md section 4) | Shipped with each app build | Replaced when the catalog is regenerated |

**Models and providers.** Limits come from the catalog row of the chosen model, whatever provider serves it. Summaries are written by a cheaper managed route chosen by resolveEconomyRoute, not the chat model (request-processor.ts:6713-6720). Provider adapters read the cap and send it in their own field (packages/ai/providers/google/src/translate.ts:176, ollama translate.ts:115, openai translate-responses.ts:296).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud chat needs a signed-in account. Showing limits on Web needs no extra account step beyond the picker; CLI listing of managed models says 'public' or 'authenticated' (apps/cli/src/provider.rs:243-253). |
| Permissions | No separate permission for this feature found in the code. Organization model policy decides which models are offered at all. |
| Subscription | Not gated by a plan itself. Which models a plan can pick decides which limits a person can use. A message refused for length releases its reservation, so no credits are kept (request-processor.ts:6736-6748). |
| Limits and metering | Reply cap enters the pre-flight cost estimate (request-processor.ts:5912-5921). Compaction uses a managed summary call that is metered through the same managed-usage path (request-processor.ts:6713-6720). Plan-level attachment byte limits come from the billing catalog (packages/contracts/types/src/billing-catalog.ts:757). |
| Feature flags | AGI_CONTEXT_COMPACTION_ENABLED (server). adaptiveResponseBudgetEnabled is derived from the request (Auto, router or promotion), not a flag (request-processor.ts:3675-3680). |
| Model compatibility | Applies to text chat models. Non-text models get a 1,024-token cap (model-catalog.ts:1534). Models without catalog numbers fall back to 4,096. |
| Provider restrictions | Provider adapters may apply their own rules (Anthropic derives max_tokens from the model, packages/ai/providers/anthropic/src/translate.ts:395). Which providers reject over-large caps is unknown. |
| Local mode | Mobile local models use their own window and a derived output value (apps/mobile/src/features/model-picker/service.ts:152-163, 203-204); the Cloud trimming, message_too_long and compaction do not run because no server is called [inferred]. Local-mode behaviour when a local chat overflows its window: the Mobile budgeter marks status 'compact' (contextBudgeter.ts:92-96); what the local runtime then does is unknown. Desktop local inference: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Latest message alone too long | HTTP 400 message_too_long, reservation released | request-processor.ts:3311-3325, 6728-6752 |
| Protected instructions exceed budget | Sent whole with a warning log | apps/web/app/api/llm/v1/chat/completions/lib/context-window.ts:236-241 |
| Model not in catalog | Composer says 'This model is not in the catalogue, so its limits cannot be checked.' | model-compatibility.ts:160-168 |
| Temporary chat or no conversation id | Mechanical trim only, no summary | context-compaction.ts:433-441 |
| Summary call fails | Logged; falls back (catch block) - exact fallback read only to line 471, remainder not read | context-compaction.ts:469-476 |
| Dropped span included untrusted tool content | Summary is fenced and flagged as untrusted history | context-compaction.ts:93-107, 417-420 |
| Offline, retry, cancel | Not handled by this feature in the code read; belongs to the chat turn pipeline | not handled in the code read |
| CLI provider reports overflow | Mapped to context_overflow error with the catalog limit | apps/cli/src/models/streaming.rs:350-355; apps/cli/src/errors.rs:62 |
| Accessibility | Mobile row exposes hints for lock and download but no size text; sizes are not announced on Mobile | apps/mobile/src/features/model-picker/components/ModelRow.tsx:150-180 |
| Unknown model on Mobile | Window falls back to the first listed model or 4,096 | apps/mobile/src/features/memory/services/contextBudgeter.ts:36-43 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/context-window.test.ts`: Trimming and fitting of history.
- `apps/web/app/api/llm/v1/chat/completions/lib/context-window.registry.test.ts`: Trimming against catalog values.
- `apps/web/app/api/llm/v1/chat/completions/lib/context-compaction.test.ts`: Summary compaction behaviour.
- `apps/web/features/chat/components/Composer/model-compatibility.test.ts`: Composer overflow, vision and tool findings.
- `packages/contracts/types/src/__tests__/model-catalog.test.ts`: resolveMaxOutputTokens (describe block near line 1139).
- `packages/ai/routing/src/__tests__/response-budget.test.ts`: Adaptive output budget.
- `apps/mobile/__tests__/context-budgeting.test.ts`: Mobile context budget.
- `apps/mobile/__tests__/ContextDetailsSheet.test.tsx`: Mobile context sheet.
- `apps/web/app/api/llm/v1/models/route.test.ts`: Models endpoint (whether it asserts max_output was not checked).

**Test scenarios**

- **Picker shows limits**
  1. Run Web on localhost, sign in.
  2. Open the model picker and a model card.
  - Expected: Rows 'Context ceiling' and 'Output ceiling' show K or M values.
- **Message too long**
  1. Call the chat route with a message far above the model window.
  2. Read the response.
  - Expected: HTTP 400, code message_too_long, text starting 'This message is too long for the selected model'.
- **History compaction**
  1. Build a long saved chat.
  2. Switch to a smaller-window model and send.
  3. Check the request log for the omission marker or summary.
  - Expected: Turn succeeds; history carries a summary or the omission marker.
- **Compaction off**
  1. Start the server with AGI_CONTEXT_COMPACTION_ENABLED=0.
  2. Repeat the previous scenario.
  - Expected: Omission marker only; no summary call.
- **Output cap**
  1. Send a short turn to a fixed model with no max_tokens and inspect the provider payload.
  - Expected: Cap is at most 8,192.
- **CLI listing and VS Code description**
  1. Run the models listing in the CLI signed in.
  2. Open the VS Code model picker.
  - Expected: CLI shows 'N ctx N out'; VS Code description ends with 'context' and 'output' sizes.

**Where to look when it fails**

- Log line 'Turn refused before the provider: the latest user message does not fit the selected model' (request-processor.ts:6736).
- Log '[context-window] the latest user message is longer than the model context window leaves room for' (context-window.ts:232-236).
- Error code message_too_long; attempt errorClass message_too_long on the managed usage request.
- CLI error name context_overflow (apps/cli/src/errors.rs:516).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/076-model-capability-registry.md](../../70-qa/test-plans/web/076-model-capability-registry.md)
- Desktop: [70-qa/test-plans/desktop/076-model-capability-registry.md](../../70-qa/test-plans/desktop/076-model-capability-registry.md)
- Mobile: [70-qa/test-plans/mobile/076-model-capability-registry.md](../../70-qa/test-plans/mobile/076-model-capability-registry.md)
- CLI: [70-qa/test-plans/cli/076-model-capability-registry.md](../../70-qa/test-plans/cli/076-model-capability-registry.md)
- VS Code: [70-qa/test-plans/vscode/076-model-capability-registry.md](../../70-qa/test-plans/vscode/076-model-capability-registry.md)

## 10. Gaps and dependencies

- **Per-model file, image, audio and video size limits do not exist; only plan-level byte limits are checked.** Affects: All apps and the API. Evidence: doc: knowledge-base/data/area-briefs/076-model-capability-registry.md S76.30; ChatComposerNew.tsx:944-955. Work needed: Add catalog fields, fill them from provider docs, check them in composer, upload routes and API.
- **Caller max_tokens is not clamped to the model maximum for fixed models on the API surface.** Affects: API callers. Evidence: request-processor.ts:5879-5882 (requested value wins); adaptive clamp only for Auto, router, promotion (3675-3680). Work needed: Clamp in one place before provider translation; add a test.
- **Mobile model row does not show context or output sizes although the brief marks Mobile done and cites ModelRow.tsx.** Affects: Mobile. Evidence: No context or output reference in apps/mobile/src/features/model-picker/components/ModelRow.tsx; formatContextWindow unused (apps/mobile/lib/models.ts:147). Work needed: Show the limits on the row or card, or correct the brief.
- **Chrome extension shows no limits and does no trimming.** Affects: Chrome. Evidence: No contextWindow or maxOutputTokens in apps/extension. Work needed: Decide whether Chrome needs it; Cloud trimming already covers Cloud turns.
- **Brief's 'reduced by the request' wording is only true for Auto turns; for a fixed model the request value is not reduced.** Affects: Docs and API users. Evidence: request-processor.ts:5879-5882. Work needed: Correct the brief or implement the clamp.
- **Local-mode overflow handling and Desktop local inference limits are not established.** Affects: Mobile and Desktop local users. Evidence: contextBudgeter.ts:92-96 only sets a status. Work needed: Trace the local runtime and document or fix.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- SYS-model-catalog-and-routing
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-local-inference
- SYS-memory-projects-and-context
- table:conversations
- file:packages/contracts/types/src/model-catalog.ts
- api:POST /api/llm/v1/chat/completions
- api:GET /api/llm/v1/models
- mode:cloud
- mode:local
- surface:web
- surface:mobile
- surface:cli
- surface:vscode

## Unknown

- Whether the Tauri desktop app shows context or output limits on any screen.
- Whether any provider adapter clamps a caller max_tokens to the model maximum.
- What a Mobile local chat does at the 'compact' status.
- Whether the compaction summary is cleared when earlier messages are edited.
- How the compaction fallback behaves after the catch block (context-compaction.ts beyond line 476 was not read).
- Whether the Chrome extension needs its own limit display.
- Whether models.json holds a per-model count limit for images only (imageInput.maxImagesPerRequest exists at model-catalog.ts:750-752 and is used for chat images at apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts:60-66) and how that interacts with S76.30.
