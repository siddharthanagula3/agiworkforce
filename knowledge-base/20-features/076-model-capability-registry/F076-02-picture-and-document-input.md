---
id: "F076-02"
type: "feature"
title: "Picture and document input"
aliases: ["Image understanding", "Vision input", "Multiple-image input", "High-detail image inspection", "Native PDF input", "S76.03", "S76.04", "S76.05", "S76.06", "imageInput", "Vision chip", "Images filter", "Files filter"]
area: "76 Model-capability registry"
available_on: ["web", "desktop", "mobile", "cli", "vscode", "chrome"]
implementation: {web: "built", desktop: "built", mobile: "built", cli: "built", vscode: "built", chrome: "built"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "not seen by a person"}
requirement_items: ["S76.03", "S76.04", "S76.05", "S76.06"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-chat-turn-pipeline", "SYS-files-artifacts-and-storage", "SYS-inference-providers", "SYS-local-inference", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "api:POST /api/llm/v1/chat/completions", "api:GET /api/llm/v1/models", "file:apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts", "provider:openai", "surface:web", "surface:mobile", "surface:cli", "surface:vscode", "surface:chrome", "surface:desktop", "mode:cloud", "mode:local", "mode:own-key"]
basis: "code inspection"
second_reader: "9 of 13 sampled statements were correct; the others were corrected on this page"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F076-02 Picture and document input

Lets a person attach pictures and PDFs to chat. The catalog records which models read pictures and PDFs, how many pictures one request may carry, and which detail levels are accepted. Apps warn early; the server refuses a picture turn for a model that cannot read pictures instead of rerouting.

Area: [76. Model-capability registry](README.md). Requirement items: [S76.03](../../10-requirements/capabilities/076-model-capability-registry.md#s7603), [S76.04](../../10-requirements/capabilities/076-model-capability-registry.md#s7604), [S76.05](../../10-requirements/capabilities/076-model-capability-registry.md#s7605), [S76.06](../../10-requirements/capabilities/076-model-capability-registry.md#s7606).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built (this page lists unfinished parts) | built | not seen by a person |
| Desktop | partly built (this page lists unfinished parts) | built | not seen by a person |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | partly built (this page lists unfinished parts) | built | not seen by a person |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Checks every picture or PDF turn against the chosen model: picture ability, picture count, detail level and native PDF handling. Auto routing sends picture turns to vision models.

**Why it exists.** Providers reject a request that carries media the model cannot read. Checking against the catalog gives a clear message before money or time is spent.

**Who uses it.** Anyone attaching photos or PDFs on Web, Desktop, Mobile, CLI, Chrome and VS Code; API developers sending image_url parts.

**Problems it solves**

- A picture sent to a text-only model is refused with a clear message.
- Too many pictures are caught before sending.
- A PDF goes native only where the model and route accept it; otherwise it is turned into text.
- A detail value the model does not accept is refused.

**Use cases**

- A user photographs a receipt and asks a question on Mobile.
- A user attaches a PDF on Web and the model reads it natively.
- A CLI user attaches a screenshot and is told to switch to a vision model.
- A developer sends image_url parts with detail low or high to the API.

## 2. User experience

**Where to find it**

- Web: attach control in the composer (ChatComposerNew.tsx); picker chip 'Vision' on a model card (ModelCatalogue.tsx:100-110).
- Desktop: same as Web via the hosted web app (doc: AGENTS.md section 5); not verified in a desktop file.
- Mobile: the attach sheet; picker filter chips 'Images' and 'Files' (modelFilters.ts:26-35).
- CLI: attach by path in the interactive session; the TUI refuses images on a model without vision (tui_app.rs:850-858, 915-923).
- VS Code: image files in the chat panel become image inputs (ChatStateManager.ts:2212); the model switch warning says 'cannot read images you attach' (modelConstants.ts:352-354).
- Chrome: side panel composer images (side_panel.ts:1161); no client vision check was found.
- API: image_url content parts with optional detail (request-processor.ts:601-616).

**Before you start**

- A model that lists image or pdf input, or Auto.
- Signed in for Cloud; a Free plan promotional model may take images only (model-compatibility.ts:128; ChatComposerNew.tsx:1549, 5434-5445).
- For Local on Web: attachments are refused with a local model (ChatComposerNew.tsx:1589, 5333-5360).

**Screens and controls**

- Web: composer attachment chips; warning panel with buttons 'Use Auto', 'Remove attachments', 'Choose a compatible model' (ChatComposerNew.tsx:5434-5470).
- Mobile: composer attachment previews, an 'unreadable images' notice (ChatInput.tsx:543-547), picker filters Images and Files.
- CLI: staged attachment lines and error text in the TUI.
- API: detail field in image_url.

**Journey**

1. Choose a model that reads pictures (or Auto).
2. Attach a picture or PDF.
3. The app checks type, size and (Mobile, CLI) picture count; Web checks the model's vision flag.
4. Send.
5. The server refuses a picture turn if the resolved model cannot read pictures or the count or detail is not accepted; otherwise the model answers.

**What the person sees and gets**

- Web warning: "The selected model can't read the attached image. Switch to Auto, choose an image-capable model, or remove the image." (ChatComposerNew.tsx:5441-5449)
- Server refusal: 'The selected model cannot read images. Choose a vision-capable model.' code model_no_vision (request-processor.ts:5100-5113).
- Server refusal for count: 'The selected model takes up to N images in one request...' code too_many_images (request-processor.ts:5128-5144).
- Mobile: '<model> can read up to N images in one message. Remove K image(s) to send it.' (attachmentValidation.ts:188-200).
- CLI: '<model> does not accept images; switch to a vision model with /model first' (tui_app.rs:853-858).

**Settings**

- Web: attachment byte limits come from the plan (ChatComposerNew.tsx:945-951).
- API: image detail per request.
- CLI privacy mode decides whether a PDF stays native (agent/chat.rs:763-766).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Server refuses images for a model whose vision flag is false, after Auto has resolved the model (request-processor.ts:2865-2874, 5096-5113). The refusal is skipped for uncatalogued models: turnCarriesImagesTheModelCannotRead returns false when the model's capabilities are undefined (request-processor.ts:2865-2870).
- Picture count limit: the model row wins, else the route's harness limit (apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts:60-66); refusal too_many_images (request-processor.ts:5128-5144). The count check is skipped when the limit is null (request-processor.ts:5128-5129).
- Detail values: accepted set from the model row, default auto, low, high; 'auto' always passes (image-detail.ts:18-39); refusal image_detail_unsupported (request-processor.ts:5114-5127).
- Native PDF only when the model lists pdf input and the route accepts the PDF type; pages over the limit fall back to text (media-input.ts:80-100).
- Auto classifies a message with image or video attachments as multimodal (packages/ai/routing/src/classify.ts:163-166); the vision policy for the multimodal task type requires imageInput (packages/ai/model-registry/catalog/routing-policies.json:617-624).
- Free trial turn with a picture on a model without vision is refused with code free_trial_model_capability (request-processor.ts:4366-4400). The free-trial gate runs for free-region fallback and promotion turns as well as free-trial requests, and it applies before the general vision check (request-processor.ts:3680-3686, 4366-4400).
- Web warns before send and offers Auto or a compatible model (ChatComposerNew.tsx:1531-1562, 5434-5500); model switch check reports no_vision (model-compatibility.ts:196-201).
- Mobile checks picture count before send (chatExecutionStore.ts:2455; attachmentValidation.ts:188-200) and shows an unreadable-images notice (ChatInput.tsx:543-547).
- CLI checks picture count (agent/chat.rs:787-830) and refuses images on a model without vision in the TUI (tui_app.rs:850-858).
- Models API publishes image_detail and image_input (models/route.ts:62-112).

**Incomplete**

- High-detail inspection is API only; no app control sets detail (brief S76.05; request-processor.ts:601-616 shows the API field).
- VS Code and Chrome: no client-side picture count or vision check was found; the server check applies.
- Mobile applies the picture count only on the Cloud path (inside a branch in chatExecutionStore.ts near line 2455); not read in full.

**Present but disconnected or switched off**

- none found in the code

**Not available**

- Per-model maximum file, image, audio and video size is not recorded in the registry (brief S76.30: missing on all apps).
- VS Code: nothing is listed in the brief for multiple pictures or native PDF.

## 4. Required behaviour

**Established requirements**

- The registry records image input per model; the product shows it and refuses or reroutes image turns to models that cannot read images (S76.03). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.03)
- The registry records how many images a model accepts in one request and requests are checked against it (S76.04). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.04)
- The registry records which models support high-detail inspection and the product requests high detail where supported (S76.05). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.05)
- The registry records native PDF input per model and PDFs go natively to models that accept them (S76.06). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.06)
- Web and desktop, mobile and the CLI must not silently route Local content to cloud; a Local-to-BYOK move is an explicit fork. (source: doc: AGENTS.md section 6)

**Acceptance criteria**

1. Send a picture to an explicitly chosen text-only model through the API: HTTP 400 with code model_no_vision.
2. Send more pictures than the limit: HTTP 400 with code too_many_images naming the limit.
3. Send detail 'original' to a model that does not list it: HTTP 400 with code image_detail_unsupported; detail 'auto' always passes.
4. On Web attach a picture with a text-only model selected: the warning panel appears and Send is blocked until Auto, a compatible model or removal.
5. With Auto and a picture attached, the answering model has image input.
6. Attach a PDF to a model that lists pdf input: the PDF is sent natively; to one that does not, its text is sent instead.
7. On Mobile attach more pictures than the model limit: send is refused with the 'can read up to N images' message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Only API callers can ask for high detail today; apps use auto. [inferred from S76.05 status and the lack of any detail control in the apps read]
- The brief's 'refuses or reroutes' means refuse for an explicit model and reroute under Auto. [inferred]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show the picture limit in the web and VS Code pickers.
- [proposed] Add the same picture-count check to Chrome and VS Code before send.
- [proposed] Record per-model file and image size limits in the registry (S76.30).

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| config | model rows: imageInput, documentInput | `packages/ai/model-registry/catalog/models.curation.json` | Per-model picture count, detail values, PDF page limits. |
| config | harness media input | `packages/ai/model-registry/catalog/harnesses.json` | Per-route mediaInput (maxImagesPerRequest, documentMediaTypes). |
| service | media-input | `apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts` | maxImagesPerRequest, countImageParts, nativeDocumentAdmission. |
| service | image-detail | `apps/web/app/api/llm/v1/chat/completions/lib/image-detail.ts` | unsupportedImageDetail and refusal message. |
| service | request-processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Vision, count and detail refusals; free trial capability refusal; image_url schema. |
| service | chat-attachment-hydration | `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` | Turns stored attachments into model input parts (PDF handling). |
| service | canonical-request | `apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts` | Builds the provider-neutral request including documents. |
| service | OpenAI translate | `packages/ai/providers/openai/src/translate.ts` | Maps image parts and detail to the provider format (line 58). |
| service | Task classifier | `packages/ai/routing/src/classify.ts` | Marks image and video attachments as multimodal (lines 163-166). |
| config | routing policies | `packages/ai/model-registry/catalog/routing-policies.json` | Vision policy for the multimodal task type requires imageInput (lines 617-624). |
| component | ChatComposerNew | `apps/web/features/chat/components/Composer/ChatComposerNew.tsx` | Web attachment conflict panel and plan byte limits. |
| service | model-compatibility | `apps/web/features/chat/components/Composer/model-compatibility.ts` | Pre-switch check including no_vision. |
| component | ModelCatalogue | `apps/web/features/chat/components/Composer/ModelCatalogue.tsx` | Vision chip. |
| service | attachmentValidation | `apps/mobile/src/features/chat/utils/attachmentValidation.ts` | Mobile file checks, picture count refusal. |
| store | chatExecutionStore | `apps/mobile/stores/chat/chatExecutionStore.ts` | Applies picture count refusal before a cloud send (line 2455). |
| config | mobile model filters | `apps/mobile/src/features/model-picker/modelFilters.ts` | Images and Files filters. |
| component | mobile ChatInput | `apps/mobile/src/features/chat/components/ChatInput.tsx` | Unreadable images notice (lines 543-547). |
| service | CLI agent chat | `apps/cli/src/agent/chat.rs` | Native PDF decision and picture count refusal (lines 756-830); managed-mode upload decision (lines 3756-3775). |
| component | CLI TUI | `apps/cli/src/tui/tui_app.rs` | Refuses images for non-vision models. |
| service | VS Code chat state | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | Sends image inputs (line 2212). |
| service | VS Code switch warning | `apps/extension-vscode/src/features/model-picker/modelConstants.ts` | describeModelSwitchLosses warns about image loss (lines 347-366). |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Entry that runs request-processor. |
| endpoint | GET /api/llm/v1/models | `apps/web/app/api/llm/v1/models/route.ts` | Publishes image_detail and image_input. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The person attaches a file; the app checks type, size, plan limits and (Mobile, CLI) picture count; Web checks the vision flag. | device | ChatComposerNew.tsx:945-951, 1531-1562; attachmentValidation.ts:50-200; agent/chat.rs:787-830 |
| The app sends the turn with image parts or documents to the chat completions endpoint. | device and our servers | apps/mobile/services/streaming.ts; apps/web/app/api/llm/v1/chat/completions/route.ts |
| Auto resolves a vision model for image turns (multimodal task). | our servers | classify.ts:163-166; packages/ai/model-registry/catalog/routing-policies.json:617-624 |
| The server refuses on missing vision, count or detail (skipped for uncatalogued models and when the count limit is null); otherwise it decides native PDF versus text. | our servers | request-processor.ts:2865-2870, 5096-5144; media-input.ts:80-100 |
| The provider adapter maps image parts and detail to the provider format and the provider answers. | outside service | packages/ai/providers/openai/src/translate.ts:58 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Attachments and image parts | Sent with the turn; stored attachment records and hydration are handled in chat-attachment-hydration.ts (storage tables not read) | unknown | unknown; not established from the code read |
| Files and PDFs from the CLI in Managed privacy mode | Uploaded to AGI Cloud through upload_chat_attachment when can_upload = upload && managed && managed_accepts(...); documents leave the device in that mode (apps/cli/src/agent/chat.rs:3756-3775) | yes, uploaded in Managed privacy mode only | unknown; not established from the code read |

**Models and providers.** Image and PDF ability comes from the catalog row; the route's harness sets default limits. Provider adapters translate parts. Own-key (BYOK) and Local paths in the CLI keep PDFs native only when the model flag allows (agent/chat.rs:763-766); in Managed privacy mode the CLI does not keep PDFs native (same lines), and uploads files to AGI Cloud (agent/chat.rs:3756-3775).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud turns need sign-in. Local mobile turns with images need no account for the image check itself. |
| Permissions | Picture URLs are checked by an egress policy ('image_url blocked by egress policy', request-processor.ts:606-612). |
| Subscription | Attachment byte limits depend on the plan on Web (ChatComposerNew.tsx:949-951) and Mobile (attachmentValidation.ts:34-48). Free promotional models may accept images only or text only (model-compatibility.ts:128; ChatComposerNew.tsx:1549, 5434-5445). |
| Limits and metering | Picture count per request from model or route (media-input.ts:60-66). PDF pages from model or route (media-input.ts:80-100). Request size cap MAX_CHAT_COMPLETION_REQUEST_BYTES is 2,000,000 (packages/contracts/cloud-contracts/src/tool-call-limits.ts:8). |
| Feature flags | Free-trial capability gate applies when free trial is enabled (request-processor.ts:4366); it also runs for free-region fallback and promotion turns and before the general vision check (request-processor.ts:3680-3686, 4366-4400). |
| Model compatibility | Needs the vision flag for pictures and pdf in inputModalities for native PDF. |
| Provider restrictions | Harness documentMediaTypes lists the PDF media type per route; routes without it get text fallback (media-input.ts:80-100). |
| Local mode | Web with a local model: attachments are refused and the person is offered 'Switch to a cloud model' or remove (ChatComposerNew.tsx:1589, 5333-5360). Mobile Local: files up to the device ceiling, no per-message count or byte limit (attachmentValidation.ts:34-40); local model rows show 'Vision' when the on-device model reads pictures (service.ts:147). CLI: documents are uploaded to AGI Cloud only in Managed privacy mode (agent/chat.rs:3756). In other modes the PDF stays native if the model supports it, or becomes text on the device; a file already uploaded (a block with an asset_id) is replaced by the notice '[this file was uploaded to AGI Cloud and is not available in this mode]' outside Managed mode (agent/chat.rs:3725-3775). |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Picture on text-only model, explicit choice | Refused, not rerouted. | request-processor.ts:5100-5113 |
| Picture on an uncatalogued model | Not refused by the vision check (capabilities undefined); the count check is likewise skipped when the limit is null. | request-processor.ts:2865-2870, 5128-5129 |
| Picture under Auto | Routed to a model with image input. | classify.ts:163-166; packages/ai/model-registry/catalog/routing-policies.json:617-624 |
| Image attached before switching to a text-only model | Refused rather than dropped. | request-processor.ts:2860-2864 comment |
| Too many pictures | 400 too_many_images. | request-processor.ts:5128-5144 |
| Unsupported detail | 400 image_detail_unsupported. | image-detail.ts:18-39; request-processor.ts:5114-5127 |
| PDF pages over limit or route lacks PDF | Falls back to extracted text. | media-input.ts:80-100 |
| HEIC photo on Mobile Cloud | Rejected with a message to retake with the in-app camera. | attachmentValidation.ts:112-116 |
| Empty file on Mobile | Rejected as empty. | attachmentValidation.ts:100 |
| Free promotional model with other files | Warning offers Free Auto or remove. | model-compatibility.ts:128; ChatComposerNew.tsx:1549, 5434-5445 |
| Free-trial, free-region fallback or promotion turn with a picture on a model without vision | Refused by the free-trial gate (free_trial_model_capability) before the general vision check. | request-processor.ts:3680-3686, 4366-4400 |
| CLI file already uploaded, outside Managed privacy mode | Replaced by the notice that the file was uploaded to AGI Cloud and is not available in this mode. | apps/cli/src/agent/chat.rs:3725-3775 |
| Offline, timeout on attach | not handled in the code that was read; unknown. | not established |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.model-compatibility.test.ts`: Refuses images for a model that cannot read them, lets the turn through when it can, never refuses text-only turns, leaves uncatalogued models alone.
- `apps/web/features/chat/components/Composer/model-compatibility.test.ts`: Pre-switch compatibility checks (file exists; assertions not read).
- `apps/mobile/src/features/chat/utils/__tests__/attachmentValidation.imageLimit.test.ts`: Model override of picture limit before route limit; every override the catalog carries.
- `apps/mobile/src/features/chat/utils/__tests__/attachmentValidation.destination.test.ts`: Local versus cloud attachment destination rules (file exists; assertions not read).
- `apps/mobile/__tests__/gguf-vision-chain.test.ts`: On-device vision model chain (file exists; assertions not read).
- `apps/web/features/chat/components/Composer/ChatComposerNew.localAttachments.test.tsx`: Local attachment conflict on Web (file exists; assertions not read).
- `packages/contracts/cloud-contracts/src/__tests__/managed-media.test.ts`: Managed media contract (file exists; assertions not read).

**Test scenarios**

- **Refusal for no vision**
  1. POST a chat completion with an image_url part and a text-only model id.
  2. Read the response.
  - Expected: 400, code model_no_vision, message about choosing a vision-capable model.
- **Picture limit**
  1. Pick a model with a known maxImagesPerRequest.
  2. Send limit+1 pictures via API.
  - Expected: 400, code too_many_images with the limit in the message.
- **Detail value**
  1. Send detail 'original' to a model whose detailValues omit it.
  2. Then send detail 'auto'.
  - Expected: First: 400 image_detail_unsupported. Second: accepted.
- **Web attachment conflict**
  1. On Web localhost select a text-only model.
  2. Attach a picture.
  - Expected: Warning panel with Use Auto, Remove attachments, Choose a compatible model; Send blocked.
- **Mobile picture count**
  1. On Mobile pick a model with a picture limit.
  2. Attach limit+1 pictures and send.
  - Expected: Send refused with 'can read up to N images in one message'.
- **CLI image on non-vision model**
  1. In the CLI TUI select a non-vision model.
  2. Attach an image file.
  - Expected: Error says the model does not accept images and to use /model.

**Where to look when it fails**

- Error codes model_no_vision, too_many_images, image_detail_unsupported, free_trial_model_capability in API responses.
- Log 'Auto model resolved to actual model' (request-processor.ts:5092).
- Mobile state error text set in chatExecutionStore.ts:2455-2462.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/076-model-capability-registry.md](../../70-qa/test-plans/web/076-model-capability-registry.md)
- Desktop: [70-qa/test-plans/desktop/076-model-capability-registry.md](../../70-qa/test-plans/desktop/076-model-capability-registry.md)
- Mobile: [70-qa/test-plans/mobile/076-model-capability-registry.md](../../70-qa/test-plans/mobile/076-model-capability-registry.md)
- CLI: [70-qa/test-plans/cli/076-model-capability-registry.md](../../70-qa/test-plans/cli/076-model-capability-registry.md)
- VS Code: [70-qa/test-plans/vscode/076-model-capability-registry.md](../../70-qa/test-plans/vscode/076-model-capability-registry.md)
- Chrome: [70-qa/test-plans/chrome/076-model-capability-registry.md](../../70-qa/test-plans/chrome/076-model-capability-registry.md)

## 10. Gaps and dependencies

- **No app can request high image detail; only the API can.** Affects: All six apps.. Evidence: brief S76.05 status; no detail control found in the apps. Work needed: Decide the product rule, add a detail choice or default high where supported.
- **VS Code and Chrome have no client-side vision or picture count check.** Affects: VS Code, Chrome.. Evidence: no hit for capabilities.vision in apps/extension/src/side_panel.ts or VS Code attachment code; only cloudAgentClient.ts:101. Work needed: Add the shared check before send.
- **Registry has no per-model maximum file, image, audio or video size.** Affects: All apps and API.. Evidence: brief S76.30 (missing on all). Work needed: Add fields to the catalog and check them in every upload path.
- **The brief's line pointers for the CLI (chat.rs:643, 832; lib.rs:7701) and for request-processor lines are stale; real lines are listed in the map.** Affects: Engineers.. Evidence: agent/chat.rs:756-830. Work needed: Refresh the brief.

**Depends on**

- SYS-model-catalog-and-routing
- SYS-chat-turn-pipeline
- SYS-files-artifacts-and-storage
- SYS-inference-providers
- SYS-local-inference
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- api:POST /api/llm/v1/chat/completions
- api:GET /api/llm/v1/models
- file:apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts
- provider:openai
- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- surface:chrome
- surface:desktop
- mode:cloud
- mode:local
- mode:own-key

## Unknown

- Where attachments are stored and for how long.
- Whether Chrome and VS Code attachments show a client message on a refusal.
- Desktop behaviour beyond the hosted web app.
- Exact assertions of several listed test files (not read).
- Whether the CLI Managed-mode PDF path converts to text for every model.

## Second reader's check

A second reader checked 13 statements of this page against the code: 9 correct, 4 wrong or partly wrong, 0 could not be checked. The statements found wrong were corrected on this page; they are listed here for the record.

- **Partly wrong (section 7):** "Free promotional models may accept images only or text only (model-compatibility.ts:62-85)" The code shows: The behaviour exists, but model-compatibility.ts:55-90 holds only type declarations. The promotional text is at model-compatibility.ts:128. The images-only / text-only copy is at ChatComposerNew.tsx:5434-5445, driven by promotionalAttachmentConflict (1549). Section 2 repeats the bad citation. (apps/web/features/chat/components/Composer/model-compatibility.ts:128; ChatComposerNew.tsx:1549, 5434-5445). **Corrected:** Cite model-compatibility.ts:128 and ChatComposerNew.tsx:1549, 5434-5445.
- **Partly wrong (section 7):** "CLI Local privacy mode: documents are settled locally; not uploaded (agent/chat.rs:3733-3745)" The code shows: The cited lines handle a block that already has an asset_id. Managed mode leaves it alone. Other modes replace it with the text '[this file was uploaded to AGI Cloud and is not available in this mode]'. The no-upload rule is at about 3756: can_upload = upload && managed && managed_accepts(...). Managed mode uploads files to AGI Cloud via upload_chat_attachment. (apps/cli/src/agent/chat.rs:3725-3775). **Corrected:** The CLI uploads documents to AGI Cloud only in Managed privacy mode (chat.rs:3756). In other modes the PDF stays native if the model supports it, or becomes text on the device. A file already uploaded is replaced by a notice outside Managed mode.
- **Partly wrong (section 8):** "HEIC photo on Mobile Cloud rejected (attachmentValidation.ts:150-160); Empty file on Mobile rejected (attachmentValidation.ts:124)" The code shows: The behaviour is real but the lines are wrong. HEIC is at 112-116, applies when destination === 'cloud' and the MIME is not a chat image type. The empty-file check is at line 100 (fileSize === 0). Lines 120-126 are the supported-document check. (attachmentValidation.ts:100, 112-116). **Corrected:** Cite attachmentValidation.ts:112-116 for HEIC and :100 for an empty file.
- **Partly wrong (section 3/6):** "Auto classifies image attachments as multimodal, whose policy requires imageInput (classify.ts:163-166; routing-policies.json:611-618)" The code shows: classify.ts:163-166 returns multimodal for image/ or video/ attachments. The file is packages/ai/model-registry/catalog/routing-policies.json. Lines 611-618 show the end of screen_automation (it requires imageInput) and the opening of the vision policy. I did not read the vision policy's requirements past line 620. (packages/ai/routing/src/classify.ts:163-166; packages/ai/model-registry/catalog/routing-policies.json:606-620). **Corrected:** Give the full path and the vision policy block lines. Image and video attachments both classify as multimodal.

**Facts the page missed**

- CLI Managed privacy mode uploads PDFs and other files to AGI Cloud (can_upload = upload && managed && managed_accepts, then upload_chat_attachment). Documents leave the device in that mode. The page only says native PDF is not kept. apps/cli/src/agent/chat.rs:3756-3775.
- The server vision refusal is skipped for uncatalogued models (turnCarriesImagesTheModelCannotRead returns false when caps are undefined). The count check is skipped when the limit is null. The page's 'refuses a picture turn for a model that cannot read pictures' overstates this. request-processor.ts:2865-2870, 5128-5129.
- The free-trial gate runs for free-region fallback and promotion turns as well as free-trial requests, and it applies before the general vision check. request-processor.ts:3680-3686, 4366-4400.
