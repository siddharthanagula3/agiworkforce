---
id: "PLAN-desktop-036"
type: "test-plan"
title: "Desktop · 36. Sources and grounding interface"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "36"
---
# Desktop · 36. Sources and grounding interface

14 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S36.01 Citation marker.

- **Expected:** Claims in an answer carry an inline citation marker that identifies the source.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:124; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366; apps/web/features/chat/components/messages/MessageBubble.tsx:2897
- **Where to find it:** Chat screen > ask a question that needs current web sources > read the answer; a small chip with a site name or domain sits right after the claim (labels found in the code)
- **Needs:** a question that needs current web sources (web search must be on for the chat)
- **Steps:**
  1. Sign in and open a new chat from the chat screen.
  2. Type a question that needs current facts, such as a recent news topic, and send it.
  3. Wait for the answer to finish.
  4. Look for a small rounded chip with a site name after a sentence in the answer.
  5. Compare with Expected: the claim should carry a marker that names its source.

## S36.02 Source title.

- **Expected:** Each cited source shows its title.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:84; apps/web/features/chat/components/research/ResearchPanel.tsx:137; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366
- **Where to find it:** Answer with web sources > hover a source chip > tooltip shows the source title; or Sources > Research sources panel > Sources tab (labels found in the code)
- **Needs:** a question that needs current web sources; a mouse for hover
- **Steps:**
  1. Ask a question that needs current web sources and wait for the answer.
  2. Hover the mouse over a small source chip after a sentence.
  3. Read the bold line at the top of the tooltip that appears.
  4. Alternatively, click the globe button titled Research sources in the top bar, then keep the Sources tab selected.
  5. Compare with Expected: each source should show its title.

## S36.03 Publisher or provider.

- **Expected:** Each cited source shows its publisher or provider (site name/domain).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:49; packages/ui/unified-chat/src/components/markdown/citationPublisher.ts:48; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366
- **Where to find it:** Answer with web sources > hover a source chip > tooltip line under the title; or Research sources panel > Sources tab > line under each title (labels found in the code)
- **Needs:** a question that needs current web sources
- **Steps:**
  1. Ask a question that needs current web sources and wait for the answer.
  2. Hover a source chip and read the grey line under the title in the tooltip.
  3. Or click the globe button titled Research sources and open the Sources tab.
  4. Read the grey line under each source title in the list.
  5. Compare with Expected: each source should name its publisher or domain.

## S36.04 Source URL or resource identifier.

- **Expected:** Each cited source exposes its URL or resource identifier and can be opened.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:148; apps/web/features/chat/components/research/ResearchPanel.tsx:106; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366
- **Where to find it:** Research sources panel > Sources tab > click a source row, which opens in a new tab; or click a source chip in an answer (labels found in the code)
- **Needs:** a question that needs current web sources; a browser that allows new tabs
- **Steps:**
  1. Ask a question that needs current web sources and wait for the answer.
  2. Click the globe button titled Research sources at the top of the chat.
  3. On the Sources tab, click one source row.
  4. Look for a new browser tab that opens the web address.
  5. Compare with Expected: the source should open at its own URL (the domain is shown under the title).

## S36.05 Publication date.

- **Expected:** Cited sources show their publication date when known.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:58 (quoted code not found in the file now); apps/web/features/chat/components/research/ResearchPanel.tsx:86 (quoted code not found in the file now); apps/web/lib/web-search/web-search-tool.ts:377
- **Where to find it:** Research sources panel > Sources tab > grey line under a source title; or hover a source chip and read the tooltip (labels found in the code)
- **Needs:** a question that needs current web sources, with sources that have a date
- **Steps:**
  1. Ask a question that needs current web sources and wait for the answer.
  2. Click the globe button titled Research sources, then open the Sources tab.
  3. Read the grey line under a source title for a date next to the domain.
  4. Compare with Expected: the publication date should show when the source gives one.

## S36.06 Retrieval date.

- **Expected:** Cited sources show when they were retrieved/accessed.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:986; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1008; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:746; apps/web/lib/hooks/useChatStream.ts:4624
- **Where to find it:** Research sources panel > Sources tab > grey line starting with Retrieved; or hover a source chip and read the tooltip (labels found in the code)
- **Needs:** a question that needs current web sources
- **Steps:**
  1. Ask a question that needs current web sources and wait for the answer.
  2. Click the globe button titled Research sources, then open the Sources tab.
  3. Read the line that starts with Retrieved under a source.
  4. Compare with Expected: each cited source should show when it was retrieved.

## S36.07 Source-type icon.

- **Expected:** Each source shows an icon for its type (web page, file, chat, connector...).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:53; packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.tsx:21; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366
- **Where to find it:** Answer that used a project file > look at the icon before the file name in the chip; a web source chip shows a globe icon (path not confirmed in the code; trust the screen)
- **Needs:** a project with at least one indexed knowledge file; a question the file can answer
- **Steps:**
  1. Open a chat in a project that has knowledge files, and ask a question the files can answer.
  2. Wait for the answer and look at the chip after the claim.
  3. A project-file chip shows a document icon before the file name.
  4. Hover a web source chip and compare: it shows a favicon or a globe icon instead.
  5. Compare with Expected: each source shows an icon for its type.

## S36.08 Quoted supporting excerpt.

- **Expected:** A cited source shows the quoted excerpt that supports the claim.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:115; packages/contracts/types/src/project-file-citations.ts:22; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366
- **Where to find it:** Answer with web sources > hover a source chip > grey excerpt text at the bottom of the tooltip; or Research sources panel > Sources tab > two-line grey text under a source (labels found in the code)
- **Needs:** a question that needs current web sources where the source gives a snippet
- **Steps:**
  1. Ask a question that needs current web sources and wait for the answer.
  2. Hover a source chip and read the grey excerpt in the tooltip.
  3. Or click the globe button titled Research sources and read the short excerpt under each source.
  4. Compare with Expected: the excerpt should be the passage that supports the claim.

## S36.09 Page-number locator.

- **Expected:** Citations to paginated documents name the page and open the source at that page.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.tsx:15 (quoted code not found in the file now); apps/web/features/projects/components/SourcesPanel.tsx:168; packages/contracts/types/src/project-file-citations.ts:86
- **Where to find it:** Answer that used a project file > click a project-file chip that shows p. and a page number; the project Sources preview opens at that page (path not confirmed in the code; trust the screen)
- **Needs:** a project with a paginated knowledge file (PDF); a question the file can answer
- **Steps:**
  1. Open a chat in a project with a knowledge file that has pages, such as a PDF.
  2. Ask a question the file can answer and wait for the answer.
  3. Look for a chip with the file name and text like p. 3 after it.
  4. Click the chip.
  5. Compare with Expected: the file preview should open at that page number.

## S36.14 Message/thread locator.

- **Expected:** Citations to earlier chats/messages link to the exact message.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/CitationPastChats.tsx:11; apps/web/features/chat/components/messages/CitationPastChats.tsx:27; apps/web/features/chat/pages/WebChatPage.tsx:5100
- **Where to find it:** Answer that used earlier chats > look for a row of chips above or below the answer with a past chat title and date > click one to open that chat at its message (labels found in the code)
- **Needs:** an account with an earlier saved chat that the answer can recall
- **Steps:**
  1. Use a chat that has earlier conversations saved, with the past-chat memory feature on.
  2. Ask a question that refers to something from an earlier chat.
  3. Look for the chip with a past chat title and a date after the answer.
  4. Click the chip.
  5. Compare with Expected: the source chat should open and land on the exact message.

## S36.16 Claim-to-source relationship.

- **Expected:** Each citation sits at the claim it supports so the user can tell which source backs which claim.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:310; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366; packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:151
- **Where to find it:** Answer with web sources > read a sentence > the source chip sits right after the sentence it supports (path not confirmed in the code; trust the screen)
- **Needs:** a question that needs current web sources
- **Steps:**
  1. Ask a question that needs current web sources and wait for the answer.
  2. Read the answer one sentence at a time.
  3. Look at where each source chip sits relative to the sentence.
  4. Hover a chip to see which source it names.
  5. Compare with Expected: each chip should sit at the claim it supports.

## S36.17 Multiple sources per claim.

- **Expected:** A single claim can cite several sources and the user can see all of them.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:165; packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:178; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366
- **Where to find it:** Answer with web sources > a source chip that shows +N after the site name > hover it to see every source in the tooltip (path not confirmed in the code; trust the screen)
- **Needs:** a question that needs current web sources where one claim cites several sources
- **Steps:**
  1. Ask a question that needs current web sources and wait for the answer.
  2. Look for a chip with a site name followed by a plus count such as +1 or +2.
  3. Hover the chip.
  4. Read the tooltip, which lists one row per source.
  5. Compare with Expected: all sources that back this claim should be listed.

## S36.19 Unavailable-source notice.

- **Expected:** When a cited source cannot be opened or was not captured, the product says so instead of showing a dead link.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchReportView.tsx:634; apps/web/features/chat/components/research/ResearchReportView.tsx:217; apps/web/features/chat/components/messages/MessageBubble.tsx:3657
- **Where to find it:** Research sources panel > Report tab > open a saved report whose text has numbers like [1] but no captured links; the Sources heading shows the notice (labels found in the code)
- **Needs:** a saved research report whose sources were not captured (rare; may need a seeded report)
- **Steps:**
  1. Click the globe button titled Research sources at the top of the chat.
  2. Click the Report tab.
  3. Open a saved research report.
  4. Scroll to the bottom under the Sources heading.
  5. Compare with Expected: where a link is missing, a notice should say the report refers to numbered sources without links, instead of a dead link.

## S36.25 Citation-preserving export.

- **Expected:** Exporting an answer/report keeps its citations and source list.
- **Code:** done. Evidence moved: apps/web/features/chat/components/research/ResearchReportView.tsx:68 (quoted code not found in the file now); apps/web/features/chat/components/research/ResearchReportView.tsx:264; apps/web/features/chat/components/research/ResearchReportView.tsx:134
- **Where to find it:** Research sources panel > Report tab > open a saved report > click Markdown, PDF or Word in the top bar (labels found in the code)
- **Needs:** a saved research report with sources
- **Steps:**
  1. Click the globe button titled Research sources at the top of the chat.
  2. Click the Report tab and open a saved research report.
  3. Click Markdown, PDF or Word in the top bar of the report.
  4. Open the downloaded file.
  5. Compare with Expected: the file should keep the numbered citations and the Sources list at the end.
