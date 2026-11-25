---
id: "F043-03"
type: "feature"
title: "Read the scene, troubleshoot from a photo and count objects"
aliases: ["Object counting", "Scene comparison", "Visual troubleshooting", "Photo troubleshooting", "S43.12", "S43.13", "S43.14"]
area: "43 Image and visual understanding"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S43.12", "S43.13", "S43.14"]
depends_on: ["F043-01", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-local-inference", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "mode:local", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F043-03 Read the scene, troubleshoot from a photo and count objects

The person attaches one or two pictures and asks how many items there are, what is different between two scenes, or what is wrong in a photo of a device or an error. No special code exists; the question and pictures go to a vision model, which answers. Local mobile mode gives only text from the picture.

Area: [43. Image and visual understanding](README.md). Requirement items: [S43.12](../../10-requirements/capabilities/043-image-and-visual-understanding.md#s4312), [S43.13](../../10-requirements/capabilities/043-image-and-visual-understanding.md#s4313), [S43.14](../../10-requirements/capabilities/043-image-and-visual-understanding.md#s4314).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built (this page lists unfinished parts) | partly built | not seen by a person |
| Desktop | built (this page lists unfinished parts) | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | built | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets a person ask counting, comparing and fault-finding questions about photos or screenshots, using the same attach-and-ask path as any image.

**Why it exists.** The brief requires counting, scene comparison and visual troubleshooting on every app (doc: knowledge-base/data/area-briefs/043-image-and-visual-understanding.md, S43.12 to S43.14). These are common reasons people use a camera with an assistant.

**Who uses it.** Everyday users with a phone, and developers with error screenshots.

**Problems it solves**

- Counting many similar items by eye.
- Spotting the difference between two photos.
- Finding what is wrong with a device or a screen without describing it.

**Use cases**

- Photograph a shelf and ask how many boxes are on it.
- Attach before and after photos and ask what changed.
- Photograph a router with blinking lights and ask what is wrong.
- Paste a screenshot of an error dialog in the CLI and ask for fix steps.

## 2. User experience

**Where to find it**

- Web and Desktop (hosted web app): plus menu row 'Add photos & files' (apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:147).
- Mobile: add-to-chat sheet 'Camera' and 'Photos' (apps/mobile/src/features/chat/components/AddToChatSheet.tsx:697-705) and the camera screen (apps/mobile/app/(app)/camera.tsx).
- CLI: /attach <file>, Ctrl+V, -f/--file (apps/cli/src/tui/tui_app.rs:6215-6275, 4095; apps/cli/src/lib.rs:227).
- VS Code: paste or drop in the sidebar composer (apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:7720, 7730).
- Chrome extension: side panel composer (apps/extension/src/side_panel.ts:14584).

**Before you start**

- A vision-capable model.
- For comparison, two or more images in one message within the model's image limit (apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts:60-66).

**Screens and controls**

- Attach controls and chips as in the single-image feature.
- Mobile camera screen has a prompt box and send button (camera.tsx); the exact labels were not read.

**Journey**

1. Take or pick one or two photos.
2. Attach both to the same message.
3. Ask 'how many', 'what is different' or 'what is wrong here'.
4. Send and read the answer.
5. If the answer is unsure, send a closer or sharper photo.

**What the person sees and gets**

- Model text answer.
- Refusal for too many images: 'The selected model takes up to N images in one request. Remove some images or split the request.' (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5138). CLI wording: '<model> can read up to N images in one message. Remove M to send it.' (apps/cli/src/agent/chat.rs:817-820).
- No confidence flag is shown.

**Settings**

- Model choice; image detail per request in the API (image-detail.ts:5).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Several images in one web message are all hydrated and sent; the count is checked against the model limit (apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts:654-676; request-processor.ts:5131-5147).
- CLI holds several staged images and counts staged plus earlier-held images against the model limit (apps/cli/src/agent/chat.rs:786-846).
- VS Code and its host accept up to 8 images per turn (apps/cli/src/app_server/developer_host.rs:132, 7549).
- Chrome extension checks the per-model image limit at attach (apps/extension/src/side_panel.ts:10177-10182).

**Incomplete**

- Nothing in the code counts, compares or diagnoses; results depend on the model (no code path found).
- Web and Desktop have no recorded live check (brief S43.12 to S43.14 Unfinished).
- Mobile Local mode cannot see the pictures, so counting, comparison and troubleshooting there rely on recognised text only (apps/mobile/stores/chat/chatExecutionStore.ts:1241-1262).

**Present but disconnected or switched off**

- nothing found

**Not available**

- Selecting a region of an image, crop and zoom, and annotated answers (brief S43.09 to S43.11).
- Confidence flags (brief S43.20).

## 4. Required behaviour

**Established requirements**

- User asks how many of something appear in an image and the vision model answers. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S43.12)
- User attaches two scenes and the model describes the differences. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S43.13)
- User shares a photo or screenshot of a problem and gets troubleshooting steps. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S43.14)
- Answers about images visibly flag uncertain readings. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S43.20)
- Capabilities that depend on the provider route or harness must not be described as intrinsic model abilities. (source: AGENTS.md section 4)

**Acceptance criteria**

1. Two images attached to one web message both reach the model and the answer compares them.
2. A message with more images than the model allows is refused with the model's limit and no model call is made.
3. The CLI refuses a send that passes the image limit and says how many to remove.
4. A photo of a device with a fault gets steps that refer to what is visible.
5. On mobile in Local mode the app says the model reads text, not the picture.
6. An uncertain answer is flagged (required; not met today).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Counting accuracy cannot be guaranteed by the product, so uncertainty marking matters here [inferred].
- Comparison needs the images in a stable order; chips show order on web and the CLI /attach list [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an optional 'ask me to confirm' note when the model reports a count over a threshold.
- [proposed] Add a regression set of counting and comparison photos to the live checks.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | request-processor image checks | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Counts images against the model limit and checks vision. |
| service | media-input | `apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts` | maxImagesPerRequest and countImageParts. |
| service | chat-attachment-hydration | `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` | Builds an image part for each attachment. |
| service | model-image | `apps/web/app/api/llm/v1/chat/completions/lib/model-image.ts` | Fits each image to the envelope. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Multi-attachment composer. |
| command | CLI attach | `apps/cli/src/tui/tui_app.rs` | Stage several images; /attach list and remove. |
| service | CLI image limit refusal | `apps/cli/src/agent/chat.rs` | image_limit_refusal counts staged and held images. |
| service | CLI developer host | `apps/cli/src/app_server/developer_host.rs` | Caps 8 images and 20,000,000 bytes per turn for VS Code. |
| component | VS Code composer webview | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | Multi-file drop and paste. |
| service | VS Code routing task | `apps/extension-vscode/src/integrations/routingTask.ts` | Marks image inputs as routing attachments. |
| component | Chrome side panel | `apps/extension/src/side_panel.ts` | Per-model image limit notice. |
| store | mobile chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Sends several image references, or Local OCR text. |
| component | mobile camera screen | `apps/mobile/app/(app)/camera.tsx` | Take a photo and ask a question about it. |
| component | AddToChatSheet | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Photos picker with multiple selection. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person attaches one or more photos and types the question. | device | apps/mobile/app/(app)/chat/[id].tsx:1575-1590 (multiple selection); ChatComposerNew.tsx:943-952; tui_app.rs:6215-6275 |
| Web and mobile Cloud upload each image and scan it. | our servers | apps/web/lib/server/chat-attachment-completion.ts:397-420 |
| The server hydrates each image into an image part, then checks the model reads images, the detail value and the image count. | our servers | chat-attachment-hydration.ts:654-676; request-processor.ts:5099-5147 |
| The vision model compares, counts or diagnoses and answers. | outside service | provider route decided by routing; request-processor.ts:5098 |
| CLI and VS Code: the images are encoded on the device and the image limit is checked before send. | device | apps/cli/src/agent/chat.rs:786-846; developer_host.rs:7549-7556 |
| Mobile Local: each image gets on-device OCR text appended to the prompt. | device | chatExecutionStore.ts:1241-1262, 2731-2735 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Attached images | Private storage (Cloud); memory (CLI, VS Code) | Cloud yes; others no | As in F043-01. |
| Answer text | Conversation records of the chosen mode | Per mode and app | Per conversation rules in SYS-sync-and-continuity (not read). |

**Models and providers.** A model with the vision capability and enough image slots; the image slot count comes from model metadata or the harness (media-input.ts:60-66). Result quality, including counting accuracy, is the model's. No provider is pinned here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Web and mobile Cloud need sign-in; other modes not established. |
| Permissions | Mobile camera permission for the Camera row. |
| Subscription | Same attachment limits as F043-01 (apps/web/lib/server/attachment-allowance.ts:83-97, 179). No counting or comparison entitlement exists in the code read. |
| Limits and metering | Image count per request from model or harness metadata (media-input.ts:60-66). CLI app-server: 8 images (developer_host.rs:132). Web 20 files per message (chat-attachment-policy.json:5). |
| Feature flags | none found in the code for counting, comparison or troubleshooting. |
| Model compatibility | Vision models only; models differ in image slots (request-processor.ts:5131). |
| Provider restrictions | Some routes allow fewer images; the harness table sets it (media-input.ts:60-66). |
| Local mode | Mobile Local uses OCR text only; counting and scene comparison of pixels is not possible there (chatExecutionStore.ts:1241-1262). Other apps in Local: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Too many images | Web code too_many_images 400; CLI refuses before send naming how many to remove; Chrome shows a model image-limit notice at attach. | request-processor.ts:5131-5147; apps/cli/src/agent/chat.rs:786-846; apps/extension/src/side_panel.ts:10177-10182 |
| One image becomes unreadable | Live turn fails with unreadable_attachment. | chat-attachment-hydration.ts:657-662 |
| Duplicate image | CLI refuses to attach an identical label twice with 'is already attached'. | tui_app.rs:877-879 |
| Model switched after attach | A turn with images on a model that cannot read them is refused, not silently dropped. | request-processor.ts:2860-2875 |
| Loading, retry, cancel, offline | Same as F043-01. | apps/mobile/src/features/chat/upload/uploadAttachment.ts:15-110 |
| Uncertain answer | not handled in the code; no flag exists. | brief S43.20 missing on all apps |
| Accessibility | Not established for counting or comparison specifically. | none found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.model-compatibility.test.ts`: Refuses an image turn for a non-vision model.
- `apps/web/app/api/llm/v1/chat/completions/lib/model-image.test.ts`: Each image is fitted or noted.
- `apps/cli/src/tui/tui_app.rs`: In-file tests for staged image chips and removal; the image limit refusal tests were not located.
- `apps/extension-vscode/src/__tests__/routingTask.test.ts`: Image inputs count as routing attachments (cases not read).

**Test scenarios**

- **Count objects**
  1. Attach a photo of a shelf on web.
  2. Ask how many boxes are visible.
  - Expected: A number with a reason; a vision model is used; no flag on confidence appears (current behaviour).
- **Compare two scenes**
  1. Attach two photos with one change.
  2. Ask what is different.
  - Expected: Both images sent; answer names the change.
- **Over the image limit**
  1. Attach more images than the selected model accepts.
  2. Send.
  - Expected: Web returns too_many_images; CLI refuses with the 'can read up to N images' text.
- **Troubleshoot a device photo on mobile Cloud**
  1. Use Camera in the add-to-chat sheet.
  2. Accept the upload consent.
  3. Ask what is wrong.
  - Expected: Image uploaded, answer refers to the visible device.
- **Mobile Local comparison**
  1. Use an on-device model with two photos.
  - Expected: Prompt carries OCR text for each; the answer cannot describe visual differences.

**Where to look when it fails**

- Error code too_many_images and model_no_vision.
- CLI message 'can read up to N images'.
- Server log for rejected attachments.
- No recorded live run for these cells.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/043-image-and-visual-understanding.md](../../70-qa/test-plans/web/043-image-and-visual-understanding.md)
- Desktop: [70-qa/test-plans/desktop/043-image-and-visual-understanding.md](../../70-qa/test-plans/desktop/043-image-and-visual-understanding.md)
- Mobile: [70-qa/test-plans/mobile/043-image-and-visual-understanding.md](../../70-qa/test-plans/mobile/043-image-and-visual-understanding.md)
- CLI: [70-qa/test-plans/cli/043-image-and-visual-understanding.md](../../70-qa/test-plans/cli/043-image-and-visual-understanding.md)
- VS Code: [70-qa/test-plans/vscode/043-image-and-visual-understanding.md](../../70-qa/test-plans/vscode/043-image-and-visual-understanding.md)
- Chrome: [70-qa/test-plans/chrome/043-image-and-visual-understanding.md](../../70-qa/test-plans/chrome/043-image-and-visual-understanding.md)

## 10. Gaps and dependencies

- **No confidence or uncertainty flag on counts and comparisons.** Affects: All apps. Evidence: brief S43.20. Work needed: Prompt and UI changes to mark uncertain readings.
- **No region selection to point at one object in a crowded photo.** Affects: Web, desktop, mobile, Chrome. Evidence: brief S43.09 missing. Work needed: Region picker in composers.
- **No live check on web and desktop.** Affects: Web and Desktop. Evidence: brief S43.12 to S43.14 Unfinished. Work needed: Record production runs.
- **Mobile Local cannot compare scenes.** Affects: Mobile Local. Evidence: chatExecutionStore.ts:1241-1262. Work needed: Local vision model or clear labelling.

**Depends on**

- F043-01
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-local-inference
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- mode:local
- mode:cloud

## Unknown

- Labels on the mobile camera screen.
- Whether CLI tests cover the image limit refusal.
- Any evaluation that measures counting accuracy.
- Whether Local runtimes on desktop and CLI read images.
