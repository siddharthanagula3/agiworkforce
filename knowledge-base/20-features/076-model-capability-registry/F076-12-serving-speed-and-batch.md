---
id: "F076-12"
type: "feature"
title: "Serving speed and batch"
aliases: ["Serving speed and batch", "Fast mode", "fastTier", "speed: fast", "Priority tier", "Flex tier", "Batch", "Deferred processing", "S76.33", "S76.36"]
area: "76 Model-capability registry"
available_on: ["web", "desktop", "mobile"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S76.33", "S76.36"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-inference-providers", "SYS-authorization-and-workspaces", "SYS-chat-turn-pipeline", "provider:anthropic", "provider:openai", "api:POST /api/llm/v1/chat/completions", "mode:cloud", "surface:web", "surface:mobile", "F076-11"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F076-12 Serving speed and batch

Fast mode gives faster answers from a model that offers it, at a price multiplier billed to usage credits, on paid plans. It exists on Web, Desktop (hosted web app) and Mobile and the API. Priority and flex tiers are not offered, and batch submission does not exist anywhere.

Area: [76. Model-capability registry](README.md). Requirement items: [S76.33](../../10-requirements/capabilities/076-model-capability-registry.md#s7633), [S76.36](../../10-requirements/capabilities/076-model-capability-registry.md#s7636).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** A request with speed 'fast' is accepted only for a model with a fast tier on the Anthropic provider; the cost estimate is multiplied and the provider call carries speed fast (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1868-1874, 5824-5825, 5923-5925, 6681).

**Why it exists.** People who want quicker answers can pay more for them, following the leaders' fast mode rules: a model that offers it, a paid plan, workspace permission, billed to usage credits (request-processor.ts:1877-1883).

**Who uses it.** Paid-plan users on Web, Desktop, Mobile, and API callers.

**Problems it solves**

- Speed on demand without changing the model.
- Clear refusals when fast is not allowed (fast_mode_unavailable, extra_usage_required).

**Use cases**

- A paid user turns on the 'Fast' pill in the Web composer.
- A Mobile user turns on a speed switch in the model picker.
- A free user sees fast disabled with the reason.
- A workspace admin turns fast mode off for the workspace.

## 2. User experience

**Where to find it**

- Web and public Desktop: composer footer pill 'Fast' (aria-label 'Fast mode'), shown only when the model has a fast tier; disabled with a reason title when not allowed (apps/web/features/chat/components/Composer/ComposerFooter.tsx:2059-2075).
- Mobile: model picker 'speed' card (SpeedControl) with a switch; helper text 'Faster answers from the same model, at Nx the usage, billed to usage credits.' (apps/mobile/src/features/model-picker/components/SpeedControl.tsx:20-40).
- API: field speed 'standard' or 'fast' (request-processor.ts:806).
- CLI, VS Code, Chrome: no fast mode found (searched speed and fastTier).

**Before you start**

- A model with a fast tier on the Anthropic provider route; a paid plan; usage credits turned on; workspace allows fast mode; kill switch 'fast_mode' open.

**Screens and controls**

- Web 'Fast' pill (toggle, aria-pressed).
- Mobile switch in the picker, hidden when the model has no fast tier (SpeedControl.tsx:19).

**Journey**

1. 1. Person selects a model that offers fast.
2. 2. The Fast pill or switch appears.
3. 3. Person turns it on if allowed; otherwise sees the reason (paid plan, workspace, usage credits).
4. 4. Sends a message; the app sends speed 'fast'.
5. 5. The server re-checks every rule, multiplies the estimate and calls the provider.
6. 6. Reply arrives faster and costs more.

**What the person sees and gets**

- Refusal 422 'Fast mode is not available for <model>. Turn it off or choose a model that offers it.' (request-processor.ts:1884-1888).
- 403 'Fast mode is available on paid plans and is billed to usage credits.' (1889-1893).
- 403 'Fast mode has been disabled by your organization.' (1900-1903).
- 402 'Fast mode is billed to usage credits. Turn them on in Settings > Billing.' code extra_usage_required (5806-5822).
- Helper text with the price multiplier on Mobile.

**Settings**

- Web store flag fast (useThinkingStore) and Mobile persisted store 'enabled' (apps/mobile/src/features/model-picker/fastMode.ts:38-47).
- Workspace policy fast_mode feature access (request-processor.ts:5783-5786).
- Usage credits on or off (Settings > Billing).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Registry row field fastTier with priceMultiplier; exactly one curated row declares it (packages/ai/model-registry/catalog/models.curation.json:1448-1450; packages/contracts/types/src/model-catalog.ts:768).
- Server gates: kill switch fast_mode (request-processor.ts:3695-3706; apps/web/lib/feature-flags/kill-switches.ts:23, 32), model offers fast, paid plan, workspace allows, usage credits on (5779-5822).
- Provider restriction: fast tier only for provider 'anthropic' (request-processor.ts:1868-1874).
- Estimate multiplied by priceMultiplier (5923-5925); billed as extra usage funding (6160); falls back to standard when the credit fallback model is used (6114).
- Shared rules for clients: resolveFastModeAvailability and message table (packages/contracts/types/src/fast-mode.ts:1-45).
- Web pill and Mobile switch use the shared rules (ComposerFooter.tsx:2059-2075; apps/mobile/src/features/model-picker/fastMode.ts:1-60).
- Web sends speed fast when the model has a fast tier and the pill is on (apps/web/lib/hooks/useChatStream.ts:4676-4678); Mobile adds speed through fastSpeedForModel (apps/mobile/services/streaming.ts:568, 904-905).

**Incomplete**

- The registry has one fast row only; fast is Anthropic-specific, not a general speed tier system (request-processor.ts:1868-1874).
- The brief marks serving-speed options (S76.36) missing everywhere, but Web, Mobile and API have a fast mode; priority and flex are not offered.
- Registry lists v1/batch in the endpoints of some rows (models.curation.json:1102, 1190, 1282) but no pricing field for batch exists: a curated note says the catalog has no batch-pricing field (models.curation.json:135).
- The OpenAI adapter accepts a serviceTier config including 'flex' (packages/ai/providers/openai/src/index.ts:62, 285, 351-352) but no product code sets service_tier (searched apps/web/app and lib).

**Present but disconnected or switched off**

- OpenAI adapter serviceTier and flex path: code exists, no caller.
- Batch endpoints in curation rows: data only.

**Not available**

- Batch or deferred job submission on every app and the API.
- Priority and flex tiers for users.
- Fast mode on CLI, VS Code and Chrome.
- Per-route speed or price tiers in the registry beyond fastTier.

## 4. Required behaviour

**Established requirements**

- The registry records batch/deferred processing availability and pricing per route and the product can submit batch work. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.33)
- The registry records serving-speed options (priority, flex, standard tiers) per route and requests can choose one. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.36)
- Fast mode follows Claude's rules: a model that offers it, a paid plan (never a free trial, the free lane or a promotion), workspace permission, billed to usage credits. (source: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1877-1883)

**Acceptance criteria**

1. Free account: Fast pill disabled with the paid-plan reason; API request refused 403.
2. Paid account with usage credits off: refused 402 extra_usage_required.
3. Model without a fast tier: pill hidden; API refused 422.
4. Workspace with fast off: refused 403 and the pill disabled.
5. With fast on, the estimated cost equals the standard estimate times the multiplier.
6. With the kill switch closed, speed fast is refused.
7. No screen offers batch; confirm no submit control exists.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Priority and flex would extend the same speed field [inferred from the schema enum 'standard' | 'fast', request-processor.ts:806].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add priority and flex tiers per route to the registry with prices, then expose them where providers support them.
- [proposed] Add a batch submit path for non-urgent work (reports, bulk jobs) with credit accounting.
- [proposed] Extend fast mode to other providers if they publish a fast tier.
- [proposed] Show fast mode in CLI and VS Code if the leaders do (follow docs/product/competitive-guidance.md).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | speed field | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Request enum (806), fastTierFor (1868-1874), fastModeRefusal (1877-1905), gates (3695, 5779-5825), estimate (5923), provider speed (6681). |
| schema | ModelMetadata.fastTier | `packages/contracts/types/src/model-catalog.ts` | priceMultiplier field (768). |
| config | curation fastTier row | `packages/ai/model-registry/catalog/models.curation.json` | The one row with a fast tier (1448-1450); batch endpoints (1102, 1190, 1282). |
| service | fast-mode rules | `packages/contracts/types/src/fast-mode.ts` | Shared availability resolver and messages. |
| config | kill switch fast_mode | `apps/web/lib/feature-flags/kill-switches.ts` | FAST_MODE_CAPABILITY (23, 32). |
| component | ComposerFooter Fast pill | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Web toggle (147-153, 845, 1033, 2059-2075). |
| hook | useChatStream | `apps/web/lib/hooks/useChatStream.ts` | Sends speed fast (4676-4678). |
| store | Mobile fast mode store | `apps/mobile/src/features/model-picker/fastMode.ts` | Persisted enabled flag, usage credit and workspace check. |
| component | SpeedControl | `apps/mobile/src/features/model-picker/components/SpeedControl.tsx` | Mobile switch. |
| service | Mobile streaming speed | `apps/mobile/services/streaming.ts` | Adds speed fast for the model (568, 904-905). |
| service | Anthropic adapter | `packages/ai/providers/anthropic/src/index.ts` | Carries service tier and fast speed (tested in fast-mode.test.ts). |
| service | OpenAI adapter serviceTier | `packages/ai/providers/openai/src/index.ts` | Unused flex service tier config (62, 285, 351-352). |
| service | anthropic payload policy | `packages/ai/provider-protocol/src/anthropic-payload-policy.ts` | serviceTier in payload (23-29, 259). |
| test | fast-mode gate test | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.fast-mode-gate.test.ts` | Gate rules. |
| test | fast-tier test | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.fast-tier.test.ts` | Fast tier pricing and speed. |
| test | fast-mode shared test | `packages/contracts/types/src/__tests__/fast-mode.test.ts` | Resolver rules. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The app shows the control when the model has a fast tier, using the shared rules; the person turns it on. | device | ComposerFooter.tsx:2059-2075; apps/mobile/src/features/model-picker/components/SpeedControl.tsx:19 |
| The request carries speed fast. | device and our servers | apps/web/lib/hooks/useChatStream.ts:4676-4678; apps/mobile/services/streaming.ts:904-905 |
| The server checks the kill switch, model tier, paid plan, workspace permission and usage credits; refuses if any fails. | our servers | request-processor.ts:3695-3706, 5779-5822 |
| The server multiplies the cost estimate and reserves credits as extra usage. | our servers | request-processor.ts:5923-5925, 6160 |
| The provider adapter sends speed fast to the model's provider. | outside service | request-processor.ts:6681; packages/ai/providers/anthropic/src/__tests__/fast-mode.test.ts |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Fast mode on/off choice | Web thinking store; Mobile persisted store (fastMode.ts:38-47) | Not synced across devices [inferred; no sync code found] | Until cleared on the device |
| Usage entry funded as extra usage | Managed usage records (request-processor.ts:6160) | Server side | Per usage retention; not read |

**Models and providers.** Only provider 'anthropic' routes with a fast row. Price multiplier from the row. Other providers: none.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in with a paid plan. |
| Permissions | Workspace policy fast_mode feature access must allow (request-processor.ts:5783-5786). |
| Subscription | Paid plan only; never free trial, free lane or promotion (request-processor.ts:1877-1883, 5784). |
| Limits and metering | Billed to usage credits; cost multiplied by priceMultiplier; usage credits must be on (5806-5822). |
| Feature flags | Kill switch 'fast_mode' fail-closed (request-processor.ts:3704-3706). |
| Model compatibility | Only models with fastTier. |
| Provider restrictions | Anthropic only (1868-1874). |
| Local mode | Not applicable: Local models have no fast tier; no code references it [inferred]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Model has no fast tier | Pill hidden; server 422 | ComposerFooter.tsx:2059; request-processor.ts:1884-1888 |
| Free plan | Disabled with reason; server 403 | fast-mode.ts:3-9; request-processor.ts:1889-1893 |
| Usage credits off | 402 extra_usage_required | request-processor.ts:5806-5822 |
| Credits run out and fallback model is used | Fast tier dropped for the fallback | request-processor.ts:6114 |
| Unknown plan | Not allowed; unknown usage credits allowed (server decides) | packages/contracts/types/src/fast-mode.ts:26-32 |
| Mobile refresh while checking | Single check at a time | apps/mobile/src/features/model-picker/fastMode.ts:46-50 |
| Batch states | Not handled in the code: nothing exists | not handled in the code |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.fast-mode-gate.test.ts`: Fast mode refusals.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.fast-tier.test.ts`: Fast tier pricing and speed.
- `packages/contracts/types/src/__tests__/fast-mode.test.ts`: Shared availability rules.
- `packages/ai/providers/anthropic/src/__tests__/fast-mode.test.ts`: Adapter behaviour.
- `apps/mobile/src/features/model-picker/__tests__/FastMode.test.tsx`: Mobile control.
- `apps/mobile/src/features/model-picker/__tests__/fast-mode-stream.test.ts`: Mobile request carries speed.

**Test scenarios**

- **Paid user with credits**
  1. Use a paid test account with usage credits on.
  2. Select a model that offers fast; turn on Fast; send.
  - Expected: Reply arrives; usage shows extra-usage funding at the multiplier.
- **Free user**
  1. Use a Free account; select the same model.
  - Expected: Fast control disabled with the paid-plan reason.
- **Credits off**
  1. Paid account with usage credits off; POST speed fast.
  - Expected: 402 extra_usage_required.
- **Model without fast**
  1. POST speed fast to a model without fastTier.
  - Expected: 422 fast_mode_unavailable.
- **Workspace off**
  1. Disable fast_mode in workspace policy; try again.
  - Expected: 403 'Fast mode has been disabled by your organization.'
- **Batch**
  1. Search each app for a batch submit control.
  - Expected: None exists.

**Where to look when it fails**

- Error code fast_mode_unavailable with param speed; code extra_usage_required.
- Kill switch 'fast_mode' state (assertCapabilityAvailable fail-closed).
- Funding label extra_usage on the usage record.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/076-model-capability-registry.md](../../70-qa/test-plans/web/076-model-capability-registry.md)
- Desktop: [70-qa/test-plans/desktop/076-model-capability-registry.md](../../70-qa/test-plans/desktop/076-model-capability-registry.md)
- Mobile: [70-qa/test-plans/mobile/076-model-capability-registry.md](../../70-qa/test-plans/mobile/076-model-capability-registry.md)

## 10. Gaps and dependencies

- **Batch or deferred submission does not exist; registry lists a batch endpoint on some rows with no price field.** Affects: All apps and API. Evidence: models.curation.json:135, 1102; no caller of service_tier or batch in apps/web/app. Work needed: Design submit, status, price and credit handling per route.
- **Priority and flex tiers are not recorded as per-route options and not offered.** Affects: All apps and API. Evidence: request-processor.ts:806 enum has only standard and fast; OpenAI adapter flex unused (index.ts:62). Work needed: Add registry fields and a request field.
- **Brief says serving speed is missing everywhere, but fast mode exists on Web, Desktop (hosted), Mobile and the API.** Affects: Docs. Evidence: ComposerFooter.tsx:2059; SpeedControl.tsx; request-processor.ts:806. Work needed: Update S76.36 status to partial.
- **Fast mode is Anthropic-only with a single curated model.** Affects: People on other models. Evidence: request-processor.ts:1868-1874; one fastTier row. Work needed: Only if other providers publish a tier.
- **CLI, VS Code and Chrome have no fast mode.** Affects: CLI, VS Code, Chrome. Evidence: No speed handling found in those apps. Work needed: Product decision.
- Not built on: CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-inference-providers
- SYS-authorization-and-workspaces
- SYS-chat-turn-pipeline
- provider:anthropic
- provider:openai
- api:POST /api/llm/v1/chat/completions
- mode:cloud
- surface:web
- surface:mobile
- F076-11

## Unknown

- Which model row holds the single fastTier and whether it is live in production.
- Whether the Tauri desktop app has its own fast control (public Desktop shows the hosted web app, doc: AGENTS.md section 5).
- Whether any provider batch API is planned for the product.
- Whether usage credit settings apply the same way to API-key callers.
- Whether CLI or VS Code plan to show fast mode.
- What assertCapabilityAvailable does exactly (file not read).
