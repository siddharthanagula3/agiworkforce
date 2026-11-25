---
id: "F074-04"
type: "feature"
title: "Attach tabs and page chips"
aliases: ["Tab context picker", "Attach tabs", "@ mention menu", "Page chips", "Page-context chips", "Multi-tab context", "S74.09", "S74.10", "S74.12"]
area: "74 Browser extension"
available_on: ["chrome"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "partial"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S74.09", "S74.10", "S74.12"]
depends_on: ["surface:chrome", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-memory-projects-and-context", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "F074-03", "F074-06"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F074-04 Attach tabs and page chips

In the Chrome extension the person attaches one or more open tabs as context, from the 'Attach tabs' picker or by typing @ in the composer. Each attached page shows as a chip that can be refreshed or removed. Several tabs are merged into one context, up to five attachments in total. There is no dedicated compare action.

Area: [74. Browser extension](README.md). Requirement items: [S74.09](../../10-requirements/capabilities/074-browser-extension.md#s7409), [S74.10](../../10-requirements/capabilities/074-browser-extension.md#s7410), [S74.12](../../10-requirements/capabilities/074-browser-extension.md#s7412).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the person choose which open tabs of the current window feed the next message, shows each as a chip, and merges their text under Tab headings. (apps/extension/src/features/side-panel/tabContext.ts:52-130; apps/extension/src/side_panel.ts:1845-1870, 14968-15060)

**Why it exists.** Brief items S74.09 (pick which open tabs to add), S74.10 (compare content across tabs) and S74.12 (attached context shows as a chip that can be seen and removed). The brief marks the picker and comparison missing but the code has them, see gaps. (doc: knowledge-base/data/area-briefs/074-browser-extension.md)

**Who uses it.** Chrome extension users researching across several pages.

**Problems it solves**

- Compare product pages, docs or articles side by side.
- See exactly which pages will be sent.
- Remove or refresh one page without losing the others.

**Use cases**

- Open three shop pages, attach them and ask which is cheapest.
- Type @ and a few letters of a tab title to attach that tab.
- Refresh a chip after the page changed.
- Type @ and pick a project to move the chat into it.

## 2. User experience

**Where to find it**

- surface:chrome side panel: plus (attach) menu item 'Attach tabs' (apps/extension/_locales/en/messages.json:339-341).
- surface:chrome composer: type @ for a menu with headings 'Tabs' and 'Projects' (messages.json:1788-1802).
- surface:chrome attachment bar above the composer: page chips with a 'Refresh' button and a remove x (apps/extension/src/side_panel.ts:10651-10716).
- Menu item shows '$COUNT$ tab attached' or '$COUNT$ tabs attached' (messages.json:775-790).

**Before you start**

- Signed in with chat ready; the @ menu opens only then (side_panel.ts:14449-14451).
- Pages must be http or https, without embedded user names or passwords (tabContext.ts:26-50).
- Chrome site access for each page; it is requested when attaching (side_panel.ts:14305-14315, 15001-15008).

**Screens and controls**

- Dialog 'Attach tabs' with the text 'Choose up to N tabs from this window. Only the selected pages are sent as context when you send your message.' and buttons 'Cancel' and 'Attach selected tabs' (tabContext.ts:86-106).
- @ menu: listbox with tab titles and hosts; arrow keys, Enter or Tab to accept, Escape to close (side_panel.ts:14529-14560).
- Chip: title, 'Snapshot · host', 'Refresh', remove.

**Journey**

1. 1. Open the plus menu and choose 'Attach tabs', or type @ in the composer.
2. 2. The dialog or menu lists open tabs of the current window (side_panel.ts:14472-14482).
3. 3. Choose tabs. Chrome may ask for site access for sites not yet allowed.
4. 4. Each page is read and checked; failures are counted and explained (side_panel.ts:15009-15066).
5. 5. Chips appear; the context is merged with a 'Tab <id>: <title> (<origin>)' heading per tab (side_panel.ts:1860-1880).
6. 6. Type a question such as 'compare these' and send.

**What the person sees and gets**

- Chips; notices: 'Wait for the reply to finish before attaching a tab.', 'Remove the current page or selection before attaching tabs.', 'Remove an attachment before adding another tab.', 'Tabs could not be attached. Try again.', 'AGI can read $SITE$ only after you allow it. Nothing from that page was attached.' (messages.json:399-401, 1804-1827).
- After a refresh: a 'snapshot refreshed' notice (side_panel.ts:10634).

**Settings**

- No setting; limit is a constant of 5 attachments (freeTrialClient.ts:103).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Tab picker dialog with checkboxes, focus handling, Escape and an abort signal (tabContext.ts:69-200).
- @ menu with tab and project groups, filtering by title or URL, keyboard navigation (side_panel.ts:14350-14560).
- Attachment limit shared with files: 5 in total (side_panel.ts:14274-14292, 14985-14990; freeTrialClient.ts:103, 544-565).
- Snapshots are merged and shared out of the 30,000 character budget (side_panel.ts:1860-1880, 15003).
- Each page is read again to check it did not change before it is kept (side_panel.ts:15039-15055).
- Chips show title or selection, can be refreshed when the page document is known, and can be removed (side_panel.ts:10595-10716).
- Read access for chosen tabs is released after capture unless the site was already approved (features/side-panel/readGrant.ts:31-75).

**Incomplete**

- There is no dedicated 'compare tabs' action; comparison is the model answering over merged text. [inferred] (side_panel.ts:1860-1880)
- Tabs from other windows cannot be picked; the list is the current window (side_panel.ts:14472).

**Present but disconnected or switched off**

- none found.

**Not available**

- Other apps; attaching tabs while a reply streams; attaching tabs together with a current-page snapshot that has no document id.

## 4. Required behaviour

**Established requirements**

- The user picks which open tabs to add as context. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S74.09)
- The extension compares content across several tabs. (source: S74.10 (same brief); status chrome missing)
- Attached page context shows as a visible chip the user can see and remove. (source: S74.12 (same brief); status chrome done)

**Acceptance criteria**

1. 'Attach tabs' lists the open web tabs of this window and attaches the chosen ones as chips.
2. Typing @ plus part of a title filters the list; Enter attaches the highlighted tab.
3. The sixth attachment (tabs plus files) is refused with 'Remove an attachment before adding another tab.'
4. Removing a chip removes that tab from the next message.
5. A tab that changed after selection is skipped and counted.
6. A tab whose site access is refused attaches nothing and says so.
7. While a reply streams, attaching is refused.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- S74.09 and S74.12 look met by the code; S74.10 is partly met through merged context. The brief's 'missing' status for S74.09 appears out of date. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Update the brief status for S74.09 and decide whether S74.10 needs a dedicated compare control.
- [proposed] Allow picking tabs from other windows.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | Tab picker dialog | `apps/extension/src/features/side-panel/tabContext.ts` | chooseBrowserContextTabs and chooseBrowserTabs dialog (52-200). |
| service | toBrowserContextTab | `apps/extension/src/features/side-panel/tabContext.ts` | Accepts only http or https tabs without credentials (26-50). |
| component | Attach tabs menu item | `apps/extension/src/side_panel.ts` | Plus menu item and its click flow (14968-15066). |
| component | @ mention menu | `apps/extension/src/side_panel.ts` | Menu, filtering, keyboard, accept (14350-14560). |
| service | canAttachMentionedTab / attachMentionedTab | `apps/extension/src/side_panel.ts` | Rules and read flow for one @ tab (14274-14340). |
| store | pendingBrowserContextTabs | `apps/extension/src/side_panel.ts` | In-memory tab snapshots (1845-1895). |
| service | setBrowserTabSnapshots | `apps/extension/src/side_panel.ts` | Merges snapshots into one context text with headings (1860-1880). |
| component | renderPendingPageChip | `apps/extension/src/side_panel.ts` | Chip with Refresh and remove (10651-10716). |
| service | refreshBrowserSnapshot | `apps/extension/src/side_panel.ts` | Re-reads a chip's page (10595-10649). |
| service | updateContextButton | `apps/extension/src/side_panel.ts` | Menu label with tab count (9865-9885). |
| service | requestReadGrant | `apps/extension/src/features/side-panel/readGrant.ts` | Temporary Chrome site access for a read, released afterwards (31-75). |
| config | MANAGED_CHAT_MAX_ATTACHMENTS | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Limit of 5 attachments (103, 544-565). |
| service | capturePageContext | `apps/extension/src/side_panel.ts` | Reads each tab (6486). |
| service | projects client | `apps/extension/src/features/cloud-bridge/projectsClient.ts` | Supplies the Projects group in the @ menu (listChromeProjects used at side_panel.ts:14485-14494). |
| config | tab strings | `apps/extension/_locales/en/messages.json` | Menu, notices and chip labels. |
| test | side_panel-attachment-caps test | `apps/extension/__tests__/side_panel-attachment-caps.test.ts` | Attachment cap rules (29 tests). |
| test | read-grant test | `apps/extension/__tests__/read-grant.test.ts` | Temporary read grants (8 tests). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The picker or @ menu lists tabs from Chrome for the current window. | device | apps/extension/src/side_panel.ts:14472-14482 |
| Chrome shows its site access prompt for pages not yet allowed. | device | apps/extension/src/features/side-panel/readGrant.ts:31-75 |
| Each tab text is read, cleaned, capped and re-checked for change. | device | side_panel.ts:15009-15055 |
| Snapshots are merged into one context string with Tab headings. | device | side_panel.ts:1860-1880 |
| On send, the merged text goes to AGI Managed Cloud with the question. | our servers | freeTrialClient.ts:112; doc: apps/extension/docs/threat-model.md:23 |
| The @ menu fetches the person's projects from AGI servers. | our servers | apps/extension/src/side_panel.ts:14485-14494 (listChromeProjects) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Tab snapshots (text, title, URL, tab id) | In panel memory only until sent | no | Cleared on send, on removal or on conversation reset (side_panel.ts:1888-1895). |
| Page references (title, origin) on the sent message | Saved conversation in chrome.storage.local | with the conversation if mirrored | Stored up to 8 page references per message (conversation-history.ts:75). |

**Models and providers.** No model is involved until the person sends; then Managed Cloud handles the turn. The extension has no provider choice.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in with ready chat; the @ menu needs a managed account owner (side_panel.ts:14449-14451, 14975-14976). |
| Permissions | tabs, scripting and per-site host permissions; read grants are temporary (readGrant.ts). |
| Subscription | Attaching is device-side with no plan check found; sending is admitted by our servers (background.ts:9040-9044). |
| Limits and metering | 5 attachments in total (freeTrialClient.ts:103); 30,000 characters split among tabs (side_panel.ts:15003). |
| Feature flags | none found in the code. |
| Model compatibility | unknown. |
| Provider restrictions | Managed Cloud only. |
| Local mode | No Local mode in the extension; tab text is read on the device but the answer needs Managed Cloud. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Reply streaming | Refused with 'Wait for the reply to finish before attaching a tab.' | side_panel.ts:14275-14278 |
| Current page or selection already attached | Picker converts a current page snapshot if it has a document id; otherwise 'Remove the current page or selection before attaching tabs.' | side_panel.ts:1847-1858, 14279-14281, 14980-14984 |
| Limit reached | 'Remove an attachment before adding another tab.' | side_panel.ts:14283-14288, 14985-14990 |
| Draft changed while reading | Tab not attached, notice shown. | side_panel.ts:14320-14323 |
| Site access refused | Notice that nothing was attached. | side_panel.ts:14308-14313 |
| Tab closed or changed | Skipped and counted in a plural notice. | side_panel.ts:15034-15066 |
| Account changes mid-read | Operation cancelled. | side_panel.ts:14984-14996 |
| Empty list | not handled in the code beyond an empty menu; the dialog shows 'Loading open tabs…' first. | tabContext.ts:92-95 |
| Accessibility | Dialog has role dialog, aria-modal, labelled heading, focus trap and restore; menu is a listbox with aria-activedescendant. | tabContext.ts:73-84, 190-210; side_panel.ts:14350-14357, 14397 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/side_panel-attachment-caps.test.ts`: Attachment cap logic (29 tests; detail not read).
- `apps/extension/__tests__/read-grant.test.ts`: Temporary site read grants (8 tests).
- `apps/extension/__tests__/side-panel-page-context-capture.test.ts`: Page capture (16 tests).
- `apps/extension/__tests__/page-chip-label.test.ts`: Chip label text (name only).
- `apps/extension/__tests__/side-panel-selection-chip.test.ts`: Selection chip (6 tests).
- `apps/extension/__tests__/tab-cleanup.test.ts`: Close tabs picker sharing the dialog (name only).
- `apps/extension/__tests__/composer-menu-ime.test.ts`: Composer menus with IME input; it mentions the mention menu (name and grep only).

**Test scenarios**

- **Picker**
  1. Open three web tabs in one window.
  2. Plus menu then 'Attach tabs', tick two, press 'Attach selected tabs'.
  - Expected: Two chips appear and the menu item reads '2 tabs attached'.
- **@ filter**
  1. Type @ and part of a tab title, press Enter.
  - Expected: That tab is attached as a chip and the @ text is removed.
- **Limit**
  1. Attach files and tabs until the total is five, then try another tab.
  - Expected: 'Remove an attachment before adding another tab.'
- **Remove chip**
  1. Attach two tabs and remove one with x, then send.
  - Expected: Only the other tab's text is in the context.
- **Changed page**
  1. Select a tab in the dialog, navigate that tab elsewhere before confirming.
  - Expected: The tab is skipped and counted.
- **Refresh**
  1. Attach a page, change its content, press Refresh on the chip.
  - Expected: 'Snapshot refreshed' notice and new text.

**Where to look when it fails**

- Panel notices quoted above.
- Console warnings from side_panel.ts around attach failures (spAttachTabsFailed text).
- chrome://extensions site access list for leftover grants.

**Hands-on test plans**

- Chrome: [70-qa/test-plans/chrome/074-browser-extension.md](../../70-qa/test-plans/chrome/074-browser-extension.md)

## 10. Gaps and dependencies

- **Brief says tab picker (S74.09) and multi-tab comparison (S74.10) are missing, but a picker and merged context exist.** Affects: documentation and planning for surface:chrome. Evidence: apps/extension/src/features/side-panel/tabContext.ts:52-130; side_panel.ts:1860-1880. Work needed: Correct the brief status; decide if a dedicated compare control is needed.
- **Only tabs of the current window can be attached.** Affects: surface:chrome multi-window users. Evidence: side_panel.ts:14472 uses pageWindowQuery. Work needed: Optional all-windows list.
- **Text of each tab is shortened as the number of tabs grows (30,000 total).** Affects: surface:chrome users comparing long pages. Evidence: side_panel.ts:15003. Work needed: Product decision on budgets.

**Depends on**

- surface:chrome
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-memory-projects-and-context
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- F074-03
- F074-06

## Unknown

- Contents of side_panel-attachment-caps, page-chip-label and composer-menu-ime tests were not read.
- Whether tab text appears in mirrored conversations on our servers.
- Behaviour when two windows are open and the panel is a separate assistant window (pageWindowQuery covers it but was not tested here).
