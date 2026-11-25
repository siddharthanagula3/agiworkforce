# Area 22. Rich answers and structured result widgets

38 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S22.01 Citation chips.
- Should: Answers grounded in sources show citation chips that identify and open the source.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:135; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:276; apps/mobile/src/features/chat/components/MessageBubble.tsx:1008; apps/mobile/src/features/chat/components/CitationChip.tsx:20; apps/extension/src/features/side-panel/sources.ts:42; apps/extension/src/features/side-panel/sources.ts:102

## S22.02 Source-preview cards.
- Should: Hovering/tapping a citation shows a preview card (title, site, snippet/date) before opening it.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:126; packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:102; apps/mobile/src/features/chat/components/CitationChip.tsx:12; apps/extension/src/features/side-panel/sources.ts:62; apps/extension/src/features/side-panel/sources.ts:33; apps/extension/src/features/side-panel/sources.ts:36; apps/extension/src/side_panel.ts:1940

## S22.03 Search-result lists.
- Should: Web-search results are listed (title, site, link, optional snippet) and can be opened.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2739; apps/web/features/chat/components/research/ResearchPanel.tsx:70; apps/mobile/src/features/chat/components/MessageBubble.tsx:1017; apps/mobile/src/features/chat/components/CollapsibleSources.tsx:119; apps/extension/src/features/side-panel/bubbles.ts:421; apps/extension/src/features/side-panel/bubbles.ts:406

## S22.04 News cards.
- Should: News results render as dedicated news cards (headline, outlet, date, image).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S22.05 Image carousels.
- Should: Image results render in a swipeable/pageable carousel within the answer.
- Status: web partial, desktop partial, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/lib/web-search/web-search-providers.json:4
- Unfinished: web: owner (lead ruling 2026-09-28): choose an image-search provider and key; the carousel code follows the choice | desktop: owner (lead ruling 2026-09-28): choose an image-search provider and key; the carousel code follows the choice

## S22.06 Video result cards.
- Should: Video results render as cards with thumbnail, title, duration and play/open.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S22.07 Audio players.
- Should: Audio in an answer (generated speech/music, audio results) plays in an inline audio player.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S22.08 Interactive charts.
- Should: Charts in answers render interactively (hover/tap values, legend).
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1050; packages/ui/unified-chat/src/components/artifact-components/ChartCanvas.tsx:59; apps/mobile/src/features/chat/components/ReportChart.tsx:1

## S22.09 Inspectable chart data.
- Should: The data behind a chart can be inspected (values on hover, source table/JSON view or download).
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:208; packages/ui/unified-chat/src/components/artifact-components/ChartCanvas.tsx:77; apps/mobile/src/features/chat/components/ReportChart.tsx:1

## S22.10 Geographic maps.
- Should: Location answers render an interactive map with markers.
- Status: web partial, desktop partial, mobile unverified, cli missing, vscode missing, chrome done
- Code: apps/web/lib/maps/map-tile-provider.ts:93; apps/extension/src/features/side-panel/mapPreview.ts:144; apps/extension/src/features/side-panel/mapPreview.ts:84; apps/extension/src/features/side-panel/mapPreview.ts:102; apps/extension/src/features/side-panel/bubbles.ts:121
- Unfinished: web: owner: choose a map tile provider and set AGI_MAP_TILE_URL_TEMPLATE (apps/web/lib/maps/map-tile-provider.ts:93); live-check a map renders on web and in Electron (CSP img-src allows the tile host) | desktop: owner: choose a map tile provider and set AGI_MAP_TILE_URL_TEMPLATE (apps/web/lib/maps/map-tile-provider.ts:93); live-check a map renders on web and in Electron (CSP img-src allows the tile host)

## S22.11 Place and business cards.
- Should: Place/business results render as cards (name, rating, address, hours, links).
- Status: web partial, desktop partial, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/lib/config/optional-features.ts:118
- Unfinished: web: owner: create a Google Places API key with billing and set GOOGLE_PLACES_API_KEY (apps/web/lib/config/optional-features.ts:118); live-check a place query | desktop: owner: create a Google Places API key with billing and set GOOGLE_PLACES_API_KEY (apps/web/lib/config/optional-features.ts:118); live-check a place query

## S22.12 Weather cards.
- Should: Weather answers render as a weather card (conditions, temperature, forecast).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S22.13 Sports schedules.
- Should: Sports schedule answers render as a schedule widget.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S22.14 Sports scores and standings.
- Should: Sports scores/standings render as a scoreboard or standings table widget.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S22.15 Market-price charts.
- Should: Stock/market price answers render a price chart widget.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S22.16 Company and financial-summary cards.
- Should: Company/financial answers render a summary card (key figures, ticker).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S22.17 Product comparison cards.
- Should: Product comparisons render as side-by-side comparison cards.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/cards/MessageFormatCard.tsx:55; apps/web/features/chat/components/cards/ComparisonCard.tsx:214

## S22.18 Price and availability displays.
- Should: Shopping answers show price and availability (in stock, sellers) in a structured display.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S22.19 Travel itinerary cards.
- Should: Trip plans render as a structured itinerary card (days, stops, times).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S22.20 Flight-status cards.
- Should: Flight status answers render a flight-status card (times, gate, status).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S22.21 Package-tracking cards.
- Should: Package-tracking answers render a tracking card (carrier, status, ETA).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S22.22 Reservation choices.
- Should: Booking answers offer selectable reservation choices (times/tables/rooms).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S22.23 Calendar availability grids.
- Should: Scheduling answers render a calendar availability grid to pick slots.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S22.24 Contact cards.
- Should: Person/contact answers render a contact card (name, role, email/phone actions).
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S22.25 Email draft widgets.
- Should: An email draft renders as an email widget (to, subject, body) with copy/send/open actions.
- Status: web done, desktop done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1052; packages/ui/unified-chat/src/components/artifact-components/EmailArtifact.tsx:33

## S22.26 Message draft widgets.
- Should: A chat/SMS/Slack message draft renders as a message widget with copy/send.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S22.27 Task and issue cards.
- Should: Tasks/issues (e.g. Linear, GitHub, Jira) render as task/issue cards with status and link.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S22.28 Approval forms.
- Should: Actions needing consent render an approval form (what will happen, approve/deny).
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:1872; apps/web/features/chat/components/messages/MessageBubble.tsx:846; apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:226; apps/mobile/src/features/chat/components/CloudToolApprovalControls.tsx:280; apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:285; apps/cli/src/tui/widgets/approval_overlay.rs:5; apps/cli/src/tui/tui_app.rs:880; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4597

## S22.29 Interactive questionnaires.
- Should: The assistant can ask structured questions (options/fields) the user answers in an inline form.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:34; apps/web/features/chat/components/messages/cards/ClarifyCard.tsx:86; apps/cli/src/tui/widgets/elicitation_overlay.rs:312; apps/cli/src/tui/tui_app.rs:953

## S22.30 Decision/comparison tables.
- Should: Decision/comparison answers render as a readable comparison table.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2082; packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:401; apps/mobile/src/features/chat/components/MessageBubble.tsx:660; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:306; apps/cli/src/tui/tui_app.rs:1530; apps/cli/src/tui/markdown_renderer.rs:279; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5051; apps/extension-vscode/src/webview/render.ts:5

## S22.31 Mind maps.
- Should: Mind-map answers render as a drawn mind map.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:59; packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:125; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:643; apps/mobile/src/features/chat/components/MermaidDiagramBlock.tsx:66; apps/mobile/src/features/chat/components/sandboxedArtifactHtml.ts:47

## S22.32 Flowcharts.
- Should: Flowchart answers render as a drawn flowchart diagram.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:59; packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:125; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:643; apps/mobile/src/features/chat/components/MermaidDiagramBlock.tsx:66; apps/mobile/src/features/chat/components/sandboxedArtifactHtml.ts:47

## S22.33 Timelines.
- Should: Timeline answers render as a drawn timeline.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:59; packages/ui/unified-chat/src/components/markdown/MermaidDiagram.tsx:125; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:643; apps/mobile/src/features/chat/components/MermaidDiagramBlock.tsx:66; apps/mobile/src/features/chat/components/sandboxedArtifactHtml.ts:47

## S22.34 Flashcards.
- Should: Study answers can render as flip-style flashcards in the chat.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S22.35 Quizzes.
- Should: Quiz answers render as an interactive quiz with answer checking.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S22.36 Interactive demonstrations.
- Should: Interactive demonstrations (HTML/JS/React) run live and interactively inside the answer or panel.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:511; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:527; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:639; apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:26

## S22.37 Embedded third-party app panels.
- Should: Third-party apps (e.g. MCP apps) render as embedded interactive panels inside the chat.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:38; apps/web/features/chat/components/messages/cards/McpAppCard.tsx:241

## S22.38 Generated application previews.
- Should: Generated apps/sites render as a live preview that can be opened or expanded.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:511; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:241; apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx:639; apps/mobile/src/features/chat/components/SafeArtifactPreview.tsx:26
