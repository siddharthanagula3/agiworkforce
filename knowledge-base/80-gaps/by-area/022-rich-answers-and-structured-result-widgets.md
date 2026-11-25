---
id: "GAPS-AREA-022"
type: "gap-list"
title: "Gaps: Rich answers and structured result widgets"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 22. Rich answers and structured result widgets

103 open gaps that touch this area. Area page: [20-features/022-rich-answers-and-structured-result-widgets](../../20-features/022-rich-answers-and-structured-result-widgets/README.md).

## CMP-M33

**Interactive learning modules for math and science**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F022-10](../../20-features/022-rich-answers-and-structured-result-widgets/F022-10-study-cards-and-quizzes.md)
- Detail: Study mode exists but no manipulable formula or graph modules.
- Evidence: src/features/study/StudyScreen.tsx; searched: learning module, interactive graph

## CMP-M35

**Restaurant reservations inside a chat**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F022-02](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md), [F022-04](../../20-features/022-rich-answers-and-structured-result-widgets/F022-04-maps-and-places.md), [F022-05](../../20-features/022-rich-answers-and-structured-result-widgets/F022-05-live-information-cards-weather-sports-markets-comp.md), [F022-06](../../20-features/022-rich-answers-and-structured-result-widgets/F022-06-shopping-travel-and-booking.md), [F022-07](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Detail: The assistant cannot show reservation times or book a table.
- Evidence: searched: reservation, opentable, resy in src, app

## CMP-M36

**Shopping: product cards, buyer's guide, comparison, image search, try-on**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F022-02](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md), [F022-04](../../20-features/022-rich-answers-and-structured-result-widgets/F022-04-maps-and-places.md), [F022-05](../../20-features/022-rich-answers-and-structured-result-widgets/F022-05-live-information-cards-weather-sports-markets-comp.md), [F022-06](../../20-features/022-rich-answers-and-structured-result-widgets/F022-06-shopping-travel-and-booking.md), [F022-07](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Detail: The app has no shopping results, buyer's guides or try-on.
- Evidence: searched: shopping, productCard, tryOn in src, app

## CMP-M37

**Switch a chart between static image and interactive**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F021-09](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md), [F022-03](../../20-features/022-rich-answers-and-structured-result-widgets/F022-03-charts-and-chart-data.md)
- Detail: Charts do not have a static or interactive switch.
- Evidence: searched: interactive chart, switch to interactive in src/features/chat

## CMP-M39

**Weather card in chat**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F022-02](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md), [F022-04](../../20-features/022-rich-answers-and-structured-result-widgets/F022-04-maps-and-places.md), [F022-05](../../20-features/022-rich-answers-and-structured-result-widgets/F022-05-live-information-cards-weather-sports-markets-comp.md), [F022-06](../../20-features/022-rich-answers-and-structured-result-widgets/F022-06-shopping-travel-and-booking.md), [F022-07](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Detail: Weather is answered as text; there is no weather card.
- Evidence: searched: weather in src, app, packages used by chat

## CMP-M40

**Writing blocks: editable drafts with send-email or save to Library**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F022-07](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Detail: Drafts appear as normal text with no editable block or send-by-email action.
- Evidence: searched: writing block, editable draft, send email draft in src/features/chat

## CMP-MP25

**Inline web images with source links in answers**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F022-02](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md)
- Detail: The answer does not add sourced web images Remote images render in markdown, but the answer does not add sourced web images.
- Evidence: src/features/chat/components/MarkdownImage.tsx:5

## CMP-W77

**Inline web images with source attribution**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F022-02](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md), [F036-01](../../20-features/036-sources-and-grounding-interface/F036-01-inline-citation-markers.md), [F036-02](../../20-features/036-sources-and-grounding-interface/F036-02-source-card-details.md), [F036-03](../../20-features/036-sources-and-grounding-interface/F036-03-source-link-and-type-icon.md), [F036-06](../../20-features/036-sources-and-grounding-interface/F036-06-conflicting-source-presentation.md), [F036-07](../../20-features/036-sources-and-grounding-interface/F036-07-unavailable-restricted-and-stale-source-notices.md), [F036-08](../../20-features/036-sources-and-grounding-interface/F036-08-source-correction-and-replacement.md)
- Detail: Answers show source cards and generated images but no web images from search.
- Evidence: searched: webImages, image attribution in apps/web/features/chat, packages/ui/unified-chat/src

## CMP-W78

**Interactive learning modules for math and science**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F022-10](../../20-features/022-rich-answers-and-structured-result-widgets/F022-10-study-cards-and-quizzes.md)
- Detail: We have a study page but no manipulable formula modules.
- Evidence: apps/web/features/study/components/StudyPage.tsx; searched: learning module in apps/web/features

## CMP-W80

**Recipe cards with serving changes and cooking mode**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F022-02](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md), [F022-04](../../20-features/022-rich-answers-and-structured-result-widgets/F022-04-maps-and-places.md), [F022-05](../../20-features/022-rich-answers-and-structured-result-widgets/F022-05-live-information-cards-weather-sports-markets-comp.md), [F022-06](../../20-features/022-rich-answers-and-structured-result-widgets/F022-06-shopping-travel-and-booking.md), [F022-07](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Detail: No recipe card or cooking mode exists.
- Evidence: searched: recipe card, Get cooking in apps/web, packages/ui/unified-chat

## CMP-W83

**Weather visual**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F022-02](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md), [F022-04](../../20-features/022-rich-answers-and-structured-result-widgets/F022-04-maps-and-places.md), [F022-05](../../20-features/022-rich-answers-and-structured-result-widgets/F022-05-live-information-cards-weather-sports-markets-comp.md), [F022-06](../../20-features/022-rich-answers-and-structured-result-widgets/F022-06-shopping-travel-and-booking.md), [F022-07](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Detail: No weather visual; weather questions go to web search text.
- Evidence: apps/web/lib/web-search/required-search.ts:65; searched: weather in packages/ui/unified-chat

## CMP-WP64

**Ask for a visual with @Visualize or let the model choose**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F022-11](../../20-features/022-rich-answers-and-structured-result-widgets/F022-11-live-previews-and-embedded-apps.md)
- Detail: There is no tag to force one The model draws visuals when asked or when intent is detected, but there is no tag to force one.
- Evidence: apps/web/features/chat/lib/visual-intent.ts:98; apps/web/lib/prompts/chat-system-prompt.ts:686

## CMP-WP66

**Inline interactive visuals written by the model**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F022-11](../../20-features/022-rich-answers-and-structured-result-widgets/F022-11-live-previews-and-embedded-apps.md)
- Detail: Free-form model HTML opens in the artifact panel, not inline Host-built blocks (charts, controls, maps) render inline and can send a follow-up; free-form model HTML opens in the artifact panel, not inline.
- Evidence: apps/web/features/chat/components/messages/cards/answer-ui/answer-ui-follow-up.ts; SandboxedIframe is mounted only in artifacts/ArtifactPreview.tsx:3251,3643 and shared views

## CMP-WP67

**More chart types and a static or interactive switch**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F021-09](../../20-features/021-code-blocks-and-executable-code-presentation/F021-09-generated-files-and-plots.md), [F022-03](../../20-features/022-rich-answers-and-structured-result-widgets/F022-03-charts-and-chart-data.md)
- Detail: Charts cover bar, line, pie (donut) and scatter, with no area, histogram, box, radar or others and no static switch Charts cover bar, line, pie (donut) and scatter, with no area, histogram, box, radar or others and no static switch.
- Evidence: packages/contracts/types/src/chart-spec.ts:1-4

## CMP-WP68

**Third-party app UI inline in an answer**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F022-11](../../20-features/022-rich-answers-and-structured-result-widgets/F022-11-live-previews-and-embedded-apps.md)
- Detail: An app card renders inline, but few apps exist because connectors are Coming soon An app card renders inline, but few apps exist because connectors are Coming soon.
- Evidence: apps/web/features/chat/components/messages/cards/McpAppCard.tsx; packages/contracts/types/src/connector-release.ts:14

## CMP-WP71

**Send a writing block as a Gmail or Outlook draft**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F022-07](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Detail: Email blocks open the mail app by link or copy the text; draft cards need a connector, which is mostly Coming soon Email blocks open the mail app by link or copy the text; draft cards need a connector, which is mostly Coming soon.
- Evidence: packages/ui/unified-chat/src/components/markdown/EmailBlock.tsx:97-106; apps/web/features/chat/components/PluginDraftCard.tsx

## CMP-WP72

**Writing block full-screen editor with undo and redo, outline, save to Library and download**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F022-07](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Detail: There is no undo or redo of AI edits, no contents list and no save to Library A writing block can be opened larger, edited and its edit saved with the chat, but there is no undo or redo of AI edits, no contents list and no save to Library.
- Evidence: packages/ui/unified-chat/src/components/markdown/WritingBlock.tsx:74-80,100,143,173; searched: undo, redo, library in WritingBlock.tsx

## CMP-WP92

**Interactive visuals inside an answer, saved as an artifact or downloaded**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F022-11](../../20-features/022-rich-answers-and-structured-result-widgets/F022-11-live-previews-and-embedded-apps.md)
- Detail: None has a save-as-artifact or copy-as-image action Answers render interactive cards (steps, comparison, calculation) inline; none has a save-as-artifact or copy-as-image action.
- Evidence: apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:48; searched: artifact, Download in InteractiveCardBlock.tsx

## GAP-AREA022-LW05

**Image carousel item (S22.05) is a lightbox that pages through images. It is not an in-answer carousel, and no image-search provider is configured. The only search provider entry is a single web-search provider.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-022
- Detail: Area 22. Rich answers and structured result widgets
- Evidence: apps/web/features/chat/components/messages/MessageBubble.tsx:1896-1915; apps/web/lib/web-search/web-search-providers.json:2-8

## GAP-AREA022-LW06

**Map tiles fall back to a public development tile URL when the tile variable is unset. Production would use that URL unless the owner sets the variable.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-022
- Detail: Area 22. Rich answers and structured result widgets
- Evidence: apps/web/lib/maps/map-tile-provider.ts:16 and :19-27

## GAP-CAP-rich-content-rendering-04

**Tables that fit and scroll: Chrome comparison table row (S22.30) is missing; no row cap rule decided for terminal.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F020-05](../../20-features/020-markdown-and-text-rendering/F020-05-tables-and-table-actions.md), [F022-09](../../20-features/022-rich-answers-and-structured-result-widgets/F022-09-tables-diagrams-and-mind-maps.md)
- Requirement items: S20.15, S20.16, S22.30
- Detail: Claude partly, ChatGPT partly; AGI built

## GAP-CAP-rich-content-rendering-11

**Diagrams from Mermaid text: Extensions and CLI show no drawing; whether they show the source as fallback is not recorded.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F020-09](../../20-features/020-markdown-and-text-rendering/F020-09-right-to-left-text-and-fallback-blocks.md), [F022-09](../../20-features/022-rich-answers-and-structured-result-widgets/F022-09-tables-diagrams-and-mind-maps.md)
- Requirement items: S20.30, S22.31, S22.32, S22.33
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-rich-content-rendering-12

**Inline custom visuals written by the model: Asking by name is partial; save-as-artifact from a visual is partial; extensions have none.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F022-11](../../20-features/022-rich-answers-and-structured-result-widgets/F022-11-live-previews-and-embedded-apps.md)
- Requirement items: S22.36, S22.38
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-rich-content-rendering-14

**Charts in answers with data view: Histogram, box, heat map, area, radar, treemap, bubble, waterfall; PNG download; static/interactive switch; mobile switch.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F022-03](../../20-features/022-rich-answers-and-structured-result-widgets/F022-03-charts-and-chart-data.md)
- Requirement items: S22.08, S22.09
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-rich-content-rendering-15

**Cards, forms and interactive layouts in answers: Forms on mobile and extensions; state persistence across reload not recorded.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F020-09](../../20-features/020-markdown-and-text-rendering/F020-09-right-to-left-text-and-fallback-blocks.md), [F022-08](../../20-features/022-rich-answers-and-structured-result-widgets/F022-08-approvals-and-questions.md)
- Requirement items: S20.30, S22.28, S22.29
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-rich-content-rendering-17

**Citations and sources: CLI and VS Code; raw marker defect.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F022-01](../../20-features/022-rich-answers-and-structured-result-widgets/F022-01-citations-and-source-previews.md)
- Requirement items: S22.01, S22.02, S22.03
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-rich-content-rendering-18

**Inline web images with attribution: Web inline web images with source attribution.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F022-02](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md)
- Requirement items: S22.05
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-rich-content-rendering-20

**Place, map, weather, recipe and shopping cards: All topic cards except maps and comparison.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F022-02](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md), [F022-04](../../20-features/022-rich-answers-and-structured-result-widgets/F022-04-maps-and-places.md), [F022-05](../../20-features/022-rich-answers-and-structured-result-widgets/F022-05-live-information-cards-weather-sports-markets-comp.md), [F022-06](../../20-features/022-rich-answers-and-structured-result-widgets/F022-06-shopping-travel-and-booking.md), [F022-07](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Requirement items: S22.04, S22.10, S22.11, S22.12, S22.13, S22.14, S22.15, S22.16, S22.17, S22.18, S22.19, S22.20, S22.21, S22.22, S22.23, S22.24, S22.26, S22.27
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-CAP-rich-content-rendering-21

**Writing blocks and draft widgets: Undo/redo, outline, save to Library; mobile; message drafts.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F022-07](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Requirement items: S22.25, S22.26
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-rich-content-rendering-22

**Third-party app panels inside a reply: Release gate for connectors; mobile ledger marks missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F022-11](../../20-features/022-rich-answers-and-structured-result-widgets/F022-11-live-previews-and-embedded-apps.md)
- Requirement items: S22.37
- Detail: Claude yes, ChatGPT unknown; AGI partly built

## GAP-CAP-rich-content-rendering-24

**Interactive learning visuals: Formula-driven modules.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F022-10](../../20-features/022-rich-answers-and-structured-result-widgets/F022-10-study-cards-and-quizzes.md)
- Requirement items: S22.34, S22.35
- Detail: Claude unknown, ChatGPT yes; AGI not built

## GAP-CAP-rich-content-rendering-25

**Terminal and editor rendering: Open-in-full-view hand-off for unrendered parts; VS Code highlight.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F020-06](../../20-features/020-markdown-and-text-rendering/F020-06-math-formulas.md), [F021-01](../../20-features/021-code-blocks-and-executable-code-presentation/F021-01-language-label-and-syntax-colours.md), [F022-03](../../20-features/022-rich-answers-and-structured-result-widgets/F022-03-charts-and-chart-data.md)
- Requirement items: S20.19, S20.20, S21.01, S21.02, S22.08
- Detail: Claude yes, ChatGPT partly; AGI partly built

## GAP-F022-01-01

**CLI has no chips, preview or sources list**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-01](../../20-features/022-rich-answers-and-structured-result-widgets/F022-01-citations-and-source-previews.md)
- Detail: Affects: CLI users. Work needed: Decide the CLI form, render numbered sources from the stream
- Evidence: apps/cli/src/tui/markdown_renderer.rs:265-281 only appends (url)

## GAP-F022-01-02

**VS Code has a list but no chips or preview; the brief says missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-01](../../20-features/022-rich-answers-and-structured-result-widgets/F022-01-citations-and-source-previews.md)
- Detail: Affects: VS Code users; the brief is out of date. Work needed: Update the brief status and decide on chips
- Evidence: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4755

## GAP-F022-01-03

**Mobile preview is an alert, not a card**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-01](../../20-features/022-rich-answers-and-structured-result-widgets/F022-01-citations-and-source-previews.md)
- Detail: Affects: Mobile users. Work needed: Owner decision whether an alert meets the preview requirement
- Evidence: apps/mobile/src/features/chat/components/CitationChip.tsx:42-50

## GAP-F022-01-04

**Grounded redirect links expire in saved chats**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-01](../../20-features/022-rich-answers-and-structured-result-widgets/F022-01-citations-and-source-previews.md)
- Detail: Affects: All apps reopening old chats. Work needed: Resolve the redirect at save time on the server
- Evidence: packages/ui/unified-chat/src/components/markdown/citationPublisher.ts header

## GAP-F022-01-05

**Web chips fetch favicons from a third party**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-01](../../20-features/022-rich-answers-and-structured-result-widgets/F022-01-citations-and-source-previews.md)
- Detail: Affects: Web and Desktop privacy; Mobile avoids it by design. Work needed: Decide policy or proxy the icons
- Evidence: CitationChip.tsx:44-50 versus the comment in CollapsibleSources.tsx

## GAP-F022-01-06

**The draft's 'tap and hold' for touch is not in the code**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-01](../../20-features/022-rich-answers-and-structured-result-widgets/F022-01-citations-and-source-previews.md)
- Detail: Affects: Documentation. Work needed: None; corrected here
- Evidence: Mobile uses a plain tap (CitationChip.tsx:72-90)

## GAP-F022-01-NOTBUILT

**Citations and source previews: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F022-01](../../20-features/022-rich-answers-and-structured-result-widgets/F022-01-citations-and-source-previews.md)
- Requirement items: S22.01, S22.02, S22.03
- Detail: CLI: S22.01, S22.02, S22.03

## GAP-F022-02-01

**No image-search provider or key**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-02](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md)
- Detail: Affects: Web and Desktop image results. Work needed: Owner picks a provider; add provider entry and tool
- Evidence: apps/web/lib/web-search/web-search-providers.json:4-8; S22.05 unfinished note

## GAP-F022-02-02

**News cards missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-02](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md)
- Detail: Affects: All six apps. Work needed: Define a card kind, data source and renderers
- Evidence: No news card code found

## GAP-F022-02-03

**Video result cards missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-02](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md)
- Detail: Affects: All six apps. Work needed: Same as above
- Evidence: Only generated video playback at MessageBubble.tsx:3438

## GAP-F022-02-04

**Audio player missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-02](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md)
- Detail: Affects: All six apps. Work needed: Add a shared player and a source of audio
- Evidence: No audio element found in chat sources searched

## GAP-F022-02-05

**The brief says the mobile image carousel is missing but code exists**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-02](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md)
- Detail: Affects: Brief accuracy. Work needed: Update the brief; verify on device
- Evidence: AnswerMediaSurfaces.tsx:155

## GAP-F022-02-06

**Chrome and VS Code carousels not found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-02](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md)
- Detail: Affects: Chrome, VS Code and CLI users. Work needed: Decide scope
- Evidence: No carousel code in those apps' searched files

## GAP-F022-02-NOTBUILT

**Media results (news, images, video, audio): not built on Web, Desktop, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code
- Features: [F022-02](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md)
- Requirement items: S22.04, S22.05, S22.06, S22.07
- Detail: Web: S22.04, S22.06, S22.07; Desktop: S22.04, S22.06, S22.07; CLI: S22.04, S22.05, S22.06, S22.07; VS Code: S22.04, S22.05, S22.06, S22.07

## GAP-F022-02-PARTLY

**Media results (news, images, video, audio): partly built on Web, Desktop**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop
- Features: [F022-02](../../20-features/022-rich-answers-and-structured-result-widgets/F022-02-media-results-news-images-video-audio.md)
- Requirement items: S22.05
- Detail: Web S22.05: owner (lead ruling 2026-09-28): choose an image-search provider and key; the carousel code follows the choice | Desktop S22.05: owner (lead ruling 2026-09-28): choose an image-search provider and key; the carousel code follows the choice

## GAP-F022-03-01

**The truncation note mentions a JSON download that was not found**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-03](../../20-features/022-rich-answers-and-structured-result-widgets/F022-03-charts-and-chart-data.md)
- Detail: Affects: Web, Desktop. Work needed: Add the download or change the text
- Evidence: ChartArtifact.tsx truncation text versus controls

## GAP-F022-03-02

**No charts on CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-03](../../20-features/022-rich-answers-and-structured-result-widgets/F022-03-charts-and-chart-data.md)
- Detail: Affects: Those users. Work needed: Decide scope per app
- Evidence: Brief and no code found

## GAP-F022-03-03

**The draft said data download unverified; PNG exists, data export does not**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-03](../../20-features/022-rich-answers-and-structured-result-widgets/F022-03-charts-and-chart-data.md)
- Detail: Affects: Web. Work needed: Data export if required by S22.09
- Evidence: ChartArtifact.tsx:163

## GAP-F022-03-04

**Mobile chart source differs (mermaid-based)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-03](../../20-features/022-rich-answers-and-structured-result-widgets/F022-03-charts-and-chart-data.md)
- Detail: Affects: Mobile consistency. Work needed: Confirm the same data reaches both
- Evidence: ReportChart.tsx uses MermaidChart types

## GAP-F022-03-NOTBUILT

**Charts and chart data: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F022-03](../../20-features/022-rich-answers-and-structured-result-widgets/F022-03-charts-and-chart-data.md)
- Requirement items: S22.08, S22.09
- Detail: CLI: S22.08, S22.09; VS Code: S22.08, S22.09; Chrome: S22.08, S22.09

## GAP-F022-04-01

**Public development tiles are still the default**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-04](../../20-features/022-rich-answers-and-structured-result-widgets/F022-04-maps-and-places.md)
- Detail: Affects: Web, Desktop, Mobile, Chrome in production. Work needed: Owner picks a provider and sets the environment
- Evidence: apps/web/lib/maps/map-tile-provider.ts:11-16

## GAP-F022-04-02

**Map fence uses a fixed public tile address**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-04](../../20-features/022-rich-answers-and-structured-result-widgets/F022-04-maps-and-places.md)
- Detail: Affects: Web and Desktop fenced maps. Work needed: Route through the configured provider
- Evidence: packages/ui/unified-chat/src/components/markdown/AnswerSurface.tsx:155-162

## GAP-F022-04-03

**Places key not set and live check pending**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-04](../../20-features/022-rich-answers-and-structured-result-widgets/F022-04-maps-and-places.md)
- Detail: Affects: Web, Desktop, Mobile place cards. Work needed: Create the key and verify
- Evidence: S22.11 unfinished note in the area brief

## GAP-F022-04-04

**Mobile maps only in Managed Cloud**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-04](../../20-features/022-rich-answers-and-structured-result-widgets/F022-04-maps-and-places.md)
- Detail: Affects: Mobile Local and own-key users. Work needed: Decide whether Local needs a map
- Evidence: apps/mobile/src/features/chat/components/MessageBubble.tsx:2462

## GAP-F022-04-05

**Chrome lacks places.v1**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-04](../../20-features/022-rich-answers-and-structured-result-widgets/F022-04-maps-and-places.md)
- Detail: Affects: Chrome users. Work needed: Add a place card builder
- Evidence: apps/extension/src/features/side-panel/bubbles.ts:241-249

## GAP-F022-04-06

**The brief says mobile places are missing; code has PlacesCard**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-04](../../20-features/022-rich-answers-and-structured-result-widgets/F022-04-maps-and-places.md)
- Detail: Affects: Brief accuracy. Work needed: Update the brief and verify on device
- Evidence: apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:1137

## GAP-F022-04-NOTBUILT

**Maps and places: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F022-04](../../20-features/022-rich-answers-and-structured-result-widgets/F022-04-maps-and-places.md)
- Requirement items: S22.10, S22.11
- Detail: Mobile: S22.11; CLI: S22.10, S22.11; VS Code: S22.10, S22.11; Chrome: S22.11

## GAP-F022-04-PARTLY

**Maps and places: partly built on Web, Desktop, Mobile**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile
- Features: [F022-04](../../20-features/022-rich-answers-and-structured-result-widgets/F022-04-maps-and-places.md)
- Requirement items: S22.10, S22.11
- Detail: Web S22.10: owner: choose a map tile provider and set AGI_MAP_TILE_URL_TEMPLATE (apps/web/lib/maps/map-tile-provider.ts:93); live-check a map renders on web and in Electron (CSP img-src allows the tile host) | Web S22.11: owner: create a Google Places API key with billing and set GOOGLE_PLACES_API_KEY (apps/web/lib/config/optional-features.ts:118); live-check a place query | Desktop S22.10: owner: choose a map tile provider and set AGI_MAP_TILE_URL_TEMPLATE (apps/web/lib/maps/map-tile-provider.ts:93); live-check a map renders on web and in Electron (CSP img-src allows the tile host) | Desktop S22.11: owner: create a Google Places API key with billing and set GOOGLE_PLACES_API_KEY (apps/web/lib/config/optional-features.ts:118); live-check a place query

## GAP-F022-05-01

**No weather card**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-05](../../20-features/022-rich-answers-and-structured-result-widgets/F022-05-live-information-cards-weather-sports-markets-comp.md)
- Detail: Affects: All apps. Work needed: Data source, kind, renderers, tests
- Evidence: S22.12 missing; no code

## GAP-F022-05-02

**No sports schedule or score cards**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-05](../../20-features/022-rich-answers-and-structured-result-widgets/F022-05-live-information-cards-weather-sports-markets-comp.md)
- Detail: Affects: All apps. Work needed: Same
- Evidence: S22.13 and S22.14 missing

## GAP-F022-05-03

**No market price chart**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-05](../../20-features/022-rich-answers-and-structured-result-widgets/F022-05-live-information-cards-weather-sports-markets-comp.md)
- Detail: Affects: All apps. Work needed: Market data source; reuse the chart renderer (F022-03)
- Evidence: S22.15 missing

## GAP-F022-05-04

**No company summary card**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-05](../../20-features/022-rich-answers-and-structured-result-widgets/F022-05-live-information-cards-weather-sports-markets-comp.md)
- Detail: Affects: All apps. Work needed: Data source and card
- Evidence: S22.16 missing

## GAP-F022-05-05

**No flight status card**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-05](../../20-features/022-rich-answers-and-structured-result-widgets/F022-05-live-information-cards-weather-sports-markets-comp.md)
- Detail: Affects: All apps. Work needed: Flight data source and card
- Evidence: S22.20 missing

## GAP-F022-05-06

**No package tracking card**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-05](../../20-features/022-rich-answers-and-structured-result-widgets/F022-05-live-information-cards-weather-sports-markets-comp.md)
- Detail: Affects: All apps. Work needed: Carrier data source and card
- Evidence: S22.21 missing

## GAP-F022-05-NOTBUILT

**Live information cards (weather, sports, markets, company, flights, packages): not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F022-05](../../20-features/022-rich-answers-and-structured-result-widgets/F022-05-live-information-cards-weather-sports-markets-comp.md)
- Requirement items: S22.12, S22.13, S22.14, S22.15, S22.16, S22.20, S22.21
- Detail: Web: S22.12, S22.13, S22.14, S22.15, S22.16, S22.20, S22.21; Desktop: S22.12, S22.13, S22.14, S22.15, S22.16, S22.20, S22.21; Mobile: S22.12, S22.13, S22.14, S22.15, S22.16, S22.20, S22.21; CLI: S22.12, S22.13, S22.14, S22.15, S22.16, S22.20, S22.21; VS Code: S22.12, S22.13, S22.14, S22.15, S22.16, S22.20, S22.21; Chrome: S22.12, S22.13, S22.14, S22.15, S22.16, S22.20, S22.21

## GAP-F022-06-01

**No availability data in product cards**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-06](../../20-features/022-rich-answers-and-structured-result-widgets/F022-06-shopping-travel-and-booking.md)
- Detail: Affects: All apps. Work needed: Source of stock data, schema and UI
- Evidence: ProductComparisonProduct fields (interactive-cards.ts:351-360)

## GAP-F022-06-02

**Reservation choices missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-06](../../20-features/022-rich-answers-and-structured-result-widgets/F022-06-shopping-travel-and-booking.md)
- Detail: Affects: All apps. Work needed: Booking source, card kind, consent flow
- Evidence: S22.22; no code

## GAP-F022-06-03

**Calendar availability grid missing**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-06](../../20-features/022-rich-answers-and-structured-result-widgets/F022-06-shopping-travel-and-booking.md)
- Detail: Affects: All apps. Work needed: Calendar connector data and grid card
- Evidence: S22.23; no code

## GAP-F022-06-04

**Brief out of date for itinerary and mobile and Chrome comparison**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-06](../../20-features/022-rich-answers-and-structured-result-widgets/F022-06-shopping-travel-and-booking.md)
- Detail: Affects: Documentation. Work needed: Update the brief; live-check each app
- Evidence: InteractiveCardBlock.tsx:38-55; interactiveCards.ts:109,316

## GAP-F022-06-05

**Desktop Tauri is not a cards path; Electron shows hosted web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-06](../../20-features/022-rich-answers-and-structured-result-widgets/F022-06-shopping-travel-and-booking.md)
- Detail: Affects: Desktop. Work needed: Live check in Electron
- Evidence: doc: docs/product/definition.md:452

## GAP-F022-06-06

**Cards absent in Local and own-key chat**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-06](../../20-features/022-rich-answers-and-structured-result-widgets/F022-06-shopping-travel-and-booking.md)
- Detail: Affects: Local and own-key users. Work needed: Decide whether local tools should produce cards
- Evidence: Cards come from the server tool loop (request-processor.ts:1403)

## GAP-F022-06-NOTBUILT

**Shopping, travel and booking: not built on Web, Desktop, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code
- Features: [F022-06](../../20-features/022-rich-answers-and-structured-result-widgets/F022-06-shopping-travel-and-booking.md)
- Requirement items: S22.17, S22.18, S22.19, S22.22, S22.23
- Detail: Web: S22.18, S22.19, S22.22, S22.23; Desktop: S22.18, S22.19, S22.22, S22.23; CLI: S22.17, S22.18, S22.19, S22.22, S22.23; VS Code: S22.17, S22.18, S22.19, S22.22, S22.23

## GAP-F022-07-01

**No Send action on the email widget.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-07](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Detail: Affects: All apps. Work needed: Design send through a connected mail account with an approval card; define entitlement and audit.
- Evidence: EmailBlock.tsx:123-158; DraftSurfaces.tsx:448-459

## GAP-F022-07-02

**Contact cards not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-07](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Detail: Affects: All six apps. Work needed: Add card kind to contracts, renderers on each app, and a prompt or tool that produces it.
- Evidence: No contact kind in assistantFence.ts:82-141 or InteractiveCardBlock.tsx:38-51

## GAP-F022-07-03

**Task and issue cards not built.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-07](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Detail: Affects: All six apps. Work needed: Add card kind fed by Linear/GitHub/Jira connector results; open-link action.
- Evidence: Same as above; no issue card in the registry

## GAP-F022-07-04

**Message drafts have no send, only copy and (mobile) share.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-07](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Detail: Affects: Web, desktop, mobile, VS Code, Chrome. Work needed: Decide send targets (chat, SMS, Slack) and wire through connectors.
- Evidence: WritingBlock.tsx; assistantFence.ts:530-535

## GAP-F022-07-05

**Brief status is out of date: it says email missing on CLI/VS Code/Chrome and message drafts missing everywhere, while code shows copy-only cards in VS Code and Chrome and writing cards on web and mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-07](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Detail: Affects: Brief accuracy. Work needed: Update the brief; live-check VS Code and Chrome.
- Evidence: render.ts:60-70; markdown.ts:191

## GAP-F022-07-06

**CLI has no email or draft card.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-07](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Detail: Affects: CLI. Work needed: Render the fence as a boxed block in the terminal.
- Evidence: no email handling in apps/cli/src/tui/markdown_renderer.rs

## GAP-F022-07-NOTBUILT

**Drafts, contacts and tasks: not built on Web, Desktop, CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI
- Features: [F022-07](../../20-features/022-rich-answers-and-structured-result-widgets/F022-07-drafts-contacts-and-tasks.md)
- Requirement items: S22.24, S22.25, S22.26, S22.27
- Detail: Web: S22.24, S22.26, S22.27; Desktop: S22.24, S22.26, S22.27; CLI: S22.24, S22.25, S22.26, S22.27

## GAP-F022-08-01

**VS Code question card handles one question at a time, not the multi-question form.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-08](../../20-features/022-rich-answers-and-structured-result-widgets/F022-08-approvals-and-questions.md)
- Detail: Affects: VS Code. Work needed: Render the clarify.v1 body fully in the VS Code webview.
- Evidence: webviewContent.ts:7262-7360

## GAP-F022-08-02

**CLI has no model-driven question form; the overlay serves MCP elicitation only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-08](../../20-features/022-rich-answers-and-structured-result-widgets/F022-08-approvals-and-questions.md)
- Detail: Affects: CLI. Work needed: Decide whether the clarify tool is offered in the CLI and render it.
- Evidence: elicitation_overlay.rs:1-25

## GAP-F022-08-03

**Brief is out of date on mobile, VS Code and Chrome questionnaires.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-08](../../20-features/022-rich-answers-and-structured-result-widgets/F022-08-approvals-and-questions.md)
- Detail: Affects: Brief accuracy. Work needed: Update brief; live-check each app.
- Evidence: mobile InteractiveCardBlock.tsx:1077; webviewContent.ts:7262; bubbles.ts:245

## GAP-F022-08-04

**Surface matrix marks CLI approvals 'unverified'.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-08](../../20-features/022-rich-answers-and-structured-result-widgets/F022-08-approvals-and-questions.md)
- Detail: Affects: CLI. Work needed: Run a CLI session and record the result.
- Evidence: doc: docs/product/surface-feature-matrix.md:397

## GAP-F022-08-05

**No Local-mode path for question cards.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-08](../../20-features/022-rich-answers-and-structured-result-widgets/F022-08-approvals-and-questions.md)
- Detail: Affects: Mobile and desktop Local mode. Work needed: Decide if local models should offer a clarify tool.
- Evidence: clarify-tool-service.ts is server-only

## GAP-F022-08-NOTBUILT

**Approvals and questions: not built on Mobile, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, VS Code, Chrome
- Features: [F022-08](../../20-features/022-rich-answers-and-structured-result-widgets/F022-08-approvals-and-questions.md)
- Requirement items: S22.29
- Detail: Mobile: S22.29; VS Code: S22.29; Chrome: S22.29

## GAP-F022-09-01

**No Mermaid drawing on CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-09](../../20-features/022-rich-answers-and-structured-result-widgets/F022-09-tables-diagrams-and-mind-maps.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Draw via shared component or provide an image/ASCII fallback.
- Evidence: Mermaid referenced only in artifact type maps (artifactPresentation.ts:15; artifacts.rs:45)

## GAP-F022-09-02

**No zoom beyond Expand.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-09](../../20-features/022-rich-answers-and-structured-result-widgets/F022-09-tables-diagrams-and-mind-maps.md)
- Detail: Affects: Web, desktop, mobile. Work needed: Add pinch/wheel zoom.
- Evidence: MermaidDiagram.tsx:316-345

## GAP-F022-09-03

**Chrome table support unverified; brief says missing but sanitizer allows tables.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-09](../../20-features/022-rich-answers-and-structured-result-widgets/F022-09-tables-diagrams-and-mind-maps.md)
- Detail: Affects: Chrome. Work needed: Live-check in the side panel and add a test.
- Evidence: markdown.ts:71

## GAP-F022-09-04

**Mind map and timeline are not distinct features, only Mermaid kinds; model must emit valid Mermaid.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-09](../../20-features/022-rich-answers-and-structured-result-widgets/F022-09-tables-diagrams-and-mind-maps.md)
- Detail: Affects: All drawing apps. Work needed: Decide whether to add prompts or validation per kind.
- Evidence: no mind map code found

## GAP-F022-09-NOTBUILT

**Tables, diagrams and mind maps: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F022-09](../../20-features/022-rich-answers-and-structured-result-widgets/F022-09-tables-diagrams-and-mind-maps.md)
- Requirement items: S22.31, S22.32, S22.33
- Detail: CLI: S22.31, S22.32, S22.33; VS Code: S22.31, S22.32, S22.33

## GAP-F022-10-01

**Brief says missing, code says built on web and mobile; the brief needs correction.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-10](../../20-features/022-rich-answers-and-structured-result-widgets/F022-10-study-cards-and-quizzes.md)
- Detail: Affects: Brief accuracy. Work needed: Update the brief and live-check.
- Evidence: ArtifactPreview.tsx:1922; StudyDocumentView.tsx

## GAP-F022-10-02

**Web shows study sets in the artifact panel, not inline in the chat bubble.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-10](../../20-features/022-rich-answers-and-structured-result-widgets/F022-10-study-cards-and-quizzes.md)
- Detail: Affects: Web, desktop. Work needed: Inline the study components in the chat message renderer.
- Evidence: no quiz handling under apps/web/features/chat/components/messages

## GAP-F022-10-03

**No study views on CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-10](../../20-features/022-rich-answers-and-structured-result-widgets/F022-10-study-cards-and-quizzes.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Add at least a readable text rendering of the set.
- Evidence: no quiz code in those apps

## GAP-F022-10-04

**Progress is not saved.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-10](../../20-features/022-rich-answers-and-structured-result-widgets/F022-10-study-cards-and-quizzes.md)
- Detail: Affects: Web, mobile. Work needed: Decide whether to store scores.
- Evidence: component state only

## GAP-F022-10-NOTBUILT

**Study cards and quizzes: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F022-10](../../20-features/022-rich-answers-and-structured-result-widgets/F022-10-study-cards-and-quizzes.md)
- Requirement items: S22.34, S22.35
- Detail: CLI: S22.34, S22.35; VS Code: S22.34, S22.35; Chrome: S22.34, S22.35

## GAP-F022-11-01

**Mobile MCP apps are text only.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-11](../../20-features/022-rich-answers-and-structured-result-widgets/F022-11-live-previews-and-embedded-apps.md)
- Detail: Affects: Mobile. Work needed: Add a web view with the app bridge and approvals, or keep it text and mark the brief partial.
- Evidence: cards/McpAppCard.tsx:48-54

## GAP-F022-11-02

**No live preview or MCP app on CLI, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-11](../../20-features/022-rich-answers-and-structured-result-widgets/F022-11-live-previews-and-embedded-apps.md)
- Detail: Affects: CLI, VS Code, Chrome. Work needed: Decide whether to link out to the web app.
- Evidence: bubbles.ts:243-249

## GAP-F022-11-03

**Brief code citations for S22.36 and S22.38 point at unrelated lines.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-11](../../20-features/022-rich-answers-and-structured-result-widgets/F022-11-live-previews-and-embedded-apps.md)
- Detail: Affects: Brief accuracy. Work needed: Replace with SandboxedIframe.tsx and artifact-render.ts.
- Evidence: ArtifactPreview.tsx:241,511-530

## GAP-F022-11-04

**Dedicated sandbox origin depends on configuration; without it the srcdoc fallback is used.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-11](../../20-features/022-rich-answers-and-structured-result-widgets/F022-11-live-previews-and-embedded-apps.md)
- Detail: Affects: Web, desktop. Work needed: Confirm the production value is set (owner knowledge; value not recorded).
- Evidence: artifact-sandbox.ts:159-175

## GAP-F022-11-05

**No record that the preview runs scripts on desktop (Electron) with the real CSP.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F022-11](../../20-features/022-rich-answers-and-structured-result-widgets/F022-11-live-previews-and-embedded-apps.md)
- Detail: Affects: Desktop. Work needed: Run the scenarios on the Electron app.
- Evidence: no record found

## GAP-F022-11-NOTBUILT

**Live previews and embedded apps: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F022-11](../../20-features/022-rich-answers-and-structured-result-widgets/F022-11-live-previews-and-embedded-apps.md)
- Requirement items: S22.36, S22.37, S22.38
- Detail: Mobile: S22.37; CLI: S22.36, S22.37, S22.38; VS Code: S22.36, S22.37, S22.38; Chrome: S22.36, S22.37, S22.38
