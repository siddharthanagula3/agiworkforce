---
id: "F041-07"
type: "feature"
title: "Private search and private browsing (not built)"
aliases: ["Incognito search", "Private search", "Private browsing", "Private browser session", "S41.12", "S41.13", "Private browser session that keeps no cookies or history"]
area: "41 Temporary and private experiences"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S41.12", "S41.13"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "SYS-security-and-privacy", "SYS-agents-tools-and-automation", "F041-11"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F041-07 Private search and private browsing (not built)

Not built on any app. The brief wants searches that are not saved to history and an agent browser session that keeps no cookies or history. No control, setting or code for either was found. Only the word 'incognito' exists, as a label on Temporary chat in Web. Chrome extension refuses incognito windows.

Area: [41. Temporary and private experiences](README.md). Requirement items: [S41.12](../../10-requirements/capabilities/041-temporary-and-private-experiences.md#s4112), [S41.13](../../10-requirements/capabilities/041-temporary-and-private-experiences.md#s4113).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Planned: (1) a mode where a search is not added to the person's search history; (2) a private browser session for the agent that discards cookies and history when it ends. Today neither exists. What does exist is a saved search history on Web and Mobile and a persistent browser profile for agent browsing in the internal Tauri desktop code (apps/desktop/src-tauri/src/automation/browser/playwright_bridge.rs:331).

**Why it exists.** The brief lists it as something the product should offer (brief S41.12 and S41.13). The product experience contract also names a 'Temporary/incognito' notice for Cloud Chat, so the idea is expected in the product (doc: docs/product/experience-contract.md).

**Who uses it.** A privacy-minded person on any app who does not want a search remembered, or who wants the agent to browse sites without leaving logins or history behind. [inferred]

**Problems it solves**

- Recent searches on Web and Mobile are kept until cleared, with no way to run one search unrecorded.
- Agent browsing on desktop reuses a dedicated profile on disk, so cookies from one agent run can stay for the next.

**Use cases**

- Look up a sensitive topic without it showing in recent searches.
- Let the agent open a site where it must sign in, and leave nothing behind.
- Run a research task that should not train the history list.

## 2. User experience

**Where to find it**

- No app has a control for it. Web: none. Desktop: none. Mobile: none. CLI: none. VS Code: none. Chrome: none (brief S41.12, S41.13 status missing on all six).
- Nearest things: Web shows 'Use incognito' and 'Exit incognito' labels for Temporary chat (apps/web/lib/temporary-chat-policy.ts:3). Web Global Search has a 'Clear search history?' action (apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:190). Mobile chat list shows 'Recent searches' (apps/mobile/src/features/chat/ChatsListScreen.tsx:109).

**Before you start**

- None, because nothing exists to use.

**Screens and controls**

- Nothing to tap, type or click for this feature.
- Related but different: Web Temporary chat switch 'Start new chats as temporary' (apps/web/features/settings/sections/PrivacySection.tsx:717).

**Journey**

1. A person looks for a private-search switch in the search box or in Settings and finds none.
2. Their searches are recorded as normal (Web and Mobile recent searches).
3. To remove them they must use 'Clear search history' on Web, or clear recent searches on Mobile.

**What the person sees and gets**

- No output for this feature. Web confirms a history clear with a toast such as 'Cleared {{count}} search from history' (apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:177).

**Settings**

- None for this feature. Web 'Start new chats as temporary' keeps chats out of history and search, but it does not change how a web search or agent browser runs (apps/web/lib/temporary-chat-policy.ts:33).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web keeps a recent-searches list on the server and can clear it (apps/web/features/chat/services/global-search-service.ts:318, apps/web/features/chat/services/global-search-service.ts:368). This is the thing incognito search would bypass.
- Mobile keeps up to five recent searches per mode in the device key-value store and can clear them (apps/mobile/src/features/search/recentSearches.ts:3, apps/mobile/src/features/search/recentSearches.ts:60).
- Chrome extension is installed with incognito not allowed and the agent tab list skips incognito tabs (apps/extension/manifest.json:9, apps/extension/src/background.ts:4668). This is a refusal, not a private mode.

**Incomplete**

- Web Temporary chat is called 'incognito' in two labels but only affects chat saving, not search or browsing (apps/web/lib/temporary-chat-policy.ts:3).

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Incognito search: missing on Web, Desktop, Mobile, CLI, VS Code and Chrome (brief S41.12).
- Private browser session: missing on all six apps (brief S41.13).
- Internal Tauri desktop agent browser uses a fixed on-disk profile folder named 'automation' under the app data folder, so it keeps cookies between runs (apps/desktop/src-tauri/src/automation/browser/playwright_bridge.rs:331). Whether the public Electron desktop has a comparable browser profile is unknown.

## 4. Required behaviour

**Established requirements**

- The user can run searches that are not saved to their history. (source: brief S41.12)
- The agent can browse in a private session that keeps no cookies or history afterward. (source: brief S41.13)
- Cloud Chat should show a Temporary/incognito notice; memory entries need an incognito exclusion. (source: doc: docs/product/experience-contract.md)

**Acceptance criteria**

1. With private search on, a search run on Web does not appear in the recent-searches list after reload.
2. With private search on, a search on Mobile does not add an entry to recent searches in either mode.
3. A private agent browser session starts with no cookies from earlier runs.
4. After the private session ends, no cookie or history file from it remains on the device.
5. The mode is visibly marked while on and off by default.
6. A private search does not weaken the Temporary chat promise and does not change where the query is processed (still disclosed).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A private browser session should use a throwaway profile folder that is deleted on exit, because the current automation profile is fixed and persistent. [inferred]
- Private search should be separate from Temporary chat because the two keep different data (chat text vs. search queries). [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'Private search' switch beside the search box on Web and Mobile that skips recording of the query.
- [proposed] Give agent browsing a 'Private session' option backed by a temporary profile that is deleted at the end of the run.
- [proposed] Decide whether Chrome should ever allow incognito, since the current manifest test says local storage is shared across profiles.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | globalSearchService | `apps/web/features/chat/services/global-search-service.ts` | Web search client: reads recent and popular searches, clears history. No private mode. |
| component | GlobalSearchDialog | `apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx` | Web search dialog with recent searches and a confirm-to-clear action. |
| endpoint | GET/POST /api/search | `apps/web/features/chat/services/global-search-service.ts` | Endpoint the Web client calls for recent searches and for running a search (path used in fetch calls). |
| store | recentSearches | `apps/mobile/src/features/search/recentSearches.ts` | Mobile device-side list of up to five recent searches per mode. |
| screen | ChatsListScreen | `apps/mobile/src/features/chat/ChatsListScreen.tsx` | Mobile chat list that shows 'Recent searches' and records queries. |
| service | cloudAccountTeardown | `apps/mobile/src/features/auth/services/cloudAccountTeardown.ts` | Clears Cloud recent searches when an account ends on Mobile. |
| config | Chrome manifest incognito rule | `apps/extension/manifest.json` | Declares incognito not allowed for the Chrome extension. |
| test | manifest-contract test | `apps/extension/__tests__/manifest-contract.test.ts` | Asserts incognito is not_allowed. |
| service | listDesktopBrowserTabs | `apps/extension/src/background.ts` | Lists only non-incognito web tabs for the desktop-driven browser. |
| service | default_automation_profile_dir | `apps/desktop/src-tauri/src/automation/browser/playwright_bridge.rs` | Picks the persistent profile folder the internal Tauri agent browser uses. |
| config | Temporary chat labels | `apps/web/lib/temporary-chat-policy.ts` | Holds the only 'incognito' labels in the product (Use incognito, Exit incognito). |
| service | account erasure search history | `apps/web/lib/server/account-erasure.ts` | Names search history among data removed on account erasure (match found by search; contents not opened). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Web: the person types a query; the client calls the search endpoint and the server can return it later in recent searches. | device and our servers | apps/web/features/chat/services/global-search-service.ts:318 [recording on POST is inferred from the recent-searches read] |
| Mobile: a query is saved to a local key-value list, keyed by mode and, for Cloud, by account. | device | apps/mobile/src/features/search/recentSearches.ts:35 |
| Internal Tauri desktop agent browser launches Chrome with a dedicated profile folder, so cookies persist between runs. | device | apps/desktop/src-tauri/src/automation/browser/playwright_bridge.rs:823 |
| Chrome extension never runs in incognito windows and hides them from the agent tab list. | device | apps/extension/manifest.json:9; apps/extension/src/background.ts:4668 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Web recent searches | server (Web endpoint), exact table unknown | Account-wide | Until the person clears it; named in account erasure (apps/web/lib/server/account-erasure.ts). |
| Mobile recent searches | store:mmkv key 'recent-searches:v1:<scope>' | No | Kept until cleared; wiped with all local data (apps/mobile/services/dsarExport.ts:455). |
| Internal Tauri agent browser profile | app data folder agiworkforce/browser-profiles/automation | No | No deletion at the end of a run was found. |

**Models and providers.** No model takes part in the missing feature. Web search and Deep Research send queries from AGI Cloud to a third-party search service (apps/web/features/settings/sections/PrivacySection.tsx:526 area text), so a private search mode would still have to say where the query goes.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not applicable, nothing is built. Web recent searches need a signed-in account (inferred from the per-user endpoint). |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | none found in the code. Mobile caps recent searches at 5 (apps/mobile/src/features/search/recentSearches.ts:3). |
| Feature flags | none found in the code |
| Model compatibility | none found in the code |
| Provider restrictions | none found in the code |
| Local mode | Mobile Local mode keeps its recent searches on the device only (apps/mobile/src/features/search/recentSearches.ts:7). No private-search or private-browser option exists in Local mode on any app. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Person looks for the control | None found; no empty or disabled placeholder control was found either. | searches for incognito, private browsing and in-private in apps/*, packages and crates returned only the items listed above |
| Chrome extension in an incognito window | The extension is not allowed there, so it does nothing; incognito tabs are left out of the tab list. | apps/extension/manifest.json:9; apps/extension/src/background.ts:4668 |
| Clearing history | Web asks 'Clear search history?' and reports success or 'Failed to clear search history'. | apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:190 |
| Offline, retry, cancel, timeout | not handled in the code for this feature because it does not exist | no code found |
| Accessibility | not handled in the code, no control exists | no code found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension/__tests__/manifest-contract.test.ts`: Chrome manifest keeps incognito not_allowed.

**Test scenarios**

- **Confirm no control exists**
  1. Open search on Web, Mobile, Desktop; open CLI and VS Code search commands.
  2. Look for a private or incognito option.
  - Expected: None is offered today. Any future control must be added to this page's acceptance criteria.
- **Recent search is recorded (baseline)**
  1. On Web run a search; reload; open Global Search.
  - Expected: The query shows under recent searches, which proves there is history for a private mode to skip.
- **Mobile recent search per mode**
  1. In Local mode search for a word; switch to Cloud; open search.
  - Expected: Local entry is not shown under Cloud scope (separate keys).
- **Chrome incognito**
  1. Allow the extension in incognito from Chrome settings if possible; open an incognito window.
  - Expected: Chrome does not offer the extension in incognito because of the manifest rule.
- **Agent browser profile persistence (internal Tauri)**
  1. Run an agent browser task that signs in; end it; run another task.
  - Expected: Cookies from the first run are still in the profile folder, proving no private session exists. Not run; a tester must do this.

**Where to look when it fails**

- Search the code for 'incognito' to confirm nothing new was added.
- Check the profile folder agiworkforce/browser-profiles/automation after a run on the internal Tauri build.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No incognito search on any app** Affects: Web, Desktop, Mobile, CLI, VS Code, Chrome. Evidence: brief S41.12; apps/web/features/chat/services/global-search-service.ts:318. Work needed: Design a private flag on search calls, skip recording, add a visible marker and tests.
- **No private browser session for the agent** Affects: Desktop (internal Tauri), CLI, Chrome, Web agent browsing. Evidence: brief S41.13; apps/desktop/src-tauri/src/automation/browser/playwright_bridge.rs:331. Work needed: Throwaway profile created per run and deleted at the end; explicit user choice; tests that nothing remains.
- **The word 'incognito' on Temporary chat could be read as covering search or browsing** Affects: Web users. Evidence: apps/web/lib/temporary-chat-policy.ts:3. Work needed: Keep the Temporary chat copy clear about what it covers, once private search exists.
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- SYS-security-and-privacy
- SYS-agents-tools-and-automation
- F041-11

## Unknown

- Whether the public Electron Desktop has an agent browser profile and where it is stored.
- Which database table holds Web recent searches.
- Whether the Web search endpoint records every query or only some.
- Whether CLI or VS Code have any search history at all (not searched in depth).
