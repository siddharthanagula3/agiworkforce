---
id: "F013-06"
type: "feature"
title: "Length counter and context warning"
aliases: ["Character counter", "Length counter", "Context warning", "Context usage meter", "Chat is getting long", "Too long to send", "ctx bar", "S13.15"]
area: "13 Composer text interaction"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S13.15"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:local", "mode:own-key", "mode:cloud", "SYS-model-catalog-and-routing", "SYS-memory-projects-and-context", "SYS-api-and-contracts", "file:packages/contracts/cloud-contracts/src/conversations.ts", "F013-01", "F013-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F013-06 Length counter and context warning

Warns before a message or chat is too long. Web and Desktop show 'N / 100,000 characters' from 75,000 and turn red at the limit. Mobile shows a context warning chip for a long chat. The CLI shows a context bar and a notice at 85%. VS Code shows used tokens against the window. Chrome has none.

Area: [13. Composer text interaction](README.md). Requirement items: [S13.15](../../10-requirements/capabilities/013-composer-text-interaction.md#s1315).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows how close the draft (web) or the chat (mobile, CLI, VS Code) is to a length limit, before it fails.

**Why it exists.** A message over the limit is refused, and a chat past the model's window loses quality or fails. People need notice early. The brief asks for a character or token indicator where length matters.

**Who uses it.** People who write or paste long text and who run long chats.

**Problems it solves**

- Hitting a hard cap without warning.
- A chat quietly becoming too long for the model.

**Use cases**

- Type a very long draft on web and watch the counter appear at 75,000 characters.
- See a banner on the phone saying the chat is getting long and start a fresh chat.
- See the footer 'ctx' bar fill in the terminal and run /compact.
- See 'used / window' in the VS Code composer and a warning near 90%.

## 2. User experience

**Where to find it**

- Web and Desktop: bottom-right corner of the message box, text like '75,000 / 100,000 characters' and ' · limit reached' (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5919-5929).
- Mobile: a banner above the composer in a chat: 'Chat is getting long. Start a fresh chat for faster responses.' with a details sheet (apps/mobile/src/features/chat/components/ContextWarningChip.tsx:41-60; mounted in apps/mobile/app/(app)/chat/[id].tsx:2700).
- CLI: status bar 'ctx [bar] N%' ('catalog est.' in Local access) and a system line 'Context is N% full. /compact summarizes earlier turns to make room before the window runs out.' (apps/cli/src/tui/tui_app.rs:3515-3535, :8681-8690).
- VS Code: a small readout in the composer bar, 'used / window' (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3359, :4479-4505).
- Chrome: none found.

**Before you start**

- Web: draft of 75,000 characters or more.
- Mobile: the chat's estimated tokens reach the warning level of the model's window.
- CLI: none; the bar is always drawn.
- VS Code: a turn must have reported its tokens (apps/extension-vscode/src/__tests__/contextUsage.webview.test.ts:82).

**Screens and controls**

- Web counter text with role status and an aria link from the box (ChatComposerNew.tsx:5899, :5919).
- Mobile chip: tap to view what is in context; button to start a fresh chat (ContextWarningChip.tsx:48-75).
- CLI footer bar, narrowing to a percentage on small terminals (tui_app.rs:3522-3536).
- VS Code readout with tooltip text and an announcement for screen readers (webviewContent.ts:4463, :4496-4503).

**Journey**

1. 1. Keep typing (web) or keep chatting (mobile, CLI, VS Code).
2. 2. The indicator appears at its threshold.
3. 3. Web: at 100,000 the counter turns red and typing stops growing the text.
4. 4. Mobile: tap the chip, review, or start a new chat.
5. 5. CLI: run /compact when the notice appears.

**What the person sees and gets**

- Web red counter with 'limit reached'.
- Mobile warning colours and alert role (ContextWarningChip.tsx:36-39).
- VS Code classes is-high from 75% and is-critical at the warning percent, default 90 (webviewContent.ts:4495-4499; apps/extension-vscode/src/platform/config.ts:25).
- VS Code over-limit send: 'Too long to send (N / 100,000 characters)' (webviewContent.ts:5682-5689, :5760-5763).

**Settings**

- VS Code context.warningPercent (apps/extension-vscode/src/platform/config.ts:294-300).
- Others: none found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: threshold is 75% of the cap (ChatComposerNew.tsx:296); counter shows when message length reaches it and turns red at the cap (:4761-4762, :5919-5929). The textarea and editor both carry maxLength (ComposerInput.tsx:153, :214); the editor filter refuses growth past the limit (extensions/max-length.ts:21-30).
- Web cap equals the cloud message cap constant (conversations.ts:19; ChatComposerNew.tsx:294).
- Mobile: computeContextBudget uses the model's window (on-device model window for local models), warn at 70% and compact at 80% of it (apps/mobile/src/features/memory/services/contextBudgeter.ts:32, :87-100); the chip hides when status is ok (ContextWarningChip.tsx:25).
- CLI: context percent from session usage drives the footer bar and a one-time notice when a turn crosses 85% (tui_app.rs:1104-1114, :232, :8681-8690).
- VS Code: usage readout from measured tokens, hidden until reported, shows only tokens when the window is unknown (webviewContent.ts:4479-4492); send is refused above 100,000 characters (webviewMessages.ts:7; webviewContent.ts:5760).

**Incomplete**

- Mobile warns about the chat history, not the draft; no counter for the typed text was found (ContextWarningChip props: modelId and messages).
- The mobile chip is mounted only in the chat detail screen (apps/mobile/app/(app)/chat/[id].tsx:2700); a search of app and src for the component found no other mount.
- Web counts JavaScript string length; how the server counts is unknown.
- Web counter does not warn about the model's context window, only the message cap.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Chrome: no counter or warning found in apps/extension/src/side_panel.ts (searches for 'too long' and length constants returned nothing).
- CLI has no draft counter.

## 4. Required behaviour

**Established requirements**

- Where length matters, the composer shows a character or token or context indicator before sending (S13.15). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S13.15)
- Web: counter appears from 75,000 characters, reads N / 100,000 characters, turns red with 'limit reached' at the cap. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S13.15)
- Mobile shows a warning chip near the model's context budget; CLI status line shows context use. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S13.15)
- Handle long prompts without accidental sends. (source: doc: docs/product/competitive-guidance.md (section 5.3, item 17))

**Acceptance criteria**

1. Web: with 74,999 characters no counter; at 75,000 the counter shows '75,000 / 100,000 characters'.
2. Web: at 100,000 the counter is red and says 'limit reached'; more typing does not add text.
3. Mobile: a chat grown past the warning level shows the chip; tapping it opens the details sheet.
4. Mobile: a short chat shows no chip.
5. CLI: the footer shows 'ctx' with a percentage; crossing 85% in a turn adds the /compact notice once.
6. VS Code: after a turn the readout shows 'used / window' and changes class near 75% and at the warning percent.
7. VS Code: sending over 100,000 characters shows 'Too long to send'.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Chrome should warn before a send is refused for length [inferred from the brief's 'missing']; the Chrome limit itself is unknown.
- The cap should be the same on every app that talks to the same cloud contract [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a draft-length indicator to mobile and Chrome.
- [proposed] Show the model-window warning on web as well.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ChatComposerNew counter | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Cap (:294), threshold (:296), flags (:4761-4762), counter markup (:5919). |
| component | ComposerInput maxLength | `apps/web/features/chat/components/Composer/ComposerInput.tsx` | Passes maxLength to textarea (:153) and editor (:214). |
| hook | ComposerMaxLength | `packages/ui/unified-chat/src/composer-editor/extensions/max-length.ts` | Filters edits past the limit; programmatic writes bypass it. |
| config | cloud message limits | `packages/contracts/cloud-contracts/src/conversations.ts` | MANAGED_CLOUD_CHAT_MAX_MESSAGE_LENGTH (:19), latest-message cap helpers (:26-53). |
| component | ContextWarningChip | `apps/mobile/src/features/chat/components/ContextWarningChip.tsx` | Mobile warning banner with details and fresh-chat actions. |
| service | contextBudgeter | `apps/mobile/src/features/memory/services/contextBudgeter.ts` | Computes status ok, warn or compact from the model window and messages. |
| component | ContextDetailsSheet | `apps/mobile/src/features/chat/components/ContextDetailsSheet.tsx` | Sheet opened by the chip (imported at ContextWarningChip.tsx:11). |
| screen | mobile chat screen | `apps/mobile/app/(app)/chat/[id].tsx` | Mounts ContextWarningChip (:2700). |
| component | TUI status bar | `apps/cli/src/tui/tui_app.rs` | render_status_bar (:3467), ctx indicator (:3515-3536), context_percent (:1112), post-turn notice (:8681). |
| config | CONTEXT_WARNING_PERCENT | `apps/cli/src/tui/tui_app.rs` | CLI warning level 85 (:232). |
| component | VS Code context readout | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | contextUsage span (:3359), renderContextUsage (:4479), refuseOverLimit (:5684), sendMessage limit (:5760). |
| config | VS Code message cap | `apps/extension-vscode/src/protocol/webviewMessages.ts` | MAX_SEND_MESSAGE_CHARS 100,000 (:7). |
| config | VS Code warning percent | `apps/extension-vscode/src/platform/config.ts` | DEFAULT_CONTEXT_WARNING_PERCENT 90 (:25) and setting reader (:294). |
| test | VS Code context usage test | `apps/extension-vscode/src/__tests__/contextUsage.webview.test.ts` | Readout hidden until tokens, known window, warning, threshold change, unknown window, reset. |
| test | mobile context budgeting test | `apps/mobile/__tests__/context-budgeting.test.ts` | Budget computation (exact cases not read). |
| test | mobile details sheet test | `apps/mobile/__tests__/ContextDetailsSheet.test.tsx` | Details sheet (exact cases not read). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web reads the draft length on every render and compares it with 75,000 and 100,000. | device | ChatComposerNew.tsx:4761-4762 |
| Mobile estimates tokens from the chat messages and compares them with the selected model's window. | device | contextBudgeter.ts:80-110 |
| CLI computes context usage from the session and draws the footer bar; after a turn it may add a notice. | device | tui_app.rs:1104-1114, :8681-8690 |
| VS Code receives measured token counts from the extension host and renders them. | device | webviewContent.ts:7904-7912 |
| On send, the message is checked against the cap: web in the box, VS Code at send; the server contract is the final owner of the cap. | device and our servers | ChatComposerNew.tsx:294; webviewContent.ts:5760; server enforcement not read |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Token and character counts | In memory only | No | Discarded with the screen state |

**Models and providers.** Mobile, VS Code and CLI use the selected model's context window, so the warning depends on the chosen model; for on-device models the window comes from the local model entry (contextBudgeter.ts:32). Web counter ignores the model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code. |
| Permissions | none found in the code. |
| Subscription | none found for the indicator. Mobile reads the announced newest-message cap from the server (apps/mobile/src/features/chat/upload/messageLimits.ts), which can differ by route (conversations.ts:26-33). |
| Limits and metering | Web 100,000 characters (warning from 75,000). Cloud contract also keeps a stored-message cap of 1,000,000 (conversations.ts:20). Mobile warn 70% and compact 80% of the window. CLI 85%. VS Code default 90%. |
| Feature flags | VS Code context.warningPercent; others none found. |
| Model compatibility | Mobile, CLI and VS Code results depend on the model window; the estimate is approximate (CLI Local access label 'catalog est.', tui_app.rs:3517). |
| Provider restrictions | none found in the code. |
| Local mode | Works on device. Mobile uses the on-device model window in Local mode (contextBudgeter.ts:32, :103); CLI labels the figure an estimate in Local access (tui_app.rs:3517). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Below threshold | No indicator on web and mobile; CLI bar always shown; VS Code hidden until tokens reported. | ChatComposerNew.tsx:4761; ContextWarningChip.tsx:25; webviewContent.ts:4479-4481 |
| At cap (web) | Counter red with 'limit reached'; the box does not accept more. | ChatComposerNew.tsx:5923-5928; ComposerInput.tsx:153 |
| Unknown window (VS Code) | Shows only 'N tok'. | webviewContent.ts:4486-4491 |
| Narrow terminal | Bar shortens to a percentage. | tui_app.rs:3522-3536 |
| Counter and screen readers | Web counter has role status and the box points to it with aria-describedby; mobile chip has role alert; VS Code announces the limit. | ChatComposerNew.tsx:5899, :5921; ContextWarningChip.tsx:36-39; webviewContent.ts:4463 |
| Offline, timeout, retry | not handled in the code read. | searched the counter code (ChatComposerNew.tsx:4761-4762, :5919-5929) and ContextWarningChip.tsx; no offline, timeout or retry branch found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/contextUsage.webview.test.ts`: Readout hidden until tokens, known window, warning, threshold update, unknown window, reset.
- `apps/mobile/__tests__/context-budgeting.test.ts`: Mobile budget computation (title only read).
- `apps/mobile/__tests__/ContextDetailsSheet.test.tsx`: Details sheet (title only read).
- `packages/ui/unified-chat/src/composer-editor/__tests__/max-length.test.ts`: Rich-editor length filter.
- `apps/web/e2e/composer-editor-ime.spec.ts`: A composition is not truncated by the character cap check (:92).

**Test scenarios**

- **Web counter**
  1. Fill the box with 75,000 characters.
  2. Add more up to 100,000.
  - Expected: Counter appears, then turns red with 'limit reached'; typing stops growing.
- **Web cap with editor arm**
  1. Open /chat?composer=editor.
  2. Paste or type to the cap.
  - Expected: The editor refuses growth past the cap.
- **Mobile warning**
  1. Use a chat until the chip appears.
  2. Tap the chip.
  - Expected: Details sheet; the fresh-chat button starts a new chat.
- **CLI context**
  1. Run a long session.
  2. Watch the footer and the end of a turn.
  - Expected: Bar fills; a notice appears once at 85%.
- **VS Code usage**
  1. Send a turn.
  2. Read the composer readout.
  - Expected: 'used / window' appears.
- **VS Code over limit**
  1. Paste more than 100,000 characters (or type them).
  2. Press Send.
  - Expected: 'Too long to send (N / 100,000 characters)' and nothing is sent.

**Where to look when it fails**

- Web: element id composer-char-counter.
- VS Code: element id contextUsage and the follow-up status line.
- CLI: footer ctx indicator; /compact notice text.
- Mobile: testIDs context-warning-chip.content and context-warning-details.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/013-composer-text-interaction.md](../../70-qa/test-plans/web/013-composer-text-interaction.md)
- Desktop: [70-qa/test-plans/desktop/013-composer-text-interaction.md](../../70-qa/test-plans/desktop/013-composer-text-interaction.md)
- Mobile: [70-qa/test-plans/mobile/013-composer-text-interaction.md](../../70-qa/test-plans/mobile/013-composer-text-interaction.md)
- CLI: [70-qa/test-plans/cli/013-composer-text-interaction.md](../../70-qa/test-plans/cli/013-composer-text-interaction.md)
- VS Code: [70-qa/test-plans/vscode/013-composer-text-interaction.md](../../70-qa/test-plans/vscode/013-composer-text-interaction.md)

## 10. Gaps and dependencies

- **Chrome has no counter or warning.** Affects: Chrome extension users.. Evidence: apps/extension/src/side_panel.ts (no length constant or message found by search). Work needed: Decide the Chrome cap and add the indicator.
- **Mobile has no indicator for the typed draft.** Affects: Mobile users writing very long text.. Evidence: ContextWarningChip.tsx:14-20 props are chat messages only. Work needed: Add a draft counter near the cap.
- **No test found for the web counter, its thresholds or the red state.** Affects: Web and Desktop testers.. Evidence: no web test mentions 'limit reached' or composer-char-counter. Work needed: Add tests.
- **Server-side enforcement of the 100,000 cap was not read.** Affects: All apps.. Evidence: comment at ChatComposerNew.tsx:289-293 names the schema; schema not opened. Work needed: Read the contract and add a cross-check test.
- **Web counter ignores the model's context window.** Affects: Web users in long chats.. Evidence: ChatComposerNew.tsx:4761-4762. Work needed: Owner decision.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:local
- mode:own-key
- mode:cloud
- SYS-model-catalog-and-routing
- SYS-memory-projects-and-context
- SYS-api-and-contracts
- file:packages/contracts/cloud-contracts/src/conversations.ts
- F013-01
- F013-05

## Unknown

- How the server counts message length (characters versus code points).
- Whether any other mobile screen mounts the context warning chip.
- How VS Code tokens are measured (host side not read).
- The Chrome side-panel length limit, if any.
- Local-mode behaviour of the VS Code readout.
