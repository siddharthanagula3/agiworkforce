---
id: "F022-02"
type: "feature"
title: "Media results (news, images, video, audio)"
aliases: ["Media results", "Image carousel", "Gallery", "Image lightbox", "News cards", "Video result cards", "Audio players", "S22.04", "S22.05", "S22.06", "S22.07"]
area: "22 Rich answers and structured result widgets"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "missing", vscode: "missing", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S22.04", "S22.05", "S22.06", "S22.07"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "SYS-voice-and-media", "surface:web", "surface:desktop", "surface:mobile", "surface:chrome", "file:packages/ui/unified-chat/src/components/markdown/AnswerGallery.tsx"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F022-02 Media results (news, images, video, audio)

News, video and audio result cards do not exist. Images are partly built: a paging carousel and a gallery render when the answer writes carousel or gallery blocks, and Web has a lightbox that pages through a message's images. Nothing feeds them from an image-search provider, which still needs an owner decision.

Area: [22. Rich answers and structured result widgets](README.md). Requirement items: [S22.04](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2204), [S22.05](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2205), [S22.06](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2206), [S22.07](../../10-requirements/capabilities/022-rich-answers-and-structured-result-widgets.md#s2207).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Shows pictures from an answer as a pageable carousel, a grid gallery or a full-screen lightbox. Generated video has an inline player on Web. News, video-result and audio cards are not built.

**Why it exists.** Leading assistants show media results inside the answer. The brief lists news cards, image carousels, video cards and audio players (S22.04 to S22.07) so a person need not leave the chat to look at media.

**Who uses it.** Web and Desktop (Electron hosted web) users; Mobile users for fenced carousel and gallery.

**Problems it solves**

- Looking through several images without leaving the answer.
- A broken image slot in the middle of paging (failed images are skipped).
- Model-written image links that could leak chat data (cross-origin images need a click).

**Use cases**

- Ask for example images the model lists in a carousel block; page with Previous and Next or the arrow keys.
- Click an attached or generated image and page through the other images of the same message in the lightbox.
- Play a generated video inline on Web.

## 2. User experience

**Where to find it**

- Web and Desktop: carousel and gallery inside the answer (packages/ui/unified-chat/src/components/markdown/AnswerGallery.tsx:50,94), image lightbox from thumbnails in a message (apps/web/features/chat/components/messages/MessageBubble.tsx:3187), generated video player labelled 'Generated video' (MessageBubble.tsx:3444).
- Mobile: carousel with 'Previous' and 'Next' and gallery (apps/mobile/src/features/chat/components/AnswerMediaSurfaces.tsx:94,155); full-screen viewer ImageFullScreen.tsx exists, not opened.
- Chrome: an image viewer dialog for answer images (apps/extension/src/features/side-panel/mediaViewer.ts:8).
- CLI and VS Code: none found.

**Before you start**

- The answer must contain a carousel or gallery block, or message attachments or generated images. No search feed supplies them today.

**Screens and controls**

- Carousel: title, one slide with image, heading and text, Previous and Next buttons, status text '1 of N', Home, End and arrow keys (AnswerGallery.tsx:105-190).
- Gallery: grid of figures with captions, 'Open image' link and 'Copy URL' button per image (AnswerGallery.tsx:11-48).
- Web lightbox: opens on a thumbnail click and pages the message's images.
- Cross-origin image: placeholder until the person agrees; a failed image shows 'Image unavailable' with 'Retry image' (packages/ui/unified-chat/src/components/markdown/ImageTrust.tsx:23-60).

**Journey**

1. Model writes a carousel or gallery block (or the message has images).
2. App parses the block (limits of 64 items, 100,000 characters of source) and draws it.
3. Person pages through slides or opens the lightbox.
4. Person opens the image in a new tab or copies its URL.

**What the person sees and gets**

- Slide counter announced politely to screen readers.
- 'Copied' or 'Copy failed' status after Copy URL.
- 'Image unavailable' tile on failure.

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Carousel with keyboard and button paging on Web and Desktop (AnswerGallery.tsx:94-190).
- Gallery grid with open and copy actions (AnswerGallery.tsx:50-92).
- Cross-origin image gating and retry (ImageTrust.tsx:23-60).
- Lightbox image set excludes attachments that failed to load (MessageBubble.tsx:1893-1912).
- Mobile carousel and gallery surfaces (AnswerMediaSurfaces.tsx:94,155) with a test file apps/mobile/src/features/chat/components/__tests__/InteractiveCardBlock.carousel.test.tsx.
- Web inline player for generated video (MessageBubble.tsx:3438-3450).
- The answer-ui card has a gallery block of up to 8 images (packages/contracts/types/src/answer-ui.ts:18).

**Incomplete**

- No image-search provider; the only search entry is the web search provider (apps/web/lib/web-search/web-search-providers.json:4-8). The brief says the owner must choose one (S22.05).
- Mobile viewer ImageFullScreen.tsx was not opened; behaviour unknown.

**Present but disconnected or switched off**

- The carousel and gallery code is connected to fenced blocks (AnswerSurface.tsx:225,369) but no tool produces them from search results [inferred]. The draft said only the lightbox exists; that was wrong.

**Not available**

- News cards: no code in any app (absence search over web chat, unified chat, mobile chat and contract types found no news card).
- Video result cards: none; only generated-video playback exists on Web.
- Audio player: no audio element or audio player found in the web chat, unified chat or mobile chat sources searched.
- CLI, VS Code: no media card code found.

## 4. Required behaviour

**Established requirements**

- News results render as cards with headline, outlet, date, image (missing on all apps). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.04)
- Image results render in a swipeable or pageable carousel; the owner must choose an image-search provider and key, and the carousel code follows the choice. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.05)
- Video results render as cards with thumbnail, title, duration and play or open. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.06)
- Audio in an answer plays in an inline audio player. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S22.07)
- Failed images are left out of the paging set so paging never lands on an empty slot. (source: apps/web/features/chat/components/messages/MessageBubble.tsx:1893-1899)

**Acceptance criteria**

1. Carousel Next is disabled on the last slide and Previous on the first.
2. Arrow, Home and End keys move slides.
3. A cross-origin image does not load until the person agrees, unless the message's own tool produced it.
4. A failed image shows 'Image unavailable' with Retry image.
5. The lightbox never opens on a failed attachment.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- News, video and audio cards need data sources that do not exist yet, so they depend on a provider decision [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Pick an image-search provider and add it as a second entry in the provider list.
- [proposed] Add a media-result card kind to the shared card kind list before building per-app renderers.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AnswerGallery and AnswerCarousel | `packages/ui/unified-chat/src/components/markdown/AnswerGallery.tsx` | Web and Desktop carousel and gallery |
| component | AnswerSurface | `packages/ui/unified-chat/src/components/markdown/AnswerSurface.tsx` | Dispatch by fence language (carousel :225, gallery :369) |
| service | answerSurfaces parsers | `packages/ui/unified-chat/src/components/markdown/answerSurfaces.ts` | parseCarousel, parseGallery, caps (64 items) |
| component | GatedImage | `packages/ui/unified-chat/src/components/markdown/ImageTrust.tsx` | Cross-origin image consent, retry, unavailable tile |
| service | markdownImageSources | `packages/ui/unified-chat/src/components/markdown/markdownImageSources.ts` | Classifies embedded, same-origin and cross-origin images |
| component | Web MessageBubble lightbox | `apps/web/features/chat/components/messages/MessageBubble.tsx` | lightboxImages (:1899), ImageLightbox (:3187), video player (:3438) |
| component | ImageLightbox | `apps/web/features/chat/components/ImageLightbox.tsx` | Full-size paging viewer [inferred from import at MessageBubble.tsx:268] |
| component | Mobile AnswerMediaSurfaces | `apps/mobile/src/features/chat/components/AnswerMediaSurfaces.tsx` | Mobile gallery and carousel |
| component | Mobile ImageFullScreen | `apps/mobile/src/features/chat/components/ImageFullScreen.tsx` | Full-screen image viewer (not opened) |
| component | Chrome openImageViewer | `apps/extension/src/features/side-panel/mediaViewer.ts` | Dialog viewer for images in the side panel |
| schema | Answer UI gallery block | `packages/contracts/types/src/answer-ui.ts` | gallery block type, up to 8 images |
| config | web-search-providers.json | `apps/web/lib/web-search/web-search-providers.json` | Only one search provider; no image provider |
| test | ImageLightbox test | `apps/web/features/chat/components/__tests__/ImageLightbox.test.tsx` | Lightbox tests |
| test | Mobile carousel test | `apps/mobile/src/features/chat/components/__tests__/InteractiveCardBlock.carousel.test.tsx` | Carousel test |
| test | Mobile image gallery test | `apps/mobile/__tests__/MarkdownImageGallery.test.tsx` | Markdown image gallery test |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Model writes a fenced carousel or gallery block in its reply. | outside service | Model output is parsed by AnswerSurface.tsx:225,369 [inferred that the model writes it] |
| The app parses the block and caps item counts. | device | packages/ui/unified-chat/src/components/markdown/answerSurfaces.ts:150-160 |
| Each image loads from its own host after the consent rule. | outside service | ImageTrust.tsx:13-50 |
| Person pages locally; no server call. | device | AnswerGallery.tsx:94-120 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Image URLs and captions | Inside the message text | With the message | Follows the message |
| Approved cross-origin image keys | In-memory set for the page session (ImageTrust.tsx:16) | No | Lost on reload |

**Models and providers.** The model chooses the images. No image-search provider is registered, so images come from model knowledge or tools that already returned them. Image generation is a separate feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Rendering needs no account beyond the chat that produced the message. |
| Permissions | Cross-origin images need person consent per image key (ImageTrust.tsx:16). |
| Subscription | none found in the code for rendering. |
| Limits and metering | Carousel and gallery parse caps of 64 items and 100,000 source characters (answerSurfaces.ts:150-152); answer-ui gallery up to 8 images (answer-ui.ts:18). |
| Feature flags | none found in the code. |
| Model compatibility | Any model that can write the fence; tool support is not required for fences [inferred]. |
| Provider restrictions | No image-search provider exists. |
| Local mode | Fenced carousel and gallery render from message text on the device, so they work for Local messages [inferred]; a remote image still loads from its host after consent. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Image fails to load | Tile 'Image unavailable' with Retry image | ImageTrust.tsx:43-62 |
| Attachment image broken | Excluded from the lightbox set | MessageBubble.tsx:1893-1912 |
| Carousel has no items | Returns nothing | AnswerGallery.tsx:98 |
| Index beyond range | Clamped | AnswerGallery.tsx:96,102 |
| Keyboard | Arrow, Home, End supported; buttons min height 44px | AnswerGallery.tsx:111-131 |
| Reduced motion, offline, timeout | not handled in the code for the carousel (no animation or network step found) | none found in AnswerGallery.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/__tests__/ImageLightbox.test.tsx`: Lightbox (file exists; bodies not read)
- `apps/mobile/src/features/chat/components/__tests__/InteractiveCardBlock.carousel.test.tsx`: Mobile carousel (file exists; bodies not read)
- `apps/mobile/__tests__/MarkdownImageGallery.test.tsx`: Mobile image gallery (file exists; bodies not read)
- `packages/ui/unified-chat/src/components/markdown/__tests__/svgGallery.test.ts`: SVG gallery parsing, a related surface (file exists)

**Test scenarios**

- **Carousel paging**
  1. Send a message whose reply has a carousel block of 3 items.
  2. Press Next twice, then use Home.
  - Expected: Counter reads 3 of 3 then 1 of 3; Next is disabled on slide 3.
- **Cross-origin consent**
  1. Show a gallery whose images are on another host.
  - Expected: Images do not load until the person chooses to load them.
- **Lightbox skips broken**
  1. Attach three images where one URL is dead.
  2. Open the first image and page.
  - Expected: Paging moves only between the two working images.
- **Missing media types**
  1. Ask for news, a video clip and an audio sample.
  - Expected: Only text answers appear; no cards exist.

**Where to look when it fails**

- data-image-state="unavailable" attribute in the DOM (ImageTrust.tsx).
- data-answer-surface attributes: carousel, gallery.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/web/022-rich-answers-and-structured-result-widgets.md)
- Desktop: [70-qa/test-plans/desktop/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/desktop/022-rich-answers-and-structured-result-widgets.md)
- Mobile: [70-qa/test-plans/mobile/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/mobile/022-rich-answers-and-structured-result-widgets.md)
- Chrome: [70-qa/test-plans/chrome/022-rich-answers-and-structured-result-widgets.md](../../70-qa/test-plans/chrome/022-rich-answers-and-structured-result-widgets.md)

## 10. Gaps and dependencies

- **No image-search provider or key** Affects: Web and Desktop image results. Evidence: apps/web/lib/web-search/web-search-providers.json:4-8; S22.05 unfinished note. Work needed: Owner picks a provider; add provider entry and tool
- **News cards missing** Affects: All six apps. Evidence: No news card code found. Work needed: Define a card kind, data source and renderers
- **Video result cards missing** Affects: All six apps. Evidence: Only generated video playback at MessageBubble.tsx:3438. Work needed: Same as above
- **Audio player missing** Affects: All six apps. Evidence: No audio element found in chat sources searched. Work needed: Add a shared player and a source of audio
- **The brief says the mobile image carousel is missing but code exists** Affects: Brief accuracy. Evidence: AnswerMediaSurfaces.tsx:155. Work needed: Update the brief; verify on device
- **Chrome and VS Code carousels not found** Affects: Chrome, VS Code and CLI users. Evidence: No carousel code in those apps' searched files. Work needed: Decide scope
- Not built on: CLI, VS Code (from the capability ledger).

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- SYS-voice-and-media
- surface:web
- surface:desktop
- surface:mobile
- surface:chrome
- file:packages/ui/unified-chat/src/components/markdown/AnswerGallery.tsx

## Unknown

- Mobile ImageFullScreen behaviour.
- Whether the Chrome side panel renders carousel or gallery fences.
- Whether any desktop path other than hosted web shows the lightbox.
- Owner decision on image provider and key.
