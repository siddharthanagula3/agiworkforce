---
id: "PLAN-web-034"
type: "test-plan"
title: "Web · 34. Search experiences"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "34"
---
# Web · 34. Search experiences

19 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S34.01 Search inside the current conversation.

- **Expected:** Inside an open conversation the user can type a query and jump between the messages that match it.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageSearch.tsx:96; apps/web/features/chat/components/messages/ChatMessageList.tsx:1539; apps/web/features/chat/components/messages/ChatMessageList.tsx:1312 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:2093
- **Where to find it:** Open a conversation with messages > press Command+F (or click the search control in the chat header if shown) (labels found in the code)
- **Needs:** a conversation with several messages that contain a shared word
- **Steps:**
  1. Open a conversation that has several messages.
  2. Press Command+F. A bar with the placeholder "Search messages..." appears.
  3. Type a word that appears in the conversation.
  4. Click "Go to next match" or "Go to previous match" (or press Enter and Shift+Enter in the box).
  5. Check the match count beside the box and that the view jumps between the matching messages, as Expected says.

## S34.02 Search conversation history.

- **Expected:** The user can search past conversations by title and message text and open a matching chat; only conversations the user can see in history are returned.
- **Code:** done. Evidence present: apps/web/app/api/search/route.ts:324
- **Earlier check in the running app:** PASS: E003 [PASS; interaction]: Searching QA_CHECKLIST_OK returned three matching messages across two conversations with highlighted matches.
- **Where to find it:** Sidebar > Search > Search your workspace (type a title or message text, press Enter) (labels found in the code)
- **Needs:** a Free or paid account with at least one past conversation containing a known word
- **Steps:**
  1. Click "Search" in the sidebar, or press Shift+Command+F.
  2. Type a word from a past conversation's title or messages in the box "Search your workspace" and press Enter.
  3. Leave the category on "All" and read the results list.
  4. Click a result that is a conversation and check that it opens that chat.
  5. Compare with Expected: titles and message text are both matched and the chat opens.

## S34.03 Search Projects.

- **Expected:** The user can search their Projects by name or description and open a match.
- **Code:** done. Evidence present: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:80; apps/web/features/chat/services/global-search-service.ts:223; apps/web/app/api/search/route.ts:339
- **Where to find it:** Sidebar > Search > Projects (category chip), or Sidebar > Projects > Search projects... (labels found in the code)
- **Needs:** a Free or paid account with at least one Project
- **Steps:**
  1. Click "Search" in the sidebar.
  2. Type the name or a word from the description of a project.
  3. Click the category chip "Projects" under the box, then read the results.
  4. Click a result with the project's name and check that it opens that project.
  5. Compare with Expected: the project is found by name or description.

## S34.04 Search Library.

- **Expected:** The Library (saved files, images, documents, artifacts) has a search box that filters its items by name/prompt.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1002; packages/ui/unified-chat/src/components/library/LibraryView.tsx:459; apps/web/app/api/library/route.ts:177; apps/web/features/library/components/LibraryView.tsx:281
- **Where to find it:** Sidebar > Library > Search files and projects (labels found in the code)
- **Needs:** a Free or paid account with some saved files, images or documents in Library
- **Steps:**
  1. Click "Library" in the sidebar.
  2. Click in the box "Search files and projects" and type part of a file name.
  3. Watch the list narrow to matching items.
  4. Clear the box and check that the full list returns.
  5. Compare with Expected: the box filters Library items by name.

## S34.05 Search artifacts.

- **Expected:** The user can search their artifacts by title/content and open a match.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:113; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1002; apps/web/app/api/library/route.ts:177; apps/web/app/chat/artifacts/page.tsx:8
- **Where to find it:** Sidebar > Library > Artifacts (tab) > Search files and projects (labels found in the code)
- **Needs:** a Free or paid account with at least one saved artifact
- **Steps:**
  1. Click "Library" in the sidebar.
  2. Click the tab "Artifacts" under the search box.
  3. Type part of an artifact's title in "Search files and projects".
  4. Click the matching artifact to open it.
  5. Compare with Expected: the artifact is found by title and opens.

## S34.06 Search connected company sources.

- **Expected:** The assistant can search the user's connected work sources (Drive, Slack, Notion...) during a chat once they are connected.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6083; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/directory/sources/first-party.json:10
- **Where to find it:** Chat composer > + > Connectors (labels found in the code)
- **Needs:** a paid account with at least one connected work source (Drive, Slack or Notion)
- **Steps:**
  1. Open a new chat and click the "+" in the composer.
  2. Click "Connectors" to open its submenu.
  3. Turn on a connected source (for example Drive or Slack) with its checkbox.
  4. Send a question that asks for information stored in that source.
  5. Compare with Expected: the answer draws on the connected source.

## S34.07 Public web search.

- **Expected:** A chat can search the public web and answer from the results.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3190; apps/web/lib/hooks/useChatStream.ts:3511 (quoted code not found in the file now); apps/web/lib/web-search/required-search.ts:248; apps/web/lib/web-search/web-search-tool.ts:61
- **Where to find it:** Chat composer > + > Search the web (menu item; the active chip reads "Web search") (labels found in the code)
- **Steps:**
  1. Open a new chat and click the "+" in the composer.
  2. Click "Search the web" to turn it on, then check the chip that shows "Web search".
  3. Ask a question about a current public topic.
  4. Read the answer and look for sources or citations from the web.

## S34.15 Date-range filters.

- **Expected:** The user can limit a search to a date range and get only results inside it.
- **Code:** done. Evidence present: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:591; apps/web/features/chat/services/global-search-service.ts:185; apps/web/app/api/search/route.ts:312
- **Earlier check in the running app:** UI_ONLY: E004 [UI_ONLY; visible UI]: Date-range, message-type and archived filters are exposed; filtered-result accuracy was not yet exercised.
- **Where to find it:** Sidebar > Search > Filters > From Date / To Date (labels found in the code)
- **Needs:** a Free or paid account with past conversations spread over several dates
- **Steps:**
  1. Click "Search" in the sidebar and type a query.
  2. Click the "Filters" button under the box.
  3. Click "From Date" and pick a date, then "To Date" and pick a later date.
  4. Read the results list and check that every result falls inside the chosen range.
  5. Compare with Expected: results outside the range are not shown.

## S34.19 User-selected source collections.

- **Expected:** The user can put chosen sources into a named collection (e.g. a project's knowledge) and have chats search only/also that collection.
- **Code:** done. Evidence present: apps/web/features/projects/components/SourcesPanel.tsx:220; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3855; apps/web/lib/services/project-knowledge-retrieval.ts:49
- **Where to find it:** not found in the code. Found the project Sources panel (apps/web/features/projects/components/SourcesPanel.tsx) with filter, sort and search controls, but found no visible control for a named source collection or for limiting chats to one.
- **Needs:** a Project with sources added

## S34.20 Search suggestions.

- **Expected:** Before or while typing a search, the user is offered suggested queries (recent, popular or completions) and can pick one.
- **Code:** done. Evidence moved: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:679; apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:583 (quoted code not found in the file now); apps/web/features/chat/services/global-search-service.ts:321; apps/web/app/api/search/route.ts:262
- **Where to find it:** Sidebar > Search > Recent Searches (shown when the box is empty) (labels found in the code)
- **Steps:**
  1. Click "Search" in the sidebar and run one search so it is stored.
  2. Close the dialog, open "Search" again and leave the box empty.
  3. Look for the "Recent Searches" heading with query chips under it.
  4. Click a chip and check that the query runs.
  5. Compare with Expected: a previous query is offered and can be picked.

## S34.21 Follow-up query refinement.

- **Expected:** After a search-backed answer, the user is offered follow-up/refined queries and can send one with a tap.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ChatMessageList.tsx:1468; apps/web/features/chat/components/messages/ChatMessageList.tsx:1297 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:2018
- **Where to find it:** Chat > under the latest answer > Follow-up suggestions (labels found in the code)
- **Needs:** a Free or paid account; follow-up suggestions must be turned on in settings
- **Steps:**
  1. Send a question that uses web search and wait for the answer to finish.
  2. Look below the answer for the region "Follow-up suggestions".
  3. Click one suggestion.
  4. Check that it is sent as the next message in the chat.
  5. Compare with Expected: a tap sends the refined query.

## S34.22 Query clarification choices.

- **Expected:** When a search query is ambiguous the product offers clarification choices the user can pick before searching.
- **Code:** done. Evidence present: apps/web/lib/services/clarify-tool-service.ts:57
- **Where to find it:** not found in the code. Found the clarify tool name ask_clarifying_questions in apps/web/lib/services/clarify-tool-service.ts and a clarify card at apps/web/features/chat/components/messages/cards/ClarifyCard.tsx, but did not read its visible wording or confirm the path a person takes.
- **Needs:** a query that the assistant finds ambiguous

## S34.23 Result previews.

- **Expected:** Search results show a preview (title, snippet or matched text) before the user opens them.
- **Code:** done. Evidence moved: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:384; apps/web/features/chat/components/research/ResearchPanel.tsx:139 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:115; apps/web/app/api/search/route.ts:414 (quoted code not found in the file now)
- **Earlier check in the running app:** PASS: E003 [PASS; interaction]: Searching QA_CHECKLIST_OK returned three matching messages across two conversations with highlighted matches.
- **Where to find it:** Sidebar > Search > type a query > results list (labels found in the code)
- **Needs:** a Free or paid account with a known word in past chats
- **Steps:**
  1. Click "Search" in the sidebar and type a word you know is in a chat.
  2. Press Enter and wait for the results.
  3. Read each result: it shows a type label (for example "Title", "Project" or "Artifact") and the matched word in highlight.
  4. Compare with Expected: each result shows a preview before it is opened.

## S34.24 Source cards.

- **Expected:** Sources behind an answer are shown as cards with at least title, site and link.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchPanel.tsx:510; apps/web/features/chat/components/research/ResearchPanel.tsx:137; apps/web/features/chat/components/messages/MessageBubble.tsx:3595; apps/web/features/chat/components/messages/MessageBubble.tsx:2510
- **Where to find it:** Chat > answer with web sources > "Sources" button under the answer > Citations / More (labels found in the code)
- **Needs:** a Free or paid account with web search turned on
- **Steps:**
  1. Ask a question that uses web search and wait for the answer.
  2. Click the "Sources" button under the answer.
  3. Read the sections "Citations" and "More" in the panel.
  4. Check that each source card shows a title, site and link.
  5. Compare with Expected: each source card has at least title, site and link.

## S34.25 Citation hover/tap preview.

- **Expected:** Hovering or tapping a citation shows a preview of the source (title, site, snippet) without leaving the answer.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:169; packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:82; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366
- **Where to find it:** Chat > answer with citations > hover or tap a numbered citation chip (labels found in the code)
- **Needs:** a Free or paid account with web search turned on
- **Steps:**
  1. Ask a question that uses web search and wait for the answer.
  2. Hover (or tap on a touch screen) over a citation chip in the answer text.
  3. Read the preview that opens over the answer.
  4. Check it shows the source title, site and snippet.
  5. Compare with Expected: the preview shows without leaving the answer.

## S34.26 Source list expansion.

- **Expected:** A compact source summary can be expanded to the full list of sources used and consulted.
- **Code:** done. Evidence moved: apps/web/features/chat/components/research/ResearchPanel.tsx:544 (quoted code not found in the file now); apps/web/features/chat/components/research/ResearchPanel.tsx:515; apps/web/features/chat/stores/research-panel-store.ts:47
- **Where to find it:** Chat > answer > "View N sources" button > More (labels found in the code)
- **Needs:** a Free or paid account with web search turned on, and an answer with several sources
- **Steps:**
  1. Ask a question that uses web search and wait for the answer.
  2. Click the compact line "View N sources" under the answer.
  3. Look for the "More" section after "Citations".
  4. Compare the full list with the sources the answer used and consulted.
  5. Compare with Expected: the compact summary expands to the full list.

## S34.27 Open original source.

- **Expected:** From a citation or source card the user can open the original page/document.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:148; apps/web/features/chat/components/research/ResearchPanel.tsx:106; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:267 (quoted code not found in the file now)
- **Where to find it:** Chat > answer > click a citation chip or a source card title (labels found in the code)
- **Needs:** a Free or paid account with web search turned on
- **Steps:**
  1. Ask a question that uses web search and wait for the answer.
  2. Click a citation chip, or a source in the Sources panel.
  3. Check that a new browser tab opens with the original page.
  4. Compare with Expected: the original page or document opens.

## S34.31 Search-result freshness information.

- **Expected:** Search results and sources show how fresh they are (publication or retrieval date).
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:58 (quoted code not found in the file now); apps/web/features/chat/components/research/ResearchPanel.tsx:86 (quoted code not found in the file now); apps/web/lib/web-search/web-search-tool.ts:377
- **Where to find it:** Chat > answer > hover or tap a citation chip > read the "Retrieved" line (labels found in the code)
- **Needs:** a Free or paid account with web search turned on
- **Steps:**
  1. Ask a question that uses web search and wait for the answer.
  2. Hover or tap a citation chip.
  3. Read the date line that starts with "Retrieved" and any published date above it.
  4. Compare with Expected: the source shows its publication or retrieval date.

## S34.32 Empty-results and unavailable-source states.

- **Expected:** Searches that find nothing, or whose source/provider is unavailable, show a clear empty or unavailable state instead of silence.
- **Code:** done. Evidence moved: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:775; apps/web/features/chat/components/messages/MessageBubble.tsx:3657; apps/web/features/chat/components/messages/MessageBubble.tsx:1716 (quoted code not found in the file now); apps/web/features/chat/components/research/ResearchPanel.tsx:202
- **Earlier check in the running app:** PASS: E005 [PASS; interaction]: A unique nonexistent query produces an explicit no-results state, rather than retaining prior matches.
- **Where to find it:** Sidebar > Search > type a nonsense word (for example zzqx9) and press Enter (labels found in the code)
- **Steps:**
  1. Click "Search" in the sidebar.
  2. Type a word that matches nothing and press Enter.
  3. Read the empty state: "No results found" with "Try different keywords or clear filters".
  4. Check that old results are not kept on screen.
  5. Compare with Expected: an explicit empty state is shown.
