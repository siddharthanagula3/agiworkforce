---
id: "F091-01"
type: "feature"
title: "Model catalog, providers and lifecycle"
aliases: ["Model registry", "Provider registry", "Provider-route registry", "Capability registry", "Model alias resolution", "Model lifecycle management", "models.json", "registry.json", "model catalog", "S91.01-S91.06"]
area: "91 Model and inference components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S91.01", "S91.02", "S91.03", "S91.04", "S91.05", "S91.06"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-api-and-contracts", "SYS-subscriptions-entitlements-and-usage", "file:packages/ai/model-registry/catalog/models.curation.json", "file:packages/contracts/types/src/model-catalog.ts", "surface:web", "surface:mobile", "mode:cloud"]
basis: "code inspection"
second_reader: "7 of 10 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F091-01 Model catalog, providers and lifecycle

One generated catalog of models, providers, provider routes, capabilities, plan tiers, aliases and lifecycle (stage, deprecation, retirement). A developer edits curated JSON and runs the sync command. Web, Mobile, the extensions and the server read the compiled output through one TypeScript module; Desktop's Rust code reads a generated mirror.

Area: [91. Model and inference components](README.md). Requirement items: [S91.01](../../10-requirements/capabilities/091-model-and-inference-components.md#s9101), [S91.02](../../10-requirements/capabilities/091-model-and-inference-components.md#s9102), [S91.03](../../10-requirements/capabilities/091-model-and-inference-components.md#s9103), [S91.04](../../10-requirements/capabilities/091-model-and-inference-components.md#s9104), [S91.05](../../10-requirements/capabilities/091-model-and-inference-components.md#s9105), [S91.06](../../10-requirements/capabilities/091-model-and-inference-components.md#s9106).

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

**What it does.** Holds every model fact in JSON under packages/ai/model-registry/catalog, compiles it into a registry plus models.json, and exposes lookups (alias to canonical id, provider display, routes, capabilities, tier access, lifecycle) through packages/contracts/types/src/model-catalog.ts (packages/ai/model-registry/scripts/compile.mjs:37, :54, :57; packages/contracts/types/src/model-catalog.ts:1446).

**Why it exists.** So no surface keeps its own copy of model ids, prices, capabilities or plan limits, and a model swap never needs a consumer edit (doc: AGENTS.md section 4; packages/contracts/types/src/model-catalog.ts:1-18).

**Who uses it.** Developers and operators edit and sync it. Every app and the server read it. End users see only the result: the models in the picker, plan locks, and retirement notices.

**Problems it solves**

- Duplicated model lists drifting between apps and server.
- A model id typo or retired id reaching a provider.
- Plan limits defined in more than one place.
- Unknown lifecycle state: whether a model is new, old, or being retired.

**Use cases**

- A developer adds a model to the curation file, runs sync, and every picker shows it.
- A model is marked deprecated with a date; routing then refuses to pick it once the date has passed.
- A client sends a provider API model id or an old alias; the catalog resolves it to the canonical id.
- The server checks which plan a model needs and names it in an error.

## 2. User experience

**Where to find it**

- No screen edits the catalog. Web: the model trigger in the chat composer footer opens the picker built from it (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1932, packages/ai/routing/src/model-picker.ts:272).
- Mobile: ModelPickerSheet (apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:263).
- Chrome extension: managed model picker (apps/extension/src/features/cloud-bridge/managedModelPicker.ts, uses buildModelPickerShortList per grep).
- VS Code: model-picker/modelConstants.ts (apps/extension-vscode/src/features/model-picker/modelConstants.ts:425).
- Desktop (public Electron app) shows the hosted web app, so it shows the web picker (doc: AGENTS.md section 5).
- CLI: unknown, not read.

**Before you start**

- Developer side: pnpm and the repo. Edit packages/ai/model-registry/catalog/models.curation.json, then run pnpm sync:models (package.json:386).
- User side: none for seeing the picker; plan decides which rows are locked.

**Screens and controls**

- Picker rows show name, plan lock label, release stage label (preview, experimental, beta, alpha) (packages/ai/routing/src/model-picker.ts:195, :247).
- Mobile shows 'Retires <date>' when a model retires within 30 days (apps/mobile/src/features/model-picker/retirement.ts:7, :18).
- Mobile shows a notice that a retired model used by a chat has been retired and names the replacement if one is recorded (apps/mobile/src/features/model-picker/retirement.ts:30).

**Journey**

1. Developer edits catalog/models.curation.json or another catalog file.
2. Developer runs pnpm sync:models; compile.mjs validates against a schema and writes registry.json, registry.ts, models.json and the Rust mirror (scripts/compile.mjs:37-57).
3. pnpm sync:models:check and pnpm check:model-catalog fail CI if generated files or integrity drift (package.json:387, :361).
4. Surfaces read the new data; the person opens the picker and sees the model, locked or open by plan.
5. A retired id in an old chat resolves to a name through the retirement record, so old messages still show a name (packages/contracts/types/src/model-catalog.ts:1504).

**What the person sees and gets**

- Plan lock labels and release-stage labels in the picker.
- Retirement label and retired-model notice on Mobile.
- unknown: the exact wording of web or desktop retirement notices; a search of apps/web found no consumer of the retirement record (grep for getRetiredModelMetadataById in apps/web/app and apps/web/lib found none; apps/web/features not searched).

**Settings**

- None for the person. Operator tools: pnpm sync:models, sync:models:check, sync:models:refresh, models:families (package.json:386-394).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Compiler reads catalog JSON, validates it and writes generated registry and models.json (packages/ai/model-registry/scripts/compile.mjs:37-57, :3145).
- Alias resolution: canonical ids, provider api model ids and per-provider canonicalization map to one canonical id (packages/contracts/types/src/model-catalog.ts:1427-1452).
- Provider registry: provider labels, display ids, aliases, default model, surface (packages/contracts/types/src/model-catalog.ts:1609-1664).
- Route registry: one record per provider and model with harness, trust modes, response formats and commercial status (packages/contracts/types/src/model-catalog.ts:143-157).
- Capability registry splits intrinsic and route-dependent capability names (packages/contracts/types/src/model-catalog.ts:190-195).
- Plan tiers: TIER_POLICIES per free, pro, max, enterprise with allowed slots and allowed provider surfaces (managed_cloud, byok, local) (packages/contracts/types/src/model-catalog.ts:1065, :1413).
- Allowed provider surfaces by tier: free is managed_cloud only (:1245); pro is managed_cloud and byok (:1281); max allows managed_cloud, byok and local (:1329); enterprise allows local as well (:1380). BYOK needs pro or above; local is limited to max and enterprise (packages/contracts/types/src/model-catalog.ts:1245, :1281, :1329, :1380).
- Token caps per month differ by tier: free null, pro 40,000,000, max 100,000,000, enterprise null (packages/contracts/types/src/model-catalog.ts:1257, :1295, :1347, :1394).
- Lifecycle: 11 stages from discovered to removed, with named shortcuts (packages/ai/model-registry/scripts/lifecycle-stages.mjs:12-49); deprecation date check (packages/contracts/types/src/model-catalog.ts:1181); retired records keep identity and replacement (packages/contracts/types/src/model-catalog.ts:1469-1500).
- Routing enforces lifecycle: a deprecated model, or one past its deprecation date, is not eligible (packages/ai/routing/src/auto.ts:1356-1358); the server passes the past-date set into every managed routing request (apps/web/lib/server/managed-cloud-routing/routing-request.ts:109).
- Which generation of a model family is live is owned by model-families.json; promote or roll back with models:families scripts (doc: AGENTS.md section 4; package.json:394-396).

**Incomplete**

- Successor handling is a notice only. A pinned retired or deprecated model is refused, not swapped for its replacement (packages/ai/routing/src/__tests__/retired-model-selection.test.ts:23-30). The replacement is shown only on Mobile (apps/mobile/src/features/model-picker/retirement.ts:30); web and other apps: unknown.
- Brief item S91.06 says lifecycle is 'enforced'; the code enforces eligibility in routing, but the stage value itself is only recorded in the registry. Whether any consumer other than the compiler and tools reads the stage: unknown.

**Present but disconnected or switched off**

- Brief line numbers for S91.01 (model-catalog.ts:1367) and S91.05 (:1340) no longer match; the code is at :1121 and :1427-1446. The brief is stale on this point.

**Not available**

- Batch or deferred inference is a separate brief item (S91.30), outside this feature.
- Own-key (BYOK) and local trust modes are in the catalog (harness trust modes), but the compiled route data is shared; whether each app uses them: see F091-02 and unknowns.

## 4. Required behaviour

**Established requirements**

- One compiled model registry is the source every surface and the server read for model facts. (source: S91.01 Should)
- A provider registry records each provider (display, defaults, governance, hosts). (source: S91.02 Should)
- A provider-route registry records every model x provider route with harness, trust modes, retention, cache class and price. (source: S91.03 Should)
- A capability registry records intrinsic and route-dependent capabilities per model. (source: S91.04 Should)
- Model aliases resolve to canonical model ids everywhere. (source: S91.05 Should)
- Model lifecycle (stage, deprecation, retirement, replacement) is managed and enforced. (source: S91.06 Should)
- The model catalog is generated and is the only place a model id may be a literal; never hand-edit models.json. (source: doc: AGENTS.md section 4)
- AGI never claims a model or provider can do something if capability metadata does not prove it. (source: doc: docs/product/requirements.md:294-296)

**Acceptance criteria**

1. After editing the curation file and running pnpm sync:models, pnpm sync:models:check passes and models.json changed only through the generator.
2. Resolving a provider api model id, an alias and a canonical id returns the same canonical id.
3. A model whose deprecation date is in the past is not selected by Auto and is refused when pinned, on every plan and trust mode.
4. The picker shows a plan lock for a model the plan does not include, using the tier policy from the catalog.
5. A message stored with a retired model id still shows a model name.
6. An inline model id literal in app code fails pnpm check:model-id-literals.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The picker hides or locks models by the same tier policy the server uses, because both read model-catalog.ts.
- [inferred] A retired model should show a successor on every app, as Mobile does; only Mobile is evidenced.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the retirement notice and replacement on web and extensions, the way Mobile does.
- [proposed] Add a test that every surface picker reads the retirement label from one shared helper.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | Catalog JSON files | `packages/ai/model-registry/catalog/models.curation.json` | Hand-curated model facts; with models.synced.json, harnesses.json, model-routes.json, model-families.json, retired-models.json, routing-policies.json, provider-governance.json, provider-hosts.json, provider-defaults.json, developers.json, gateways.json it is the only editable source. |
| command | compile.mjs | `packages/ai/model-registry/scripts/compile.mjs` | Validates catalog, builds registry.json/registry.ts, models.json and the Rust mirror; --check mode verifies drift (:3145). |
| config | lifecycle-stages.mjs | `packages/ai/model-registry/scripts/lifecycle-stages.mjs` | Defines the 11 lifecycle stages and legal shortcuts. |
| schema | registry schema | `packages/ai/model-registry/schema/registry.schema.json` | JSON schema the compiler validates against (compile.mjs reads REGISTRY_SCHEMA_JSON). |
| other | generated registry | `packages/ai/model-registry/generated/registry.ts` | Typed compiled registry exported as @agiworkforce/model-registry. |
| other | models.json | `packages/contracts/types/src/models.json` | Generated compatibility catalog read by apps; never hand-edited. |
| service | model-catalog.ts | `packages/contracts/types/src/model-catalog.ts` | Lookup API: normalizeModelId (:1446), getModelMetadataById (:1454), retired lookup (:1481), TIER_POLICIES (:1413), canAccessModelForSubscriptionTier (:2216), getMinimumRequiredTier (:2196), getRegistryRoute (:154). |
| service | model-picker.ts | `packages/ai/routing/src/model-picker.ts` | Builds the shared picker short list, plan lock labels and release-stage labels (:272, :247, :195). |
| service | routing eligibility | `packages/ai/routing/src/auto.ts` | evaluateEligibility refuses deprecated or past-deprecation models (:1340-1358); modelsPastDeprecationDate (:1710). |
| service | managed routing request | `apps/web/lib/server/managed-cloud-routing/routing-request.ts` | Passes retiredModelKeys into every managed routing request (:109). |
| service | model tier gate | `apps/web/lib/model-tiers.ts` | canAccessModel: Auto is closed to the free tier; other models use the catalog tier check (:9). |
| service | Mobile retirement helpers | `apps/mobile/src/features/model-picker/retirement.ts` | Retirement label (30-day window) and retired-model notice with replacement. |
| component | Mobile picker sheet | `apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx` | Mobile model picker; local scope offers Auto on every plan (:316-325). |
| component | Web composer footer | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Web model trigger and picker host. |
| service | Rust mirror | `apps/desktop/src-tauri/src/core/llm/models_config.rs` | Tauri build reads models.json via include_str! (:24); Tauri is retained internal code, not the public Desktop (doc: AGENTS.md section 5). |
| command | integrity guards | `scripts/check-model-catalog-integrity.mjs` | check:model-catalog guard; also check-no-hardcoded-model-ids.mjs for inline literals. |
| test | registry tests | `packages/ai/model-registry/tests/` | Node tests for lifecycle, families, routes, schema, pricing, current roster. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Developer edits catalog JSON and runs the sync command. | device | package.json:386; packages/ai/model-registry/scripts/compile.mjs:3140-3145 |
| Compiler validates the catalog and writes registry.json, registry.ts, models.json and the Rust mirror files. | device | packages/ai/model-registry/scripts/compile.mjs:37-57 |
| Apps import the compiled data at build time; the server and routing package read the same registry in process. | device and our servers | packages/contracts/types/src/model-catalog.ts:1-18, :1121 |
| At request time the server resolves the incoming model id to the canonical id and reads tier, routes and lifecycle from it. | our servers | apps/web/lib/services/provider-adapter-service.ts:185-190; packages/ai/routing/src/auto.ts:1340-1358 |
| Picker rows are built from the same catalog on the person's device, with plan locks from the tier policy. | device | packages/ai/routing/src/model-picker.ts:272 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Catalog source JSON and generated registry and models.json | Repository files under packages/ai/model-registry and packages/contracts/types/src | Shipped inside each app build and the server build; no runtime sync found. | Kept in git; retired models stay as records in retired-models.json (packages/ai/model-registry/scripts/compile.mjs:45). |

**Models and providers.** The catalog describes every provider route (managed cloud, own key, local harnesses) but does not call any provider itself; compile.mjs may refresh synced data from outside sources only in its refresh mode (packages/ai/model-registry/package.json scripts: refresh).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Reading the catalog needs no account. Account matters only when a request is made: the server checks the plan (apps/web/lib/model-tiers.ts:9). |
| Permissions | Editing needs repository write access; CI guards block drift (package.json:361, :387). |
| Subscription | TIER_POLICIES define allowed slots, manual selection, caps per tier free, pro, max, enterprise (packages/contracts/types/src/model-catalog.ts:1065, :1413). Tier policies exist for four tiers; the minimum-plan lookup getMinimumRequiredTier (:2196) works on a different set that includes 'basic' (free, basic, pro, max), which has no TIER_POLICIES entry and is decided separately with canAccessModelForSubscriptionTier (packages/contracts/types/src/model-catalog.ts:1065, :2196-2240). The brief says plan limits come from this catalog; plan display names come from the billing catalog, not read here. |
| Limits and metering | Price per route lives in the catalog. Token caps per month are in TIER_POLICIES: free null, pro 40M, max 100M, enterprise null (packages/contracts/types/src/model-catalog.ts:1257, :1295, :1347, :1394); metering itself is another feature. |
| Feature flags | Family promotion via models:families scripts (package.json:394-396). No runtime feature flag found for the catalog itself. |
| Model compatibility | Capabilities are recorded per model and per route; routes decide route-dependent ones (packages/contracts/types/src/model-catalog.ts:190-195). |
| Provider restrictions | Each route carries trust modes (managed_cloud, byok, local) and each provider has governance data (packages/contracts/types/src/model-catalog.ts:1066, :143-152). The routing 'on_device' trust mode exists beside managed_cloud, byok and local, and the retired-model test covers it (packages/ai/routing/src/__tests__/retired-model-selection.test.ts:17). |
| Local mode | Tier policies allow the 'local' provider surface only on max (packages/contracts/types/src/model-catalog.ts:1329) and enterprise (:1380). Free is managed_cloud only (:1245); pro is managed_cloud and byok (:1281). The mobile local picker offers Auto on every plan because on-device routing costs nothing (apps/mobile/src/features/model-picker/components/ModelPickerSheet.tsx:316-325). On-device model files are described separately in on-device-models.ts. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unknown model id | getModelMetadataById returns null; the router returns code unknown_selection; the chat endpoint answers 422 model_route_unavailable. | packages/contracts/types/src/model-catalog.ts:1454; packages/ai/routing/src/auto.ts:474; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4975 |
| Retired model | Name is still resolvable for old messages; pinned selection is refused, never swapped. | packages/contracts/types/src/model-catalog.ts:1504; packages/ai/routing/src/__tests__/retired-model-selection.test.ts:23 |
| Deprecation date passed | Model drops out of routing even if still marked active. | packages/ai/routing/src/auto.ts:1357 |
| Generated files out of date | sync:models:check fails the guard chain. | package.json:387, :397 |
| Offline or loading | Catalog is bundled data, so it needs no network; not applicable. | [inferred] from packages/contracts/types/src/model-catalog.ts:1121 |
| Accessibility | Web picker trigger has an aria-label naming the model and 'Change model'. | apps/web/features/chat/components/Composer/ComposerFooter.tsx:1932 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ai/model-registry/tests/lifecycle-stage.test.mjs`: lifecycle stage vocabulary and moves [inferred from file name]
- `packages/ai/model-registry/tests/lifecycle-gates.test.mjs`: lifecycle gates [inferred from file name]
- `packages/ai/model-registry/tests/registry-contract.test.mjs`: registry shape contract [inferred from file name]
- `packages/ai/model-registry/tests/schema-validation.test.mjs`: schema validation [inferred from file name]
- `packages/ai/model-registry/tests/model-routes.test.mjs`: route records [inferred from file name]
- `packages/ai/model-registry/tests/model-families.test.mjs`: family slots [inferred from file name]
- `packages/contracts/types/src/__tests__/model-catalog.test.ts`: catalog lookups [inferred from file name]
- `packages/contracts/types/src/__tests__/model-catalog.retired.test.ts`: retired model records [inferred from file name]
- `packages/contracts/types/src/__tests__/model-catalog.free-plan-reach.test.ts`: free plan reach [inferred from file name]
- `packages/ai/routing/src/__tests__/retired-model-selection.test.ts`: retired and deprecated pinned models are refused on every tier and trust mode (managed_cloud, byok, local and on_device, :17), never swapped (read)
- `apps/mobile/src/features/model-picker/__tests__/retirement.test.ts`: Mobile retirement label and notice [inferred from file name]
- `scripts/check-no-hardcoded-model-ids.test.mjs`: model id literal guard [inferred from file name]

**Test scenarios**

- **Sync round trip**
  1. Change a display name in the curation file.
  2. Run pnpm sync:models.
  3. Run pnpm sync:models:check and pnpm check:model-catalog.
  - Expected: Generated files change; both checks pass; a second sync changes nothing.
- **Alias to canonical id**
  1. Call normalizeModelId with the provider api model id of a catalog model.
  2. Call it with the canonical id.
  - Expected: Both return the same canonical id.
- **Deprecated model pinned**
  1. Set a past deprecation date on a test model (in a test fixture).
  2. Resolve a route with that model selected, on each plan.
  - Expected: Result is unavailable with a reason; no other model is returned.
- **Plan lock in picker**
  1. Open the picker as a free account on web and Mobile.
  2. Look for a model above the plan.
  - Expected: Row shows a plan lock label; choosing it does not send a request on that model.
- **Retirement notice on Mobile**
  1. Open an old chat whose model is retired.
  - Expected: Notice names the retired model and its replacement or asks for another model.

**Where to look when it fails**

- pnpm sync:models:check output (generated drift).
- Error 'Model is not registered in the canonical model catalog' from resolveProviderFromModel (apps/web/lib/services/provider-adapter-service.ts:190).
- Route unavailable log 'Managed Web model route unavailable' with routeCode and reasons (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:4954).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Replacement of a retired model is only shown as text on Mobile; no successor is applied, and web and extensions show none that I found.** Affects: Web, Chrome extension, VS Code users with old chats on a retired model.. Evidence: apps/mobile/src/features/model-picker/retirement.ts:30; no web consumer found by grep in apps/web/app and apps/web/lib. Work needed: Decide the rule (notice, user-confirmed switch, or refusal) and share one helper across surfaces.
- **Brief citations for S91.01 and S91.05 point at old line numbers.** Affects: Anyone following the brief.. Evidence: packages/contracts/types/src/model-catalog.ts:1121, :1427. Work needed: Refresh the brief.
- **No evidence that the CLI reads the compiled catalog.** Affects: CLI.. Evidence: apps/cli not searched for models.json. Work needed: Read apps/cli model code and record it.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-api-and-contracts
- SYS-subscriptions-entitlements-and-usage
- file:packages/ai/model-registry/catalog/models.curation.json
- file:packages/contracts/types/src/model-catalog.ts
- surface:web
- surface:mobile
- mode:cloud

## Unknown

- Whether the CLI and the Rust CLI read the compiled catalog.
- Whether web shows retirement text from the retired-model record.
- Which plan label text the billing catalog gives each tier (tier policies cover free, pro, max, enterprise; the minimum-plan lookup also returns 'basic', model-catalog.ts:2196).
- The api:GET /api/models response shape (handler not opened).

## Second reader's check

A second reader checked 10 statements of this page against the code: 7 correct, 3 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 7 Local mode):** "Tier policies list 'local' as an allowed surface on max and enterprise tiers (model-catalog.ts:1356, :1394); whether the free tier lists local: unknown." The code shows: Facts right, citations wrong. max allows ['managed_cloud','byok','local'] at :1329; enterprise at :1380. Lines 1356 and 1394 are not those lines (:1356 is inside the enterprise block, :1394 is tokenCapPerMonth: null). The 'unknown' is answerable: free is ['managed_cloud'] only (:1245); pro is ['managed_cloud','byok'] (:1281). (packages/contracts/types/src/model-catalog.ts:1245, :1281, :1329, :1380). **Corrected:** Local surface is allowed only on max (:1329) and enterprise (:1380). Free is managed_cloud only (:1245). Pro is managed_cloud and byok (:1281).
- **Partly wrong (section 7 Limits and metering):** "Token caps per tier live in the catalog (model-catalog.ts:1413 for tokenCapPerMonth)." The code shows: :1413 is `export const TIER_POLICIES = TIER_POLICIES_DEFINITION`. The caps are at :1257 (free null), :1295 (pro 40,000,000), :1347 (max 100,000,000), :1394 (enterprise null). (packages/contracts/types/src/model-catalog.ts:1257, :1295, :1347, :1394, :1413). **Corrected:** Token caps per month are in TIER_POLICIES: free null, pro 40M, max 100M, enterprise null (:1257, :1295, :1347, :1394).
- **Partly wrong (section 7 Subscription / Unknown):** "TIER_POLICIES cover free, pro, max, enterprise; plan ids in code are free, basic, pro, max, enterprise." The code shows: ProductTier is 'free'|'pro'|'max'|'enterprise' (:1065), with no 'basic' policy. But getMinimumRequiredTier returns 'free'|'basic'|'pro'|'max' (:2196) and returns 'basic' for economy models not named free. The page never says that a 'basic' floor exists with no TIER_POLICIES entry, and that canAccessModelForSubscriptionTier decides it separately. (packages/contracts/types/src/model-catalog.ts:1065, :2196-2240). **Corrected:** Tier policies exist for four tiers. The minimum-plan lookup works on a different set that includes 'basic' (:2196).

**Facts the page missed**

- Free tier allowedProviderSurfaces is ['managed_cloud'] only and pro is ['managed_cloud','byok']. Local is limited to max and enterprise, and BYOK needs pro or above. The page leaves this as 'unknown' (packages/contracts/types/src/model-catalog.ts:1245, :1281, :1329, :1380).
- Token caps differ by tier. The page never states them: free null, pro 40M, max 100M, enterprise null (model-catalog.ts:1257, :1295, :1347, :1394).
- The routing 'on_device' trust mode exists beside managed_cloud, byok and local, and the retired-model test covers it (packages/ai/routing/src/__tests__/retired-model-selection.test.ts:17). The page's trust-mode lists omit it.
