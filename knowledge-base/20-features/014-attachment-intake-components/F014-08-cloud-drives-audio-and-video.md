---
id: "F014-08"
type: "feature"
title: "Cloud drives, audio and video"
aliases: ["Cloud-file picker", "Add from Google Drive", "Audio attachment", "Video attachment", "S14.09", "S14.13", "S14.14"]
area: "14 Attachment intake components"
available_on: []
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "missing", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S14.09", "S14.13", "S14.14"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "file:packages/contracts/cloud-contracts/src/chat-attachment-policy.json", "api:POST /api/projects/{id}/knowledge-files/google-drive", "F014-11", "SYS-connectors-plugins-and-skills", "SYS-voice-and-media", "SYS-model-catalog-and-routing"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F014-08 Cloud drives, audio and video

Cloud-drive browsing and audio or video attachments for chat messages do not exist in any app. The accepted file-type list has no audio or video, so such files are refused with a notice naming the file. A Google Drive picker exists only for project knowledge on the web, not for chat attachments.

Area: [14. Attachment intake components](README.md). Requirement items: [S14.09](../../10-requirements/capabilities/014-attachment-intake-components.md#s1409), [S14.13](../../10-requirements/capabilities/014-attachment-intake-components.md#s1413), [S14.14](../../10-requirements/capabilities/014-attachment-intake-components.md#s1414).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Describes the gap: a person cannot browse Google Drive, OneDrive or Dropbox from the chat composer, and cannot attach audio or video for the model to read.

**Why it exists.** The brief lists these as required (S14.09, S14.13, S14.14) and marks them missing everywhere. A founder decision says audio-file upload is not built on the phone because the web has none (doc: docs/decisions/2026-09-27-founder-decisions.md, D-2026-09-28-28).

**Who uses it.** Anyone who wants to bring a drive file or a recording into a chat; today none can.

**Problems it solves**

- Documents the refusal behaviour so testers expect it
- Separates the project-knowledge Drive picker from chat attachments

**Use cases**

- A user drops an MP3 on the web composer and gets a notice that the type is unsupported.
- A user wants a Drive spreadsheet in chat and must download it first.
- A project owner adds Drive files to project knowledge from the Sources panel (not chat).

## 2. User experience

**Where to find it**

- Chat composer, all apps: no Drive, OneDrive or Dropbox entry (grep of apps/web/features/chat, apps/mobile/src/features/chat, apps/extension/src/side_panel.ts found none).
- Web project Sources panel, separate feature: add-sources dialog entry 'Google Drive' with the line 'Pick files from your Drive' (apps/web/features/projects/components/AddSourcesModal.tsx:302).

**Before you start**

- Project Drive picker: connectors released and a connected Google account; otherwise the dialog returns to a connect step (apps/web/features/projects/components/SourcesPanel.tsx:248, :267-270; AddSourcesModal.tsx:34).

**Screens and controls**

- Web chat: an unsupported file shows the notice '"name" has an unsupported file type (type).' (apps/web/features/chat/hooks/use-attachments.ts:~185 case 'unsupported').
- Chrome: '$FILE$ cannot be attached. Attach a PNG, JPEG, WebP or GIF image, a PDF, or a text or Markdown file.' (apps/extension/_locales/en/messages.json:1458).
- Phone: '"name" isn’t a supported file type. Try an image, PDF, Word, Excel, PowerPoint, text, CSV, Markdown, or code file.' (apps/mobile/src/features/chat/utils/attachmentValidation.ts:~124).

**Journey**

1. The person picks or drops an audio or video file.
2. The type check fails.
3. A notice names the file and the reason; no chip is added.

**What the person sees and gets**

- A per-file notice (web, phone, Chrome); a grey failed chip with the reason in the name (VS Code: 'unsupported binary attachment', ChatStateManager.ts:2221); a CLI line 'is not an image, PDF or Office document' (apps/cli/src/tui/tui_app.rs:~852).

**Settings**

- none found

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Refusal of audio and video by the type check on every app (list in packages/contracts/cloud-contracts/src/chat-attachment-policy.json:14-33 has image, PDF, text, code, Office types only).
- Project knowledge Google Drive picker on web: fetches picker config, lets the user choose files, posts the ids, reports per-file success or failure (apps/web/features/projects/components/SourcesPanel.tsx:243-290).

**Incomplete**

- The Drive picker is not offered in the chat composer; the shared chat input menu has an optional 'Add from Google Drive' item, but no host was found passing it (packages/ui/unified-chat/src/components/AttachmentMenu.tsx:763-771; grep of apps and packages found only the project Sources panel using a prop of that name).

**Present but disconnected or switched off**

- packages/ui/unified-chat AttachmentMenu 'Add from Google Drive' and 'Add from GitHub' items render only when a host passes a handler (AttachmentMenu.tsx:604, :763); no caller found.

**Not available**

- Cloud-drive picker for chat attachments: web, desktop, phone, CLI, VS Code, Chrome.
- Audio attachment and video attachment: all six apps. The voice-call attachment helper accepts only image/* and application/pdf (apps/web/features/chat/lib/voice-attachments.ts:10).
- Video generation mode takes images as input, not video (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2236-2250).

## 4. Required behaviour

**Established requirements**

- The user can browse a cloud drive (Google Drive, OneDrive, Dropbox) from the composer and attach a file from it. (source: brief S14.09)
- The user can attach an audio file and the model receives it. (source: brief S14.13)
- The user can attach a video file and the model receives it. (source: brief S14.14)
- Audio-file upload is not built on the phone because the web has none. (source: doc: docs/decisions/2026-09-27-founder-decisions.md (D-2026-09-28-28))
- Each advertised format either yields usable model input or an explicit unsupported state. (source: doc: docs/product/requirements.md (test row W04))

**Acceptance criteria**

1. Attaching an audio file on web shows a notice naming the file and 'unsupported file type'.
2. Attaching a video file on the phone in Cloud mode shows the 'isn't a supported file type' alert.
3. No chat composer shows a Drive, OneDrive or Dropbox entry on any app.
4. Project Sources 'Google Drive' is the only Drive picker and works only for project knowledge.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because the owner's decision ties phone audio upload to web parity, any build should start on web [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Decide per app whether the brief rows S14.09, S14.13 and S14.14 stay required; the leaders' coverage should be re-checked against docs/product/competitive-guidance.md before building.
- [proposed] If built, reuse the project Drive picker flow for chat and register new types in chat-attachment-policy.json only.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | chat-attachment-policy.json | `packages/contracts/cloud-contracts/src/chat-attachment-policy.json` | Single list of accepted MIME types and extensions; no audio or video. |
| service | chat-attachments contract | `packages/contracts/cloud-contracts/src/chat-attachments.ts` | isSupportedChatAttachment and resolveChatAttachmentMimeType decide acceptance (lines 302-350). |
| hook | useAttachments | `apps/web/features/chat/hooks/use-attachments.ts` | Raises the 'unsupported' issue and notice on web and desktop. |
| service | isAcceptableAttachment | `apps/mobile/src/features/chat/utils/attachmentValidation.ts` | Phone type check and refusal text (line 95). |
| service | admitComposerDocument | `apps/extension/src/side_panel.ts` | Chrome type check and notice (line 10210; composerDocumentMimeType). |
| service | attachFiles handler | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | VS Code refuses non-text, non-image files (line 2221). |
| service | stage_image_path_with | `apps/cli/src/tui/tui_app.rs` | CLI refuses files that are not image, PDF or Office (line 836). |
| component | SourcesPanel handleAddFromGoogleDrive | `apps/web/features/projects/components/SourcesPanel.tsx` | Project knowledge Drive picker (line 243). |
| component | AddSourcesModal | `apps/web/features/projects/components/AddSourcesModal.tsx` | Dialog entry 'Google Drive' gated by connectorsReleased (line 34, 302). |
| endpoint | POST /api/projects/{id}/knowledge-files/google-drive | `apps/web/app/api/projects/[id]/knowledge-files/google-drive` | Receives chosen Drive file ids for a project (called at SourcesPanel.tsx:255). |
| component | AttachmentMenu (shared) | `packages/ui/unified-chat/src/components/AttachmentMenu.tsx` | Optional Google Drive and GitHub items that need a host handler (lines 604, 763). |
| service | voice-attachments | `apps/web/features/chat/lib/voice-attachments.ts` | Voice attachment accepts only image and PDF. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A file is chosen or dropped. | device | apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2223 |
| The device compares its MIME type or extension with the policy list; audio and video fail. | device | packages/contracts/cloud-contracts/src/chat-attachments.ts:302-350 |
| A notice is shown and nothing is uploaded. | device | apps/web/features/chat/hooks/use-attachments.ts:186-205 |
| The upload client also refuses an unsupported type before any network call as a second guard. | device | packages/contracts/cloud-contracts/src/managed-cloud-chat-attachments-client.ts:344-349 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Refused file | Not stored | No | Nothing kept |

**Models and providers.** No audio or video reaches any model. Whether a provider could take audio is outside this code and unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Not applicable: the refusal happens before any account call on web and phone; Chrome upload needs sign-in (apps/extension/_locales/en/messages.json spDocumentSignInRequired). |
| Permissions | none found in the code |
| Subscription | none found in the code; the policy list is the same for every plan. |
| Limits and metering | none found in the code for audio or video. |
| Feature flags | Project Drive picker depends on connectorsReleased (AddSourcesModal.tsx:34). |
| Model compatibility | not applicable; no audio or video is sent. |
| Provider restrictions | none found in the code |
| Local mode | Phone Local mode also refuses: 'isn’t supported on this device; switch to AGI Cloud for Office files' applies to Office types, and audio or video fail the parseable-document check (apps/mobile/src/features/chat/utils/attachmentValidation.ts:~124-128). Web and desktop on-device models refuse every attachment. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Audio or video dropped on web | Notice naming the file and type; no chip. | apps/web/features/chat/hooks/use-attachments.ts:185-190 |
| Mixed batch | Supported files are attached and the notice lists refused names ('Attached N of M files. Not attached: ...'). | use-attachments.ts:222-245 |
| Video item in the Library | Shown with a video glyph on web; the phone picker hides videos. | ComposerFilesMenu.tsx:73-75; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:407 |
| Drive not configured (project panel) | Error 'Adding files from Google Drive is not available yet.' | SourcesPanel.tsx:245-247 |
| Drive not connected (project panel) | Returns to a connect step. | SourcesPanel.tsx:248, :267-270 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/contracts/cloud-contracts/src/__tests__/chat-attachment-upload-parity.test.ts`: Upload parity of the type policy (titles not read in full).
- `packages/ui/unified-chat/src/components/__tests__/AttachmentMenu.addPlugins.test.tsx`: Shared attachment menu items (titles not read in full).
- `apps/web/features/chat/hooks/__tests__/useAttachments.refusals.test.tsx`: Refusal by name and reason, wrong type versus too large.

**Test scenarios**

- **Audio refused on web**
  1. Drop an MP3 on the web composer.
  - Expected: A notice names the file as an unsupported type; no chip.
- **Video refused on phone**
  1. Cloud mode, tap File, choose an MP4.
  - Expected: Alert 'Attachment not added' with the unsupported-type reason.
- **No drive entry in the composer**
  1. Open the plus menu on web and the sheet on phone.
  - Expected: No Drive, OneDrive or Dropbox entry.
- **Project Drive picker**
  1. Open a project, Sources, Add, Google Drive with a connected account.
  - Expected: Picked files are posted and success or per-file failure is reported.

**Where to look when it fails**

- Notice text names the refused file.
- Project Drive failures: toast text from SourcesPanel.tsx:279-283.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No cloud-drive picker in any chat composer.** Affects: All six apps. Evidence: brief S14.09; greps found none. Work needed: Product decision, then build with connector scopes.
- **No audio or video attachment path.** Affects: All six apps. Evidence: chat-attachment-policy.json:14-33. Work needed: Add types to the policy, extraction or provider pass-through, size limits, model capability checks.
- **The shared chat input menu has Drive and GitHub items nobody wires.** Affects: Any host of the shared menu. Evidence: AttachmentMenu.tsx:604, :763. Work needed: Wire or remove the dead items (AGENTS.md section 9 forbids dead controls).
- Not built on: Web, Desktop, Mobile, CLI, VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- file:packages/contracts/cloud-contracts/src/chat-attachment-policy.json
- api:POST /api/projects/{id}/knowledge-files/google-drive
- F014-11
- SYS-connectors-plugins-and-skills
- SYS-voice-and-media
- SYS-model-catalog-and-routing

## Unknown

- Whether any provider route in this product could accept audio or video input; not read.
- Whether the shared AttachmentMenu is mounted by any app today.
- How OneDrive or Dropbox would be connected; no code found.
- The exact line of the web 'unsupported' notice is cited as approximately 185; read from the switch in use-attachments.ts.
