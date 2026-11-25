---
id: "F057-06"
type: "feature"
title: "Images and video"
aliases: ["Image generation", "generate_image", "Image editing", "edit_image", "Create image", "Video generation", "S57.16", "S57.17", "S57.18"]
area: "57 Tool catalog and invocation experience"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S57.16", "S57.17", "S57.18"]
depends_on: ["SYS-voice-and-media", "SYS-files-artifacts-and-storage", "SYS-subscriptions-entitlements-and-usage", "SYS-inference-providers", "SYS-chat-turn-pipeline", "SYS-shared-ui-and-design", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:chrome", "surface:vscode", "mode:cloud", "file:apps/web/app/api/media/image/lib/image-chat-tools.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F057-06 Images and video

The assistant can make one image from a description, or edit an attached or earlier image, during a reply. The AGI server runs it and shows the picture as a card. Web, Desktop and Mobile have it; the CLI can only generate when Managed; VS Code and Chrome do not. Video has no tool.

Area: [57. Tool catalog and invocation experience](README.md). Requirement items: [S57.16](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5716), [S57.17](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5717), [S57.18](../../10-requirements/capabilities/057-tool-catalog-and-invocation-experience.md#s5718).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | not stated on this page | built | not seen by a person |
| Mobile | built | built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built | not built | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Offers two tools to the model, generate_image (prompt, optional aspect ratio) and edit_image (prompt, optional earlier image id). The server runs the image pipeline, saves the picture to the person's Library and returns an image card. (apps/web/app/api/media/image/lib/image-chat-tools.ts:107-190, :347-440)

**Why it exists.** Pictures are part of everyday chat; the assistant should make one when asked without sending the person to another screen.

**Who uses it.** Web, Desktop and Mobile users on a plan with image generation; CLI users on Managed.

**Problems it solves**

- Switching to a separate image tool
- Editing a picture across several turns

**Use cases**

- Ask for a poster illustration.
- Attach a photo and ask to restyle it.
- Ask for a logo in a wide shape.
- Ask the CLI to save an image into the project folder.

## 2. User experience

**Where to find it**

- Web composer: image mode and a Create image menu entry; upgrade or a note when not allowed (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2620-2640, :3217-3220).
- Chat tool: the model calls generate_image when the message asks for a picture.
- Mobile: image card inside chat (apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx:607).
- CLI: generate_image tool saves files (apps/cli/src/features/exec/tools/mod.rs:1272-1340).

**Before you start**

- A plan with image generation: the tiers are pro, max, max_15x, team, team_premium and enterprise in code (packages/contracts/types/src/billing-catalog.ts:341, :356). The UI plan names differ (owner memory: renamed), so read the catalog.
- Image storage configured on the server (apps/web/app/api/media/image/lib/image-chat-tools.ts:113).
- Surface is web, desktop, mobile or chrome in the server table (image-chat-tools.ts:47-52).
- CLI: Managed session only (apps/cli/src/features/exec/tools/mod.rs:1282-1289).
- Edit: the image edit provider must be available and edit-capable (image-chat-tools.ts:100-104).

**Screens and controls**

- Image mode toggle with prompt box; attach an image to edit it (ChatComposerNew.tsx:1547-1580, :2237-2262).
- Upgrade prompt when the plan lacks image generation (ChatComposerNew.tsx:2621-2630).
- Image card with the picture (InteractiveCardBlock.tsx on Web and Mobile).
- Video: the menu entry exists but video is not offered as a chat tool (ChatComposerNew.tsx:2655).

**Journey**

1. Person asks for a picture in chat or in image mode.
2. The server decides if the request really wants a picture (intent check).
3. The model calls generate_image or edit_image.
4. The server runs the image pipeline and saves the picture.
5. An image card appears in the transcript.
6. The model replies in a sentence.

**What the person sees and gets**

- Image card headline 'Generated image' or 'Edited image' (image-chat-tools.ts:56-57).
- If the card cannot show: 'it is in the Library' message (image-chat-tools.ts:444-448).
- Refusal text when not requested: 'The user did not request a generated picture...' (image-chat-tools.ts:372-376).
- Plain failure message from the pipeline (image-chat-tools.ts:432-437).

**Settings**

- Plan and credits; aspect ratio from the model's list.
- Workspace model policy can refuse (apps/web/app/api/media/image/lib/image-chat-tools.ts imports model-policy-gate).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- generate_image and edit_image definitions, schemas and execution with intent classification (apps/web/app/api/media/image/lib/image-chat-tools.ts:107-190, :347-440).
- One image per call (image-chat-tools.ts:58).
- Edit uses the attached image, an earlier asset id, or the latest conversation image (image-chat-tools.ts:360-367 editSource).
- Edit is run through a fixed edit provider (image-chat-tools.ts:44).
- The tool loop runs the call and returns an interactive card (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2681-2705).
- CLI generate_image in Managed mode, saves to the working folder (apps/cli/src/features/exec/tools/mod.rs:1272-1340).
- Mobile and Web render the image card.

**Incomplete**

- CLI has no edit tool; VS Code and Chrome: brief says missing, but the server table lists chrome among allowed surfaces (image-chat-tools.ts:47-52), so a Chrome turn may be offered the tool; whether the extension renders the card was not established.

**Present but disconnected or switched off**

- Without image storage, a default provider or a plan with image generation, no tool is offered (image-chat-tools.ts:107-125).

**Not available**

- Video generation as a chat tool on any app (brief S57.18); web composer menu has a video entry but that is a separate mode (ChatComposerNew.tsx:2655).
- CLI image editing; VS Code image tools.

## 4. Required behaviour

**Established requirements**

- An image-generation tool runs during a turn and the image appears in the transcript (S57.16). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.16)
- An image-editing tool edits a supplied image and shows the result (S57.17). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.17)
- Video generation is not applicable on any app (S57.18). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S57.18)
- Image generation matrix: present on web, desktop, mobile unverified, cli present, vscode absent, chrome absent, api present. (source: doc: docs/product/surface-feature-matrix.md line 66 (column order not re-checked))

**Acceptance criteria**

1. On a plan with images, 'draw a red fox' produces one image card and a short reply.
2. On a plan without images, no generate_image tool is offered and the composer offers an upgrade.
3. Asking for text (an email) never calls the image tool; the call is refused with 'did not request a generated picture'.
4. Edit of an attached image returns an 'Edited image' card.
5. An edit asked with no source image is refused with the 'not available in this turn' message.
6. CLI generate_image in a Local or BYOK session returns the Managed-only message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Each call spends account credits as the tool description says ('Each image uses the account's credits.') (image-chat-tools.ts:132-135).
- Local mode would have no image generation [inferred: server only].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Align the brief with the server surface table for Chrome or remove chrome from it.
- [proposed] Add CLI edit_image if edit is wanted there.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | image chat tools | `apps/web/app/api/media/image/lib/image-chat-tools.ts` | Tool offer, definitions, execution, card. |
| service | managed image generation | `apps/web/app/api/media/image/lib/managed-image-generation.ts` | Runs the generation for chat. |
| service | image generation provider | `apps/web/app/api/media/image/lib/image-generation-provider.ts` | Default provider, catalog model and aspect ratios. |
| service | image job executor | `apps/web/app/api/media/image/lib/image-job-executor.ts` | Image jobs. |
| service | tool loop image branch | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Executes generate and edit (2681-2705). |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Offers the image tools (1444-1450). |
| config | image tool names and card kind | `packages/contracts/types/src/interactive-cards.ts` | GENERATE_IMAGE_TOOL_NAME, EDIT_IMAGE_TOOL_NAME, IMAGE_CARD_KIND. |
| config | plan capability table | `packages/contracts/types/src/billing-catalog.ts` | image_generation tiers (356). |
| service | intent classifier | packages/routing (not found) (not found) | classifyImageToolIntent decides if a picture is wanted (imported at image-chat-tools.ts:9). |
| component | web InteractiveCardBlock | `apps/web/features/chat/components/messages/InteractiveCardBlock.tsx` | Renders the image card. |
| component | web composer | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Image mode, upgrade, attachment rules. |
| component | mobile InteractiveCardBlock | `apps/mobile/src/features/chat/components/InteractiveCardBlock.tsx` | Image card on Mobile. |
| service | mobile card parsing | `apps/mobile/src/features/chat/utils/clarifyCard.ts` | Reads interactive cards for Mobile. |
| service | CLI generate_image | `apps/cli/src/features/exec/tools/mod.rs` | Managed-only image generation (1272). |
| service | CLI image client | `apps/cli/src/cloud/image.rs` | Calls the AGI image service from the CLI. |
| service | media storage | `apps/web/lib/server/media-storage.ts` | isImageStorageConfigured and saving to Library [inferred from import]. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The server decides at request time whether to offer the image tools: surface, plan, storage and default provider must all be ready. | our servers | apps/web/app/api/media/image/lib/image-chat-tools.ts:107-125; request-processor.ts:1444 |
| The model calls generate_image or edit_image. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2681-2705 |
| The server checks that the user's message asked for a picture and for an edit that a source image exists. | our servers | image-chat-tools.ts:370-425 |
| The server runs the image pipeline with the image provider, which is an outside service, using account credits. | outside service | image-chat-tools.ts:427-437 |
| The image is saved to the person's Library and an image card is returned. | our servers | image-chat-tools.ts:439-452 |
| The app renders the card in the transcript. | device | apps/web/features/chat/components/messages/InteractiveCardBlock.tsx:39 |
| CLI: the CLI sends the prompt to the person's AGI account and saves files in the working folder. | device and our servers | apps/cli/src/features/exec/tools/mod.rs:1308-1330 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Generated or edited image | server media storage, Library | across apps through the Library [inferred] | unknown |
| Image credit usage | usage ledger | server | unknown |
| CLI saved image | the working folder | no | as the person keeps it |

**Models and providers.** The chat model only writes the prompt and calls the tool; the image itself is made by a separate image provider chosen by the server's default and catalog (image-generation-provider.ts). Editing is tied to one provider and needs an edit-capable image model (image-chat-tools.ts:44, :100-104). Workspace model policy can refuse (image-chat-tools.ts:30-33).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; CLI needs Managed session with an AGI account. |
| Permissions | Workspace model policy and organisation controls (image-chat-tools.ts imports evaluateModelAccessForOrganization). |
| Subscription | image_generation capability needs one of the paid tiers listed in billing-catalog.ts:341, :356. Each image uses account credits (tool description). Video generation is a separate tier list (max_15x, enterprise) not wired as a chat tool (billing-catalog.ts:357). |
| Limits and metering | One image per call (image-chat-tools.ts:58); prompt length limit IMAGE_TOOL_PROMPT_MAX_LENGTH; credits per image (rate unknown). |
| Feature flags | Image storage configured; provider available (image-chat-tools.ts:113-125). Free promotional media offers exist in the composer (ChatComposerNew.tsx:2622-2625) [details unknown]. |
| Model compatibility | Any tool-capable chat model can call the tools; image input models help for attached images [inferred]. |
| Provider restrictions | Edit goes only through one fixed image provider (image-chat-tools.ts:44). |
| Local mode | Not available: the CLI refuses outside Managed (mod.rs:1282-1289); Mobile and Desktop on-device models have no image tool [none found in the code]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Not requested | Refused; no credits used. | image-chat-tools.ts:372-376 |
| No source image for edit | Refused with a plain message. | image-chat-tools.ts:413-421 |
| Plan missing, no storage, no provider | Tools not offered. | image-chat-tools.ts:107-125 |
| Payment or access error (402, 403) | Tool withdrawn for the turn (unavailable). | image-chat-tools.ts:59, :432-437 |
| Card cannot show | Tells the person it is in the Library. | image-chat-tools.ts:444-448 |
| Unsupported surface | 'Images cannot be made in this app.' | image-chat-tools.ts:369 |
| Checking availability | Composer notice 'Checking image model availability…'. | ChatComposerNew.tsx:2622-2624 |
| Offline and retry | not handled in the code read (unknown). | unknown |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/media/image/lib/image-generation-provider.workspace-scope.test.ts`: Provider scope per workspace.
- `apps/web/app/api/llm/v1/chat/completions/lib/model-image.test.ts`: Image handling for model input.
- `apps/web/e2e/chat-attachment-refusal-and-image-edit.spec.ts`: Browser flow of image edit and attachment refusal.
- `apps/web/e2e/chat-image-lightbox-stacking.spec.ts`: Image lightbox display.
- `apps/cli/src/cloud/image.rs`: 22 inline Rust tests for CLI image helper.

**Test scenarios**

- **Generate**
  1. On a plan with images ask 'draw a red fox'.
  - Expected: One image card, credits used, short reply.
- **Edit**
  1. Attach a photo.
  2. Ask 'make it black and white'.
  - Expected: An 'Edited image' card.
- **Text only**
  1. Ask for an email draft.
  - Expected: No image tool call.
- **Plan lacks images**
  1. Use a plan outside the image tiers; open Create image.
  - Expected: Upgrade prompt, no tool.
- **CLI BYOK**
  1. In a BYOK CLI session ask for an image.
  - Expected: Managed-only message.

**Where to look when it fails**

- Log from image pipeline via withMediaJobSpan (image-chat-tools.ts:22).
- Tool result unavailable flag for 402 and 403.
- Refusal texts quoted above.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/web/057-tool-catalog-and-invocation-experience.md)
- Desktop: [70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/desktop/057-tool-catalog-and-invocation-experience.md)
- Mobile: [70-qa/test-plans/mobile/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/mobile/057-tool-catalog-and-invocation-experience.md)
- CLI: [70-qa/test-plans/cli/057-tool-catalog-and-invocation-experience.md](../../70-qa/test-plans/cli/057-tool-catalog-and-invocation-experience.md)

## 10. Gaps and dependencies

- **No image-chat test file next to image-chat-tools.ts was found (only provider scope test).** Affects: All apps. Evidence: git ls-files apps/web/app/api/media/image/lib. Work needed: Add unit tests for intent refusal, edit source and withdrawn statuses.
- **Brief says Chrome has no image tools but the server surface table includes chrome.** Affects: Chrome. Evidence: image-chat-tools.ts:47-52. Work needed: Check whether the extension renders image cards; align brief or code.
- **CLI edit and VS Code images missing.** Affects: CLI, VS Code. Evidence: brief S57.16/S57.17. Work needed: Decide scope.
- **Mobile image generation matrix cell is unverified.** Affects: Mobile. Evidence: docs/product/surface-feature-matrix.md:66. Work needed: Run on device.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- SYS-voice-and-media
- SYS-files-artifacts-and-storage
- SYS-subscriptions-entitlements-and-usage
- SYS-inference-providers
- SYS-chat-turn-pipeline
- SYS-shared-ui-and-design
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:chrome
- surface:vscode
- mode:cloud
- file:apps/web/app/api/media/image/lib/image-chat-tools.ts

## Unknown

- Credit price per image.
- Whether Free users get promotional images in chat tools.
- Whether the Chrome extension renders image cards.
- Library retention of generated images.
- Which provider folder under packages/ai/providers backs the default image provider.
- Whether a Desktop Local model can produce images.
