---
id: "PLAN-mobile-036"
type: "test-plan"
title: "Mobile · 36. Sources and grounding interface"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "36"
---
# Mobile · 36. Sources and grounding interface

10 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S36.01 Citation marker.

- **Expected:** Claims in an answer carry an inline citation marker that identifies the source.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1972; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:218 (quoted code not found in the file now)
- **Where to find it:** First screen after sign-in > start a chat > ask a question that needs current web facts > read the answer > find the small teal bracket markers such as [1] placed after claims > tap one (labels found in the code)
- **Needs:** a Free or paid account with web search available for the chat
- **Steps:**
  1. Sign in and start a new chat on the first screen.
  2. Ask a question that needs current web information, such as recent news on a topic.
  3. Wait for the answer to finish streaming.
  4. Look for teal bracket markers like [1] or [2] inside the answer text.
  5. Tap a marker: a dialog opens with the source title, publisher and buttons Cancel and Open page.
  6. Compare with Expected: each marker should point to the source for the claim next to it.

## S36.02 Source title.

- **Expected:** Each cited source shows its title.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:81; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:31 (quoted code not found in the file now)
- **Where to find it:** First screen after sign-in > start a chat > ask a question that uses web search > under the answer tap the Sources pill > read the rows in the sheet (labels found in the code)
- **Needs:** a chat answer that used web search, so the answer has cited sources
- **Steps:**
  1. Ask a question that uses web search and wait for the answer.
  2. Under the answer, tap the pill whose text is Sources.
  3. In the sheet titled Sources, read the bold line of each row.
  4. Compare with Expected: each cited source should show its title.

## S36.03 Publisher or provider.

- **Expected:** Each cited source shows its publisher or provider (site name/domain).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:43; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:27 (quoted code not found in the file now)
- **Where to find it:** First screen after sign-in > start a chat > ask a question that uses web search > under the answer tap the Sources pill > read the small grey first line of each row (labels found in the code)
- **Needs:** a chat answer that used web search
- **Steps:**
  1. Open a web-search answer and tap the Sources pill under it.
  2. Look at the small grey first line of each row.
  3. Compare with Expected: each row should show the site domain, for example the publisher name, before the title.

## S36.04 Source URL or resource identifier.

- **Expected:** Each cited source exposes its URL or resource identifier and can be opened.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:39 (quoted code not found in the file now); apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:31 (quoted code not found in the file now)
- **Where to find it:** First screen after sign-in > start a chat > ask a question that uses web search > under the answer tap the Sources pill > tap a source row (labels found in the code)
- **Needs:** a chat answer that used web search and a network connection
- **Steps:**
  1. Open the Sources sheet under a web-search answer.
  2. Tap a source row that has a web address.
  3. Watch for the in-app browser to open the source page.
  4. Compare with Expected: the source opens. A row with no valid web address is not tappable.

## S36.05 Publication date.

- **Expected:** Cited sources show their publication date when known.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/CitationChip.tsx:34 (quoted code not found in the file now); apps/mobile/src/features/research/ReportsScreen.tsx:298
- **Where to find it:** First screen after sign-in > start a chat > ask a question that uses web search > under the answer tap the Sources pill > read the grey first line of a row, or tap a bracket marker and read the dialog (labels found in the code)
- **Needs:** a chat answer that used web search, where the source reports a publication date
- **Steps:**
  1. Open the Sources sheet under a web-search answer.
  2. Read the grey first line of a row: it shows the publisher then a date after a dot.
  3. Tap a bracket marker in the answer and read the dialog body for a line that starts with Published.
  4. Compare with Expected: the date shows when the source has one, and no date is shown when it is unknown.

## S36.06 Retrieval date.

- **Expected:** Cited sources show when they were retrieved/accessed.
- **Code:** done. Evidence present: apps/mobile/src/features/research/ReportsScreen.tsx:493; apps/mobile/src/features/research/service.ts:52
- **Where to find it:** Tap a bracket marker in a web-search answer and read the dialog for a line starting with Retrieved; or open the side drawer > Reports > open a saved report > scroll to the bottom (labels found in the code)
- **Needs:** a chat answer with a source that has a retrieval time; for the report path, a saved research report
- **Steps:**
  1. In a chat answer with web search, tap a bracket marker such as [1].
  2. Read the dialog body for a line that starts with Retrieved followed by a date.
  3. Optionally open the side drawer, tap Reports, open a saved report, and scroll to the end.
  4. Compare with Expected: the report shows the line Sources retrieved with a date.

## S36.07 Source-type icon.

- **Expected:** Each source shows an icon for its type (web page, file, chat, connector...).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:43; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:94
- **Where to find it:** First screen after sign-in > start a chat > ask a question that uses web search > under the answer tap the Sources pill > look at the mark at the left of each row (labels found in the code)
- **Needs:** a chat answer that used web search; for the file icon, a project with a file that a chat cites
- **Steps:**
  1. Open the Sources sheet under a web-search answer.
  2. Look at the square mark at the left of each row: it holds the first letter of the site and has a Globe icon beside the domain in the search result cards.
  3. Open a chat that cites a project file, if you have one, and look for the file icon on its citation chip.
  4. Compare with Expected: web sources, file sources and chat sources should each show an icon for their type.

## S36.08 Quoted supporting excerpt.

- **Expected:** A cited source shows the quoted excerpt that supports the claim.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:83; apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:31 (quoted code not found in the file now)
- **Where to find it:** First screen after sign-in > start a chat > ask a question that uses web search > under the answer tap the Sources pill > read the grey text under a row title, or tap a bracket marker and read the dialog body (labels found in the code)
- **Needs:** a chat answer that used web search and whose sources include snippets
- **Steps:**
  1. Open the Sources sheet under a web-search answer.
  2. Read the smaller text under each row title, which is up to three lines.
  3. Tap a bracket marker and read the body text of the dialog.
  4. Compare with Expected: the excerpt shown should be the text that supports the claim.

## S36.16 Claim-to-source relationship.

- **Expected:** Each citation sits at the claim it supports so the user can tell which source backs which claim.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1972; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:218 (quoted code not found in the file now)
- **Where to find it:** First screen after sign-in > start a chat > ask a question that uses web search > read the answer and compare each bracket marker with the sentence before it (labels found in the code)
- **Needs:** a chat answer that used web search with several sources
- **Steps:**
  1. Ask a question that uses web search and wait for the answer.
  2. Find a sentence with a teal bracket marker such as [1] right after it.
  3. Tap the marker: the dialog names the source for that marker.
  4. If a marker has several numbers, tap it and pick one entry from the list, which has the button Dismiss sources.
  5. Compare with Expected: each marker should sit at the claim that its source supports.

## S36.19 Unavailable-source notice.

- **Expected:** When a cited source cannot be opened or was not captured, the product says so instead of showing a dead link.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/WebSearchResultCard.tsx:30 (quoted code not found in the file now); apps/mobile/src/features/chat/components/CitationChip.tsx:17 (quoted code not found in the file now)
- **Where to find it:** First screen after sign-in > start a chat > ask a question that uses web search > under the answer tap the Sources pill > look at a source row that has no web address (labels found in the code)
- **Needs:** a chat answer with a source that has no valid web address, which is rare, so the tester may not find one
- **Steps:**
  1. Open the Sources sheet under a web-search answer.
  2. Look for a row without an external-link arrow at its right; such a row cannot be tapped.
  3. Tap a bracket marker whose source cannot open; if the open fails, a dialog titled Could not open citation appears.
  4. Compare with Expected: the product should say the source cannot be opened, not show a dead link.
