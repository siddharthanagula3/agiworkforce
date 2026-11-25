---
id: "PLAN-mobile-022"
type: "test-plan"
title: "Mobile · 22. Rich answers and structured result widgets"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "22"
---
# Mobile · 22. Rich answers and structured result widgets

13 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S22.01 Citation chips.

- **Expected:** Answers grounded in sources show citation chips that identify and open the source.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1008 (quoted code not found in the file now); apps/mobile/src/features/chat/components/CitationChip.tsx:20 (quoted code not found in the file now)
- **Where to find it:** Chat > '+' button > turn on 'Web search' > ask a question > teal [1], [2] markers in the answer (labels found in the code)
- **Needs:** A signed-in account that is allowed web search (the 'Web search' row is hidden otherwise), and a network connection
- **Steps:**
  1. Sign in and open the Chat screen. Make sure the 'Cloud' button in the mode toggle is selected.
  2. Tap the '+' button (its accessibility label is 'Add to chat'), turn on 'Web search', then close the sheet.
  3. Ask: 'What are the latest headlines about renewable energy? Cite your sources.'
  4. When the answer finishes, look for small teal bracket numbers such as [1] in the text.
  5. Tap one [n] marker. Compare with Expected: the source should be identified (title shown) and openable through 'Open page'.

## S22.02 Source-preview cards.

- **Expected:** Hovering/tapping a citation shows a preview card (title, site, snippet/date) before opening it.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/CitationChip.tsx:12 (quoted code not found in the file now)
- **Where to find it:** Chat > answer with web search > tap a teal [n] marker > preview alert (labels found in the code)
- **Needs:** A signed-in account with web search on, and a network connection
- **Steps:**
  1. Get an answer with web search on, as in S22.01, with a teal [n] marker in the text.
  2. Tap the [n] marker.
  3. Compare with Expected: a popup shows the source title, the site, 'Published' date when known, and a snippet when known.
  4. Tap 'Cancel' and tap the marker again, then tap 'Open page' and check the source opens.

## S22.03 Search-result lists.

- **Expected:** Web-search results are listed (title, site, link, optional snippet) and can be opened.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:1017 (quoted code not found in the file now); apps/mobile/src/features/chat/components/CollapsibleSources.tsx:119 (quoted code not found in the file now)
- **Where to find it:** Chat > answer made with web search > tap the 'Sources' pill under the answer (labels found in the code)
- **Needs:** A signed-in account with web search on, and a network connection
- **Steps:**
  1. Get an answer with web search on, as in S22.01.
  2. Tap the 'Sources' pill under the answer (it says 'View N sources').
  3. Check the sheet: a query line, a 'Citations' heading for cited sources, and a 'More' heading for the rest.
  4. Check each row shows publisher and date, the title, and a snippet when there is one.
  5. Tap a row. Compare with Expected: the source opens in the in-app browser.

## S22.08 Interactive charts.

- **Expected:** Charts in answers render interactively (hover/tap values, legend).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ReportChart.tsx:1
- **Where to find it:** Chat > ask for a chart > the chart in the answer (labels found in the code)
- **Needs:** None beyond sign-in. The model must return a chart, so ask for one; the app has no button that makes a chart
- **Steps:**
  1. Sign in and open the Chat screen.
  2. Ask: 'Make a bar chart of monthly sales for January to June: 10, 14, 9, 17, 20, 12.'
  3. When the chart appears in the answer, press and drag across the bars or line.
  4. Look at the text line under the chart: it changes to show the value at that point.
  5. For a pie chart, tap a slice to select it and tap again to clear. Compare with Expected: values show on touch and a legend-style readout appears.

## S22.09 Inspectable chart data.

- **Expected:** The data behind a chart can be inspected (values on hover, source table/JSON view or download).
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/ReportChart.tsx:1
- **Where to find it:** Chat > chart in an answer > 'Show data' button under the chart (labels found in the code)
- **Needs:** None beyond sign-in; the answer must contain a chart
- **Steps:**
  1. Get a chart in an answer, as in S22.08.
  2. Tap 'Show data' under the chart. A table of the chart values appears.
  3. Tap a value in the table and check it can be selected.
  4. Tap 'Save image' and check a picture of the chart is saved or shared.
  5. Compare the table values with the chart. Compare with Expected: the data is inspectable and can be saved.

## S22.10 Geographic maps.

- **Expected:** Location answers render an interactive map with markers.
- **Code:** unverified. Evidence none: the ledger gives no code location
- **Needs:** production-state
- **Where to find it:** Chat (Cloud mode) > ask about places > map in the answer > 'Full screen map' control (labels found in the code)
- **Needs:** A managed Cloud account with map tiles available. This depends on production state and is not verified here
- **Steps:**
  1. Select 'Cloud' in the mode toggle on the Chat screen.
  2. Ask: 'Show me the main museums in Paris on a map.'
  3. Wait for the answer. A map with pins should appear under the text.
  4. Tap the expand control on the map (its label is 'Full screen map').
  5. Compare with Expected: the map shows markers. If the map cannot load, the text 'Map preview is unavailable. Place names are listed.' appears instead.

## S22.28 Approval forms.

- **Expected:** Actions needing consent render an approval form (what will happen, approve/deny).
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:226 (quoted code not found in the file now); apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:372; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:526
- **Where to find it:** Chat (Cloud mode) > a task where the agent asks to use a tool > approval card in the activity timeline with 'Allow once', 'Allow for this chat', 'Always allow', 'Deny' (labels found in the code)
- **Needs:** A Cloud account with a tool or connector that needs approval; the UI does not let the tester choose when it asks
- **Steps:**
  1. Select 'Cloud' in the mode toggle and start a task that makes the agent use a tool needing approval.
  2. When the agent pauses, find the approval card. Check it shows the tool summary and its parameters.
  3. Read the buttons: 'Allow once', 'Allow for this chat', 'Always allow', 'Deny'.
  4. Tap 'Deny' (or 'Allow once') and check the card shows the decision.
  5. For 'Always allow' on a destructive tool, check a confirmation alert with 'Cancel' appears. Compare with Expected: the card states what will happen and offers approve or deny.

## S22.30 Decision/comparison tables.

- **Expected:** Decision/comparison answers render as a readable comparison table.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageBubble.tsx:660 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:306 (quoted code not found in the file now)
- **Where to find it:** Chat > ask for a comparison table > the table in the answer > 'Expand table' (labels found in the code)
- **Needs:** None beyond sign-in; the answer must contain a table
- **Steps:**
  1. Ask: 'Compare three phone plans in a table: price, data, and contract length.'
  2. Find the table in the answer and check its columns and rows read clearly.
  3. Tap a column heading to sort the rows.
  4. Tap the 'Expand table' icon to open the table full screen, then tap 'Close table'.
  5. Compare with Expected: the answer shows a readable comparison table.

## S22.31 Mind maps.

- **Expected:** Mind-map answers render as a drawn mind map.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:643 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MermaidDiagramBlock.tsx:123; apps/mobile/src/features/chat/components/sandboxedArtifactHtml.ts:47 (quoted code not found in the file now)
- **Where to find it:** Chat > ask for a mind map > the 'Diagram' bar under the drawing > 'Expand diagram' or 'Show source' (labels found in the code)
- **Needs:** None beyond sign-in; the answer must contain a mermaid block
- **Steps:**
  1. Ask: 'Draw a mind map of the parts of a bicycle as a mermaid mindmap.'
  2. Wait for the answer. A 'Diagram' bar appears under the drawing.
  3. Tap 'Show source' to see the diagram code, then tap 'Show source' again to hide it.
  4. Tap the 'Expand diagram' icon to open it full screen.
  5. Compare with Expected: a drawn mind map with a central topic and branches.

## S22.32 Flowcharts.

- **Expected:** Flowchart answers render as a drawn flowchart diagram.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:643 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MermaidDiagramBlock.tsx:123; apps/mobile/src/features/chat/components/sandboxedArtifactHtml.ts:47 (quoted code not found in the file now)
- **Where to find it:** Chat > ask for a flowchart > the 'Diagram' bar under the drawing > 'Expand diagram' or 'Show source' (labels found in the code)
- **Needs:** None beyond sign-in; the answer must contain a mermaid block
- **Steps:**
  1. Ask: 'Draw a flowchart of how a support ticket is handled, with decision points, as a mermaid flowchart.'
  2. Wait for the answer. A 'Diagram' bar appears under the drawing.
  3. Tap 'Show source' to see the diagram code, then hide it.
  4. Tap the 'Expand diagram' icon to open it full screen.
  5. Compare with Expected: a drawn flowchart with boxes and arrows.

## S22.33 Timelines.

- **Expected:** Timeline answers render as a drawn timeline.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:643 (quoted code not found in the file now); apps/mobile/src/features/chat/components/MermaidDiagramBlock.tsx:123; apps/mobile/src/features/chat/components/sandboxedArtifactHtml.ts:47 (quoted code not found in the file now)
- **Where to find it:** Chat > ask for a timeline > the 'Timeline' panel in the answer (numbered steps with status labels) (labels found in the code)
- **Needs:** None beyond sign-in; the answer must contain a timeline block
- **Steps:**
  1. Ask: 'Make a timeline of the steps to launch a small app, with dates and status.'
  2. Find the 'Timeline' panel in the answer.
  3. Check the steps are numbered in order, each with a date when given.
  4. Check each step's status label: 'Complete', 'In progress' or 'Not started'.
  5. Compare with Expected: the answer shows a drawn timeline of the steps.

## S22.36 Interactive demonstrations.

- **Expected:** Interactive demonstrations (HTML/JS/React) run live and interactively inside the answer or panel.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:639 (quoted code not found in the file now); apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:26 (quoted code not found in the file now)
- **Where to find it:** Chat > ask for an interactive HTML page > html code card > 'Preview HTML' (labels found in the code)
- **Needs:** None beyond sign-in; the answer must contain an html block
- **Steps:**
  1. Ask: 'Make a small interactive HTML demo with a button that counts clicks.'
  2. When the html code block appears, tap 'Preview HTML'.
  3. Tap the demo's button inside the preview and check the count changes.
  4. Tap the 'Source' tab to see the code, then 'Preview' to go back.
  5. Compare with Expected: the demo runs live inside the preview.

## S22.38 Generated application previews.

- **Expected:** Generated apps/sites render as a live preview that can be opened or expanded.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:639 (quoted code not found in the file now); apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:26 (quoted code not found in the file now)
- **Where to find it:** Chat > ask for a small web app > artifact card in the answer > tap it > 'Preview' tab (and 'Open in Safari' when published) (labels found in the code)
- **Needs:** None beyond sign-in; the answer must generate an app or page (the tester cannot force it)
- **Steps:**
  1. Ask: 'Build a small web page that shows a to-do list I can add items to.'
  2. Tap the artifact card in the answer (it says 'Tap to expand').
  3. In the full-screen view, check the 'Preview' tab shows the live page. Try adding an item.
  4. Tap 'Source' and then 'Preview' again.
  5. If the artifact has been published, find its publication link and 'Open in Safari' (iPhone) or 'Open in browser'. Compare with Expected: the app is previewed live and can be opened or expanded.
