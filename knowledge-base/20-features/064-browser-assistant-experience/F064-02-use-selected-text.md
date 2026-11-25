---
id: "F064-02"
type: "feature"
title: "Use selected text"
aliases: ["Use selected text", "Selected-text context (S64.02)", "Add selected text", "Ask AGI about \"%s\"", "Explain this", "Translate this", "Send selected text to a local app…", "Send selected context?", "browser selection handoff", "context handoff", "Share with AGI (iOS)"]
area: "64 Browser-assistant experience"
available_on: ["desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "n/a", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "n/a", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S64.02"]
depends_on: ["surface:chrome", "surface:desktop", "surface:vscode", "surface:cli", "surface:mobile", "mode:cloud", "file:packages/contracts/types/src/context-handoff-uri.ts", "file:apps/desktop/electron/browser/bridgeServer.ts", "store:chrome.storage.session", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "F064-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F064-02 Use selected text

Text the person highlights on a web page becomes context for a question. In Chrome it attaches to the next message, or is handed to AGI Desktop, VS Code or the CLI after a preview and approval. On a phone, shared text arrives through the share sheet.

Area: [64. Browser-assistant experience](README.md). Requirement items: [S64.02](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6402).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Moves a highlighted passage into the assistant's context. In Chrome the passage is attached to the side-panel composer, or sent after an explicit approval to AGI Desktop (quoted draft in the composer), VS Code (composer prefill through a vscode:// link) or the CLI (a copied command with an agi-context link). On Mobile the iOS share sheet and Android share intent carry selected text into AGI.

**Why it exists.** Brief item S64.02: text the user highlights on a web page reaches the assistant as context for a question. [inferred] Highlighting is the fastest way to point at what a question is about.

**Who uses it.** People reading in Chrome who want an explanation, translation or answer about a passage; developers moving a browser passage into VS Code or the terminal; phone users sharing selected text from a browser.

**Problems it solves**

- Copying and pasting a passage between apps.
- Sending a whole page when only one paragraph matters.
- Leaking secrets in a passage: the selection is redacted before it leaves Chrome (apps/extension/__tests__/page-selection.test.ts:105-116).

**Use cases**

- Select a paragraph in Chrome, right-click, choose 'Explain this'.
- Select a stack trace on a web page and choose 'Send selected text to a local app…', then 'Open in VS Code'.
- Select text in Safari on iPhone and share it with AGI.

## 2. User experience

**Where to find it**

- Chrome right-click on selected text: 'Ask AGI about "%s"', 'Send selected text to a local app…', 'Explain this', 'Translate this' (apps/extension/src/background.ts:7452-7458; labels apps/extension/_locales/en/messages.json:11,15,19,42).
- Chrome side panel plus menu: 'Add selected text' (apps/extension/_locales/en/messages.json:4064; apps/extension/src/side_panel.ts:14797-14809).
- Chrome handoff preview inside the side panel: title 'Send selected context?' with 'Send redacted context', 'Open in VS Code', 'Copy CLI command' and 'Cancel' (apps/extension/src/features/context-handoff/index.ts:229-294 region).
- Desktop: no screen of its own; the text appears quoted in the open chat composer.
- VS Code: the AGI chat composer is prefilled and revealed.
- CLI: run the copied command; the selection is added before the prompt.
- Mobile: iOS share extension 'Share with AGI' with button 'Save for AGI Review' (apps/mobile/native/ios/AGIShareExtension/ShareViewController.swift:67,92); Android share intent for text/plain (apps/mobile/app.config.js:318-337); in-app screen 'Shared Content' (share-preview/index.tsx:297-305).

**Before you start**

- Chrome: signed in to AGI for the side-panel route (side_panel.ts:10551-10553 requires chat state 'ready'); the site must be approved and not blocked (side_panel.ts:10563-10566).
- Desktop handoff: AGI Desktop running with an open chat and an authenticated native session (apps/desktop/electron/browserHandoff.ts:33-58; apps/extension/src/background.ts:5200-5215).
- VS Code: the AGI extension installed and its chat view available (apps/extension-vscode/src/features/context-handoff/index.ts:317-322).
- CLI: the agi command with the --context-url flag (apps/cli/src/lib.rs:233-234).

**Screens and controls**

- Chrome chip 'Selected text · <host>' that can be dismissed; notices 'Select some text on the page first.', 'Text in a form field can't be added. Select text on the page itself.', 'Wait for the reply to finish, then add the selected text.' (messages.json:4064-4090).
- Handoff preview: shows the redacted text, the source address and a note about redactions; buttons as above (context-handoff/index.ts:229-294).
- Mobile share preview: text box, Dismiss, Send to Chat (share-preview/index.tsx:423-446,495-537).

**Journey**

1. Chrome side panel: person selects text, opens the plus menu, chooses 'Add selected text' -> the extension reads only the visible selection, redacts it, shows the chip -> person types a question and sends (side_panel.ts:10551-10590).
2. Chrome right-click 'Ask AGI about': background stores a pending 'ask-selection' request and opens the side panel; the selection is attached and the person writes the question (background.ts:7556-7575; side_panel.ts:16449-16560).
3. Chrome 'Send selected text to a local app…': background builds a handoff record and opens the side panel preview; person chooses Desktop ('Send redacted context'), VS Code or CLI (background.ts:7580-7612; side_panel.ts:16660-16735).
4. Desktop: the extension sends a native selected-text message; Desktop checks size and address scheme, focuses the window and inserts a quoted draft with 'Source: <url>' (apps/desktop/electron/browser/bridgeServer.ts:593-616,724-727; browserHandoff.ts:14-20,33-58).
5. VS Code: opening the vscode:// link triggers the handler; the composer gets 'Selected in the browser, from <url>' plus the text (context-handoff/index.ts:29-31,303-323).
6. CLI: running the copied command puts a <browser-selection source=...> block before the prompt (apps/cli/src/context_handoff.rs:20-26; lib.rs:8675-8679).
7. Mobile: person shares text, the share screen shows it, person taps 'Send to Chat' or 'Ask about this page' (share-preview/index.tsx:189-248).

**What the person sees and gets**

- Chrome notices in the composer area; handoff preview shows result or error such as 'AGI Desktop did not return a handoff result. Select the context again.' (side_panel.ts:16690-16706).
- Desktop: the quoted draft in the composer; failures 'No chat is open in <app>. Open a chat there, then try again.' (browserHandoff.ts:49-52).
- VS Code warnings for expired or malformed links (context-handoff/index.ts:309-315).
- Mobile alerts for status refused, invalid or uncertain (share-preview/index.tsx:317-328).

**Settings**

- Chrome site approvals, blocked sites and the in-page panel toggle in Extension settings.
- Native pairing with Desktop (BrowserPairingSection.tsx).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Chrome attaches a highlighted passage from the plus menu with the 30,000 character cap, redaction and form-field refusal (side_panel.ts:10551-10590; tabContext.ts:344-356; apps/extension/__tests__/page-selection.test.ts).
- Chrome right-click Ask, Explain, Translate stage a pending request for the side panel (background.ts:7556-7575, 7614-7640).
- Chrome selected-context handoff requires approval in the extension page and never sends from the menu click (apps/extension/__tests__/context-handoff-boundary.test.ts:8-34).
- Desktop accepts a selection up to 2,000 characters from http or https pages and drafts it into the open chat (bridgeServer.ts:593-616; packages/contracts/types/src/context-handoff-uri.ts:17).
- VS Code and CLI read the same version-1 link grammar (context-handoff-uri.ts:1-10; apps/cli/src/context_handoff.rs:1-6).
- Mobile iOS and Android share text into the share preview (ShareViewController.swift:141-145; app.config.js:318-337).

**Incomplete**

- The brief's pointers side_panel.ts:11067-11075, background.ts:4526 and lib.rs:4401 do not hold selection code; the real code is at the paths above.
- Mobile does not read a selection inside a browser; it receives whatever the share sheet gives it.
- Desktop handoff needs an open chat; with none it fails with a message (browserHandoff.ts:49-52).

**Present but disconnected or switched off**

- Handoff to VS Code and CLI is a link or copied command; the extension does not confirm delivery (apps/extension/src/background.ts:5191-5202).

**Not available**

- Web (ordinary browser) and the Chrome-less path for Desktop selection (brief status n/a for web).
- Selection from inside a form field (refused on purpose, side_panel.ts:10575).

## 4. Required behaviour

**Established requirements**

- Text the user highlights on a web page reaches the assistant as context for a question (S64.02). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S64.02)
- Page content is untrusted; browser data must not enter global memory or synced chat by default. (source: (doc: docs/product/requirements.md:1213-1214))
- Chrome needs page context capture and prompt-injection defenses. (source: (doc: docs/product/requirements.md:1197-1212))

**Acceptance criteria**

1. In Chrome, 'Add selected text' with nothing selected shows 'Select some text on the page first.'
2. In Chrome, a selection inside a form field is refused with the form-field message.
3. A selection longer than the page limit is cut and marked.
4. A secret-looking string in the selection is redacted before it is sent.
5. The handoff preview shows the exact text that will leave Chrome and sends nothing until 'Send redacted context' is pressed.
6. Desktop refuses a selection over 2,000 characters or from a non-web address.
7. Opening the vscode:// handoff link puts the text in the VS Code composer; a malformed link shows a warning.
8. The CLI refuses a --context-url that is not a version 1 agi-context link.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The handoff text limit of 2,000 characters is shorter than the 30,000 limit of the side panel route, so large passages need the side panel route [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the 2,000 character limit in the preview before approval.
- [proposed] Let Desktop queue a selection when no chat is open instead of failing.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | attachPageSelection | `apps/extension/src/side_panel.ts` | Reads the highlighted passage and attaches it (line 10551). |
| service | prepareSelectionContext | `apps/extension/src/features/side-panel/tabContext.ts` | Rejects non-web pages, redacts and bounds the passage (lines 344-356). |
| config | CONTEXT_MENU_ITEMS and handleContextMenuClick | `apps/extension/src/background.ts` | Right-click items and their pending-chat records (lines 7452-7461, 7499-7676). |
| service | attachSelectionForQuestion | `apps/extension/src/side_panel.ts` | Applies a pending right-click selection to the composer (line 16449). |
| service | checkPendingContextHandoff | `apps/extension/src/side_panel.ts` | Shows the handoff preview (line 16660); releaseContextHandoffTo at 16736. |
| component | context-handoff preview | `apps/extension/src/features/context-handoff/index.ts` | Destination constants, URI builder, preview dialog (lines 19-35, 229-294). |
| service | APPROVE_CONTEXT_HANDOFF handler | `apps/extension/src/background.ts` | Validates the approved handoff and sends the native selection message (lines 5157-5255); cancel at 5257. |
| service | readSelection / deliverChatHandoff | `apps/desktop/electron/browser/bridgeServer.ts` | Validates the selected-text message (lines 593-640, 724-727). |
| service | deliverBrowserHandoff | `apps/desktop/electron/browserHandoff.ts` | Focuses the window and inserts the quoted draft (lines 14-20, 33-58). |
| config | deliverToChat wiring | `apps/desktop/electron/main.ts` | Connects the bridge to deliverBrowserHandoff (lines 501-503). |
| schema | context-handoff-uri | `packages/contracts/types/src/context-handoff-uri.ts` | Link grammar, 2,000 and 2,048 limits, VS Code and CLI builders. |
| service | handleContextHandoffUri | `apps/extension-vscode/src/features/context-handoff/index.ts` | vscode:// handler that prefills the composer (lines 29-31, 303-323). |
| service | parse_context_handoff_url | `apps/cli/src/context_handoff.rs` | Rust reader of the link (line 62) and prompt block (lines 20-26). |
| config | --context-url flag | `apps/cli/src/lib.rs` | CLI flag (lines 233-234) and use (lines 8675-8679). |
| component | ShareViewController | `apps/mobile/native/ios/AGIShareExtension/ShareViewController.swift` | iOS share extension for text, links, images, files (lines 67, 92, 141-145). |
| config | iOS activation rules | `apps/mobile/native/ios/AGIShareExtension/AGIShareExtension-Info.plist` | Accepts text, one web link, up to 5 images and files (lines 27-34). |
| config | Android intent filters | `apps/mobile/app.config.js` | SEND and SEND_MULTIPLE text/plain filters (lines 318-337). |
| screen | SharePreviewScreen | `apps/mobile/src/features/share-preview/index.tsx` | Shows and sends shared text (line 70). |
| event | agi_pending_chat | `apps/extension/src/side_panel.ts` | Session-storage record read by checkPendingChat (line 16562) and handlePendingComposerChat (line 16632). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Chrome reads the selection with a script in the page, redacts and bounds it. | device | apps/extension/src/side_panel.ts:10567-10590; tabContext.ts:344-356 |
| The attached passage goes with the person's message to AGI Managed Cloud. | our servers | apps/extension/src/background.ts:8061; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112 |
| Handoff: the extension stores a pending record in session storage, shows the preview, then on approval sends a native message to Desktop over the local bridge. | device | background.ts:5157-5255; context-handoff/index.ts:229-294 |
| Desktop validates and inserts the draft into the chat composer. | device | bridgeServer.ts:593-616; browserHandoff.ts:33-58 |
| VS Code and CLI receive the selection inside a link; nothing touches the network for the handoff. | device | packages/contracts/types/src/context-handoff-uri.ts:1-9 |
| Mobile: the share extension stages text; the app shows it and sends it as a chat message. | device and our servers | ShareViewController.swift:6-9; share-preview/index.tsx:222-225 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Selected passage (Chrome side panel) | Memory of the side panel and, as a quoted source, the sent message | With the chat if it syncs; unknown whether the passage text is in the synced body | With the chat |
| Pending handoff record | store:chrome.storage.session key from CONTEXT_HANDOFF_STORAGE_KEY | No | Removed on approve, cancel or when invalid or expired (background.ts:5163-5175, 5257-5280) |
| Handoff link | In the link itself; not stored by the app | No | Not stored |

**Models and providers.** Chrome chat uses AGI Managed Cloud. The Desktop, VS Code and CLI handoffs only place text in a composer or prompt; the model used afterwards is that app's own choice.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Chrome side-panel route needs sign-in (side_panel.ts:10551-10552). Handoff to Desktop needs an authenticated native session (background.ts:5200-5215). Mobile cloud send needs sign-in (chatExecutionStore.ts:2293-2299). |
| Permissions | Site must be approved and not blocked (side_panel.ts:10563-10566). Handoff needs explicit approval in the extension page (context-handoff-boundary.test.ts:19-27). |
| Subscription | none found in the code for selection capture. Server outcomes plan_required and quota_exceeded apply to the chat send; which plans: unknown. |
| Limits and metering | Chrome: 30,000 characters (tabContext.ts:354 with pageActions.ts:22). Handoff: 2,000 characters of text and 2,048 of address (context-handoff-uri.ts:17-18). Mobile: 100 KB (share-preview/index.tsx:43). |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code for selection attach. |
| Provider restrictions | Chrome: Managed Cloud only. Handoff targets: none. |
| Local mode | Desktop, VS Code and CLI handoff work with Local models because they only place text in a composer [inferred]. Chrome has no Local mode. Mobile Local mode can receive shared text (share-preview/index.tsx:107, 116-125). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| No selection | Notice 'Select some text on the page first.' | side_panel.ts:10577; messages.json:4068 |
| Selection in a form field | Refused with a form-field notice | side_panel.ts:10575; apps/extension/__tests__/page-selection.test.ts:61-90 |
| Site not approved or blocked | Notice naming the host | side_panel.ts:10563-10566 |
| Reply still streaming | Notice 'Wait for the reply to finish, then add the selected text.' | side_panel.ts:10553,10580 |
| Draft already occupied (right-click ask) | A draft-occupied notice and the request is dropped | side_panel.ts:16449-16456 |
| Tab address changed since selection | Throws the page-changed reason | side_panel.ts:16459 |
| Handoff expired or invalid | 'This context preview is invalid or expired. Select the context again.' | background.ts:5174 |
| Handoff already sending | 'This context handoff is already being sent.' | background.ts:5166-5171 |
| Desktop sends fail | Preview stays retryable if the record is valid; unknown delivery state asks to select again | background.ts:5219-5252 |
| Desktop has no window or chat | Errors 'has no window open' or 'No chat is open' | browserHandoff.ts:35-52 |
| Offline | not handled in the code for the local handoff beyond the errors above | Looked in apps/desktop/electron/browserHandoff.ts and apps/extension/src/background.ts:5157-5255; no offline branch found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/page-selection.test.ts`: Reading only the highlighted text, form-field refusal, cap, redaction, non-web refusal.
- `apps/extension/__tests__/side-panel-selection-attach.test.ts`: Adding selected text: empty, form field, streaming, rewrite offer.
- `apps/extension/__tests__/side-panel-selection-chip.test.ts`: The selected text chip: never read on focus, attach from plus menu, dismiss, unapproved site, no selection.
- `apps/extension/__tests__/ask-about-page-menu.test.ts`: Right-click selected-text Ask, Explain and Translate staging (describe at line 325).
- `apps/extension/__tests__/context-handoff.test.ts`: Handoff record, preview, approval before crossing the boundary.
- `apps/extension/__tests__/context-handoff-boundary.test.ts`: No direct transfer from a menu click; approval and session integrity.
- `apps/desktop/electron/__tests__/browserHandoff.test.ts`: A selection handed over from the browser (describe line 137).
- `apps/extension-vscode/src/__tests__/contextHandoffUri.test.ts`: VS Code handoff link parsing.
- `packages/contracts/types/src/__tests__/context-handoff-uri.test.ts`: Link grammar and limits.
- `packages/contracts/types/src/__tests__/browser-selection.test.ts`: Browser selection contract (content not opened).
- `apps/cli/src/context_handoff.rs`: Rust unit tests of the link reader (#[test] at lines 118-136).
- `apps/mobile/__tests__/ios-share-inbox.test.ts`: iOS share inbox staging.

**Test scenarios**

- **Attach a selection in Chrome**
  1. Approve a site, select a paragraph.
  2. Plus menu, 'Add selected text'.
  3. Ask a question and send.
  - Expected: Chip 'Selected text · host' shows; the answer uses the passage.
- **Form field refusal**
  1. Select text inside a text box.
  2. Use 'Add selected text'.
  - Expected: Form-field message; nothing attached.
- **Handoff to Desktop**
  1. Open a chat in Desktop; pair Chrome.
  2. Select text, right-click, 'Send selected text to a local app…'.
  3. Press 'Send redacted context'.
  - Expected: A quoted draft with 'Source: <url>' appears in the Desktop composer.
- **Handoff to VS Code**
  1. Select text; open the preview; press 'Open in VS Code'.
  - Expected: VS Code composer is prefilled with 'Selected in the browser, from <url>'.
- **Handoff to CLI**
  1. Press 'Copy CLI command'; paste it into a terminal.
  - Expected: The CLI session begins with a <browser-selection> block.
- **Mobile text share**
  1. Select text in Safari; Share; AGI.
  2. Review and Send to Chat.
  - Expected: New chat contains the shared text wrapped in the shared tag.

**Where to look when it fails**

- Chrome console logs 'Failed to prepare selected browser context' and 'Rejected selected-context handoff' (background.ts:7567,7604).
- Desktop bridge replies with success false and an error text for refused selections (bridgeServer.ts:618-640).
- CLI error text starting '--context-url:' (context_handoff.rs:46-70).

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/064-browser-assistant-experience.md](../../70-qa/test-plans/desktop/064-browser-assistant-experience.md)
- Mobile: [70-qa/test-plans/mobile/064-browser-assistant-experience.md](../../70-qa/test-plans/mobile/064-browser-assistant-experience.md)
- CLI: [70-qa/test-plans/cli/064-browser-assistant-experience.md](../../70-qa/test-plans/cli/064-browser-assistant-experience.md)
- VS Code: [70-qa/test-plans/vscode/064-browser-assistant-experience.md](../../70-qa/test-plans/vscode/064-browser-assistant-experience.md)
- Chrome: [70-qa/test-plans/chrome/064-browser-assistant-experience.md](../../70-qa/test-plans/chrome/064-browser-assistant-experience.md)

## 10. Gaps and dependencies

- **Stale brief pointers for S64.02.** Affects: Knowledge base readers. Evidence: apps/extension/src/side_panel.ts:11067-11075 and apps/extension/src/background.ts:4526 hold unrelated code. Work needed: Update the brief with the real paths listed in the implementation map.
- **Desktop handoff fails when no chat is open.** Affects: Desktop. Evidence: apps/desktop/electron/browserHandoff.ts:49-52. Work needed: Queue the draft or open a new chat.
- **No selection-specific entry on Mobile; it relies on the general share sheet.** Affects: Mobile. Evidence: share-preview/index.tsx. Work needed: Decide if a browser-aware selection action is wanted.
- **No evidence that VS Code and CLI handoffs were run against a real Chrome.** Affects: VS Code, CLI. Evidence: Only unit tests exist. Work needed: Run the scenarios and record the result.

**Depends on**

- surface:chrome
- surface:desktop
- surface:vscode
- surface:cli
- surface:mobile
- mode:cloud
- file:packages/contracts/types/src/context-handoff-uri.ts
- file:apps/desktop/electron/browser/bridgeServer.ts
- store:chrome.storage.session
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- F064-01

## Unknown

- Whether the selection text is stored in the synced cloud copy of a Chrome chat.
- Whether Desktop truncation of the quoted draft shows any notice.
- How the CLI behaves when the same handoff link is used twice.
- Plan rules for the chat send.
