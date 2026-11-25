---
id: "PLAN-web-022"
type: "test-plan"
title: "Web · 22. Rich answers and structured result widgets"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "22"
---
# Web · 22. Rich answers and structured result widgets

19 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S22.01 Citation chips.

- **Expected:** Answers grounded in sources show citation chips that identify and open the source.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:124; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:366
- **Where to find it:** Ask a question that needs a web search, then look under the answer for the "Sources" button, and look for small source chips inside the answer text (labels found in the code)
- **Needs:** a Free or paid account; a question that makes the assistant search the web
- **Steps:**
  1. Sign in and start a new chat.
  2. Type a question about a current topic that needs web search, for example "What is the latest news about <topic>? Include sources." and send it.
  3. When the answer finishes, look inside the answer text for small rounded chips that show a site name (with "+N" if there are more sources).
  4. Click a chip; it opens the source in a new tab.
  5. Compare: the chip names the site, and the chip opens the linked source.

## S22.02 Source-preview cards.

- **Expected:** Hovering/tapping a citation shows a preview card (title, site, snippet/date) before opening it.
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:115; packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:85
- **Where to find it:** In an answer with source chips, hover a chip (desktop) to see its preview card; the card shows the source title, site, date and snippet (labels found in the code)
- **Needs:** a Free or paid account; a desktop browser with a mouse for hover (on a phone, tap behaviour was not verified)
- **Steps:**
  1. Get an answer with source chips (see S22.01).
  2. Move the mouse over a source chip and wait a moment.
  3. Read the card that appears: title, site name, date and snippet.
  4. Move the mouse away; the card closes. Click the chip only if you want to open the source.

## S22.03 Search-result lists.

- **Expected:** Web-search results are listed (title, site, link, optional snippet) and can be opened.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:3595; apps/web/features/chat/components/research/ResearchPanel.tsx:67
- **Where to find it:** Under the answer, click the "Sources" button; the Research panel opens with the Sources tab listing Citations and More (labels found in the code)
- **Needs:** a Free or paid account; an answer that used web search
- **Steps:**
  1. Get an answer that used web search (see S22.01).
  2. Click the "Sources" button under the answer.
  3. In the panel, check the tab "Sources" is selected, and read the "Citations" and "More" sections.
  4. Each row shows a title, site, date and snippet; click a row to open it in a new tab.

## S22.05 Image carousels.

- **Expected:** Image results render in a swipeable/pageable carousel within the answer.
- **Code:** partial. Evidence present: apps/web/lib/web-search/web-search-providers.json:4
- **Known to be unfinished:** owner (lead ruling 2026-09-28): choose an image-search provider and key; the carousel code follows the choice
- **Where to find it:** not found in the code. Searched for carousel and image-result rendering. The only carousel found is PlacePhotoCarousel (apps/web/features/chat/components/messages/cards/map/PlacePhotoCarousel.tsx), which is for place photos, not web image results. The owner note says the image-search provider is not yet chosen (apps/web/lib/web-search/web-search-providers.json).

## S22.08 Interactive charts.

- **Expected:** Charts in answers render interactively (hover/tap values, legend).
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1979; packages/ui/unified-chat/src/components/artifact-components/ChartCanvas.tsx:59 (quoted code not found in the file now)
- **Where to find it:** Ask the assistant for a chart; the chart appears in the answer, and "Open artifact" opens it in the Artifacts panel (labels found in the code)
- **Needs:** a Free or paid account; a prompt that makes the assistant create a chart
- **Steps:**
  1. Type "Make a bar chart of <numbers you choose>" and send.
  2. When the chart card appears, click "Open artifact" (or the chart in the answer).
  3. In the Artifacts panel, look at the chart: move the mouse over bars or points to see values, and check the legend.
  4. Compare with Expected: values show on hover and the legend lists the series.

## S22.09 Inspectable chart data.

- **Expected:** The data behind a chart can be inspected (values on hover, source table/JSON view or download).
- **Code:** done. Evidence present: packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:251; packages/ui/unified-chat/src/components/artifact-components/ChartCanvas.tsx:255
- **Where to find it:** In a chart artifact, click "View chart data" under the chart to see the table of values; use "Download" to save the chart as PNG (labels found in the code)
- **Needs:** a Free or paid account; a chart with more than a few points (for the truncation note)
- **Steps:**
  1. Open a chart artifact (see S22.08).
  2. Click "View chart data" below the chart.
  3. Read the table: column headers are series names, rows are the data points.
  4. Click the download control whose label is "Download <chart name> as PNG" to save the image, and compare with the table.

## S22.10 Geographic maps.

- **Expected:** Location answers render an interactive map with markers.
- **Code:** partial. Evidence present: apps/web/lib/maps/map-tile-provider.ts:93
- **Known to be unfinished:** owner: choose a map tile provider and set AGI_MAP_TILE_URL_TEMPLATE (apps/web/lib/maps/map-tile-provider.ts:93); live-check a map renders on web and in Electron (CSP img-src allows the tile host)
- **Needs:** production-state
- **Where to find it:** Ask the assistant for a place or map search (for example "Find coffee shops near <place>"); the result shows a map card with markers and an "Open in Google Maps" button (some labels not found in the code; trust the screen)
- **Needs:** production-state: a map tile URL (AGI_MAP_TILE_URL_TEMPLATE) must be set, and the place search needs its provider key
- **Steps:**
  1. Type "Find <type of place> near <place name>" and send.
  2. When the map card appears, look for markers on the map.
  3. Click "Open in Google Maps" to check the link opens the search in Google Maps in a new tab.
  4. Compare: the map shows markers for the places found.

## S22.11 Place and business cards.

- **Expected:** Place/business results render as cards (name, rating, address, hours, links).
- **Code:** partial. Evidence present: apps/web/lib/config/optional-features.ts:118
- **Known to be unfinished:** owner: create a Google Places API key with billing and set GOOGLE_PLACES_API_KEY (apps/web/lib/config/optional-features.ts:118); live-check a place query
- **Needs:** production-state
- **Where to find it:** Ask for a place or business (for example "Find <business name> and its hours"); the place card appears in the answer (path not confirmed in the code; trust the screen)
- **Needs:** production-state: a Google Places key (GOOGLE_PLACES_API_KEY) with billing; a paid or Free account depending on the plan
- **Steps:**
  1. Type a question about a specific place or business and send.
  2. Look for a place card in the answer with the place name and marker on the map.
  3. Click a marker or the place name to see its details.
  4. Compare: the card shows name, rating, address, hours and links.

## S22.17 Product comparison cards.

- **Expected:** Product comparisons render as side-by-side comparison cards.
- **Code:** done. Evidence present: apps/web/features/chat/components/cards/MessageFormatCard.tsx:55; apps/web/features/chat/components/cards/ComparisonCard.tsx:13
- **Where to find it:** Ask to compare two products (for example "Compare <product A> and <product B>"); the answer shows a "View as comparison" button that opens a side-by-side card (labels found in the code)
- **Needs:** a Free or paid account; the assistant must choose the comparison format
- **Steps:**
  1. Type "Compare <product A> and <product B>" and send.
  2. When the answer finishes, click the "View as comparison" button under it.
  3. Read the card: heading "<A> vs <B>" and a table of the two items.
  4. Compare: the items sit side by side and the better one is marked "Winner".

## S22.25 Email draft widgets.

- **Expected:** An email draft renders as an email widget (to, subject, body) with copy/send/open actions.
- **Code:** done. Evidence present: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1981; packages/ui/unified-chat/src/components/artifact-components/EmailArtifact.tsx:32
- **Where to find it:** Ask for an email draft (for example "Draft an email to <person> about <topic>"); the email card appears in the Artifacts panel (labels found in the code)
- **Needs:** a Free or paid account
- **Steps:**
  1. Type "Draft an email to <person> about <topic>" and send.
  2. Click "Open artifact" on the email card.
  3. Check the header shows the subject line, and the body below it.
  4. Click "Copy" and check the button changes to "Copied".

## S22.28 Approval forms.

- **Expected:** Actions needing consent render an approval form (what will happen, approve/deny).
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2678; apps/web/features/chat/components/messages/MessageBubble.tsx:965
- **Where to find it:** A tool that needs permission (for example a shell command or a connector action) shows an approval card in the chat; the buttons are "Allow once" and "Allow for this chat" (labels found in the code)
- **Needs:** a Free or paid account; a tool that the app asks permission for
- **Steps:**
  1. Ask the assistant to do something that needs a tool (for example "Run a command that lists files in a folder").
  2. When the approval card appears, read its title and the details (name, value pairs) and the risk label.
  3. Check the buttons: "Allow once" and "Allow for this chat" (and a deny control if shown).
  4. Click "Allow once" and check the card shows the decision and the tool runs.

## S22.29 Interactive questionnaires.

- **Expected:** The assistant can ask structured questions (options/fields) the user answers in an inline form.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:42; apps/web/features/chat/components/messages/cards/ClarifyCard.tsx:86
- **Where to find it:** The assistant asks clarifying questions in a card; fill the options or the "Other answer for <question>" field and click "Send answers" (labels found in the code)
- **Needs:** none beyond a Free or paid account; the assistant decides when to ask
- **Steps:**
  1. Ask a vague request so the assistant asks clarifying questions (for example "Plan a trip for me").
  2. Pick an option for each question, or type into the "Other" field if shown.
  3. Check that "Send answers" is enabled only after the required questions are answered.
  4. Click "Send answers" and check the card shows the sending state, then the assistant continues.

## S22.30 Decision/comparison tables.

- **Expected:** Decision/comparison answers render as a readable comparison table.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/MessageBubble.tsx:2895; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:549
- **Where to find it:** Ask for a comparison table (for example "Compare <A> and <B> in a table"); the table appears in the answer with "Expand table" and "Copy table" (labels found in the code)
- **Needs:** a Free or paid account; the assistant must answer with a table
- **Steps:**
  1. Type "Compare <A> and <B> in a table" and send.
  2. When the table appears in the answer, read the header row and rows.
  3. Click "Expand table" to open it larger.
  4. Click "Copy table" and check the button shows "Table copied".

## S22.31 Mind maps.

- **Expected:** Mind-map answers render as a drawn mind map.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:59 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:139
- **Where to find it:** Ask for a mind map (for example "Draw a mind map of <topic>"); the diagram appears in the answer with "Show source" and "Expand diagram" (labels found in the code)
- **Needs:** a Free or paid account; the assistant must write a diagram block
- **Steps:**
  1. Type "Draw a mind map of <topic>" and send.
  2. When the diagram appears in the answer, read the drawn nodes and branches.
  3. Click "Show source" to see the diagram text, then click it again to hide it.
  4. Click "Expand diagram" and check the enlarged diagram opens.

## S22.32 Flowcharts.

- **Expected:** Flowchart answers render as a drawn flowchart diagram.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:59 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:139
- **Where to find it:** Ask for a flowchart (for example "Draw a flowchart of <process>"); the diagram appears in the answer with "Show source" and "Expand diagram" (labels found in the code)
- **Needs:** a Free or paid account; the assistant must write a diagram block
- **Steps:**
  1. Type "Draw a flowchart of <process>" and send.
  2. When the diagram appears, read the boxes and arrows.
  3. Click "Show source" to check the diagram text.
  4. Click "Expand diagram" and check it opens larger.

## S22.33 Timelines.

- **Expected:** Timeline answers render as a drawn timeline.
- **Code:** done. Evidence moved: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:59 (quoted code not found in the file now); packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:139
- **Where to find it:** Ask for a timeline (for example "Draw a timeline of <events>"); the diagram appears in the answer with "Show source" and "Expand diagram" (labels found in the code)
- **Needs:** a Free or paid account; the assistant must write a diagram block
- **Steps:**
  1. Type "Draw a timeline of <events>" and send.
  2. When the diagram appears, read the dated events in order.
  3. Click "Show source" to check the diagram text.
  4. Click "Expand diagram" and check it opens larger.

## S22.36 Interactive demonstrations.

- **Expected:** Interactive demonstrations (HTML/JS/React) run live and interactively inside the answer or panel.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:511 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:527 (quoted code not found in the file now)
- **Where to find it:** Ask for an interactive demo (for example "Build an interactive HTML demo of <idea>"); open the artifact and use the "Preview" tab (labels found in the code)
- **Needs:** a Free or paid account; the assistant must produce an HTML or React artifact
- **Steps:**
  1. Type "Build an interactive HTML demo of <idea>" and send.
  2. Click "Open artifact" on the card.
  3. In the Artifacts panel, make sure the "Preview" tab is selected, and use the demo (click buttons, type in fields).
  4. Click "Open in new tab" if you want the demo in its own tab, and compare with Expected.

## S22.37 Embedded third-party app panels.

- **Expected:** Third-party apps (e.g. MCP apps) render as embedded interactive panels inside the chat.
- **Code:** done. Evidence present: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:113
- **Where to find it:** An MCP app that the chat can use shows a card in the answer; when it asks for access, click "Allow once" or "Deny" and then use the embedded panel (labels found in the code)
- **Needs:** an MCP app connected to the account; a device or permission the app asks for
- **Steps:**
  1. Connect an MCP app (its setup location was not confirmed in the code read).
  2. Ask the assistant to use that app's feature.
  3. When the app card asks for access, read the request, then click "Allow once" (or "Deny").
  4. After allowing, check the embedded panel appears in the answer and responds to clicks.

## S22.38 Generated application previews.

- **Expected:** Generated apps/sites render as a live preview that can be opened or expanded.
- **Code:** done. Evidence moved: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:511 (quoted code not found in the file now); apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:557
- **Where to find it:** Ask for a generated app or site (for example "Build a small website for <idea>"); open the artifact, then the "Preview" tab shows the live app (labels found in the code)
- **Needs:** a Free or paid account; the assistant must produce an HTML or React artifact
- **Steps:**
  1. Type "Build a small web page for <idea>" and send.
  2. Click "Open artifact" on the card.
  3. Check the "Preview" tab shows the running page; click something on it.
  4. Use "Open in new tab" to open it in its own tab, or use the expand control, and compare with Expected.
