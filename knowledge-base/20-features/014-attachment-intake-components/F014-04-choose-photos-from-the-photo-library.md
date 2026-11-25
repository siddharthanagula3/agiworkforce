---
id: "F014-04"
type: "feature"
title: "Choose photos from the photo library"
aliases: ["Photo-library selection (S14.05)", "Photos card", "Add photos & files (web image picks)", "Upload from device (Chrome image picks)"]
area: "14 Attachment intake components"
available_on: ["web", "desktop", "mobile", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S14.05"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-local-inference", "SYS-execution-boundaries", "F014-01", "F014-03", "surface:mobile", "surface:web", "surface:desktop", "surface:chrome", "mode:local", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F014-04 Choose photos from the photo library

Lets a person pick existing pictures and attach them. On the phone the 'Photos' card opens the system photo picker with multi-select, keeps the chosen order and stops at the plan's count, removing location details from each. On web, desktop and Chrome pictures come through the normal file chooser.

Area: [14. Attachment intake components](README.md). Requirement items: [S14.05](../../10-requirements/capabilities/014-attachment-intake-components.md#s1405).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Phone: launches the image-library picker with multiple selection, ordered selection and a selection limit, then cleans each photo (photo-picker.ts:29-43,20-27; chat.tsx:1003-1027). Web, desktop and Chrome: the file chooser accepts PNG, JPEG, GIF and WebP (chat-attachment-policy.json imageMimeTypes; side_panel.ts:10052-10078).

**Why it exists.** Most attached files are pictures. The brief marks S14.05 done on web, desktop, phone and Chrome (doc: knowledge-base/data/area-briefs/014-attachment-intake-components.md).

**Who uses it.** Any user asking about a picture or screenshot they already have.

**Problems it solves**

- Choosing several photos at once in the order wanted.
- Never uploading GPS and camera details.
- Keeping the number of photos within what the account can send.

**Use cases**

- Phone: pick four photos of a room to compare.
- Web: choose a PNG chart to explain.
- Chrome: upload a JPEG to ask about.

## 2. User experience

**Where to find it**

- Phone: attach sheet card 'Photos' (AddToChatSheet.tsx:705-708).
- Web and desktop: 'Add photos & files' (ComposerPlusMenu.tsx:147).
- Chrome: '+' then 'Upload from device' (side_panel.ts:14676).

**Before you start**

- Phone: no broad photo permission asked up front; the system picker is used (apps/mobile/__tests__/photo-picker.test.ts:32).
- Web: model must be able to read images when a restricted free model is selected (ChatComposerNew.tsx:2267-2285).

**Screens and controls**

- System photo picker (phone).
- Browser file chooser (web, Chrome).
- Chips with thumbnails: AttachmentPreview.

**Journey**

1. Open the attach control.
2. Tap Photos (phone) or the file row.
3. Select one or several pictures.
4. Each picture is cleaned and appears as a chip.
5. Send.

**What the person sees and gets**

- Phone: alert 'Photos' - 'Could not open Photos. Please try again.' or the metadata recovery text (chat.tsx:1020-1024).
- Phone rejections: 'Attachment not added' alerts with the reasons (ChatInput.tsx:662-668).
- Web: notices such as the image-too-large message (use-attachments.ts:157).

**Settings**

- None found. Count limit follows the plan (photoSelectionLimit.ts:3-5).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Phone Photos card: multi-select, ordered, selection limit = filesPerMessage in Cloud or plan count (chat.tsx:1003-1017; photoSelectionLimit.ts:3-5; attachmentValidation.ts:34-47).
- Each photo is rewritten without location data; an unreadable photo raises PictureMetadataError (image-metadata.ts:28-50).
- Picker asks for a compatible representation so HEIC arrives as JPEG (photo-picker.test.ts:52).
- Web: image files pass the same admission and are cleaned before being accepted (use-attachments.ts:486; attachment-metadata.ts:60-82).
- Chrome: images admitted as data URLs, thumbnails shown, uploaded (side_panel.ts:10185-10260,10440 area).

**Incomplete**

- Chrome does not clean pictures (no remover found in apps/extension/src).

**Present but disconnected or switched off**

- Cloud mode refuses non-JPEG/PNG/GIF/WebP images with a message (attachmentValidation.ts:113-120).

**Not available**

- CLI and VS Code: not applicable for a photo library; VS Code takes dropped images (webviewContent.ts:7648).
- Web: no native photo-library picker (browser chooser only).

## 4. Required behaviour

**Established requirements**

- The user can pick one or more photos from the photo library and attach them (S14.05). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S14.05)
- Phone Local files do not leave the device in Local mode. (source: doc: docs/product/requirements.md:990-993 (M-FILE-003 listed near these rows))
- Image input is supported only if the selected route supports it; no fake vision claim. (source: doc: docs/product/requirements.md (M-FILE-005, lines near 990-994))

**Acceptance criteria**

1. Phone: selecting 3 photos in a chosen order yields 3 chips in that order.
2. Phone: the picker cannot select more than the plan count.
3. A photo whose details cannot be removed is refused with a recovery message.
4. Web: choosing a PNG and a JPG adds two chips with thumbnails.
5. Web: a picture over the image ceiling is refused with the image size message.
6. Cancelling the picker adds nothing.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The per-plan count currently equals the shared count of 20 for every plan entry read [inferred from billing-catalog.ts:544,575,596].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add the remover to Chrome intake.
- [proposed] Convert HEIC on web instead of refusing it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AddToChatSheet Photos card | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Card and handler wiring. |
| screen | handleSheetPhotos | `apps/mobile/app/(app)/(tabs)/chat.tsx` | Calls the picker with limit and ordered selection. |
| screen | handleSheetPhotos (open chat) | `apps/mobile/app/(app)/chat/[id].tsx` | Same flow in an open conversation (line 1575). |
| service | pickImageAssetsFromLibrary | `apps/mobile/src/features/media/photo-picker.ts` | Opens the picker and cleans results. |
| service | withoutPictureMetadata | `apps/mobile/src/features/media/image-metadata.ts` | Rewrites each photo without location data. |
| service | photoSelectionLimitForPlan | `apps/mobile/src/features/chat/utils/photoSelectionLimit.ts` | Plan count for the picker. |
| service | attachmentLimitsFor | `apps/mobile/src/features/chat/utils/attachmentValidation.ts` | Cloud and Local limits. |
| service | currentAttachmentLimits | `apps/mobile/src/features/chat/upload/attachmentLimits.ts` | Server-announced limits on the phone. |
| component | Web file input and plus row | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Accept attribute and multi-select input. |
| hook | useAttachments | `apps/web/features/chat/hooks/use-attachments.ts` | Image size limits and refusal. |
| service | prepareChatAttachment | `apps/web/features/chat/lib/attachment-metadata.ts` | Web picture cleaning. |
| component | AttachmentPreview | `apps/web/features/chat/components/Composer/AttachmentPreview.tsx` | Image thumbnail chips. |
| component | Chrome intake | `apps/extension/src/side_panel.ts` | Image admission, thumbnail, upload. |
| config | chat-attachment-policy.json | `packages/contracts/cloud-contracts/src/chat-attachment-policy.json` | imageMimeTypes and ceilings. |
| service | image-normalization | `apps/mobile/src/features/media/image-normalization.ts` | SAFE_IMAGE_PICKER_OPTIONS and HEIC helpers. |
| test | photo-selection-limit test | `apps/mobile/__tests__/photo-selection-limit.test.ts` | Plan count behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Phone opens the system picker (no custom permission step) with multi-select and the selection limit. | device | photo-picker.ts:29-43 |
| Each chosen photo is read, stripped and written to a new cache file. | device | image-metadata.ts:28-50 |
| Admission checks type, size, count, message size; duplicates are detected by picker asset id. | device | ChatInput.tsx:619-668; photo-picker.ts:56-72 |
| Web and Chrome pictures are read in the page, cleaned (web only) and shown as thumbnails. | device | use-attachments.ts:486; side_panel.ts:10185 |
| On send, Cloud uploads go to our servers; Local keeps the photo on the phone. | device and our servers | uploadAttachment.ts; AddToChatSheet.tsx:130-135 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Cleaned photo copies | app cache (phone), browser memory (web) | after send in Cloud | Cloud: Library until deleted; temporary chats deleted with chat |

**Models and providers.** Picking is model independent. A model with an image limit per message is checked at send on phone (imageLimitRefusal, attachmentValidation.ts:187-203) and in Chrome (side_panel.ts:10150-10160). On-device models read the text in photos, not the picture (AddToChatSheet.tsx:130-131).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Picking needs none; Cloud upload needs sign-in. |
| Permissions | System picker; no broad permission requested first. |
| Subscription | Photo count per message follows getPlanMaxAttachmentsPerMessage via normalized tier; unknown plan uses the default plan, never unlimited (photo-selection-limit.test.ts:16). |
| Limits and metering | Image ceiling 20 MiB or 12 MiB without handshake; 20 files or 10 without handshake (chat-attachment-policy.json:2-11). Metering of picks: none found. |
| Feature flags | none found in the code. |
| Model compatibility | Image-capable models only. |
| Provider restrictions | none found in the code. |
| Local mode | Phone Local keeps the plan count for the picker (NewChatPhotoPickerLimit.test.tsx:264) and accepts any image type (attachmentValidation.ts:116-122); no upload. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty | Picker cancelled, nothing attached. | photo-picker.ts:23 |
| Picker cannot open | Alert 'Could not open Photos. Please try again.' | chat.tsx:1023 |
| Photo cannot be cleaned | Recovery alert. | chat.tsx:1020-1022 |
| HEIC in Cloud | Refused with 'is a HEIC photo AGI Cloud can't read'. | attachmentValidation.ts:115 |
| Same photo again | 'Already attached' alert. | ChatInput.tsx:655-659 |
| Too many images for the model | Refusal text names how many to remove. | attachmentValidation.ts:196-203 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/photo-picker.test.ts`: system picker opened without broad access, compatible representation, EXIF stripped, asset id carried
- `apps/mobile/__tests__/photo-selection-limit.test.ts`: plan limit and default
- `apps/mobile/__tests__/NewChatPhotoPickerLimit.test.tsx`: Cloud and Local picker limits
- `apps/mobile/__tests__/PhotosAccess.test.ts`: photos access (title only read)
- `apps/web/features/chat/hooks/__tests__/useAttachments.pictures.test.tsx`: web picture preparation and refusal
- `apps/web/features/chat/hooks/__tests__/useAttachments.refusals.test.tsx`: image ceiling

**Test scenarios**

- **Ordered multi-pick**
  1. Open Photos and select photo C, A, B.
  - Expected: Chips appear in order C, A, B.
- **Limit**
  1. Try selecting more photos than the plan count.
  - Expected: Picker stops at the limit.
- **Metadata**
  1. Pick a photo with GPS.
  2. Inspect the cache copy.
  - Expected: No GPS data.
- **Web image ceiling**
  1. Choose a 25 MB PNG on web.
  - Expected: Refused with the image size message.
- **Cloud HEIC**
  1. Force a HEIC file into the draft in Cloud mode.
  - Expected: Refusal naming the file.

**Where to look when it fails**

- Alert 'Photos'.
- PictureMetadataError.
- Web notice text from use-attachments.ts.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/014-attachment-intake-components.md](../../70-qa/test-plans/web/014-attachment-intake-components.md)
- Desktop: [70-qa/test-plans/desktop/014-attachment-intake-components.md](../../70-qa/test-plans/desktop/014-attachment-intake-components.md)
- Mobile: [70-qa/test-plans/mobile/014-attachment-intake-components.md](../../70-qa/test-plans/mobile/014-attachment-intake-components.md)
- Chrome: [70-qa/test-plans/chrome/014-attachment-intake-components.md](../../70-qa/test-plans/chrome/014-attachment-intake-components.md)

## 10. Gaps and dependencies

- **Chrome does not clean pictures** Affects: Chrome. Evidence: no remover in apps/extension/src. Work needed: Use the shared remover.
- **Web refuses HEIC (not in the accepted types)** Affects: Web, desktop. Evidence: chat-attachment-policy.json imageMimeTypes. Work needed: Decide on conversion.
- **No native photo-library picker on web or desktop** Affects: Web, desktop. Evidence: only the file chooser exists. Work needed: Product decision.

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-local-inference
- SYS-execution-boundaries
- F014-01
- F014-03
- surface:mobile
- surface:web
- surface:desktop
- surface:chrome
- mode:local
- mode:cloud

## Unknown

- Whether the phone picker honours selectionLimit zero as unlimited (library behaviour not checked).
- Whether iOS shows a limited-library prompt.
- Exact thumbnail rules in Chrome beyond preview data URL.
