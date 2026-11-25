---
id: "F076-13"
type: "feature"
title: "Regions, data retention, routes and model lifecycle"
aliases: ["Regional route availability (S76.34)", "Retention and data-use constraints (S76.35)", "Model lifecycle and retirement (S76.37)", "Route-specific differences (S76.38)", "data residency admission", "zero data retention routing", "no-training admission", "keepOutOfProviderTraining", "Only use models that do not train on your chats", "Zero data retention only", "retiredModelKeys", "temporarilyUnavailable"]
area: "76 Model-capability registry"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S76.34", "S76.35", "S76.37", "S76.38"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-authorization-and-workspaces", "SYS-security-and-privacy", "SYS-data-model-and-migrations", "SYS-chat-turn-pipeline", "mode:cloud", "file:packages/ai/routing/src/auto.ts", "file:packages/ai/routing/src/route-ranking.ts", "file:packages/ai/model-registry/generated/registry.ts", "file:apps/web/lib/server/managed-cloud-routing/admission.ts", "api:GET /api/models/catalogue", "table:user_settings"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F076-13 Regions, data retention, routes and model lifecycle

Managed Cloud routing checks each route of a model before use. It refuses routes outside the required region, routes without zero retention when required, and routes whose provider may train on inputs when the user opted out. It ranks the rest, and pickers hide or label retired models.

Area: [76. Model-capability registry](README.md). Requirement items: [S76.34](../../10-requirements/capabilities/076-model-capability-registry.md#s7634), [S76.35](../../10-requirements/capabilities/076-model-capability-registry.md#s7635), [S76.37](../../10-requirements/capabilities/076-model-capability-registry.md#s7637), [S76.38](../../10-requirements/capabilities/076-model-capability-registry.md#s7638).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | not stated on this page | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** In Managed Cloud (our servers), every candidate route of a model is tested against the region, data-retention, no-training, organization-policy and lifecycle rules. Routes that pass are ranked by health, credential, observed penalty, expected cost and default flag. The model pickers drop retired models, show a 'Retiring' or 'Leaves on' notice before the date, and mark degraded models as temporarily unavailable. (packages/ai/routing/src/auto.ts:1040-1115, 1137-1160, 1349-1360)

**Why it exists.** People and workspaces need to keep data in a region, keep it out of provider training, and avoid models that are going away. The registry stores these facts per provider and route, so routing can enforce them instead of each app guessing. (brief: S76.34, S76.35, S76.37, S76.38; packages/ai/routing/src/auto.ts:1040-1115)

**Who uses it.** Any signed-in person who turns on the training setting; workspace admins who set a region, zero retention or a model policy; every person who opens a model picker.

**Problems it solves**

- A person's chat is not sent to a provider whose terms may allow training, when they opted out (packages/ai/routing/src/auto.ts:1112-1114).
- A workspace pinned to a region is not served from a route that does not publish that region (packages/ai/routing/src/route-ranking.ts:53-58).
- A workspace that requires zero retention gets a refusal rather than a quiet reroute (apps/web/features/settings/sections/WorkspacePolicySection.tsx:664-665).
- Retired models stop being offered and past-date models are refused (packages/contracts/types/src/model-catalog.ts:2009-2013; packages/ai/routing/src/auto.ts:1357-1359).

**Use cases**

- A Free user turns on 'Only use models that do not train on your chats'. The web catalogue then lists only Auto and models whose provider keeps inputs out of training. (apps/web/app/api/models/catalogue/route.ts:81-86)
- An admin requires zero data retention. Routes that are not zero-retention are refused. (packages/ai/routing/src/auto.ts:1099-1111)
- A workspace pins its data to a region and a route that does not publish it is not used. (packages/ai/routing/src/auto.ts:1063-1070)
- A model nears retirement and the picker shows when it leaves. (apps/web/features/models/lib/model-presentation.ts:43-58; apps/mobile/src/features/model-picker/retirement.ts:18-28)

## 2. User experience

**Where to find it**

- surface:web: Settings > Privacy, toggle 'Only use models that do not train on your chats' (apps/web/features/settings/sections/PrivacySection.tsx:62-66).
- surface:web: workspace policy section, control 'Zero data retention only' with toggle 'Require zero data retention providers' (apps/web/features/settings/sections/WorkspacePolicySection.tsx:664-670).
- surface:web: model picker (ModelCatalogue) tags 'Temporarily unavailable' and a Coming soon status (apps/web/features/chat/components/Composer/ModelCatalogue.tsx:564-566; apps/web/features/models/lib/model-presentation.ts:30-33); a 'Leaving on <date>' notice within 30 days (apps/web/features/chat/components/Composer/ComposerFooter.tsx:314-327); 'Retiring'/'Retired' text on the models page card (apps/web/features/models/lib/model-presentation.ts:43-58).
- surface:mobile: privacy setting with the same label 'Only use models that do not train on your chats' (apps/mobile/src/features/settings/cloud-privacy/TrainingPreferenceGroups.tsx:49); picker row shows 'Retires <date>' within 30 days; a chat on a retired model shows a notice (apps/mobile/src/features/model-picker/retirement.ts:18-42; apps/mobile/app/(app)/chat/[id].tsx:1362).
- surface:cli: model list prints 'deprecated, leaves the catalog <date>' (apps/cli/src/provider.rs:221-224); the model picker shows 'deprecated, leaves <date>' (apps/cli/src/tui/widgets/model_picker.rs:462-466).
- surface:chrome: privacy text tells the person to turn on the training setting in account privacy settings (apps/extension/src/features/privacy/dataHandling.ts:46).
- surface:desktop: the public Desktop shows the hosted web app, so it shows the web screens (doc: AGENTS.md section 5).
- surface:vscode: the brief points to the shared picker constants (apps/extension-vscode/src/features/model-picker/modelConstants.ts:239); no region, retention or lifecycle label was opened there, so unknown.

**Before you start**

- A signed-in account for the training setting and workspace policies; the settings are stored per user or per workspace (apps/web/lib/server/provider-training-opt-out.ts:23-33; apps/web/lib/server/managed-cloud-routing/policy-source.ts:76-86).
- Workspace region and model policy need an organization (apps/web/lib/server/managed-cloud-routing/policy-source.ts:79-86).

**Screens and controls**

- Privacy toggle for training (default off) (apps/web/features/settings/sections/PrivacySection.tsx:62-66).
- Workspace policy toggle for zero data retention (apps/web/features/settings/sections/WorkspacePolicySection.tsx:664-670).
- Workspace data region: GET, POST (move) and DELETE (cancel a move) (apps/web/app/api/settings/organization/data-region/route.ts:156-158).
- Model picker rows with tags for unavailable, coming soon, and leaving dates.

**Journey**

1. The person turns on the training setting in Settings > Privacy (apps/web/features/settings/sections/PrivacySection.tsx:62-66).
2. The setting is saved under the privacy namespace key keepOutOfProviderTraining (apps/web/lib/server/provider-training-opt-out.ts:12-13).
3. The model catalogue is requested; entries whose provider may train are removed, Auto stays (apps/web/app/api/models/catalogue/route.ts:81-86).
4. The person sends a chat. The server reads the training, retention, model-policy, region and US-only rules (apps/web/lib/server/managed-cloud-routing/admission.ts:136-152).
5. Routing admits only passing routes and ranks them (packages/ai/routing/src/auto.ts:1137-1160).
6. If no route passes the request is refused with a reason such as no_training_route or no_route (apps/web/lib/server/managed-cloud-routing/admission.ts:271-277).

**What the person sees and gets**

- Refusal text: 'This model's provider may train on what you send. Choose another model, or turn off Only use models that do not train on your chats in Settings > Privacy.' (apps/web/lib/server/provider-training-opt-out.ts:15-16).
- Refusal for media and voice with the same setting (apps/web/lib/server/provider-training-opt-out.ts:18-22).
- Picker tags: 'Temporarily unavailable', 'Coming soon', 'Retiring <date>', 'Retired <date>' (apps/web/features/models/lib/model-presentation.ts:30-33, 55-57).

**Settings**

- keepOutOfProviderTraining (user privacy setting)
- workspace zeroDataRetentionOnly policy
- workspace data region
- workspace model policy (blocks a model or provider)
- US-only routing preference (apps/web/lib/server/managed-cloud-routing/policy-source.ts:86-88)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Region admission: the deployment's home region check passes an unpublished region, and a pinned workspace's check refuses an unpublished region, on both route and model (packages/ai/routing/src/auto.ts:1054-1070; packages/ai/routing/src/route-ranking.ts:37-58).
- Zero retention: a route passes if retention class is zero retention, or conditional with the harness feature implemented, or the provider is in an override set (packages/ai/routing/src/auto.ts:1099-1111).
- No-training: both the vendor and the transport must keep inputs out of training; a provider with no recorded policy is refused (packages/ai/routing/src/auto.ts:177-189, 1112-1114, 1374-1376; packages/ai/model-registry/generated/registry.ts:166-169).
- Organization model policy is checked for both the vendor and the transport (packages/ai/routing/src/auto.ts:1073-1087).
- Route ranking: health, then credential, then observed penalty, then expected cost, then default route, then route id; a preferred (warm cache) route is kept only within a cost ceiling (packages/ai/routing/src/auto.ts:1137-1170).
- Lifecycle: models not live, deprecated, or past their deprecation date are rejected in routing; the managed request carries retiredModelKeys from modelsPastDeprecationDate() (packages/ai/routing/src/auto.ts:1353-1359, 1710-1720; apps/web/lib/server/managed-cloud-routing/routing-request.ts:109).
- Picker list drops deprecated or past-date models (packages/contracts/types/src/model-catalog.ts:2009-2013; packages/ai/routing/src/model-picker.ts:126-134).
- Catalogue marks a model temporarilyUnavailable when every route is degraded (apps/web/lib/server/model-catalogue.ts:240).
- The API sets zeroDataRetentionOnly on the canonical request (apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts:209-210).
- Policy read failures fail safe: training opt-out reads as on; unreadable retention, region or model policy refuses the call (apps/web/lib/server/managed-cloud-routing/policy-source.ts:24-30, 54-64).

**Incomplete**

- The Rust resolver's route admission, eligibility and ranking show only lifecycle availability/deprecated, commercial status, selectable, harness and feature checks, and rank by cost, default and id; no region, retention, no-training, retired-date or health ordering was found in it (crates/agiworkforce-model-registry/src/lib.rs:788-846, 847-856, 976-983). The comments in auto.ts say the TypeScript and Rust route order is a contract (packages/ai/routing/src/route-ranking.ts:66-70), so this difference is notable.
- The brief marks region, retention and route differences done on all six apps, but the code opened enforces them in the server path; the per-app lines in the brief point to generic picker files (brief: S76.34, S76.35, S76.38). Per-app enforcement outside the server path is unknown.
- The catalogue server projection comments say a past-date model is dropped, yet the models page helper can still label 'Retired <date>' for an entry that stays selectable (apps/web/features/models/lib/model-presentation.ts:36-41); which entries reach it was not traced.

**Present but disconnected or switched off**

- observed-health ranking bands are behind a flag (enableObservedHealthRanking / observedHealthRankingEnabled) (packages/ai/routing/src/auto.ts:1290-1292); its default value is unknown.

**Not available**

- Own-key (BYOK) and Local modes: the region, retention and no-training rules were found only in the managed Cloud request builder (apps/web/lib/server/managed-cloud-routing/routing-request.ts:96-125). Applying them to own-key or local was not found.
- Desktop and CLI runtimes resolving against their own credentials are outside the server rules: auto.ts says the excluded-provider rule governs the server path, not a desktop or CLI runtime (packages/ai/routing/src/auto.ts:207-210).

## 4. Required behaviour

**Established requirements**

- Routes outside the required region are refused: the registry records model and provider residency regions. (source: brief S76.34)
- The registry records provider and route data retention, and routing honours zero-retention requirements. (source: brief S76.35)
- The registry records lifecycle stage, deprecation and retirement; pickers and routing exclude or label models accordingly. (source: brief S76.37)
- The registry records route-dependent capabilities, cache class, retention and price per route, and routing ranks routes by them. (source: brief S76.38)
- Local, own-key and Cloud are separate trust boundaries; nothing may silently route Local data to BYOK or Cloud. (source: doc: AGENTS.md section 6)
- Security behaviour fails closed; routing metadata is centralized and never inlined at a call site. (source: doc: AGENTS.md sections 6 and 7)

**Acceptance criteria**

1. With the training setting on, the web catalogue contains only Auto entries and models whose provider keeps inputs out of training.
2. With the training setting on and only may-train providers available, a chat is refused with the no-training message, not sent.
3. With a workspace region pinned away from the deployment region, a route that publishes no region or a different region is never selected.
4. With zero data retention required, a route with a non-zero retention class is refused and a conditional route passes only if its harness implements the per-request feature.
5. Of two admissible routes for one model, the healthy, credentialed, cheaper one ranks first; equal routes order by default flag then id.
6. A model past its deprecation date does not appear in the picker and a pinned request for it is refused, not resolved to another model.
7. A model within 30 days of leaving shows a leaving date in the web and mobile pickers.
8. When the policy cannot be read, the call is refused, not routed unfiltered.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] Every app that sends chat through the cloud API gets the region, retention and no-training rules because the checks run on the server.
- [inferred] The brief's 'done' for CLI, VS Code and Chrome means the server enforces the rules for their cloud traffic, not that each app has its own rule.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add region, retention and no-training fields to the Rust resolver or document that it is outside this rule, so the TS and Rust results agree.
- [proposed] Show a clear reason in each app picker when a model is hidden by the training setting.
- [proposed] Decide and document whether own-key mode must honour the zero retention and region settings.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | routeAdmissionRejections | `packages/ai/routing/src/auto.ts` | Per-route checks: transport, region, strict residency, organization policy, commercial status, zero retention, no-training, harness features (lines 1031-1135). |
| service | rankRoutes | `packages/ai/routing/src/auto.ts` | Orders routes of one model by health, credential, penalty, cost, default, id (lines 1137-1170). |
| service | evaluateEligibility | `packages/ai/routing/src/auto.ts` | Model-level checks: admitted keys, lifecycle, deprecated, retired keys, tier, US-only, no-training, developer jurisdiction (lines 1343-1395). |
| service | modelsPastDeprecationDate | `packages/ai/routing/src/auto.ts` | Builds the set of model keys whose deprecation date has passed (lines 1710-1720). |
| service | residencyRejection / strictResidencyRejection / routeKeepsCache | `packages/ai/routing/src/route-ranking.ts` | Region rules (lenient for home region, strict for pinned workspace) and cache-class helper. |
| service | providerKeepsInputsOutOfTraining | `packages/ai/model-registry/generated/registry.ts` | True when the provider training policy is never or opt_in (line 166-169). |
| service | listPickerChatModels | `packages/ai/routing/src/model-picker.ts` | Chat models for pickers: only current models and allowed developer jurisdictions (lines 126-134). |
| service | isCurrentModel | `packages/contracts/types/src/model-catalog.ts` | False when deprecated, status deprecated, or retirement date passed (lines 2009-2013). |
| service | managedCloudRoutingRequest / admitManagedCloudRoute | `apps/web/lib/server/managed-cloud-routing/admission.ts` | Reads account rules, builds the routing request, refuses with no_training_route, no_route or policy_unreadable. |
| service | productionPolicySource | `apps/web/lib/server/managed-cloud-routing/policy-source.ts` | Reads training opt-out, conversation training state, zero retention, workspace model policy, workspace region, US-only. |
| service | buildManagedCloudRoutingRequest | `apps/web/lib/server/managed-cloud-routing/routing-request.ts` | Fills retiredModelKeys, excluded route hosts, region fields and policy fields; resolveResidencyRegion at lines 213-217. |
| service | readProviderTrainingOptOut / modelKeepsInputsOutOfTraining | `apps/web/lib/server/provider-training-opt-out.ts` | Reads the saved setting and checks a model's provider; holds the refusal messages. |
| service | resolveZeroDataRetentionPolicy | `apps/web/lib/services/organization-policy-gate.ts` | Finds whether any governing organization requires zero retention; denies when unreadable (lines 520-555). |
| endpoint | GET /api/models/catalogue | `apps/web/app/api/models/catalogue/route.ts` | Serves the catalogue filtered by the training setting; on read failure lists only no-training models. |
| endpoint | GET /api/llm/v1/models | `apps/web/app/api/llm/v1/models/route.ts` | Lists available and temporarily_unavailable model ids (lines 126-160, 216). |
| service | toCanonicalChatRequest | `apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts` | Sets zeroDataRetentionOnly on the provider request (lines 167-171, 209-210). |
| service | request-processor (chat completions) | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Reads training opt-out, narrows providers, builds the routing policy snapshot (lines 4694-4730). |
| service | model-catalogue server projection | `apps/web/lib/server/model-catalogue.ts` | Computes temporarilyUnavailable and deprecatedOn per entry (lines 240, 284). |
| component | ModelCatalogue | `apps/web/features/chat/components/Composer/ModelCatalogue.tsx` | Web picker rows and tags for unavailable and not-offered models. |
| component | ComposerFooter deprecation warning | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Leaving-soon label within 30 days (lines 314-327). |
| screen | PrivacySection | `apps/web/features/settings/sections/PrivacySection.tsx` | Training toggle and privacy explanation. |
| screen | WorkspacePolicySection | `apps/web/features/settings/sections/WorkspacePolicySection.tsx` | Zero retention toggle and workspace model policy. |
| endpoint | GET/POST/DELETE /api/settings/organization/data-region | `apps/web/app/api/settings/organization/data-region/route.ts` | Workspace data region read, move, cancel. |
| service | retirement helpers (mobile) | `apps/mobile/src/features/model-picker/retirement.ts` | Upcoming 'Retires' label and retired-model chat notice. |
| service | CLI model list and picker | `apps/cli/src/provider.rs` | Prints the deprecation notice in the model list (lines 221-224); picker equivalent in apps/cli/src/tui/widgets/model_picker.rs:462-466. |
| service | Rust registry resolver | `crates/agiworkforce-model-registry/src/lib.rs` | Resolver with lifecycle, commercial and harness checks only (lines 788-856, 976-983). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person switches on the training setting; the value is written to user settings under the privacy namespace. | our servers | apps/web/lib/server/provider-training-opt-out.ts:12-13, 23-33 (read side); write path not opened |
| The picker asks for the catalogue; the server filters out models whose provider may train, keeps Auto, and returns a private 15-second cached list. | our servers | apps/web/app/api/models/catalogue/route.ts:81-100 |
| A chat turn reads the training, conversation training state, retention, model policy, workspace region and US-only rules. | our servers | apps/web/lib/server/managed-cloud-routing/admission.ts:130-152; policy-source.ts:66-88 |
| The request is built with retiredModelKeys, excluded transports, region and the policy fields. | our servers | apps/web/lib/server/managed-cloud-routing/routing-request.ts:96-125, 149 |
| resolveAutoRoute checks models then routes, then ranks the passing routes; the first becomes the answer and the rest become failover of the same model. | our servers | packages/ai/routing/src/auto.ts:1137-1170, 1343-1395 |
| The request is sent to the provider with zeroDataRetentionOnly set when required. | outside service | apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts:209-210 |
| Pickers on mobile and CLI compute leaving labels from the catalog's deprecation date on the device. | device | apps/mobile/src/features/model-picker/retirement.ts:18-28; apps/cli/src/provider.rs:221-224 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| keepOutOfProviderTraining setting | user_settings table, settings JSON under privacy | Server-held; the mobile app reads and writes it through the cloud (apps/mobile/src/features/settings/cloud-privacy/trainingPreferences.ts:1-3) | unknown (retention of settings not opened) |
| Workspace data region and zero retention policy | organization policy and region records read through readOrganizationRegion and readOrganizationPolicy; table names unknown | Server-held | unknown |
| Registry facts: residency regions, retention class, training policy, lifecycle dates | generated registry in the repository (packages/ai/model-registry/generated/registry.ts; catalog in packages/ai/model-registry/catalog) | Ships with each app build | Edited through the catalog files and regenerated (doc: AGENTS.md section 4) |

**Models and providers.** The rule reads provider records (training policy, retention class, residency regions) and per-model lifecycle from the registry; it works across any provider in the catalog and never picks a different model for a route-level reason, only a different route of the same model (packages/ai/routing/src/auto.ts:1124-1130).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The training setting, workspace region, model policy and zero retention need a signed-in account; the catalogue falls back to the anonymous plan tier if the plan lookup fails (apps/web/app/api/models/catalogue/route.ts:61-63). Guest chat route exists; whether it reads the training setting is unknown. |
| Permissions | Workspace region, zero retention and model policy are organization settings; the exact admin role check was not opened, so unknown. |
| Subscription | Model admission by plan runs in the same eligibility step (tierAdmissionRejection) (packages/ai/routing/src/auto.ts:1361-1363). The privacy toggle text says it matters on Free, but the code applies it to every plan (apps/web/features/settings/sections/PrivacySection.tsx:64; apps/web/app/api/models/catalogue/route.ts:81-86). |
| Limits and metering | The catalogue endpoint is rate-limited under 'model-catalog' (apps/web/app/api/models/catalogue/route.ts:75). No usage metering specific to this rule found. |
| Feature flags | enableObservedHealthRanking (ranking bands); gateway flag harness ids narrow allowedHarnessIds (apps/web/lib/server/managed-cloud-routing/routing-request.ts:101-106). Flag defaults unknown. |
| Model compatibility | A provider with no recorded training policy is treated as may-train and refused under the training rule (packages/ai/routing/src/auto.ts:179-181). A model with every route degraded is shown as temporarily unavailable. |
| Provider restrictions | Excluded transports for the home region (EXCLUDED_ROUTE_HOSTS), US-only excluded providers, ZDR provider overrides (apps/web/lib/server/managed-cloud-routing/routing-request.ts:42-44, 149; apps/web/lib/server/managed-cloud-routing/policy-source.ts:90). |
| Local mode | No region, retention or training rule was found for mode:local; the data stays on the device, and the rules found apply to the managed Cloud path. Own-key behaviour: not found in the code. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Training setting read fails (catalogue) | Logs a warning and lists only no-training models. | apps/web/app/api/models/catalogue/route.ts:62-67 |
| Training setting read fails (routing) | Routes as opted out. | apps/web/lib/server/managed-cloud-routing/policy-source.ts:54-64 |
| No managed provider keeps inputs out of training | The call is refused with no_training_route. | apps/web/lib/server/managed-cloud-routing/admission.ts:230-232 |
| Workspace policy, retention or region cannot be read | The call is refused (policy_unreadable); retention read failure throws account-control unavailable. | apps/web/lib/server/managed-cloud-routing/admission.ts:155-162; apps/web/lib/services/organization-policy-gate.ts:546-552 |
| Transport publishes no region, workspace not pinned | Admitted (evidence gap, not a violation). | packages/ai/routing/src/route-ranking.ts:37-41; packages/ai/routing/src/auto.ts:243-251 |
| Transport publishes no region, workspace pinned | Refused. | packages/ai/routing/src/route-ranking.ts:53-58 |
| Conditional-retention route with zero retention required | Admitted only if the harness feature zeroDataRetentionOnRequest is implemented. | packages/ai/routing/src/auto.ts:1099-1111 |
| Retired model pinned by the user | Refused, never resolved to another model (test name). | packages/ai/routing/src/__tests__/retired-model-selection.test.ts:33 |
| Chat opened on a retired model (mobile) | Shows a notice naming the replacement if one exists. | apps/mobile/src/features/model-picker/retirement.ts:30-42 |
| Every route of a model degraded | Model is tagged temporarily unavailable and not selectable. | apps/web/lib/server/model-catalogue.ts:240; apps/web/features/models/lib/model-presentation.ts:66-69 |
| Offline, retry, cancel, timeout for these rules | not handled in the code beyond the generic request path; not looked at further. | not found in the files opened |
| Accessibility | Price band marks carry aria labels in the web picker; other labels for this feature not checked. | apps/web/features/chat/components/Composer/ModelCatalogue.tsx:211-215 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ai/routing/src/__tests__/route-ranking.test.ts`: Route ranking, failover to same-model routes, credentials, health, warm route ceiling, and data residency admission (describe at line 401).
- `packages/ai/routing/src/__tests__/zero-data-retention.test.ts`: Retention classes from the provider record, conditional route admission, refusal when no zero-retention route, provider override.
- `packages/ai/routing/src/__tests__/auto-no-training-admission.test.ts`: No-training admission for Auto, named models, pinned routes, continuity and the routing trace.
- `packages/ai/routing/src/__tests__/retired-model-selection.test.ts`: A pinned retired or deprecated model is refused, not remapped.
- `apps/web/lib/server/managed-cloud-routing/__tests__/admission.test.ts`: Managed Cloud admission (file exists; individual cases not opened).
- `apps/web/lib/server/managed-cloud-routing/__tests__/policy-source.test.ts`: Policy source reads (cases not opened).
- `apps/web/lib/server/managed-cloud-routing/__tests__/routing-request.test.ts`: Routing request building (cases not opened).
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.training-opt-out.test.ts`: Training opt-out on the chat request processor (sets noTrainingOnly).
- `apps/web/app/api/llm/v1/chat/completions/lib/managed-failover.training-opt-out.test.ts`: Every failover hop keeps the no-training rule.
- `apps/web/lib/services/__tests__/organization-policy-gate.test.ts`: Organization policy gate including zero retention (cases not opened).
- `apps/mobile/src/features/model-picker/__tests__/retirement.test.ts`: Mobile retirement label and notice.
- `apps/mobile/__tests__/ProviderTrainingParsing.test.ts`: Mobile parsing of the training preference.
- `packages/contracts/types/src/__tests__/model-catalog.test.ts`: Deprecated family members point to a live successor (line 1220).

**Test scenarios**

- **Training setting filters the web catalogue**
  1. On localhost, sign in on web.
  2. Turn on 'Only use models that do not train on your chats'.
  3. Open the model picker.
  - Expected: Only Auto and models whose provider keeps inputs out of training are listed; with the setting off, more models appear.
- **Training setting refuses a may-train model**
  1. Keep the setting on.
  2. Send a request that names a may-train model through the chat API.
  - Expected: The request is refused with the 'This model's provider may train...' message and nothing is sent to that provider.
- **Zero retention policy**
  1. As a workspace admin, switch on 'Require zero data retention providers'.
  2. Send a chat.
  - Expected: Only zero-retention routes serve it; if none exist the call is refused, not rerouted.
- **Region pin**
  1. Pin a workspace to a region other than the deployment's home region via the data region setting.
  2. Send a chat and read the routing trace.
  - Expected: Selected route publishes the pinned region on model and transport; otherwise unavailable.
- **Retiring model label**
  1. Use a catalog entry whose deprecation date is within 30 days (test fixture).
  2. Open the web picker and the mobile picker.
  - Expected: A 'Leaving on' (web) or 'Retires <date>' (mobile) label is shown; after the date the model is gone from the picker.
- **Degraded model**
  1. Mark every route of one model degraded in route health.
  2. Open the web picker.
  - Expected: The model shows 'Temporarily unavailable' and cannot be chosen.

**Where to look when it fails**

- Log line '[managed-cloud-routing] call refused' with kind, reason and code (apps/web/lib/server/managed-cloud-routing/admission.ts:200-202).
- Log line '[managed-cloud-routing] an account rule could not be read; the call is refused'.
- Log line 'Training opt-out read failed; listing only no-training models'.
- Log line '[zero-data-retention] retention requirement unknown; request denied'.
- Refusal reasons no_training_route, no_route, policy_unreadable; decision codes model_not_available_in_region and explicit_model_ineligible (packages/ai/routing/src/auto.ts:1840-1843).
- Decision reasons text such as 'does not process requests in region' or 'does not guarantee zero data retention' (packages/ai/routing/src/route-ranking.ts:40; packages/ai/routing/src/auto.ts:1104).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/076-model-capability-registry.md](../../70-qa/test-plans/web/076-model-capability-registry.md)
- Desktop: [70-qa/test-plans/desktop/076-model-capability-registry.md](../../70-qa/test-plans/desktop/076-model-capability-registry.md)
- Mobile: [70-qa/test-plans/mobile/076-model-capability-registry.md](../../70-qa/test-plans/mobile/076-model-capability-registry.md)
- CLI: [70-qa/test-plans/cli/076-model-capability-registry.md](../../70-qa/test-plans/cli/076-model-capability-registry.md)
- VS Code: [70-qa/test-plans/vscode/076-model-capability-registry.md](../../70-qa/test-plans/vscode/076-model-capability-registry.md)
- Chrome: [70-qa/test-plans/chrome/076-model-capability-registry.md](../../70-qa/test-plans/chrome/076-model-capability-registry.md)

## 10. Gaps and dependencies

- **The Rust resolver has no region, zero retention, no-training, retired-date or health ranking checks.** Affects: CLI and Tauri desktop code that resolve routes in Rust (surface:cli, surface:desktop internal build).. Evidence: crates/agiworkforce-model-registry/src/lib.rs:788-856, 976-983 versus packages/ai/routing/src/auto.ts:1040-1115, 1137-1170. Work needed: Port the rules or state they belong to the server path only, and update the conformance fixture.
- **The brief's 'done' for every app is not backed by per-app enforcement in the files opened; the cited files for most apps are generic picker or streaming files.** Affects: Mobile, CLI, VS Code, Chrome. Evidence: brief S76.34, S76.35, S76.38 code lists; server enforcement at apps/web/lib/server/managed-cloud-routing/routing-request.ts:96-125. Work needed: Confirm each app's cloud calls reach the managed path and the picker reflects the setting.
- **Own-key and Local routes do not carry these rules in the code opened.** Affects: mode:own-key users who set a retention, region or training preference. Evidence: rules built only in apps/web/lib/server/managed-cloud-routing/routing-request.ts:96-125. Work needed: Decide the requirement for own-key and either implement or state the exception.
- **Draft picker claim: retired models are 'not listed' conflicts with the models page helper that labels 'Retired' on an entry that is still selectable.** Affects: surface:web models page. Evidence: apps/web/features/models/lib/model-presentation.ts:36-41. Work needed: Confirm which entries reach that label and align the copy.
- **The privacy toggle description says it affects Free only, but the code applies it on all plans.** Affects: All plans, surface:web and surface:mobile. Evidence: apps/web/features/settings/sections/PrivacySection.tsx:64; apps/web/app/api/models/catalogue/route.ts:81-86. Work needed: Correct the description or limit the rule.
- **No recorded run of any scenario for this feature.** Affects: All. Evidence: no result file read. Work needed: Run the scenarios on localhost, one app at a time.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-authorization-and-workspaces
- SYS-security-and-privacy
- SYS-data-model-and-migrations
- SYS-chat-turn-pipeline
- mode:cloud
- file:packages/ai/routing/src/auto.ts
- file:packages/ai/routing/src/route-ranking.ts
- file:packages/ai/model-registry/generated/registry.ts
- file:apps/web/lib/server/managed-cloud-routing/admission.ts
- api:GET /api/models/catalogue
- table:user_settings

## Unknown

- Whether the VS Code extension and Chrome extension picker hide or label retired models; no lifecycle code was found in the files opened for them.
- The default of the observed-health ranking flag.
- The admin role required to change workspace region, zero retention or model policy.
- Which database tables hold the organization policy and region (only helper names readOrganizationPolicy and readOrganizationRegion were seen).
- Whether own-key mode applies any of these rules in any app.
- How the Desktop Tauri build enforces them, since the public Desktop shows the hosted web app.
- Retention and deletion rules for the stored training setting.
- Whether any test or manual run result for these scenarios is recorded.
