---
id: "F093-10"
type: "feature"
title: "Citations"
aliases: ["Citations", "Source locator registry (S93.25)", "Citation resolver (S93.26)", "Grounding checker (S93.27)", "citation chips", "[n] markers", "project sources"]
area: "93 Search, retrieval, and context components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S93.25", "S93.26", "S93.27"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-memory-projects-and-context", "SYS-data-model-and-migrations", "SYS-shared-ui-and-design", "F093-07", "F093-09", "F093-11", "table:web_messages"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F093-10 Citations

Citations are the numbered source links under an answer. The server numbers them in the order sources were shown, saves them with the message, and replaces Google routing redirects with publisher addresses. Project-file citations can point to a page or heading. A grounding checker that verifies claims against sources is not built for chat or research.

Area: [93. Search, retrieval, and context components](README.md). Requirement items: [S93.25](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9325), [S93.26](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9326), [S93.27](../../10-requirements/capabilities/093-search-retrieval-and-context-components.md#s9327).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Gives each cited fact a stable number and link; keeps the numbers the same between the model text, the live display and the saved message; resolves expiring routing redirects; carries file citations with a page or heading [apps/web/lib/web-search/web-search-tool.ts:516-529; apps/web/app/api/chat/conversations/[id]/messages/lib/resolve-source-urls.ts:29-43; packages/contracts/types/src/project-file-citations.ts:12-27].

**Why it exists.** A marker that opens the wrong page, or a link that dies after a day, destroys trust in an answer [web-search-tool.ts:497-502 comment; web-search-tool.ts:770-790 comment].

**Who uses it.** Readers of answers on web and mobile; project chats with knowledge files; engineers verifying provenance.

**Problems it solves**

- Two searches in one turn both restarting at [1]
- Dead provider redirect links in saved chats
- Sources lost when the client save fails (server collects them too) [assistant-turn-sources.ts:1-28 comment]

**Use cases**

- Click [2] and open the page the model meant
- Reload a chat and see the same sources
- Open a project-file chip that names a page or heading
- Read the Research sources panel after a report

## 2. User experience

**Where to find it**

- Web: [n] markers in answer text and source chips; CitationChip and ProjectFileCitationChip [packages/ui/unified-chat/src/components/markdown/CitationChip.tsx; ProjectFileCitationChip.tsx]; a 'Sources' button tooltip [MessageBubble.tsx:3859].
- Web research: 'Research sources' panel and tab list labelled 'Research views' [apps/web/features/chat/components/research/ResearchPanel.tsx:403, 551].
- Mobile: inline citation markers and a reports screen [apps/mobile/src/features/chat/utils/inlineCitationMarkers.ts; apps/mobile/src/features/research/ReportsScreen.tsx:296].

**Before you start**

- A turn that searched, read pages, ran Deep Research, or retrieved project files.

**Screens and controls**

- Citation chips and group chips (#chat-citation-N links) [citationMarkers.ts:8-13].
- Project file chips showing the file name, page or heading trail [project-file-citations.ts:12-19].

**Journey**

1. 1. The model writes [n] markers.
2. 2. The client turns markers into chips by position.
3. 3. The user opens a chip.
4. 4. After the stream, the message saves with its citations; the server and client both resolve redirects.

**What the person sees and gets**

- Chips with title and site.
- Search tool text tells the model which number each result has [web-search-tool.ts:533-537].
- No grounded or ungrounded indicator for chat answers (none found).

**Settings**

- none found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Numbering follows the turn's delivered source list; a result the turn cannot carry gets no number and is not shown [web-search-tool.ts:516-529; tool-loop.ts:4660-4696].
- Persistence collects sources and the pages the model actually cited, separately, up to 20 each [assistant-turn-sources.ts:86, 207-260].
- Saving a message resolves Google routing redirects to publisher URLs; a failure keeps the links as they arrived and logs a warning [persist-message.ts:88-90; resolve-source-urls.ts:29-43].
- The resolver follows manual hops only through the two known routing hosts, 2 s timeout, 3 hops, through the guarded fetch, cached 24 h [web-search-tool.ts:770-800, 818-845].
- The server's post-stream patch also rewrites the row, so whichever writer lands last still stores publisher URLs [resolve-source-urls.ts:14-21 comment; assistant-turn-persistence.ts:598].
- Project-file citations are a bounded list (8 entries, 160-character snippet, 3 heading segments) sent in a header [project-file-citations.ts:28-35; apps/web/lib/chat-project-sources.ts:20-44].

**Incomplete**

- Locator types: project-file anchors carry only page and heading trail [project-file-citations.ts:12-19]. Retrieval chunk metadata adds messageId and role and character offsets [packages/platform/data-layer/src/search/types.ts:208-226]. The typed locator variants web_page, news_article, academic_paper, pdf_document exist in research.ts but nothing sets them: research citations are built with id, title, url, snippet and time only [packages/contracts/types/src/research.ts:52-74; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1002-1010]. Line, cell, slide and timestamp locators from the brief: none found.
- The brief names a registry of locators; no registry object was found, only separate types (none found).

**Present but disconnected or switched off**

- PublicSourceLocator and citationIsReproducible are exported and tested only [packages/contracts/types/src/__tests__/public-source-types.test.ts].

**Not available**

- Grounding checker: not built for chat or Deep Research (no code found). A token-overlap groundedness measure exists only for the support-docs assistant [apps/web/lib/support/agent/policy/groundedness.ts:1-40]. Deep Research derives open or closed gaps by word overlap between plan steps and the report, which is not claim verification [research-loop.ts:590-631].

## 4. Required behaviour

**Established requirements**

- A registry of locator types (page, heading, line, cell, slide, timestamp, message) lets any citation point inside its source. (source: brief S93.25)
- Citations are resolved to stable publisher URLs and numbered consistently for display and storage. (source: brief S93.26)
- A grounding checker verifies cited claims are supported by their sources before or after answering. Status: missing. (source: brief S93.27)
- Every factual claim in the evaluation set has supporting evidence or an explicit uncertainty; citations resolve to the material supporting the claim; reports reopen with sources intact. (source: doc: docs/product/experience-contract.md:781)
- The experience includes a citation chip and sources disclosure. (source: doc: docs/product/experience-contract.md:394)

**Acceptance criteria**

1. After two searches in one turn, each [n] opens the page the tool listed under that number.
2. Reloading the chat shows the same sources in the same order.
3. A saved message citing a routing redirect stores the publisher URL.
4. If redirect resolution fails, the save still succeeds.
5. A project-file chip shows the page or heading when the file has one.
6. A source the turn cannot carry is not numbered.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Grounding must run on Cloud chat and research output to meet W08 [inferred from docs/product/experience-contract.md:781].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Define one locator union (page, heading, line, cell, slide, timestamp, message) and fill it from retrieval chunks.
- [proposed] Build a grounding check that compares claims to cited passages and shows an uncertainty note.
- [proposed] Set the research locator for PDFs from the page the reader used.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | project-file-citations | `packages/contracts/types/src/project-file-citations.ts` | File citation shape, bounds, parser, header name |
| schema | research contract | `packages/contracts/types/src/research.ts` | Citation and PublicSourceLocator types |
| service | chat-project-sources | `apps/web/lib/chat-project-sources.ts` | Encodes project sources into a response header |
| service | assistant-turn-sources | `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-sources.ts` | Server-side collection of sources and citations from the stream |
| service | assistant-turn-persistence | `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.ts` | Persists the turn, patches redirect URLs |
| service | persist-message | `apps/web/app/api/chat/conversations/[id]/messages/lib/persist-message.ts` | Saves the message; calls the resolver |
| service | resolve-source-urls | `apps/web/app/api/chat/conversations/[id]/messages/lib/resolve-source-urls.ts` | Resolves redirects for a saved message |
| service | source-url-metadata | `apps/web/lib/web-search/source-url-metadata.ts` | Detects and patches routing redirects in metadata |
| service | web-search-tool citation numbering | `apps/web/lib/web-search/web-search-tool.ts` | formatWebSearchResultForModel and redirect resolution |
| service | tool-loop source ledger | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | sourcePositionFor numbering |
| component | CitationChip | `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` | Chip rendering |
| component | ProjectFileCitationChip | `packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.tsx` | File chip rendering |
| service | citationMarkers | `packages/ui/unified-chat/src/components/markdown/citationMarkers.ts` | Marker parsing and hrefs |
| store | web-chat-store | `apps/web/shared/stores/web-chat-store.ts` | Holds project sources on the client |
| service | retrieval search types | `packages/platform/data-layer/src/search/types.ts` | Chunk metadata with page, heading, message id and offsets |
| service | support groundedness | `apps/web/lib/support/agent/policy/groundedness.ts` | Token-overlap groundedness for the support assistant only |
| component | mobile inline citation markers | `apps/mobile/src/features/chat/utils/inlineCitationMarkers.ts` | Mobile marker handling |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The loop assigns each result a number as it is shown to the model. | our servers | tool-loop.ts:4686-4696; web-search-tool.ts:519-523 |
| Sources stream to the client; the server copy is collected from the same frames. | our servers | assistant-turn-sources.ts:190-230 |
| The client renders [n] markers as chips by position. | device | citationMarkers.ts:8-13 |
| Saving the message resolves routing redirects through a guarded fetch to the publisher address. | our servers | persist-message.ts:88; web-search-tool.ts:803-830 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Citations and sources | Assistant message metadata | yes with the conversation | Follows the message |
| Resolved redirect cache | In-process memory, up to about 5,000 entries | no | 24 hours [web-search-tool.ts:787-800] |
| Project sources header | Response header, not stored | no | Limit 6,000 characters, snippets dropped if too long [chat-project-sources.ts:20-44] |

**Models and providers.** The model writes the markers; numbering and resolution are platform code. A provider's own grounding returns routing redirects that this feature resolves [web-search-tool.ts:770-782].

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in; saving needs ownership of the conversation [persist-message.ts:62-75]. |
| Permissions | Conversation owner only; temporary chats are not saved [persist-message.ts:78]. |
| Subscription | none found for citations; a Free daily message-write allowance applies to saving [persist-message.ts:80-84]. |
| Limits and metering | 20 persisted sources per turn; 8 project file citations; 160-character snippet; redirect resolution 2 s and 3 hops. |
| Feature flags | none found. |
| Model compatibility | Any model that writes [n] markers; numbering is independent. |
| Provider restrictions | Redirect resolution covers two Google routing hosts only. |
| Local mode | Local chats are not saved through this server path; local citation behaviour: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Source budget spent | New results are not numbered or shown; model told | web-search-tool.ts:523-529 |
| Redirect cannot be resolved | Keeps the redirect link; save succeeds; warning logged | resolve-source-urls.ts:36-42 |
| Client save fails | Server-collected sources remain in the row | assistant-turn-sources.ts:1-28 comment |
| Slow or retried client save | Both writers resolve, so the last write is still publisher URLs | resolve-source-urls.ts:14-21 |
| Redirect lands on a refused site in research | The source is removed from the list | research-loop.ts:927-935 |
| Header too large | Snippets dropped from the project sources header | chat-project-sources.ts:34-44 |
| Accessibility | not traced | unknown |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-sources.test.ts`: 33 cases: collection, order, dedupe
- `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.citation-urls.test.ts`: redirect resolution on the server persist path (title-level)
- `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.project-sources.test.ts`: project sources persisted
- `apps/web/app/api/llm/v1/chat/completions/lib/managed-agent-stream.citation-urls.test.ts`: redirect handling in the agent stream
- `apps/web/app/api/chat/conversations/[id]/messages/lib/__tests__/persist-message.stopped-run.test.ts`: message save path that includes the resolver (file mentions it)
- `packages/contracts/types/src/__tests__/project-file-citation-links.test.ts`: project file citation parsing
- `packages/contracts/types/src/__tests__/public-source-types.test.ts`: 7 cases: locator variants and reproducibility
- `packages/ui/unified-chat/src/components/markdown/citationMarkers.test.ts`: marker parsing
- `packages/ui/unified-chat/src/components/markdown/CitationChip.card.test.tsx`: chip rendering
- `apps/web/features/chat/components/research/ResearchPanel.sourcesNumbering.test.tsx`: numbering in the research panel

**Test scenarios**

- **Two searches, one turn**
  1. Ask a question that needs two searches
  2. Click [1] through the last marker
  - Expected: Each opens the page listed under that number.
- **Reload**
  1. Reload the conversation
  - Expected: Same sources and order.
- **Redirect resolution**
  1. Use a Google-grounded turn
  2. Inspect the saved message metadata
  - Expected: Publisher URLs, not routing links.
- **Project file chip**
  1. Ask a question answered from a paginated project file
  - Expected: Chip names the file and page or heading.
- **Grounding absence**
  1. Ask a question and force a wrong citation
  - Expected: No checker flags it (documents the gap).

**Where to look when it fails**

- Log event saved_message_citation_resolution_failed [resolve-source-urls.ts:36-39].
- Log event assistant_turn_persist_failed [assistant-turn-persistence.ts:470].
- Message metadata keys projectSources and sources.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No grounding checker for chat or research.** Affects: All Cloud answers. Evidence: brief S93.27; groundedness.ts only under support/agent. Work needed: Design and build claim-to-source verification and an uncertainty display.
- **Locator types: only page, heading, message id and offsets exist; no line, cell, slide, timestamp; no single registry.** Affects: Project files, media, spreadsheets, decks. Evidence: project-file-citations.ts:12-19; search/types.ts:208-214. Work needed: Define the union and fill it during indexing.
- **PublicSourceLocator is never produced.** Affects: Deep Research reports. Evidence: research-loop.ts:1002-1010. Work needed: Set locators when building citations.
- **Redirect resolution covers two hosts only.** Affects: Other routing providers. Evidence: web-search-tool.ts:779-782. Work needed: Extend the list when a new router appears (it must match the client list).
- **Persisted citation identity may carry a placeholder provider.** Affects: Provenance. Evidence: assistant-turn-sources.ts:103, 138. Work needed: See F093-07 gap.

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-memory-projects-and-context
- SYS-data-model-and-migrations
- SYS-shared-ui-and-design
- F093-07
- F093-09
- F093-11
- table:web_messages

## Unknown

- Exact line of persist-message.ts that stores metadata and the message table name.
- Whether mobile saves citations through the same server path.
- Whether any screen shows ProjectFileAnchor on mobile.
- The CitationChip and mobile chips' accessibility labels.
