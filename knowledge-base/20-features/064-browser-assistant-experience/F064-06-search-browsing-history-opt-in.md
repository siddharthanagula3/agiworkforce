---
id: "F064-06"
type: "feature"
title: "Search browsing history (opt-in)"
aliases: ["Search browsing history (opt-in)", "Browser history context where explicitly enabled (S64.09)", "Browsing history (settings row)", "browser_search_history"]
area: "64 Browser-assistant experience"
available_on: ["chrome"]
implementation: {web: "n/a", desktop: "missing", mobile: "n/a", cli: "missing", vscode: "n/a", chrome: "built"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S64.09"]
depends_on: ["surface:chrome", "mode:cloud", "file:apps/extension/src/features/computer-use/historySearch.ts", "file:apps/extension/src/side_panel.ts", "file:apps/extension/manifest.json", "store:chrome.storage.local", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "SYS-authorization-and-workspaces", "SYS-execution-boundaries", "F064-05"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F064-06 Search browsing history (opt-in)

In Chrome, when the person turns on 'Browsing history' in Extension settings, the assistant may search the last days of history for a page they visited before. Each search shows a card with Allow this search or Decline. Only titles and addresses are returned. It is built and tested in Chrome; the brief wrongly says missing.

Area: [64. Browser-assistant experience](README.md). Requirement items: [S64.09](../../10-requirements/capabilities/064-browser-assistant-experience.md#s6409).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | not built | not built | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Gives the Chrome chat a tool that searches the person's Chrome history by words, returns up to 20 titles, addresses and visit times, and asks the person to allow every single search.

**Why it exists.** Brief item S64.09: when the user turns it on, the assistant can use browsing history as context. Project requirement: browser history access only by explicit request, no always-allow history (doc: docs/product/requirements.md:1207).

**Who uses it.** Chrome users who say 'find the flight page I saw last week'.

**Problems it solves**

- Finding a page seen earlier without remembering the address.
- Keeping history private: nothing is read without a per-search yes.

**Use cases**

- Ask 'what was that hotel page I read on Tuesday'.
- Ask 'find the docs page I had open yesterday about billing'.

## 2. User experience

**Where to find it**

- Extension settings, Permissions: a row titled 'Browsing history' with a switch (apps/extension/src/options.ts:1333; apps/extension/src/features/options/history-access-row.ts:28-80; label apps/extension/_locales/en/messages.json:4893).
- In the side panel, the card 'AGI wants to search your browsing history' (messages.json:4841; apps/extension/src/features/side-panel/bubbles.ts:1441-1478).

**Before you start**

- Signed in to AGI; a model that supports chat tools (side_panel.ts:9310-9312).
- The Chrome optional permission 'history' granted by the switch (apps/extension/manifest.json:31).
- Not in the unattended mode called yolo (side_panel.ts:8204).

**Screens and controls**

- Settings row: label 'Browsing history', hint 'Let AGI ask to search your Chrome history when a question needs a page you visited before. It asks before every search, and only matching titles and addresses are sent.', status 'On. AGI can ask to search your history.' or 'Off. AGI cannot search your history.' or 'Chrome did not grant history access.' (messages.json:4893-4912).
- Approval card: line 'Looking for "<words>" in the last <n> days' (or 'last day'), body 'Titles and addresses of matching pages are sent to AGI Cloud for this answer only. AGI asks again for every search.', buttons 'Allow this search' and 'Decline' (messages.json:4845-4881, 4306; bubbles.ts:1441-1478).

**Journey**

1. Person turns on 'Browsing history' in settings; Chrome shows its permission prompt.
2. In the side panel, the person asks something that needs a past page.
3. The model calls browser_search_history with words and optional days.
4. The panel shows the approval card; the person presses 'Allow this search' or 'Decline'.
5. On allow, Chrome searches history; results are filtered and returned to the model as untrusted data.
6. The model answers using the titles and addresses.

**What the person sees and gets**

- An activity line 'Searching browsing history' then done or an error (side_panel.ts:8209-8252).
- The model receives text such as 'N pages from the last D days of browsing history match "words":' with numbered titles, addresses and visit times, or 'No pages in the last D days ... match' (historySearch.ts:142-154).
- Model-facing refusal texts when off, declined or unattended (messages.json:4885-4892, 5198).

**Settings**

- The 'Browsing history' switch; turning it off gives the permission back to Chrome (history-access-row.ts:72-82).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Optional permission 'history' in the manifest (manifest.json:31) and a settings row that requests or removes it, refreshing when the window gains focus (history-access-row.ts:28-95).
- Tool definition browser_search_history with query up to 200 characters and days 1 to 90, default 30 (historySearch.ts:9-42, 49-68).
- The tool is added to the chat tools only when history access is on, and it is offered even on pages that cannot be read (chatBrowserTools.ts:79-90; apps/extension/__tests__/browser-history-search.test.ts:33-48).
- Approval card for every search, with Decline; the dialog is dismissed with the stream (side_panel.ts:8173-8197; bubbles.ts:1441-1478).
- Search scans up to 200 items, sorts newest first, removes duplicate addresses, redacts credentials, fragments and secret-looking query values, returns at most 20 (historySearch.ts:11-15, 83-98, 113-140).
- Entries on sites the person blocked, or that the organisation policy forbids, are left out; if the organisation policy cannot be read the search is refused (historySearch.ts:104-131).
- Results are wrapped as untrusted data (side_panel.ts:8253) and the tool description tells the model to ignore instructions in them (historySearch.ts:24).

**Incomplete**

- The settings row and the card were not shown in a running browser; only code and unit tests were read.
- Titles and addresses go to AGI Cloud with the answer; no way to limit to addresses only.

**Present but disconnected or switched off**

- Off by default: the tool is withheld until the person grants the permission (chatBrowserTools.ts:89; manifest.json:31).

**Not available**

- Desktop and CLI: no history search. The Desktop and CLI command named browser_history is back and forward navigation, not history search (apps/desktop/electron/browser/commandGate.ts:262-275 region; apps/cli/src/platform/runtime/tool_catalog.rs:206-209).
- Web, Mobile, VS Code: not applicable.

## 4. Required behaviour

**Established requirements**

- When the user turns it on, the assistant can use their browsing history as context (S64.09). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S64.09)
- Browser history access only by explicit request; no always-allow history. (source: (doc: docs/product/requirements.md:1207))
- Page content is untrusted; browser data must not enter global memory or synced chat by default. (source: (doc: docs/product/requirements.md:1213-1214))

**Acceptance criteria**

1. With the setting off, the chat tool list has no history tool and a call returns the 'turned off' text.
2. Turning the switch on asks Chrome for the history permission; refusing leaves it off with 'Chrome did not grant history access.'
3. Every history search shows the approval card; Decline returns the declined text and runs nothing.
4. Results hold at most 20 entries, newest first, one per address.
5. Secret-looking query values are replaced by 'redacted' and fragments and credentials are removed.
6. Blocked sites and policy-forbidden sites are absent; an unreadable organisation policy refuses the search.
7. In unattended mode the search is skipped with the unattended text.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief rows 'chrome missing' and 'desktop and cli missing': Chrome part is wrong, Desktop and CLI part is right [inferred from the code].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Correct the brief row S64.09 for Chrome.
- [proposed] Offer an addresses-only option.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | historySearch module | `apps/extension/src/features/computer-use/historySearch.ts` | Tool definition, parser, redaction, search, descriptions, permission calls (lines 9-184). |
| service | chatBrowserToolDefinitions | `apps/extension/src/features/computer-use/chatBrowserTools.ts` | Adds the history tool when allowed (lines 79-90) and parses calls (line 112 'search_history'). |
| service | runHistorySearchTool | `apps/extension/src/side_panel.ts` | Permission, mode, approval and search sequence (line 8198). |
| service | confirmHistorySearch | `apps/extension/src/side_panel.ts` | Shows the card and waits (line 8173). |
| component | buildHistorySearchCard | `apps/extension/src/features/side-panel/bubbles.ts` | The approval card (lines 1441-1478). |
| component | createHistoryAccessRow | `apps/extension/src/features/options/history-access-row.ts` | Settings switch for the permission. |
| screen | Extension options | `apps/extension/src/options.ts` | Mounts the row in the Permissions section (line 1333). |
| config | optional_permissions history | `apps/extension/manifest.json` | Optional history permission (line 31). |
| service | background tool hand-off | `apps/extension/src/background.ts` | Rebuilds the tool list with browserHistory for resumed turns (lines 869-872, 8068-8071). |
| service | hasHistoryPermission use | `apps/extension/src/side_panel.ts` | Reads the permission when sending a turn (lines 8596, 9310). |
| service | site policy | `packages/contracts/types (evaluateSitePolicy, SITE_POLICY_ADMIN_UNAVAILABLE)` | Policy check used on each result (historySearch.ts:1-5, 108, 125-129). |
| config | messages for history | `apps/extension/_locales/en/messages.json` | All visible history texts (lines 4841-4912, 5198). |
| test | browser-history-search tests | `apps/extension/__tests__/browser-history-search.test.ts` | Tool offer, arguments, results, settings row, card. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The model asks for browser_search_history; the panel checks the permission and the mode. | device | apps/extension/src/side_panel.ts:8203-8205 |
| The panel shows the approval card and waits for Allow or Decline. | device | side_panel.ts:8173-8197 |
| On allow, Chrome's history API is queried inside the browser and filtered by site policy and the blocklist. | device | historySearch.ts:100-140, 180-184 |
| The result text is returned to the model, so titles and addresses leave the device with the answer request. | our servers | messages.json:4874 (body text); side_panel.ts:8253 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| History entries returned (title up to 300 characters, redacted address, visit time) | In the tool result of the current turn | With the chat if the chat syncs; whether tool results are stored: unknown | Chrome keeps its own history; the extension copies nothing on its own |
| The history permission | Chrome (optional permission) | No | Removed when the switch is turned off (history-access-row.ts:72-82) |

**Models and providers.** The tool needs a model that supports tools (side_panel.ts:9310-9312). The route is AGI Managed Cloud (background.ts:8061).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in Chrome chat is needed (side_panel.ts:9310-9312 requires tool-capable chat). |
| Permissions | Chrome optional permission 'history' plus a per-search approval; blocked sites and organisation policy filter results. |
| Subscription | none found in the code for the history tool; chat send outcomes at background.ts:9041-9044. |
| Limits and metering | Query 200 characters, 1 to 90 days, default 30, 20 results, 200 scanned (historySearch.ts:11-15). |
| Feature flags | The Chrome permission acts as the switch; no other flag found. |
| Model compatibility | Offered only when the selected model supports chat tools (side_panel.ts:9310-9312). |
| Provider restrictions | Managed Cloud only. |
| Local mode | Not available; Chrome chat has no Local mode (background.ts:8061). The history search itself runs in the browser but its result is sent to Managed Cloud. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Setting off | Tool absent; if called, text tells the person where to turn it on | chatBrowserTools.ts:89; side_panel.ts:8203; messages.json:4889 |
| Waiting for the person | Card with Allow this search and Decline; focus on the first button | side_panel.ts:8173-8197 |
| Declined | Model told not to ask again in this answer | side_panel.ts:8205; messages.json:4885 |
| Unattended mode | Search skipped | side_panel.ts:8204; messages.json:5198 |
| No match | 'No pages in the last N days of browsing history match ...' | historySearch.ts:146-148 |
| Policy unreadable | Error 'Your organization’s site policy could not be read, so history was not searched.' | historySearch.ts:108-112 |
| Chrome refuses the permission | Status 'Chrome did not grant history access.' | history-access-row.ts:78; messages.json:4909 |
| Stream ends while card open | Card dismissed as a decline | side_panel.ts:8174-8188 (pendingSiteGrants) |
| Timeout, offline, retry | not handled in the code beyond the error text returned to the model | Looked at historySearch.ts:100-140 and side_panel.ts:8240-8252; only a catch that returns the error message was found |
| Accessibility | Card is a group with aria-labelledby; settings row has role=status, aria-live polite and labelled switch | bubbles.ts:1447-1452; history-access-row.ts:38-60 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/browser-history-search.test.ts`: History tool offered only when on; arguments; redaction, order, cap of 20, blocked and policy sites, unreadable policy; no-match text; settings row request and removal; approval card (describes at lines 33, 51, 75, 154, 222).
- `apps/extension/__tests__/side-panel-chat-browser-tools.test.ts`: Runs nothing and asks nothing while history is off (line 898); allow, decline and sequential searches (lines 900-992); results left out for blocked sites (line 983).
- `apps/extension/__tests__/background-chat-tool-handoff.test.ts`: Tool list rebuilt with the history tool (line 384).
- `apps/extension/__tests__/composer-browser-task.test.ts`: History permission dependency in browser task turns (lines 1058, 1080).
- `apps/extension/__tests__/manifest-permission-usage.test.ts`: Only historySearch.ts may use the history permission (lines 182-188).

**Test scenarios**

- **Turn the setting on**
  1. Open Extension settings, Permissions.
  2. Switch 'Browsing history' on; accept Chrome's prompt.
  - Expected: Status 'On. AGI can ask to search your history.'
- **Allowed search**
  1. Ask 'find the page I read about flights last week'.
  2. Press 'Allow this search'.
  - Expected: Activity 'Searching browsing history' then an answer naming pages; no more than 20 listed.
- **Declined search**
  1. Repeat and press Decline.
  - Expected: No history read; the model answers without it.
- **Setting off**
  1. Switch the setting off; ask the same question.
  - Expected: No card; the answer says history search is off.
- **Secret in address**
  1. Visit a page with ?token=abc in the address; search for it.
  - Expected: The address in the result shows token=redacted.
- **Blocked site**
  1. Block a site; search for a page on it.
  - Expected: That page is not listed.

**Where to look when it fails**

- Activity line text 'Searching browsing history' and its error output (side_panel.ts:8209-8252).
- Chrome extension page chrome://extensions to see the optional permission.
- Test file manifest-permission-usage.test.ts when the permission is used elsewhere.

**Hands-on test plans**

- Chrome: [70-qa/test-plans/chrome/064-browser-assistant-experience.md](../../70-qa/test-plans/chrome/064-browser-assistant-experience.md)

## 10. Gaps and dependencies

- **The brief says Chrome is missing; the feature is built, connected and tested.** Affects: Knowledge base readers. Evidence: historySearch.ts; side_panel.ts:8198; options.ts:1333. Work needed: Correct brief row S64.09 for Chrome; keep Desktop and CLI as missing.
- **Desktop and CLI have no history search.** Affects: Desktop, CLI. Evidence: BROWSER_TOOLS list has no history search (tool_catalog.rs:51-62). Work needed: Decide whether it is wanted; if so, build it behind the same per-search approval.
- **Titles and addresses go to AGI Cloud; no addresses-only option.** Affects: Chrome. Evidence: messages.json:4874. Work needed: Optional [proposed] control.
- **Not shown running in a real browser.** Affects: Chrome. Evidence: Only unit tests exist. Work needed: Run the scenarios and record results.
- Not built on: Desktop, CLI (from the capability ledger).

**Depends on**

- surface:chrome
- mode:cloud
- file:apps/extension/src/features/computer-use/historySearch.ts
- file:apps/extension/src/side_panel.ts
- file:apps/extension/manifest.json
- store:chrome.storage.local
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- SYS-authorization-and-workspaces
- SYS-execution-boundaries
- F064-05

## Unknown

- Whether history tool results are kept in the saved or synced chat.
- Plan rules for the chat send.
- Behaviour with other Chromium browsers.
- Whether any run in a real Chrome has confirmed the card and the settings row.
