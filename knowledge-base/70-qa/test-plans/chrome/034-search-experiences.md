---
id: "PLAN-chrome-034"
type: "test-plan"
title: "Chrome · 34. Search experiences"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "34"
---
# Chrome · 34. Search experiences

8 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S34.02 Search conversation history.

- **Expected:** The user can search past conversations by title and message text and open a matching chat; only conversations the user can see in history are returned.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6700 (quoted code not found in the file now); apps/extension/src/side_panel.ts:6720 (quoted code not found in the file now); apps/extension/src/features/background/conversation-history.ts:1597
- **Where to find it:** Header clock icon (Recent chats) > Search recent chats (labels found in the code)
- **Needs:** a Free or paid account with more than 10 saved chats (the search box is hidden below 10)
- **Steps:**
  1. Sign in and make sure the account has saved chats.
  2. Click the clock icon in the top header; its label is "Recent chats".
  3. If the account has more than 10 chats, click the search box "Search recent chats" and type a word from a chat title.
  4. Check that only chats with a matching title are listed.
  5. Clear the box, then type a word that appears only inside a message body (not the title) and check that its chat is listed.
  6. Click the matching chat and check that it opens.

## S34.06 Search connected company sources.

- **Expected:** The assistant can search the user's connected work sources (Drive, Slack, Notion...) during a chat once they are connected.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:8133 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/route.ts:847
- **Where to find it:** Add attachment (+ button) > Connectors (labels found in the code)
- **Needs:** an outside account (Google, Slack or Notion) and a paid or entitled account where connectors are available
- **Steps:**
  1. Sign in and click the + button (its label is "Add attachment").
  2. Click "Connectors"; a new tab opens on the web connectors page. If a "coming soon" tag shows, the item does nothing.
  3. On that page, connect Drive, Slack or Notion.
  4. Return to the side panel, start a new chat and ask a question about content in a connected source.
  5. Look for an answer that cites the connected source, shown as a "sources" line under the answer.

## S34.07 Public web search.

- **Expected:** A chat can search the public web and answer from the results.
- **Code:** done. Evidence moved: apps/extension/src/features/cloud-bridge/managedChatHandler.ts:756; apps/extension/src/features/cloud-bridge/managedChatHandler.ts:538 (quoted code not found in the file now); apps/extension/src/features/cloud-bridge/freeTrialClient.ts:1603
- **Where to find it:** no screen of its own. No web-search toggle was found in the extension; web search is turned on by the routed model's capability (managedChatHandler.ts:781), and the "Web search" label is only a model-list filter.
- **Needs:** a signed-in account whose routed model supports web search (which plans get it is unknown from the code)
- **Steps:**
  1. Sign in and start a new chat.
  2. Ask a question that needs current public information, such as today's news.
  3. Look for an answer that uses web results and shows sources under it ("N sources").

## S34.23 Result previews.

- **Expected:** Search results show a preview (title, snippet or matched text) before the user opens them.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/sources.ts:19; apps/extension/src/features/side-panel/sources.ts:33
- **Where to find it:** Answer text > source chip (site name with +N) > hover or tap (labels found in the code)
- **Needs:** a chat answer that has citations (web search or connected sources)
- **Steps:**
  1. Sign in and open an answer that cites sources (a chip shows a site name, such as "example.com", or "site +2").
  2. Move the mouse over the chip (or tap it on a phone-width panel).
  3. Check that a card appears with each source's site, title and, when present, a snippet and date.
  4. Compare the card with the list under "N sources" to confirm the preview lines match.

## S34.24 Source cards.

- **Expected:** Sources behind an answer are shown as cards with at least title, site and link.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/sources.ts:19; apps/extension/src/features/side-panel/sources.ts:136
- **Where to find it:** Answer > "N sources" (under the answer) > source rows (labels found in the code)
- **Needs:** a chat answer that has sources
- **Steps:**
  1. Open an answer that has sources; wait until it finishes streaming, because the footer is hidden while streaming.
  2. Look for the line "N sources" under the answer.
  3. Click "N sources" to open the list, or hover a citation chip to open its card.
  4. Check that each card or row shows the site, the title and a link.

## S34.26 Source list expansion.

- **Expected:** A compact source summary can be expanded to the full list of sources used and consulted.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/sources.ts:136; apps/extension/src/features/side-panel/sources.ts:138
- **Where to find it:** Answer > "N sources" (under the answer) (labels found in the code)
- **Needs:** a chat answer that has sources
- **Steps:**
  1. Open an answer that has a "N sources" line under it.
  2. Click "N sources"; the line is a disclosure and opens the full list.
  3. Check that the list is labelled "Sources used for this answer" and shows each source.
  4. Click "N sources" again and check that the list closes.

## S34.27 Open original source.

- **Expected:** From a citation or source card the user can open the original page/document.
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:866; apps/extension/src/features/side-panel/markdown.ts:122 (quoted code not found in the file now)
- **Where to find it:** Answer > "N sources" > source title, or a citation chip (labels found in the code)
- **Needs:** a chat answer that has sources
- **Steps:**
  1. Open an answer that has sources.
  2. Click a citation chip, or click "N sources" and then a source title.
  3. Check that a new browser tab opens.
  4. Compare the new tab's address with the source's site shown on the card.

## S34.32 Empty-results and unavailable-source states.

- **Expected:** Searches that find nothing, or whose source/provider is unavailable, show a clear empty or unavailable state instead of silence.
- **Code:** done. Evidence moved: apps/extension/src/side_panel.ts:6722 (quoted code not found in the file now); apps/extension/src/side_panel.ts:6720 (quoted code not found in the file now)
- **Where to find it:** Recent chats (clock icon) > Search recent chats (labels found in the code)
- **Needs:** a Free or paid account; the unavailable-source case needs an organisation site policy that cannot be read, which a tester cannot set up
- **Steps:**
  1. Sign in with at least one saved chat and click the clock icon labelled "Recent chats".
  2. If the account has more than 10 chats, click "Search recent chats" and type text that matches nothing, such as a random word.
  3. Check that the list shows "No matching conversations" instead of an empty area.
  4. For an account with no saved chats, check that the list shows "No saved conversations".
