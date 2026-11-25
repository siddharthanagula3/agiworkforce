---
id: "GAPS-AREA-036"
type: "gap-list"
title: "Gaps: Sources and grounding interface"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 36. Sources and grounding interface

74 open gaps that touch this area. Area page: [20-features/036-sources-and-grounding-interface](../../20-features/036-sources-and-grounding-interface/README.md).

## CMP-C264

**Slash command /deep-research**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F012-05](../../20-features/012-new-chat-experience/F012-05-search-research-agentic-and-coding-entries.md), [F013-11](../../20-features/013-composer-text-interaction/F013-11-context-chips-selected-sources-and-tools.md), [F035-01](../../20-features/035-research-workspace/F035-01-start-a-research-run-and-see-what-it-may-cost.md), [F035-04](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md), [F036-06](../../20-features/036-sources-and-grounding-interface/F036-06-conflicting-source-presentation.md), [F036-11](../../20-features/036-sources-and-grounding-interface/F036-11-citation-preserving-export.md)
- Detail: No deep-research command; /search answers one question from a web search.
- Evidence: searched: deep-research in apps/cli/src (only plan text)

## CMP-C79

**Web search modes and --search flag**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md), [F034-08](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md), [F036-01](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md), [F036-03](../../20-features/036-sources-and-grounding-interface/F036-03-source-link-and-type-icon.md)
- Detail: web_search is one live search; no cached, indexed or disabled mode, no --search flag and no context size or location setting.
- Evidence: apps/cli/src/features/exec/tools/web/mod.rs:379-460

## CMP-CP44

**Web search tool availability**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md), [F034-08](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md), [F036-01](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md), [F036-03](../../20-features/036-sources-and-grounding-interface/F036-03-source-link-and-type-icon.md)
- Detail: Web_search works only after you save a Brave or Tavily key web_search works only after you save a Brave or Tavily key; it returns up to 20 sources and records them for citation.
- Evidence: apps/cli/src/features/exec/tools/web/mod.rs:330-360

## CMP-CP46

**Web fetch tool with page summarising**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md), [F034-08](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md), [F036-07](../../20-features/036-sources-and-grounding-interface/F036-07-unavailable-restricted-and-stale-source-notices.md)
- Detail: No cache and no separate summarising model web_fetch follows up to 5 redirects and reads up to 2 MB per hop but gives the page to the main model; no cache and no separate summarising model.
- Evidence: apps/cli/src/features/exec/tools/web/mod.rs:118-126

## CMP-D25

**Reviewer that flags wrong citations and untraceable numbers**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F035-04](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md), [F036-06](../../20-features/036-sources-and-grounding-interface/F036-06-conflicting-source-presentation.md)
- Detail: Citations show as pills and artifacts have a changes review, but nothing checks numbers or citations against their source.
- Evidence: searched: citation check, factCheck in apps/web/features/chat/components/artifacts/review

## CMP-VP16

**Choose live, cached or no web search**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F036-01](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md), [F036-03](../../20-features/036-sources-and-grounding-interface/F036-03-source-link-and-type-icon.md)
- Detail: There is no cached or domain-limited mode Web search can be turned off for a session; there is no cached or domain-limited mode.
- Evidence: apps/extension-vscode/src/features/surfaces/capabilityManagement.ts:915-919

## CMP-VP47

**Web search mode: cached, live or off**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F036-01](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md), [F036-03](../../20-features/036-sources-and-grounding-interface/F036-03-source-link-and-type-icon.md)
- Detail: There is no cached versus live choice A per-turn Browse the web switch turns web search on or off; there is no cached versus live choice.
- Evidence: apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:458-462 (webSearchGate)

## CMP-W77

**Inline web images with source attribution**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F022-02](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md), [F036-01](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md), [F036-02](../../20-features/036-sources-and-grounding-interface/F036-02-source-card-details.md), [F036-03](../../20-features/036-sources-and-grounding-interface/F036-03-source-link-and-type-icon.md), [F036-06](../../20-features/036-sources-and-grounding-interface/F036-06-conflicting-source-presentation.md), [F036-07](../../20-features/036-sources-and-grounding-interface/F036-07-unavailable-restricted-and-stale-source-notices.md), [F036-08](../../20-features/036-sources-and-grounding-interface/F036-08-source-correction-and-replacement.md)
- Detail: Answers show source cards and generated images but no web images from search.
- Evidence: searched: webImages, image attribution in apps/web/features/chat, packages/ui/unified-chat/src

## CMP-WP80

**Research uses connected apps**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F009-02](../../20-features/009-compound-interface-components/F009-02-source-project-and-connected-account-pickers.md), [F010-06](../../20-features/010-modal-and-dialog-inventory/F010-06-sources-uploads-and-screen-share.md), [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md), [F036-11](../../20-features/036-sources-and-grounding-interface/F036-11-citation-preserving-export.md)
- Detail: Research can include connectors, but connectors are mostly Coming soon Research can include connectors, but connectors are mostly Coming soon.
- Evidence: apps/web/features/chat/components/research/ResearchActivity.tsx:218,313; packages/contracts/types/src/connector-release.ts:14

## GAP-AREA036-LW02

**Citation hrefs still point at the routing redirect. The file says that saved conversations keep dead citations once the redirect expires. This conflicts with S36.19 (no dead links).**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-036
- Detail: Area 36. Sources and grounding interface
- Evidence: packages/ui/unified-chat/src/components/markdown/citationPublisher.ts:17-20

## GAP-AREA036-LW03

**The retrieved date falls back to the answer's own time when a source has no retrieved time, so the card could show a retrieval date that did not happen.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-036
- Detail: Area 36. Sources and grounding interface
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1008 (accessedAt: source.retrievedAt ?? accessedAt); the caller of toCitations was not opened

## GAP-AREA036-LW06

**Chrome and mobile depend on hover, tap or focus to read a card. The web chip is a link to the source, so the card is only reachable by hover or focus on web. Touch and keyboard behaviour on web was not verified.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-036
- Detail: Area 36. Sources and grounding interface
- Evidence: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:144-186 (Tooltip on a link); apps/extension/src/features/side-panel/sources.ts:64-69 (touch handling in Chrome only)

## GAP-CAP-research-11

**Export a research report: Mobile ledger and comparison disagree. Citation-preserving export is missing on mobile (S36.25).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F035-09](../../20-features/035-research-workspace/F035-09-export-and-convert-a-report.md), [F036-11](../../20-features/036-sources-and-grounding-interface/F036-11-citation-preserving-export.md)
- Requirement items: S35.28, S36.25
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-research-16

**Web search with citations: Missing per comparison: location-aware search (W99), image results (W93), structured live answers (W94), search by image (W98), index-served search (W101).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F036-01](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md), [F036-03](../../20-features/036-sources-and-grounding-interface/F036-03-source-link-and-type-icon.md)
- Requirement items: S36.01, S36.04
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-research-17

**Citation display and sources panel: Seen defects: a raw '[7]' marker left in the answer text; chips showing only the domain; duplicate entries and section names as titles in the Sources panel ('Iana', 'References'); favicons requested from a third-party service.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F036-01](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md), [F036-02](../../20-features/036-sources-and-grounding-interface/F036-02-source-card-details.md), [F036-03](../../20-features/036-sources-and-grounding-interface/F036-03-source-link-and-type-icon.md), [F036-06](../../20-features/036-sources-and-grounding-interface/F036-06-conflicting-source-presentation.md), [F036-07](../../20-features/036-sources-and-grounding-interface/F036-07-unavailable-restricted-and-stale-source-notices.md), [F036-08](../../20-features/036-sources-and-grounding-interface/F036-08-source-correction-and-replacement.md)
- Requirement items: S36.01, S36.02, S36.03, S36.04, S36.05, S36.06, S36.08, S36.16, S36.17, S36.18, S36.19, S36.20, S36.21, S36.22, S36.23
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-research-18

**Claim cross-checking in research: No claim voting, no unverified list, no side-by-side evidence. The reviewer that flags wrong citations (D25) is missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F035-04](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md), [F036-06](../../20-features/036-sources-and-grounding-interface/F036-06-conflicting-source-presentation.md)
- Requirement items: S35.14, S36.18
- Detail: Claude yes, ChatGPT unknown; AGI not built

## GAP-CAP-research-20

**Page fetch and reading a pasted link: CLI summarising is partial; the search call limit per session is missing in the CLI (C78).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F036-07](../../20-features/036-sources-and-grounding-interface/F036-07-unavailable-restricted-and-stale-source-notices.md)
- Requirement items: S36.19
- Detail: Claude yes, ChatGPT unknown; AGI built

## GAP-CAP-search-01

**Automatic web search with inline citations: Web showed a raw [7] marker left in an answer after the chips (defect W-5, Premium). CLI, VS Code and Chrome show no inline citation marker (S36.01).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md), [F036-01](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md)
- Requirement items: S34.07, S36.01, S36.16
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-search-03

**Sources list and panel: Web panel shows duplicate entries, a header called MORE, and section names as titles ('Iana', 'References'); chips show only the domain; favicons fail (third-party favicon service 404). CLI and VS Code lack cards and the title and publisher fields.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F034-08](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md), [F036-02](../../20-features/036-sources-and-grounding-interface/F036-02-source-card-details.md), [F036-03](../../20-features/036-sources-and-grounding-interface/F036-03-source-link-and-type-icon.md)
- Requirement items: S34.24, S34.26, S36.02, S36.03, S36.04
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-search-04

**Citation hover or tap preview: VS Code and Chrome have no preview.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md), [F034-08](../../20-features/034-search-experiences/F034-08-source-cards-citations-and-source-lists.md), [F036-02](../../20-features/036-sources-and-grounding-interface/F036-02-source-card-details.md)
- Requirement items: S34.23, S34.25, S36.08
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-search-17

**Deep research with a cited report: Research using connected apps is partial (WP80); CLI missing (C264); mobile notes no connector-skipped message.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F036-11](../../20-features/036-sources-and-grounding-interface/F036-11-citation-preserving-export.md)
- Requirement items: S36.25
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-search-19

**Research report view and export with citations: Ledger and comparison disagree on mobile; check mobile export keeps sources.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F036-07](../../20-features/036-sources-and-grounding-interface/F036-07-unavailable-restricted-and-stale-source-notices.md), [F036-11](../../20-features/036-sources-and-grounding-interface/F036-11-citation-preserving-export.md)
- Requirement items: S36.19, S36.25
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-search-24

**Source freshness, unavailable-source and empty-result states: No conflicting-source, stale or restricted-source notice (S36.18, 20, 21).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md), [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md), [F036-02](../../20-features/036-sources-and-grounding-interface/F036-02-source-card-details.md), [F036-06](../../20-features/036-sources-and-grounding-interface/F036-06-conflicting-source-presentation.md), [F036-07](../../20-features/036-sources-and-grounding-interface/F036-07-unavailable-restricted-and-stale-source-notices.md)
- Requirement items: S34.31, S34.32, S36.05, S36.06, S36.18, S36.19, S36.20, S36.21
- Detail: Claude partly, ChatGPT partly; AGI partly built

## GAP-CAP-search-25

**Citations to earlier chats and memory used: Mobile has no message-level link.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F034-02](../../20-features/034-search-experiences/F034-02-global-search-dialog-and-chat-history-search.md), [F036-04](../../20-features/036-sources-and-grounding-interface/F036-04-locators-inside-files-and-chats.md)
- Requirement items: S34.02, S36.14
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-F036-01-01

**Mobile shows [n] text, not a site chip with a count**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-01](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md)
- Detail: Affects: Mobile users. Work needed: Decide the intended form and either add the site name or document it.
- Evidence: MarkdownInline.tsx:276-278

## GAP-F036-01-02

**CLI has no markers or chips**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-01](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md)
- Detail: Affects: CLI users. Work needed: Add numbered markers in the terminal answer tied to the list.
- Evidence: apps/cli/src/claude_parity.rs:1054

## GAP-F036-01-03

**VS Code has no markers**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-01](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md)
- Detail: Affects: VS Code users. Work needed: Draw markers in the webview.
- Evidence: webviewContent.ts:4746-4784

## GAP-F036-01-04

**Brief and code disagree on Chrome and Mobile S36.17**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-01](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md)
- Detail: Affects: Anyone planning from the brief. Work needed: Update the brief rows.
- Evidence: sources.ts:42; MarkdownInline.tsx:239

## GAP-F036-01-05

**Tauri desktop inline chips not established**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-01](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md)
- Detail: Affects: Tauri build. Work needed: Check whether MarkdownContent receives citations there.
- Evidence: packages/ui/unified-chat/src/components/MessageBubble.tsx:846

## GAP-F036-01-NOTBUILT

**Inline citation markers: not built on Mobile, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code
- Features: [F036-01](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md)
- Requirement items: S36.01, S36.16, S36.17
- Detail: Mobile: S36.17; CLI: S36.01, S36.16, S36.17; VS Code: S36.01, S36.16, S36.17

## GAP-F036-02-01

**Chrome card lacks retrieved date and shared formatting**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-02](../../20-features/036-sources-and-grounding-interface/F036-02-source-card-details.md)
- Detail: Affects: Chrome users. Work needed: Use the shared helpers.
- Evidence: sources.ts:21-40

## GAP-F036-02-02

**VS Code drops snippet and dates**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-02](../../20-features/036-sources-and-grounding-interface/F036-02-source-card-details.md)
- Detail: Affects: VS Code users. Work needed: Forward all fields and draw them.
- Evidence: ChatStateManager.ts:6654

## GAP-F036-02-03

**CLI shows no fields**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-02](../../20-features/036-sources-and-grounding-interface/F036-02-source-card-details.md)
- Detail: Affects: CLI users. Work needed: Print title, site, dates.
- Evidence: claude_parity.rs:1054

## GAP-F036-02-04

**The protocol type has no date fields**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-02](../../20-features/036-sources-and-grounding-interface/F036-02-source-card-details.md)
- Detail: Affects: All apps using AgentEventSource. Work needed: Add optional dates to the contract or confirm another type carries them.
- Evidence: AgentEventSource.ts:3

## GAP-F036-02-05

**Only two redirect hosts are known**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-02](../../20-features/036-sources-and-grounding-interface/F036-02-source-card-details.md)
- Detail: Affects: Sources from other routers. Work needed: Resolve redirects when sources are ingested (the file says this).
- Evidence: citationPublisher.ts:32-36

## GAP-F036-02-NOTBUILT

**Source card details: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F036-02](../../20-features/036-sources-and-grounding-interface/F036-02-source-card-details.md)
- Requirement items: S36.02, S36.03, S36.05, S36.06, S36.08
- Detail: CLI: S36.02, S36.03, S36.05, S36.06, S36.08; VS Code: S36.02, S36.03, S36.05, S36.06, S36.08; Chrome: S36.05, S36.06, S36.08

## GAP-F036-03-01

**No per-type icon on Mobile search rows or Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-03](../../20-features/036-sources-and-grounding-interface/F036-03-source-link-and-type-icon.md)
- Detail: Affects: Mobile, Chrome users. Work needed: Add icons by source kind.
- Evidence: WebSearchResultCard.tsx:62-76; sources.ts:26

## GAP-F036-03-02

**CLI does not treat sources as sources**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-03](../../20-features/036-sources-and-grounding-interface/F036-03-source-link-and-type-icon.md)
- Detail: Affects: CLI users. Work needed: List the delivered source list with numbers.
- Evidence: claude_parity.rs:1058

## GAP-F036-03-03

**Dead redirect links in saved chats**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-03](../../20-features/036-sources-and-grounding-interface/F036-03-source-link-and-type-icon.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Resolve redirects at ingest.
- Evidence: citationPublisher.ts header

## GAP-F036-03-04

**Brief code pointers for CLI are off**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-03](../../20-features/036-sources-and-grounding-interface/F036-03-source-link-and-type-icon.md)
- Detail: Affects: Maintainers. Work needed: Fix the brief references.
- Evidence: apps/cli/src/tui/tui_app.rs:4444 is about rewind, not links

## GAP-F036-03-05

**Web chip href is not stripped of tracking parameters**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-03](../../20-features/036-sources-and-grounding-interface/F036-03-source-link-and-type-icon.md)
- Detail: Affects: Web users. Work needed: Apply stripTrackingParams.
- Evidence: CitationChip.tsx:147

## GAP-F036-03-NOTBUILT

**Source link and type icon: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F036-03](../../20-features/036-sources-and-grounding-interface/F036-03-source-link-and-type-icon.md)
- Requirement items: S36.07
- Detail: CLI: S36.07; VS Code: S36.07

## GAP-F036-04-01

**Brief says Mobile missing; code has it**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-04](../../20-features/036-sources-and-grounding-interface/F036-04-locators-inside-files-and-chats.md)
- Detail: Affects: Planning. Work needed: Update brief.
- Evidence: ProjectFileCitations.tsx; PastChatCitations.tsx

## GAP-F036-04-02

**No locator on CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-04](../../20-features/036-sources-and-grounding-interface/F036-04-locators-inside-files-and-chats.md)
- Detail: Affects: those users. Work needed: Decide whether they need Projects first.
- Evidence: no code found

## GAP-F036-04-03

**Mobile page opening not confirmed**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-04](../../20-features/036-sources-and-grounding-interface/F036-04-locators-inside-files-and-chats.md)
- Detail: Affects: Mobile users. Work needed: Read ProjectSourcesViewer and test.
- Evidence: route reads params; viewer not read

## GAP-F036-04-04

**Tauri desktop not established**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-04](../../20-features/036-sources-and-grounding-interface/F036-04-locators-inside-files-and-chats.md)
- Detail: Affects: Tauri build. Work needed: Check or record as out of scope.
- Evidence: doc: AGENTS.md section 5

## GAP-F036-04-NOTBUILT

**Locators inside files and chats: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F036-04](../../20-features/036-sources-and-grounding-interface/F036-04-locators-inside-files-and-chats.md)
- Requirement items: S36.09, S36.14
- Detail: CLI: S36.09, S36.14; VS Code: S36.09, S36.14; Chrome: S36.09, S36.14

## GAP-F036-05-01

**No locator types for lines, cells, slides or media time**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-05](../../20-features/036-sources-and-grounding-interface/F036-05-locators-for-lines-cells-slides-and-media.md)
- Detail: Affects: All six apps. Work needed: Contract fields, server extraction, chip display, viewer positioning.
- Evidence: project-file-citations.ts:10-15

## GAP-F036-05-02

**Viewer cannot open at those places**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-05](../../20-features/036-sources-and-grounding-interface/F036-05-locators-for-lines-cells-slides-and-media.md)
- Detail: Affects: Web, Mobile. Work needed: Viewer support per file kind.
- Evidence: SourcesPanel.tsx:164-168 reads only page

## GAP-F036-05-03

**Whether a media player or sheet viewer exists in Projects**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-05](../../20-features/036-sources-and-grounding-interface/F036-05-locators-for-lines-cells-slides-and-media.md)
- Detail: Affects: Planning. Work needed: Inspect the project file previewers.
- Evidence: not checked

## GAP-F036-05-NOTBUILT

**Locators for lines, cells, slides and media: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F036-05](../../20-features/036-sources-and-grounding-interface/F036-05-locators-for-lines-cells-slides-and-media.md)
- Requirement items: S36.10, S36.11, S36.12, S36.13
- Detail: Web: S36.10, S36.11, S36.12, S36.13; Desktop: S36.10, S36.11, S36.12, S36.13; Mobile: S36.10, S36.11, S36.12, S36.13; CLI: S36.10, S36.11, S36.12, S36.13; VS Code: S36.10, S36.11, S36.12, S36.13; Chrome: S36.10, S36.11, S36.12, S36.13

## GAP-F036-06-01

**No conflict presentation**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-06](../../20-features/036-sources-and-grounding-interface/F036-06-conflicting-source-presentation.md)
- Detail: Affects: All six apps. Work needed: Define the form, extraction, rendering and tests.
- Evidence: area brief S36.18

## GAP-F036-06-02

**Source record has no stance**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-06](../../20-features/036-sources-and-grounding-interface/F036-06-conflicting-source-presentation.md)
- Detail: Affects: All apps. Work needed: Contract field or markdown form.
- Evidence: AgentEventSource.ts:3

## GAP-F036-06-03

**No evaluation for conflicts**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-06](../../20-features/036-sources-and-grounding-interface/F036-06-conflicting-source-presentation.md)
- Detail: Affects: Quality. Work needed: Add cases.
- Evidence: none found

## GAP-F036-06-NOTBUILT

**Conflicting-source presentation: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F036-06](../../20-features/036-sources-and-grounding-interface/F036-06-conflicting-source-presentation.md)
- Requirement items: S36.18
- Detail: Web: S36.18; Desktop: S36.18; Mobile: S36.18; CLI: S36.18; VS Code: S36.18; Chrome: S36.18

## GAP-F036-07-01

**No restricted-source notice**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-07](../../20-features/036-sources-and-grounding-interface/F036-07-unavailable-restricted-and-stale-source-notices.md)
- Detail: Affects: All six apps. Work needed: Define a restricted state in the Citation contract, set it where access is checked, render it in the shared chip, CitationRow and mobile chip.
- Evidence: Brief S36.20 missing; no code found

## GAP-F036-07-02

**No stale-source notice**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-07](../../20-features/036-sources-and-grounding-interface/F036-07-unavailable-restricted-and-stale-source-notices.md)
- Detail: Affects: All six apps. Work needed: Decide the freshness rule in configuration and show a notice when retrieval is older than it.
- Evidence: Brief S36.21 missing; only accessedAt is displayed (ResearchReportView.tsx:60-68)

## GAP-F036-07-03

**Unparseable URL still rendered as a link on Web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-07](../../20-features/036-sources-and-grounding-interface/F036-07-unavailable-restricted-and-stale-source-notices.md)
- Detail: Affects: Web, Desktop. Work needed: Render a non-link element when the URL does not parse.
- Evidence: ResearchReportView.tsx:88-95

## GAP-F036-07-04

**Mobile has no uncaptured-sources notice and drops URL-less citations silently**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-07](../../20-features/036-sources-and-grounding-interface/F036-07-unavailable-restricted-and-stale-source-notices.md)
- Detail: Affects: Mobile. Work needed: Keep the information and show a notice like Web.
- Evidence: apps/mobile/src/features/research/service.ts:47

## GAP-F036-07-05

**Mobile disabled chip gives no reason**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-07](../../20-features/036-sources-and-grounding-interface/F036-07-unavailable-restricted-and-stale-source-notices.md)
- Detail: Affects: Mobile. Work needed: Add a short visible or spoken reason.
- Evidence: CitationChip.tsx:86-94

## GAP-F036-07-06

**CLI, VS Code and Chrome have no notice**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-07](../../20-features/036-sources-and-grounding-interface/F036-07-unavailable-restricted-and-stale-source-notices.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Not examined for design: unknown
- Evidence: Brief S36.19 missing

## GAP-F036-07-NOTBUILT

**Unavailable, restricted and stale source notices: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F036-07](../../20-features/036-sources-and-grounding-interface/F036-07-unavailable-restricted-and-stale-source-notices.md)
- Requirement items: S36.19, S36.20, S36.21
- Detail: Web: S36.20, S36.21; Desktop: S36.20, S36.21; Mobile: S36.20, S36.21; CLI: S36.19, S36.20, S36.21; VS Code: S36.19, S36.20, S36.21; Chrome: S36.19, S36.20, S36.21

## GAP-F036-08-01

**No way to flag a wrong citation**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-08](../../20-features/036-sources-and-grounding-interface/F036-08-source-correction-and-replacement.md)
- Detail: Affects: All six apps. Work needed: Control, API, storage, review path.
- Evidence: Brief S36.22 missing

## GAP-F036-08-02

**No way to replace a cited source**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-08](../../20-features/036-sources-and-grounding-interface/F036-08-source-correction-and-replacement.md)
- Detail: Affects: All six apps. Work needed: Control, regeneration of the affected claim, confirmation, saved-version handling.
- Evidence: Brief S36.23 missing

## GAP-F036-08-NOTBUILT

**Source correction and replacement: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F036-08](../../20-features/036-sources-and-grounding-interface/F036-08-source-correction-and-replacement.md)
- Requirement items: S36.22, S36.23
- Detail: Web: S36.22, S36.23; Desktop: S36.22, S36.23; Mobile: S36.22, S36.23; CLI: S36.22, S36.23; VS Code: S36.22, S36.23; Chrome: S36.22, S36.23

## GAP-F036-09-01

**No user control over the evidence set in the Sources area**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-09](../../20-features/036-sources-and-grounding-interface/F036-09-user-controlled-evidence-set.md)
- Detail: Affects: All six apps. Work needed: Decide ownership (Projects or research settings) and link it; do not duplicate.
- Evidence: Brief S36.24 not applicable

## GAP-F036-09-02

**Project docs require enforced source controls; enforcement not verified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-09](../../20-features/036-sources-and-grounding-interface/F036-09-user-controlled-evidence-set.md)
- Detail: Affects: Web, Desktop. Work needed: Read research-sources.ts and research-loop.ts and test enforcement.
- Evidence: docs/product/experience-contract.md:781

## GAP-F036-10-01

**No viewer and no highlight**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-10](../../20-features/036-sources-and-grounding-interface/F036-10-source-viewer-highlight.md)
- Detail: Affects: All six apps. Work needed: Needs product decision first; then viewer, stored offsets, fallback.
- Evidence: Brief S36.15 not applicable

## GAP-F036-11-01

**Brief says Mobile export is missing, code shows Download, Share and Save to Library**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-11](../../20-features/036-sources-and-grounding-interface/F036-11-citation-preserving-export.md)
- Detail: Affects: Mobile (documentation). Work needed: Verify on a device, then correct the brief.
- Evidence: ReportsScreen.tsx:340-352; ReportsScreenActions.test.tsx:126-135

## GAP-F036-11-02

**Export of an uncaptured-source report has no note**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-11](../../20-features/036-sources-and-grounding-interface/F036-11-citation-preserving-export.md)
- Detail: Affects: Web, Desktop, Mobile. Work needed: Add a one-line note to the exported document.
- Evidence: research-report.ts:25-37

## GAP-F036-11-03

**Tauri export has no citations**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-11](../../20-features/036-sources-and-grounding-interface/F036-11-citation-preserving-export.md)
- Detail: Affects: Retained Tauri desktop. Work needed: Decide to fix or retire.
- Evidence: ResearchReport.tsx:189-203

## GAP-F036-11-04

**No export on CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-11](../../20-features/036-sources-and-grounding-interface/F036-11-citation-preserving-export.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Not examined: unknown.
- Evidence: Brief S36.25 missing

## GAP-F036-11-05

**Export of ordinary chat answers with citations not traced**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F036-11](../../20-features/036-sources-and-grounding-interface/F036-11-citation-preserving-export.md)
- Detail: Affects: All apps. Work needed: Trace message export paths.
- Evidence: Only report export read

## GAP-F036-11-NOTBUILT

**Citation-preserving export: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F036-11](../../20-features/036-sources-and-grounding-interface/F036-11-citation-preserving-export.md)
- Requirement items: S36.25
- Detail: CLI: S36.25; VS Code: S36.25; Chrome: S36.25
