---
id: "F012-06"
type: "feature"
title: "Image and video entries"
aliases: ["Create image", "Create video", "Image mode", "Video mode", "Media mode", "/image"]
area: "12 New-chat experience"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S12.12", "S12.13"]
depends_on: ["SYS-voice-and-media", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage", "SYS-files-artifacts-and-storage", "SYS-chat-turn-pipeline", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F012-06 Image and video entries

Switches the next message to image or video generation so the send creates media. Web and Desktop have 'Create image' and 'Create video' rows in the plus menu, with badges and reasons when blocked, and /image. Mobile has the same names in 'Add to chat'. CLI has /image on managed access. VS Code and Chrome have none.

Area: [12. New-chat experience](README.md). Requirement items: [S12.12](../../10-requirements/capabilities/012-new-chat-experience.md#s1212), [S12.13](../../10-requirements/capabilities/012-new-chat-experience.md#s1213).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Puts the composer in image or video mode; the send starts generation instead of a chat reply, with settings such as aspect ratio.

**Why it exists.** Media generation is costly and needs explicit intent and model choice (brief S12.12, S12.13).

**Who uses it.** People creating pictures or clips; plan holders with the media capabilities.

**Problems it solves**

- Choosing generation instead of chat.
- Seeing why generation is blocked.
- Knowing what input a video accepts.

**Use cases**

- Click Create image, type a prompt and send.
- Attach a picture to edit it in image mode.
- Click Create video and see that attached files are not sent unless they are PNG, JPEG or WebP.
- In CLI run /image a red bicycle.

## 2. User experience

**Where to find it**

- Web and Desktop (Electron): plus menu rows 'Create image' and 'Create video' (ComposerPlusMenu.tsx:160-161,1299-1301); '/image' slash command (slashCommands.ts:46-52).
- Mobile: 'Add to chat' sheet rows 'Create image' and 'Create video' (AddToChatSheet.tsx:927,943), cloud only.
- CLI: '/image <prompt>' on managed access only (tui_app.rs:1094-1100,5576).
- VS Code and Chrome: none found (brief says missing).

**Before you start**

- Capability canUseImages or canUseVideoGeneration and plan capability image_generation or video_generation (AddToChatSheet.tsx:331-342; ChatComposerNew.tsx:1057-1071).
- A media model available in the deployment.
- Not a free-trial session on web (ChatComposerNew.tsx:1070-1071).

**Screens and controls**

- Row badges: checking, retry, unavailable or an upgrade badge (ComposerPlusMenu.tsx:334-360).
- Hover title: 'Free video availability could not be checked. Click to retry.', 'This deployment is not ready for video generation.', or the entitlement hint (ComposerPlusMenu.tsx:317-332).
- Mobile: model list for the active kind, aspect ratio, resolution, duration, 'Transparent background', cost estimate; indicator 'Create an image'/'Create a video' on the composer (chat.tsx:493-495).
- Persistent paywall or free-limit card with a dismiss control (WebChatPage.tsx:5337-5352).

**Journey**

1. Open a new chat.
2. Choose Create image or Create video (or /image).
3. Optionally attach a picture and choose model and options.
4. Type the prompt and send.
5. The app starts generation, shows progress, then the media appears in the chat.
6. Leave the mode or send another prompt.

**What the person sees and gets**

- Notices: 'Video generation works from your prompt only. Attached files are not sent to the video model. Leave video mode first if you want to send this file to the chat model.' (ChatComposerNew.tsx:2229).
- 'Video takes PNG, JPEG or WebP images only...' (line 2240).
- 'Image mode takes images only...'.
- Mobile alert when a request is blocked (chat.tsx:558-560).
- Generated image or video card.

**Settings**

- Mobile aspect ratio, resolution, duration and transparent background in the chat view store.
- Model choice for media kind.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web rows with gate title and badge logic (ComposerPlusMenu.tsx:317-360,840-865).
- Web /image slash command with several unavailable notices (ChatComposerNew.tsx:3216-3248).
- Video attachment limits and notices (ChatComposerNew.tsx:2222-2262).
- Web paywall and free-limit cards dismissible; persisted refusals are deleted server side, legacy synthetic ones locally (WebChatPage.tsx:5337-5358).
- Mobile image and video rows, models, options and sends with blocked-request alerts and reset after a send (AddToChatSheet.tsx:331-342,927-960; chat.tsx:543-716).
- CLI /image only when access is managed (tui_app.rs:1094-1100).

**Incomplete**

- Web has no /video slash command (slashCommands.ts list has no video).
- Whether media mode ends after one send on web is not traced; mobile resets the choice after sending (chat.tsx:571,690).

**Present but disconnected or switched off**

- Mobile rows behind FEATURES.imageGen and FEATURES.videoGen (AddToChatSheet.tsx:332,338).

**Not available**

- Video on CLI; image and video on VS Code and Chrome (brief).

## 4. Required behaviour

**Established requirements**

- The user can enter an image-creation mode whose send generates an image. (source: brief S12.12)
- The user can enter a video-creation mode whose send starts a video generation. (source: brief S12.13)
- A video row can be disabled with a reason shown. (source: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:317-332)
- Video mode does not send attached files to the model; accepted inputs are PNG, JPEG or WebP. (source: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2229,2240)
- Paywall and free-limit cards stay in the chat until dismissed. (source: apps/web/features/chat/pages/WebChatPage.tsx:5337-5358)

**Acceptance criteria**

1. Plus menu 'Create video' is disabled with a reason before availability is known.
2. In video mode attaching a PDF is refused with the PNG/JPEG/WebP notice.
3. In image mode attaching a non-image is refused with the image notice.
4. Sending in image mode produces an image, not a chat reply.
5. Dismissing a paywall card removes it and it does not return on reload for persisted refusals.
6. Mobile Local mode shows no image or video rows.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Cost and quota for generation come from the plan capability, with micro-dollar estimates on mobile (AddToChatSheet.tsx:303-322) [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add /video to the slash list for parity.
- [proposed] Offer image on VS Code and Chrome only if the owner wants it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ComposerPlusMenu media rows | `apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx` | ImageRow, VideoRow, gate title and badge. |
| component | ChatComposerNew media handlers | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | handleCreateVideoFromMenu, attachment rules, /image. |
| hook | useMediaModelAvailability | apps/web/features/chat/hooks/useMediaModelAvailability.ts (not found) (not found) | Whether media models exist in this deployment (test file exists beside). |
| hook | usePromotionalMediaModels | apps/web/features/chat/hooks/usePromotionalMediaModels.ts (not found) (not found) | Free media offer status (test file exists beside). |
| screen | WebChatPage handlers | `apps/web/features/chat/pages/WebChatPage.tsx` | onGenerateImage, onGenerateVideo, handlePaywallDismiss. |
| config | slash commands | `packages/ui/unified-chat/src/lib/slashCommands.ts` | /image. |
| component | unified-chat media mode | `packages/ui/unified-chat/src/hooks/useChat.ts` | Shared media mode state (test useChat.mediaMode.test.tsx exists). |
| component | AddToChatSheet media rows | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Create image, Create video, model catalog, options. |
| screen | Mobile chat tab media send | `apps/mobile/app/(app)/(tabs)/chat.tsx` | runImageGenerationTurn and runVideoGenerationTurn. |
| service | mobile mediaMode actions | `apps/mobile/src/features/chat/actions/mediaMode.ts` | resolveMediaModelId. |
| command | CLI /image | `apps/cli/src/tui/tui_app.rs` | Image command and managed-only visibility. |
| service | CLI cloud image | `apps/cli/src/cloud/image.rs` | Image generation client (referenced as crate::cloud::image). |
| test | video input test | `apps/web/features/chat/components/Composer/ChatComposerNew.videoInputImages.test.tsx` | Video input image rules. |
| test | image persistence test | `apps/web/features/chat/pages/__tests__/WebChatPage.image-persistence.test.tsx` | Image persistence in the page. |
| test | mobile video duration test | `apps/mobile/__tests__/ChatTabVideoDuration.test.tsx` | Video duration on the chat tab. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Availability of media models and free offers is checked before the row is usable. | our servers | ComposerPlusMenu.tsx:317-332; ChatComposerNew.tsx:2675-2683 |
| Choosing the row sets image or video mode in the composer on the device. | device | ChatComposerNew.tsx:2659-2700 |
| On send, the page calls onGenerateImage or onGenerateVideo instead of the chat send. | device and our servers | WebChatPage.tsx:7693-7694 passes the handlers; mobile chat.tsx:573,692 start the generation turns |
| The generation request is made to the managed media service, which uses an outside model provider. | outside service | AddToChatSheet.tsx:60 ManagedMediaVideoGenerationRequestSchema (managed media); provider endpoints not opened |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Generated image or video and its prompt | Conversation message with tool type metadata; mobile library | Through the account | Persisted refusals are deleted through the saved-message delete (WebChatPage.tsx:5345-5348); other retention unknown |

**Models and providers.** Image and video models come from the catalog slot for that kind (resolveMediaModelId); available aspect ratios, resolutions and durations depend on the chosen model (AddToChatSheet.tsx:269-326). No model identifiers are written here.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; not available to free-trial web sessions. |
| Permissions | canUseImages, canUseVideoGeneration. |
| Subscription | Plan capabilities image_generation and video_generation; upgrade badge and hint shown otherwise; free promotional offers are checked (ChatComposerNew.tsx:3236-3247). |
| Limits and metering | Video input image limit (videoInputLimit) and duration choices per model; cost estimate on mobile; exact quotas not read. |
| Feature flags | Mobile FEATURES.imageGen, FEATURES.videoGen; web deployment media availability. |
| Model compatibility | Options depend on the model's declared aspect, quality and duration support. |
| Provider restrictions | Image edit support depends on the provider (supportsManagedMediaImageEdit, AddToChatSheet.tsx:271). |
| Local mode | Mobile Local hides the media rows (cloud required, AddToChatSheet.tsx:333,339). Web and Desktop Electron have no Local mode. CLI /image needs managed access. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Plan not verified | Notice 'Couldn't verify your plan. Retrying…' or 'Checking your plan…'. | ChatComposerNew.tsx:2661-2667 |
| Availability check failed | Notice and retry on click. | ChatComposerNew.tsx:2675-2682 |
| Wrong file type in video or image mode | Refused with a notice. | ChatComposerNew.tsx:2238-2262 |
| Too many video images | Only up to the limit attach; notice says how many. | ChatComposerNew.tsx:2244-2252 |
| Blocked request (mobile) | Alert with title and message; plan-required with a free offer path. | chat.tsx:558-560,620-680 |
| Paywall card | Dismissible; persisted refusal rows deleted. | WebChatPage.tsx:5337-5358 |
| Cancel | CLI: Esc stops an image (tui_app.rs:5578). Others not traced. | tui_app.rs:5578 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/ChatComposerNew.videoInputImages.test.tsx`: Video input image handling (name; body not opened).
- `apps/web/features/chat/hooks/useMediaModelAvailability.test.tsx`: Media availability hook.
- `apps/web/features/chat/hooks/usePromotionalMediaModels.test.tsx`: Free media offers.
- `packages/ui/unified-chat/src/hooks/__tests__/useChat.mediaMode.test.tsx`: Shared media mode state.
- `packages/ui/unified-chat/src/components/__tests__/ChatInput.mediaMode.test.tsx`: Shared input in media mode.
- `apps/mobile/__tests__/ChatTabVideoDuration.test.tsx`: Mobile video duration.
- `apps/mobile/__tests__/ChatTabImageReferences.test.tsx`: Mobile image references.

**Test scenarios**

- **Video blocked reason**
  1. Open web chat on an account without video.
  2. Hover Create video.
  - Expected: Title shows the entitlement hint and an upgrade badge.
- **Video file refused**
  1. Enter video mode.
  2. Attach a PDF.
  - Expected: Notice says PNG, JPEG or WebP only; file not attached.
- **Image send**
  1. Create image; type a prompt; send.
  - Expected: An image result, not a chat reply.
- **Dismiss paywall**
  1. Trigger a free-limit card.
  2. Dismiss; reload.
  - Expected: Card gone.
- **CLI**
  1. Managed access: /image a red bicycle.
  - Expected: Image saved; Esc stops.
- **Mobile Local**
  1. Local mode; open Add to chat.
  - Expected: No media rows.

**Where to look when it fails**

- Web: composer local notice text; billing policy errors.
- Mobile: alert text from blocked request codes.
- CLI: describe_last output (/image last).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/012-new-chat-experience.md](../../70-qa/test-plans/web/012-new-chat-experience.md)
- Desktop: [70-qa/test-plans/desktop/012-new-chat-experience.md](../../70-qa/test-plans/desktop/012-new-chat-experience.md)
- Mobile: [70-qa/test-plans/mobile/012-new-chat-experience.md](../../70-qa/test-plans/mobile/012-new-chat-experience.md)
- CLI: [70-qa/test-plans/cli/012-new-chat-experience.md](../../70-qa/test-plans/cli/012-new-chat-experience.md)

## 10. Gaps and dependencies

- **No /video slash command** Affects: Web, Desktop. Evidence: slashCommands.ts:30-80 lists no video. Work needed: Add or record.
- **Media entry missing on VS Code and Chrome; video missing on CLI** Affects: VS Code, Chrome, CLI. Evidence: brief S12.12-S12.13. Work needed: Owner decision.
- **Whether media mode lasts one send on web** Affects: Web, Desktop. Evidence: not traced. Work needed: Trace and test.
- **Brief cites stale lines and a mobile file name that differs** Affects: Documentation. Evidence: TaskChips.tsx not found; AddToChatSheet.tsx holds the rows. Work needed: Regenerate brief.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-voice-and-media
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage
- SYS-files-artifacts-and-storage
- SYS-chat-turn-pipeline
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- mode:cloud

## Unknown

- Server endpoints for image and video generation.
- Quotas and costs by plan.
- Whether web media mode persists after sending.
- Contents of the listed tests.
- Provider list behind the managed media service.
