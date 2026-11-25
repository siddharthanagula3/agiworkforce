---
id: "F088-01"
type: "feature"
title: "Help centre and help links"
aliases: ["Help centre", "Help center", "Searchable help center (S88.02)", "Contextual help links (S88.01)", "Get help", "HelpSearch", "HelpArticleLink", "Help Center row"]
area: "88 Support, trust, and policy product"
available_on: ["web", "desktop", "mobile", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "missing", vscode: "built", chrome: "partial"}
verification: {web: "seen working", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S88.01", "S88.02"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:vscode", "surface:chrome", "api:GET /api/help/search", "file:apps/web/lib/support/agent/corpus.generated.json", "SYS-api-and-contracts", "SYS-shared-ui-and-design", "SYS-observability-and-operations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F088-01 Help centre and help links

A public help centre on the web app with a search box that finds articles as you type, plus small links inside settings screens (web, mobile, VS Code, Chrome) that open the article for that screen. Desktop and the extensions open the web help centre. CLI has no help search.

Area: [88. Support, trust, and policy product](README.md). Requirement items: [S88.01](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8801), [S88.02](../../10-requirements/capabilities/088-support-trust-and-policy-product.md#s8802).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | seen working |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets a person search help articles (the page /help calls the search API /api/help/search) and browse them by collection. Settings screens carry a link such as 'How memory works' that opens the matching article. Retrieval is a keyword ranking (BM25) over a built help corpus, with no model call (comment: apps/web/app/api/help/search/route.ts:16-24).

**Why it exists.** So a person can solve a problem without writing to support, and so every screen that needs explaining points at one canonical article. The brief states 'Users can search a help centre and open matching articles' and 'Screens that need explaining link straight to the matching help or docs article' (doc: knowledge-base/data/area-briefs/088-support-trust-and-policy-product.md, S88.01 and S88.02).

**Who uses it.** Any visitor (the /help page and the search API are public and need no sign-in: no auth call in apps/web/app/api/help/search/route.ts:47-96) and any signed-in user in a settings screen.

**Problems it solves**

- People cannot find the article that explains a setting.
- An empty search result looks the same as a broken index; the API reports corpus 'available' or 'unavailable' so the page can say which (apps/web/app/api/help/search/route.ts:64-72).
- Searching help must keep working when the support assistant is turned off (route comment, apps/web/app/api/help/search/route.ts:16-24).

**Use cases**

- A user opens Help and types 'billing' to find the plans article.
- A user in Settings, Memory clicks 'How memory works' and lands on the memory article.
- A person on the phone app taps 'How plans and billing work' style links and reads the article in an in-app browser.
- On a non-help screen the account menu 'Get help' opens /help pre-searched for that area (apps/web/lib/support/help-entry-points.ts:93-96).

## 2. User experience

**Where to find it**

- Web: account menu, 'Get help' submenu, 'Get help' item opens /help; on routes under billing, work, connectors, workspace or admin it opens /help with a prefilled query (apps/web/shared/components/layout/AccountMenuItems.tsx:91-97, apps/web/shared/components/layout/WebAppShell.tsx:514, apps/web/lib/support/help-entry-points.ts:93-96). Also Settings, Help, link 'Help center' (apps/web/features/settings/sections/HelpSection.tsx:31-36).
- Web contextual links: 'How memory works', 'How plans and billing work', 'How privacy controls work', 'Sessions, email and API keys', 'Choosing a model and effort', 'Learn more about usage limits', 'How workspaces work', 'How voice works', 'How sharing works', 'How account security works' (apps/web/features/settings/sections/MemorySection.tsx:244, BillingSection.tsx:718, PrivacySection.tsx:423, AccountSection.tsx:440, GeneralSection.tsx:518, UsageSection.tsx:1285, TeamSection.tsx:669, VoiceSection.tsx:78, SharedLinksSection.tsx:312, SecuritySection.tsx:237).
- Desktop: Help menu items '<Desktop product name> Help' and '<Desktop product name> Support' open the web pages /help and /support in the system browser (apps/desktop/electron/appMenu.ts:549-551, apps/desktop/electron/main.ts:2263-2273, apps/desktop/electron/windowPolicy.ts:82-91). Inside the desktop window the hosted web app is shown, so the web links also appear there [inferred from AGENTS.md section 5: public Desktop shows the hosted web app].
- Mobile: Settings, Support section, row 'Help Center' (apps/mobile/src/features/settings/index.tsx:886-892); About screen, Support card, row 'Help Center' (apps/mobile/app/(app)/about.tsx:271-276). Contextual links 'How memory works', 'How schedules work', 'How connectors work', 'How voice works', 'How projects work', 'How privacy controls work', 'How account security works', 'Learn more' (apps/mobile/src/features/support/HelpArticleLink.tsx:43, apps/mobile/src/features/settings/Common.tsx:56).
- VS Code: Help quick pick item '$(question) Help center' and '$(book) Documentation' (apps/extension-vscode/src/features/help/helpMenu.ts:19-29).
- Chrome extension: Options page, Help section, rows 'Help center' and 'Documentation' with 'Open' links (apps/extension/src/options.ts:2028-2037).
- CLI: no help search found (grep of apps/cli/src found no help-centre search).

**Before you start**

- None for the web help page and search.
- A network connection: help is hosted on the web app.
- Mobile article links open the web page with an embedded-page marker so purchase articles stay out of the phone view (apps/mobile/src/platform/webContentPage.ts:9-13, apps/web/app/api/help/search/route.ts:61).

**Screens and controls**

- Web /help: hero titled 'Get unstuck, fast.', search field labelled 'Search the help centre' with placeholder 'Search help articles', a list of collections, buttons 'Read the FAQ', 'Get support', 'Email us' (apps/web/app/help/page.tsx:51-122, apps/web/features/support/components/HelpSearch.tsx:97-106).
- Result cards show the category, the title and a short excerpt; each links to the article (apps/web/features/support/components/HelpSearch.tsx:150-166).
- One polite status region announces 'Searching', the match count, or the error text (apps/web/features/support/components/HelpSearch.tsx:119-148).

**Journey**

1. 1. Open /help (or follow a contextual link, which may add ?q= to prefill the search).
2. 2. Type at least two characters; after a 250 ms pause the page calls GET /api/help/search?q=... (apps/web/features/support/components/HelpSearch.tsx:24-25,73-86).
3. 3. A search still running is cancelled when you type again (apps/web/features/support/components/HelpSearch.tsx:39,109).
4. 4. Read the match count and the result cards.
5. 5. Open a card to read the article at /help/<article id>.

**What the person sees and gets**

- 'Searching' with a spinner while waiting.
- '{count} page(s) match(es).' on success.
- 'Nothing here covers that yet. Email <support address> for support.' when there are no matches.
- 'Search is not answering right now. The links below still work, and you can email ...' when the API answers 503.
- 'That search did not go through. Try again, or email ...' on other failures (apps/web/features/support/components/HelpSearch.tsx:119-148).

**Settings**

- No user setting. Rate limit key 'help-search' is server configuration (apps/web/lib/rate-limit.ts:826-835).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: /help page, debounced search, cancellation of the older search, unavailable/empty/error states, rate limit 'help-search' at 60 per minute (apps/web/features/support/components/HelpSearch.tsx:73-86, apps/web/app/api/help/search/route.ts:49, apps/web/lib/rate-limit.ts:826-835).
- Web: search API validates the query (2 to 200 characters), returns one result per article and answers 503 with corpus 'unavailable' when the index cannot load (apps/web/app/api/help/search/route.ts:29,64-72).
- Web: ten settings sections carry HelpArticleLink (see user_experience).
- Desktop: Help menu items open /help and /support in the browser (apps/desktop/electron/appMenu.ts:549-551, apps/desktop/electron/main.ts:2263-2273).
- Mobile: contextual links exist through HelpArticleLink and SettingsScreenShell help prop; 'Help Center' rows in Settings and About open the web help (apps/mobile/src/features/support/HelpArticleLink.tsx:43, apps/mobile/src/features/settings/Common.tsx:56, apps/mobile/src/features/settings/index.tsx:886-892).
- VS Code: Help menu links to Help center and Documentation (apps/extension-vscode/src/features/help/helpMenu.ts:19-29).
- Chrome: Options Help section links to Help center and Documentation with ?from=chrome-extension (apps/extension/src/options.ts:2028-2062).

**Incomplete**

- Mobile has no in-app search; it opens the web page (apps/mobile/src/features/settings/index.tsx:886-892). The About row uses a fixed address 'https://agiworkforce.com/help' instead of the shared page-opening helper (apps/mobile/app/(app)/about.tsx:275).
- Desktop opens help in the system browser, not in-app (apps/desktop/electron/windowPolicy.ts:82-91).
- Chrome and VS Code only link out; search happens on the web page.

**Present but disconnected or switched off**

- Chrome extension: the brief marks help search 'unverified'; no search UI was found in apps/extension/src, only links (apps/extension/src/options.ts:2028-2062).

**Not available**

- CLI: no help search (brief S88.02 'cli missing'; grep found none in apps/cli/src).
- Known-issue lists are not part of help search (brief S88.09 missing; see F088-06).

## 4. Required behaviour

**Established requirements**

- Users can search a help centre and open matching articles. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S88.02)
- Screens that need explaining link straight to the matching help or docs article for that feature. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S88.01)
- Search says so when the index is not available (corpus 'unavailable', HTTP 503) instead of showing an empty list. (source: apps/web/app/api/help/search/route.ts:64-72)
- Search is rate limited under 'help-search'. (source: apps/web/app/api/help/search/route.ts:49)

**Acceptance criteria**

1. Typing one character does not start a search; two or more does, after about 250 ms.
2. Typing a second query while the first is in flight leaves only the second result on screen.
3. With the index unloaded, the page shows the 'Search is not answering right now' text, not 'Nothing here covers that yet'.
4. A query with no match shows 'Nothing here covers that yet' and the support address.
5. Each web contextual link opens the article named in its docId (for example 'How memory works' opens /help/memory).
6. From the phone app, searching for a purchase topic returns no purchase article.
7. The 61st search within a minute from one caller is refused by the rate limiter.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Help must work with no sign-in and no paid plan, because the route has no auth check [inferred from apps/web/app/api/help/search/route.ts:47-96].
- Mobile and extension help links should keep opening the same article id as the web link [inferred from shared docId values].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add in-app help search on mobile, CLI and the extensions, or state the web-only choice in the product docs.
- [proposed] Make the About 'Help Center' row use the same helper as Settings so one place owns the address.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Help page | `apps/web/app/help/page.tsx` | Web /help page: hero, search, collections, contact buttons. |
| component | HelpSearch | `apps/web/features/support/components/HelpSearch.tsx` | Debounced search box, cancellation, six states (idle, searching, results, empty, unavailable, error). |
| endpoint | GET /api/help/search | `apps/web/app/api/help/search/route.ts` | Validates query, runs BM25 retrieval over the support corpus, returns results and corpus availability. |
| config | Rate limit help-search | `apps/web/lib/rate-limit.ts` | 60 per minute, fails open. |
| service | Support corpus and retrieval | `apps/web/lib/support/agent/corpus/index.ts` | Builds the help corpus from articles and static data; retrieval in apps/web/lib/support/agent/retrieval. |
| other | Help articles content | `apps/web/content/support` | Markdown articles (memory, billing-and-plans, local-mode and others) the corpus is built from. |
| component | HelpArticleLink (web) | `apps/web/features/support/components/HelpArticleLink.tsx` | Small 'circle help' link to /help/<docId> used in settings sections. |
| service | Help entry points | `apps/web/lib/support/help-entry-points.ts` | Maps a route (billing, work, connectors, workspace, operator) to a prefilled help query. |
| component | Account menu Get help | `apps/web/shared/components/layout/AccountMenuItems.tsx` | 'Get help', 'Email support', 'Send feedback' submenu. |
| component | Settings Help section | `apps/web/features/settings/sections/HelpSection.tsx` | Link list including 'Help center', 'Documentation', 'Contact support'. |
| command | Desktop Help menu | `apps/desktop/electron/appMenu.ts` | Help and Support menu items. |
| command | Desktop openProductHelp / openSupport | `apps/desktop/electron/main.ts` | Open /help and /support externally. |
| component | HelpArticleLink (mobile) | `apps/mobile/src/features/support/HelpArticleLink.tsx` | Link to a fixed list of article ids, opened in the in-app browser. |
| component | SettingsScreenShell help prop | `apps/mobile/src/features/settings/Common.tsx` | Renders the contextual link at the end of a settings screen. |
| service | webContentPage | `apps/mobile/src/platform/webContentPage.ts` | Adds the embedded-page marker and opens web pages in the in-app browser. |
| command | VS Code help menu | `apps/extension-vscode/src/features/help/helpMenu.ts` | Quick pick with Documentation, Help center and others. |
| screen | Chrome options Help section | `apps/extension/src/options.ts` | Help center, Documentation, Contact support links. |
| test | HelpSearch test | `apps/web/features/support/__tests__/HelpSearch.test.tsx` | Component tests. |
| test | help search route test | `apps/web/app/api/help/search/route.test.ts` | API tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person types a query; the page waits 250 ms, aborts any earlier request and calls GET /api/help/search. | device | apps/web/features/support/components/HelpSearch.tsx:37-86 |
| Server applies the 'help-search' rate limit, validates the query, picks the phone or web view of the corpus. | our servers | apps/web/app/api/help/search/route.ts:49-61 |
| Server ranks chunks with BM25, keeps the best chunk per article and returns title, path, category and snippet; the response is cacheable for 60 seconds. | our servers | apps/web/app/api/help/search/route.ts:74-105 |
| If the corpus cannot load, the server logs the reason and answers 503 with corpus 'unavailable'. | our servers | apps/web/app/api/help/search/route.ts:64-72 |
| Opening a contextual link on mobile or desktop launches the in-app or system browser on the hosted article. | device | apps/mobile/src/platform/webContentPage.ts:15-17, apps/desktop/electron/windowPolicy.ts:82-91 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Search text (query length only is logged) | Not stored; the log line keeps the query length and result count | No | Log retention unknown |
| Help corpus | Generated file apps/web/lib/support/agent/corpus.generated.json built from content/support articles | Shipped with the web build | Replaced on each build |

**Models and providers.** No model or provider takes part: retrieval is keyword ranking with no model call (comment: apps/web/app/api/help/search/route.ts:16-24).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | None for web help and search (no auth call in apps/web/app/api/help/search/route.ts). Mobile 'Help Center' rows also need no sign-in (apps/mobile/src/features/settings/index.tsx:886-892). |
| Permissions | None found in the code. |
| Subscription | None found in the code: no plan limit was found for help search or links. |
| Limits and metering | Rate limit 'help-search': 60 per minute, fails open if the limiter store is down (apps/web/lib/rate-limit.ts:826-835). Query 2 to 200 characters, up to 12 results per request (apps/web/app/api/help/search/route.ts:28-31). No usage metering found. |
| Feature flags | None found in the code; the route comment says it is deliberately not behind the support widget flag (apps/web/app/api/help/search/route.ts:16-24). |
| Model compatibility | Not applicable: no model is used. |
| Provider restrictions | None found in the code. |
| Local mode | Help is hosted on the web app, so it needs a network even in Local mode [inferred]. The status page states local work does not depend on our servers (apps/web/app/status/page.tsx:243-246) but help pages are hosted. Mobile Local mode still shows the 'Help Center' row (apps/mobile/src/features/settings/index.tsx:886-892). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | Spinner and 'Searching' in a polite live region. | apps/web/features/support/components/HelpSearch.tsx:120-125 |
| Empty query or one character | Idle; no request is sent. | apps/web/features/support/components/HelpSearch.tsx:76-80 |
| No matches | 'Nothing here covers that yet' with the support address. | apps/web/features/support/components/HelpSearch.tsx:134-136 |
| Index unavailable | 503 and a separate message. | apps/web/features/support/components/HelpSearch.tsx:53-56,137-142 |
| Network or server error | 'That search did not go through' message; no automatic retry (user types again). | apps/web/features/support/components/HelpSearch.tsx:57-68,143-147 |
| Cancel | Older request is aborted on each keystroke and on unmount. | apps/web/features/support/components/HelpSearch.tsx:39,83,88 |
| Accessibility | Labelled input, one live region for every outcome. | apps/web/features/support/components/HelpSearch.tsx:97-119 |
| Offline | Not handled in the code beyond the generic error message. | apps/web/features/support/components/HelpSearch.tsx:65-68 |
| Phone view | Embedded marker hides purchase articles from the phone. | apps/web/app/api/help/search/route.ts:61, apps/web/features/support/__tests__/HelpSearch.test.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/support/__tests__/HelpSearch.test.tsx`: Minimum query length, result links, excerpt rendering, prefilled query, empty vs unavailable vs error states, live region, phone marker.
- `apps/web/app/api/help/search/route.test.ts`: Short query refused, one result per article, 503 when the corpus fails, rate limiter first, phone view, caching header.
- `apps/web/lib/support/__tests__/help-entry-points.test.ts`: Route-to-help mapping.
- `apps/web/lib/support/__tests__/help-articles.test.ts`: Article helpers.
- `apps/web/app/help/__tests__/HelpIndexFromPhone.test.tsx`: Help index in the phone view.
- `apps/mobile/src/features/support/__tests__/HelpArticleLink.test.tsx`: Mobile article link.
- `apps/extension/__tests__/options-help-links.test.ts`: Chrome options help links.
- `apps/extension-vscode/src/__tests__/getHelpEntry.webview.test.ts`: VS Code help entry (name only; contents not opened).
- `apps/web/e2e/help-collection-page.spec.ts`: Playwright check of a help collection page (contents not opened).

**Test scenarios**

- **Search as you type**
  1. Open /help.
  2. Type 'mem' slowly.
  3. Watch the network calls.
  - Expected: Only the last call completes; results show the memory article; match count is announced.
- **Index unavailable**
  1. Make the corpus fail to load in a test build.
  2. Search for 'billing'.
  - Expected: HTTP 503, corpus 'unavailable', page says search is not answering.
- **Contextual link**
  1. Open Settings, Memory.
  2. Click 'How memory works'.
  - Expected: A new tab opens at /help/memory.
- **Phone link**
  1. On the phone app open Settings, a screen with a help link.
  2. Tap the link.
  - Expected: In-app browser opens the article with the embedded marker.
- **Rate limit**
  1. Send 61 searches in one minute.
  - Expected: The 61st receives the rate-limit response.

**Where to look when it fails**

- Log line '[help-search] answered' (query length, results, passedFloor) and '[help-search] corpus unavailable' with a reason (apps/web/app/api/help/search/route.ts:63,95-98).
- Response field corpus: 'available' or 'unavailable'.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/088-support-trust-and-policy-product.md](../../70-qa/test-plans/web/088-support-trust-and-policy-product.md)
- Desktop: [70-qa/test-plans/desktop/088-support-trust-and-policy-product.md](../../70-qa/test-plans/desktop/088-support-trust-and-policy-product.md)
- Mobile: [70-qa/test-plans/mobile/088-support-trust-and-policy-product.md](../../70-qa/test-plans/mobile/088-support-trust-and-policy-product.md)
- VS Code: [70-qa/test-plans/vscode/088-support-trust-and-policy-product.md](../../70-qa/test-plans/vscode/088-support-trust-and-policy-product.md)
- Chrome: [70-qa/test-plans/chrome/088-support-trust-and-policy-product.md](../../70-qa/test-plans/chrome/088-support-trust-and-policy-product.md)

## 10. Gaps and dependencies

- **Brief says mobile contextual links are missing, but code has them.** Affects: Documentation accuracy for mobile. Evidence: apps/mobile/src/features/support/HelpArticleLink.tsx:43; brief S88.01 'mobile missing'. Work needed: Update the brief status; decide whether the list of 18 article ids covers every screen that needs one.
- **No help search on mobile, CLI, VS Code or Chrome; they link to the web.** Affects: Mobile, CLI, VS Code, Chrome. Evidence: apps/extension/src/options.ts:2028-2062; apps/extension-vscode/src/features/help/helpMenu.ts:19-29. Work needed: Product decision: accept web-only search or build search.
- **Mobile About row opens a fixed address instead of the shared opener.** Affects: Mobile. Evidence: apps/mobile/app/(app)/about.tsx:275. Work needed: Route through openWebContentPage.
- **No offline help.** Affects: All apps. Evidence: help is hosted pages only. Work needed: Unknown whether required.
- Not built on: CLI (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:vscode
- surface:chrome
- api:GET /api/help/search
- file:apps/web/lib/support/agent/corpus.generated.json
- SYS-api-and-contracts
- SYS-shared-ui-and-design
- SYS-observability-and-operations

## Unknown

- Log retention for the help-search log lines.
- Whether the Chrome extension's help search is intended to exist (brief says 'unverified').
- How the Electron window shows /help from the app (menu opens the system browser; whether the in-window web app also links to it was not exercised).
- Content correctness of each article was not reviewed.
