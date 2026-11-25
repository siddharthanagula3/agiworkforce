---
id: "F074-02"
type: "feature"
title: "Ask about selected text and right-click actions"
aliases: ["Selection context menu", "Ask AGI about selection", "Right-click actions", "Send selected text to a local app", "Explain this", "Translate this", "Rewrite selection", "S74.04", "S74.05", "agi_pending_chat"]
area: "74 Browser extension"
available_on: ["chrome"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "built"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S74.04", "S74.05"]
depends_on: ["surface:chrome", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-subscriptions-entitlements-and-usage", "SYS-security-and-privacy", "SYS-authentication-and-identity", "store:chrome.storage.session", "file:apps/extension/src/background.ts", "file:apps/extension/src/side_panel.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F074-02 Ask about selected text and right-click actions

In the Chrome extension, selecting text and right-clicking offers Ask AGI, Send to a local app, Explain, Translate and (in editable fields) Rewrite. The side panel opens with the selection attached as a chip. Ask waits for the person's question; Explain and Translate fill a prompt that the person sends. Chat uses AGI Managed Cloud.

Area: [74. Browser extension](README.md). Requirement items: [S74.04](../../10-requirements/capabilities/074-browser-extension.md#s7404), [S74.05](../../10-requirements/capabilities/074-browser-extension.md#s7405).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Adds right-click menu items that send selected page text into the side panel as attached context, so the person can ask, explain, translate or rewrite it without copying and pasting. (apps/extension/src/background.ts:7452-7461, 7499-7600)

**Why it exists.** The brief says right-clicking selected text offers assistant actions (S74.04) and the user can ask about the selection and get an answer in the extension (S74.05). (doc: knowledge-base/data/area-briefs/074-browser-extension.md)

**Who uses it.** People using the Chrome extension who read or edit text on web pages.

**Problems it solves**

- No copy and paste between page and assistant.
- Quick explain or translate of a passage.
- Rewrite text inside a page's editable field.
- Hand a selection to a local app instead of cloud chat.

**Use cases**

- Select a confusing paragraph, right-click, choose 'Explain this'.
- Select a foreign-language sentence and choose 'Translate this'.
- Select text in a text box and choose 'Rewrite selection'.
- Select a code snippet and choose 'Send selected text to a local app…' to review and hand it to AGI Desktop, VS Code or the CLI.

## 2. User experience

**Where to find it**

- surface:chrome: Chrome right-click menu on selected text. Labels: 'Ask AGI about "%s"', 'Send selected text to a local app…', 'Explain this', 'Translate this' (apps/extension/_locales/en/messages.json:10-20, 41-44).
- surface:chrome: 'Rewrite selection' appears for editable fields (messages.json:5007-5009; apps/extension/src/background.ts:7452-7461).
- Other apps: not applicable.

**Before you start**

- Selected text on an http or https page (apps/extension/src/features/side-panel/tabContext.ts:344-350).
- For Ask, Explain, Translate and Rewrite: a signed-in AGI account with chat ready (side_panel.ts:16632-16645, 16498-16504 for rewrite).
- The site must not be on the person's Blocked sites list (side_panel.ts:16459-16465).
- For 'Send selected text to a local app': AGI Desktop reachable through the native bridge, or VS Code or the CLI as the other destinations (apps/extension/src/features/context-handoff/index.ts:19-35).

**Screens and controls**

- Right-click menu items (above).
- Selection chip in the composer, titled 'Selected text · <site>' (messages.json:4089-4090).
- Preview card for the local-app handoff with approve, cancel, open in VS Code and copy CLI command (side_panel.ts:16678-16720).
- Notices: 'Finish your current draft or remove its attachments, then select the text again.' and 'This selection couldn't be attached. Select text on the page and try again.' (messages.json, keys spSelectionDraftOccupied and spSelectionNotAvailable).

**Journey**

1. 1. Select text and right-click.
2. 2. Choose an item. The worker stores a pending request with the text, page URL and tab, then opens the side panel (apps/extension/src/background.ts:7556-7600).
3. 3. The panel reads the request, checks that it is under 5 minutes old, belongs to this window and that the tab URL still matches (side_panel.ts:16287, 16562-16630, 16449-16460).
4. 4. The selection is cleaned and bounded, then attached as a chip (side_panel.ts:16466-16490).
5. 5. Ask: the cursor waits in the composer for the question. Explain or Translate: a ready-made prompt is placed in the composer and the person presses send (side_panel.ts:16491-16503).
6. 6. The answer streams into the panel from AGI Managed Cloud.

**What the person sees and gets**

- A selection chip in the composer.
- A notice if the draft is busy or the selection could not be attached.
- A browser notification 'Context unavailable' with 'The selected context was not attached. Try again.' if saving the request failed (background.ts:7561-7571).
- An answer bubble in the panel.

**Settings**

- Blocked sites list in Options (apps/extension/src/features/options/blocked-sites-section.ts).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Eight context menu items are built on install, three kinds: selection, editable and page (apps/extension/src/background.ts:7452-7461, 7474-7497).
- Ask stores type ask-selection and opens the panel (background.ts:7556-7573).
- Explain and Translate store their own types (background.ts:7611-7646).
- Rewrite captures the editable target, needs a signed-in account, and shows a notification and an error request if it fails (background.ts:7499-7555).
- The panel claims a request only if it targets its own window and is fresh (side_panel.ts:16562-16630).
- Selection is redacted and bounded to the page text limit before attach (apps/extension/src/features/side-panel/tabContext.ts:344-356).
- Send to a local app builds a preview with a 5 minute life and three destinations (features/context-handoff/index.ts:15-35).

**Incomplete**

- Ask and Explain do not send by themselves; the person must send, which differs from 'gets an answer' if read as automatic. [inferred] (side_panel.ts:16449-16503)

**Present but disconnected or switched off**

- none found.

**Not available**

- Other apps have no such menu.
- Selections in browser pages that block extensions (chrome:// pages) cannot be read (apps/extension/src/side_panel.ts:6402-6404).

## 4. Required behaviour

**Established requirements**

- Right-clicking selected text offers assistant actions. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S74.04)
- The user asks about the selected text and gets an answer in the extension. (source: S74.05 (same brief))
- Page content is untrusted; browser data must not enter global memory or synced chat by default. (source: doc: docs/product/requirements.md lines 1215-1218)

**Acceptance criteria**

1. Right-click on selected text shows the four selection items; in an editable field it also shows 'Rewrite selection'.
2. 'Ask AGI about' opens the panel with a selection chip and an empty question box.
3. 'Explain this' puts the explain prompt in the composer with the chip attached and does not send.
4. A request older than 5 minutes is ignored.
5. If the tab URL changed before the panel read the request, the panel shows a page-changed notice and attaches nothing.
6. On a blocked site the selection is refused with the blocked-site message.
7. If the draft already has text or an attachment, the selection is not applied and a notice explains.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The 'answer in the extension' requirement is met once the person sends. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer an optional send-immediately setting for Explain and Translate.
- [proposed] Show an in-panel notice when the pending request expires instead of ignoring it silently.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | CONTEXT_MENU_ITEMS | `apps/extension/src/background.ts` | Defines menu items and where each shows (7452-7461). |
| service | rebuildContextMenus | `apps/extension/src/background.ts` | Creates the menus on install or update (7474-7497, 7685-7697). |
| service | handleContextMenuClick | `apps/extension/src/background.ts` | Writes agi_pending_chat or the local handoff and opens the panel (7499-7660). |
| store | agi_pending_chat | `apps/extension/src/side_panel.ts` | Session storage key read by the panel; 5 minute limit PENDING_CHAT_TTL_MS (16287, 16562-16567). |
| service | checkPendingChat | `apps/extension/src/side_panel.ts` | Reads and routes pending requests by type and window (16562-16630). |
| service | attachSelectionForQuestion | `apps/extension/src/side_panel.ts` | Checks tab URL, blocked sites, prepares text, sets chip and prompt (16449-16508). |
| service | prepareSelectionContext | `apps/extension/src/features/side-panel/tabContext.ts` | Rejects non-web URLs, redacts and bounds the text (344-356). |
| service | startSelectionRewrite | `apps/extension/src/side_panel.ts` | Starts the inline rewrite turn for an editable field (16511-16560). |
| service | editable selection capture | `apps/extension/src/features/background/editable-selection.ts` | Captures the editable field for Rewrite (captureEditableTarget called from background.ts:7519-7526). |
| component | Editable rewrite UI | `apps/extension/src/features/side-panel/editableRewrite.ts` | Stages and renders the rewrite chip (used in side_panel.ts:16478, 16532). |
| service | Context handoff module | `apps/extension/src/features/context-handoff/index.ts` | Builds, validates and previews the 'send to a local app' handoff; destinations AGI Desktop, VS Code, AGI CLI (15-35, 130-240). |
| service | APPROVE_CONTEXT_HANDOFF handler | `apps/extension/src/background.ts` | Sends the approved selection to the chosen destination (5157-5200). |
| service | checkPendingContextHandoff | `apps/extension/src/side_panel.ts` | Mounts the handoff preview in the panel (16660-16722). |
| service | isUserBlockedSite | `apps/extension/src/features/site-policy/userBlocklist.ts` | Blocked-site check used before attaching (65). |
| config | menu strings | `apps/extension/_locales/en/messages.json` | Menu titles and selection notices. |
| test | ask-about-page-menu test | `apps/extension/__tests__/ask-about-page-menu.test.ts` | Includes a 'selected-text Ask in the browser' group (line 325 onward). |
| test | side-panel-selection-attach test | `apps/extension/__tests__/side-panel-selection-attach.test.ts` | Selection attach function. |
| test | context-handoff test | `apps/extension/__tests__/context-handoff.test.ts` | Local handoff. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person selects text and picks a menu item; Chrome calls the worker. | device | apps/extension/src/background.ts:7675 |
| The worker writes agi_pending_chat to session storage and opens the panel. | device | apps/extension/src/background.ts:7556-7573 |
| The panel verifies the request, blocklist and tab URL, then attaches the cleaned selection. | device | apps/extension/src/side_panel.ts:16449-16490 |
| When the person sends, the selection and question go to AGI Managed Cloud, which picks a model and streams the answer. | our servers | apps/extension/src/features/cloud-bridge/freeTrialClient.ts:112 and doc: apps/extension/docs/threat-model.md:23 |
| For 'Send selected text to a local app', after approval the text goes to AGI Desktop over native messaging, or to a vscode link, or is copied as a CLI command; nothing goes to AGI servers in that step. | device | apps/extension/src/features/context-handoff/index.ts:19-35; side_panel.ts:16678-16720 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Pending request with selected text, page URL, tab id | chrome.storage.session key agi_pending_chat | no | Removed when handled; ignored after 5 minutes (side_panel.ts:16381-16384, 16567). |
| Local handoff preview | chrome.storage.session key agi_pending_context_handoff_v1 | no | Expires after 5 minutes (features/context-handoff/index.ts:15-16). |
| The chat turn containing the selection | chrome.storage.local conversation store, and the account if mirrored (see F074-05) | yes when the whole chat was Managed Cloud and mirroring is on (doc: apps/extension/docs/threat-model.md:12-20) | See F074-05. |

**Models and providers.** The extension does not choose a provider. Managed Cloud routes the turn on our servers; in-page prompts send model selection auto (apps/extension/src/background.ts:9150-9156). The side panel passes the picker choice. [inferred]

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI account for Ask, Explain, Translate and Rewrite (side_panel.ts:16644; background.ts:7508-7511). |
| Permissions | contextMenus and sidePanel permissions (apps/extension/manifest.json:13-22). No extra site permission is needed to attach a selection the person made. [inferred] |
| Subscription | Admission, plan and usage are decided on our servers; plan_required and quota_exceeded errors are mapped for the person (apps/extension/src/background.ts:9040-9044). |
| Limits and metering | Selection is bounded to 30,000 characters (features/content/in-page-panel/pageActions.ts:22, 136-143); 5 attachments per message (freeTrialClient.ts:103). Usage metering is server side (MANAGED_USAGE_ENDPOINT, freeTrialClient.ts:116). |
| Feature flags | none found in the code. |
| Model compatibility | unknown for specific models; the extension passes the choice to Managed Cloud. |
| Provider restrictions | Managed Cloud only; no own-key (doc: threat-model.md:23, 208). |
| Local mode | Chat has no Local mode. The only local path is the handoff to AGI Desktop, VS Code or the CLI after the person approves a preview. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Draft busy | Selection not applied; notice 'Finish your current draft or remove its attachments, then select the text again.' | apps/extension/src/side_panel.ts:16454-16458 |
| Tab URL changed | Page-changed notice, nothing attached. | side_panel.ts:16459-16460, 16510 |
| Blocked site | Refused with the blocked-site message. | side_panel.ts:16461-16465 |
| Request older than 5 minutes | Ignored silently. | side_panel.ts:16567 |
| Storage write fails | Notification 'Context unavailable'. | apps/extension/src/background.ts:7561-7571 |
| Chat not ready (signed out, loading) | Explain and Translate wait and do not apply; Ask still attaches. | side_panel.ts:16644-16646 |
| Rewrite while signed out or page changed | Notification 'rewrite unavailable' and an error request. | background.ts:7505-7545 |
| Two side panels | Only the one in the matching window claims the request. | side_panel.ts:16584-16630 |
| Offline / timeout | not handled in the code for the attach step; streaming errors are handled by chat. | apps/extension/src/side_panel.ts:16449-16508 (no network call in the attach path) |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/ask-about-page-menu.test.ts`: Page menu items and a selected-text Ask group: selection staged, redacted selection attached, existing draft kept, Translate does not overwrite a draft.
- `apps/extension/__tests__/side-panel-selection-attach.test.ts`: prepareSelectionContext and the selection attach function (5 tests).
- `apps/extension/__tests__/side-panel-selection-chip.test.ts`: Selection chip (6 tests; file contents not read in detail).
- `apps/extension/__tests__/side-panel-pending-chat-window.test.ts`: Pending chat routed to the right window (4 tests).
- `apps/extension/__tests__/context-handoff.test.ts`: Local handoff creation and validation (16 tests).
- `apps/extension/__tests__/context-handoff-boundary.test.ts`: Handoff boundary checks (name only).
- `apps/extension/__tests__/side-panel-inline-rewrite.test.ts`: Inline rewrite in the panel (name only).
- `apps/extension/__tests__/editable-selection.test.ts`: Editable selection capture (name only).

**Test scenarios**

- **Ask about selection**
  1. Sign in. Select a sentence on a news page.
  2. Right-click and choose the Ask AGI item.
  3. Type a question and send.
  - Expected: Panel opens with a selection chip, the box is empty until typing, and the answer streams after send.
- **Explain**
  1. Select a paragraph.
  2. Choose 'Explain this'.
  - Expected: Chip attached and the explain prompt appears in the composer; nothing is sent until the person sends.
- **Stale request**
  1. Right-click Ask, but close the panel before it loads and wait over 5 minutes, then open the panel.
  - Expected: No chip is attached.
- **Blocked site**
  1. Add the site to Blocked sites in Options.
  2. Select text and choose Ask.
  - Expected: Selection is not attached and the blocked-site notice shows.
- **Rewrite**
  1. Select text in a text box.
  2. Choose 'Rewrite selection'.
  - Expected: The panel starts a rewrite turn for that field; signed out shows a sign-in message.
- **Send to local app**
  1. Pair AGI Desktop. Select text and choose 'Send selected text to a local app…'.
  - Expected: A preview opens; nothing is sent until approved.

**Where to look when it fails**

- Worker warnings: 'Failed to prepare selected browser context', 'Failed to store pending chat (explain)', 'Rejected selected-context handoff'.
- Panel console: '[SidePanel] Failed to attach selected browser context:'.
- Session storage keys agi_pending_chat and agi_pending_context_handoff_v1 in the extension's devtools.

**Hands-on test plans**

- Chrome: [70-qa/test-plans/chrome/074-browser-extension.md](../../70-qa/test-plans/chrome/074-browser-extension.md)

## 10. Gaps and dependencies

- **Explain, Translate and Ask do not send automatically.** Affects: surface:chrome users who expect an immediate answer. Evidence: apps/extension/src/side_panel.ts:16491-16503; test title 'attaches redacted selection, preserves the draft and waits for Send' (ask-about-page-menu.test.ts:440). Work needed: Product decision; if instant answers are wanted, add an optional setting.
- **Expired pending requests give no message.** Affects: surface:chrome. Evidence: side_panel.ts:16567 returns silently. Work needed: Show a notice.
- **Menu titles were only checked in the English locale file.** Affects: surface:chrome non-English users. Evidence: Only apps/extension/_locales/en was read. Work needed: Check other locales exist under apps/extension/_locales.

**Depends on**

- surface:chrome
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-subscriptions-entitlements-and-usage
- SYS-security-and-privacy
- SYS-authentication-and-identity
- store:chrome.storage.session
- file:apps/extension/src/background.ts
- file:apps/extension/src/side_panel.ts

## Unknown

- Exact server path and model routing used for the turn (extension sends to FREE_TRIAL_ENDPOINT /api/llm/v1/chat/completions; server code not read).
- Whether other locale files translate the menu items.
- Full contents of side-panel-selection-chip and context-handoff-boundary tests were not read.
- How the handoff reaches AGI Desktop on the desktop side (desktop code not read).
