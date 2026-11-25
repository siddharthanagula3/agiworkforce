---
id: "PLAN-desktop-022"
type: "test-plan"
title: "Desktop · 22. Rich answers and structured result widgets"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "22"
---
# Desktop · 22. Rich answers and structured result widgets

19 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S22.01 Citation chips.

- **Expected:** Answers grounded in sources show citation chips that identify and open the source.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:124; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366
- **Where to find it:** Chat with web search on > ask a question about a current topic > after the answer sentences, click the small rounded chip that shows a site name (path not confirmed in the code; trust the screen)
- **Needs:** web search turned on
- **Steps:**
  1. Sign in and open a new chat.
  2. Turn on web search in the chat input, then ask a current-events question such as "What is the latest news on <topic>?".
  3. Wait for the answer to finish streaming.
  4. Look for small rounded chips with a site name placed after sentences; a "+N" on a chip means more sources.
  5. Click a chip and confirm it opens the source page in a new tab.

## S22.02 Source-preview cards.

- **Expected:** Hovering/tapping a citation shows a preview card (title, site, snippet/date) before opening it.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:115; packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:85
- **Where to find it:** Chat with web search on > hover (or tap) a citation chip from S22.01 (path not confirmed in the code; trust the screen)
- **Needs:** web search turned on
- **Steps:**
  1. Get an answer that shows citation chips, as in S22.01.
  2. Move the pointer over one chip and wait for the card to appear.
  3. Check the card shows the source title, the site name, the date if known, and a snippet if known.
  4. Move the pointer away and confirm the card closes.

## S22.03 Search-result lists.

- **Expected:** Web-search results are listed (title, site, link, optional snippet) and can be opened.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3595; apps/web/features/chat/components/research/ResearchPanel.tsx:67
- **Where to find it:** Chat with web search on > under the answer click the "Sources" button (labels found in the code)
- **Needs:** web search turned on
- **Steps:**
  1. Ask a web-search question and wait for the answer.
  2. Look for the "Sources" button under the answer; it shows a count when there are more than 3 sources.
  3. Click "Sources" to open the side panel on its Sources tab.
  4. Check each row shows a title, site, link and optional snippet, and click one to open it.
  5. If there are no sources, check the panel shows "No sources yet".

## S22.05 Image carousels.

- **Expected:** Image results render in a swipeable/pageable carousel within the answer.
- **Code:** partial. Evidence present: apps/web/lib/web-search/web-search-providers.json:4
- **Known to be unfinished:** owner (lead ruling 2026-09-28): choose an image-search provider and key; the carousel code follows the choice
- **Where to find it:** not found in the code. The carousel component exists (Previous and Next controls in packages/ui/unified-chat/src/components/markdown/AnswerGallery.tsx), but only the model writes it, and apps/web/lib/web-search/web-search-providers.json lists only perplexity-search, so no image provider is wired. Searched for carousel and image search.
- **Needs:** an image-search provider and key (not set up)

## S22.08 Interactive charts.

- **Expected:** Charts in answers render interactively (hover/tap values, legend).
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1979; packages/ui/unified-chat/src/components/artifact-components/ChartCanvas.tsx:59 (quoted code not found in the file now)
- **Where to find it:** Chat > ask for a chart (for example "Make a bar chart of ...") > click "Open artifact" on the chart card (labels found in the code)
- **Steps:**
  1. Ask the assistant for a chart with a few rows of numbers.
  2. When the chart card appears in the answer, click "Open artifact".
  3. In the panel, hover over bars or points and check a value appears.
  4. Check the legend shows when there is more than one series.
  5. Click the chart's download button and check a PNG file is saved.

## S22.09 Inspectable chart data.

- **Expected:** The data behind a chart can be inspected (values on hover, source table/JSON view or download).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:251; packages/ui/unified-chat/src/components/artifact-components/ChartCanvas.tsx:255
- **Where to find it:** Chat > open a chart artifact ("Open artifact") > under the chart click "View chart data" (labels found in the code)
- **Steps:**
  1. Open a chart as in S22.08.
  2. Under the chart, click "View chart data" to expand a table of the values.
  3. Check the table has the same values as the chart.
  4. Click the panel's "Download" button and check the data can be saved.
  5. Check a note appears if the chart has more rows than it plots.

## S22.10 Geographic maps.

- **Expected:** Location answers render an interactive map with markers.
- **Code:** partial. Evidence present: apps/web/lib/maps/map-tile-provider.ts:93
- **Known to be unfinished:** owner: choose a map tile provider and set AGI_MAP_TILE_URL_TEMPLATE (apps/web/lib/maps/map-tile-provider.ts:93); live-check a map renders on web and in Electron (CSP img-src allows the tile host)
- **Needs:** production-state
- **Where to find it:** Chat > ask for several places to be shown on a map > a card titled "Map" appears in the answer (labels found in the code)
- **Needs:** a web search or place tool that returns coordinates
- **Steps:**
  1. Ask for several real places, for example "Show me 3 coffee shops in <city> on a map".
  2. Look for a card titled "Map" under the answer.
  3. Check markers appear and the map shows the basemap credit line.
  4. Try moving and zooming the map, if it is interactive.

## S22.11 Place and business cards.

- **Expected:** Place/business results render as cards (name, rating, address, hours, links).
- **Code:** partial. Evidence present: apps/web/lib/config/optional-features.ts:118
- **Known to be unfinished:** owner: create a Google Places API key with billing and set GOOGLE_PLACES_API_KEY (apps/web/lib/config/optional-features.ts:118); live-check a place query
- **Needs:** production-state
- **Where to find it:** not found in the code. A place search tool exists (label "Place search" in apps/web/lib/tool-copy.ts) and is not offered without the key. I searched for PlaceCard, place card and search_places and found no card component that renders name, rating, address, hours and links.
- **Needs:** a Google Places key with billing (GOOGLE_PLACES_API_KEY), not set up

## S22.17 Product comparison cards.

- **Expected:** Product comparisons render as side-by-side comparison cards.
- **Code:** done. Evidence present: apps/web/features/chat/components/cards/MessageFormatCard.tsx:55; apps/web/features/chat/components/cards/ComparisonCard.tsx:13
- **Where to find it:** Chat > ask to compare products (for example "Compare X and Y") > click "View as comparison" under the answer (labels found in the code)
- **Steps:**
  1. Ask the assistant to compare two or three products.
  2. Look for the "View as comparison" button under the answer.
  3. Click it and check the side-by-side comparison card appears.
  4. Check each item shows "Pros" and "Cons" where given, and a "Winner" mark where one is set.
  5. Click "Hide comparison view" to return to the text.

## S22.25 Email draft widgets.

- **Expected:** An email draft renders as an email widget (to, subject, body) with copy/send/open actions.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1981; packages/ui/unified-chat/src/components/artifact-components/EmailArtifact.tsx:32
- **Where to find it:** Chat > ask for an email draft (for example "Draft an email to ...") > click "Open artifact" on the draft card (labels found in the code)
- **Steps:**
  1. Ask the assistant to draft an email with a recipient and a subject.
  2. Click "Open artifact" on the card.
  3. Check the widget shows To, Subject and the body.
  4. Click "Copy email as text" and paste it somewhere to check the text.
  5. Look for a send or open action; none was found in the code.

## S22.28 Approval forms.

- **Expected:** Actions needing consent render an approval form (what will happen, approve/deny).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2678; apps/web/features/chat/components/messages/MessageBubble.tsx:965
- **Where to find it:** Chat > ask for an action that needs approval (Tool Approvals set to ask before running) > the approval card under the tool step (labels found in the code)
- **Needs:** a setting that makes the assistant ask before a tool runs
- **Steps:**
  1. Set Tool Approvals to ask before each action, if you can find the setting; the settings panel was not found mounted in the app.
  2. Ask the assistant to do an action that needs a tool, such as a file change or a web fetch.
  3. When the card appears, read "This tool requires approval before execution." and the buttons below it.
  4. Click "Deny" and check the action stops; run again and click "Allow" to check it continues.

## S22.29 Interactive questionnaires.

- **Expected:** The assistant can ask structured questions (options/fields) the user answers in an inline form.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:42; apps/web/features/chat/components/messages/cards/ClarifyCard.tsx:86
- **Where to find it:** Chat > the assistant asks questions in an inline form > type or pick answers > click "Send answers" (labels found in the code)
- **Steps:**
  1. Ask a vague request so the assistant needs details, for example "Plan a trip for me".
  2. Look for an inline form with questions and options.
  3. Pick options or type in "Other answer for" when offered.
  4. Click "Send answers" and check the form shows "Sending" and then the reply continues.
  5. Check a skipped question shows "Skipped".

## S22.30 Decision/comparison tables.

- **Expected:** Decision/comparison answers render as a readable comparison table.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:549
- **Where to find it:** Chat > ask for a comparison table (for example "Make a table comparing X, Y and Z") (path not confirmed in the code; trust the screen)
- **Steps:**
  1. Ask for a comparison of three options in a table.
  2. Check the answer shows a table with a header row and aligned columns.
  3. Resize the window narrow and check the table scrolls sideways instead of breaking the page.

## S22.31 Mind maps.

- **Expected:** Mind-map answers render as a drawn mind map.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:59 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:139
- **Where to find it:** Chat > ask for a mind map (for example "Make a mind map of ...") > the diagram card under the answer (labels found in the code)
- **Steps:**
  1. Ask for a mind map of a topic.
  2. Check a drawn diagram appears under the answer.
  3. Click "Show source" to see the diagram code, then "Hide source" to return.
  4. Click "Expand diagram" to open it full size, then close it with the close button.

## S22.32 Flowcharts.

- **Expected:** Flowchart answers render as a drawn flowchart diagram.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:59 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:139
- **Where to find it:** Chat > ask for a flowchart (for example "Draw a flowchart of ...") > the diagram card under the answer (labels found in the code)
- **Steps:**
  1. Ask for a flowchart of a process.
  2. Check a drawn flowchart appears under the answer with boxes and arrows.
  3. Click "Show source" and then "Hide source".
  4. Click "Expand diagram" and check it opens larger.

## S22.33 Timelines.

- **Expected:** Timeline answers render as a drawn timeline.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:59 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:139
- **Where to find it:** Chat > ask for a timeline (for example "Make a timeline of ...") > the diagram card under the answer (labels found in the code)
- **Steps:**
  1. Ask for a timeline of events in order.
  2. Check a drawn timeline appears under the answer.
  3. Click "Show source" and then "Hide source".
  4. Click "Expand diagram" and check it opens larger.

## S22.36 Interactive demonstrations.

- **Expected:** Interactive demonstrations (HTML/JS/React) run live and interactively inside the answer or panel.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:511 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:527 (quoted code not found in the file now)
- **Where to find it:** Chat > ask for an interactive demo (for example "Build a small interactive ...") > click "Open artifact" on the card (labels found in the code)
- **Steps:**
  1. Ask for a small interactive page or React component, such as a counter or a slider.
  2. Click "Open artifact" on the card.
  3. In the panel, click "Preview" and try the controls in the demo.
  4. Click "Fullscreen" and check the demo fills the screen, then return.
  5. Click "Source" to see the code.

## S22.37 Embedded third-party app panels.

- **Expected:** Third-party apps (e.g. MCP apps) render as embedded interactive panels inside the chat.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:113
- **Where to find it:** not found in the code. The embedded panel is an iframe titled "<tool name> interactive result" in apps/web/features/chat/components/messages/cards/McpAppCard.tsx. I did not find the menu path that connects a third-party app, so no visible path was found.
- **Needs:** a connected third-party app that returns an interactive view

## S22.38 Generated application previews.

- **Expected:** Generated apps/sites render as a live preview that can be opened or expanded.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:511 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:557
- **Where to find it:** Chat > ask for a small app or website (for example "Build a simple website for ...") > click "Open artifact" on the card (labels found in the code)
- **Steps:**
  1. Ask the assistant to build a small website or app.
  2. Click "Open artifact" on the card.
  3. Check the live preview loads in the panel.
  4. Click "Fullscreen" and check the preview expands; click it again to return.
  5. Open the more menu and click "Open in new tab" to check the preview opens in a new tab.
