---
id: "F064-03"
type: "feature"
title: "Pick and compare open tabs"
aliases: ["Pick and compare open tabs", "Open-tab picker (S64.03)", "Multi-tab comparison (S64.04)", "Choose a tab", "Attach tabs", "@ tab mention", "list tabs (browser_list_tabs)"]
area: "64 Browser-assistant experience"
available_on: ["desktop", "chrome"]
implementation: {web: "n/a", desktop: "partial", mobile: "n/a", cli: "missing", vscode: "n/a", chrome: "partial"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S64.03", "S64.04"]
depends_on: ["surface:chrome", "surface:desktop", "surface:cli", "mode:cloud", "file:apps/extension/src/features/side-panel/tabContext.ts", "file:apps/web/features/desktop-host/components/BrowserToolsDialog.tsx", "store:chrome.storage.local", "SYS-agents-tools-and-automation", "SYS-execution-boundaries", "SYS-security-and-privacy", "F064-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F064-03 Pick and compare open tabs

The person chooses which open tabs the assistant sees. Chrome has an 'Attach tabs' picker and an @ mention menu that add several tabs to one message. Desktop's 'Use the browser' dialog has a 'Choose a tab' list that reads one tab at a time. The CLI always reads the active tab. No dedicated compare action exists.

Area: [64. Browser-assistant experience](README.md). Requirement items: [S64.03](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6403), [S64.04](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6404).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets the person give the assistant the content of specific open tabs, and, by attaching several, ask for a comparison in one answer.

**Why it exists.** Brief items S64.03 (user picks one or more open tabs) and S64.04 (compare two or more tabs in one answer). [inferred] People research across tabs and do not want to paste each page.

**Who uses it.** Chrome users comparing products or articles; Desktop users choosing a non-active tab to read.

**Problems it solves**

- Reading only the active tab.
- Copying text from several tabs by hand.

**Use cases**

- In Chrome, open the plus menu, 'Attach tabs', tick two product pages and ask 'which is cheaper'.
- In Desktop, press 'Choose a tab' and read a background tab.
- Type @ in the Chrome composer and pick a tab by name.

## 2. User experience

**Where to find it**

- Chrome side panel plus menu item 'Attach tabs' (messages.json:340; side_panel.ts:14968-14975) and the @ mention menu with a 'Tabs' heading (side_panel.ts:14255-14300; spMentionTabs).
- Desktop dialog 'Use the browser': 'Choose a tab' button and a 'Tab' dropdown whose first option is 'The tab open now' (BrowserToolsDialog.tsx:43-47,341-377).
- CLI, VS Code, Mobile, Web: no picker.

**Before you start**

- Chrome: signed in and chat ready (side_panel.ts:14976); the picker shows tabs of the current window (tabContext.ts: description text 'from this window').
- Desktop: a paired and connected Chrome; Desktop asks before listing tabs (apps/desktop/electron/browser/commandGate.ts:134-139).

**Screens and controls**

- Chrome picker dialog 'Attach tabs': checkbox list of tabs (title and origin), 'Cancel', 'Attach selected tabs'; status text 'Loading open tabs…', 'Waiting for page access…' (apps/extension/src/features/side-panel/tabContext.ts:65-110).
- Chrome attached chip shows 'N tabs attached' (side_panel.ts:9870-9880).
- Desktop: 'Choose a tab' then 'Tab' select; 'Listing tabs' spinner.

**Journey**

1. Chrome: plus menu -> 'Attach tabs' -> tick tabs (up to the remaining attachment slots of 5) -> 'Attach selected tabs' -> Chrome may ask for read access to those sites -> each tab is read and verified -> chips appear -> person asks the comparison question (side_panel.ts:14976-15060; freeTrialClient.ts:103).
2. Chrome @ mention: type @ in the composer, choose a tab; it is attached without leaving the composer (side_panel.ts:14278-14340).
3. Desktop: open the dialog, keep 'Read the page', press 'Choose a tab', Desktop asks, the list appears, pick a tab, Run (BrowserToolsDialog.tsx:240-255,341-377).

**What the person sees and gets**

- Chrome notices: 'Remove the current page or selection before attaching tabs.', 'Remove an attachment before adding another tab.', '<n> tabs could not be attached. Open Attach tabs to try again.', 'Tabs could not be attached. Try again.' (messages.json:1809,1813,414,400).
- Desktop: tab titles and addresses shown only in the dialog (BrowserToolsDialog.tsx:46-47); error text under the list when listing fails (BrowserToolsDialog.tsx:378-380).

**Settings**

- Chrome site approvals decide whether a tab can be read.
- Desktop pairing.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Chrome multi-tab picker with access request, per-tab read, verification and a shared text budget (side_panel.ts:15008-15060; tabContext.ts:52-60).
- Chrome @ tab mention with the same attachment limit (side_panel.ts:14278-14290).
- Desktop single-tab picker backed by the list-tabs command (BrowserToolsDialog.tsx:127-130,240-255; commandGate.ts:134-139; desktopCommands.ts:118-119).

**Incomplete**

- No dedicated compare action: comparison relies on the model seeing several attached tabs [inferred].
- Desktop picker reads one tab per run (BrowserToolsDialog.tsx:131-133).

**Present but disconnected or switched off**

- The Chrome agent tool list_tabs lists only task tabs and tabs the person attached; it is a different tool from the picker (apps/extension/src/features/computer-use/browserToolDefinitions.ts:121-130).

**Not available**

- CLI and VS Code: no list-tabs tool in the model's browser tool list (apps/cli/src/platform/runtime/tool_catalog.rs:51-62); the CLI lists tabs only to pin the active one for form fill (apps/cli/src/features/exec/tools/mod.rs:1394-1405).
- Desktop cloud-turn tool device_browser_read_page takes no tab id (apps/web/lib/device-steps/device-tools.ts:361-363).
- Mobile and Web: not applicable.

## 4. Required behaviour

**Established requirements**

- The user picks one or more open tabs to give the assistant as context (S64.03). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S64.03)
- The assistant compares content from two or more open tabs in one answer (S64.04). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S64.04)
- Browser data stays untrusted and out of global memory by default. (source: (doc: docs/product/requirements.md:1213-1214))

**Acceptance criteria**

1. In Chrome, 'Attach tabs' lists the tabs of the current window and attaches only the ticked ones.
2. In Chrome, more tabs than the remaining attachment slots cannot be attached.
3. In Chrome, declining site access leaves the tabs out and says so.
4. In Desktop, 'Choose a tab' lists titles and addresses; picking one reads that tab, not the active tab.
5. In Desktop with no pairing, 'Choose a tab' is disabled.
6. Attaching tabs while a page or selection is attached shows the 'Remove the current page or selection' notice.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief status 'chrome missing' and 'desktop missing' for S64.03 is out of date: both have pickers in code (code wins, per project source precedence) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] A 'Compare tabs' action that attaches the picked tabs and writes a comparison prompt.
- [proposed] Tab id on the CLI and Desktop cloud read tool.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | chooseBrowserContextTabs / chooseBrowserTabs | `apps/extension/src/features/side-panel/tabContext.ts` | Picker dialog and selection (lines 52-60, 65-250). |
| service | Attach tabs menu item | `apps/extension/src/side_panel.ts` | Runs the picker, reads each tab, verifies, stores snapshots (lines 14968-15060). |
| service | mention tab attach | `apps/extension/src/side_panel.ts` | canAttachMentionedTab and attachMentionedTab (lines 14278-14340). |
| store | pendingBrowserContextTabs | `apps/extension/src/side_panel.ts` | In-memory list of attached tab snapshots (line 1845). |
| service | read grant | `apps/extension/src/features/side-panel/readGrant.ts` | Temporary read access for chosen tabs (tested by read-grant.test.ts). |
| config | MANAGED_CHAT_MAX_ATTACHMENTS | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Attachment cap of 5 (line 103). |
| component | BrowserToolsDialog tab picker | `apps/web/features/desktop-host/components/BrowserToolsDialog.tsx` | Choose a tab and Tab select (lines 240-255, 341-377). |
| service | listPairedTabs | `apps/web/features/desktop-host/lib/runtime-client.ts` | Calls browser_list_tabs (lines 510-512). |
| service | planBrowserCommand list tabs | `apps/desktop/electron/browser/commandGate.ts` | Approval text for listing tabs (lines 134-139). |
| service | desktop command listTabs | `apps/extension/src/features/native-bridge/desktopCommands.ts` | Returns the tab list to Desktop (lines 118-119, 340-342). |
| schema | BrowserTabSummary | `packages/contracts/types/src/browser-bridge.ts` | Tab summary type used by the dialog (imported at BrowserToolsDialog.tsx:11). |
| config | list_tabs agent tool | `apps/extension/src/features/computer-use/browserToolDefinitions.ts` | Task-scoped tab list for the Chrome browser agent (lines 121-130). |
| service | pin_active_browser_tab | `apps/cli/src/features/exec/tools/mod.rs` | CLI lists tabs only to pin the active one before form fill (line 1394). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Chrome: the picker queries tabs of the window from the extension page. | device | apps/extension/src/features/side-panel/tabContext.ts:65-110 |
| Chrome requests read access for the chosen origins, reads each tab and checks the document did not change. | device | apps/extension/src/side_panel.ts:15008-15045 |
| The snapshots go with the next message to AGI Managed Cloud. | our servers | apps/extension/src/side_panel.ts:7272; freeTrialClient.ts:112 |
| Desktop: the dialog asks Desktop to list tabs; Desktop shows an approval and asks the extension; titles and addresses return to the dialog only. | device | commandGate.ts:134-139; BrowserToolsDialog.tsx:240-255 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Tab snapshots (title, address, text) | In memory (pendingBrowserContextTabs) until sent | Only with a sent message | Dropped when the source tab reloads, navigates or closes (apps/extension/__tests__/side-panel-surface-policy.test.ts:162-205) |
| Desktop tab list | Dialog state only | No | Cleared when the dialog closes (BrowserToolsDialog.tsx:233-238) |

**Models and providers.** Chrome: AGI Managed Cloud; the model does the comparison. Desktop manual dialog: no model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Chrome: signed in (side_panel.ts:14976 requires a Managed Cloud owner). Desktop: none found in the dialog code. |
| Permissions | Chrome asks for site read access and releases it afterwards (read-grant.test.ts:36-52). Desktop asks before listing tabs. |
| Subscription | none found in the code. |
| Limits and metering | At most 5 attachments in total in Chrome (freeTrialClient.ts:103); shared text budget of 30,000 characters divided across tabs (side_panel.ts:15019); tab metadata size is bounded (tabContext.ts:200-208). |
| Feature flags | none found in the code. |
| Model compatibility | none found in the code. |
| Provider restrictions | Chrome: Managed Cloud only. |
| Local mode | Desktop dialog needs no model so it works in any mode. Chrome has no Local mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Picker loading | Status 'Loading open tabs…' | tabContext.ts:92 |
| Waiting for site access | Status 'Waiting for page access…'; checkboxes disabled | tabContext.ts:215-220 |
| Access declined | Status 'Page access was declined. You can choose other tabs or cancel.' | tabContext.ts:232-234 |
| Too much tab metadata | 'These tab details exceed the context budget. Choose fewer tabs.' | tabContext.ts:205-208 |
| Escape or outside click | Picker closes with no attach | tabContext.ts:170-178 |
| Tab changed after reading | It is skipped and a count notice shown | side_panel.ts:15046-15058 |
| Desktop list fails | Message shown under the list | BrowserToolsDialog.tsx:249-251,378-380 |
| Desktop tab closed since listing | Extension fails with 'That tab is no longer open in Chrome.' | apps/extension/src/features/native-bridge/desktopCommands.ts:327-330 |
| Accessibility | Chrome picker is a modal dialog with aria-labelledby, focus trap and live status; Desktop dialog has role=dialog and aria-modal | tabContext.ts:73-90,160-185; BrowserToolsDialog.tsx:293-296 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/read-grant.test.ts`: Reading attached tabs leaves no lasting access; the Attach tabs picker asks through the read grant with chosen tabs only (describe lines 36 and 83).
- `apps/extension/__tests__/side-panel-surface-policy.test.ts`: Snapshot lifetime when tabs reload or close; budget shared across tabs (lines 162-216).
- `apps/extension/__tests__/tab-cleanup.test.ts`: Tab picker reuse for closing tabs (content not opened in detail).
- `apps/web/features/desktop-host/__tests__/BrowserToolsDialog.result.test.tsx`: Dropping a read finished after another tab was chosen (line 89).
- `apps/extension/__tests__/desktop-browser-commands.test.ts`: Extension handling of Desktop commands including tab commands.
- `apps/desktop/electron/__tests__/browserBridge.test.ts`: Bridge commands including list tabs.

**Test scenarios**

- **Attach two tabs in Chrome**
  1. Open two approved pages.
  2. Plus menu, 'Attach tabs', tick both, 'Attach selected tabs'.
  3. Ask 'compare these'.
  - Expected: Chip '2 tabs attached'; the answer refers to both pages.
- **Slot limit**
  1. Attach 5 files, then try 'Attach tabs'.
  - Expected: 'Remove an attachment before adding another tab.'
- **Decline access**
  1. Pick a tab on a site not yet approved; refuse Chrome's prompt.
  - Expected: Picker shows the declined message and attaches nothing.
- **Desktop picks a background tab**
  1. Pair Chrome with two tabs open.
  2. 'Choose a tab', pick the background tab, Run.
  - Expected: Result shows the title and text of the picked tab, not the active one.
- **Desktop unpaired**
  1. Unpair; open dialog.
  - Expected: 'Choose a tab' is disabled.

**Where to look when it fails**

- Chrome picker status text; console '[SidePanel]' warnings.
- Desktop Recent activity row for 'browser_list_tabs' (shown under its command name because the label list omits it, BrowserToolsDialog.tsx:98-100).

**Hands-on test plans**

- Desktop: [70-qa/test-plans/desktop/064-browser-assistant-experience.md](../../70-qa/test-plans/desktop/064-browser-assistant-experience.md)
- Chrome: [70-qa/test-plans/chrome/064-browser-assistant-experience.md](../../70-qa/test-plans/chrome/064-browser-assistant-experience.md)

## 10. Gaps and dependencies

- **No explicit compare action or compare prompt; behaviour depends on the model.** Affects: Chrome. Evidence: side_panel.ts:15008-15060 attaches only. Work needed: Add a compare entry point and a test that asserts both tabs reach the request.
- **CLI and VS Code cannot choose a tab.** Affects: CLI, VS Code. Evidence: tool_catalog.rs:51-62. Work needed: Expose list tabs and a tab id on browser_read_page.
- **Desktop cloud-turn read cannot choose a tab.** Affects: Desktop. Evidence: device-tools.ts:361-363. Work needed: Add optional tab id.
- **Brief says desktop and chrome missing, code says present.** Affects: Knowledge base. Evidence: BrowserToolsDialog.tsx:341-377; side_panel.ts:14968-15060. Work needed: Correct brief rows S64.03 and S64.04.
- **The dialog lists one tab only; no multi-select.** Affects: Desktop. Evidence: BrowserToolsDialog.tsx:131-133. Work needed: Decide whether multi-tab is wanted on Desktop.
- Not built on: CLI (from the capability ledger).

**Depends on**

- surface:chrome
- surface:desktop
- surface:cli
- mode:cloud
- file:apps/extension/src/features/side-panel/tabContext.ts
- file:apps/web/features/desktop-host/components/BrowserToolsDialog.tsx
- store:chrome.storage.local
- SYS-agents-tools-and-automation
- SYS-execution-boundaries
- SYS-security-and-privacy
- F064-01

## Unknown

- Whether Chrome compare answers are tested end to end.
- The 'cap' size applied to the Desktop cloud read result.
- Whether the Desktop label list should include browser_list_tabs.
- Plan rules for the chat send.
