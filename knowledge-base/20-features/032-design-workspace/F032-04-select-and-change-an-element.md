---
id: "F032-04"
type: "feature"
title: "Select and change an element"
aliases: ["Request edits", "Select and change", "Replace this image", "Element picker", "S32.05", "S32.06", "S32.14", "S32.18"]
area: "32 Design workspace"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "not seen by a person"}
requirement_items: ["S32.05", "S32.06", "S32.14", "S32.18"]
depends_on: ["surface:web", "surface:desktop", "SYS-chat-turn-pipeline", "SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-shared-ui-and-design", "file:apps/web/lib/artifact-sandbox.ts", "F032-01"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F032-04 Select and change an element

On the web app, a person turns on 'Request edits', clicks an element in an HTML design, types what to change, and the model gets a request about only that element. For a picked image, 'Replace this image' swaps the source with an uploaded picture. Direct text editing in the design is not found.

Area: [32. Design workspace](README.md). Requirement items: [S32.05](../../10-requirements/capabilities/032-design-workspace.md#s3205), [S32.06](../../10-requirements/capabilities/032-design-workspace.md#s3206), [S32.14](../../10-requirements/capabilities/032-design-workspace.md#s3214), [S32.18](../../10-requirements/capabilities/032-design-workspace.md#s3218).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets the person select part of a rendered design, then send a selection-based change request to the model (buildArtifactEditRequest in packages/ui/unified-chat/src/lib/artifact-edit-request.ts:17-40) or replace one image locally (apps/web/features/chat/components/artifacts/design/design-edits.ts:27-58).

**Why it exists.** So small changes do not need a long chat description and do not disturb the rest of the design. Items S32.05, S32.14, S32.18 require it; S32.06 requires direct text editing.

**Who uses it.** Web chat users with an HTML artifact open in the panel.

**Problems it solves**

- Describing which element to change in words.
- Model rewriting parts that should stay.
- Swapping a picture without asking the model.

**Use cases**

- Click the hero heading and ask for a shorter line.
- Pick a photo and replace it with an uploaded image.
- Pick a button and ask for a different colour.

## 2. User experience

**Where to find it**

- Web: artifact panel header button 'Request edits' (aria-label), and a 'Request edits' item in the more menu on narrow panels (ArtifactPreview.tsx:527,2273-2280,2845-2858).
- Desktop: hosted web app shows the same [inferred from AGENTS.md section 5].
- Chrome: the brief marks S32.06 'unverified'; the side panel has artifact code but no picker was found (apps/extension/src/features/side-panel/artifactPanel.ts).
- Mobile, CLI, VS Code: no picker code found.

**Before you start**

- Panel variant, preview tab, latest version, no changes view, no open source draft, no render error, non-empty content, onRequestEdits present, and a configured sandbox origin (ArtifactPreview.tsx:2089-2099).

**Screens and controls**

- Bottom pill 'Select content and ask for changes' with 'Cancel'; after a pick, a field 'Describe the change...' with a button 'Send the change request'; for a picked img, a button 'Replace this image'; optionally 'Comment on this element' (ArtifactEditRequestLayer.tsx:12-17,139).

**Journey**

1. Open an HTML artifact in the panel.
2. Press 'Request edits'.
3. Click an element in the preview; the layer reports the pick.
4. Type the change and press the check button, or press 'Replace this image' and choose a file.
5. For a text request the model replies with a full updated artifact; for an image the new version is stored at once.

**What the person sees and gets**

- Error toast 'The change request was not sent. Try again.' (ArtifactPreview.tsx:2129).
- Success toast 'Image replaced. The previous version is in the history.' (ArtifactPreview.tsx:2146).
- Error toast 'That image could not be found in the source. Ask for the change instead.' (ArtifactPreview.tsx:2142).
- Image errors: 'Choose a PNG, JPEG, GIF or WebP image.', 'That image is too large to place. Try a smaller one.', SVG refused (image-embed.ts:6-12).

**Settings**

- NEXT_PUBLIC_SANDBOX_ORIGIN must be set for the picker (artifact-sandbox.ts:158).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Picker mode is posted to the sandbox and a pick returns a selection (SandboxedIframe.tsx:260-267,345).
- The change request text contains title, CSS path, text and markup and asks for a full updated artifact (artifact-edit-request.ts:17-40).
- Instruction is trimmed and cut to 2000 characters (artifact-edit-request.ts:9-13).
- Image replacement edits only the picked img src, drops srcset, stores a new version (design-edits.ts:27-58; ArtifactPreview.tsx:2134-2156).
- Images are resized to at most 1600 px and 600000 characters, as a data URL (image-embed.ts:1-3,40-60).

**Incomplete**

- Direct text editing of design text on the canvas: not found. A separate document edit mode exists (ArtifactPreview.tsx:2158 startDocumentEdit) but it is not a design-element editor.
- Replace image appears only when the artifact is HTML and source is editable (ArtifactPreview.tsx:3178).

**Present but disconnected or switched off**

- Whole feature is off when no sandbox origin is configured (ArtifactPreview.tsx:2099).

**Not available**

- Mobile, CLI, VS Code: no picker code found. Chrome: not found.

## 4. Required behaviour

**Established requirements**

- The user can click an element in the rendered design to select it. (source: S32.05)
- The user can edit the text of an element directly on the design. (source: S32.06)
- The user can replace an image in the design. (source: S32.14)
- The user selects part of the design and asks the model to change just that selection. (source: S32.18)

**Acceptance criteria**

1. Pressing 'Request edits' lets one element be picked.
2. Escape or Cancel leaves select mode.
3. An empty instruction is not sent.
4. A sent request names the CSS path and asks to change only that element.
5. Replace image changes only that image's src and adds a version.
6. A non-image or SVG file shows the copy above.
7. A failed send shows 'The change request was not sent. Try again.'

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Selection requests should also work on mobile and Chrome through the shared package [inferred].

**Proposed improvements** (suggestions, not requirements)

- Add direct text editing in the picked element.
- Show the model route used for the change request.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactEditRequestLayer | `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.tsx` | Pill, instruction field, replace-image and comment buttons. |
| other | design-edits | `apps/web/features/chat/components/artifacts/design/design-edits.ts` | isImageSelection and replaceImageInHtml. |
| component | ArtifactPreview | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | canRequestEdits, submitEditRequest, replaceImage, menu items. |
| component | SandboxedIframe | `apps/web/features/chat/components/SandboxedIframe.tsx` | Picker mode messages and selection events. |
| other | artifact-sandbox | `apps/web/lib/artifact-sandbox.ts` | Sandbox origin, parsePickerSelection, postPickerModeToSandbox. |
| other | artifact-edit-request | `packages/ui/unified-chat/src/lib/artifact-edit-request.ts` | buildArtifactEditRequest and normalizeEditInstruction. |
| other | image-embed | `apps/web/features/chat/components/artifacts/presentation/image-embed.ts` | embedImageFile, limits and failure copy. |
| store | useArtifactsStore | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | upsertArtifact stores the replaced version (line 2139-2145); store file not opened. |
| test | ArtifactEditRequestLayer.test.tsx | `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.test.tsx` | Pill, cancel, Escape, field behaviour. |
| test | ArtifactEditRequestLayer.design.test.tsx | `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.design.test.tsx` | Replace image only for img, comment pin. |
| test | design-edits.test.ts | `apps/web/features/chat/components/artifacts/design/design-edits.test.ts` | Image swap cases. |
| config | NEXT_PUBLIC_SANDBOX_ORIGIN | `apps/web/.env.example` | Enables sandbox and picker. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Picker mode is switched on in the sandboxed frame; the frame reports the picked element to the page. | device | SandboxedIframe.tsx:260-267,345 |
| Text change: the request is built and sent as a chat message. | device | ArtifactPreview.tsx:2119-2131 |
| The model reply with the updated artifact is produced by the chat route. | outside service | unknown: route not traced; SYS-chat-turn-pipeline |
| Image replace: file is read, resized and written as a data URL into the stored source, without a model call. | device | ArtifactPreview.tsx:2134-2146; image-embed.ts:40-60 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| New artifact version containing the data URL | web artifacts store | unknown | previous version kept in history (ArtifactPreview.tsx:2146) |

**Models and providers.** Image replace uses no model. Text change requests go to the chat model on the user's route; no model is named in the picker code.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the picker code. |
| Permissions | Picking and replace are blocked on older versions and non-panel views (ArtifactPreview.tsx:1041-1042,2089). |
| Subscription | none found in the code; text changes are normal chat turns [inferred]. |
| Limits and metering | Instruction 2000 characters; image 1600 px and 600000 characters (artifact-edit-request.ts:9; image-embed.ts:1-3). |
| Feature flags | NEXT_PUBLIC_SANDBOX_ORIGIN. |
| Model compatibility | Any model that can return a full HTML artifact. |
| Provider restrictions | none found in the code. |
| Local mode | Image replace works with no network. A Local model could answer text changes [inferred]; not verified. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| picker cannot start | onUnavailable handler is set on the iframe picker. | ArtifactPreview.tsx:2250 |
| empty instruction | Refused. | ArtifactEditRequestLayer.test.tsx:65 |
| cancel | Cancel button and Escape leave the mode. | ArtifactEditRequestLayer.tsx:40-41; ArtifactPreview.tsx:2113-2116 |
| image not found in source | Error toast. | ArtifactPreview.tsx:2142 |
| image too large, SVG, unreadable | Specific toasts. | image-embed.ts:6-12 |
| offline or timeout for text change | not handled in the picker code. | none found |
| accessibility | Buttons have aria-label; request button has aria-pressed. | ArtifactPreview.tsx:2853-2855 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.test.tsx`: Pill, Cancel, Escape, field focus and submit trimming.
- `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.design.test.tsx`: Replace image only for a picked image; comment pin.
- `apps/web/features/chat/components/artifacts/design/design-edits.test.ts`: Image src swap, doctype kept, srcset dropped, bad selector refused.

**Test scenarios**

- **Change one element**
  1. Open HTML artifact
  2. Request edits
  3. Click a heading
  4. Type change, send
  - Expected: A request naming the CSS path is sent; panel leaves select mode.
- **Replace image**
  1. Pick an image
  2. Replace this image
  3. Choose a PNG
  - Expected: Image changes, success toast, earlier version in history.
- **Bad file**
  1. Replace with an SVG
  - Expected: Message that SVG cannot be placed.
- **No sandbox**
  1. Unset sandbox origin
  2. Open artifact
  - Expected: Request edits not offered.
- **Send failure**
  1. Make send fail
  - Expected: Toast 'The change request was not sent. Try again.'

**Where to look when it fails**

- Toast texts in ArtifactPreview.tsx:2129,2142,2146.
- Check NEXT_PUBLIC_SANDBOX_ORIGIN.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/032-design-workspace.md](../../70-qa/test-plans/web/032-design-workspace.md)
- Desktop: [70-qa/test-plans/desktop/032-design-workspace.md](../../70-qa/test-plans/desktop/032-design-workspace.md)

## 10. Gaps and dependencies

- **Direct text editing on the design is not found** Affects: Web, Desktop, Mobile, Chrome. Evidence: S32.06 in brief; no code in design folder. Work needed: Add inline editing of picked text with a stored version.
- **No picker on mobile, Chrome, VS Code** Affects: Those apps. Evidence: no matches for picker or replaceImageInHtml. Work needed: Share logic through unified-chat.
- **Area brief marks web missing while code exists** Affects: Brief accuracy. Evidence: ArtifactPreview.tsx:2089-2156. Work needed: Update brief status.
- Not built on: Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- SYS-chat-turn-pipeline
- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-shared-ui-and-design
- file:apps/web/lib/artifact-sandbox.ts
- F032-01

## Unknown

- Whether Chrome side panel offers selection edits.
- Whether text selection toolbar (ArtifactSelectionToolbar) counts as direct text editing: it asks for edits, not edits directly.
- Where onRequestEdits is supplied in web pages.
