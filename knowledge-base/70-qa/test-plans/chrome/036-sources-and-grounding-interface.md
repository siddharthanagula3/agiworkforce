---
id: "PLAN-chrome-036"
type: "test-plan"
title: "Chrome · 36. Sources and grounding interface"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "36"
---
# Chrome · 36. Sources and grounding interface

3 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S36.02 Source title.

- **Expected:** Each cited source shows its title.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/sources.ts:31
- **Where to find it:** Chat answer with web sources > click the "$COUNT$ sources" button under the answer (shows as e.g. "5 sources") > list of sources; also hover or tap an inline citation chip to see its card (labels found in the code)
- **Needs:** an answer that uses web search; a network connection
- **Steps:**
  1. Sign in and ask a question that gets a web-sourced answer (one that uses web search).
  2. Under the answer, click the button that reads "N sources" (N is the number of sources).
  3. Look at each item in the list: each should show a bold title line (the source title) with the site name above it.
  4. Hover a numbered or site-name citation chip in the answer text and check that its card shows the same title for each source.
  5. Compare with Expected: each cited source shows its title.

## S36.03 Publisher or provider.

- **Expected:** Each cited source shows its publisher or provider (site name/domain).
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/sources.ts:11; apps/extension/src/features/side-panel/sources.ts:28
- **Where to find it:** Chat answer with web sources > inline citation chip (site name with "+N" when grouped) > hover or tap the chip; also the "$COUNT$ sources" button under the answer (labels found in the code)
- **Needs:** an answer that uses web search; a network connection
- **Steps:**
  1. Ask a question that gets a web-sourced answer.
  2. Find the small citation chip in the answer text. A chip with more than one source reads with the site name and "+N".
  3. Hover the chip (or tap it on a touch screen) and read the card: each source has a small globe icon and a site name line above its title.
  4. Click the "N sources" button under the answer and check the site name line on each item.
  5. Compare with Expected: each cited source shows its publisher or site name (domain without www).

## S36.04 Source URL or resource identifier.

- **Expected:** Each cited source exposes its URL or resource identifier and can be opened.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:866; apps/extension/src/features/side-panel/bubbles.ts:872
- **Where to find it:** Chat answer with web sources > click the "$COUNT$ sources" button under the answer > click a source title (opens in a new tab). Also Activity step "Sources for $QUERY$" in the agent steps (click the step row to expand it, then click a source) (labels found in the code)
- **Needs:** an answer that uses web search; a network connection
- **Steps:**
  1. Ask a question that gets a web-sourced answer.
  2. Click the "N sources" button under the answer to open the list.
  3. Click a source's title: a new browser tab should open at that address.
  4. Optionally, in an agent run that searched the web, click the step row "Sources for ..." to expand it, then click a source link; it should open in a new tab.
  5. Compare with Expected: each cited source exposes its URL and opens when clicked.
