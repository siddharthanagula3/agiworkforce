---
id: "F045-09"
type: "feature"
title: "Crop, resize and export format"
aliases: ["Crop", "Resize", "Export format", "Download image", "S45.17", "S45.18", "S45.32"]
area: "45 Image editor"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S45.17", "S45.18", "S45.32"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "file:apps/web/features/chat/components/ImageGenerationCard.tsx", "file:apps/cli/src/cloud/image.rs", "SYS-files-artifacts-and-storage", "SYS-voice-and-media", "F045-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F045-09 Crop, resize and export format

No crop tool, no resize and no PNG, JPEG or WebP picker exists on any app. The only output action is Download (web card), which saves the file in the type the server returned, named ai-image-<time> with a matching extension. The CLI writes files and picks the extension from the bytes it received.

Area: [45. Image editor](README.md). Requirement items: [S45.17](../../10-requirements/capabilities/045-image-editor.md#s4517), [S45.18](../../10-requirements/capabilities/045-image-editor.md#s4518), [S45.32](../../10-requirements/capabilities/045-image-editor.md#s4532).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a person crop an image to an area, resize it to pixel sizes, and choose a file format when saving. Today only a fixed-name download exists.

**Why it exists.** The brief lists crop (S45.17), resize (S45.18) and export format (S45.32) as expected image editor abilities.

**Who uses it.** People who need a picture in a particular size or file type for another use [inferred].

**Problems it solves**

- A generated picture often needs trimming or a different format before it is used elsewhere.

**Use cases**

- Save a picture as JPEG for email.
- Crop a generated image to a square avatar.
- Resize to a banner width.

## 2. User experience

**Where to find it**

- Web (and Desktop through the web app): the only related control is 'Download' in the card's More actions menu and in the revise panel (aria-label 'Download') (ImageGenerationCard.tsx:1094-1100,688-692).
- CLI: the image command writes the file itself; no format option found.
- Mobile: viewer image actions exist (apps/mobile/src/features/image/services/viewerImageActions.ts) but their content was not read: unknown.
- Chrome: nothing found.

**Before you start**

- A finished generated image.

**Screens and controls**

- Download button only. There is no crop frame, size field or format menu.

**Journey**

1. Open the image card.
2. Open 'More actions' and choose 'Download'.
3. The browser saves ai-image-<number>.<ext>.

**What the person sees and gets**

- A file in the format the server returned. On failure a toast: 'That image could not be downloaded. Try again.' (ImageGenerationCard.tsx:121).

**Settings**

- none found in the code.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web download fetches the image, makes an object URL and saves with an extension taken from the response type: avif, gif, jpg, png, webp, else img (ImageGenerationCard.tsx:86-122).
- CLI picks png, jpg or webp from the first bytes, else bin (apps/cli/src/cloud/image.rs:568-580) and builds a numbered file name from the prompt (image.rs:587-660).
- Internal resizing exists only for sending reference pictures: web 1024 px JPEG (imageGenerationOptions.ts:216-243), mobile 2048 px (imageReference.ts:7).

**Incomplete**

- nothing found

**Present but disconnected or switched off**

- Web reframing builds a larger canvas and asks the model to outpaint (imageGenerationOptions.ts:254-298). It changes the aspect ratio but is not a crop or resize.

**Not available**

- Crop, resize and format conversion on Web, Desktop, Mobile, CLI and Chrome (brief; no code found).

## 4. Required behaviour

**Established requirements**

- User crops an image to a chosen area in the product. Missing everywhere. (source: S45.17 (brief))
- User resizes an existing image to new pixel dimensions. Missing everywhere. (source: S45.18 (brief))
- User picks PNG, JPEG or WebP when saving or exporting. Missing everywhere. (source: S45.32 (brief))

**Acceptance criteria**

1. On Web, open a generated image: no crop control exists.
2. No resize field exists in the card or panel.
3. Download saves a file whose extension matches the returned type.
4. CLI output for a PNG result ends in .png; a JPEG result ends in .jpg.
5. Search the web, mobile and CLI code for a format picker: none found.
6. A transparent image downloads with its transparency intact (type kept).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Download keeping the server format also keeps alpha for PNG [inferred from code that does not re-encode].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer PNG, JPEG, WebP in the Download menu with client-side conversion.
- [proposed] A crop-to-ratio tool using the existing aspect list.
- [proposed] Resize with a pixel field and a lock on ratio.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | downloadImage | `apps/web/features/chat/components/ImageGenerationCard.tsx` | Fetches the image and saves it (lines 94-122). |
| service | imageDownloadFilename | `apps/web/features/chat/components/ImageGenerationCard.tsx` | Maps a MIME type to a file extension. |
| component | ResultCard download menu | `apps/web/features/chat/components/ImageGenerationCard.tsx` | 'More actions' then 'Download' (lines 1077-1100). |
| component | ShareModal download | `apps/web/features/chat/components/ImageGenerationCard.tsx` | Download in the share dialog (lines 286-358). |
| service | readReferenceImageAsBase64 | `apps/web/features/chat/lib/imageGenerationOptions.ts` | Internal 1024 px downscale of guide pictures only. |
| service | buildReframeEdit | `apps/web/features/chat/lib/imageGenerationOptions.ts` | Builds a padded canvas and mask for outpaint; not a crop. |
| service | readReferenceImageBase64 (mobile) | `apps/mobile/src/features/image/services/imageReference.ts` | Internal shrink of photos to fit the upload limit. |
| service | imageMask | `apps/mobile/src/features/image/services/imageMask.ts` | Mask and image size helpers on mobile (content not fully read). |
| service | viewerImageActions | `apps/mobile/src/features/image/services/viewerImageActions.ts` | Mobile viewer actions (content not read). |
| command | image_extension and output_path | `apps/cli/src/cloud/image.rs` | CLI file extension from bytes and output naming. |
| schema | Image aspect ratio and size lists | `packages/contracts/cloud-contracts/src/managed-media.ts` | Only generation sizes and ratios are modelled; no export format field. |
| service | generateWithOpenAIImage | `apps/web/app/api/media/image/lib/image-generation-provider.ts` | Decides the returned type (transparent background asks for PNG, line 540-545). |
| test | ImageGenerationCard.test.tsx | `apps/web/features/chat/components/ImageGenerationCard.test.tsx` | imageDownloadFilename cases (line 28). |
| test | imageReference.test.ts | `apps/mobile/__tests__/imageReference.test.ts` | Internal shrink behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person chooses Download on a card. | device | ImageGenerationCard.tsx:948,1094 |
| Browser fetches the image URL from our media storage. | our servers | ImageGenerationCard.tsx:108-113 |
| Browser saves the blob with an extension from its type. | device | ImageGenerationCard.tsx:116-119 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Downloaded file | The person's device download folder | No | Under the person's control |

**Models and providers.** The file type is whatever the provider and server returned; no client conversion. Transparent output requests PNG at the provider (image-generation-provider.ts:540-545).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Download needs access to the image URL; account rules are those of media files (not read). |
| Permissions | Browser download permission. |
| Subscription | none found in the code for download. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable. |
| Provider restrictions | Returned type depends on provider. |
| Local mode | Download of a stored image is a device action. No local image generation path found. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Download fails | Toast 'That image could not be downloaded. Try again.' | ImageGenerationCard.tsx:121 |
| No fetch or object URL support | Falls back to a direct link with the base name | ImageGenerationCard.tsx:108-111 |
| Unknown type | Extension 'img' on web, 'bin' on CLI | ImageGenerationCard.tsx:96; image.rs:578 |
| Output file exists (CLI) | A numbered name is used so a file is not overwritten | image.rs:639-660 |
| Crop, resize, format picker | not handled in the code | searched web card, composer and mobile image feature |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/ImageGenerationCard.test.tsx`: imageDownloadFilename mapping and the download action after load failure.
- `apps/mobile/__tests__/imageReference.test.ts`: Internal shrink only, not a user resize.

**Test scenarios**

- **Download keeps type**
  1. Generate an image on Web.
  2. Open More actions, choose Download.
  - Expected: File saved as ai-image-<number> with the extension of the returned type.
- **No crop control**
  1. Open the card and its revise panel.
  - Expected: No crop or resize control.
- **CLI extension**
  1. Run the CLI image command without --out.
  - Expected: File lands in the working directory with png, jpg or webp matching its bytes.
- **Transparent keeps alpha**
  1. Turn on 'Transparent', generate, download.
  - Expected: Downloaded file keeps transparency (PNG).
- **Download failure**
  1. Block the image URL and press Download.
  - Expected: Toast with the failure message.

**Where to look when it fails**

- Toast text above.
- Browser console fetch error 'HTTP <status>' (ImageGenerationCard.tsx:113).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No crop tool.** Affects: All apps. Evidence: S45.17. Work needed: Design crop UI and server or client crop.
- **No resize.** Affects: All apps. Evidence: S45.18. Work needed: Pixel size input and resampling.
- **No export format choice.** Affects: All apps. Evidence: S45.32; downloadImage keeps blob type. Work needed: Client conversion and menu.
- **Mobile save/export behaviour not established.** Affects: Mobile. Evidence: viewerImageActions.ts not read. Work needed: Read and document.
- **Alpha-preservation under conversion would need care.** Affects: Web, Desktop. Evidence: Transparent toggle at ChatComposerNew.tsx:6439. Work needed: Warn when converting to JPEG.
- Not built on: Web, Desktop, Mobile, CLI, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- file:apps/web/features/chat/components/ImageGenerationCard.tsx
- file:apps/cli/src/cloud/image.rs
- SYS-files-artifacts-and-storage
- SYS-voice-and-media
- F045-08

## Unknown

- What the mobile viewer offers for saving or sharing.
- Whether the Electron shell handles downloads differently.
- Whether CLI tests cover image_extension (file matched by search; test presence not confirmed).
- Whether other surfaces (Library) offer export formats.
