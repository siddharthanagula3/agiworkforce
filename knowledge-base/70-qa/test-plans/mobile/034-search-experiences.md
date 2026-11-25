---
id: "PLAN-mobile-034"
type: "test-plan"
title: "Mobile · 34. Search experiences"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "34"
---
# Mobile · 34. Search experiences

14 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S34.02 Search conversation history.

- **Expected:** The user can search past conversations by title and message text and open a matching chat; only conversations the user can see in history are returned.
- **Code:** done. Evidence present: apps/mobile/stores/chat/chatViewStore.ts:287; apps/web/app/api/search/route.ts:324
- **Where to find it:** Open navigation drawer > Search (icon at the top of the menu) > type in the Search box (labels found in the code)
- **Needs:** a Free account or a paid account with at least two saved chats that contain a shared word
- **Steps:**
  1. Tap the button labelled "Open navigation drawer".
  2. Tap the search icon labelled "Search" at the top of the menu.
  3. Type a word from the title or text of an older chat into the box labelled "Search".
  4. Look for chats whose title or message text contains that word. Tap one and check that it opens that chat. Compare with Expected.

## S34.03 Search Projects.

- **Expected:** The user can search their Projects by name or description and open a match.
- **Code:** done. Evidence present: apps/mobile/app/(app)/(tabs)/projects.tsx:451; apps/mobile/app/(app)/(tabs)/projects.tsx:163; apps/mobile/src/features/search/mobileGlobalSearch.ts:95
- **Where to find it:** Open navigation drawer > Projects > type in the Search projects box (labels found in the code)
- **Needs:** a Cloud account with at least one project that has a description
- **Steps:**
  1. Tap "Open navigation drawer".
  2. Tap "Projects".
  3. Type part of a project's name into the box labelled "Search projects" and check that the project appears.
  4. Clear the box, type a word from a project's description, and check that the project appears. Tap it to open it and compare with Expected.

## S34.04 Search Library.

- **Expected:** The Library (saved files, images, documents, artifacts) has a search box that filters its items by name/prompt.
- **Code:** done. Evidence moved: apps/mobile/src/features/library/index.tsx:1109; apps/mobile/src/features/library/index.tsx:70 (quoted code not found in the file now); apps/mobile/src/features/library/index.tsx:330
- **Where to find it:** Open navigation drawer > Library > Search library (labels found in the code)
- **Needs:** a Library with at least two saved files or images with different names
- **Steps:**
  1. Tap "Open navigation drawer".
  2. Tap "Library".
  3. Type part of a file name or image prompt into the box labelled "Search library".
  4. Check that only matching items stay in the list. Type text that matches nothing and check the empty state. Compare with Expected.

## S34.05 Search artifacts.

- **Expected:** The user can search their artifacts by title/content and open a match.
- **Code:** done. Evidence present: apps/mobile/src/features/library/index.tsx:926; apps/mobile/src/features/library/index.tsx:330; apps/mobile/src/features/library/index.tsx:1109
- **Where to find it:** Open navigation drawer > Library > Artifacts (filter chip) > Search library (labels found in the code)
- **Needs:** at least one saved artifact (for example a code file or a chart made in chat)
- **Steps:**
  1. Tap "Open navigation drawer", then "Library".
  2. Tap the filter chip "Artifacts".
  3. Type part of an artifact's title or content into the box labelled "Search library".
  4. Check that matching artifacts stay in the list. Tap one to open it and compare with Expected.

## S34.06 Search connected company sources.

- **Expected:** The assistant can search the user's connected work sources (Drive, Slack, Notion...) during a chat once they are connected.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/cloud-connectors/index.tsx:1219; apps/web/app/api/llm/v1/chat/completions/route.ts:847; apps/web/app/api/llm/v1/chat/completions/route.ts:686 (quoted code not found in the file now)
- **Where to find it:** Settings > Connectors (connect a source), then Add to chat > Connectors (turn it on in a chat) (labels found in the code)
- **Needs:** a Cloud account and an outside account for the work source (for example Google)
- **Steps:**
  1. Tap "Open navigation drawer", then "Settings", then "Connectors".
  2. Pick a connector, sign in, and wait until it shows "Connected".
  3. Open a chat, tap "Add to chat", then tap "Connectors" and turn on the connected source.
  4. Ask a question whose answer is in that source. Check that the answer uses it and lists it among the sources. Compare with Expected.

## S34.07 Public web search.

- **Expected:** A chat can search the public web and answer from the results.
- **Code:** done. Evidence moved: apps/mobile/src/features/settings/capabilities/index.tsx:210; apps/mobile/stores/chat/chatExecutionStore.ts:1741 (quoted code not found in the file now); apps/web/lib/web-search/required-search.ts:248
- **Where to find it:** Add to chat > Web search (turn on), then ask a question in the chat; or Settings > Capabilities > AGI Cloud > Web search (labels found in the code)
- **Needs:** a Cloud account whose plan allows web search, on a model that supports it
- **Steps:**
  1. Open a chat and tap "Add to chat".
  2. Turn on the row "Web search".
  3. Ask a question about recent news or a current fact.
  4. Look for "Searching for" under the question, then an answer with citations. Compare with Expected.

## S34.19 User-selected source collections.

- **Expected:** The user can put chosen sources into a named collection (e.g. a project's knowledge) and have chats search only/also that collection.
- **Code:** done. Evidence present: apps/mobile/src/features/projects/components/ProjectSourcesTab.tsx:283; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:3855
- **Where to find it:** Open navigation drawer > Projects > open a project > Open project sources (folder icon) > Add sources (labels found in the code)
- **Needs:** a Cloud account, a project, and one file to upload
- **Steps:**
  1. Tap "Open navigation drawer", then "Projects", then open a project.
  2. Tap the button labelled "Open project sources".
  3. Tap "Add sources" and add a file or text.
  4. Open a new chat inside the same project and ask about the added content. Check that the answer uses it. Compare with Expected.

## S34.23 Result previews.

- **Expected:** Search results show a preview (title, snippet or matched text) before the user opens them.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:83; apps/mobile/src/features/chat/components/ToolCallTimeline.tsx:448; apps/mobile/stores/chat/chatExecutionStore.ts:1741 (quoted code not found in the file now)
- **Where to find it:** Chat with Web search on (see S34.07), then look under the answer at the "Searching for" line and the result cards (labels found in the code)
- **Needs:** a Cloud account with Web search on
- **Steps:**
  1. Send a question that needs current web information with Web search on.
  2. Watch the line "Searching for" under the question.
  3. Look at each result card: it shows the page title, the site name and, when known, the date.
  4. Compare the card text with what you see when you tap the card (S34.27). Compare with Expected.

## S34.24 Source cards.

- **Expected:** Sources behind an answer are shown as cards with at least title, site and link.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:32; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:81; apps/mobile/stores/chat/chatExecutionStore.ts:1741 (quoted code not found in the file now)
- **Where to find it:** Chat with Web search on (see S34.07) > tap the "Sources" pill under the answer (labels found in the code)
- **Needs:** a Cloud account with Web search on
- **Steps:**
  1. Send a question that uses web search and wait for the answer.
  2. Tap the pill labelled "Sources" under the answer (it can show a count of sources).
  3. Check that each source is a card with the page title, the site name and a link.
  4. Tap a card to see that it opens the page. Compare with Expected.

## S34.25 Citation hover/tap preview.

- **Expected:** Hovering or tapping a citation shows a preview of the source (title, site, snippet) without leaving the answer.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/CitationChip.tsx:29 (quoted code not found in the file now)
- **Where to find it:** Chat with an answer that has citations > tap a numbered citation chip in the answer (labels found in the code)
- **Needs:** a chat answer with citations (Web search on)
- **Steps:**
  1. Open an answer that shows citation chips (small numbered links) in the text.
  2. Tap one chip.
  3. Check that a box opens with the source title, the site, and a snippet of text, with the buttons "Cancel" and "Open page".
  4. Tap "Cancel" and check that you are still on the same answer. Compare with Expected.

## S34.26 Source list expansion.

- **Expected:** A compact source summary can be expanded to the full list of sources used and consulted.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/CollapsibleSources.tsx:34 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageBubble.tsx:1004 (quoted code not found in the file now); apps/mobile/src/features/chat/components/CollapsibleSources.tsx:57 (quoted code not found in the file now)
- **Where to find it:** Chat with sources > tap the "Sources" pill under the answer; the full list opens with the heading "Sources" (or "Sources so far" while the answer is still running) (labels found in the code)
- **Needs:** a chat answer with at least four sources (Web search on)
- **Steps:**
  1. Tap the "Sources" pill under an answer that has several sources.
  2. Check that the full list opens in a sheet, with the heading "Sources" and, when cited, a section headed "Citations" and one headed "More".
  3. Scroll to the bottom of the list and check that every source is there.
  4. Close the sheet with "Close" and compare with Expected.

## S34.27 Open original source.

- **Expected:** From a citation or source card the user can open the original page/document.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:29 (quoted code not found in the file now); apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:39 (quoted code not found in the file now)
- **Where to find it:** Chat with sources > tap a source card in the "Sources" list, or tap a citation chip then "Open page" (labels found in the code)
- **Needs:** a chat answer with sources (Web search on)
- **Steps:**
  1. Open the "Sources" list under an answer.
  2. Tap one source row or card.
  3. Check that the page opens in the in-app browser with the title and address of that source.
  4. Go back to the chat and check that the answer is still there. Compare with Expected.

## S34.31 Search-result freshness information.

- **Expected:** Search results and sources show how fresh they are (publication or retrieval date).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/utils/toolCallAccumulator.ts:162; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:36 (quoted code not found in the file now)
- **Where to find it:** Chat with Web search on > tap the "Sources" pill under the answer; the date sits under each card's site name (labels found in the code)
- **Needs:** a Cloud account with Web search on
- **Steps:**
  1. Ask a question that uses web search and tap the "Sources" pill.
  2. Look under the site name of each source card for a date.
  3. Compare the dates with the page dates you see when you open the source.
  4. Check that a source with no date shows no date line. Compare with Expected.

## S34.32 Empty-results and unavailable-source states.

- **Expected:** Searches that find nothing, or whose source/provider is unavailable, show a clear empty or unavailable state instead of silence.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/WebSearchToolCard.tsx:100
- **Where to find it:** Chat with Web search on > ask a question that finds nothing, or where the search fails; read the line under the search and the notice under the answer (labels found in the code)
- **Needs:** a Cloud account with Web search on; a query with no results (a provider outage is hard to trigger)
- **Steps:**
  1. Ask a question that web search cannot answer, such as a made-up name.
  2. Look at the search line: it shows "No results for" followed by your query.
  3. Look under the answer for the notice "Web search didn't return results for this turn" with a "Retry" button.
  4. If the search fails, check for "The search failed. Try sending the message again." Compare with Expected.
