---
id: "F043-08"
type: "feature"
title: "Image region, crop and annotated answers (not built)"
aliases: ["Image region selection (S43.09)", "Crop and zoom inspection (S43.10)", "Annotated visual answers (S43.11)", "Image-to-table workflow (S43.16)", "Point at part of an image", "Marked-up image answer"]
area: "43 Image and visual understanding"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "n/a", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S43.09", "S43.10", "S43.11", "S43.16"]
depends_on: ["surface:mobile", "SYS-voice-and-media", "SYS-shared-ui-and-design", "SYS-files-artifacts-and-storage", "SYS-model-catalog-and-routing", "file:apps/mobile/app/(app)/scan.tsx", "file:apps/mobile/src/features/image/services/ocr.ts", "F043-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F043-08 Image region, crop and annotated answers (not built)

Planned abilities to point at part of an image, zoom or crop it, get an image back with boxes or arrows, or turn a pictured table into a spreadsheet. None are built in any app. The only related thing is the phone Scan screen drawing text boxes over a photo for display.

Area: [43. Image and visual understanding](README.md). Requirement items: [S43.09](../../10-requirements/capabilities/043-image-and-visual-understanding.md#s4309), [S43.10](../../10-requirements/capabilities/043-image-and-visual-understanding.md#s4310), [S43.11](../../10-requirements/capabilities/043-image-and-visual-understanding.md#s4311), [S43.16](../../10-requirements/capabilities/043-image-and-visual-understanding.md#s4316).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Would let a person limit a question to a region of an image, inspect detail by cropping or zooming, receive an answer drawn on the image, and convert a table in a picture into an editable table. Today none of this exists as a feature; only the mobile Scan screen overlays text-recognition boxes on a photo for display (apps/mobile/app/(app)/scan.tsx:346-371, 534).

**Why it exists.** Brief items S43.09 and S43.11 say a person should be able to select a region so a question applies to that area, and an answer should return the image with marks. S43.10 and S43.16 are marked not applicable on every app in the brief.

**Who uses it.** Would be people asking about pictures: shoppers, students, field workers. Nobody uses it today.

**Problems it solves**

- Would let a person ask about one object in a crowded picture without describing where it is.
- Would show which part of an image an answer refers to.
- Would remove retyping a table seen in a picture [inferred from S43.16].

**Use cases**

- Circle a part number on a photo of a machine and ask what it means (not built).
- Receive a screenshot back with a box around the setting to change (not built).
- Zoom into a small chart legend before asking (not built).
- Turn a photographed price table into a sheet (not built).

## 2. User experience

**Where to find it**

- Not available in Web, Desktop, Mobile, VS Code or Chrome (brief S43.09 and S43.11 missing; S43.10 and S43.16 not applicable).
- Closest existing thing: Mobile Scan screen with the text-block count badge and overlay (apps/mobile/app/(app)/scan.tsx:346-371). Visible labels in code: 'No text found', 'No text detected' and '{{count}} text block(s)' (scan.tsx:362-371).

**Before you start**

- None for a feature that does not exist.
- Mobile Scan overlay needs the native text-recognition module; without it the call throws 'AGIVisionOCR native module not linked, rebuild the iOS app' (or Android) (apps/mobile/src/features/image/services/ocr.ts:19-24).

**Screens and controls**

- No region, crop, zoom, annotation or table controls found.
- Mobile Scan: a close button and a text-block badge over the photo; OcrOverlay draws boxes (scan.tsx:346-371, 534).

**Journey**

1. Not available for region select, crop and zoom, annotated answers or image to table.
2. Mobile Scan today: open Scan, take or supply a photo, wait for text recognition, see boxes and the count badge (scan.tsx:340-371).

**What the person sees and gets**

- Mobile Scan shows the badge text 'No text found' on an error and 'No text detected' when empty (scan.tsx:362-371).
- No annotated image output exists.

**Settings**

- None found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Mobile on-device text recognition returns text and region rectangles (x, y, width, height) (apps/mobile/src/features/image/services/ocr.ts:3-12,15-26).
- Mobile Scan draws recognized text boxes scaled to the displayed photo (scan.tsx:346-371; OcrOverlay at 534).

**Incomplete**

- The overlay is display only; the boxes are not selectable and are not used to limit a question (apps/mobile/app/(app)/scan.tsx:346-371) [inferred from the code read, tap handling for boxes not seen].

**Present but disconnected or switched off**

- none found

**Not available**

- Region selection on web, desktop, mobile, VS Code, Chrome (brief S43.09).
- Annotated answers on web, desktop, mobile, VS Code, Chrome and API (brief S43.11).
- Crop and zoom, and image to table: marked not applicable on all apps (brief S43.10, S43.16); no code found.
- The recognition result has no confidence value (ocr.ts:3-12).

## 4. Required behaviour

**Established requirements**

- User selects a region of an image so the question applies only to that area. (source: S43.09 (brief))
- User can zoom into, or crop, part of an image to inspect detail (and ask about the crop). Brief marks it not applicable anywhere. (source: S43.10 (brief))
- The answer returns the image with marks (boxes, arrows, labels) showing what it refers to. (source: S43.11 (brief))
- User turns a table in an image into an editable table or spreadsheet in a guided step. Brief marks it not applicable anywhere. (source: S43.16 (brief))
- No mock production paths, dead controls or placeholder behaviour; an unbuilt feature must not appear as a control. (source: doc: AGENTS.md section 9)
- An agent never destroys a user's data; any edit that overwrites an image goes to Trash first, so annotated output must be a new image. (source: doc: AGENTS.md section 9 [applied by inference to this feature])

**Acceptance criteria**

1. Because the feature is unbuilt, no app shows a region, crop, zoom, annotate or image-to-table control.
2. Mobile Scan overlay shows one box per recognized text block and the badge count equals the box count.
3. With no recognized text the Scan badge reads 'No text detected'; on a recognition error it reads 'No text found'.
4. If the native recognition module is missing the error message names the module and says to rebuild the app.
5. When built later: a region choice must change what image data or text reaches the model, checked from the request.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Region select would need a shared image viewer in packages/ui/unified-chat so every app behaves the same [inferred from AGENTS.md section 5].
- Annotated answers need a model route that returns coordinates; which models do is unknown.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Start with region select in web and mobile chat by cropping on the device and attaching the crop with the original.
- [proposed] Annotated answers: ask for box coordinates and draw them locally on top of the original, saving a new file.
- [proposed] Keep crop/zoom and image to table out of scope until the owner changes the brief.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| screen | Mobile Scan screen | `apps/mobile/app/(app)/scan.tsx` | Shows the photo with a text-block badge and overlay (lines 340-371). |
| component | OcrOverlay | `apps/mobile/app/(app)/scan.tsx` | Draws recognized text boxes scaled to the displayed photo (line 534 onward). |
| service | recognizeText | `apps/mobile/src/features/image/services/ocr.ts` | Calls the native AGIVisionOCR module and returns text and regions. |
| config | capability shortcut for text extraction | apps/mobile/src/features/shell/capabilityShortcuts.ts (not found) (not found) | Brief lists it as the entry point to Scan (line 19). |
| test | OcrScan test | `apps/mobile/__tests__/OcrScan.test.tsx` | Tests the native recognition wrapper (lines 13-40). |
| test | Scan send and retake tests | `apps/mobile/__tests__/ScanSendFailure.test.tsx` | Scan screen flows (file exists; contents not read in detail). |
| test | Scan retake lifetime test | `apps/mobile/__tests__/ScanRetakeLifetime.test.tsx` | Scan retake behaviour (file exists; contents not read in detail). |
| test | Supplied image needs no camera | `apps/mobile/__tests__/SuppliedImageNeedsNoCamera.test.tsx` | Scan with a supplied image (file exists; contents not read in detail). |
| service | image attach path in mobile api | `apps/mobile/services/api.ts` | Brief cites line 651 as the image send path; a future region crop would pass through it. |
| service | shared chat attachment hydration | `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` | Web server turns stored images into model parts; no region support. |
| service | prepareModelImage | `apps/web/app/api/llm/v1/chat/completions/lib/model-image.ts` | Only server-side image transform: shrink and re-encode; no crop (lines 79-135). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Mobile Scan: the photo is passed to the native text-recognition module on the phone. | device | apps/mobile/src/features/image/services/ocr.ts:15-26 |
| Mobile Scan: returned regions are scaled and drawn over the displayed photo. | device | apps/mobile/app/(app)/scan.tsx:346-371, 534-560 |
| Region select, crop, annotate, image to table: no steps exist. | device | none found in the code read |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Recognized text and boxes (Mobile Scan) | In screen state; persistence not seen in the code read | unknown | unknown |

**Models and providers.** None for this feature. Text recognition runs on the phone's own module, not a model from the catalog (ocr.ts:15-26). A future annotated answer would need a model that returns locations; unknown which models do.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not applicable: feature not built. Mobile Scan recognition itself needs no account call in the code read (ocr.ts). |
| Permissions | Mobile Scan needs camera access unless an image is supplied (test name SuppliedImageNeedsNoCamera suggests a supplied-image path); exact permission code not read. |
| Subscription | none found in the code. |
| Limits and metering | none found in the code. |
| Feature flags | none found in the code. |
| Model compatibility | Not applicable; no model is used by the overlay. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Scan text recognition runs on the device with no server call in the code read (ocr.ts:15-26), so it works without a subscription. Region, crop, annotation and table features do not exist in any mode. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Recognition module missing | Throws an error naming the module and saying to rebuild the app. | apps/mobile/src/features/image/services/ocr.ts:19-24 |
| No text found | Badge shows 'No text found' when an OCR error is set. | scan.tsx:365-368 |
| No text detected | Badge shows 'No text detected' for an empty result. | scan.tsx:365-369 |
| Text blocks found | Badge shows '{{count}} text block(s)' and boxes are drawn. | scan.tsx:358-364 |
| Offline | Recognition is on device so it does not depend on the network [inferred]; the rest of Scan send flow was not read. | ocr.ts:15-26 |
| Region, crop, annotate, table: loading, retry, cancel, timeout | not handled in the code; feature absent. | none found |
| Accessibility of the overlay | not handled in the code read. | scan.tsx:534-560 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/OcrScan.test.tsx`: The native recognition wrapper resolves with text and regions, propagates native errors, throws when not linked, handles empty results.
- `apps/mobile/__tests__/ScanSendFailure.test.tsx`: Scan screen send failure behaviour (existence confirmed, contents not read).
- `apps/mobile/__tests__/ScanRetakeLifetime.test.tsx`: Scan retake lifetime (existence confirmed, contents not read).
- `apps/mobile/__tests__/SuppliedImageNeedsNoCamera.test.tsx`: Scan with a supplied image (existence confirmed, contents not read).

**Test scenarios**

- **Absence check on each app**
  1. Open chat on web, desktop, mobile, VS Code and Chrome.
  2. Attach an image and look for region, crop, zoom or annotate controls.
  - Expected: No such control appears, matching the brief.
- **Scan overlay count**
  1. On a phone open Scan.
  2. Photograph a page with several text lines.
  - Expected: Boxes appear over the text and the badge shows the same count as boxes.
- **Scan with no text**
  1. Photograph a blank wall.
  - Expected: Badge reads 'No text detected'.
- **Annotated answer request**
  1. Attach a screenshot and ask 'draw a box around the Save button'.
  - Expected: Answer is text only; no marked image is returned.

**Where to look when it fails**

- Mobile error 'AGIVisionOCR native module not linked' means the native module is missing from the build.
- Scan badge text 'No text found' indicates an OCR error state.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Region selection not built.** Affects: Web, desktop, mobile, Chrome people (VS Code per brief). Evidence: Brief S43.09 missing; the overlay is display only (scan.tsx:346-371). Work needed: Decide the interaction, build a shared region picker and send the crop or coordinates with the question.
- **Annotated answers not built.** Affects: Web, desktop, mobile, VS Code, Chrome and API. Evidence: Brief S43.11 missing. Work needed: Choose models that return coordinates and a drawing layer that saves a new image.
- **Crop and zoom, and image to table are not applicable per the brief, though the Should lines state them.** Affects: All apps. Evidence: Brief S43.10, S43.16 'not applicable anywhere'. Work needed: Owner decision on whether they stay out of scope; brief wording and status disagree on intent.
- **OCR result has no confidence or selection hooks.** Affects: Mobile. Evidence: ocr.ts:3-12. Work needed: Extend the native result only if region features need it.
- Not built on: Web, Desktop, Mobile, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:mobile
- SYS-voice-and-media
- SYS-shared-ui-and-design
- SYS-files-artifacts-and-storage
- SYS-model-catalog-and-routing
- file:apps/mobile/app/(app)/scan.tsx
- file:apps/mobile/src/features/image/services/ocr.ts
- F043-07

## Unknown

- Whether tapping an OCR box does anything on Mobile Scan (not seen).
- Where the Scan screen sends the recognized text or photo afterwards.
- Which catalog models can return object coordinates.
- Whether any app has a hidden crop tool in the image viewer (none found).
- Why the brief marks crop and zoom and image to table not applicable.
