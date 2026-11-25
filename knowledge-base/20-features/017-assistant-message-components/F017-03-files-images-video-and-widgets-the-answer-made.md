---
id: "F017-03"
type: "feature"
title: "Files, images, video and widgets the answer made"
aliases: ["Files, images, video and widgets the answer made", "Generated-file cards", "Deliverable cards", "Artifact launch cards", "Image results", "Video results", "Interactive widgets", "Interactive cards", "S17.08", "S17.09", "S17.10", "S17.11", "S17.12", "S17.13"]
area: "17 Assistant-message components"
available_on: ["web", "desktop", "mobile", "cli", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S17.08", "S17.09", "S17.10", "S17.11", "S17.12", "S17.13"]
depends_on: ["surface:web", "surface:mobile", "surface:chrome", "surface:cli", "surface:vscode", "SYS-files-artifacts-and-storage", "SYS-voice-and-media", "SYS-model-catalog-and-routing"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F017-03 Files, images, video and widgets the answer made

Shows files, artifacts, images, videos and interactive cards the assistant produced, inside the answer. Web, mobile and Chrome cover most kinds. The CLI covers files and images. VS Code is weak. No app plays generated audio inline: no audio player was found in any answer component.

Area: [17. Assistant-message components](README.md). Requirement items: [S17.08](../../10-requirements/capabilities/017-assistant-message-components.md#s1708), [S17.09](../../10-requirements/capabilities/017-assistant-message-components.md#s1709), [S17.10](../../10-requirements/capabilities/017-assistant-message-components.md#s1710), [S17.11](../../10-requirements/capabilities/017-assistant-message-components.md#s1711), [S17.12](../../10-requirements/capabilities/017-assistant-message-components.md#s1712), [S17.13](../../10-requirements/capabilities/017-assistant-message-components.md#s1713).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Turns made things into things you can open: file cards to download, artifact cards to open the viewer, images to view and download, videos to play, and cards with buttons or sliders.

**Why it exists.** The assistant produces work products, not only text; people need to open and keep them.

**Who uses it.** People generating documents, images, video or using interactive answers.

**Problems it solves**

- Files lost inside text
- Artifacts hard to reopen
- Long video jobs that outlive the page

**Use cases**

- Click a deliverable card to download a file.
- Open an inline artifact card to view it in the panel.
- Play a generated video and download it.
- Pick a choice on an interactive card.

## 2. User experience

**Where to find it**

- Web and Desktop: deliverable cards (aria-label from DELIVERABLES_LABEL, MessageBubble.tsx:3162-3181); inline artifact cards (3206); image generation card (3286); video player (3438-3466); interactive cards via InteractiveCardBlock.tsx.
- Mobile: GeneratedFileCard.tsx, InlineArtifactCard.tsx, GeneratedImage.tsx, GeneratedVideo.tsx, InteractiveCardBlock.tsx in apps/mobile/src/features/chat/components; image opens ImageFullScreen (MessageBubble.tsx:3205).
- CLI: generated files and images in the TUI (tui_app.rs near 6019 and 3278 per brief; not opened).
- Chrome: generatedFiles.ts builds file, artifact and video items (373 video element; 23 surface artifact or file).
- VS Code: no generated-file or artifact cards found.

**Before you start**

- The turn created a file, artifact, image, video or card.
- Video and image generation use the media-generation flow.

**Screens and controls**

- Web file card is a link with download and a title Download <name> (DeliverableCard.tsx:42-52); lightbox has zoom and download (MessageBubble.tsx:3186-3191).
- Web video: native controls, aria-label Generated video, overlay Download video link (3438-3466); load failure shows Retry (up to a limit) and Download video (3398-3425).
- Web video in progress: Your video is still being generated with Resume checking (3308-3338); failed: Try video again (3346-3369).

**Journey**

1. Person asks for a file, image, video or interactive answer.
2. While it generates, a placeholder or progress card shows.
3. The result card appears in the answer.
4. Person opens, plays, downloads or operates it.

**What the person sees and gets**

- Office files too large to preview show a status line (MessageBubble.tsx:3149-3160).
- Interrupted artifact notice with a Regenerate action (3246-3270).

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web: file deliverable cards, inline artifact cards, image card and lightbox, video player with retry and download, resume and retry for long video jobs, interactive cards (MessageBubble.tsx:3162-3471; InteractiveCardBlock.tsx).
- Mobile: file, artifact, image, video and interactive components exist and are mounted (component list; video retry at MessageBubble.tsx:2569; image use at 2528-2544).
- Chrome: files, artifacts and a video element in generatedFiles.ts (373), and interactive cards in bubbles.ts (141, 221).

**Incomplete**

- CLI video not found; CLI image handling not opened in detail.
- VS Code has no file or artifact cards (not found).

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Audio playback inline: a search for audio elements and players in web MessageBubble, mobile MessageBubble, Chrome generatedFiles, CLI tui_app and VS Code webviewContent found nothing (search run in this session). Not available on any app.

## 4. Required behaviour

**Established requirements**

- Files the assistant produced appear as cards with name and type and open or download. (source: brief S17.08)
- An answer that created an artifact shows a card that opens the viewer or panel. (source: brief S17.09)
- Images render inline and can be viewed or downloaded. (source: brief S17.10)
- Generated audio plays inline with playback controls. (source: brief S17.11 (missing on every app))
- Videos play inline with controls and download. (source: brief S17.12)
- Interactive widgets can be operated in place. (source: brief S17.13)
- Copy, download and export actions are required for artifacts. (source: doc: docs/product/requirements.md)

**Acceptance criteria**

1. A generated file on web shows a card with name, type line and size, and clicking downloads it.
2. An artifact answer shows an inline card; clicking opens the artifact panel.
3. A generated video plays with controls and Download video saves it.
4. If the video file fails to load, Video failed to load appears with Download video.
5. A choice on an interactive card updates the answer in place.
6. No inline audio control exists (documents the gap).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The CLI should show a path or file reference for generated files [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an inline audio player to the shared answer renderer.
- [proposed] Add file and artifact cards to the VS Code webview.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | DeliverableCard | `apps/web/features/chat/components/messages/DeliverableCard.tsx` | Downloadable file card. |
| component | InlineArtifactCards | `apps/web/features/chat/components/artifacts/InlineArtifactCards.tsx` | Artifact thumbnail cards that open the panel. |
| component | ImageGenerationCard | `apps/web/features/chat/components/ImageGenerationCard.tsx` | Generated image card with regenerate. |
| component | ImageLightbox | `apps/web/features/chat/components/ImageLightbox.tsx` | Full-size viewer with zoom and download. |
| component | MediaGenerationPlaceholder | `apps/web/features/chat/components/messages/MediaGenerationPlaceholder.tsx` | Progress placeholder. |
| component | InteractiveCardBlock | `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx` | Operable cards. |
| component | MessageBubble (web) media blocks | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Video block 3394-3471 and file and artifact blocks 3149-3208. |
| component | GeneratedFileCard / InlineArtifactCard / GeneratedVideo | `apps/mobile/src/features/chat/components/GeneratedFileCard.tsx` | Mobile file card; siblings InlineArtifactCard.tsx, GeneratedVideo.tsx, GeneratedImage.tsx. |
| component | InteractiveCardBlock (mobile) | `apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx` | Mobile interactive cards. |
| component | Chrome generated files | `apps/extension/src/features/side-panel/generatedFiles.ts` | Builds file, artifact and video items (buildAnswerFiles at 438, video at 373). |
| component | Chrome interactive cards | `apps/extension/src/features/side-panel/interactiveCards.ts` | Interactive cards in the panel (file name only). |
| service | generatedFileArtifacts | `apps/mobile/src/features/chat/utils/generatedFileArtifacts.ts` | Reads generated file metadata into artifacts (imported MessageBubble.tsx:236). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A tool or generation route returns file, image or video metadata and URLs that are stored on the assistant message. | our servers | message.metadata.generatedFiles, imageUrl, videoUrl read at MessageBubble.tsx:2392-2396 |
| The bubble builds deliverable and artifact lists from that metadata. | device | MessageBubble.tsx:1874, 1917 |
| Long video jobs are tracked by a task id; the page can resume checking. | our servers | MessageBubble.tsx:3301-3338 |
| Download and playback fetch the stored URL from storage. | outside service | video src and download href use videoUrl (MessageBubble.tsx:3440-3454); storage host unknown |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Generated file, image and video records and URLs | Message metadata; file storage location not opened (SYS-files-artifacts-and-storage) | Cloud chats yes [inferred] | unknown |

**Models and providers.** Image and video come from media-generation models picked in the catalog; the image card shows the model label (MessageBubble.tsx:3293). Which providers serve media was not studied.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Generated media needs the cloud route; sign-in rules not studied. |
| Permissions | none found in the code |
| Subscription | Media generation gating was not opened. Web disables the generic Regenerate button for image and video turns (MessageBubble.tsx:3869-3870). |
| Limits and metering | unknown |
| Feature flags | none found in the code |
| Model compatibility | Only image and video models create these results. |
| Provider restrictions | unknown |
| Local mode | unknown for media. Mobile saves local artifacts with local provenance (MessageBubble.tsx:1564-1566 for documents). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Video queued or processing | Status card with progress and Resume checking. | MessageBubble.tsx:3301-3338 |
| Video start not confirmed | Advises reloading once. | MessageBubble.tsx:3373-3391 |
| Video failed | Try video again only when retryable. | MessageBubble.tsx:3341-3371 |
| Video file will not load | Retry button up to a limit, plus Download video. | MessageBubble.tsx:3398-3425 |
| Office preview too large | Status line. | MessageBubble.tsx:3149-3160 |
| Audio | Not handled in the code. | search of the answer components named above found no audio element or player |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/ImageGenerationCard.test.tsx`: Image card (from file name).
- `apps/web/features/chat/components/artifacts/InlineArtifactCards.test.tsx`: Artifact cards (from file name).
- `apps/web/features/chat/components/messages/InteractiveCardBlock.test.tsx`: Interactive cards (from file name).
- `apps/web/features/chat/components/messages/__tests__/MediaGenerationPlaceholder.test.tsx`: Placeholder (from file name).
- `apps/web/features/chat/components/messages/__tests__/MessageBubble.interruptedArtifact.test.tsx`: Interrupted artifact notice (from file name).
- `apps/mobile/src/features/chat/components/__tests__/MessageList.videoRetry.test.tsx`: Mobile video retry (from file name).
- `apps/mobile/src/features/chat/components/__tests__/InteractiveCardBlock.carousel.test.tsx`: Mobile card carousel (from file name).

**Test scenarios**

- **Download a file**
  1. Ask for a document file.
  2. Click the card.
  - Expected: The file downloads under its name.
- **Video play and fail**
  1. Generate a video.
  2. Play it, then block the URL.
  - Expected: Controls work; on failure Video failed to load with Download video.
- **Resume a video job**
  1. Start a long video, leave the chat, return.
  - Expected: Resume checking is offered until done.
- **Interactive card**
  1. Ask for a choice card, pick an option.
  - Expected: The card updates in place.
- **No audio**
  1. Ask for speech audio output.
  - Expected: No inline player exists; confirms the gap.

**Where to look when it fails**

- Metadata keys toolType, videoStatus, videoTaskId, videoUrl, videoError (MessageBubble.tsx:3286-3396).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/017-assistant-message-components.md](../../70-qa/test-plans/web/017-assistant-message-components.md)
- Desktop: [70-qa/test-plans/desktop/017-assistant-message-components.md](../../70-qa/test-plans/desktop/017-assistant-message-components.md)
- Mobile: [70-qa/test-plans/mobile/017-assistant-message-components.md](../../70-qa/test-plans/mobile/017-assistant-message-components.md)
- CLI: [70-qa/test-plans/cli/017-assistant-message-components.md](../../70-qa/test-plans/cli/017-assistant-message-components.md)
- Chrome: [70-qa/test-plans/chrome/017-assistant-message-components.md](../../70-qa/test-plans/chrome/017-assistant-message-components.md)

## 10. Gaps and dependencies

- **Inline audio results do not exist anywhere.** Affects: All six apps. Evidence: no audio element found in answer components; brief S17.11 missing. Work needed: Add an audio player block to the shared renderer and each surface.
- **VS Code has no file, artifact or image cards.** Affects: VS Code users. Evidence: brief S17.08 to S17.10; none found in webviewContent.ts greps. Work needed: Add cards in the webview.
- **CLI video missing.** Affects: CLI users. Evidence: brief S17.12. Work needed: Print a link or path for video.
- Not built on: VS Code (from the capability ledger).

**Depends on**

- surface:web
- surface:mobile
- surface:chrome
- surface:cli
- surface:vscode
- SYS-files-artifacts-and-storage
- SYS-voice-and-media
- SYS-model-catalog-and-routing

## Unknown

- How the CLI renders generated files and images (tui_app.rs not opened at those spots).
- Where generated media is stored and for how long.
- Subscription gating for image and video generation.
- How mobile handles video download.
