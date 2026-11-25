---
id: "F004-13"
type: "feature"
title: "Models, usage, billing and settings"
aliases: ["Models, usage, billing and settings", "Model catalog (S4.38)", "Model picker / ModelCatalogue", "Usage dashboard (S4.39)", "Plan usage limits", "Billing settings (S4.40)", "Personal settings (S4.41)", "Settings > General / Usage / Billing"]
area: "4 Signed-in application destinations"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "seen failing", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S4.38", "S4.39", "S4.40", "S4.41"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-api-and-contracts", "SYS-shared-ui-and-design", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "api:GET /api/models/catalogue", "api:GET /api/usage", "api:PUT /api/billing/overage", "table:subscriptions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F004-13 Models, usage, billing and settings

The signed-in places where a person chooses a model, sees how much of their plan they have used, sees plan, invoices and the overage switch, and changes personal preferences. On web and in Electron they open as sections of one settings dialog. Mobile has its own screens. Mobile billing is off in v1.

Area: [4. Signed-in application destinations](README.md). Requirement items: [S4.38](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s438), [S4.39](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s439), [S4.40](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s440), [S4.41](../../10-requirements/capabilities/004-signed-in-application-destinations.md#s441).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | seen failing |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Web: a composer model catalogue (search, filters, upgrade hints, 'Coming soon' rows), a Default model dropdown in Settings > General, a Usage page (plan limits per window, credits, monthly spend limit, history, export) and a Billing page (plan, payment methods, invoices, credit history, overage switch, billing portal). Mobile: its own model picker, Usage and Subscription screens. CLI and VS Code read the same usage endpoint. [inferred] from the code listed in implementation_map.

**Why it exists.** The brief says a person must be able to pick a model they can actually reach, see usage against plan limits and reset times, see and manage billing, and save their own preferences (brief: S4.38, S4.39, S4.40, S4.41). The code comments say the catalogue stops the picker offering a model that cannot answer (apps/web/lib/server/model-catalogue.ts, comment in toCatalogueEntry).

**Who uses it.** Any signed-in person on web, Electron Desktop, mobile, CLI or VS Code. Paid people see meters and billing. Free people see an Upgrade prompt on web usage (apps/web/features/settings/sections/UsageSection.tsx:1224-1328).

**Problems it solves**

- A person picks a model their plan or the deployment cannot serve and the turn fails (the server drops models with no configured route and marks fully degraded ones unavailable, apps/web/lib/server/model-catalogue.ts toCatalogueEntry).
- A person hits a limit with no idea when it resets (Usage shows windows and reset times, apps/web/features/settings/sections/UsageSection.tsx).
- A person cannot find their plan, invoices or how to spend extra credits (BillingSection.tsx).
- New chats start on the wrong model (Default model row, GeneralSection.tsx:361-420).

**Use cases**

- On web, open the model picker in the composer, search for a model, and choose it; a model above the plan shows 'Upgrade to use' with the plan name (apps/web/features/chat/components/Composer/ModelCatalogue.tsx:569-577).
- Open Settings > Usage on a paid plan to see when the 5-hour or weekly window resets (UsageSection.tsx).
- Open Settings > Billing, switch overage on, and see it roll back with an error if saving fails (BillingSection.tsx:301-325).
- On the phone open Settings > Usage while signed in to Cloud (apps/mobile/src/features/settings/index.tsx:855-860).

## 2. User experience

**Where to find it**

- Web and Electron Desktop: model picker button in the composer footer opens the catalogue (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1208, ModelCatalogue mounted near :1578).
- Web and Electron: settings dialog sections 'general', 'usage', 'billing' (apps/web/features/settings/lib/web-settings-sections.ts WEB_SETTINGS_CONTENT_SECTIONS).
- Web direct addresses /settings/general, /settings/usage, /settings/billing each redirect to /chat?<deep-link query> so the dialog opens on that section (apps/web/app/settings/usage/page.tsx; apps/web/features/settings/components/SettingsModalRedirect.tsx).
- Mobile: Settings tab rows 'Usage' and the Subscription row; Settings > General has a 'Models' row (apps/mobile/src/features/settings/index.tsx:639,855; apps/mobile/src/features/settings/general/index.tsx:179).
- CLI: usage summary (apps/cli/src/usage_summary.rs) and Cloud model list for the app server (apps/cli/src/app_server/account_cloud.rs:104). Exact command names for model and usage are unknown beyond the registry entries 'model' and 'usage' (apps/cli/src/command_registry.rs:381,588).
- VS Code: command 'agi-workforce.showAccountUsage' (apps/extension-vscode/src/core/commandSetup.ts:2185).
- Chrome extension: reads the managed usage endpoint (apps/extension/src/features/cloud-bridge/freeTrialClient.ts:116); where the person sees it is unknown.

**Before you start**

- A signed-in account for the Cloud catalogue, usage and billing. On web the catalogue falls back to the anonymous plan tier when the person cannot be resolved (apps/web/app/api/models/catalogue/route.ts resolveViewer).
- Mobile usage needs sign-in and Cloud mode, otherwise it shows a sign-in prompt (apps/mobile/src/features/settings/cloud-usage/index.tsx:947-953).
- Overage and top-ups only apply to a managed paid plan (BillingSection.tsx canBuyTopUps).

**Screens and controls**

- Catalogue: search box (placeholder 'Search models'), developer rail tabs, capability filter chips, listbox 'Models', favourite and 'About <model>' buttons, a back button (ModelCatalogue.tsx:623-712).
- Settings > General: select 'Default model' with option 'Last used' plus models; locked models read '<name> · Upgrade to use (<plan>)' (GeneralSection.tsx:386-418).
- Settings > Usage: heading 'Usage', card 'Plan usage limits' or, on Free, 'Upgrade for higher capacity' with an 'Upgrade' button; 'Billing history' link; retry button 'Try again'; history granularity and export link (UsageSection.tsx:1224-1330,1174).
- Settings > Billing: 'Manage billing' button, invoices list, payment methods, credit history, overage switch labelled by 'overage-toggle-label' (BillingSection.tsx:890,1206-1233).
- Mobile Usage: bars, history options 'Days', 'Weeks', 'Months'; Free shows 'Upgrade for higher capacity' with an 'Upgrade' button only when store purchases are compiled in (cloud-usage/index.tsx:956-1013).

**Journey**

1. Web: open the composer model picker. The page calls GET /api/models/catalogue once and keeps the result (apps/web/features/chat/lib/use-model-catalogue.ts).
2. Search or filter, then click a model. A selectable model becomes the chat model; a plan-locked model calls onUpgradeRequest (ModelCatalogue.tsx:494).
3. To set a default: open Settings > General, choose from 'Default model'. Choosing a locked model shows an 'Upgrade to use' link instead of saving (GeneralSection.tsx:401-418).
4. To check usage: open Settings > Usage. Paid people see windows, credits, monthly spend limit and history. Free people see the Upgrade button (UsageSection.tsx:1441-1451).
5. To manage the plan: Settings > Billing. 'Manage billing' calls POST /api/portal and hands off to the hosted portal (apps/web/features/billing/services/stripe-payments.ts:162-189).
6. After a top-up checkout, the return address /settings/billing?topup=success shows a toast, then the dialog opens on Billing (SettingsModalRedirect.tsx).

**What the person sees and gets**

- Catalogue states: loading / error with retry (status prop), 'Coming soon' tag, 'Upgrade to use · <plan>', temporarily-unavailable marker (ModelCatalogue.tsx:37,319-324,555-577).
- Usage: status line, bars with used / allowance / left / reset; stale marker '(refresh failed)' on the last-updated label (UsageSection.tsx:1240-1250).
- Billing: toast 'Top-up payment received. Your balance updates after payment confirmation.' or 'Top-up checkout was canceled. No balance was added.' (SettingsModalRedirect.tsx).
- Overage error text 'Could not update the setting.' under the switch (BillingSection.tsx:321).

**Settings**

- Default model preference, stored through the preference client under a default-model namespace (apps/web/features/chat/lib/default-model-preference.ts:63).
- Overage switch, stored as subscriptions.overage_enabled (apps/web/app/api/billing/overage/route.ts:72).
- Monthly spend limit via /api/settings/spend-limit and auto-reload via /api/billing/auto-reload (UsageSection.tsx:63-67).
- Provider training opt-out narrows the catalogue to no-training models (apps/web/app/api/models/catalogue/route.ts:80-86).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server builds the catalogue from the model registry, the managed route list, route health, plan, event promotion and free promotion, and returns it at GET /api/models/catalogue (apps/web/lib/server/model-catalogue.ts buildCatalogueEntries; apps/web/app/api/models/catalogue/route.ts).
- A model with no configured executable route is dropped; a model whose routes are all degraded is returned with temporarilyUnavailable; an announced model is a non-selectable 'Coming soon' row (model-catalogue.ts toCatalogueEntry).
- The wire entry removes route, provider and provider label so the client never sees suppliers (route.ts toWireEntry).
- Free web usage shows only an Upgrade prompt and no meters (UsageSection.tsx:1224,1279-1328,1441-1451); test holds it (apps/web/features/settings/sections/__tests__/UsageSection.test.tsx:249).
- Overage switch updates at once, is blocked while saving, and rolls back on failure (BillingSection.tsx:301-325).
- Top-up result toast after checkout return (SettingsModalRedirect.tsx; test SettingsModalRedirect.test.tsx:61,74).
- Default model row saves through the preference client and toasts on failure (GeneralSection.tsx:401-406).
- Usage endpoints exist: /api/usage, /history, /limits, /limit-resets, /export, /discrepancy (apps/web/app/api/usage/*).
- CLI reads /api/usage and history (apps/cli/src/usage_summary.rs:15-17) and validates the Cloud catalogue (apps/cli/src/app_server/account_cloud.rs:104-135).
- VS Code reads /api/usage and /api/usage/history (apps/extension-vscode/src/utils/api.ts:1545,1555).

**Incomplete**

- Billing is 'partial' on web, desktop and mobile; the brief says the live check with a granted test account, Stripe test checkout and migration 0281 is unverified (brief S4.40 Unfinished).
- Mobile billing screen: plan summary and store purchase code exist, but the web portal is off and store purchases are off in this build (apps/mobile/lib/v1FeatureFlags.ts:6; apps/mobile/src/features/billing/storePurchases.json).
- Mobile model picker reads '/api/models' for provider availability, not '/api/models/catalogue' (apps/mobile/src/features/model-picker/providerAvailabilityStore.ts:5); whether the two agree is unknown.

**Present but disconnected or switched off**

- FEATURES.billing = false on mobile, so the portal target is not offered (apps/mobile/lib/v1FeatureFlags.ts:6; apps/mobile/src/features/settings/cloud-billing/index.tsx:199).
- Store purchases switched off: nativePurchases false removes purchase, upgrade, top-up and restore controls (apps/mobile/src/features/billing/storePurchases.json; nativePurchaseAvailability.ts:3).
- Mobile billing service throws 'billing: cloud billing not available in v1' (apps/mobile/src/features/billing/service.ts:9).

**Not available**

- Web: the brief cites GeneralSection.tsx:1060 for the default model, but that file has 881 lines; the real code is at GeneralSection.tsx:361 (stale brief reference).
- Billing management on CLI, VS Code and Chrome: no billing screen listed by the brief (brief S4.40 lists web, desktop, mobile only).
- Per-million prices are deliberately not sent to the client (model-catalogue.ts, comment on priceBand).

## 4. Required behaviour

**Established requirements**

- The catalogue lists models the user can reach with capabilities, context and price, and lets them pick one or set a default. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S4.38)
- The usage dashboard shows usage against plan limits per window (session, weekly, credits), reset times and recent history. (source: brief S4.39)
- Billing settings show current plan, renewal, payment method and invoices, and let the user change or cancel the plan. (source: brief S4.40)
- Personal settings let the signed-in user view and change profile, appearance, personalization and notification preferences and save them. (source: brief S4.41)
- Free usage screens show only Upgrade, never meters (owner decision, held by the UsageSection test). (source: memory: free-usage-upgrade-only; apps/web/features/settings/sections/__tests__/UsageSection.test.tsx:249)
- One account and entitlement span the suite; a surface must not invent a separate one. (source: doc: docs/product/experience-contract.md:85)
- The overage switch is saved at once and rolled back if saving fails; a top-up result is announced after checkout. (source: task brief 'Should' lines for F004-13)
- Sales of subscriptions on any surface are held until 2027-01-01 and mobile v1 sells nothing. (source: owner memory (owner-product-decisions); apps/mobile/src/features/billing/storePurchases.json)

**Acceptance criteria**

1. A model with no configured route never appears in the web catalogue for any plan.
2. A model whose every route is degraded appears but cannot be selected and is marked unavailable.
3. A Free account opening Settings > Usage on web sees an Upgrade button and no usage bars.
4. Toggling overage when PUT /api/billing/overage fails returns the switch to its previous position and shows an error.
5. Returning from checkout to /settings/billing?topup=success shows the success toast and the Billing section opens.
6. Saving a default model persists after reload; a saved default not on the plan is shown as 'Last used' with a hint.
7. On mobile with store purchases off, no Upgrade, top-up or restore control appears on Usage or Subscription.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Catalogue and usage should read the same entitled plan so the picker and Usage never disagree [inferred] from resolveEntitledPlanTier used in the catalogue route.
- Local mode on desktop and mobile should list local models without any account [inferred] from the requirement that local inference is free and from the local catalogue in apps/mobile/src/features/model-picker/service.ts.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make mobile use the same /api/models/catalogue projection, or document why it uses /api/models.
- [proposed] Record the live Stripe test-mode check in audit/ once run.
- [proposed] Fix the stale brief code reference for the default model.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | buildCatalogueEntries | `apps/web/lib/server/model-catalogue.ts` | Builds admitted, unavailable and coming-soon model entries from registry, routes, health, plan and promotions. |
| endpoint | GET /api/models/catalogue | `apps/web/app/api/models/catalogue/route.ts` | Serves the catalogue projection with rate limit, plan label and training opt-out filter. |
| hook | useModelCatalogue | `apps/web/features/chat/lib/use-model-catalogue.ts` | Fetches the catalogue once, groups by developer, offers retry. |
| component | ModelCatalogue | `apps/web/features/chat/components/Composer/ModelCatalogue.tsx` | Composer catalogue UI with search, filters, upgrade and coming-soon rows. |
| component | ComposerFooter | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Hosts the picker button and mounts the catalogue. |
| component | DefaultModelRow | `apps/web/features/settings/sections/GeneralSection.tsx` | Default model dropdown with plan locks and save errors. |
| hook | useDefaultModelPreference | `apps/web/features/chat/lib/default-model-preference.ts` | Reads and saves the default model through the preference client. |
| service | preferences-client | `apps/web/app/settings/_lib/preferences-client.ts` | Reads and writes preference namespaces to the managed cloud settings preferences path. |
| component | WebSettingsModal | `apps/web/features/settings/components/WebSettingsModal.tsx` | Maps section keys to General, Usage, Billing and other panes; syncs the address hash. |
| config | WEB_SETTINGS_CONTENT_SECTIONS | `apps/web/features/settings/lib/web-settings-sections.ts` | The exact list of sections the web dialog can render; aliases like memory. |
| component | SettingsModalRedirect | `apps/web/features/settings/components/SettingsModalRedirect.tsx` | Turns /settings/<section> into /chat?<deep link> and announces top-up results. |
| screen | UsageSection | `apps/web/features/settings/sections/UsageSection.tsx` | Usage page: Free upgrade prompt, windows, credits, spend limit, history. |
| screen | BillingSection | `apps/web/features/settings/sections/BillingSection.tsx` | Billing page: plan, invoices, payment methods, credit history, overage switch, portal. |
| service | stripe-payments | `apps/web/features/billing/services/stripe-payments.ts` | openBillingPortal, checkout and top-up handoff to hosted billing. |
| endpoint | PUT /api/billing/overage | `apps/web/app/api/billing/overage/route.ts` | Saves subscriptions.overage_enabled with CSRF and rate limit. |
| endpoint | GET /api/usage and children | `apps/web/app/api/usage/route.ts` | Usage summary; plus history, limits, limit-resets, export, discrepancy sub-routes. |
| endpoint | /api/billing/* routes | `apps/web/app/api/billing` | invoices, payment-methods, credit-history, top-up, auto-reload, receipts, refunds, resume-cancellation. |
| table | subscriptions | `apps/web/app/api/billing/overage/route.ts` | Holds overage_enabled per user. |
| screen | Mobile Settings | `apps/mobile/src/features/settings/index.tsx` | Rows for Subscription, Usage, Help Center and Report. |
| screen | Mobile cloud-usage | `apps/mobile/src/features/settings/cloud-usage/index.tsx` | Usage bars, history, Free plan states. |
| screen | Mobile cloud-billing | `apps/mobile/src/features/settings/cloud-billing/index.tsx` | Plan summary and store or web management targets. |
| config | FEATURES | `apps/mobile/lib/v1FeatureFlags.ts` | billing=false, videoGen=false and other v1 flags. |
| config | storePurchases.json | `apps/mobile/src/features/billing/storePurchases.json` | nativePurchases switch read by the binary, screens and listings. |
| service | usage_summary | `apps/cli/src/usage_summary.rs` | CLI usage and history fetch from /api/usage. |
| service | account_cloud catalogue | `apps/cli/src/app_server/account_cloud.rs` | CLI fetches and validates /api/models/catalogue. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Browser or Electron window opens the picker; hook calls GET /api/models/catalogue. | device | apps/web/features/chat/lib/use-model-catalogue.ts |
| Server resolves the viewer plan and training opt-out, builds entries from the registry, managed routes, health signals, free pools and promotions, strips supplier fields and replies with a 15-second private cache. | our servers | apps/web/app/api/models/catalogue/route.ts:44-100; apps/web/lib/server/model-catalogue.ts |
| Choosing a locked model calls the upgrade handler; choosing an admitted model changes the chat model. | device | ModelCatalogue.tsx:494 |
| Saving the default model writes a preference namespace through the preference client. | device and our servers | apps/web/features/chat/lib/default-model-preference.ts:63; apps/web/app/settings/_lib/preferences-client.ts:200 |
| Usage page fetches the usage summary, limits, history and limit resets with the session; the server reads the usage ledger. | our servers | UsageSection.tsx:63-67,1079,1228 |
| Billing page fetches payment methods, invoices, credit history and overage; invoice data comes from the billing provider through our API. | device and our servers | BillingSection.tsx:495-578 |
| Manage billing posts to /api/portal and the browser leaves for the hosted portal (outside service). | outside service | apps/web/features/billing/services/stripe-payments.ts:162-189 |
| Overage switch sends PUT /api/billing/overage; server updates subscriptions.overage_enabled. | our servers | BillingSection.tsx:308; apps/web/app/api/billing/overage/route.ts:72 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Model catalogue projection | Not stored; computed per request and cached 15 s by the browser | no | Discarded with the response (route.ts Cache-Control). |
| Default model preference | Managed cloud preferences store behind the preference client (table name unknown) | yes, through the account | unknown |
| overage_enabled | table subscriptions | yes, read by all apps from /api/billing/overage | Kept with the subscription row. |
| Usage ledger rows | managed usage tables read by /api/usage (names not opened here; managed_usage_requests is used by the developer usage service) | yes | unknown |

**Models and providers.** The catalogue is generated from the model registry and the managed route list; providers are looked up by managed route and availability signals, and only a count of routes reaches the client (model-catalogue.ts). Which model ids exist is data, not hardcoded here. Local models are not in this server catalogue; mobile keeps a local catalogue (apps/mobile/src/features/model-picker/service.ts:97-106). Own-key models: unknown for this page.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Catalogue works without sign-in at the anonymous plan tier on web (route.ts resolveViewer). Usage and Billing need a signed-in account; mobile shows a sign-in prompt otherwise (cloud-usage/index.tsx:947). |
| Permissions | Overage PUT needs CSRF and a user-scoped database (overage/route.ts:57-60). Billing rows are user-scoped. Workspace-billed plans are managed by an owner or admin [inferred] from planChangeBlockedCopy for 'manual' source (BillingSection.tsx). |
| Subscription | Admission uses canAccessModelForSubscriptionTier, event promotions and a free-model promotion (model-catalogue.ts). Free sees the Upgrade prompt. Top-ups need a managed paid plan with stripe, apple or google source (BillingSection.tsx canBuyTopUps). |
| Limits and metering | Usage shows session, weekly, flagship weekly, monthly credit windows and a monthly spend limit (UsageSection.tsx:1204-1228). Catalogue route is rate limited under 'model-catalog' (route.ts:48). Usage route uses 'credits-balance' (apps/web/app/api/usage/route.ts:38). |
| Feature flags | Mobile FEATURES.billing=false and nativePurchases=false (v1FeatureFlags.ts:6; storePurchases.json). Web has event and free-model promotions as server config (model-catalogue.ts). |
| Model compatibility | A model is selectable only if configured, entitled by plan or promotion, and not fully degraded. A provider-level training opt-out hides models that keep inputs for training, except Auto (route.ts:80-86). |
| Provider restrictions | Developer jurisdictions are filtered by the managed cloud data region (model-catalogue.ts buildCatalogueEntries default argument). |
| Local mode | The web catalogue endpoint is a Cloud service. Local models on the phone come from a bundled local catalogue and need no subscription (apps/mobile/src/features/model-picker/service.ts:97-106). Usage and Billing screens are Cloud-account screens; on mobile they say the plan is read once chat is set to Cloud (cloud-billing/index.tsx:155-160). Local model listing on desktop: unknown beyond test ComposerFooter.localModels.test.tsx. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Catalogue loading and error | Status idle, loading, ready, error; retry button; retry ignored after a successful load. | apps/web/features/chat/lib/use-model-catalogue.ts |
| Catalogue server failure | 500 with code INTERNAL_ERROR 'Failed to load the model catalogue'. | apps/web/app/api/models/catalogue/route.ts:100-106 |
| Plan unresolved | Falls back to the anonymous plan tier; opt-out read failure lists only no-training models. | route.ts:44-62 |
| All routes degraded | Entry kept, marked temporarilyUnavailable, not selectable. | model-catalogue.ts toCatalogueEntry; ModelCatalogue.tsx:457 |
| Usage fetch fails | Alert with 'Try again'; bars marked unavailable rather than full; stale label '(refresh failed)'. | UsageSection.tsx:260-310,1240; UsageFailsHonest.test.tsx:35 |
| Billing period lapsed | Says the period ended and has not renewed instead of a full allowance. | UsageSection.tsx PERIOD_NOT_RENEWED_DETAIL; UsageSection.test.tsx:283 |
| Overage save fails | Switch rolls back, error shown, second click ignored while pending. | BillingSection.tsx:301-325 |
| Invoices fail or empty | Error with retry; empty text 'No invoices yet...'. | BillingSection.tsx:1158-1178 |
| Saved default not on plan | Shows 'Last used' and a hint that new chats use the last model. | GeneralSection.tsx:378-390 |
| Offline | not handled in the code beyond fetch error states in the places read. | UsageSection.tsx useUsageResource |
| Accessibility | Dropdown, switch and alerts carry aria labels; catalogue uses tablist and listbox roles. | ModelCatalogue.tsx:647,712; BillingSection.tsx:1230 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/models/__tests__/catalogue-executability.test.ts`: Models with no executable route are not offered.
- `apps/web/__tests__/api/llm-v1-models-catalogue-agreement.test.ts`: Gateway model list agrees with the catalogue.
- `apps/web/features/chat/components/Composer/__tests__/ModelCatalogue.supply-and-event.test.tsx`: Supply and event access rows in the picker.
- `apps/web/features/chat/components/Composer/__tests__/ModelCatalogue.dead-control.test.tsx`: No dead controls in the catalogue.
- `apps/web/features/chat/components/Composer/ComposerFooter.modelSwitch.test.tsx`: Switching model from the footer.
- `apps/web/features/settings/sections/__tests__/UsageSection.test.tsx`: Free upgrade prompt, lapsed period, stale reading, credit order.
- `apps/web/features/settings/sections/__tests__/UsageFailsHonest.test.tsx`: No full allowance when loading or failed.
- `apps/web/features/settings/sections/__tests__/BillingSection.test.tsx`: Billing section behaviour including overage calls.
- `apps/web/features/settings/components/SettingsModalRedirect.test.tsx`: Redirect to /chat and top-up toasts.
- `apps/web/app/api/billing/overage/route.test.ts`: Overage route.
- `apps/web/features/settings/sections/GeneralSection.test.tsx`: General section including default model [inferred from name].
- `apps/mobile/__tests__/CloudUsagePage.test.tsx`: Mobile usage page.
- `apps/mobile/__tests__/NoPurchasesBilling.test.tsx`: Mobile billing with purchases off.

**Test scenarios**

- **Free account usage**
  1. Sign in with a Free test account on web
  2. Open /settings/usage
  - Expected: Redirects to /chat with the dialog on Usage; shows 'Upgrade for higher capacity' and an Upgrade button; no bars.
- **Overage rollback**
  1. Sign in with a paid test account
  2. Open Settings > Billing
  3. Make PUT /api/billing/overage fail (offline or blocked)
  4. Click the overage switch
  - Expected: Switch returns to its old state and an error appears under it.
- **Unconfigured route hidden**
  1. Call GET /api/models/catalogue as a Free user
  2. Compare with the registry for a model whose managed provider has no credential
  - Expected: That model is absent; count equals models length.
- **Top-up return**
  1. Open /settings/billing?topup=cancelled
  - Expected: Toast 'Top-up checkout was canceled. No balance was added.' and Billing opens.
- **Mobile no purchases**
  1. Install a build with nativePurchases false
  2. Sign in on a Free account in Cloud mode
  3. Open Settings > Usage
  - Expected: Shows 'Free plan' text and no Upgrade button.
- **Default model lock**
  1. On a Free account open Settings > General
  2. Choose a locked model in 'Default model'
  - Expected: Nothing is saved; a note with an 'Upgrade to use' link appears.

**Where to look when it fails**

- Server log 'Model catalogue projection served' with modelCount and planTier; error 'Failed to serve the model catalogue projection' (route.ts).
- Warn 'Training opt-out read failed; listing only no-training models' (route.ts).
- Browser network tab for /api/usage*, /api/billing/*.
- Table subscriptions column overage_enabled.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/004-signed-in-application-destinations.md](../../70-qa/test-plans/web/004-signed-in-application-destinations.md)
- Desktop: [70-qa/test-plans/desktop/004-signed-in-application-destinations.md](../../70-qa/test-plans/desktop/004-signed-in-application-destinations.md)
- Mobile: [70-qa/test-plans/mobile/004-signed-in-application-destinations.md](../../70-qa/test-plans/mobile/004-signed-in-application-destinations.md)
- CLI: [70-qa/test-plans/cli/004-signed-in-application-destinations.md](../../70-qa/test-plans/cli/004-signed-in-application-destinations.md)
- VS Code: [70-qa/test-plans/vscode/004-signed-in-application-destinations.md](../../70-qa/test-plans/vscode/004-signed-in-application-destinations.md)
- Chrome: [70-qa/test-plans/chrome/004-signed-in-application-destinations.md](../../70-qa/test-plans/chrome/004-signed-in-application-destinations.md)

## 10. Gaps and dependencies

- **Billing has no recorded live check with Stripe test checkout and migration 0281.** Affects: Web and Electron Desktop paid people. Evidence: brief S4.40 Unfinished. Work needed: Run the live check and record it under audit/.
- **Mobile shows no billing management in v1.** Affects: Mobile paid or comped accounts. Evidence: apps/mobile/lib/v1FeatureFlags.ts:6; storePurchases.json. Work needed: Owner decision when sales open (not before 2027-01-01 per owner notes).
- **Mobile picker uses /api/models, not the catalogue projection.** Affects: Mobile Cloud mode. Evidence: providerAvailabilityStore.ts:5. Work needed: Confirm parity or move to the projection.
- **Brief code reference for default model is stale.** Affects: Engineers using the brief. Evidence: GeneralSection.tsx has 881 lines; brief cites :1060. Work needed: Update the brief source.
- **Whether CLI, VS Code and Chrome hide meters for Free is unknown.** Affects: Those apps. Evidence: usage_summary.rs, commandSetup.ts:2185 not read in full. Work needed: Read and test.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-api-and-contracts
- SYS-shared-ui-and-design
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- api:GET /api/models/catalogue
- api:GET /api/usage
- api:PUT /api/billing/overage
- table:subscriptions

## Unknown

- Exact CLI command names and output for model and usage.
- Where the Chrome extension shows usage.
- Where the default model preference is stored (table).
- How desktop Electron lists local models in this picker.
- Whether mobile and web model lists agree.
- Retention of usage ledger rows.
- Live billing behaviour (no record of a run).
