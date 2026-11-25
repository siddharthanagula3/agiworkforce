---
id: "COMP-search"
type: "competitor-trace"
title: "Web search"
competitor_evidence_reviewed: "2026-11-22"
basis: "official competitor pages saved 2026-11-22; AGI status from code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Web search: competitors to requirements

Both leaders search the web and cite sources. ChatGPT adds a Sources list, hover previews, image and structured results, location, and workspace controls. Claude adds Research and per-session caps in its coding tool. AGI has automatic search with citations on web, mobile and desktop. A person saw it work on web only, with defects. Missing: image results, structured answers, location, admin switch, search modes, mobile site limits. Local mode needs a consent boundary.

**How the products divide this topic.** Reviewed 2026-11-22 from the saved catalogue only. Claude (chat) evidence is support.claude.com: web search is on all plans and on web, desktop, iOS and Android; Research needs a paid plan (Pro, Max, Ultra, Team, Enterprise). Claude Code (code.claude.com) is the separate coding tool: WebSearch and WebFetch tools, a 200-search session cap, no search on one cloud provider. It shares a subscription with Claude chat but its limits are its own. ChatGPT (help.openai.com) covers chat search, Sources, deep research and shopping; search is available signed out and on Free through Enterprise within usage limits. Codex (learn.chatgpt.com) is the separate coding tool with cached, indexed, live and disabled search modes. The page learn.chatgpt.com/docs/web-search.md mixes ChatGPT chat and Codex; it is labelled that way below. Plan limits for search call counts are not in the catalogue. Plans: Team and Enterprise owners must enable Claude search; ChatGPT Enterprise and Edu admins toggle it.

Each capability below is traced: competitor evidence, AGI requirement, current implementation, gap, acceptance criteria, verification. Competitor behaviour comes only from the cited pages, reviewed 2026-11-22.

| ID | Capability | Claude | ChatGPT | AGI today | Verified |
|---|---|---|---|---|---|
| [CAP-search-01](#cap-search-01) | Automatic web search with inline citations | yes | yes | built | seen working by a person |
| [CAP-search-02](#cap-search-02) | Search on/off control in the composer | partly | yes | partly built | seen failing by a person |
| [CAP-search-03](#cap-search-03) | Sources list and panel | unknown | yes | partly built | seen failing by a person |
| [CAP-search-04](#cap-search-04) | Citation hover or tap preview | unknown | yes | partly built | code inspected only |
| [CAP-search-05](#cap-search-05) | Read a page from a pasted link | yes | unknown | built | not verified |
| [CAP-search-06](#cap-search-06) | Search query privacy and rewriting disclosure | unknown | yes | partly built | not verified |
| [CAP-search-07](#cap-search-07) | Approximate location for search results | partly | yes | not built | not verified |
| [CAP-search-08](#cap-search-08) | Image results and inline web images with attribution | yes | yes | partly built | not verified |
| [CAP-search-09](#cap-search-09) | Structured live answers (weather, sports, finance) | yes | yes | not built | not verified |
| [CAP-search-10](#cap-search-10) | Shopping, places and booking results | unknown | yes | partly built | code inspected only |
| [CAP-search-11](#cap-search-11) | Search with an uploaded image | unknown | yes | not built | not verified |
| [CAP-search-12](#cap-search-12) | Regenerate an answer with web search | unknown | yes | partly built | not verified |
| [CAP-search-13](#cap-search-13) | Search limits and usage accounting | yes | yes | partly built | seen failing by a person |
| [CAP-search-14](#cap-search-14) | Workspace admin control for web search | yes | yes | partly built | code inspected only |
| [CAP-search-15](#cap-search-15) | Search modes: cached, indexed, live, disabled | no | yes | partly built | code inspected only |
| [CAP-search-16](#cap-search-16) | Domain include and exclude for search | yes | yes | partly built | code inspected only |
| [CAP-search-17](#cap-search-17) | Deep research with a cited report | yes | yes | built | not verified |
| [CAP-search-18](#cap-search-18) | Research plan review, steering and site limits | no | yes | partly built | code inspected only |
| [CAP-search-19](#cap-search-19) | Research report view and export with citations | unknown | yes | partly built | not verified |
| [CAP-search-20](#cap-search-20) | Research usage counter | partly | yes | partly built | seen working by a person |
| [CAP-search-21](#cap-search-21) | Web search in voice | unknown | yes | built | not verified |
| [CAP-search-22](#cap-search-22) | Coding-tool search and fetch | yes | yes | partly built | not verified |
| [CAP-search-23](#cap-search-23) | Search across connected company sources with citations | yes | yes | partly built | seen failing by a person |
| [CAP-search-24](#cap-search-24) | Source freshness, unavailable-source and empty-result states | partly | partly | partly built | seen failing by a person |
| [CAP-search-25](#cap-search-25) | Citations to earlier chats and memory used | yes | yes | partly built | not verified |
| [CAP-search-26](#cap-search-26) | Search approval and the Local-mode boundary | partly | unknown | partly built | not verified |
| [CAP-search-27](#cap-search-27) | Search from the browser address bar and browsing history | unknown | yes | partly built | not verified |
| [CAP-search-28](#cap-search-28) | Publisher control over search crawling | unknown | yes | unknown | not verified |

## CAP-search-01 Automatic web search with inline citations

The assistant decides when it needs current facts, searches the live web, shows a searching indicator, and answers with citations linked to sources.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10684626-enable-and-use-web-search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search): Claude searches the live web, shows a searching indicator and answers with citations, links and quotes (catalogue ch01:82). Plans: All plans. Apps: web, desktop, iOS, Android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt): Available signed out and on Free through Edu on web, desktop and mobile within usage limits; auto-triggered (oh09:151). Plans: All plans, within usage limits. Apps: web, desktop, iOS, Android.

**AGI requirement** (stated requirement; source: docs/product/requirements.md (Web search/fetch, Web search where allowed) and docs/product/competitive-guidance.md item 36 (citation integrity)). A chat on any app can search the public web on its own when the question needs it and answer with citations the user can open.

**With different models, providers and the one subscription.** Search is a harness tool, not a model skill. The harness forces or offers the tool by name for every provider (decision D-2026-09-05 in docs/decisions/2026-09-05-living-decision-model.md), so a cheap model behaves the same. Each search is metered by the one AGI Subscription. In Local mode a search leaves the device, so it needs explicit per-turn consent and a visible label (see the Local-mode boundary item).

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop, mobile, CLI, VS Code and Chrome have it per the ledger; a person saw web work on Free and Premium. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S34.07, S36.01, S36.16
- Comparison list ids: none matched; rows without an id: Search and research: Automatic web search with citations (web, no list_id); Search and research: Web search in a chat with citations (mobile, no list_id)
- Code: `apps/web/lib/web-search/web-search-tool.ts:56`; `apps/web/lib/web-search/required-search.ts:121`; `apps/mobile/stores/chat/chatExecutionStore.ts:1741`; `apps/cli/src/features/exec/tools/web/mod.rs:284`

**Gap.** Web showed a raw [7] marker left in an answer after the chips (defect W-5, Premium). CLI, VS Code and Chrome show no inline citation marker (S36.01).

**Acceptance criteria**

1. Ask a current-events question with no toggle set; the answer shows a searching row and at least one clickable citation.
2. Open each citation; it reaches the cited page.
3. Repeat with two different providers; both cite.
4. A finished answer contains no leftover bracket numbers.

**Verification: seen working by a person.** 5-results/basics/scorecards/web.csv row W-5 free and subscribed (partial): 'Searched the web . 5 sources' with a working source link; defects file shows leftover [7] marker.

## CAP-search-02 Search on/off control in the composer

A way to force or allow web search for a chat, such as a plus-menu item, a search icon or a slash command.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/10684626-enable-and-use-web-search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search): Classic chats have a Web search item under + that switches per chat; the new Claude experience has no toggle and searches when useful (ch01:83). Apps: web, desktop, iOS, Android.
  - [https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude](https://support.claude.com/en/articles/16761823-claude-cowork-and-chat-are-one-claude): Research via /deep-research or the plus button; no web search toggle (ch05:55).
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt): Invoke via View all tools, Search, or / in the composer; regenerate with Search the web (oh09:151). Plans: All plans. Apps: web, iOS, Android.
  - [https://help.openai.com/en/articles/12677804-what-is-chatgpt-faq](https://help.openai.com/en/articles/12677804-what-is-chatgpt-faq): Click the web-search icon or type /Search (oh03:61).

**AGI requirement** (inferred; source: competitor parity; decision D-2026-09-05 treats the toggle as a persistent default preference). The user can force a search for one turn or set a default, and the control says what it does.

**With different models, providers and the one subscription.** The control belongs to the harness and works the same on every provider. Free users keep it only if search is allowed on Free by the subscription system. In Local mode the control also decides whether the turn may leave the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has a force control in code (partial); a person saw no toggle on Free or Premium. Mobile has a settings switch. CLI has /search. VS Code has a gate. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S34.07
- Comparison list ids: WP51; rows without an id: Search and research: Force a search from the composer (web, no list_id); Settings: Let the assistant search the web (mobile, no list_id); Search and research: Slash command /search (cli, no list_id)
- Code: `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3194`; `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1686-1694`; `apps/mobile/src/features/settings/capabilities/index.tsx:213`; `apps/cli/src/tui/tui_app.rs:6359`

**Gap.** The browser run found no search switch in the plus, output or model menus on Free or Premium, though code has one. Owner choice open: automatic only, or an explicit switch.

**Acceptance criteria**

1. Open the plus menu on a Free and a paid account; either a search control shows or the page states search is automatic.
2. Force a search on one turn; the turn shows a search row.
3. Turn the default off; a current-events question does not search.

**Verification: seen failing by a person.** Scorecard W-5 free and subscribed: no search toggle found in plus, effort or model menus; search was automatic.

## CAP-search-03 Sources list and panel

A compact summary such as 'Searched the web, 5 sources' that expands to the full list of sources behind an answer.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - [https://support.claude.com/en/articles/10684626-enable-and-use-web-search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search): Shows answers with citations, links and quotes; the catalogue records no separate sources list for Claude chat (ch01:82).
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt): Answers can include inline citations with hover preview on desktop web, a Sources list, image sources, and maps on iOS and Android (oh09:152). Apps: web, iOS, Android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md (Citation chip and sources disclosure); docs/product/competitive-guidance.md item 36). Every search-backed answer offers a Sources list with title, site and link for each source, and the list matches the citations in the text.

**With different models, providers and the one subscription.** Sources are produced by the harness from tool results, not by the model, so every provider gets the same list. No extra charge beyond the search. In Local mode the list marks sources as fetched from outside the device.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile, Chrome done; CLI, VS Code have no card (CLI opens source links only). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S34.24, S34.26, S36.02, S36.03, S36.04
- Comparison list ids: none matched; rows without an id: Conversations and message: View sources of an answer (web, no list_id); Rendering and content: Inline citations and a sources list (mobile, no list_id); Rendering and content: Sources and citations list on answers (chrome, no list_id)
- Code: `apps/web/features/chat/components/research/ResearchPanel.tsx:437`; `apps/web/features/chat/components/messages/MessageBubble.tsx:2738`; `apps/mobile/src/features/chat/components/CollapsibleSources.tsx:34`; `apps/extension/src/features/side-panel/sources.ts:136`

**Gap.** Web panel shows duplicate entries, a header called MORE, and section names as titles ('Iana', 'References'); chips show only the domain; favicons fail (third-party favicon service 404). CLI and VS Code lack cards and the title and publisher fields.

**Acceptance criteria**

1. After a search answer, open the sources list; it shows each source once with a page title and site name.
2. Chips for two different pages on one site are distinguishable.
3. Favicon failure shows a neutral icon with no console error.

**Verification: seen failing by a person.** 6-defects/web-problems-seen-in-browser.csv: W-5 Sources panel duplicates and poor titles (free, subscribed); chips domain-only; favicon 404.

## CAP-search-04 Citation hover or tap preview

Hovering or tapping a citation shows the source title, site and snippet without leaving the answer.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10093903-chatgpt-search-for-enterprise-and-edu](https://help.openai.com/en/articles/10093903-chatgpt-search-for-enterprise-and-edu): Hovering a citation on desktop web shows source info (oh01:19). Plans: Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity). A citation previews its source on hover (web, desktop) and on tap (mobile), and opens the page on click.

**With different models, providers and the one subscription.** Rendered from stored source data, so independent of provider. No cost.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile done; VS Code and Chrome missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S34.23, S34.25, S36.08
- Comparison list ids: none matched; rows without an id: Rendering and content: Citations with hover preview and a sources list (web, no list_id); Search and research: Sources panel and hover citation previews (web, no list_id)
- Code: `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:173`; `apps/mobile/src/features/chat/components/CitationChip.tsx:29`

**Gap.** VS Code and Chrome have no preview.

**Acceptance criteria**

1. Hover a citation on web; a card shows title, site and snippet.
2. Tap a citation on mobile; the same card opens.
3. Keyboard focus on a citation opens the preview.

**Verification: code inspected only.** No scorecard checks hover preview; ledger status from code reading.

## CAP-search-05 Read a page from a pasted link

The assistant fetches the full page behind a URL the user gives and answers from it.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/10684626-enable-and-use-web-search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search): With web search on, Claude fetches whole pages from URLs you give; on Free the full article enters context and can burn much of the usage limit (ch01:85). Plans: All plans. Apps: web, desktop, iOS, Android.
  - [https://code.claude.com/docs/en/tools-reference.md](https://code.claude.com/docs/en/tools-reference.md): Claude Code WebFetch fetches a URL and answers via a separate model call; 15-minute cache, reads first 100,000 characters, refuses localhost (cc21:96). Apps: CLI, IDE.
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (inferred; source: competitor parity; docs/product/requirements.md lists Web search/fetch). A pasted link is read and cited, with size limits, a cache, a block on local addresses, and a page that costs usage shown as search or fetch.

**With different models, providers and the one subscription.** Fetch runs in the harness for any provider and is metered by the one subscription. Local addresses stay blocked. In Local mode fetching a public page leaves the device and needs the same consent as search.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, mobile, CLI and VS Code read pages; CLI fetch is partial against Claude Code. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C495, CP45, CP46; rows without an id: Search and research: Read the full page behind a pasted link (web, no list_id); Search and research: Read a web page from a link you paste (mobile, no list_id)
- Code: `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:988`; `apps/cli/src/features/exec/tools/web/mod.rs:118-126`

**Gap.** CLI has no separate fetch-summariser model (C495 missing) and no off switch matching CP45 (partial).

**Acceptance criteria**

1. Paste a public article link; the answer quotes it and cites the link.
2. Paste http://localhost link; the product refuses with a clear message.
3. Paste a very long page; the answer says it read only part.

**Verification: not verified.** No scorecard exercises pasted-link fetch.

## CAP-search-06 Search query privacy and rewriting disclosure

The product states that prompts are rewritten into search queries, what partners receive, and whether memory or account data is shared.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt): ChatGPT rewrites prompts into queries sent to search partners without sharing IP or account info; memory may inform query rewriting (oh09:153). Apps: web, iOS, Android.
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Apr 16, 2025: memories can shape searches sent to third-party providers (oh08:365). Plans: Plus, Pro.

**AGI requirement** (stated requirement; source: docs/product/definition.md (explicit execution boundaries; trust boundaries Local, BYOK, Managed Cloud)). The app tells the user, in plain words, what leaves the device or AGI when a search runs, and memory never adds personal details to a query without a visible setting.

**With different models, providers and the one subscription.** The rule is the same for every provider and search backend. It names the backend class (AGI server or the provider's own search). Local mode states that a search is an outside call.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Capabilities setting says web search and page fetches can move data outside AGI; no per-search disclosure found. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W282; rows without an id: Memory and personalization: Create memories from chats that use tools, code or web search (web, no list_id)
- Code: `docs/decisions/2026-09-10-managed-gateway-routes.md:44-49 (Capabilities text)`; `apps/web/lib/web-search/page-metadata-egress.test.ts`

**Gap.** No in-answer or setting text on query rewriting; memory sharpening of searches is missing (W282).

**Acceptance criteria**

1. Settings or search help text names what is sent to the search backend.
2. With memory on, a test query shows whether memory fed the query.
3. The text matches the backend actually used.

**Verification: not verified.** No person checked this copy.

## CAP-search-07 Approximate location for search results

Search localises results using approximate location, with settings for precise location.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/10684626-enable-and-use-web-search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search): IP-inferred location may localize results (ch01:88). Apps: web, desktop, iOS, Android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt): Approximate location from IP is used; precise device location is optional and off by default in Settings, Data controls, Location; parents can disable it for teens (oh09:154). Apps: web, iOS, Android.

**AGI requirement** (inferred; source: competitor parity; docs/product/requirements.md privacy settings include location). Location use is off or approximate by default, can be switched off, and precise location needs explicit opt-in.

**With different models, providers and the one subscription.** Location is added by the harness, not the model, so the setting works for every provider. Local mode never sends location to a search backend without the same consent as the search.

**Current implementation, as this trace read it on 2026-11-24: not built.** Searched in web code for geolocation and user location; no hits. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W99
- Code: `comparison-web.csv W99: searched geolocation, userLocation, x-vercel-ip in apps/web/app/api, lib/prompts, features` (not found)

**Gap.** No location use and no location setting for search.

**Acceptance criteria**

1. Settings has a Location control with off and approximate.
2. With it on, 'weather near me' answers for the right city.
3. With it off, the answer asks for a place.

**Verification: not verified.** Absent in code reading only.

## CAP-search-08 Image results and inline web images with attribution

Search answers can show images from the web with a link to their source.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10684626-enable-and-use-web-search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search): Claude can show images from Bing-powered search results with source links, no separate setting (ch01:86). Apps: web, desktop, iOS, Android.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10093903-chatgpt-search-for-enterprise-and-edu](https://help.openai.com/en/articles/10093903-chatgpt-search-for-enterprise-and-edu): Search produces inline citations, a Sources list, structured results and image results (oh01:18). Plans: Enterprise, Edu. Apps: web, desktop, iOS, Android.

**AGI requirement** (inferred; source: competitor parity). When images help, an answer can show web images with a visible source link, and each image can be opened at its source.

**With different models, providers and the one subscription.** Images come from the search backend, not the model, so any provider works. Rights and attribution rules are the same for all. Local mode: image fetching is an outside call.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Mobile renders web images with source links (partial); web missing; others unknown. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: MP25, W77, W93
- Code: `apps/mobile/src/features/chat/components/MarkdownImage.tsx:5`; `comparison-web.csv W93: searched imageResults, image_search in apps/web/app/api/web-search` (not found)

**Gap.** Web has no image results or attribution; web search image upload also missing (see next item).

**Acceptance criteria**

1. Ask for pictures of a public landmark; images appear with a site name and link.
2. Tap an image; the source page opens.
3. No image appears without a source.

**Verification: not verified.** Code reading only.

## CAP-search-09 Structured live answers (weather, sports, finance)

Search shows cards for weather, scores or stock data instead of plain text.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/13641943-visual-and-interactive-content](https://support.claude.com/en/articles/13641943-visual-and-interactive-content): Sports scores and standings as text results for many leagues, including live scores (ch02:316).
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10093903-chatgpt-search-for-enterprise-and-edu](https://help.openai.com/en/articles/10093903-chatgpt-search-for-enterprise-and-edu): Structured results such as weather, sports and finance (oh01:18). Plans: Enterprise, Edu. Apps: web, desktop, iOS, Android.

**AGI requirement** (inferred; source: competitor parity). Common live-data questions get a card with value, time and source.

**With different models, providers and the one subscription.** Data comes from a data source the harness calls; model-neutral. Each card names its source and time. Requires an outside call, so Local mode asks first.

**Current implementation, as this trace read it on 2026-11-24: not built.** Web has no weather, sports or stock card (searched). The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W94
- Code: `comparison-web.csv W94: searched weather, sports, stock card, StructuredResult in features/chat/components/cards` (not found)

**Gap.** Whole capability missing.

**Acceptance criteria**

1. Ask for a team's latest score; a card shows score, time and source.
2. Ask for a city's weather; a card shows temperature and time.
3. Cards show a retrieval time.

**Verification: not verified.** Code reading only.

## CAP-search-10 Shopping, places and booking results

Search shows product cards, local places on a map, and reservation options.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11128490-shopping-with-chatgpt-search](https://help.openai.com/en/articles/11128490-shopping-with-chatgpt-search): Shopping intent shows products with images, details, merchants and purchase options; results are not ads (oh02:19).
  - [https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt): Restaurant reservation search via OpenTable, Resy and Yelp for eligible consumer plans; not in Work, Business, Enterprise, Edu or voice (oh09:155). Plans: Consumer plans. Apps: web, iOS, Android.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only)). Not decided for AGI beyond product and place cards; booking is an owner choice.

**With different models, providers and the one subscription.** Cards come from the harness, not the model. Booking sends user details to a third party and must ask first. Local mode: outside call, consent first.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has product comparison and place map cards; booking missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W100, W97; rows without an id: Search and research: Local place results with a map (web, no list_id); Search and research: Shopping and product comparison cards (web, no list_id)
- Code: `apps/web/features/chat/components/messages/cards/PlacesMapCard.tsx`; `apps/web/features/chat/components/messages/cards/ProductComparisonCard.tsx`

**Gap.** No reservations, buyer's guides or try-on.

**Acceptance criteria**

1. Ask for products; cards show merchant and price with a source.
2. Ask for nearby restaurants; a map card appears.
3. No booking happens without a confirm step.

**Verification: code inspected only.** Comparison CSV only.

## CAP-search-11 Search with an uploaded image

The user uploads a picture and the assistant searches the web to find or identify what it shows.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Jun 13, 2025: automatic multiple searches for hard questions and searching the web with an uploaded image (oh08:357). Plans: Free, Go, Plus, Pro. Apps: web.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only)). Open owner choice (ChatGPT only).

**With different models, providers and the one subscription.** Needs a vision-capable model or an image search backend; an unsupported model must say so. The image leaves the device, so Local mode asks first.

**Current implementation, as this trace read it on 2026-11-24: not built.** Searched web; no hits. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W98
- Code: `comparison-web.csv W98: searched image search, reverse image, searchByImage` (not found)

**Gap.** Missing.

**Acceptance criteria**

1. Upload a landmark photo and ask where it is; the answer names it with a source.
2. With a model lacking vision, the app says so.

**Verification: not verified.** Code reading only.

## CAP-search-12 Regenerate an answer with web search

A message action that retries an answer using web results.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10093903-chatgpt-search-for-enterprise-and-edu](https://help.openai.com/en/articles/10093903-chatgpt-search-for-enterprise-and-edu): The refresh icon then Try again retries the answer with web results (oh01:19). Plans: Enterprise, Edu. Apps: web.
  - [https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt): Regenerate with Search the web (oh09:151).

**AGI requirement** (inferred; source: competitor parity). A user can retry any answer with search turned on.

**With different models, providers and the one subscription.** Works with any model since the harness forces the tool. Counts as one more metered search.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has a retry menu; search retry not confirmed. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: WP61
- Code: `apps/web/features/chat/components/messages/MessageBubble.tsx:3878-3910`

**Gap.** WP61 searched and found no explicit retry-with-search.

**Acceptance criteria**

1. On an answer without search, choose retry with search; the new answer shows a search row and sources.

**Verification: not verified.** Code reading only.

## CAP-search-13 Search limits and usage accounting

Searches count against usage, with caps per turn or session and a clear message when a cap is hit.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude and Claude Code: yes**
  - [https://support.claude.com/en/articles/10684626-enable-and-use-web-search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search): Searches count toward usage; Free limit resets every five hours and search and fetch both consume it (ch01:87,88). Plans: Free. Apps: web, desktop, iOS, Android.
  - [https://code.claude.com/docs/en/tools-reference.md](https://code.claude.com/docs/en/tools-reference.md): Claude Code interactive sessions cap at 200 searches (subagents count), refilling about 100 per hour; per-turn in -p and SDK (cc21:100). Apps: CLI, IDE.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10093903-chatgpt-search-for-enterprise-and-edu](https://help.openai.com/en/articles/10093903-chatgpt-search-for-enterprise-and-edu): Search is subject to plan usage limits (oh01:18). Plans: Enterprise, Edu. Apps: web, desktop, iOS, Android.

**AGI requirement** (stated requirement; source: docs/decisions/README.md (usage follows the shared percentage and reset contract; web search remains separately gated) and docs/product/commercial.md). Search and fetch are metered by the one AGI Subscription on every app; a cap reached says so in plain words and never leaves contradictory text.

**With different models, providers and the one subscription.** Search cost is separate from model tokens and is priced per backend. Caps are configuration, not constants (AGENTS.md section 8). Free users see only Upgrade on usage screens (owner decision), so a cap message cannot show a meter. Local mode: a search still counts.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has per-turn caps, a budget and a cost card; CLI per-session cap missing; VS Code not applicable. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C78, W35; rows without an id: Search and research: Search count limit per session (vscode, no list_id); Plans, billing and usage: Credit rates shown per model, agent, research and voice (web, no list_id)
- Code: `apps/web/lib/web-search/search-budget.ts`; `apps/web/lib/web-search/web-search-pricing.ts`; `apps/web/lib/web-search/required-search.ts:572-580`

**Gap.** Stopping a search mid-turn showed five amber rows plus 'Search limit reached' and 'no results' text; project chats showed red 'Search limit reached' on a plain question. CLI has no cap.

**Acceptance criteria**

1. Hit the per-turn cap; one clear message says the cap was reached and the answer still shows what was found.
2. Press Stop mid-search; one stopped state shows, with no 'no results' text.
3. A plain project question does not show a limit error.

**Verification: seen failing by a person.** 6-defects/web-problems-seen-in-browser.csv: W-5 free stop mid-search contradictory text; W-11 subscribed red 'Search limit reached' on a plain question.

## CAP-search-14 Workspace admin control for web search

Owners and admins turn web search, and deep research, on or off for members, and can set allowed modes.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/10684626-enable-and-use-web-search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search): Owners enable web search workspace-wide in Organization settings > Capabilities before members can use it (ch01:84). Plans: Team, Enterprise. Apps: web.
- **ChatGPT and Codex: yes**
  - [https://help.openai.com/en/articles/10093903-chatgpt-search-for-enterprise-and-edu](https://help.openai.com/en/articles/10093903-chatgpt-search-for-enterprise-and-edu): Owners and admins turn Web search on or off for the workspace; when off, search is unavailable even on request (oh01:20). Plans: Enterprise, Edu. Apps: web.
  - [https://learn.chatgpt.com/docs/enterprise/managed-configuration.md](https://learn.chatgpt.com/docs/enterprise/managed-configuration.md): Codex: admins allow only Cached or Disabled web search and set default mode and context (cl04:50). Plans: Enterprise. Apps: desktop, CLI.

**AGI requirement** (inferred; source: competitor parity). An admin can switch search on or off for a workspace and members see why it is unavailable.

**With different models, providers and the one subscription.** Policy is enforced in the harness before any provider call. Applies equally to BYOK and managed routes. A disabled search never falls back to another path.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has workspace feature access flags (research is one); no search switch. Desktop admin mode missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: D19, W378, WP328, WP79
- Code: `packages/contracts/types/src/enterprise/workspace-controls.ts:3-18`

**Gap.** No web search flag in the list of workspace features (only research).

**Acceptance criteria**

1. An admin switches search off; a member's chat says search is off and does not search.
2. Turning it on restores search without a restart.
3. Admin setting applies on web, mobile and CLI.

**Verification: code inspected only.** Comparison rows WP79, W378 read from code.

## CAP-search-15 Search modes: cached, indexed, live, disabled

A coding-tool setting choosing whether search serves a stored index or live pages, or is off; ChatGPT workspaces can also use offline search from a stored index.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: no**
  - [https://code.claude.com/docs/en/tools-reference.md](https://code.claude.com/docs/en/tools-reference.md): WebSearch queries Anthropic's search backend; the backend is not configurable (cc21:99).
- **Codex and ChatGPT: yes**
  - [https://learn.chatgpt.com/docs/config-file/config-basic.md](https://learn.chatgpt.com/docs/config-file/config-basic.md): Codex web_search modes: cached (default, OpenAI index), indexed, live, disabled (cl02:37).
  - [https://help.openai.com/en/articles/20001203-offline-web-search-for-chatgpt-workspaces](https://help.openai.com/en/articles/20001203-offline-web-search-for-chatgpt-workspaces): ChatGPT workspaces: offline search from OpenAI's indexed and cached pages; no refresh SLA (oh04:77). Plans: Enterprise, Edu, Healthcare, regulated. Apps: web.

**AGI requirement** (proposed; source: competitor parity (ChatGPT and Codex only)). Open owner choice: whether to offer search modes. If offered, the mode is visible and live search is never silently used when the user chose cached or off.

**With different models, providers and the one subscription.** Modes belong to the harness and map to different backends per provider. Disabled is always allowed. In Local mode, disabled should be the default.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI and VS Code have a mode gate (partial); web has no stored-index search. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: C79, CP183, VP16, VP47, W101
- Code: `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:458-462`; `apps/cli/src/features/exec/tools/web/mod.rs:379-460`

**Gap.** CLI flag --search and modes missing (C79); no web stored-index search.

**Acceptance criteria**

1. Set mode to off; a prompt that needs the web gets no search call.
2. Set cached; the transcript labels results as cached.
3. The mode survives restart.

**Verification: code inspected only.** Comparison rows only.

## CAP-search-16 Domain include and exclude for search

Restrict a search to named sites or block sites.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/tools-reference.md](https://code.claude.com/docs/en/tools-reference.md): WebSearch supports allowed or blocked domain filters (cc21:99).
- **ChatGPT, Codex: yes**
  - [https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): Sites > Manage sites can restrict deep research to given domains or prioritize them (oh01:80). Apps: web.
  - [https://learn.chatgpt.com/docs/config-file/config-reference.md](https://learn.chatgpt.com/docs/config-file/config-reference.md): Codex tools.web_search takes context size, allowed domains and approximate location (cl02:216).

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W08 (allowed source controls are enforced, not just included in a prompt)). Users and admins can include or exclude domains, and the filter is enforced in code, not only asked of the model.

**With different models, providers and the one subscription.** Enforced on results in the harness so every provider obeys; where a backend has a native filter it is used. Local mode applies the same filter.

**Current implementation, as this trace read it on 2026-11-24: partly built.** API has include and exclude (done); web research has site controls; no chat UI; mobile missing; CLI rules for fetch only. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S34.08, S34.18
- Comparison list ids: CP98, M44; rows without an id: Search and research: Restrict or prioritise sites for research (web, no list_id)
- Code: `apps/web/lib/web-search/web-search-tool.ts:301`; `apps/web/lib/web-search/web-search-tool.ts:458-464`; `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3881`; `apps/cli/src/permissions.rs:135`

**Gap.** No chat control for domains on desktop, mobile, Chrome or VS Code.

**Acceptance criteria**

1. Allow one domain; every cited source is from that domain.
2. Exclude a domain; none of its pages is cited.
3. The filter holds on two providers.

**Verification: code inspected only.** Ledger S34.08 and S34.18 from code.

## CAP-search-17 Deep research with a cited report

A long multi-step research run over the web and connected apps that returns a report with citations.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11088861-use-research-on-claude](https://support.claude.com/en/articles/11088861-use-research-on-claude): Plus-menu Research toggle runs chained searches over web and enabled connectors and produces a cited report; needs web search on (ch01:107). Plans: Pro, Max, Ultra, Team, Enterprise. Apps: web, desktop, iOS, Android.
  - [https://support.claude.com/en/articles/11088861-use-research-on-claude](https://support.claude.com/en/articles/11088861-use-research-on-claude): Mobile research silently skips connectors; research drains usage faster (ch01:108, ch01:111).
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): Describe the outcome, review the plan, follow progress, get a cited report; sources default to public web and uploads (oh01:78, oh01:80). Plans: Varies by plan. Apps: web, iOS, Android.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W08 (Research)). A research mode produces a cited report on every app that has chat, with plan review before work and the same sources view.

**With different models, providers and the one subscription.** Research runs in the harness over any capable model; the model choice is shown. Metered by the one subscription at a higher rate. Local mode: web research leaves the device; connector research follows connector rules; the report says which sources were outside.

**Current implementation, as this trace read it on 2026-11-24: built.** Web, desktop, mobile have it; CLI /deep-research missing; VS Code and Chrome no. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S36.25
- Comparison list ids: C264, WP80; rows without an id: Search and research: Deep research mode (web, no list_id); Search and research: Deep research for long reports (mobile, no list_id); Agents, tasks and automation: Deep research that cross-checks sources into a cited report (desktop, no list_id)
- Code: `apps/web/features/chat/components/research/ResearchPanel.tsx`; `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:801`; `apps/mobile/src/features/chat/components/AddToChatSheet.tsx:1235`

**Gap.** Research using connected apps is partial (WP80); CLI missing (C264); mobile notes no connector-skipped message.

**Acceptance criteria**

1. Start research on web and mobile; each returns a report with citations that open.
2. Cancel mid-run; no new searches start.
3. A connector failure is stated in the report.

**Verification: not verified.** No scorecard covers research.

## CAP-search-18 Research plan review, steering and site limits

The user edits a research plan before it runs, answers clarifying questions, and changes direction or sources during the run.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: no**
  - [https://support.claude.com/en/articles/11088861-use-research-on-claude](https://support.claude.com/en/articles/11088861-use-research-on-claude): Research uses connector tools automatically without per-call approval (ch01:109); the catalogue records no plan editing.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Feb 10, 2026: limit research to chosen websites and connected apps, edit the plan, adjust direction while running (oh08:307). Plans: Free, Go, Plus, Pro. Apps: web.
  - [https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): Interrupt to change focus or sources (oh01:78).

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W08). Plan review before approved work begins; cancel stops new side effects; allowed source controls are enforced.

**With different models, providers and the one subscription.** Plan and controls live in the harness, so they work with any model. Cost estimate shown before running under the one subscription.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web built; mobile plan options exist but interrupt and site limits missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: M43, M44; rows without an id: Search and research: Research plan review before it runs (web, no list_id); Search and research: Interrupt or steer research while it runs (web, no list_id); Search and research: Cost estimate before research (web, no list_id)
- Code: `apps/web/features/chat/components/research/ResearchPlan.tsx:19-27`; `apps/web/features/chat/components/research/ResearchActivity.tsx:315-320`; `apps/web/features/chat/components/research/ResearchCostEstimate.tsx`

**Gap.** Mobile cannot steer or limit sites. Whether site limits are enforced or only prompted is unconfirmed.

**Acceptance criteria**

1. Edit the plan, run; the run follows the edit.
2. Steer mid-run; later sources reflect it.
3. Limit to one site; no other site is cited.

**Verification: code inspected only.** Comparison rows only.

## CAP-search-19 Research report view and export with citations

Fullscreen report with contents, sources and activity, exportable with citations intact.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): Fullscreen report with table of contents, sources used and activity history; downloadable as Markdown, Word or PDF (oh01:81). Apps: web.
  - [https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes](https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes): PDF keeps tables, images and citations (oh02:345). Plans: Plus, Pro, Team.

**AGI requirement** (stated requirement; source: docs/product/experience-contract.md W08). Export and reopen the report with sources intact.

**With different models, providers and the one subscription.** Export is produced by the harness from stored sources, independent of model.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop done; mobile export has no citation-preserving path (S36.25 missing); mobile has export in reports screen. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S36.19, S36.25
- Comparison list ids: none matched; rows without an id: Search and research: Export a research report as Markdown, Word or PDF (web, no list_id); Search and research: Export a research report (mobile, no list_id); Artifacts and documents: Deep research report view with outline, sources and downloads (web, no list_id)
- Code: `apps/web/features/chat/components/research/ResearchReportView.tsx:68`; `apps/web/features/chat/components/research/ResearchReportView.tsx:133-137`; `apps/mobile/src/features/research/ReportsScreen.tsx:499`

**Gap.** Ledger and comparison disagree on mobile; check mobile export keeps sources.

**Acceptance criteria**

1. Export to PDF and Word; citations and a source list remain.
2. Reopen a past report; sources still open.
3. Export on mobile keeps the source list.

**Verification: not verified.** No scorecard.

## CAP-search-20 Research usage counter

A visible count of research runs left and when it resets.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/11088861-use-research-on-claude](https://support.claude.com/en/articles/11088861-use-research-on-claude): Research follows normal limits but consumes them faster (ch01:111).
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt](https://help.openai.com/en/articles/10500283-deep-research-in-chatgpt): In-product counter shows remaining tasks; monthly allowances reset 30 days after first use (oh01:82). Plans: Varies by plan. Apps: web.

**AGI requirement** (stated requirement; source: docs/decisions/README.md (usage contract) and owner decision on Free usage). Research runs follow the shared percentage and reset-time contract; Free shows only Upgrade, never meters.

**With different models, providers and the one subscription.** One meter for all models; research costs more and the cost estimate states that.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web has quota warning headers and a cost estimate; no counter. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W35
- Code: `apps/web/app/api/llm/v1/chat/completions/route.ts:677,775`

**Gap.** No counter; conflicts with the Free rule unless paid-only.

**Acceptance criteria**

1. Paid account sees remaining capacity in its usage screen after a research run.
2. Free account sees only Upgrade.

**Verification: seen working by a person.** Scorecard W-19 free: usage screen shows only Upgrade (the Free rule); the paid counter was not checked.

## CAP-search-21 Web search in voice

Voice conversations can search the web under plan limits.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt): Voice chats can search the web under plan limits; restaurant search unavailable in voice (oh09:156). Apps: web, iOS, Android.

**AGI requirement** (inferred; source: competitor parity). Voice can search and says it did.

**With different models, providers and the one subscription.** Voice uses the harness tool; metered by one subscription.

**Current implementation, as this trace read it on 2026-11-24: built.** Comparison says same on web and mobile voice. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched; rows without an id: Voice: Web search and connected apps in voice (mobile, no list_id)
- Code: `apps/web/lib/voice/live-voice-tools.ts:90`

**Gap.** None known.

**Acceptance criteria**

1. Ask a current-events question by voice; the reply reflects a search and a source appears in the transcript.

**Verification: not verified.** No voice scorecard read.

## CAP-search-22 Coding-tool search and fetch

Coding tools search and fetch pages while working, with caps, transcript items and provider limits.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude Code: yes**
  - [https://code.claude.com/docs/en/feature-availability.md](https://code.claude.com/docs/en/feature-availability.md): Web search works on a Claude subscription, Console and several clouds; not on Bedrock (cc07:18).
  - [https://code.claude.com/docs/en/env-vars.md](https://code.claude.com/docs/en/env-vars.md): CLAUDE_CODE_DISABLE_WEB_FETCH turns off fetch while search stays; a cap env var defaults to 200 (cc07:135).
  - [https://code.claude.com/docs/en/tools-reference.md](https://code.claude.com/docs/en/tools-reference.md): A web-fetch subagent reads about 48,000 characters when signed in; can be denied (cc21:98).
- **Codex: yes**
  - [https://learn.chatgpt.com/docs/codex/cli.md](https://learn.chatgpt.com/docs/codex/cli.md): --search switches a run to live search; activity stays visible in the transcript (cl02:7).
  - [https://learn.chatgpt.com/docs/app-server.md](https://learn.chatgpt.com/docs/app-server.md): Web search items: search, open page, find in page (cl01:264).

**AGI requirement** (stated requirement; source: docs/product/requirements.md (CLI and VS Code: Web search where allowed)). The CLI and VS Code extension search and fetch with visible transcript items, a per-session cap and an off switch.

**With different models, providers and the one subscription.** Tool runs in the AGI harness for any provider. Sessions on a local model need consent before searching. Metered by the one subscription.

**Current implementation, as this trace read it on 2026-11-24: partly built.** CLI and VS Code have search; CLI cap and --search flag missing; fetch switch partial. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S34.07, S34.27
- Comparison list ids: C78, C79, CP44, CP45, CP46; rows without an id: Search and research: Agent web search (vscode, no list_id); Search and research: Agent opens and reads a page by its URL (vscode, no list_id)
- Code: `apps/cli/src/features/exec/tools/web/mod.rs:330-360`; `apps/cli/src/platform/runtime/tool_catalog.rs:249`; `apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:915-919`

**Gap.** No session cap; no /deep-research; no source cards in the terminal.

**Acceptance criteria**

1. In the CLI, a research prompt shows search and fetch rows in the transcript.
2. Set a cap of 2; the third search is refused with a message.
3. Switch fetch off; search still works.

**Verification: not verified.** CLI and VS Code scorecards not read.

## CAP-search-23 Search across connected company sources with citations

Answers drawn from connected tools with citations that respect each user's permissions.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/12489464-use-enterprise-search](https://support.claude.com/en/articles/12489464-use-enterprise-search): Ask Your Org project searches connected company tools with cited answers; web and desktop only, not mobile (ch02:23, ch02:31). Plans: Team, Enterprise.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes](https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes): Company knowledge searches connected tools and returns cited answers respecting permissions (oh02:325). Plans: Business, Enterprise, Edu. Apps: web.

**AGI requirement** (inferred; source: competitor parity). Connected-source search cites the source item and never exceeds the user's permission.

**With different models, providers and the one subscription.** Retrieval is done by the harness; the model sees only what the user may read. Local mode never sends a Local chat to a connector without a labelled fork.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Ledger done on all apps; person-run run found 74 of 87 connectors locked as 'Coming soon' and Free blocked. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S34.06
- Comparison list ids: WP78
- Code: `apps/web/app/api/llm/v1/chat/completions/route.ts:732`; `apps/web/lib/connectors/directory/sources/first-party.json:10`

**Gap.** Ledger says done but no external app could be connected in the browser run.

**Acceptance criteria**

1. Connect one source; a question about it cites a file from it.
2. A file the user cannot read is never cited.

**Verification: seen failing by a person.** Scorecard W-17 subscribed: no outside app could be connected (blocked).

## CAP-search-24 Source freshness, unavailable-source and empty-result states

Sources show publication and retrieval dates, and failed or empty searches say so.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/10684626-enable-and-use-web-search](https://support.claude.com/en/articles/10684626-enable-and-use-web-search): Search can be slow and links may break (ch01:88).
- **ChatGPT: partly**
  - [https://help.openai.com/en/articles/20001203-offline-web-search-for-chatgpt-workspaces](https://help.openai.com/en/articles/20001203-offline-web-search-for-chatgpt-workspaces): Offline search has no guaranteed URL retrieval or timestamps (oh04:77).

**AGI requirement** (stated requirement; source: docs/product/competitive-guidance.md item 36 (timestamp, accessible destination)). Each source shows when it was published or fetched where known, and a dead or empty search shows a clear state instead of silence.

**With different models, providers and the one subscription.** Dates are stored with the source by the harness. Provider-neutral.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web, desktop, mobile done; CLI, VS Code missing dates; conflict, stale and restricted notices missing everywhere. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S34.31, S34.32, S36.05, S36.06, S36.18, S36.19, S36.20, S36.21
- Comparison list ids: none matched
- Code: `apps/web/lib/web-search/web-search-tool.ts:353`; `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:58`; `apps/web/features/chat/components/research/ResearchReportView.tsx:685`

**Gap.** No conflicting-source, stale or restricted-source notice (S36.18, 20, 21).

**Acceptance criteria**

1. A cited news item shows its date.
2. A broken link shows an unavailable note.
3. A search with no results says so once, clearly.

**Verification: seen failing by a person.** 6-defects: W-5 free stop mid-search gave contradictory 'no results' text.

## CAP-search-25 Citations to earlier chats and memory used

When the assistant uses past chats or memory, it shows which ones, with a way to remove them.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: yes**
  - [https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context](https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context): Claude can search earlier conversations on request, shown as tool calls (ch01:187). Plans: Pro, Max, Ultra, Team, Enterprise.
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/6825453-chatgpt-release-notes](https://help.openai.com/en/articles/6825453-chatgpt-release-notes): Unified search across chats, projects, images and documents with type filters (oh08:222). Plans: All plans. Apps: web, iOS, Android.

**AGI requirement** (inferred; source: competitor parity). A reply that used a past chat links to the exact message and the user can switch this off.

**With different models, providers and the one subscription.** Retrieval is by the harness; stays in the user's own trust boundary; Local chats are never searched from a cloud chat.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Web and desktop link the message; mobile missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: S34.02, S36.14
- Comparison list ids: none matched; rows without an id: Conversations and message: Citations to earlier chats the assistant used, with a delete option (web, no list_id); Search and research: Search and reference past chats switch (mobile, no list_id)
- Code: `apps/web/features/chat/components/messages/CitationPastChats.tsx:7`; `apps/web/app/api/llm/v1/chat/completions/lib/reference-citations.ts:3-16`

**Gap.** Mobile has no message-level link.

**Acceptance criteria**

1. Ask about an earlier chat; the reply links to the message.
2. Turn off past-chat search; it is not used.

**Verification: not verified.** No scorecard.

## CAP-search-26 Search approval and the Local-mode boundary

The rule for when a search may run: whether it asks first and whether Local chats may leave the device. AGI has more here than the leaders document.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: partly**
  - [https://support.claude.com/en/articles/11088861-use-research-on-claude](https://support.claude.com/en/articles/11088861-use-research-on-claude): Research calls enabled connector tools automatically without per-call approval (ch01:109).
- **ChatGPT: unknown**
  - no page found in the saved documentation

**AGI requirement** (stated requirement; source: docs/product/definition.md (Local, BYOK, Managed Cloud trust boundaries) and AGENTS.md section 6). Search and page fetch are labelled as leaving the device or AGI. In Local mode they run only with explicit consent for that turn or a visible setting; a Local chat never moves to managed cloud or BYOK without a labelled fork.

**With different models, providers and the one subscription.** Applies to every provider. Search counts under the one subscription. Whether approval is required in the permissive mode is an open owner decision (D-2026-09-10-02).

**Current implementation, as this trace read it on 2026-11-24: partly built.** Capabilities page asks before web search; desktop Local turns list search sources. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: W319
- Code: `apps/desktop/src-tauri/src/sys/commands/capabilities.rs:345`; `docs/decisions/wire-or-cut.md:646 (Sources on Local turns)`; `docs/decisions/2026-09-10-managed-gateway-routes.md:36-60`

**Gap.** The network switch and domain list is missing on web (W319). A Local-mode search consent was not found.

**Acceptance criteria**

1. In Local mode, a prompt needing the web asks before any outbound call.
2. Declining answers from the local model and says no search ran.
3. Sources show a label for outside content.

**Verification: not verified.** Code reading only.

## CAP-search-27 Search from the browser address bar and browsing history

The Chrome extension can serve as the address-bar search engine, or search browsing history on request.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt): The ChatGPT search Chrome extension makes ChatGPT Chrome's default search engine; !g sends a query to Google (oh09:157). Apps: Chrome.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only)). Open owner choice (ChatGPT only). History search is kept off by default.

**With different models, providers and the one subscription.** Search goes through the harness for any provider; history never leaves the device without consent.

**Current implementation, as this trace read it on 2026-11-24: partly built.** Chrome searches history on request; address-bar search missing. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: X8; rows without an id: Search and research: Search your browsing history on request (chrome, no list_id)
- Code: `apps/extension/src/features/side-panel/bubbles.ts:1430`

**Gap.** No omnibox or search provider setting.

**Acceptance criteria**

1. Type a keyword plus a query in the address bar; the side panel opens with an answer.
2. History search asks permission first.

**Verification: not verified.** Code reading only.

## CAP-search-28 Publisher control over search crawling

Websites choose whether to be included in the assistant's search by allowing a named crawler.

**Competitor evidence** (reviewed 2026-11-22)

- **Claude: unknown**
  - no page found in the saved documentation
- **ChatGPT: yes**
  - [https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt](https://help.openai.com/en/articles/9237897-searching-the-web-with-chatgpt): Sites become eligible for search by allowing OAI-Searchbot and its published IPs; placement is not guaranteed (oh09:158). Apps: web.

**AGI requirement** (proposed; source: competitor parity (ChatGPT only)). Only needed if AGI runs its own crawler or index; not needed if search comes from a provider.

**With different models, providers and the one subscription.** Depends on the search backend chosen; nothing to build otherwise.

**Current implementation, as this trace read it on 2026-11-24: unknown.** Search uses a configured provider list; no AGI crawler found. The feature pages and the ledger may say otherwise per app; follow the item links.

- Capability ledger items: none matched
- Comparison list ids: none matched
- Code: `apps/web/lib/web-search/web-search-providers.json`

**Gap.** None known unless AGI builds its own index.

**Acceptance criteria**

1. If a crawler exists, it has a documented name and obeys robots rules.

**Verification: not verified.** Not applicable until a crawler exists.

## Unresolved product choices

Decisions this topic needs from the owner. Nothing here has been decided.

- Whether web search is automatic only, or also has a visible per-chat switch like Claude's classic chats and ChatGPT's search icon.
- Whether AGI offers search modes (cached, indexed, live, off) as ChatGPT workspaces and Codex do, and whether web search should be allowed on Free.
- Whether web search and page fetch need approval in the permissive tool mode (decision D-2026-09-10-02 is marked pending the founder).
- Whether to match features only ChatGPT documents: reservations, shopping research, search with an uploaded image, address-bar search, structured live answers.
- Whether Local mode may search at all, and if so whether consent is per turn or a standing setting.
- Whether research should let users edit the plan and steer mid-run on mobile, since Claude does not document this.
- Whether the CLI gets a per-session search cap like Claude Code and whether a Free cap message may show a count (Free shows only Upgrade).

## Could not establish

- Claude chat's per-plan search call limits and whether it has a sources list; the catalogue states only citations, links and quotes.
- Plan and count limits for ChatGPT search beyond 'within usage limits'.
- Whether the learn.chatgpt.com web-search page describes ChatGPT chat or Codex; it mixes both.
- Where Claude Code connects to Claude chat for search beyond the shared subscription; saved pages were not opened beyond the catalogue.
- Whether web sources sent to a search backend honour the domain filter on every provider; only the API path was read.
- Whether mobile and desktop research export keeps citations; ledger and comparison disagree.
- Any person-run result for desktop, mobile, CLI, VS Code or Chrome search; only web scorecard W-5 and defects were read.
- The web search switch: code shows one, but the person found none on Free or Premium; cause not established.
- Most comparison rows for this topic have no list_id, so ids are given as area and feature names.
