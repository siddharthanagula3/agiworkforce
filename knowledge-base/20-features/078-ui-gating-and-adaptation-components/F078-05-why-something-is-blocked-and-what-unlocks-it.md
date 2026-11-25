---
id: "F078-05"
type: "feature"
title: "Why something is blocked, and what unlocks it"
aliases: ["Upgrade explanation", "Use-another-model explanation", "Paywall sheet", "Denial reasons", "Unsupported vs temporarily unavailable", "Plan excludes model", "Usage limit message"]
area: "78 UI gating and adaptation components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S78.16", "S78.19", "S78.22"]
depends_on: ["F078-01", "F078-03", "SYS-subscriptions-entitlements-and-usage", "SYS-api-and-contracts", "SYS-model-catalog-and-routing", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "api:POST /api/llm/v1/chat/completions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F078-05 Why something is blocked, and what unlocks it

When something is blocked, the app says why in plain words and names the fix: a plan that unlocks it, another model, or try again later. Permanent and temporary causes use different wording. Server refusals carry a fixed code and message; each app turns them into its own screen or text.

Area: [78. UI gating and adaptation components](README.md). Requirement items: [S78.16](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7816), [S78.19](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7819), [S78.22](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7822).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | not stated on this page | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Maps a block to a typed reason (unsupported by surface, requires upgrade, temporarily unavailable, quota exceeded and others) with title, message and suggestion, then shows it with a next step.

**Why it exists.** A plan limit shown as an outage reads as a broken feature, and an outage shown as a plan limit sends people to pay for nothing (apps/mobile/src/lib/Capabilities.tsx:138-142).

**Who uses it.** Anyone who hits a block; support reading the code.

**Problems it solves**

- Vague 'something went wrong' on a gated request.
- Wrong remedy offered.
- Different explanation on each app for the same block.

**Use cases**

- A Free user selects a model above the plan and the server names the required plan.
- An image request with a reference image on an image model that cannot edit names models that can.
- The CLI says 'Your <plan> plan does not include <model>' and suggests another model.
- VS Code shows 'Upgrade to <plan> to continue.' with Upgrade, View usage, Add credits actions.

## 2. User experience

**Where to find it**

- Web and Desktop: banner above the composer and error text on a blocked send (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5405-5480).
- Mobile: PaywallBottomSheet titled 'Upgrade to <plan>' or 'Not included in your plan' (apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx:118-126); image generation alerts (apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:150-160).
- CLI: error text and hint lines on a failed turn (apps/cli/src/errors.rs:397-420, 600-690).
- VS Code: error presentation in the sidebar and notification actions (apps/extension-vscode/src/core/cloudUtilityErrorActions.ts:55-100; apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts).
- Chrome: side-panel quota recovery buttons (apps/extension/src/side_panel.ts:725-748).

**Before you start**

- A blocked action.

**Screens and controls**

- Mobile sheet with feature label list such as 'Video generation', 'Deep research', 'Web search', 'This model' (PaywallBottomSheet.tsx:25-37).
- VS Code action labels 'Add credits', 'Upgrade', 'View usage', 'Contact support' (cloudUtilityErrorActions.ts:57-62).
- CLI hints that name `agi plans`, `--model`, `agi login`, `agi usage` (errors.rs:628-668).

**Journey**

1. 1. Person sends a request or opens a gated feature.
2. 2. The server or the app finds the block and returns a code.
3. 3. The app picks the wording for the reason: permanent, plan, or temporary.
4. 4. The app shows the message with a button or command.
5. 5. Person upgrades, picks another model, or waits.

**What the person sees and gets**

- Server: 'Model <id> is on the <Plan> plan, not yours. Choose a model your plan includes.' code model_not_available (request-processor.ts:5342-5345).
- Server: 'Deep Research is available on <plans> plans. Upgrade your plan to use it.' code plan_upgrade_required (request-processor.ts:1514-1516).
- Mobile temporary: '<Feature> is unavailable right now' with 'It’s paused while we fix an issue and will come back without an update.' (apps/mobile/src/lib/Capabilities.tsx:156-171).
- CLI: 'Your <plan> plan does not include '<model>', and no provider key for it is set.' (errors.rs:397-402).

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- A shared catalog of denial reasons gives each a title, message and suggestion, for example 'Not available here', 'Not on your plan', 'Unavailable right now' (packages/contracts/types/src/reason-codes.ts:197-206, 274-283, 354-363).
- Mobile separates a plan lock from an operator pause and from a surface limit, and drops the purchase wording when native purchases are off (apps/mobile/src/lib/Capabilities.tsx:144-180).
- Mobile paywall names the plan to upgrade to, or says 'Not included in your plan' when purchases are off, and sends Team or Enterprise to sales (PaywallBottomSheet.tsx:106-126).
- Mobile image resolver blocks and names models that can edit a reference image (resolveMobileImageGenerationRequest.ts:150-160, 213-225).
- Server model_not_available names the plan and requiredTier; plan_upgrade_required lists required plans; unsupported_parameter names the parameter (request-processor.ts:1514-1518, 3197-3211, 5342-5345).
- Web banners say 'Switch to Auto, choose an image-capable model, or remove the image' and for free models 'Use Free Auto' (ChatComposerNew.tsx:5415-5419, 5445-5448).
- CLI errors have typed kinds and hints naming a plan or alternative model (errors.rs:512-523, 628-668, 695-720); plan_alternative picks a model the plan includes (errors.rs:677-688).
- VS Code classifies failures into paywall, usage-limit, local-model, account-auth and retryable and picks matching actions (cloudUtilityErrorActions.ts:69-86).
- Web catalogue uses 'Temporarily unavailable' vs 'Not available in this app' (ModelCatalogue.tsx:41-42).

**Incomplete**

- Wording is produced separately per app; the server returns codes and messages but apps do not all show the server string.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Chrome and Desktop-specific copy beyond the files named was not read.

## 4. Required behaviour

**Established requirements**

- The surface tells apart an unsupported feature from a temporarily unavailable one. (source: brief S78.16)
- When a plan blocks something, the user is told which plan unlocks it and how to upgrade. (source: brief S78.19)
- When the selected model cannot do the task, the user is told to use another model, ideally which. (source: brief S78.22)
- Server refusal messages are fixed strings so every surface shows the same reason. (source: brief S78.19 draft use text; partly matched by reason-codes.ts catalog)
- No subscription sales on any surface before 2027-01-01. (source: doc: project memory owner decision; mobile code switches wording with NATIVE_PURCHASES_AVAILABLE (service.ts:65-72))

**Acceptance criteria**

1. A plan-excluded model request returns a message naming the required plan.
2. A temporarily unavailable model shows different wording from a plan-locked one.
3. An image request that needs edit support on a model that cannot edit names at least one capable model.
4. The CLI error for a plan-excluded model names the plan and offers a model the plan includes.
5. With native purchases off, the mobile sheet does not say 'Upgrade' as a purchase button.
6. The usage-limit message states when it resets or how to find out.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Fixed strings come from the reason catalog for capabilities, but model_not_available and CLI texts are separate strings [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Send the server's reason code with every refusal and let each app look up shared wording from reason-codes.ts.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | Denial reason catalog | `packages/contracts/types/src/reason-codes.ts` | Reasons, titles, messages, suggestions, error codes, http status. |
| service | Server refusals | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | model_not_available, plan_upgrade_required, unsupported_parameter, model policy refusals. |
| component | ChatComposerNew banners | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Attachment and tool conflict banners with Use Auto. |
| component | PaywallBottomSheet | `apps/mobile/src/features/chat/components/PaywallBottomSheet.tsx` | Mobile upgrade sheet. |
| service | Capability denial copy (mobile) | `apps/mobile/src/lib/Capabilities.tsx` | unavailableCopy and purchase remedy reasons. |
| service | resolveMobileImageGenerationRequest | `apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts` | Names another model for image edit. |
| service | CLI errors | `apps/cli/src/errors.rs` | CliError kinds, text and hints. |
| service | VS Code cloudUtilityErrorActions | `apps/extension-vscode/src/core/cloudUtilityErrorActions.ts` | Classify failure and offer recovery actions. |
| service | VS Code errorPresentation | `apps/extension-vscode/src/features/sidebar-webview/errorPresentation.ts` | Sidebar error wording and retry-after text. |
| service | VS Code API errors | `apps/extension-vscode/src/utils/api.ts` | Paywall and usage limit error classes, recovery actions. |
| component | Chrome side panel | `apps/extension/src/side_panel.ts` | Quota recovery label and upgrade-to-plan label. |
| component | Web ModelCatalogue | `apps/web/features/chat/components/Composer/ModelCatalogue.tsx` | Temporarily unavailable vs not offered tags. |
| test | PaywallBottomSheet test | `apps/mobile/__tests__/PaywallBottomSheet.test.tsx` | Covers the sheet. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server evaluates plan, policy, parameters and returns a JSON error with code and message. | our servers | request-processor.ts:5330-5351, 3197-3211 |
| App classifies the error by code or type. | device | cloudUtilityErrorActions.ts:69-86; errors.rs:512-523 |
| App picks wording and actions and shows them. | device | PaywallBottomSheet.tsx:106-126; errors.rs:628-668 |
| Upgrade action opens the pricing or billing page in a browser. | outside service | errors.rs:413-417 pricing URL with from=cli-paywall; cloudUtilityErrorActions.ts:76-80 webUri |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Request id shown as a reference | Shown in the message; server logs | Server side | unknown (errorPresentation.ts:359-362 appends a reference) |

**Models and providers.** Alternative-model suggestions come from the plan's allowed models and the model registry (errors.rs:677-688; resolveMobileImageGenerationRequest.ts:177-181). No provider name is hard coded in the message.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-out state has its own wording: CLI AccountSignedOut, VS Code account-auth (errors.rs:394-396; cloudUtilityErrorActions.ts:73). |
| Permissions | none found in the code. |
| Subscription | Messages name the plan from the pricing table (request-processor.ts:5336). |
| Limits and metering | Usage-limit hints state the reset time or send the person to usage (errors.rs:695-720). |
| Feature flags | Purchase wording on mobile follows NATIVE_PURCHASES_AVAILABLE (PaywallBottomSheet.tsx:117-126). |
| Model compatibility | Image edit support is read from the registry (resolveMobileImageGenerationRequest.ts:177-181). |
| Provider restrictions | Workspace policy refusals use the policy's own reason text (request-processor.ts:2965-2975). |
| Local mode | A selected local model in VS Code is its own failure kind 'local-model' (cloudUtilityErrorActions.ts:70). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Temporarily unavailable | Different title and body from a plan lock; retry later | reason-codes.ts:354-363; Capabilities.tsx:156-171 |
| Unsupported by this app | 'Open the web app, where this is available.' | reason-codes.ts:197-206 |
| Policy store unreadable | 503 with Retry-After 30 | model-policy-gate.ts:21-33 |
| Retry after seconds | Shown as about N seconds, minutes, hours | errorPresentation.ts:340-347 |
| Unsafe recovery link | Only https or localhost links without credentials are used | errorPresentation.ts:364-375 |
| Terminal text with escape characters | Sanitized by remote_text | errors.rs:344-352, 438 |
| Accessibility | Mobile sheet has hardware back dismiss | PaywallBottomSheet.tsx:103-104 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/PaywallBottomSheet.test.tsx`: Mobile paywall sheet.
- `apps/extension-vscode/src/__tests__/cloudUtilityErrorActions.test.ts`: VS Code failure classes and actions.
- `apps/extension-vscode/src/__tests__/errorPresentation.webview.test.ts`: VS Code error wording in the webview.
- `apps/mobile/src/lib/Capabilities.test.tsx`: Capability denial reasons on mobile.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.fast-mode-gate.test.ts`: One server gate refusal.

**Test scenarios**

- **Plan excludes model**
  1. Request a model above the plan from the API.
  - Expected: 403, code model_not_available, message names the plan.
- **Operator pause**
  1. Switch a capability off with the remote switch.
  2. Open the feature on mobile.
  - Expected: '<Feature> is unavailable right now' and the 'paused while we fix an issue' body, no upgrade button.
- **Image edit on wrong model**
  1. Attach a reference image on mobile.
  2. Choose an image model without edit support.
  3. Send.
  - Expected: Alert names models that can edit; no request is made.
- **CLI plan error**
  1. Run the CLI with --model for a model outside the plan and no own key.
  - Expected: Error text names the plan and the hint suggests another model and 'agi plans'.
- **Usage limit in VS Code**
  1. Hit the usage limit in the extension.
  - Expected: Message with reset time and actions Upgrade or View usage.

**Where to look when it fails**

- JSON error.code values; CLI kind field in --json output (errors.rs:512-523); request reference id appended by withFailureReference.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/web/078-ui-gating-and-adaptation-components.md)
- Desktop: [70-qa/test-plans/desktop/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/desktop/078-ui-gating-and-adaptation-components.md)
- Mobile: [70-qa/test-plans/mobile/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/mobile/078-ui-gating-and-adaptation-components.md)
- CLI: [70-qa/test-plans/cli/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/cli/078-ui-gating-and-adaptation-components.md)
- VS Code: [70-qa/test-plans/vscode/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/vscode/078-ui-gating-and-adaptation-components.md)
- Chrome: [70-qa/test-plans/chrome/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/chrome/078-ui-gating-and-adaptation-components.md)

## 10. Gaps and dependencies

- **No single shared wording across server, web, CLI, VS Code and mobile; each app has its own text for the same plan block.** Affects: All six apps. Evidence: request-processor.ts:5342; errors.rs:397-402; cloudUtilityErrorActions.ts:84-88; PaywallBottomSheet.tsx:110-126. Work needed: Choose reason-codes.ts as the owner and have apps look up wording from it.
- **Chrome and Desktop-specific wording not verified.** Affects: Chrome, Desktop. Evidence: brief S78.19 only. Work needed: Read and test.
- **Brief says server returns fixed strings; some server refusals build their message from the model id and plan label.** Affects: API callers. Evidence: request-processor.ts:5342. Work needed: Clarify the requirement.

**Depends on**

- F078-01
- F078-03
- SYS-subscriptions-entitlements-and-usage
- SYS-api-and-contracts
- SYS-model-catalog-and-routing
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- api:POST /api/llm/v1/chat/completions

## Unknown

- Exact Chrome text for gated features.
- Whether Desktop adds native wording over the hosted web page.
- Where the temporary vs unsupported distinction shows on VS Code and Chrome pickers.
- How long request reference ids are kept.
