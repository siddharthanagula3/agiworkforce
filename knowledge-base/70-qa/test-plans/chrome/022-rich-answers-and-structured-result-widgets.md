---
id: "PLAN-chrome-022"
type: "test-plan"
title: "Chrome · 22. Rich answers and structured result widgets"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "chrome"
area: "22"
---
# Chrome · 22. Rich answers and structured result widgets

5 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/chrome/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S22.01 Citation chips.

- **Expected:** Answers grounded in sources show citation chips that identify and open the source.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/sources.ts:42; apps/extension/src/features/side-panel/sources.ts:102
- **Where to find it:** Side panel > ask a question that needs web sources > read the answer text for small chips that show a site name (for example a host name with "+N" when several sources group) (labels found in the code)
- **Needs:** a web-grounded answer (the answer must come with sources; the chip only appears when the answer cites them)
- **Steps:**
  1. Open the side panel and ask a question that needs current web information, for example a news or price question.
  2. Wait for the answer to finish streaming, then look inside the answer text for small chips where the source markers such as [1] would be.
  3. Each chip shows the site host, or the host plus "+N" when sources are grouped. Click a chip with the mouse.
  4. Compare: the source page should open in a new browser tab.

## S22.02 Source-preview cards.

- **Expected:** Hovering/tapping a citation shows a preview card (title, site, snippet/date) before opening it.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/sources.ts:62; apps/extension/src/features/side-panel/sources.ts:33; apps/extension/src/features/side-panel/sources.ts:36; apps/extension/src/side_panel.ts:2703
- **Where to find it:** Side panel > the same web-grounded answer > move the mouse onto a citation chip (on a touch screen, tap it once) (labels found in the code)
- **Needs:** a web-grounded answer with sources (a Mac trackpad or mouse is enough)
- **Steps:**
  1. Use an answer that shows citation chips, as in S22.01.
  2. Move the mouse pointer onto one chip and hold it there without clicking.
  3. A card opens above or beside the chip, showing the source title, site host, and when present a snippet and a date.
  4. Compare: the card should appear before any click, and a click on the chip should then open the source in a new tab.

## S22.03 Search-result lists.

- **Expected:** Web-search results are listed (title, site, link, optional snippet) and can be opened.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/bubbles.ts:878; apps/extension/src/features/side-panel/bubbles.ts:866
- **Where to find it:** Side panel > the answer's sources line at the bottom of an answer (a line that reads like "3 sources") (labels found in the code)
- **Needs:** a web-grounded answer with sources
- **Steps:**
  1. Ask a question that needs web sources and wait for the answer to finish.
  2. Below the answer, find the line with the source count and click it to expand it.
  3. The expanded list shows each source with its site host, title, and when present a snippet and date.
  4. Click one source title; the page should open in a new browser tab.

## S22.10 Geographic maps.

- **Expected:** Location answers render an interactive map with markers.
- **Code:** done. Evidence present: apps/extension/src/features/side-panel/mapPreview.ts:190; apps/extension/src/features/side-panel/mapPreview.ts:108; apps/extension/src/features/side-panel/mapPreview.ts:126; apps/extension/src/features/side-panel/bubbles.ts:176
- **Where to find it:** Side panel > ask a location question (for example a place name) so the answer returns a map search card > the card shows a map with place markers under its title and a numbered list of places (labels found in the code)
- **Needs:** a location question, and the map tiles must be configured for the app (the code stops with the unavailable message when they are not)
- **Steps:**
  1. Ask a location question such as a city or place name that the app can map.
  2. Wait for the answer; a map search card appears under the answer text with its title and the place query.
  3. Look for a map drawn under the title, with a marker for each place, and a list of the places below it.
  4. Try to pan or zoom; if the map cannot load, the card shows the text "The map could not be loaded. You can still open these places in Maps." instead.

## S22.28 Approval forms.

- **Expected:** Actions needing consent render an approval form (what will happen, approve/deny).
- **Code:** done. Evidence moved: apps/extension/src/features/side-panel/bubbles.ts:493 (quoted code not found in the file now); apps/extension/src/features/side-panel/bubbles.ts:986
- **Where to find it:** Side panel > start an agent task that uses a tool needing approval > the step row in the agent activity > expand the step > the approval block with the buttons Approve, Allow for this chat and Decline (labels found in the code)
- **Needs:** an agent run that pauses for approval (a tool that needs consent); a Free or paid account may matter, not verified in the code
- **Steps:**
  1. Start an agent task that will use a tool needing permission, for example one that changes something on the page.
  2. When the run pauses, find the step row in the agent activity and click it to expand the details.
  3. Read the approval block: it says "Your approval is required before this tool can run." (with a risk level in front when the tool has one) and lists what will happen.
  4. Compare: Approve and Decline must both be visible, and a note field "Add guidance to steer the run (optional)" appears. Choose one and check the block changes to "Approved · decision recorded" or "Declined · decision recorded".
