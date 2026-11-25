---
id: "F078-02"
type: "feature"
title: "Model-matched composer controls"
aliases: ["Model-dependent composer controls", "Effort slider and thinking toggle", "Reasoning options", "Unsupported parameter handling", "Attachment compatibility banner", "Media settings by model"]
area: "78 UI gating and adaptation components"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "partial", chrome: "partial"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S78.02", "S78.03", "S78.04", "S78.05", "S78.06", "S78.25", "S78.26"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-chat-turn-pipeline", "SYS-inference-providers", "SYS-local-inference", "SYS-files-artifacts-and-storage", "SYS-shared-ui-and-design", "surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "api:GET /api/llm/v1/models", "api:POST /api/llm/v1/chat/completions", "F078-01", "F078-03"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F078-02 Model-matched composer controls

Shows composer controls only when the chosen model supports them: effort levels, thinking, file types, image and video limits. The server refuses unsupported sampling values and clamps effort to what the model, plan and workspace allow. On web, a model change that strands attachments shows a banner with switch or remove.

Area: [78. UI gating and adaptation components](README.md). Requirement items: [S78.02](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7802), [S78.03](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7803), [S78.04](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7804), [S78.05](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7805), [S78.06](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7806), [S78.25](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7825), [S78.26](../../10-requirements/capabilities/078-ui-gating-and-adaptation-components.md#s7826).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | partly built | partly built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Reads each model's capability record and shows only the effort marks, thinking switch, media options and attachment types it can take. The server checks the request again: it drops or clamps effort and refuses unsupported sampling parameters.

**Why it exists.** A control that the model ignores is misleading, and a parameter a provider rejects makes the whole request fail. One catalog drives every screen so a model swap needs no screen edit (doc: AGENTS.md §4).

**Who uses it.** Anyone choosing a model in the composer; developers calling the chat API; CLI users setting effort or temperature.

**Problems it solves**

- A slider offers effort levels the model rejects.
- A model that cannot read images is sent an image.
- Sampling values break a model that does not take them.

**Use cases**

- Pick a model with an effort ladder on web: the slider shows only that model's marks.
- Attach a PDF then switch to a text-only model: a banner offers Use Auto, Remove attachments or Choose a compatible model.
- Send top_p to a model that rejects it through the API: 400 unsupported_parameter.
- On the CLI set --temperature for a model that rejects sampling: the CLI leaves it out.

## 2. User experience

**Where to find it**

- Web and Desktop: composer footer model menu, effort slider and thinking switch (apps/web/features/chat/components/Composer/ComposerFooter.tsx:1305-1321); attachment banner above the input (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5434-5480).
- Mobile: effort button 'Reasoning effort: <level>' and slider panel in the composer (apps/mobile/src/features/chat/components/ComposerEffort.tsx:34-58); model row thinking toggle (apps/mobile/src/features/model-picker/components/ModelRow.tsx:72-74); Add to chat sheet for media.
- CLI: model picker popup with an effort bar shown only for reasoning models (apps/cli/src/tui/widgets/model_picker.rs:290-301).
- VS Code: command 'Code: Set Reasoning Effort' and model switch warning (apps/extension-vscode/package.json:470-475; apps/extension-vscode/src/core/commandSetup.ts:1359-1370).
- Chrome: effort control state from the managed model picker (apps/extension/src/features/cloud-bridge/managedModelPicker.ts:49-58, 337-339).

**Before you start**

- A selected model with catalog capability data.
- For plan-gated effort levels, a known plan tier.

**Screens and controls**

- Effort marks, with plan-gated marks separated from allowed ones (ComposerFooter.tsx:1311-1314).
- Thinking switch hidden for models that do not expose it (ComposerFooter.tsx:1321).
- Attachment banner buttons 'Use Auto', 'Remove attachments', 'Choose a compatible model' (ChatComposerNew.tsx:5459, 5469, 5477).
- Free-model note 'This free model accepts images only...' (ChatComposerNew.tsx:5442-5443).

**Journey**

1. 1. Person opens the model menu and picks a model.
2. 2. The footer recomputes effort marks, thinking switch and media options from the catalog.
3. 3. Person attaches files; unacceptable types are refused with a notice (web ChatComposerNew.tsx:2270-2287; mobile attachmentValidation.ts:98-123).
4. 4. If the model later changes and attachments no longer fit, a banner appears and send is blocked (ChatComposerNew.tsx:3593).
5. 5. Person chooses Use Auto, picks a compatible model, or removes the files.
6. 6. On send the app sends effort and options; the server clamps effort and refuses unsupported parameters.

**What the person sees and gets**

- Banner text naming the problem, for example "The selected model can't read the attached image. Switch to Auto, choose an image-capable model, or remove the image." (ChatComposerNew.tsx:5445).
- Toast 'Could not save the model for this conversation. The previous model remains active.' (ComposerFooter.tsx:1161-1163).
- API error 400 unsupported_parameter with the parameter name (request-processor.ts:5159-5163).

**Settings**

- Per-conversation or global effort and thinking values (ComposerFooter.tsx:1014-1031; mobile useScopedEffort EffortSlider.tsx:57-76).
- Workspace maximum reasoning effort (packages/contracts/types/src/enterprise/workspace-controls.ts:77-85).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web effort marks come from the model's catalog ladder; marks the plan does not allow are separated and the control exists only with an explicit ladder (ComposerFooter.tsx:1311-1321).
- Web attachment conflict is computed from image and PDF attachments against vision capability; send is blocked while it holds (ChatComposerNew.tsx:1542-1562, 3593).
- Web banner gives three choices and does not delete attachments by itself (ChatComposerNew.tsx:5434-5480).
- Web local model with attachments is a separate conflict (ChatComposerNew.tsx:1589).
- Server refuses unsupported sampling parameters with 400 unsupported_parameter, built from the model's rejected list and the route's accepted list (apps/web/app/api/llm/v1/chat/completions/lib/request-parameters.ts:48-71; request-processor.ts:5153-5164).
- Server drops effort the model does not support and clamps it to plan and workspace maximum (request-processor.ts:1826-1839, 5827-5835).
- Server refuses too many images and unsupported image detail (request-processor.ts:5131-5146).
- Models API publishes accepted request parameters per model (apps/web/app/api/llm/v1/models/route.ts:60-61, 117-119).
- Mobile effort steps come from the model's effort ladder only (apps/mobile/src/features/model-picker/components/EffortSlider.tsx:32-36) and the request maps thinking to thinking_mode (apps/mobile/services/streaming.ts:637-642).
- Mobile attachments are checked by destination (device or Cloud) and by model image count (apps/mobile/src/features/chat/utils/attachmentValidation.ts:154-180, 189-205).
- Mobile image requests with a reference image check the image model's edit support and name capable models (apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts:177-190, 213-225).
- CLI maps effort to the nearest supported level, sends it only where the route takes it, and drops temperature for models that reject sampling (apps/cli/src/models/streaming.rs:619-690).
- CLI picker shows the effort bar only for reasoning models whose provider supports effort (apps/cli/src/tui/widgets/model_picker.rs:290-301).
- VS Code snaps effort to the model's levels and warns before a switch that loses image reading, tools or context (apps/extension-vscode/src/features/model-picker/modelConstants.ts:347-377; apps/extension-vscode/src/core/commandSetup.ts:1359-1370).
- Chrome derives effort options and gated marks from the model reasoning record and plan (apps/extension/src/features/cloud-bridge/managedModelPicker.ts:337-339).

**Incomplete**

- Mobile file acceptance depends on destination (device or Cloud), not on the selected model's file types, apart from the image-count limit (attachmentValidation.ts:154-180). The brief marks it done.
- VS Code gives a warning on model switch but no attachment keep or remove choice (commandSetup.ts:1359-1370).
- Media settings (duration, size, aspect) were not opened in code for mobile, CLI and VS Code; brief says VS Code missing.

**Present but disconnected or switched off**

- nothing found

**Not available**

- Attachment keep-or-remove choice after a model change on mobile, CLI, VS Code and Chrome (brief S78.25).
- Attachment file-type gating and media settings on VS Code (brief S78.03, S78.06).
- Chrome attachment-type gating (brief S78.03).

## 4. Required behaviour

**Established requirements**

- Composer controls (effort, thinking, attachment options) appear, change or disappear by selected model. (source: brief S78.02)
- Accepted file types depend on what the model can read. (source: brief S78.03)
- Reasoning options match the model and unsupported levels are not sent. (source: brief S78.04)
- Sampling options offered or sent depend on the model. (source: brief S78.05)
- Media settings offered depend on the selected media model. (source: brief S78.06)
- After switching to a model that cannot use the attachments, the user chooses to keep them (by switching model) or remove them. (source: brief S78.25)
- Parameters the model cannot take are removed or corrected before sending. (source: brief S78.26)
- Model IDs and capabilities come from the generated catalog, never typed into screens. (source: doc: AGENTS.md §4)

**Acceptance criteria**

1. Selecting a model with no effort ladder removes the effort slider on web, mobile and CLI.
2. Selecting a model with an effort ladder shows only its marks.
3. An image attached with a text-only model blocks send and shows the banner with the three choices on web.
4. 'Remove attachments' empties the attachment list; 'Use Auto' switches the model and clears the banner.
5. An API call with top_p to a model that rejects it returns 400 unsupported_parameter naming top_p.
6. An effort above the plan or workspace maximum is sent reduced, not as typed.
7. The CLI request body has no temperature for a model that rejects sampling.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief wording 'the server strips' is only true for effort; for sampling the server refuses the request [inferred from request-processor.ts:5153-5164].
- Mobile 'done' for accepted types likely means destination checks, not per-model checks [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Make the server and apps use the same message for an unsupported sampling parameter, or strip it, and state which.
- [proposed] Add the attachment keep/remove choice to mobile and Chrome, or record that the banner is web-only.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | ComposerFooter | `apps/web/features/chat/components/Composer/ComposerFooter.tsx` | Model menu, effort marks, thinking switch, locks. |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Attachment conflict, banner, media mode limits, send blocking. |
| service | request-parameters | `apps/web/app/api/llm/v1/chat/completions/lib/request-parameters.ts` | Accepted and unsupported sampling parameters per model and route. |
| service | request-processor effort and parameter checks | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | resolveRequestEffort, clamp, unsupported_parameter, too_many_images. |
| endpoint | GET /api/llm/v1/models | `apps/web/app/api/llm/v1/models/route.ts` | Publishes model capabilities and accepted request parameters. |
| service | canonical request | `apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts` | Builds the provider request including temperature. |
| schema | Workspace controls | `packages/contracts/types/src/enterprise/workspace-controls.ts` | Reasoning effort ladder and clamp function. |
| component | ComposerEffort (mobile) | `apps/mobile/src/features/chat/components/ComposerEffort.tsx` | Effort button, panel and hook. |
| component | EffortSlider (mobile) | `apps/mobile/src/features/model-picker/components/EffortSlider.tsx` | Effort steps from the model ladder and scoped storage. |
| service | streaming (mobile) | `apps/mobile/services/streaming.ts` | Request body with thinking and effort. |
| service | attachmentValidation (mobile) | `apps/mobile/src/features/chat/utils/attachmentValidation.ts` | File checks by destination, count and model image limit. |
| service | resolveMobileImageGenerationRequest | `apps/mobile/src/features/chat/actions/resolveMobileImageGenerationRequest.ts` | Blocks reference-image requests the image model cannot edit and names alternatives. |
| component | AddToChatSheet (mobile) | `apps/mobile/src/features/chat/components/AddToChatSheet.tsx` | Media options sheet named in the brief; not opened. |
| component | CLI model picker | `apps/cli/src/tui/widgets/model_picker.rs` | Effort bar visibility. |
| service | CLI streaming effort and temperature | `apps/cli/src/models/streaming.rs` | effort_level, reasoning_wire, effective_temperature. |
| service | VS Code model constants | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | supportedEffort and describeModelSwitchLosses. |
| command | VS Code setModel flow | `apps/extension-vscode/src/core/commandSetup.ts` | Warns before a model switch that loses abilities. |
| service | Chrome managed model picker | `apps/extension/src/features/cloud-bridge/managedModelPicker.ts` | Effort control state and gated efforts. |
| test | Composer footer reasoning flyout test | `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.reasoning-flyout.test.tsx` | Covers the effort flyout. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Picker reads model capability and effort ladder from the shared catalog package. | device | ComposerFooter.tsx:1305-1321; EffortSlider.tsx:32-36 |
| Attachment admission checks type and size locally. | device | ChatComposerNew.tsx:2270-2287; attachmentValidation.ts:98-123 |
| Conflict banner computes from attachments and model vision flag; send is blocked. | device | ChatComposerNew.tsx:1554-1562, 3593 |
| Request goes to the chat route with effort, thinking and sampling. | our servers | apps/mobile/services/streaming.ts:541-542 |
| Server clamps effort and refuses unsupported parameters or too many images. | our servers | request-processor.ts:5131-5164, 5827-5835 |
| Provider adapter translates reasoning for the chosen provider. | outside service | packages/ai/providers/anthropic/src/translate.ts (named in brief S78.05, not opened) |
| CLI builds the request itself and sends effort only where the route accepts it. | device | apps/cli/src/models/streaming.rs:619-690 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Effort and thinking choice | Web thinking store per conversation or global; mobile agent-control store per conversation or default | unknown | unknown |
| Attachments staged in composer | Composer state in the app | No until sent | Cleared by 'Remove attachments' (ChatComposerNew.tsx:5463-5466) |

**Models and providers.** All options come from the model registry (capabilities, reasoning ladder, rejected sampling lists). Each provider adapter turns the same effort into its own wire field. The catalog, not the screen, is the source (doc: AGENTS.md §4).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Controls render without sign-in; Cloud requests need an account. |
| Permissions | Workspace owners can cap reasoning effort (workspace-controls.ts:77-85). |
| Subscription | Some effort marks are plan-gated: splitEffortsByEntitlement separates allowed from gated marks (ComposerFooter.tsx:1311-1314); the server clamps with clampEffortToEntitlement (request-processor.ts:1837). |
| Limits and metering | Image count per request is limited per model (request-processor.ts:5131-5146); attachment size and file count limits come from server attachment_limits (apps/mobile/src/features/billing/store.ts:107-108). |
| Feature flags | none found in the code for the controls themselves. |
| Model compatibility | Vision, thinking, effort ladder, rejected sampling parameters and image edit support are per-model catalog fields. |
| Provider restrictions | The accepted parameter list depends on the route harness (request-parameters.ts:48-58). |
| Local mode | Mobile Local mode uses the device limit instead of the Cloud limit (attachmentValidation.ts:35-39) and checks that Office files are not readable on the device (attachmentValidation.ts:121-123). Mobile local models report supportsThinking false (apps/mobile/src/features/model-picker/service.ts:154). Web with a local model blocks attachments entirely (ChatComposerNew.tsx:1589, 3596). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Model has no effort ladder | Slider hidden | ComposerFooter.tsx:1320; EffortSlider.tsx:33 |
| Stored effort not supported by new model | Snapped to default or first supported step | EffortSlider.tsx:42-50; ComposerFooter.tsx:1333-1338 |
| Attachment conflict | Send blocked, banner shown with three actions | ChatComposerNew.tsx:3593, 5434-5480 |
| Image mode | Attached picture is not a chat conflict; checked against image model edit support | ChatComposerNew.tsx:1547-1556, 1586 |
| Save of the new model fails | Previous model stays; toast explains | ComposerFooter.tsx:1160-1163 |
| Offline on send | Offline reason shown, send not made | ChatComposerNew.tsx:3588-3591 |
| Attachment still preparing at send | Send is deferred until ready | ChatComposerNew.tsx:3598-3600 |
| Accessibility | Banner has role alert; mobile effort button has an accessibility label and hint | ChatComposerNew.tsx:5436; ComposerEffort.tsx:34-38 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/chat/components/Composer/__tests__/ComposerFooter.reasoning-flyout.test.tsx`: Effort flyout in the footer.
- `apps/mobile/__tests__/ComposerEffort.test.tsx`: Mobile effort control.
- `apps/mobile/__tests__/turn-effort.test.ts`: Effort carried into a turn.
- `apps/mobile/src/features/chat/utils/__tests__/attachmentValidation.destination.test.ts`: Attachment checks by destination.
- `apps/mobile/__tests__/attachment-validation.test.ts`: Mobile attachment validation.
- `packages/contracts/types/src/__tests__/reasoning-settings.test.ts`: Reasoning settings resolution.
- `packages/contracts/types/src/__tests__/reasoning-availability.test.ts`: Reasoning availability by model.
- `apps/web/lib/hooks/useChatStream.reasoning-settings.test.tsx`: Reasoning settings sent from web.
- `packages/ui/unified-chat/src/components/__tests__/ChatInput.reasoningEffort.test.tsx`: Shared chat input effort.
- `apps/desktop/src/lib/__tests__/modelCapabilityGates.test.ts`: Desktop model capability gates.
- `apps/extension-vscode/src/__tests__/reviewEffort.test.ts`: VS Code effort for review.

**Test scenarios**

- **Effort follows the model**
  1. Open the web picker.
  2. Pick a model with a ladder, then one without.
  - Expected: Slider shows only the first model's marks, then disappears.
- **Attachment conflict**
  1. Attach a PDF.
  2. Switch to a model that cannot read documents.
  3. Press send.
  4. Use each banner button in turn.
  - Expected: Send does nothing; banner offers Use Auto, Remove attachments, Choose a compatible model; each does what it says.
- **Unsupported sampling parameter via API**
  1. Call the chat route with top_p for a model that rejects it.
  - Expected: 400 with code unsupported_parameter and param top_p.
- **Effort above plan**
  1. Request an effort mark above the plan through the API.
  - Expected: Server clamps it to the plan limit; the turn runs.
- **CLI temperature**
  1. Run the CLI with --temperature on a model that rejects sampling.
  2. Inspect the request.
  - Expected: No temperature field is sent.
- **Mobile Cloud file type**
  1. On mobile in Cloud mode attach a HEIC photo.
  - Expected: Refusal names the format and tells the person to retake it with the in-app camera.

**Where to look when it fails**

- Error code unsupported_parameter, too_many_images, image_detail_unsupported.
- Web console toast on model save failure.
- CLI: effort_reaches_model result (apps/cli/src/models/streaming.rs:668).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/web/078-ui-gating-and-adaptation-components.md)
- Desktop: [70-qa/test-plans/desktop/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/desktop/078-ui-gating-and-adaptation-components.md)
- Mobile: [70-qa/test-plans/mobile/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/mobile/078-ui-gating-and-adaptation-components.md)
- CLI: [70-qa/test-plans/cli/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/cli/078-ui-gating-and-adaptation-components.md)
- VS Code: [70-qa/test-plans/vscode/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/vscode/078-ui-gating-and-adaptation-components.md)
- Chrome: [70-qa/test-plans/chrome/078-ui-gating-and-adaptation-components.md](../../70-qa/test-plans/chrome/078-ui-gating-and-adaptation-components.md)

## 10. Gaps and dependencies

- **Server refuses unsupported sampling parameters rather than correcting them; brief says remove or correct.** Affects: API callers and any app that sends sampling values. Evidence: request-processor.ts:5153-5164. Work needed: Decide strip or refuse and align the brief and apps.
- **No attachment keep-or-remove choice on mobile, CLI, VS Code, Chrome.** Affects: Those four apps. Evidence: brief S78.25. Work needed: Build the choice or accept a block message.
- **Mobile accepted file types do not depend on the selected model, only on destination.** Affects: Mobile. Evidence: attachmentValidation.ts:154-180. Work needed: Add per-model type checks or reword the requirement.
- **Media settings and attachment-type gating absent on VS Code; Chrome attachment-type gating absent.** Affects: VS Code, Chrome. Evidence: brief S78.03, S78.06. Work needed: Decide if these apps need them.
- **Media options by model were not verified in code for mobile, CLI and web video.** Affects: Mobile, CLI, Web. Evidence: brief names ChatComposerNew.tsx:4921, videogen.ts:65, image.rs:100; not opened. Work needed: Read and test those paths.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-chat-turn-pipeline
- SYS-inference-providers
- SYS-local-inference
- SYS-files-artifacts-and-storage
- SYS-shared-ui-and-design
- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- api:GET /api/llm/v1/models
- api:POST /api/llm/v1/chat/completions
- F078-01
- F078-03

## Unknown

- How media duration, size and aspect options are limited per model on each app (not opened).
- Whether effort and thinking choices sync between devices.
- What the AddToChatSheet does for media options on mobile (not opened).
- Whether Chrome gates attachments by model (brief says missing; not searched in depth).
