---
id: "F014-03"
type: "feature"
title: "Take a photo with the camera"
aliases: ["Camera capture (S14.04)", "Camera card", "Take a photo", "Camera screen (standalone)", "Vision Analysis conversation (camera screen)"]
area: "14 Attachment intake components"
available_on: ["mobile"]
implementation: {web: "missing", desktop: "missing", mobile: "built", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "not seen by a person", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S14.04"]
depends_on: ["SYS-voice-and-media", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-subscriptions-entitlements-and-usage", "SYS-local-inference", "SYS-execution-boundaries", "surface:mobile", "mode:local", "mode:cloud", "file:apps/mobile/src/features/media/photo-picker.ts", "file:apps/mobile/src/features/media/image-metadata.ts", "F014-04"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F014-03 Take a photo with the camera

Lets a phone user take a photo from the attach sheet and attach it, with permission handling and removal of location details before the photo is accepted. A second full-screen camera screen can capture and send a photo in one step. The camera is not wired into the web, desktop or Chrome composers.

Area: [14. Attachment intake components](README.md). Requirement items: [S14.04](../../10-requirements/capabilities/014-attachment-intake-components.md#s1404).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** The 'Camera' card opens the system camera, cleans the picture of location and camera details, and adds it to the draft (apps/mobile/app/(app)/(tabs)/chat.tsx:949-984; apps/mobile/src/features/media/photo-picker.ts:20-52).

**Why it exists.** Phone users photograph documents, whiteboards and objects to ask about them. The brief marks camera done only on the phone (S14.04) and the founder keeps the camera on the add menu (doc: docs/decisions/2026-11-12-founder-decisions.md, D-2026-11-12-01).

**Who uses it.** Phone users on any plan with the camera capability on.

**Problems it solves**

- Asking about something in front of the person without saving a photo first.
- Not leaking GPS or camera model: details are removed (image-metadata.ts:5-8,28-50).
- Clear recovery when permission is refused.

**Use cases**

- Photograph a receipt and ask for a summary.
- Photograph a plant and ask what it is.
- Open the camera screen from a widget and ask 'What do you see in this image?'.

## 2. User experience

**Where to find it**

- Phone attach sheet card 'Camera' (AddToChatSheet.tsx:697), shown only when useCapability('canUseCamera') is true (line 202,695).
- Standalone camera screen route '(app)/camera', opened by a deep link verb 'camera' (apps/mobile/app/_layout.tsx:215-217) and the home widget and Siri shortcuts (doc: docs/decisions/2026-11-12-founder-decisions.md lines 21-23).

**Before you start**

- Camera capability on for the account (Capabilities.tsx:126-135).
- Camera permission; first use asks.
- Phone only; the CLI and VS Code have no camera.

**Screens and controls**

- Camera card in the sheet.
- System camera UI (expo-image-picker launchCameraAsync, allowsEditing false).
- Camera screen: viewfinder, flash, switch camera, capture, retake, question box, send (apps/mobile/app/(app)/camera.tsx).

**Journey**

1. Open the attach sheet and tap Camera.
2. Allow camera access when asked.
3. Take the photo.
4. The photo is cleaned and appears as a chip.
5. Send with the message.

**What the person sees and gets**

- Permission refused: alert 'Camera Access' - 'Camera permission is required to take photos. Allow it in Settings to attach a photo.' with 'Not now' and 'Open Settings' (chat.tsx:956-969).
- Camera cannot open: alert 'Camera' - 'Could not open the camera. Please try again.' (chat.tsx:980).
- Photo cannot be cleaned: alert 'Camera' with the recovery text 'This photo's location data couldn't be removed, so save a copy from Photos and attach that.' (image-metadata.ts:5-6).
- Camera screen capture failure: 'Capture failed' (camera.tsx:79); send failure: 'Send failed'.

**Settings**

- Capability switches from the server turn the camera off per account (Capabilities.tsx:37-47,126-135).
- Phone OS camera permission in system Settings.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Camera card gated on canUseCamera (AddToChatSheet.tsx:202,695-703).
- Permission request, alert with Open Settings, scope check (chat.tsx:949-972).
- launchCameraAsync with the safe picker options, then withoutPictureMetadata on each asset, refusing when unreadable (photo-picker.ts:45-52,20-27; image-metadata.ts:28-50).
- The same handler exists in the open-chat screen (apps/mobile/app/(app)/chat/[id].tsx:1521).
- Standalone camera screen captures with exif: false, previews, retake, then creates or reuses a conversation and sends (camera.tsx:73-77,111-146).
- Cloud mode refuses HEIC with a retake hint (attachmentValidation.ts:113-116).

**Incomplete**

- The standalone camera screen does not call withoutPictureMetadata; it relies on exif: false at capture; whether the send path removes anything else is not established (camera.tsx:73-77,126-135).

**Present but disconnected or switched off**

- Web and desktop: a getUserMedia camera dialog exists in the shared AttachmentMenu (packages/ui/unified-chat/src/components/AttachmentMenu.tsx:170-200) and is documented as wired (doc: docs/decisions/wire-or-cut.md:433-439), but no app mounts AttachmentMenu or the unified ChatInput (searched apps and packages), and the web composer menu has no camera row (ComposerPlusMenu.tsx). The capability table still says web camera is true (packages/contracts/types/src/__tests__/capabilities.test.ts:88-89).

**Not available**

- Chrome side panel: no camera (apps/extension/src has no getUserMedia for attachments; only a microphone setting).
- CLI and VS Code: no camera by design (doc: docs/product/surface-feature-matrix.md:337-338).

## 4. Required behaviour

**Established requirements**

- The composer offers a camera control that takes a photo and attaches it (S14.04): done on phone, missing on web, desktop and Chrome. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S14.04)
- The camera stays on the add menu; the standalone camera screen stays reachable from widgets and shortcuts. (source: doc: docs/decisions/2026-11-12-founder-decisions.md)
- Camera shown only when the camera capability is on; permission refusal offers Not now / Open Settings (brief Should lines supplied with the feature). (source: apps/mobile/app/(app)/(tabs)/chat.tsx:956-969)

**Acceptance criteria**

1. With the camera capability on, the sheet shows a Camera card; with it off, no card.
2. First tap asks the OS permission; refusing shows the 'Camera Access' alert with Not now and Open Settings.
3. Taking a photo adds one chip whose file has no location data.
4. A photo that cannot be cleaned is refused with the recovery message and no chip.
5. Cancelling the camera adds nothing.
6. A Cloud-mode photo above the image size limit is refused with a named reason.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The Camera card is intended for both Local and Cloud modes because the gate ignores appMode [inferred from AddToChatSheet.tsx:695].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Run the metadata remover on the standalone camera screen photo.
- [proposed] Either mount the shared camera dialog in the web composer or remove its documentation as wired.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AddToChatSheet Camera card | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Shows the card when canUseCamera is on. |
| screen | handleSheetCamera (tabs chat) | `apps/mobile/app/(app)/(tabs)/chat.tsx` | Permission, alerts, capture, clean. |
| screen | handleSheetCamera (open chat) | `apps/mobile/app/(app)/chat/[id].tsx` | Same flow inside an open conversation. |
| service | photo-picker | `apps/mobile/src/features/media/photo-picker.ts` | captureImageAssetsFromCamera and imageAssetsToChatAttachments. |
| service | image-metadata | `apps/mobile/src/features/media/image-metadata.ts` | withoutPictureMetadata, PictureMetadataError, recovery message. |
| service | image-normalization | `apps/mobile/src/features/media/image-normalization.ts` | Safe picker options, HEIC handling, capture quality. |
| hook | useCapability | `apps/mobile/src/lib/Capabilities.tsx` | Capability decision with server switches. |
| config | Platform capabilities | `packages/contracts/types/src/capabilities.ts` | canUseCamera per platform. |
| screen | Camera screen | `apps/mobile/app/(app)/camera.tsx` | Full-screen capture and send. |
| screen | Deep link router | `apps/mobile/app/_layout.tsx` | Routes the camera verb to the screen. |
| service | runComposerAttachmentPick | `apps/mobile/src/features/chat/utils/runComposerAttachmentPick.ts` | Shows preparing chip while the photo is cleaned. |
| service | attachmentValidation | `apps/mobile/src/features/chat/utils/attachmentValidation.ts` | Size, type and HEIC rules after capture. |
| component | AttachmentMenu CameraCaptureDialog | `packages/ui/unified-chat/src/components/AttachmentMenu.tsx` | Browser camera dialog; not mounted by any app found. |
| test | photo-picker tests | `apps/mobile/__tests__/photo-picker.test.ts` | EXIF stripped on camera path; exif false at all call sites. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person taps Camera; sheet closes and the handler asks for camera permission. | device | chat.tsx:949-954 |
| System camera captures; the photo is copied and rewritten without location and camera details. | device | photo-picker.ts:45-52; image-metadata.ts:28-50 |
| The attachment is validated for type and size, then shown as a chip. | device | ChatInput.tsx:619-668 |
| On send in Cloud mode the image uploads to our servers; in Local mode the image stays on the phone. | device and our servers | uploadAttachment.ts:1-40; AddToChatSheet.tsx:130-135 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Cleaned photo file | app cache directory | only if sent in Cloud mode | Cloud copy kept in Library until deleted unless chat is temporary (AddToChatSheet.tsx:132-135); Local copy kept per local chat attachments rules (local-chat-attachments tests) |

**Models and providers.** The Camera card does not depend on model. Reading the photo does: Local on-device models read the text in photos, not the picture itself (AddToChatSheet.tsx:130-131); Cloud models need an image-capable model and a per-message image limit (attachmentValidation.ts:187-203).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Camera card itself needs no sign-in; upload in Cloud mode needs one. |
| Permissions | OS camera permission; Open Settings link on refusal. |
| Subscription | No plan gate on the card; image size and count limits apply from the upload contract (chat-attachments.ts:43-55). |
| Limits and metering | Image ceiling 20 MiB, or 12 MiB without a server handshake (chat-attachment-policy.json:4,9). Metering of camera use: none found in the code. |
| Feature flags | capability.can_use_camera server switch (Capabilities.tsx:37-47; Capabilities.test.tsx:62). |
| Model compatibility | Image-capable models only; see models_and_providers. |
| Provider restrictions | none found in the code. |
| Local mode | Card shown in Local mode too; photo stays on device; on-device models read text in photos, not the picture. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Permission refused | Alert with Not now and Open Settings. | chat.tsx:956-969 |
| Camera cannot open | Alert 'Could not open the camera. Please try again.' | chat.tsx:980 |
| Photo cannot be cleaned | Recovery alert, no chip. | chat.tsx:975-981; image-metadata.ts:5 |
| Cancelled | Nothing added. | photo-picker.ts:23 |
| Capability off | Card hidden; camera screen shows CapabilityUnavailable. | AddToChatSheet.tsx:695; camera.tsx:37,188 |
| Sheet closed or account changed during capture | Result dropped. | chat.tsx:955,972 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/photo-picker.test.ts`: strips EXIF on the camera path; exif false at every camera and picker call site
- `apps/mobile/__tests__/CameraDeepLinkTarget.test.tsx`: camera deep link target (title only read)
- `apps/mobile/__tests__/CameraTorchAndFacing.test.tsx`: torch and facing controls (title only read)
- `apps/mobile/__tests__/CapabilityKillSwitchConsumers.test.tsx`: camera screen under capability switch (imports CameraScreen)
- `apps/mobile/src/lib/Capabilities.test.tsx`: capability key mapping and camera decision
- `packages/ui/unified-chat/src/components/__tests__/AttachmentMenu.cameraCapture.test.tsx`: shared camera dialog (not mounted by an app)

**Test scenarios**

- **Permission refused**
  1. Deny camera in iOS Settings.
  2. Tap Camera.
  - Expected: 'Camera Access' alert with Not now and Open Settings.
- **Capability off**
  1. Switch off capability.can_use_camera for the account.
  2. Open the attach sheet.
  - Expected: No Camera card.
- **Metadata removed**
  1. Take a photo with location on.
  2. Inspect the chip file.
  - Expected: No GPS or camera model in the file.
- **Local vs Cloud**
  1. Take a photo in Local mode and ask what it shows.
  2. Repeat in Cloud mode.
  - Expected: Local reads text only; Cloud sees the picture.
- **Web**
  1. Open the web plus menu.
  - Expected: No camera row.

**Where to look when it fails**

- Alerts 'Camera' and 'Camera Access'.
- PictureMetadataError name.
- Server flag capability.can_use_camera in /api/me feature_flags.

**Hands-on test plans**

- Mobile: [70-qa/test-plans/mobile/014-attachment-intake-components.md](../../70-qa/test-plans/mobile/014-attachment-intake-components.md)

## 10. Gaps and dependencies

- **Camera missing on web, desktop and Chrome composers although documented as wired** Affects: Web, desktop, Chrome. Evidence: AttachmentMenu.tsx exists but no mounting found; docs/decisions/wire-or-cut.md:439. Work needed: Mount it in ComposerPlusMenu or correct the record.
- **Camera screen does not use the shared metadata remover** Affects: Phone. Evidence: camera.tsx:73-77. Work needed: Verify and apply withoutPictureMetadata.
- **Capability table says web camera true** Affects: Web. Evidence: capabilities.test.tsx line 88-89. Work needed: Align the table with the composer.
- Not built on: Web, Desktop, Chrome (from the capability ledger).

**Depends on**

- SYS-voice-and-media
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-subscriptions-entitlements-and-usage
- SYS-local-inference
- SYS-execution-boundaries
- surface:mobile
- mode:local
- mode:cloud
- file:apps/mobile/src/features/media/photo-picker.ts
- file:apps/mobile/src/features/media/image-metadata.ts
- F014-04

## Unknown

- Whether the standalone camera screen send path removes picture details later.
- Whether the web composer should show the camera (documents disagree with code).
- iOS versus Android differences in camera permission text beyond the shared alert.
- How the cached photo is cleaned up after send.
