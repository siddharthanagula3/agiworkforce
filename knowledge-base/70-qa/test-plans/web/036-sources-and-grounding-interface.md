---
id: "PLAN-web-036"
type: "test-plan"
title: "Web · 36. Sources and grounding interface"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "36"
---
# Web · 36. Sources and grounding interface

14 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S36.01 Citation marker.

- **Expected:** Claims in an answer carry an inline citation marker that identifies the source.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:124; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366; apps/web/features/chat/components/messages/MessageBubble.tsx:2897
- **Where to find it:** In a chat answer that searched the web: small pill chips showing a site name sit at the end of claims. Each chip's accessible name reads "Source {{indices}}: {{sites}}". (labels found in the code)
- **Needs:** a Free account or a paid account; a question that triggers web search
- **Steps:**
  1. Sign in and open a chat.
  2. Send a question that makes the answer search the web for current facts.
  3. Look for small rounded pill chips with a site name placed right after a sentence in the answer.
  4. Compare with Expected: claims should carry an inline marker naming the source.

## S36.02 Source title.

- **Expected:** Each cited source shows its title.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:84; apps/web/features/chat/components/research/ResearchPanel.tsx:137; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366
- **Where to find it:** Chat answer > "Show sources" button under the answer (tooltip "Sources") > Research panel tab "Sources". (labels found in the code)
- **Needs:** a web-search answer
- **Steps:**
  1. Open a chat answer that used web sources.
  2. Hover the book icon under the answer and click "Show sources".
  3. In the panel on the right, look at the bold first line of each source row.
  4. Compare with Expected: each cited source shows its title.

## S36.03 Publisher or provider.

- **Expected:** Each cited source shows its publisher or provider (site name/domain).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:49; packages/ui/unified-chat/src/components/markdown/citationPublisher.ts:48; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366
- **Where to find it:** Chat answer > "Show sources" button under the answer > Research panel tab "Sources" (the grey line under each source title). (labels found in the code)
- **Needs:** a web-search answer
- **Steps:**
  1. Open a chat answer that used web sources.
  2. Click "Show sources".
  3. Read the grey line under each source title; it shows the site domain.
  4. Hover a site-name pill in the answer to see the same info in the tooltip.
  5. Compare with Expected: each source names its publisher or site.

## S36.04 Source URL or resource identifier.

- **Expected:** Each cited source exposes its URL or resource identifier and can be opened.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:148; apps/web/features/chat/components/research/ResearchPanel.tsx:106; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366
- **Where to find it:** Chat answer > "Show sources" button > Research panel tab "Sources" > click a source row. (labels found in the code)
- **Needs:** a web-search answer; a browser with internet access
- **Steps:**
  1. Open a chat answer that used web sources and click "Show sources".
  2. Click one source row.
  3. Look for a new browser tab opening the source page.
  4. Compare with Expected: the source opens from its row.

## S36.05 Publication date.

- **Expected:** Cited sources show their publication date when known.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:58 (quoted code not found in the file now); apps/web/features/chat/components/research/ResearchPanel.tsx:86 (quoted code not found in the file now); apps/web/lib/web-search/web-search-tool.ts:377
- **Where to find it:** Chat answer > "Show sources" button > Research panel tab "Sources" (source row text); also the "Report" tab > Sources list. (labels found in the code)
- **Needs:** a web-search answer; the date only appears when the source provides one
- **Steps:**
  1. Open a chat answer that used web sources and click "Show sources".
  2. Look at the grey line under a source title for a date.
  3. If there is no date, check the "Report" tab on a Deep Research report.
  4. Compare with Expected: cited sources show a publication date when the source has one.

## S36.06 Retrieval date.

- **Expected:** Cited sources show when they were retrieved/accessed.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:986; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1008; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:746; apps/web/lib/hooks/useChatStream.ts:4624
- **Where to find it:** Chat answer > "Show sources" button > Research panel tab "Sources" (grey line under a source title). (labels found in the code)
- **Needs:** a web-search answer
- **Steps:**
  1. Open a chat answer that used web sources and click "Show sources".
  2. Read the grey line under a source title.
  3. Look for "Retrieved" followed by a date.
  4. Compare with Expected: each source shows when it was retrieved.

## S36.07 Source-type icon.

- **Expected:** Each source shows an icon for its type (web page, file, chat, connector...).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:53; packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.tsx:21; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366
- **Where to find it:** Chat answer: source chips show a globe icon for web sources; project files show a file icon in the group "Project files used in this answer"; past chats show a chat icon in the group "Previous chats this answer used". (labels found in the code)
- **Needs:** a web-search answer; a project with an uploaded file for the file icon; past chats for the chat icon
- **Steps:**
  1. Open a chat answer that used web sources and look at the small globe icon in the site-name pill.
  2. Open a chat answer that cited a project file (see S36.09) and look for the file icon.
  3. Open a chat answer that used past chats (see S36.14) and look for the chat icon.
  4. Compare with Expected: each source type has its own icon.

## S36.08 Quoted supporting excerpt.

- **Expected:** A cited source shows the quoted excerpt that supports the claim.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:115; packages/contracts/types/src/project-file-citations.ts:22; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366
- **Where to find it:** Chat answer > hover a site-name pill (tooltip) or > "Show sources" > Research panel tab "Sources" (text under the source title). (labels found in the code)
- **Needs:** a web-search answer
- **Steps:**
  1. Open a chat answer that used web sources.
  2. Hover a site-name pill in the answer and read the tooltip.
  3. Click "Show sources" and read the short text under a source title.
  4. Compare with Expected: each cited source shows a quoted excerpt supporting the claim.

## S36.09 Page-number locator.

- **Expected:** Citations to paginated documents name the page and open the source at that page.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/ProjectFileCitationChip.tsx:15 (quoted code not found in the file now); apps/web/features/projects/components/SourcesPanel.tsx:168; packages/contracts/types/src/project-file-citations.ts:86
- **Where to find it:** Chat answer > group "Project files used in this answer" > click a file chip showing "p. N" > the project file preview opens on that page. (labels found in the code)
- **Needs:** a project with an uploaded multi-page PDF; a Free or paid account
- **Steps:**
  1. Open a project that has an uploaded PDF and ask a question that answers from it.
  2. In the answer, find the group of chips "Project files used in this answer".
  3. Read the chip that shows the file name and "p." followed by a number.
  4. Click the chip and look whether the file preview opens on that page.
  5. Compare with Expected: the citation names the page and opens the file there.

## S36.14 Message/thread locator.

- **Expected:** Citations to earlier chats/messages link to the exact message.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/CitationPastChats.tsx:11; apps/web/features/chat/components/messages/CitationPastChats.tsx:27; apps/web/features/chat/pages/WebChatPage.tsx:5100
- **Where to find it:** Chat answer that used past chats > group "Previous chats this answer used" > click a chip (opens the earlier chat at that message). (labels found in the code)
- **Needs:** two chats in the same account; the answer must draw on the earlier one
- **Steps:**
  1. Have a chat where the assistant recalls an earlier conversation.
  2. Ask a question that makes the answer draw on that earlier chat.
  3. Find the group "Previous chats this answer used" under the answer.
  4. Click one chip and look for the earlier chat opening with that message highlighted.
  5. Compare with Expected: the citation opens the exact message.

## S36.16 Claim-to-source relationship.

- **Expected:** Each citation sits at the claim it supports so the user can tell which source backs which claim.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:310; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366; packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:151
- **Where to find it:** Chat answer: the source chip sits right after the sentence it supports (site-name pill). (labels found in the code)
- **Needs:** a web-search answer
- **Steps:**
  1. Open a chat answer that used web sources.
  2. Read each sentence and find the small pill chip placed right after it.
  3. Hover the chip to see which source it names.
  4. Compare with Expected: each chip sits at the claim it supports.

## S36.17 Multiple sources per claim.

- **Expected:** A single claim can cite several sources and the user can see all of them.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:165; packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:178; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366
- **Where to find it:** Chat answer: a chip with "+N" after the site name; hover it to see all sources for that claim. (labels found in the code)
- **Needs:** a web-search answer where one claim cites several sources
- **Steps:**
  1. Open a chat answer that used web sources.
  2. Look for a site-name chip showing "+" and a number.
  3. Hover the chip and read the tooltip list.
  4. Compare with Expected: all sources for the claim are visible.

## S36.19 Unavailable-source notice.

- **Expected:** When a cited source cannot be opened or was not captured, the product says so instead of showing a dead link.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchReportView.tsx:634; apps/web/features/chat/components/research/ResearchReportView.tsx:217; apps/web/features/chat/components/messages/MessageBubble.tsx:3657
- **Where to find it:** Chat > Deep research report > "Report" tab in the Research panel > bottom of the report, section "Sources". (labels found in the code)
- **Needs:** a report whose run recorded no source links but whose text has numbered references
- **Steps:**
  1. Open a Deep Research report from the Research panel's "Report" tab.
  2. Scroll to the end of the report body.
  3. Look for the "Sources" heading and the sentence about numbered sources.
  4. Compare with Expected: when a source cannot be opened, the product says so rather than showing a dead link.

## S36.25 Citation-preserving export.

- **Expected:** Exporting an answer/report keeps its citations and source list.
- **Code:** done. Evidence moved: apps/web/features/chat/components/research/ResearchReportView.tsx:68 (quoted code not found in the file now); apps/web/features/chat/components/research/ResearchReportView.tsx:264; apps/web/features/chat/components/research/ResearchReportView.tsx:134
- **Where to find it:** Chat > Deep research report > "Report" tab in the Research panel > export buttons "Markdown", "PDF" and "Word" in the report header. (labels found in the code)
- **Needs:** a completed Deep Research report with sources
- **Steps:**
  1. Open a Deep Research report from the Research panel's "Report" tab.
  2. Click the export button "Markdown" (or "PDF" or "Word").
  3. Open the downloaded file.
  4. Compare with Expected: the citations and the source list are present in the exported file.
