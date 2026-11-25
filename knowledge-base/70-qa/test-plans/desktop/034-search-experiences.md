---
id: "PLAN-desktop-034"
type: "test-plan"
title: "Desktop · 34. Search experiences"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "34"
---
# Desktop · 34. Search experiences

19 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S34.01 Search inside the current conversation.

- **Expected:** Inside an open conversation the user can type a query and jump between the messages that match it.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/MessageSearch.tsx:96; apps/web/features/chat/components/messages/ChatMessageList.tsx:1539; apps/web/features/chat/components/messages/ChatMessageList.tsx:1312 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:2093
- **Where to find it:** Open any chat > press Command+F (Ctrl+F on Windows) > type in "Search messages..." (labels found in the code)
- **Steps:**
  1. Open a conversation that has several messages.
  2. Press Command+F.
  3. Type a word that appears in an earlier message.
  4. Look for the "N of M matches" count beside the box.
  5. Press Enter or use the "Next match" arrow to jump between matches, then compare with Expected.

## S34.02 Search conversation history.

- **Expected:** The user can search past conversations by title and message text and open a matching chat; only conversations the user can see in history are returned.
- **Code:** done. Evidence present: apps/web/app/api/search/route.ts:324
- **Where to find it:** Sidebar > Search > type in "Search your workspace" (labels found in the code)
- **Needs:** a conversation with a known word in its text
- **Steps:**
  1. Click "Search" in the sidebar, or press Command+Shift+F.
  2. Type a word from a past conversation title or message.
  3. Wait for the results list.
  4. Click a matching conversation result.
  5. Check that the conversation opens and the result matches Expected.

## S34.03 Search Projects.

- **Expected:** The user can search their Projects by name or description and open a match.
- **Code:** done. Evidence present: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:80; apps/web/features/chat/services/global-search-service.ts:223; apps/web/app/api/search/route.ts:339
- **Where to find it:** Sidebar > Search > type a project name > category "Projects" (labels found in the code)
- **Needs:** a Free account or paid account with at least one project
- **Steps:**
  1. Click "Search" in the sidebar, or press Command+Shift+F.
  2. Type the name of one of your projects.
  3. Click the "Projects" category chip.
  4. Click the matching project result.
  5. Check that the project opens and the match is by name or description.

## S34.04 Search Library.

- **Expected:** The Library (saved files, images, documents, artifacts) has a search box that filters its items by name/prompt.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:1002; packages/ui/unified-chat/src/components/library/LibraryView.tsx:459; apps/web/app/api/library/route.ts:177; apps/web/features/library/components/LibraryView.tsx:281
- **Where to find it:** Sidebar > Library > type in "Search files and projects" (labels found in the code)
- **Needs:** a file already saved in the Library
- **Steps:**
  1. Click "Library" in the sidebar.
  2. Click in the box "Search files and projects".
  3. Type part of a saved file name.
  4. Check that the list narrows to matching items.
  5. Clear the box and check the full list returns.

## S34.05 Search artifacts.

- **Expected:** The user can search their artifacts by title/content and open a match.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/library/LibraryView.tsx:113; packages/ui/unified-chat/src/components/library/LibraryView.tsx:1002; apps/web/app/api/library/route.ts:177; apps/web/app/chat/artifacts/page.tsx:8
- **Where to find it:** Sidebar > Library > Artifacts > type in "Search files and projects" (labels found in the code)
- **Needs:** at least one artifact
- **Steps:**
  1. Click "Library" in the sidebar.
  2. Choose the "Artifacts" view.
  3. Click the search box and type part of an artifact title.
  4. Check that only matching artifacts remain.
  5. Open a matching artifact and compare with Expected.

## S34.06 Search connected company sources.

- **Expected:** The assistant can search the user's connected work sources (Drive, Slack, Notion...) during a chat once they are connected.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6083; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/lib/connectors/directory/sources/first-party.json:10
- **Where to find it:** Message box > Connectors menu (labels found in the code)
- **Needs:** a connected work source such as Google Drive or Slack
- **Steps:**
  1. Open a chat and find the Connectors control in the message box.
  2. Open the "Connectors" menu.
  3. Check which connected sources are listed and enabled.
  4. Send a question that asks about a connected source, for example a Drive or Slack file.
  5. Look for the answer to use that source, and compare with Expected.

## S34.07 Public web search.

- **Expected:** A chat can search the public web and answer from the results.
- **Code:** done. Evidence moved: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:3190; apps/web/lib/hooks/useChatStream.ts:3511 (quoted code not found in the file now); apps/web/lib/web-search/required-search.ts:248; apps/web/lib/web-search/web-search-tool.ts:61
- **Where to find it:** Message box > Web search (labels found in the code)
- **Needs:** a model that supports web search
- **Steps:**
  1. Open a chat and look at the message box options.
  2. Turn on "Web search" if it is offered, or type /search followed by a question.
  3. Send a question about a current event.
  4. Look for an answer that cites web sources.
  5. Compare with Expected.

## S34.15 Date-range filters.

- **Expected:** The user can limit a search to a date range and get only results inside it.
- **Code:** done. Evidence present: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:591; apps/web/features/chat/services/global-search-service.ts:185; apps/web/app/api/search/route.ts:312
- **Where to find it:** Sidebar > Search > (filter area) > From Date / To Date (labels found in the code)
- **Needs:** conversations dated across more than one range
- **Steps:**
  1. Click "Search" in the sidebar.
  2. Open the filter area of the search dialog.
  3. Click the "From Date" box and choose a start date, then "To Date" and choose an end date.
  4. Type a word and search.
  5. Check that every result date falls inside the chosen range.

## S34.19 User-selected source collections.

- **Expected:** The user can put chosen sources into a named collection (e.g. a project's knowledge) and have chats search only/also that collection.
- **Code:** done. Evidence present: apps/web/features/projects/components/SourcesPanel.tsx:220; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3855; apps/web/lib/services/project-knowledge-retrieval.ts:49
- **Where to find it:** not found in the code. The project Sources panel exists, but no control was found for putting chosen sources into a named collection or limiting chats to it. Searched the project files for collection and knowledge controls; only the Sources panel and its search box were found.
- **Needs:** a project with knowledge files

## S34.20 Search suggestions.

- **Expected:** Before or while typing a search, the user is offered suggested queries (recent, popular or completions) and can pick one.
- **Code:** done. Evidence moved: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:679; apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:583 (quoted code not found in the file now); apps/web/features/chat/services/global-search-service.ts:321; apps/web/app/api/search/route.ts:262
- **Where to find it:** Sidebar > Search (leave the box empty) (labels found in the code)
- **Needs:** some earlier searches so the recent list is not empty
- **Steps:**
  1. Click "Search" in the sidebar.
  2. Leave the search box empty and look below it.
  3. Check for the "Recent Searches" list and the popular list.
  4. Click one suggestion.
  5. Check that it fills the box and runs the search.

## S34.21 Follow-up query refinement.

- **Expected:** After a search-backed answer, the user is offered follow-up/refined queries and can send one with a tap.
- **Code:** done. Evidence moved: apps/web/features/chat/components/messages/ChatMessageList.tsx:1468; apps/web/features/chat/components/messages/ChatMessageList.tsx:1297 (quoted code not found in the file now); apps/web/features/chat/components/messages/ChatMessageList.tsx:2018
- **Where to find it:** not found in the code. Follow-up suggestions are off by default (FOLLOW_UP_SUGGESTIONS_ENABLED_DEFAULT = false in apps/web/features/chat/components/messages/ChatMessageList.tsx) and depend on a settings flag; the Settings screen that sets it was not found.
- **Needs:** a paid account or a setting turned on

## S34.22 Query clarification choices.

- **Expected:** When a search query is ambiguous the product offers clarification choices the user can pick before searching.
- **Code:** done. Evidence present: apps/web/lib/services/clarify-tool-service.ts:57
- **Where to find it:** Chat > the reply card with "Send answers" (labels found in the code)
- **Needs:** none, but the assistant decides whether to ask
- **Steps:**
  1. Open a chat and send a vague request that a clarification would help with.
  2. Wait for a card that asks questions.
  3. Pick one of the offered choices, or type in "Something else…".
  4. Click "Send answers".
  5. Check that the search runs after the answers are sent.

## S34.23 Result previews.

- **Expected:** Search results show a preview (title, snippet or matched text) before the user opens them.
- **Code:** done. Evidence moved: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:384; apps/web/features/chat/components/research/ResearchPanel.tsx:139 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:115; apps/web/app/api/search/route.ts:414 (quoted code not found in the file now)
- **Where to find it:** Sidebar > Search > type a word > a result row (labels found in the code)
- **Needs:** content in the workspace that matches a word
- **Steps:**
  1. Click "Search" in the sidebar.
  2. Type a word and press Enter.
  3. Look at each result row for a title and a short text line.
  4. Hover a citation chip inside an answer and compare its preview with Expected.

## S34.24 Source cards.

- **Expected:** Sources behind an answer are shown as cards with at least title, site and link.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchPanel.tsx:510; apps/web/features/chat/components/research/ResearchPanel.tsx:137; apps/web/features/chat/components/messages/MessageBubble.tsx:3595; apps/web/features/chat/components/messages/MessageBubble.tsx:2510
- **Where to find it:** Chat > answer with web sources > "Sources" button under the answer (labels found in the code)
- **Needs:** a web search answer
- **Steps:**
  1. Send a question that uses web search.
  2. Wait for the answer, then click the "Sources" button under it.
  3. Look at the source panel that opens.
  4. Check each source card shows a title, a site line and a link.

## S34.25 Citation hover/tap preview.

- **Expected:** Hovering or tapping a citation shows a preview of the source (title, site, snippet) without leaving the answer.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:169; packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:82; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366
- **Where to find it:** Chat > answer with citations > hover a citation chip (path not confirmed in the code; trust the screen)
- **Needs:** a web search answer with citations; a mouse for hover (tap on touch)
- **Steps:**
  1. Send a question that returns cited web sources.
  2. Move the mouse over a citation chip in the answer.
  3. Check that a preview appears with the source title, site and snippet.
  4. Move the mouse away and check the answer is still in place.

## S34.26 Source list expansion.

- **Expected:** A compact source summary can be expanded to the full list of sources used and consulted.
- **Code:** done. Evidence moved: apps/web/features/chat/components/research/ResearchPanel.tsx:544 (quoted code not found in the file now); apps/web/features/chat/components/research/ResearchPanel.tsx:515; apps/web/features/chat/stores/research-panel-store.ts:47
- **Where to find it:** Chat > answer with web sources > "Sources" button > "Citations" and "More" headings (labels found in the code)
- **Needs:** a web search answer with more than three sources
- **Steps:**
  1. Open a web search answer.
  2. Click the "Sources" button under it.
  3. Look for the summary count on the button, for example "Sources · 5".
  4. Check that the panel lists the "Citations" section and, if present, the "More" section.

## S34.27 Open original source.

- **Expected:** From a citation or source card the user can open the original page/document.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:148; apps/web/features/chat/components/research/ResearchPanel.tsx:106; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:267 (quoted code not found in the file now)
- **Where to find it:** Chat > answer with web sources > "Sources" button > click a source title (labels found in the code)
- **Needs:** a web search answer
- **Steps:**
  1. Open a web search answer and click the "Sources" button.
  2. Click a source card title.
  3. Check that the original page opens in a new tab.

## S34.31 Search-result freshness information.

- **Expected:** Search results and sources show how fresh they are (publication or retrieval date).
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:58 (quoted code not found in the file now); apps/web/features/chat/components/research/ResearchPanel.tsx:86 (quoted code not found in the file now); apps/web/lib/web-search/web-search-tool.ts:377
- **Where to find it:** Chat > answer with web sources > "Sources" button > a source row subtitle (labels found in the code)
- **Needs:** a web search answer
- **Steps:**
  1. Open a web search answer and click the "Sources" button.
  2. Read the small grey line under a source title.
  3. Check it shows a publish date when known and "Retrieved" followed by a date.

## S34.32 Empty-results and unavailable-source states.

- **Expected:** Searches that find nothing, or whose source/provider is unavailable, show a clear empty or unavailable state instead of silence.
- **Code:** done. Evidence moved: apps/web/features/chat/components/dialogs/GlobalSearchDialog.tsx:775; apps/web/features/chat/components/messages/MessageBubble.tsx:3657; apps/web/features/chat/components/messages/MessageBubble.tsx:1716 (quoted code not found in the file now); apps/web/features/chat/components/research/ResearchPanel.tsx:202
- **Where to find it:** Sidebar > Search > type a nonsense word > "No results found" (labels found in the code)
- **Steps:**
  1. Click "Search" in the sidebar.
  2. Type a made-up word such as xqzvk and press Enter.
  3. Look for the empty-state text.
  4. Open a chat answer with no web results and look for the notice that the answer used the model's own knowledge.
