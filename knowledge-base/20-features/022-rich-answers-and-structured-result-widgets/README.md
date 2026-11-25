---
id: "AREA-022"
type: "area"
title: "Rich answers and structured result widgets"
features: ["F022-01", "F022-02", "F022-03", "F022-04", "F022-05", "F022-06", "F022-07", "F022-08", "F022-09", "F022-10", "F022-11"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 22. Rich answers and structured result widgets

Answers show more than plain text: source chips a person can open, search-result lists, charts, maps, tables, diagrams, drafts and forms they can act on inside the chat. The goal is that a person reads the answer and acts on it in the same place. Many widgets in the brief (news, weather, sports, flights, packages, quizzes in chat, reservations) are not built yet in any app.

**Who uses it.** Every chat user who gets an answer with sources, charts, maps, drafts or forms, on the web, desktop (the web app), mobile, the Chrome side panel, the CLI terminal UI and the VS Code sidebar, as far as each app's status line says. No plan gate on individual widgets was found in the code read. Developers add new widget kinds through the shared card contract. Workspace admins: not established.

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F022-01](F022-01-citations-and-source-previews.md) | Citations and source previews | built | built | built | no | partly | built |
| [F022-02](F022-02-media-results-news-images-video-audio.md) | Media results (news, images, video, audio) | partly | partly | partly | no | no | partly |
| [F022-03](F022-03-charts-and-chart-data.md) | Charts and chart data | built | built | built | no | no | no |
| [F022-04](F022-04-maps-and-places.md) | Maps and places | partly | partly | partly | no | no | partly |
| [F022-05](F022-05-live-information-cards-weather-sports-markets-comp.md) | Live information cards (weather, sports, markets, company, flights, packages) | no | no | no | no | no | no |
| [F022-06](F022-06-shopping-travel-and-booking.md) | Shopping, travel and booking | partly | partly | partly | no | no | partly |
| [F022-07](F022-07-drafts-contacts-and-tasks.md) | Drafts, contacts and tasks | partly | partly | partly | no | partly | partly |
| [F022-08](F022-08-approvals-and-questions.md) | Approvals and questions | built | built | partly | built | partly | partly |
| [F022-09](F022-09-tables-diagrams-and-mind-maps.md) | Tables, diagrams and mind maps | built | built | built | partly | partly | partly |
| [F022-10](F022-10-study-cards-and-quizzes.md) | Study cards and quizzes | partly | partly | built | no | no | no |
| [F022-11](F022-11-live-previews-and-embedded-apps.md) | Live previews and embedded apps | built | built | partly | no | no | no |

Requirement items for this area: [10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md).

## How this area works in the code

1. **1. The model is offered the answer-card tool.** When a request streams, supports interactive cards, and tools are on, the server adds the answer-card tool to the request. Cards only arrive when this happens. The known card kinds are listed in the shared contract. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1300-1316`, `packages/contracts/types/src/interactive-cards.ts:15-24`)
2. **2. Cards are stored with the message.** Cards the turn produced are saved in the assistant message's metadata, under the interactiveCards key. Stored messages come back with their cards. (`apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.ts:291-292`, `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.ts:345-346`)
3. **3. The web client reads the card kinds.** The web stream code lists the card kinds it can read (answer-ui, clarify, image, itinerary, map search, MCP app, places, product comparison). The answer-ui tool definition is built in one service. (`apps/web/lib/hooks/useChatStream.ts:1335`, `apps/web/lib/services/answer-ui-tool-service.ts:218-224`)
4. **4. The client picks a widget for each card.** A registry maps each card kind to a component. Send and reply actions are blocked while the reply streams and in temporary chats. (`apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:38-53`, `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:17-18`)
5. **5. Answer blocks are drawn.** The answer-ui card is made of typed blocks (table, chart, map, gallery and others). Each block type maps to a component. Chart and map blocks are drawn by their own components, the map loaded lazily. (`packages/contracts/types/src/answer-ui.ts:32-55`, `apps/web/features/chat/components/messages/cards/answer-ui/AnswerUiCard.tsx:1004-1005`, `apps/web/features/chat/components/messages/cards/answer-ui/AnswerUiCard.tsx:1053-1054`)
6. **6. Inline citations become chips.** Citation links in the answer text are turned into chips. Multiple citations at one spot are grouped. (`packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:277-290`, `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:124-147`)
7. **7. Charts and maps draw their data.** The chart canvas draws the values and tooltips; the chart artifact adds an expandable data view. Maps take tile addresses from configuration. (`packages/ui/unified-chat/src/components/artifact-components/ChartCanvas.tsx:59-60`, `packages/ui/unified-chat/src/components/artifact-components/ChartArtifact.tsx:212`, `apps/web/lib/maps/map-tile-provider.ts:13-22`)
8. **8. Each other app draws its own version.** Mobile, the Chrome side panel, the CLI and VS Code each have their own renderer. They share the citation and card logic only where noted. (`apps/mobile/src/features/chat/components/CitationChip.tsx:21`, `apps/extension/src/features/side-panel/sources.ts:43`, `apps/cli/src/tui/markdown_renderer.rs:277-281`, `apps/extension-vscode/src/webview/render.ts:72-74`)

## Files to know

| File | Role |
|---|---|
| `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx` | Web registry that picks the widget for each card kind, and the send and reply rules. |
| `packages/contracts/types/src/interactive-cards.ts` | Shared list of known card kinds, leading kinds and per-message limits. |
| `packages/contracts/types/src/answer-ui.ts` | Shared block types and chart types for the answer-ui card. |
| `apps/web/features/chat/components/messages/cards/answer-ui/AnswerUiCard.tsx` | Draws each answer-ui block (table, chart, map, gallery and others). |
| `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Adds the answer-card tool to a streaming request when the client supports it. |
| `apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-persistence.ts` | Saves the cards from a turn into the assistant message metadata. |
| `packages/ui/unified-chat/src/components/markdown/CitationChip.tsx` | Shared citation chip and preview card for web and desktop. |
| `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx` | Turns citation links in answer text into chip items. |
| `apps/web/lib/maps/map-tile-provider.ts` | Reads the map tile addresses from configuration. |
| `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | Artifact panel: study document, chart and preview views, cloud save. |
| `apps/mobile/src/features/chat/components/CitationChip.tsx` | Mobile citation chip and preview text. |
| `apps/extension/src/features/side-panel/sources.ts` | Chrome side panel citation chip and source cards, built by hand. |

## What is stored

- Cards for each assistant message (kind, body, id): Message metadata under the interactiveCards key, written by assistant-turn-persistence.ts:345-346. The database table is not established.
- Per-card submission errors: Message metadata key interactiveCardSubmissionErrors (InteractiveCardBlock.tsx:53-60).
- Web search results and sources for a turn: Helpers in apps/web/app/api/llm/v1/chat/completions/lib/research-sources (imported by web-search-tool.ts:29); storage not opened.
- Browser-side chat state: Web chat store (web-chat-store) holds the active conversation and streaming flag (InteractiveCardBlock.tsx:23). Nothing else verified.

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **x_interactive_cards.supported includes answer-ui.v1**: Turns the answer-card tool on for a request. Without it no answer cards are sent. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1300-1316)
- **web_search flag**: Turns on web search for a turn; search results become citations. (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:979-983 and :1468; schema at :708)
- **GOOGLE_PLACES_API_KEY and the places_search feature**: Without the key the place search tool is not offered and place questions go unlocated. (apps/web/lib/config/optional-features.ts:116-118; apps/web/lib/places/places-config.ts:7)
- **AGI_MAP_TILE_URL_TEMPLATE (plus dark template and attribution variables)**: Sets the map tile address. Unset, a public development tile URL is used. (apps/web/lib/maps/map-tile-provider.ts:5 and :16 (default), :13-29 (reader))
- **Map max zoom variable**: Sets the maximum map zoom; out-of-range values fall back to a default with a warning. (apps/web/lib/maps/map-tile-provider.ts:80-87)
- **Temporary chat flag**: Blocks send actions on cards in temporary chats. (apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:20-30 and :32-51)
- **Card limits**: At most 4 cards per message and 12000 characters per card. (packages/contracts/types/src/interactive-cards.ts (constants INTERACTIVE_CARDS_MAX_PER_MESSAGE and INTERACTIVE_CARD_MAX_SERIALIZED_LENGTH, at the top of the file))
- **Web search limits**: At most 3 search calls per turn (10 in agent work turns) and 5 results per call. (apps/web/lib/web-search/web-search-tool.ts:54-57)

## Shared between apps

Shared in packages/: the card kind list and types (packages/contracts/types/src/interactive-cards.ts, answer-ui.ts), the cloud card rules (packages/contracts/cloud-contracts/src/answer-ui.ts, interactive-cards.ts), the unified chat widgets used by web and desktop (packages/ui/unified-chat: CitationChip, MarkdownContent, ChartArtifact, ChartCanvas, EmailArtifact, MermaidDiagram), and the study logic (packages/ui/unified-chat/src/lib/study-set.ts). Separate per app: web card registry and answer-ui renderer (apps/web/features/chat/components/messages/...), mobile renderers (apps/mobile/src/features/chat/components/...), the Chrome side panel (apps/extension/src/features/side-panel/...), the CLI terminal widgets (apps/cli/src/tui/...), and the VS Code webview (apps/extension-vscode/src/...). Each surface re-implements the same card ideas in its own UI code.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says itinerary cards are missing on web (S22.19), but the web card registry draws an itinerary card, and the Chrome side panel has itinerary styles. (apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:46; packages/contracts/types/src/interactive-cards.ts:19; apps/extension/src/side_panel.ts:3087)
- Brief says flashcards and quizzes are missing in every app (S22.34, S22.35), but web and mobile have study views for quiz and flashcard blocks. (apps/web/features/chat/components/artifacts/study/QuizView.tsx; apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:1922-1923; apps/mobile/src/features/chat/components/artifact-viewers/study/StudyQuizView.tsx; apps/mobile/src/features/chat/components/artifact-viewers/study/StudyFlashcardsView.tsx)
- Brief says questionnaires are missing on mobile (S22.29), but mobile has a clarify card and an interactive card block. (apps/mobile/src/features/chat/components/ClarifyCard.tsx; apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx)
- Brief's line references for ArtifactPreview.tsx (chart S22.08, email S22.25, generated preview S22.36 and S22.38) point to unrelated code. Line 511 is the cloud save destination table (Google Drive, OneDrive), and lines 1040-1058 are the edit history state. (apps/web/features/chat/components/artifacts/ArtifactPreview.tsx:511 and :1040-1058)
- Image carousel item (S22.05) is a lightbox that pages through images. It is not an in-answer carousel, and no image-search provider is configured. The only search provider entry is a single web-search provider. (apps/web/features/chat/components/messages/MessageBubble.tsx:1896-1915; apps/web/lib/web-search/web-search-providers.json:2-8)
- Map tiles fall back to a public development tile URL when the tile variable is unset. Production would use that URL unless the owner sets the variable. (apps/web/lib/maps/map-tile-provider.ts:16 and :19-27)
- Brief's citation line numbers are slightly stale for several files, for example CitationChip (brief 126, found 124) and map-tile-provider (brief 93, found 92). (packages/ui/unified-chat/src/components/markdown/CitationChip.tsx:124; apps/web/lib/maps/map-tile-provider.ts:92)

## Not established

- Plan gates for each widget (free, paid, workspace admin): no plan check was found in the code read of applyAnswerUiCapability or InteractiveCardBlock; not established for the whole area.
- Local, own-key and Cloud differences for this area: not established.
- Database table names and browser storage for cards and sources: only the message metadata key was seen.
- Mobile, CLI, VS Code and Chrome internals beyond the cited lines (for example the mobile MessageBubble citation path, the VS Code approval code and the Chrome map and place cards): not opened.
- Desktop-specific behaviour (Electron content security policy for map tiles): not live-checked; the brief says it is pending.
- Whether the action buttons on the email draft (copy, send, open) work: not traced.
- Whether the search providers and research-sources helpers return sources correctly: not opened.
- No tests or live runs were done. This was a read-only code read, so nothing was checked on localhost or on any surface.
