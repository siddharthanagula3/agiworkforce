---
id: "F028-04"
type: "feature"
title: "Element picking for edit requests"
aliases: ["Request edits", "Element picker", "Select an element to edit", "Element-selection editing", "Request an edit to the selected element", "S28.14"]
area: "28 Code Canvas and application preview"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "missing", cli: "n/a", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S28.14"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "mode:own-key", "mode:local", "file:infrastructure/sandbox/index.html", "file:apps/web/features/chat/components/SandboxedIframe.tsx", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-security-and-privacy", "F028-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F028-04 Element picking for edit requests

On web, the person turns on 'Request edits', clicks an element in the live preview, types what to change and sends it. The request goes into the chat as a message to the model. It works only when the separate sandbox frame is in use. Mobile, Chrome and the Tauri panel have no picker.

Area: [28. Code Canvas and application preview](README.md). Requirement items: [S28.14](../../10-requirements/capabilities/028-code-canvas-and-application-preview.md#s2814).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Lets the person point at a part of a rendered page instead of describing it in words. The panel captures the element's path, text, a short HTML excerpt and its box, then sends an edit request that names that element.

**Why it exists.** Describing 'the third button in the footer' is clumsy. The brief (S28.14) asks for click-to-select editing, in the style of the leading chat products' Request edits layer (comment at ArtifactEditRequestLayer.tsx:37).

**Who uses it.** People refining a generated page who do not want to read the code.

**Problems it solves**

- Naming a page element precisely
- Avoiding retyping the whole request
- Changing a picture or commenting on a spot

**Use cases**

- Click a title, type 'make this blue', send.
- Click an image and choose 'Replace this image'.
- Click an element and 'Comment on this element'.

## 2. User experience

**Where to find it**

- Web side panel header button 'Request edits' (aria-label and title, ArtifactPreview.tsx:527, 2850) and a More menu item with the same label (ArtifactPreview.tsx:2270-2280). The header button is hidden on narrow panels and the menu item is used (class '@[26rem]').

**Before you start**

- Panel variant with a chat that can take a turn (onRequestEdits) (ArtifactPreview.tsx:2089-2099).
- Latest version, Preview tab, no render error, no source draft, non-empty content.
- The sandbox frame must be in use: the check requires getSandboxOrigin() to be set (ArtifactPreview.tsx:2099).

**Screens and controls**

- Selection pill with Cancel; after a pick, a field with placeholder text and 'Send the change request' (ArtifactEditRequestLayer.tsx:13, 111-129).
- Extra buttons 'Replace this image' (HTML artifacts) and 'Comment on this element' (when comments are available) (ArtifactEditRequestLayer.tsx:14-15, 139-163).
- Outline under the pointer inside the preview; Escape cancels.

**Journey**

1. Open an HTML or React artifact on Preview.
2. Press 'Request edits'.
3. Move the pointer over the page: elements are outlined and clicks no longer operate the page.
4. Click an element: a field appears next to it.
5. Type the change and press 'Send the change request'.
6. The chat receives a message that quotes the element; the model replies with a new version.
7. Press Escape or Cancel to stop picking.

**What the person sees and gets**

- Error toast 'The change request was not sent. Try again.' when the chat refuses the turn (ArtifactPreview.tsx:2123-2130).
- Error toast 'Selecting content needs the sandboxed preview, which is unavailable here.' if the frame falls back (ArtifactPreview.tsx:2252).
- A new artifact version after the model answers.

**Settings**

- None found. Depends on the sandbox build setting (see F028-03).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Renderer side: inert until the parent sends a picker-on message; blocks pointer and form events while on, outlines the element under the pointer, and reports the chosen element as a short path (depth 8), text up to 200 characters, an outer HTML excerpt up to 600 characters and its box; Escape asks the parent to cancel (infrastructure/sandbox/index.html:383-580).
- Parent side: SandboxedIframe forwards picker mode, accepts a selection only from the sandbox frame and origin, and validates its shape and size (SandboxedIframe.tsx:263-267; apps/web/lib/artifact-sandbox.ts:48-90).
- Panel side: builds an edit request with the element and the typed instruction and sends it with onRequestEdits (ArtifactPreview.tsx:2112-2131). Tests cover the layer and the panel wiring.
- Text selection edits (a toolbar over selected document text, 'Edit with AI') are a separate path (ArtifactPreview.selectionEdit.test.tsx).

**Incomplete**

- Works only when the sandbox address is set at build; otherwise the Request edits control is not offered at all (ArtifactPreview.tsx:2099). The brief says missing on all apps; the code is built but gated and, per docs, production does not set the address, so it is effectively off there.

**Present but disconnected or switched off**

- Picker mode in a fallback frame: SandboxedIframe reports unavailable and the panel cancels with a toast (SandboxedIframe.tsx:336-342; ArtifactPreview.tsx:2252).

**Not available**

- Mobile: no element picker. 'Ask for changes' only fills the composer with a request for the whole artifact (ArtifactFullScreen.tsx:328-335, 982-995).
- Chrome side panel: no picker found (artifactPanel.ts).
- Desktop Tauri shared panel: no picker found in ArtifactPanel.tsx.
- VS Code and CLI: not applicable.

## 4. Required behaviour

**Established requirements**

- The user can click an element in the preview to select it and ask for an edit to that element (S28.14). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S28.14)
- Following the leading products is the reference for product and policy calls. (source: doc: AGENTS.md section 10)

**Acceptance criteria**

1. With the sandbox address set, 'Request edits' appears for an HTML artifact on the Preview tab of the latest version.
2. While picking, clicking a page button does not trigger the button and outlines the element.
3. Pressing Escape cancels and the page works normally again.
4. Sending a request posts a chat message naming the element and the instruction.
5. A refused chat turn shows 'The change request was not sent. Try again.' and keeps the field.
6. Without the sandbox address, the control is absent.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The model that answers is whichever model and mode the chat uses (Local, own key or Cloud) because the request is an ordinary chat message [inferred from onRequestEdits returning a boolean for a sent chat turn, ArtifactsPanel.requestEdits.test.tsx].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Offer picking in the fallback frame too, or explain the missing control.
- [proposed] Add a picker to the shared panel for Tauri desktop and Chrome.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ArtifactEditRequestLayer | `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.tsx` | Pill, input, send, replace image and comment controls |
| component | ArtifactPreview (request edits) | `apps/web/features/chat/components/artifacts/ArtifactPreview.tsx` | canRequestEdits (2089), editRequestPicker (2245), submitEditRequest (2117), button (2850) |
| other | artifact-edit-request | `packages/ui/unified-chat/src/lib/artifact-edit-request.ts` | Builds the request text from the element and instruction (shared helper; web imports buildArtifactEditRequest) |
| component | SandboxedIframe (picker part) | `apps/web/features/chat/components/SandboxedIframe.tsx` | Forwards picker mode, accepts picker-selection and picker-cancel |
| service | artifact-sandbox picker parsing | `apps/web/lib/artifact-sandbox.ts` | parsePickerSelection, postPickerModeToSandbox, size limits (lines 48-90) |
| component | Sandbox renderer picker | `infrastructure/sandbox/index.html` | startPicker (510), stopPicker (500), outline, blocked events, message handler |
| component | ArtifactsPanel | `apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` | Passes onRequestEdits to the chat and closes the phone sheet |
| component | ArtifactFullScreen 'Ask for changes' (mobile) | `apps/mobile/src/features/chat/components/ArtifactFullScreen.tsx` | Whole-artifact change request that prefills the composer (not element picking) |
| test | ArtifactEditRequestLayer.test | `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.test.tsx` | Pill, cancel, send, empty refusal |
| test | ArtifactsPanel.requestEdits.test | `apps/web/features/chat/components/artifacts/ArtifactsPanel.requestEdits.test.tsx` | Request hand-off to chat, refusal, phone sheet |
| test | SandboxedIframe.test | `apps/web/features/chat/components/SandboxedIframe.test.tsx` | Selection accepted only from sandbox; shape validation; unavailable in fallback |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Pressing Request edits sets picker mode; the parent posts a picker message to the renderer frame. | device | ArtifactPreview.tsx:2108-2112; SandboxedIframe.tsx:336-346; artifact-sandbox.ts postPickerModeToSandbox |
| The renderer captures the clicked element and posts picker-selection to the parent. | device | infrastructure/sandbox/index.html:383-580 |
| The parent validates and stores the selection and shows the field. | device | SandboxedIframe.tsx:263-267; artifact-sandbox.ts:65-82 |
| Send builds a request text and hands it to the chat as a new turn. | device | ArtifactPreview.tsx:2117-2131 |
| The chat turn runs through the normal pipeline to the chosen model. | our servers | [inferred] SYS-chat-turn-pipeline; Cloud mode; other modes call the user's provider or a local model |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Picked element data (path, text, HTML excerpt, box) | Component memory, then inside the chat message text | As part of the chat message | Follows the conversation's retention; element data not stored separately |

**Models and providers.** The picker itself uses no model. The sent request is answered by the chat's current model and provider route (Local, own key or Cloud), chosen by routing, not by this feature.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | none found in the code for picking; sending a chat turn follows the chat's own sign-in rules. |
| Permissions | none found in the code. The renderer only obeys messages from its parent window (index.html message handler). |
| Subscription | The sent turn counts as an ordinary chat turn under the subscription system [inferred]. No picker-specific check found. |
| Limits and metering | Selector 500 characters, text 500, HTML 2,000 accepted by the parent (artifact-sandbox.ts:48-51); the renderer sends smaller excerpts (200 and 600). |
| Feature flags | Gated by the sandbox build setting through getSandboxOrigin() (ArtifactPreview.tsx:2099). |
| Model compatibility | Any model that can edit an artifact from text [inferred]. |
| Provider restrictions | none found in the code. |
| Local mode | The picker runs on the device. Whether the resulting edit works in Local mode depends on the local model answering the chat turn; not checked. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Fallback frame | Picker unavailable; toast explains and mode cancels. | ArtifactPreview.tsx:2245-2257 |
| Render error or source draft open | Request edits is not offered. | ArtifactPreview.tsx:2089-2099 |
| Version changes | Mode and selection reset when the artifact or version count changes. | ArtifactPreview.tsx:906-909 |
| Request refused | Error toast; selection stays. | ArtifactPreview.tsx:2128-2130 |
| Unreadable inner frame | Picker falls back to the renderer's own root if the nested frame cannot be read. | infrastructure/sandbox/index.html:407-417 |
| Keyboard | Escape cancels inside the frame and in the layer; field gets focus after a pick. | index.html:560-570; ArtifactEditRequestLayer.test.tsx:39-64 |
| Mobile | not handled in the code: no picker. | searched ArtifactFullScreen.tsx and SafeArtifactPreview.tsx |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.test.tsx`: Pill and Cancel, Escape, focus, trimmed submit, field reset on new element
- `apps/web/features/chat/components/artifacts/ArtifactEditRequestLayer.design.test.tsx`: Layer design checks
- `apps/web/features/chat/components/artifacts/ArtifactsPanel.requestEdits.test.tsx`: Offer only when the page can send a chat turn; hand-off; phone sheet; refusal
- `apps/web/features/chat/components/SandboxedIframe.test.tsx`: Picker messages: trusted origin and frame, shape, off-mode, unavailable in fallback
- `packages/ui/unified-chat/src/lib/artifact-edit-request.test.ts`: Edit request text building

**Test scenarios**

- **Pick and send**
  1. Set the sandbox address
  2. Open an HTML artifact
  3. Press Request edits
  4. Click the title
  5. Type 'make it bigger' and send
  - Expected: Chat shows a request naming the title element; a new version follows.
- **Escape cancels**
  1. Start picking
  2. Press Escape
  - Expected: Outline gone, page clickable.
- **No sandbox**
  1. Build without the setting
  2. Open an HTML artifact
  - Expected: No Request edits control.
- **Refused turn**
  1. Make the chat refuse a turn (for example while busy)
  2. Send a request
  - Expected: Toast 'The change request was not sent. Try again.'
- **Forged message**
  1. From another window post a picker-selection to the panel
  - Expected: Ignored (covered by the SandboxedIframe tests).

**Where to look when it fails**

- Console '[artifact-preview]' lines.
- Chat transcript for the request text.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/web/028-code-canvas-and-application-preview.md)
- Desktop: [70-qa/test-plans/desktop/028-code-canvas-and-application-preview.md](../../70-qa/test-plans/desktop/028-code-canvas-and-application-preview.md)

## 10. Gaps and dependencies

- **Control hidden whenever the sandbox address is unset, which docs say is the production state** Affects: Web, Electron Desktop. Evidence: ArtifactPreview.tsx:2099; audit/prior-audits/chat-security-audit-2026-10-26.md:62. Work needed: Set the address after the register item is closed, then live-check picking.
- **No element picking on mobile, Chrome or the Tauri panel** Affects: Mobile, Chrome, Desktop Tauri. Evidence: No picker code found. Work needed: Port the picker or accept a gap.
- **Brief says missing; code on web is built** Affects: Documentation. Evidence: ArtifactEditRequestLayer.tsx; index.html:383-580. Work needed: Update the brief.
- Not built on: Mobile, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- mode:own-key
- mode:local
- file:infrastructure/sandbox/index.html
- file:apps/web/features/chat/components/SandboxedIframe.tsx
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-security-and-privacy
- F028-03

## Unknown

- Whether picking works in the deployed sandbox host (needs the sandbox address and a matching renderer deploy; brief says redeploy needed).
- Whether the picker works inside nested frames on every browser: only code and unit tests read.
- The exact placeholder text of the edit field (constant DESCRIBE_CHANGE_PLACEHOLDER not opened).
- Which model handles the request in Local mode.
