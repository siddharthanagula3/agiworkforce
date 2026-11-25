---
id: "AREA-036"
type: "area"
title: "Sources and grounding interface"
features: ["F036-01", "F036-02", "F036-03", "F036-04", "F036-05", "F036-06", "F036-07", "F036-08", "F036-09", "F036-10", "F036-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 36. Sources and grounding interface

When an answer uses outside material, the person can see which source backs each claim. They can read the source's title, site, dates and a short quoted passage, and open the original. This lets a reader check an answer instead of trusting it, which is the main reason a research or search answer is worth more than a bare reply. Most of the area is built and working on web, desktop and mobile. The CLI, VS Code and Chrome side panel show only part of it, and the corrections, conflict and notice features are mostly missing.

**Who uses it.** Every person who gets an answer that has web sources or project-file sources, on each app that renders them. Research reports are used by people who run deep research and then open the report. The code I opened does not show a plan gate on citation display. I did not establish which plans can run web search or deep research, because that gate lives in server code I did not open. Project-file citations are for people who have a project with uploaded files. The brief does not name workspace admins or developers as separate users for this area.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F036-01](F036-01-inline-citation-markers.md) | Inline citation markers | built | built | partly | no | no | partly |
| [F036-02](F036-02-source-card-details.md) | Source card details | built | built | built | no | no | partly |
| [F036-03](F036-03-source-link-and-type-icon.md) | Source link and type icon | built | built | built | partly | partly | built |
| [F036-04](F036-04-locators-inside-files-and-chats.md) | Locators inside files and chats | built | built | built | no | no | no |
| [F036-05](F036-05-locators-for-lines-cells-slides-and-media.md) | Locators for lines, cells, slides and media | no | no | no | no | no | no |
| [F036-06](F036-06-conflicting-source-presentation.md) | Conflicting-source presentation | no | no | no | no | no | no |
| [F036-07](F036-07-unavailable-restricted-and-stale-source-notices.md) | Unavailable, restricted and stale source notices | partly | partly | partly | no | no | no |
| [F036-08](F036-08-source-correction-and-replacement.md) | Source correction and replacement | no | no | no | no | no | no |
| [F036-09](F036-09-user-controlled-evidence-set.md) | User-controlled evidence set | n/a | n/a | n/a | n/a | n/a | n/a |
| [F036-10](F036-10-source-viewer-highlight.md) | Source viewer highlight | n/a | n/a | n/a | n/a | n/a | n/a |
| [F036-11](F036-11-citation-preserving-export.md) | Citation-preserving export | built | built | built | no | no | no |

Requirement items for this area: [10-requirements/capabilities/036-sources-and-grounding-interface.md](../../10-requirements/capabilities/036-sources-and-grounding-interface.md).

## How this area works in the code

1. **The answer text carries citation markers.** The model writes bracketed numbers (for example [1]) that point at a numbered source list. A separate filter removes provider-internal citation control characters from the stream and keeps the citation text. The filter's constants and reader are at the top of this file. (`packages/ai/provider-protocol/src/citation-markup.ts:1-60`)
2. **Sources arrive with their metadata.** A search result gets a retrieval time when the search runs, and the server reads a published date out of the page HTML when it can. The research loop parses retrieved times and keeps them with each source. (`apps/web/lib/web-search/web-search-tool.ts:462 (retrievedAt set to the current time)`, `apps/web/lib/web-search/web-search-tool.ts:694 (extractPagePublishedDate)`, `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:897 (retrievalTime parsed per source)`, `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1002-1008 (toCitations; accessedAt falls back to the answer time)`)
3. **The stream carries sources to the client.** The browser stream handler keeps the retrieved time for each source when it rebuilds the answer, including after a resumed stream. (`apps/web/lib/hooks/useChatStream.ts:3641`, `apps/web/lib/hooks/useChatStream.ts:4619-4620`)
4. **Markdown turns markers into links.** The shared renderer finds runs of [n] in the text and rewrites them to internal hash links. It also turns a bare link whose text is only a domain into a citation if its URL matches a source. The matching ignores scheme, www, trailing slash and tracking parameters. (`packages/ui/unified-chat/src/components/markdown/citationMarkers.ts:5-7 (marker run and href patterns)`, `packages/ui/unified-chat/src/components/markdown/citationMarkers.ts:59 (findCitationIndexForUrl)`, `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:225-300 (citationItemsForIndices and citationChipItems)`)
5. **The chip and its card are drawn.** Grouped indices become one chip. The chip is a link to the first source, with a tooltip card listing each source. The card's domain, title, dates and snippet come from the helper functions that clean them. (`packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:124-186 (CitationChip)`, `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:82-122 (TooltipSourceRow)`, `packages/ui/unified-chat/src/components/markdown/citationPublisher.ts:63-79 (citationPublisherDomain)`, `packages/ui/unified-chat/src/components/markdown/citationPublisher.ts:89-113 (snippet and date labels)`)
6. **Project-file chips use an anchor.** A project-file citation is a file plus a page or heading trail. Its link goes to the project page with the file and page in the URL. Citations are cut to 8 per answer. (`packages/contracts/types/src/project-file-citations.ts:29 (MAX_PROJECT_FILE_CITATIONS = 8)`, `packages/contracts/types/src/project-file-citations.ts:138-148 (projectFileCitationHref)`, `packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.tsx:35-86 (ProjectFileChip)`)
7. **Mobile shows the source row and the alert.** Mobile reads the same source fields. The chip opens a native alert with the site, dates and snippet, plus an Open page button. A source row shows its title, snippet and host. (`apps/mobile/src/features/chat/components/CitationChip.tsx:1-106 (previewCitation and CitationChip)`, `apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:32-115`)
8. **Chrome side panel finds markers in the text.** The side panel scans the rendered text for [n] markers that are not inside code, links or math. It builds a chip and a card for each group, and adds a sources list at the foot of the bubble. (`apps/extension/src/features/side-panel/sources.ts:6 (CITATION_MARKER)`, `apps/extension/src/features/side-panel/sources.ts:102-134 (decorateCitations)`, `apps/extension/src/features/side-panel/sources.ts:136-151 (buildSourcesFooter)`)
9. **Research reports store and show sources.** The mobile research service reads citation rows (title, url, accessedAt, snippet, source, publishedDate) from the stored report. The web report view draws each source row and the export. A research_reports table exists in the database migrations. (`apps/mobile/src/features/research/service.ts:40-56 (citations)`, `apps/web/features/chat/components/research/ResearchReportView.tsx:68-75 (citationDateLabel)`, `apps/web/features/chat/components/research/ResearchReportView.tsx:273-377 (export path)`, `apps/web/db/neon/0094_research_reports.sql (table file; columns not read)`)

## Files to know

| File | Role |
|---|---|
| `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` | Shared web and desktop chip and hover card for one or more sources. |
| `packages/ui/unified-chat/src/components/markdown/citationPublisher.ts` | Cleans the publisher domain, snippet and dates; explains the routing-redirect problem. |
| `packages/ui/unified-chat/src/components/markdown/citationMarkers.ts` | Marker patterns, href builders, and matching of bare links to sources. |
| `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Turns markers and citation links into chips inside rendered answer text. |
| `packages/contracts/types/src/project-file-citations.ts` | Shape, limits and link builder for project-file citations (page or heading anchors). |
| `apps/mobile/src/features/chat/components/CitationChip.tsx` | Mobile chip and the native alert that previews a source. |
| `apps/mobile/src/features/chat/components/WebSearchResultCard.tsx` | Mobile source row with title, snippet and host. |
| `apps/extension/src/features/side-panel/sources.ts` | Chrome side panel: finds markers in text, builds chips, cards and the sources footer. |
| `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | Server research loop: parses source retrieval times and builds citations. |
| `apps/web/lib/web-search/web-search-tool.ts` | Server web search: sets retrieval time and reads page published dates. |
| `apps/web/features/chat/components/research/ResearchReportView.tsx` | Web research report: source rows, dates, favicon, and citation-preserving export. |
| `apps/cli/src/markdown.rs` | CLI: extracts http and https links from answer text (web_links). |

## What is stored

- Source metadata per answer or report: url, title, snippet, published date, retrieved time (or accessed time), source name: Stored with the chat message or research report; the research_reports table is defined in apps/web/db/neon/0094_research_reports.sql (I did not read its columns, so I cannot confirm where each field lands).
- Project-file citation: file name, file id, project id, snippet (max 160 characters), page or heading anchor: Carried in the answer metadata (key projectSources, header X-AGI-Project-Sources; packages/contracts/types/src/project-file-citations.ts:26-27). Storage beyond the header not verified.
- Past-chat citation: message id, conversation id, title, created time: Carried in the answer; the link is built from these ids (apps/web/features/chat/components/messages/CitationPastChats.tsx:7-11). Storage not verified.
- Browser storage for citations: none found in the files I opened: Not applicable as far as the opened code shows.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **Citation snippet length**: Snippets are cut to 180 characters on the shared card. (packages/ui/unified-chat/src/components/markdown/citationPublisher.ts:81)
- **Project-file citation limits**: At most 8 citations per answer, 160-character snippets, 3 heading segments of up to 60 characters, names up to 200 characters. (packages/contracts/types/src/project-file-citations.ts:29-33)
- **Routing-redirect host list**: Hosts that are treated as routers, so their display domain is taken from the site name or title instead. (packages/ui/unified-chat/src/components/markdown/citationPublisher.ts:32-35)
- **Research capability switches**: The request processor checks capability flags and kill switches (for example WORK_CAPABILITY, FAST_MODE_CAPABILITY) before a turn runs. I did not establish that any of them gate citation display. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:540-560 (imports only; the gate calls were not opened))
- **Plan gate for research**: Not established. (Not found in the files opened.)

## Shared between apps

[{"what":"Citation chip, hover card, publisher domain, snippet and date helpers, marker patterns, and the markdown rendering of markers","shared_by":"Web and desktop (packages/ui/unified-chat). Mobile imports the date and snippet helpers from @agiworkforce/unified-chat/citation-publisher."},{"what":"Project-file citation shape, limits, anchor formatting, link builder and ordering","shared_by":"Contract package packages/contracts/types, used by the shared chip and by web and desktop."},{"what":"Citation markup filter for provider output","shared_by":"Provider protocol package packages/ai/provider-protocol, used by the server streaming path."},{"what":"Separate per app: mobile chip, alert and source row (apps/mobile); Chrome side panel chip, card and footer (apps/extension/src/features/side-panel/sources.ts); CLI link extraction (apps/cli/src/markdown.rs); web research panel and report view (apps/web/features/chat/components/research/)","shared_by":"Not shared. Each re-implements its display, and they diverge (for example Chrome does not use the publisher-domain helper)."}]

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- The Chrome side panel shows the URL host of each source, not the publisher domain. The shared code was changed to fix exactly this for routing redirects, but the side panel still uses the host. Brief S36.03 says Chrome is done. (apps/extension/src/features/side-panel/sources.ts:11 and :28 and :49 (sourceHost from the URL); compare packages/ui/unified-chat/src/components/markdown/citationPublisher.ts:1-23 and :63-79)
- Citation hrefs still point at the routing redirect. The file says that saved conversations keep dead citations once the redirect expires. This conflicts with S36.19 (no dead links). (packages/ui/unified-chat/src/components/markdown/citationPublisher.ts:17-20)
- The retrieved date falls back to the answer's own time when a source has no retrieved time, so the card could show a retrieval date that did not happen. (apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1008 (accessedAt: source.retrievedAt ?? accessedAt); the caller of toCitations was not opened)
- Mobile source icon is a coloured letter badge plus a fixed globe icon, not a per-source-type icon. Brief S36.07 says mobile is done. (apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:58-75 and :94)
- Chrome shows the raw published-date string, with no formatting and no retrieved date. The brief marks Chrome missing for S36.05 and S36.06, so the code is ahead of the brief here, and the raw string can be a relative phrase. (apps/extension/src/features/side-panel/sources.ts:36-38)
- Chrome and mobile depend on hover, tap or focus to read a card. The web chip is a link to the source, so the card is only reachable by hover or focus on web. Touch and keyboard behaviour on web was not verified. (packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:144-186 (Tooltip on a link); apps/extension/src/features/side-panel/sources.ts:64-69 (touch handling in Chrome only))

## Not established

- Whether the brief's Chrome 'missing' statuses for S36.01, S36.05 and S36.06 are stale. The code shows a chip (sources.ts:42-62) and a raw published date (sources.ts:36-38), but I did not run the extension.
- The exact text of the unavailable-source notice on web (ResearchReportView.tsx:345 and :685 were not read in full) and on mobile (the disabled chip is the only visible path I saw). I did not confirm the notice wording.
- Whether the page-number locator (S36.09) opens the file at that page on web. The link carries the page parameter (project-file-citations.ts:138-148), but the receiving SourcesPanel code (apps/web/features/projects/components/SourcesPanel.tsx:105) was not read past its loading effect.
- How citation data is saved with a chat message (the message store and its columns) and with a research report (table columns in 0094_research_reports.sql). I did not read the store code or the migration.
- Which plans, roles or feature flags can produce research reports, project-file citations or web-search citations. The request processor and the research route have gate calls that I did not open.
- How the server parses the model's markers into the source list end to end. I read the markup filter and the research loop only in part.
- The CLI and VS Code code paths for citations beyond link extraction. The grep found only unrelated hits (for example the MCP elicitation code), so I found no citation display in those apps.
- Whether the desktop app uses the same chip code as web. The brief says done, and the desktop sources I did not open; I inferred it from the shared package name only.
- I did not run any tests, builds, servers or localhost checks. This task was read-only, so every status above comes from reading code and the brief, not from running the product. The user's rule to test only on localhost and one surface at a time was not applicable to this read-only task and was not exercised.
