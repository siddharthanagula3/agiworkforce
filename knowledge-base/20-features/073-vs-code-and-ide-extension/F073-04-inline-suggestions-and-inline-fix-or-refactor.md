---
id: "F073-04"
type: "feature"
title: "Inline suggestions and inline fix or refactor"
aliases: ["Inline completions", "Ghost text suggestions", "Fix", "Refactor", "Inline edit", "runInlineCommand", "S73.11", "S73.12"]
area: "73 VS Code and IDE extension"
available_on: ["vscode"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "built", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S73.11", "S73.12"]
depends_on: ["surface:vscode", "mode:cloud", "mode:local", "SYS-inference-providers", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-security-and-privacy", "SYS-execution-boundaries", "F073-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F073-04 Inline suggestions and inline fix or refactor

In the VS Code extension, grey ghost-text code suggestions appear while typing (off by default, needs an AGI sign-in or key and an AGI Cloud model). Fix and Refactor on selected code ask AGI Cloud for a rewrite and apply it in place or open it in a tab. Local models are refused for suggestions.

Area: [73. VS Code and IDE extension](README.md). Requirement items: [S73.11](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7311), [S73.12](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7312).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Two related editor helpers. Inline suggestions send nearby code to AGI Cloud and show the answer as ghost text. Fix and Refactor take selected code, ask a model for a replacement and replace the selection if the file is unchanged and trusted.

**Why it exists.** Developers expect completion while typing and one-step rewrite of a selection (brief S73.11, S73.12).

**Who uses it.** Developers who turn the setting on and sign in; anyone using the Fix and Refactor menu items.

**Problems it solves**

- Typing boilerplate.
- Cleaning or fixing a block without leaving the file.

**Use cases**

- Accept a suggestion for the next line.
- Select a buggy function and choose Fix.
- Select code and choose Refactor, then pick 'Apply inline' or 'View in new tab'.
- Work in a repo that opts out of completions.

## 2. User experience

**Where to find it**

- VS Code settings: 'agiWorkforce.inlineCompletions.enabled' (apps/extension-vscode/package.json:1369-1377).
- VS Code editor right-click menu (shown when text is selected): Explain, Fix, Refactor, Generate Tests, Docs, Code Review (package.json:980-1008).
- VS Code command palette: commands agi-workforce.fix and agi-workforce.refactor (package.json:142-150).

**Before you start**

- For suggestions: setting turned on in user settings, a first-run notice acknowledged, a browser sign-in or AGI API key, a trusted workspace, a saved file on disk, and a default model that is an AGI Cloud model.
- For Fix and Refactor: a non-empty selection and an AGI Cloud default model (runInlineCommand.ts:43-60, 100-110).

**Screens and controls**

- First-run notice with 'Got it' (apps/extension-vscode/src/features/inline-completions/firstRunNotice.ts:17-37).
- Info message 'Apply inline' or 'View in new tab' after a rewrite (applyEdit.ts:76-95).
- Notification progress 'Fix…' with cancel (runInlineCommand.ts:128-134).
- Notice 'Inline completions paused' with actions after limits or auth failures (inlineCompletionProvider.ts:337-344).

**Journey**

1. Turn on agiWorkforce.inlineCompletions.enabled.
2. Read and dismiss the first-run notice; the provider starts after it.
3. If no credential, a message points to the account page (advancedFeatures.ts:22-34).
4. Type three or more characters; after the debounce a grey suggestion appears.
5. Accept it with the editor's accept-suggestion key (binding not defined by this extension; unknown).
6. For Fix or Refactor: select code, run the command, wait for the progress, choose Apply inline or View in new tab.

**What the person sees and gets**

- Ghost text.
- Progress notification.
- Warning when apply fails: 'applyFailed' text and the result opened in a tab (applyEdit.ts:90-92).
- Pause notice.

**Settings**

- agiWorkforce.inlineCompletions.enabled, debounceMs (default 300, 50-2000), maxLength (default 500, 50-5000) (package.json:1369-1397).
- agiWorkforce.optOut.inlineCompletions (package.json:1378-1383).
- agiWorkforce.autoApplyFixes and optOut.autoApplyFixes (package.json:1357-1368).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Provider registered for file-scheme documents only after the setting is on and the notice was shown (apps/extension-vscode/src/core/providerSetup.ts:79-107).
- Provider skips untitled, non-file, sensitive or secret-named, credential-path, excluded and outbound-refused documents (inlineCompletionProvider.ts:179-189).
- Local default model returns no suggestion and shows a one-time notice (inlineCompletionProvider.ts:190-199).
- Needs at least 3 typed characters on the line and a harmless remainder after cursor (inlineCompletionProvider.ts:29, 206-212).
- Sends at most 80 lines before and 20 after, and 6000 characters before (inlineCompletionProvider.ts:30-35, 52-80).
- Debounce, small LRU cache (16 entries, 15 s) and cancellation (inlineCompletionProvider.ts:36-37, 217-261).
- Limit, service-unavailable and auth failures pause suggestions for a time and show one notice (inlineCompletionProvider.ts:309-334).
- Fix and Refactor apply through applyLlmEdit, which refuses when untrusted, closed, or the document version changed, and then opens the result in a new tab (apps/extension-vscode/src/platform/applyEdit.ts:42-73).
- With a Local default model, Fix and Refactor do not edit in place; they send a prompt to the chat instead (apps/extension-vscode/src/core/runInlineCommand.ts:100-110).
- Plan mode asks before running (runInlineCommand.ts:112-123).

**Incomplete**

- Accepting with Tab is the editor's standard but not confirmed in this extension's keybindings (package.json:1485-1580 has none for suggestions).

**Present but disconnected or switched off**

- Inline suggestions are off by default (package.json:1369-1371).
- autoApplyFixes defaults to false and applies only to fix, not refactor (runInlineCommand.ts:176).

**Not available**

- Not in other apps; n/a in the brief.
- No on-device completions: Local model is refused (inlineCompletionProvider.ts:190-199).

## 4. Required behaviour

**Established requirements**

- Ghost-text inline code suggestions appear while typing and can be accepted with Tab. (source: S73.11)
- Selecting code and running Fix or Refactor rewrites that code in place in the editor. (source: S73.12)
- Local inference on desktop and mobile is free of paid subscription; execution boundaries are explicit. (source: Product context in the task and doc: AGENTS.md section 6)

**Acceptance criteria**

1. With the setting off no request is sent.
2. With it on and no credential, a message with an account button appears.
3. Typing in a .env file gives no suggestion.
4. With a Local default model, one notice appears and no suggestion is made.
5. Fix on a selection offers Apply inline; after the file is edited elsewhere, apply is refused and a tab opens.
6. In an untrusted workspace Fix does not edit the file.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Suggestions are Cloud only today, so they are not free for Local-only users [inferred from inlineCompletionProvider.ts:190-199].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer on-device completions through the local runtime so Local users get suggestions without Cloud.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | AgiInlineCompletionProvider | `apps/extension-vscode/src/features/inline-completions/inlineCompletionProvider.ts` | Builds the prompt, debounces, caches and returns ghost text. |
| service | inline completions registration | `apps/extension-vscode/src/core/providerSetup.ts` | Registers the provider when enabled and disclosed (lines 79-107). |
| service | firstRunNotice | `apps/extension-vscode/src/features/inline-completions/firstRunNotice.ts` | Discloses what is sent and stores that it was shown. |
| service | validateAdvancedFeatureFlags | `apps/extension-vscode/src/core/advancedFeatures.ts` | Warns when the feature is on without a credential. |
| service | runInlineCommand | `apps/extension-vscode/src/core/runInlineCommand.ts` | Fix, Refactor, tests, docs flow. |
| service | applyLlmEdit | `apps/extension-vscode/src/platform/applyEdit.ts` | Safe replacement with trust and version checks. |
| service | cloudModelBoundary | `apps/extension-vscode/src/core/cloudModelBoundary.ts` | cloudUtilityModel decides Cloud or Local route (lines 15-18). |
| service | chatCompletion | `apps/extension-vscode/src/utils/api.ts` | Sends the request to the AGI API at /chat/completions (line 1115) with the account or key bearer. |
| service | outboundContentGuard | `apps/extension-vscode/src/core/outboundContentGuard.ts` | describeOutboundRefusal blocks sensitive content. |
| service | cloudUtilityErrorActions | `apps/extension-vscode/src/core/cloudUtilityErrorActions.ts` | Errors, local refusal and reset time actions. |
| command | agi-workforce.fix / refactor | `apps/extension-vscode/src/core/commandSetup.ts` | Command handlers (lines 1149-1155). |
| config | menus and settings | `apps/extension-vscode/package.json` | Right-click menu and inline settings (lines 980-1010, 1357-1397). |
| test | inlineCompletionProvider test | `apps/extension-vscode/src/__tests__/inlineCompletionProvider.test.ts` | Provider behaviour. |
| test | applyEdit test | `apps/extension-vscode/src/__tests__/applyEdit.test.ts` | Code block extraction and apply. |
| test | inlineEditSafety test | `apps/extension-vscode/src/__tests__/inlineEditSafety.test.ts` | Safe inline edits. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person pauses typing; VS Code asks the provider. | device | inlineCompletionProvider.ts:173-212 |
| Provider checks file type, secret names, exclusions, model route. | device | inlineCompletionProvider.ts:185-199 |
| Up to 100 nearby lines are sent in a chat completion request to the AGI API. | our servers | inlineCompletionProvider.ts:273-296; api.ts:1115 |
| AGI Cloud routes the request to a model; which model and provider is not decided here. | our servers | api.ts:1203-1239 (overrideModel optional). Server routing not opened. |
| Reply is cut to a continuation and shown as ghost text. | device | inlineCompletionProvider.ts:142-154, 302-308 |
| Fix or Refactor sends selected text, receives Markdown, extracts a code block and replaces the selection after checks. | device and our servers | runInlineCommand.ts:125-176; applyEdit.ts:42-65 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Surrounding code | Not stored by the extension; sent to AGI Cloud. | Sent to our servers. | Server retention unknown. |
| Completion cache | Memory, 16 entries for 15 s. | No. | Cleared on dispose (inlineCompletionProvider.ts:346-353). |
| First-run notice flag | Extension global state key inlineCompletions.firstRunNoticeShown. | No. | Persists in the profile. |

**Models and providers.** The extension sends no model name for completions; the Cloud API picks it (api.ts:1203-1209 shows an optional override that the provider leaves unset).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Browser sign-in or AGI API key needed (advancedFeatures.ts:22-34). |
| Permissions | Trusted workspace; setting turn-on only from user settings (package.json:1369-1376). |
| Subscription | Usage-limit, paywall and policy errors pause the feature (inlineCompletionProvider.ts:82-88, 309-334). Which plans include it: none found in the code opened. |
| Limits and metering | Calls use 'deferred' billing and a single attempt (inlineCompletionProvider.ts:289-296). Pause 15 minutes or until the limit reset time (lines 38, 310-322). |
| Feature flags | agiWorkforce.inlineCompletions.enabled and optOut. |
| Model compatibility | Only models in the AGI Cloud picker; others count as Local (cloudModelBoundary.ts:15-18). |
| Provider restrictions | Cloud only; own-key mode is not used for completions in the code opened [inferred]. |
| Local mode | Suggestions refused with a one-time notice; Fix and Refactor are redirected to the chat running on the local model. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Debounce then request; progress notification for Fix and Refactor. | inlineCompletionProvider.ts:226-261; runInlineCommand.ts:128-134 |
| Empty | Blank answer returns no suggestion. | inlineCompletionProvider.ts:303-305 |
| Error | Silent for most errors; notice for limit or auth. | inlineCompletionProvider.ts:309-334 |
| Retry | Fix and Refactor failure dialog offers retry if the file is unchanged. | runInlineCommand.ts:195-206 |
| Cancel | Typing again or cancel token stops the request. | inlineCompletionProvider.ts:248-261 |
| Offline | Not specially handled; treated as an error with no suggestion. | inlineCompletionProvider.ts:333 |
| Key change | Pause is cleared when secrets change. | inlineCompletionProvider.ts:167-170 |
| Service unavailable (503) | Pause for retry-after up to 15 minutes. | inlineCompletionProvider.ts:90-93 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/inlineCompletionProvider.test.ts`: Local model refusal with one notice, untrusted workspace, blank answers, fence unwrapping, spacing.
- `apps/extension-vscode/src/__tests__/applyEdit.test.ts`: Code block extraction and apply helper.
- `apps/extension-vscode/src/__tests__/inlineEditSafety.test.ts`: Edit safety.
- `apps/extension-vscode/src/__tests__/inlineCommandFailure.test.ts`: Fix and Refactor failure handling.
- `apps/extension-vscode/src/__tests__/advancedFeatures.test.ts`: Credential warning.
- `apps/extension-vscode/src/__tests__/cloudUtilityErrorActions.test.ts`: Error actions.

**Test scenarios**

- **Default off**
  1. Fresh profile.
  2. Type code.
  - Expected: No ghost text, no request.
- **Enable and sign in**
  1. Set the setting on.
  2. Close the notice.
  3. Sign in.
  4. Type 'const x ='.
  - Expected: A suggestion appears.
- **Secret file**
  1. Open .env.
  2. Type.
  - Expected: Nothing.
- **Local model**
  1. Pick an on-device model as default.
  2. Type.
  - Expected: One notice, no suggestions.
- **Fix stale**
  1. Select code, run Fix.
  2. Edit the file while it runs.
  - Expected: Apply refused and result opens in a tab.
- **Limit**
  1. Exhaust the plan limit.
  - Expected: Paused notice with actions.

**Where to look when it fails**

- Warnings via console.warn on provider init failure (providerSetup.ts:109-111).
- Pause state is in memory only (inlineCompletionProvider.ts:162).

**Hands-on test plans**

- VS Code: [70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md](../../70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md)

## 10. Gaps and dependencies

- **No on-device inline suggestions.** Affects: Local-only users on VS Code. Evidence: inlineCompletionProvider.ts:190-199. Work needed: Route completions through a local model.
- **Accept key not defined here.** Affects: Docs and testers. Evidence: package.json:1485-1580 has no inline-suggestion keybinding. Work needed: Confirm in a real editor and document.
- **Plan eligibility of inline suggestions is not stated in code opened.** Affects: Subscription rules. Evidence: No entitlement check in inlineCompletionProvider.ts. Work needed: Check the server route and record.

**Depends on**

- surface:vscode
- mode:cloud
- mode:local
- SYS-inference-providers
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-security-and-privacy
- SYS-execution-boundaries
- F073-05

## Unknown

- Which server route handles the completion request and which models serve it.
- Which plans include inline suggestions.
- The accept key binding.
- Server-side retention of the code sent.
