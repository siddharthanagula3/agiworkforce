---
id: "F010-08"
type: "feature"
title: "Model choice, usage limits and billing"
aliases: ["Model incompatibility warning", "Context-limit warning", "Usage-limit notice", "Credit-purchase dialog", "Upgrade comparison", "Cancel subscription", "Payment-method update", "Paywall card", "S10.26 to S10.32"]
area: "10 Modal and dialog inventory"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "built", chrome: "partial"}
verification: {web: "partly seen (1 of 7)", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S10.26", "S10.27", "S10.28", "S10.29", "S10.30", "S10.31", "S10.32"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-local-inference", "SYS-execution-boundaries", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:cloud", "api:POST /api/portal", "api:POST /api/checkout", "table:beta_redemptions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F010-08 Model choice, usage limits and billing

Warns when a chosen model cannot handle the chat (images, tools, length), warns when a chat nears its context limit, explains a reached usage limit with the reset time and next step, and lets people compare plans, cancel and update a card. Paid purchase is held behind a waitlist. Cancel and card changes open an outside billing portal. Mobile billing is switched off.

Area: [10. Modal and dialog inventory](README.md). Requirement items: [S10.26](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1026), [S10.27](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1027), [S10.28](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1028), [S10.29](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1029), [S10.30](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1030), [S10.31](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1031), [S10.32](../../10-requirements/capabilities/010-modal-and-dialog-inventory.md#s1032).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | partly seen (1 of 7) |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows notices and dialogs around model choice, chat length, usage limits and plan billing so the person knows what will happen before it does.

**Why it exists.** Models differ in images, tools and context size. Limits and plans cost money. Silent trimming or silent refusals would confuse people and could bill them without notice.

**Who uses it.** Every signed-in person. Free and paid users see limit notices. Billing controls are for the account owner.

**Problems it solves**

- Switching to a model that drops the images or tools in a chat
- Chats that exceed the model's window and lose old messages
- Not knowing why a request was refused or when it works again
- Not knowing when paid access ends after cancelling

**Use cases**

- Switch model in the web composer with images attached and get a warning first
- Hit a usage limit and see the limit, reset time and an upgrade or switch option
- Compare plans in the upgrade dialog, or join the waitlist while paid upgrades are closed
- Cancel a plan from Billing settings

## 2. User experience

**Where to find it**

- Web and Electron Desktop: composer model picker; Settings, Billing; upgrade dialog (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1170, apps/web/features/settings/sections/BillingSection.tsx:904, apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:362)
- Mobile: chat shows the context chip and usage banner; Settings, Subscription (apps/mobile/app/(app)/chat/[id].tsx:2700, apps/mobile/src/features/settings/cloud-billing/index.tsx:367)
- CLI: header context meter and chat notice; `/compact`, `/context` (apps/cli/src/tui/tui_app.rs:2573, :8682)
- VS Code: model picker modal and Managed Cloud usage meter in the sidebar (apps/extension-vscode/src/core/commandSetup.ts:1359, apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3149)
- Chrome: side panel refusal text with limit and reset (apps/extension/src/features/cloud-bridge/cloudRefusal.ts:139)

**Before you start**

- Cloud chat for usage and billing screens; mobile shows 'Your plan is read from your account once chat is set to Cloud.' (apps/mobile/src/features/settings/cloud-billing/index.tsx:157)
- For purchase on web: a redeemed access code or the waitlist opened (apps/web/lib/server/billing-waitlist-access.ts:42)

**Screens and controls**

- Web: banner 'Switch to <model>?' with 'Switch anyway' and 'Keep <model>' (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1527, :1558)
- Web: status notice labelled 'Model compatibility' (apps/web/features/chat/components/Composer/ModelCompatibilityNotice.tsx:3)
- Web paywall card with 'Switch to <model>', Upgrade or Subscribe, a bring-your-own-key link, 'Try later' or 'Not now' (apps/web/features/chat/components/InlinePaywallCard.tsx:233)
- Upgrade dialog with waitlist buttons for each plan (apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx:259)
- Billing: 'Manage billing', 'Cancel plan', 'Manage cards', 'Add payment method', 'Open billing portal' (apps/web/features/settings/sections/BillingSection.tsx:893, :916, :1025)
- Mobile: 'Context warning' chip, 'Start a new chat' in its sheet (apps/mobile/src/features/chat/components/ContextWarningChip.tsx:36, apps/mobile/src/features/chat/components/ContextDetailsSheet.tsx:158)
- VS Code modal 'Switch to <model>?' with 'Switch anyway' (apps/extension-vscode/src/core/commandSetup.ts:1360)

**Journey**

1. Open the model picker and choose another model
2. If the chat has images, tools or too much text the model cannot take, a notice lists each problem
3. Choose switch anyway or keep the current model
4. As the chat grows near the window, a notice appears (mobile chip, CLI message at 85 percent)
5. On a refused request a limit card or sheet shows which limit, the reset time and the next step
6. Open the upgrade dialog; if paid upgrades are closed, join the waitlist or enter an access code
7. Open Billing to cancel or change card; both open the billing portal on web

**What the person sees and gets**

- Web context text: 'This conversation is about N tokens and <model> holds N. Older messages will be left out of the next reply.' (apps/web/features/chat/components/Composer/model-compatibility.ts:183)
- CLI: 'Context is N% full. /compact summarizes earlier turns to make room before the window runs out.' (apps/cli/src/tui/tui_app.rs:8686)
- Waitlist message: 'Paid upgrades are opening in stages. Join the waitlist or enter an access code to continue.' (apps/web/lib/server/billing-waitlist-access.ts:11)
- Portal error 'cancellation_unavailable' with a message to open Manage billing or contact support (apps/web/app/api/portal/route.ts:414)
- Mobile rows 'Access ends', 'Renews', 'Trial ends' (apps/mobile/src/features/settings/cloud-billing/index.tsx:370)

**Settings**

- Settings, Billing and Usage
- Overage setting on web billing (apps/web/features/settings/sections/BillingSection.tsx:498)
- Composer tool toggles drive the 'needs tools' check (apps/web/features/chat/components/Composer/model-compatibility.ts:70)

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web compatibility check covers unknown model, context overflow, no vision, no tools and, for promotional free models, attachment limits (apps/web/features/chat/components/Composer/model-compatibility.ts:97)
- Web switch waits for the person: findings other than unknown_model open a pending banner and the commit happens only on 'Switch anyway' (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1181)
- VS Code warns in a modal listing lost tools, vision or context and waits for 'Switch anyway' (apps/extension-vscode/src/core/commandSetup.ts:1359, apps/extension-vscode/src/features/model-picker/modelConstants.ts:347)
- Mobile context chip is mounted in the chat and shows at warn and compact levels (apps/mobile/app/(app)/chat/[id].tsx:2700, apps/mobile/src/features/memory/services/contextBudgeter.ts:87)
- CLI prints a one-time context warning at 85 percent and a header meter (apps/cli/src/tui/tui_app.rs:232, :8682)
- Web paywall card chooses headline by limit kind, shows reset text when known, offers a model switch (apps/web/features/chat/components/InlinePaywallCard.tsx:394, :476)
- Mobile paywall sheet shows reset label (apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:306)
- Chrome parses rate-limited refusals with limit, reset time and upgrade path (apps/extension/src/features/cloud-bridge/cloudRefusal.ts:139)
- Waitlist gate on checkout and portal (apps/web/app/api/checkout/route.ts, apps/web/app/api/portal/route.ts:158, :283)
- Cancel and card change open the billing portal; cancel deep-links into the portal cancel flow (apps/web/app/api/portal/route.ts:397)

**Incomplete**

- Context warning on web is only a line of text on a model check; it has no trim, compact or new-chat action (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1527)
- CLI usage-limit: the errors found are provider rate limits and context overflow, not a plan limit with reset time (apps/cli/src/errors.rs:604) ; plan-limit wording on CLI: unknown
- VS Code context warning: a compact command exists (apps/extension-vscode/src/core/commandSetup.ts:1383); a threshold notice was not found
- Mobile cancel and payment method link out; billing rows are limited because FEATURES.billing is false (apps/mobile/lib/v1FeatureFlags.ts:6, apps/mobile/src/features/settings/cloud-billing/index.tsx:199)
- Credit purchase and paid checkout held by waitlist (doc: docs/product/commercial.md:13)

**Present but disconnected or switched off**

- Mobile billing flag off: portal and purchase paths not offered (apps/mobile/lib/v1FeatureFlags.ts:6)
- Paid upgrades closed unless AGI_BILLING_WAITLIST_OPEN=1 or the operator flag opens them (apps/web/lib/server/billing-waitlist-access.ts:29)

**Not available**

- Model incompatibility warning on mobile, CLI and Chrome: none found
- Context-limit warning on Chrome: none found
- In-app card dialog: none; card edits happen in the outside billing portal (apps/web/features/settings/sections/BillingSection.tsx:1017)

## 4. Required behaviour

**Established requirements**

- Switching to a model that cannot handle the conversation warns and asks before switching. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.26)
- Near or past the context limit the user gets a warning with what to do (trim, compact, new chat). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.27)
- A reached limit shows which limit, when it resets and what to do. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.28)
- Paid plan acquisition stays waitlist or access-code gated; existing paid entitlements keep resolving. (source: doc: docs/product/commercial.md:24)
- Cancel says when access ends and confirms; payment method add or replace. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S10.31, S10.32)
- Usage/context meter where applicable. (source: doc: docs/product/experience-contract.md:347)

**Acceptance criteria**

1. With an image in the chat, picking a model without vision shows a warning and does not switch until 'Switch anyway'
2. With tools armed, picking a model without tools warns
3. A long chat shows the context notice before the window is exceeded, with a way to compact or start new
4. A reached limit card names the limit and the reset time, or says none is known
5. On Free the limit card shows no usage meter (owner rule from memory; not found in project docs)
6. With the waitlist closed, choosing a paid plan asks for waitlist or access code and creates no checkout
7. Cancel plan opens the portal cancel flow and Billing then shows when access ends
8. Mobile shows no purchase button while billing is off

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The VS Code model warning counts as done for S10.26 because it blocks on a modal [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add Trim, Compact and New chat buttons to the web context notice
- [proposed] Add model compatibility checks to mobile and CLI model switchers
- [proposed] Show the end-of-access date inside the web cancel button's confirmation, not only in the portal

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | evaluateModelCompatibility | `apps/web/features/chat/components/Composer/model-compatibility.ts` | Computes findings from catalog metadata |
| component | ComposerFooter model switch banner | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Pending-switch banner and notice mount |
| component | ModelCompatibilityNotice | `apps/web/features/chat/components/Composer/ModelCompatibilityNotice.tsx` | Status notice for findings |
| component | InlinePaywallCard | `apps/web/features/chat/components/InlinePaywallCard.tsx` | Web limit and upgrade card |
| component | UpgradePlanDialog | `apps/web/features/chat/components/dialogs/UpgradePlanDialog.tsx` | Plan comparison and waitlist actions |
| component | BillingSection | `apps/web/features/settings/sections/BillingSection.tsx` | Manage billing, Cancel plan, payment method rows |
| endpoint | POST /api/portal | `apps/web/app/api/portal/route.ts` | Opens the billing portal, optional cancel flow, waitlist gate |
| endpoint | /api/checkout | `apps/web/app/api/checkout/route.ts` | Checkout with waitlist gate |
| service | billing-waitlist-access | `apps/web/lib/server/billing-waitlist-access.ts` | Decides whether paid upgrades are open for a user |
| config | billing-upgrade-gate | `apps/web/lib/feature-flags/billing-upgrade-gate.ts` | Operator flag read, closed on failure |
| table | beta_redemptions | `apps/web/lib/server/billing-waitlist-access.ts` | Redeemed access codes grant upgrade access |
| component | ContextWarningChip | `apps/mobile/src/features/chat/components/ContextWarningChip.tsx` | Mobile context warning |
| service | contextBudgeter | `apps/mobile/src/features/memory/services/contextBudgeter.ts` | Thresholds 0.7 warn, 0.8 compact |
| component | PaywallBottomSheet | `apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx` | Mobile limit sheet |
| screen | Mobile cloud billing | `apps/mobile/src/features/settings/cloud-billing/index.tsx` | Plan rows, links out |
| config | mobile feature flags | `apps/mobile/lib/v1FeatureFlags.ts` | billing false |
| service | CLI TUI context warning | `apps/cli/src/tui/tui_app.rs` | Meter and 85 percent notice |
| service | CLI errors | `apps/cli/src/errors.rs` | ContextOverflow and RateLimited next steps |
| command | VS Code model switch | `apps/extension-vscode/src/core/commandSetup.ts` | Modal warning before switching |
| service | describeModelSwitchLosses | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | Lists tools, vision, context losses |
| service | cloudRefusal | `apps/extension/src/features/cloud-bridge/cloudRefusal.ts` | Chrome refusal parsing with reset time |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person picks a model; the composer estimates tokens and reads model limits and capabilities from the catalog | device | apps/web/features/chat/components/Composer/model-compatibility.ts:165 |
| A banner holds the switch until the person confirms | device | apps/web/features/chat/components/Composer/ComposerFooter.tsx:1181 |
| A chat request that exceeds a plan limit is refused by the server with a typed reason; the client renders the card | our servers | apps/web/lib/services/managed-usage-request-service.ts (cited by brief; not opened) |
| Upgrade click: the server checks waitlist access before creating checkout or portal | our servers | apps/web/app/api/portal/route.ts:158, :176 |
| Payment, card change and cancellation happen in the outside billing portal | outside service | apps/web/app/api/portal/route.ts:397 |
| Mobile opens the web billing URL in the browser | outside service | apps/mobile/src/features/settings/cloud-billing/index.tsx:325 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Subscription state (plan, status, period end, cancel at period end) | Account database; read by web billing store (apps/web/features/settings/sections/BillingSection.tsx:459) | Read by every surface from the server | Managed by the billing provider; table name unknown |
| Waitlist access code redemption | table:beta_redemptions (apps/web/lib/server/billing-waitlist-access.ts:50) | Server only | unknown |
| Notice dismissals and pending switch | Component state only | No | Lost on reload |

**Models and providers.** The compatibility check reads capability and window data from the model catalog by id, never by provider name (apps/web/features/chat/components/Composer/model-compatibility.ts:90). Token counts are estimates from a shared router package. Plan limits are enforced server side for managed Cloud.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Limit and billing views need a signed-in account and, on mobile, Cloud mode. The model switch warning works without extra account checks. |
| Permissions | Billing actions need the account's billing owner; workspace and organization billing ('By your organization') is shown read-only on mobile (apps/mobile/src/features/settings/cloud-billing/index.tsx:381). |
| Subscription | Paid acquisition gated by waitlist (doc: docs/product/commercial.md:24). Models can be locked by plan in the picker (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1523). |
| Limits and metering | Reset time is shown only when the server supplies it; the card cannot invent one (apps/web/features/chat/components/InlinePaywallCard.tsx:89). Free-plan meter rule: memory note only; project doc not found. |
| Feature flags | AGI_BILLING_WAITLIST_OPEN, operator billing-upgrades flag, mobile FEATURES.billing. |
| Model compatibility | Findings: unknown_model, context_overflow, no_vision, no_tools, no_attachments (apps/web/features/chat/components/Composer/model-compatibility.ts:53). |
| Provider restrictions | Billing runs through an outside payment portal and, for mobile, store billing; mobile web links can be blocked (useWebBillingLinksAllowed, apps/mobile/src/features/settings/cloud-billing/index.tsx:136). |
| Local mode | Local models on mobile use an on-device context budget in the same chip (apps/mobile/src/features/chat/components/ContextDetailsSheet.tsx:117). Billing and plan screens say they apply once chat is set to Cloud. Local inference needs no subscription [per product context]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Unknown model | Finding exists but is not blocking; switch proceeds | apps/web/features/chat/components/Composer/ComposerFooter.tsx:1182 |
| Auto model | No findings returned | apps/web/features/chat/components/Composer/model-compatibility.ts:149 |
| Plan check loading or failed (mobile) | 'Checking your plan…' or 'We couldn't read your plan just now. Your subscription has not changed.' with Try again | apps/mobile/src/features/settings/cloud-billing/index.tsx:157 |
| Waitlist closed | 403 with waitlist code and message | apps/web/lib/server/billing-waitlist-access.ts:56 |
| Cancellation disabled in portal | 409-style message to open Manage billing or contact support | apps/web/app/api/portal/route.ts:407 |
| Free capacity pool busy | Card 'No free capacity right now' with countdown and Try again | apps/web/features/chat/components/InlinePaywallCard.tsx:277 |
| Accessibility | Notice uses role=status; mobile chip role alert | apps/web/features/chat/components/Composer/ModelCompatibilityNotice.tsx:23, apps/mobile/src/features/chat/components/ContextWarningChip.tsx:36 |
| Offline | not handled in the code for these notices [inferred] | no offline branch seen in model-compatibility.ts, InlinePaywallCard.tsx or ContextWarningChip.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/model-compatibility.test.ts`: Inferred from name: compatibility findings
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.model-compatibility.test.ts`: Inferred from name: server side model compatibility
- `apps/web/features/chat/components/__tests__/InlinePaywallCard.test.tsx`: Inferred from name: paywall card
- `apps/web/features/chat/components/__tests__/InlinePaywallCard.freeLimit.test.tsx`: Inferred from name: free limit card
- `apps/web/features/chat/components/dialogs/UpgradePlanDialog.test.tsx`: Inferred from name: upgrade dialog
- `apps/web/features/settings/sections/__tests__/BillingSection.test.tsx`: Inferred from name: billing section
- `apps/web/lib/server/__tests__/billing-waitlist-access.test.ts`: Inferred from name: waitlist gate
- `apps/mobile/__tests__/PaywallBottomSheet.test.tsx`: Inferred from name: mobile paywall sheet

**Test scenarios**

- **Switch with images**
  1. Attach an image
  2. Open the model picker
  3. Choose a model without vision
  - Expected: Banner 'Switch to <model>?' states images will be ignored; Keep leaves the model unchanged
- **Context notice**
  1. Fill a mobile chat past 70 percent of the window
  - Expected: Context warning chip appears and its sheet offers a new chat
- **Waitlist gate**
  1. With the waitlist closed, choose a paid plan in the upgrade dialog
  - Expected: Dialog offers join waitlist or enter access code; no checkout opens
- **Cancel plan**
  1. On a paid web account open Settings, Billing
  2. Choose Cancel plan
  - Expected: Portal cancel flow opens; afterwards Billing shows that access ends
- **Free limit**
  1. Use a Free account until the limit
  2. Read the card
  - Expected: Headline, reset time if known, Upgrade or switch options, no usage meter

**Where to look when it fails**

- API refusal code for waitlist (WAITLIST_ACCESS_REQUIRED_CODE)
- Portal error 'cancellation_unavailable'
- Log 'Portal configuration has cancellation disabled; cannot deep-link cancel' (apps/web/app/api/portal/route.ts:410)

**Hands-on test plans**

- Web: [70-qa/test-plans/web/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/web/010-modal-and-dialog-inventory.md)
- Desktop: [70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/desktop/010-modal-and-dialog-inventory.md)
- Mobile: [70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/mobile/010-modal-and-dialog-inventory.md)
- CLI: [70-qa/test-plans/cli/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/cli/010-modal-and-dialog-inventory.md)
- VS Code: [70-qa/test-plans/vscode/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/vscode/010-modal-and-dialog-inventory.md)
- Chrome: [70-qa/test-plans/chrome/010-modal-and-dialog-inventory.md](../../70-qa/test-plans/chrome/010-modal-and-dialog-inventory.md)

## 10. Gaps and dependencies

- **Web context warning has no trim, compact or new-chat actions** Affects: Web and Electron. Evidence: apps/web/features/chat/components/Composer/model-compatibility.ts:183. Work needed: Add actions to the notice
- **No model-switch compatibility warning on mobile, CLI, Chrome** Affects: Those apps. Evidence: Not found in apps/mobile chat, apps/cli src, apps/extension. Work needed: Add per-surface check using the shared catalog
- **CLI has no plan usage-limit notice with reset time found** Affects: CLI. Evidence: apps/cli/src/errors.rs:604 handles provider rate limits only. Work needed: Confirm or add managed limit message
- **Cancel and card change are not in-app dialogs** Affects: Web, desktop, mobile. Evidence: apps/web/features/settings/sections/BillingSection.tsx:327. Work needed: Decide if the portal hand-off is acceptable; add own confirmation naming the end date
- **Purchase held by waitlist; mobile billing off** Affects: All apps. Evidence: doc: docs/product/commercial.md:24; apps/mobile/lib/v1FeatureFlags.ts:6. Work needed: Owner decision to open
- **Free-plan 'no meter' rule is not in project docs; VS Code renders a meter list** Affects: VS Code, Free users. Evidence: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3154. Work needed: Check the VS Code meter against the rule

**Depends on**

- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-local-inference
- SYS-execution-boundaries
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:cloud
- api:POST /api/portal
- api:POST /api/checkout
- table:beta_redemptions

## Unknown

- Exact server code that emits the usage-limit refusal (apps/web/lib/services/managed-usage-request-service.ts was cited by the brief and not opened)
- Credit top-up dialog: not opened; brief cites apps/web/lib/server/mobile-iap-catalog.ts and mobile billing only
- VS Code and CLI context-warning threshold notices were not found
- Whether the desktop Tauri billing UI is shipped
- Project document for the Free no-meter rule
