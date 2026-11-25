---
id: "F043-07"
type: "feature"
title: "Choose how much detail the model sees"
aliases: ["Image detail", "detail setting", "image_url.detail", "image_detail (models list field)", "image_detail_unsupported", "Attach full resolution (/attach --full)", "PromptImageMode (ResizeToFit / Original)", "High-resolution versus reduced-resolution handling (S43.18)"]
area: "43 Image and visual understanding"
available_on: ["cli"]
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "built", vscode: "n/a", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "not seen by a person", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S43.18"]
depends_on: ["SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-api-and-contracts", "SYS-chat-turn-pipeline", "SYS-execution-boundaries", "SYS-subscriptions-entitlements-and-usage", "file:apps/web/app/api/llm/v1/chat/completions/lib/image-detail.ts", "file:crates/agiworkforce-utils-image/src/lib.rs"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F043-07 Choose how much detail the model sees

Lets the model's image reading level be chosen: auto, low, high or original. Developers set it per image on the Cloud chat API, and the web server refuses a value the chosen model does not accept. In the CLI a person can attach an image at full size. Web, desktop, mobile and Chrome show no detail choice.

Area: [43. Image and visual understanding](README.md). Requirement items: [S43.18](../../10-requirements/capabilities/043-image-and-visual-understanding.md#s4318).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | partly built (this page lists unfinished parts) | built | not seen by a person |
| VS Code | does not apply | does not apply | n/a |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Carries an image detail value (auto, low, high, original) from the request to the model provider, and refuses a value the model does not accept before the call (apps/web/app/api/llm/v1/chat/completions/lib/image-detail.ts:5-41; request-processor.ts:5115-5124). Separately, the CLI can attach an image without scaling it down (apps/cli/src/tui/tui_app.rs:5485, 6251-6258).

**Why it exists.** Brief S43.18 says images should be processed at a resolution suited to the task, with a high-detail versus reduced-detail choice honoured end to end. A higher level reads fine print better but costs more input; a lower level is cheaper and faster (the CLI message says full-size attach 'costs more input', tui_app.rs:6254-6256).

**Who uses it.** Developers calling AGI Cloud's OpenAI-style chat API (api:POST /api/llm/v1/chat/completions) and CLI users attaching images. Not exposed to ordinary people in the Web, Desktop, Mobile or Chrome apps (no control found; see gaps).

**Problems it solves**

- A request that asks for a detail level the model cannot honour fails fast with a clear message listing accepted values, instead of a provider error (image-detail.ts:37-41).
- Small text, dense charts and screenshots lose legibility when scaled down; the CLI 'full' attach keeps the original pixels (crates/agiworkforce-utils-image/src/lib.rs:103).
- Developers can discover which detail values a model accepts from the models list (apps/web/app/api/llm/v1/models/route.ts:101-117).

**Use cases**

- A developer sends a chart image with detail 'high' to a vision model through the chat API.
- A developer sends detail 'original' to a model whose registry entry lists it, for a dense screenshot.
- A developer sends 'original' to a model that does not list it and receives a 400 with code image_detail_unsupported.
- A CLI user types '/attach --full photo.png' to send an uncompressed photo of a circuit board.

## 2. User experience

**Where to find it**

- API (Cloud): optional detail field on each image_url content part of the chat request (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:616; apps/web/public/openapi.json:609).
- API: GET models list returns image_detail per model (apps/web/app/api/llm/v1/models/route.ts:59,117; openapi.json:493-499).
- CLI (terminal chat): slash command '/attach --full <image>' and plain '/attach <image>' (tui_app.rs:5485, 6251). The help line reads 'Attach it without scaling it down, for fine detail'.
- Web, Desktop, Mobile, VS Code, Chrome: no detail control found in the code read. Brief status: web, desktop, mobile, chrome missing; vscode n/a.

**Before you start**

- API: a Cloud API credential and a vision-capable model; a model that cannot read images gets 400 model_no_vision first (request-processor.ts:5100-5112).
- CLI: a vision-capable selected model, otherwise attach is refused with 'does not accept images; switch to a vision model with /model first' (tui_app.rs:852-859).
- The image file must be inside the workspace and a supported image type (tui_app.rs:842-851).

**Screens and controls**

- API: no screen; the detail enum is auto, low, high, original (request-processor.ts:616; image-detail.ts:5).
- CLI: the composer shows a chip labelled with the path and size; a full-size attach adds ', full resolution' to the chip (tui_app.rs:871-874).

**Journey**

1. API: build a message whose content is an array with a text part and an image_url part.
2. API: optionally set image_url.detail to auto, low, high or original.
3. API: send the request; the server checks image support, then the detail value, then the image count (request-processor.ts:5100-5135).
4. API: read the answer, or a 400 error naming the accepted values.
5. CLI: type '/attach --full <path>' (or '/attach <path>' for the scaled default).
6. CLI: see the confirmation 'Attached <chip>. It is sent without being scaled down, so it costs more input; /attach remove drops it.' (tui_app.rs:6254-6256).
7. CLI: type the question and send; '/attach remove' drops the staged image.

**What the person sees and gets**

- Refusal text: 'The selected model does not accept image detail "<value>". Use "a", "b" or "c".' with HTTP 400 and error code image_detail_unsupported (image-detail.ts:37-41; request-processor.ts:5120-5125).
- CLI confirmation message and chip described above.
- Models list shows image_detail only for models the registry records (models/route.ts:117).

**Settings**

- No user setting stores a detail preference in the code read [inferred from absence].
- Per-model accepted values come from the generated model catalog field imageInput.detailValues (packages/contracts/types/src/model-catalog.ts:750-755; packages/contracts/types/src/models.json:1038).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Cloud API accepts detail per image part and validates the enum auto|low|high|original (request-processor.ts:616).
- Refusal before the provider call for a value outside the model's accepted list; auto is always accepted; a model without a registry record accepts auto, low, high (image-detail.ts:10,25-31).
- Detail is carried to providers: wire content is turned into an image block with detail when it is one of the four values (packages/ai/provider-protocol/src/openai-wire-compat.ts:112-135) and OpenAI chat and responses translations write it back out (packages/ai/providers/openai/src/translate.ts:51-57; translate-responses.ts:54-60).
- Models list publishes accepted values as image_detail (models/route.ts:101-117).
- CLI full-size attach: Original mode skips the downscale (crates/agiworkforce-utils-image/src/lib.rs:103); default mode shrinks beyond 2048 by 768 bounds (lib.rs:20-22,34). Staging code at tui_app.rs:832-877; loader at apps/cli/src/lib.rs:8383-8395.
- Protocol type ImageDetail (auto, low, high, original) with default High exists in the shared Rust protocol (crates/agiworkforce-protocol/src/models.rs:796-803) and is parsed from metadata (models.rs:1690-1696).
- Chrome extension sets detail internally: 'high' for computer-use screenshots and 'auto' for cloud bridge attachments (apps/extension/src/features/computer-use/agentLoop.ts:214; apps/extension/src/features/cloud-bridge/freeTrialClient.ts:569).

**Incomplete**

- CLI: the image block carries only mime type and base64 data, with no detail field (apps/cli/src/lib.rs:8364-8368). So the CLI 'full' choice changes pixels sent, not a detail value; whether the CLI provider layer adds a detail value is unknown.
- Tauri desktop vision command accepts only low, high, auto and rejects 'original' (apps/desktop/src-tauri/src/sys/commands/vision.rs:335-342), while the managed cloud provider maps its detail enum to low, high, auto only (apps/desktop/src-tauri/src/core/llm/providers/managed_cloud_provider.rs:366-372). Desktop chat attachments are hard set to Auto (apps/desktop/src-tauri/src/sys/commands/chat/attachments.rs:465). The Tauri build is retained internal code (doc: AGENTS.md section 5).
- Web chat attachments hydrated on the server get no detail on the image part (chat-attachment-hydration.ts:671-676,704-705), so the provider default applies.
- The Chrome extension cloud-bridge reader rejects any detail other than auto, low, high (freeTrialClient.ts:645).

**Present but disconnected or switched off**

- No provider code under packages/ai/providers/anthropic or google referenced a detail field in my search; whether those providers honour or drop the value is unknown.

**Not available**

- No detail picker for people in Web, Desktop (Electron shows the hosted web app, doc: AGENTS.md section 5), Mobile or Chrome (brief S43.18 status missing).
- VS Code: not applicable per the brief.
- No upload-time automatic choice of detail based on task [inferred from absence].

## 4. Required behaviour

**Established requirements**

- Images are processed at a resolution suited to the task, with a high-detail versus reduced-detail choice honoured end to end. (source: S43.18 (brief))
- A detail value a model does not accept is refused before the call, naming the accepted values; auto is always accepted. (source: apps/web/app/api/llm/v1/chat/completions/lib/image-detail.ts:21-41; request-processor.ts:5115-5124)
- Do not hardcode what the repository already models (model capabilities); accepted detail values come from the generated catalog. (source: doc: AGENTS.md section 4)
- Documentation of a model capability is kept separate from route availability; image capabilities depend on provider route or AGI harness. (source: doc: AGENTS.md section 4)

**Acceptance criteria**

1. A chat API request with image detail 'original' on a model whose catalog lists it is accepted and the value reaches the provider request.
2. The same request on a model that does not list 'original' returns HTTP 400 with code image_detail_unsupported and a message listing the accepted values.
3. A request with detail 'auto' is never refused for detail.
4. A model with no catalog record accepts auto, low and high and refuses original.
5. GET models returns image_detail for models with a catalog record.
6. CLI '/attach --full <image>' on an image larger than the scaled bounds keeps the original width and height; '/attach <image>' scales it down.
7. CLI attach of an image while a non-vision model is selected is refused with a message naming /model.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Each app that lets a person attach an image should offer the same detail choice or a documented automatic choice [inferred from the parity requirement S43.18 listing web, desktop, mobile, chrome as missing].
- The refusal for an unaccepted value should also apply on routes other than the Cloud chat API, such as own-key calls [inferred; not found in code read].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a per-image or per-chat quality choice labelled in plain words in web chat, mobile and the extension, defaulting to Auto.
- [proposed] Make the CLI send an explicit detail value when staging a full-size image.
- [proposed] Let the desktop vision command and managed cloud provider accept 'original' where the model lists it.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | unsupportedImageDetail / imageDetailRefusalMessage | `apps/web/app/api/llm/v1/chat/completions/lib/image-detail.ts` | Defines the four values, checks each image part against the model's accepted list, builds the refusal text. |
| endpoint | api:POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Validates the detail enum (line 616) and refuses unsupported detail with 400 image_detail_unsupported (lines 5115-5124). |
| endpoint | api:GET /api/llm/v1/models | `apps/web/app/api/llm/v1/models/route.ts` | Publishes image_detail per model from catalog metadata. |
| schema | OpenAPI contract | `apps/web/public/openapi.json` | Documents the detail field and the image_detail list (lines 493-499, 609). |
| schema | imageInput.detailValues | `packages/contracts/types/src/model-catalog.ts` | Type of the per-model accepted detail list, max images and token ceiling (lines 750-755). |
| config | generated model catalog | `packages/contracts/types/src/models.json` | Holds per-model imageInput.detailValues (generated; not hand-edited per AGENTS.md section 4). |
| service | wireContentToBlocks | `packages/ai/provider-protocol/src/openai-wire-compat.ts` | Turns wire image_url parts into image blocks, keeping a valid detail value (lines 112-135). |
| schema | ImageBlock detail | `packages/contracts/types/src/provider-adapter.ts` | Provider-neutral image block with optional detail auto/low/high/original (around lines 80-82). |
| service | OpenAI chat translation | `packages/ai/providers/openai/src/translate.ts` | Writes image_url.detail into the chat request (lines 51-57). |
| service | OpenAI responses translation | `packages/ai/providers/openai/src/translate-responses.ts` | Writes input_image detail into the responses request (lines 54-60). |
| service | chat attachment hydration | `apps/web/app/api/llm/v1/chat/completions/lib/chat-attachment-hydration.ts` | Builds image parts for stored attachments; type allows detail but the built parts set none (lines 42, 671-676). |
| service | prepareModelImage | `apps/web/app/api/llm/v1/chat/completions/lib/model-image.ts` | Server-side shrink of images beyond the model envelope (lines 79-135). |
| service | load_for_prompt_bytes / PromptImageMode | `crates/agiworkforce-utils-image/src/lib.rs` | CLI image encoder: ResizeToFit (2048 by 768 bounds) or Original (lines 20-22, 63-66, 103). |
| command | /attach --full | `apps/cli/src/tui/tui_app.rs` | Slash command and staging logic for full-size image attach (lines 832-877, 5485, 6251-6258). |
| service | load_image_attachment_with | `apps/cli/src/lib.rs` | Reads and encodes an image with the chosen mode; ImageAttachment holds mime and base64 only (lines 8352-8395). |
| schema | ImageDetail (Rust protocol) | `crates/agiworkforce-protocol/src/models.rs` | Shared protocol enum and default High (lines 796-803), parsed from metadata (1690-1696). |
| command | vision command parse_detail_level | `apps/desktop/src-tauri/src/sys/commands/vision.rs` | Tauri desktop vision command accepting low, high, auto (lines 335-342). |
| service | managed cloud provider message builder | `apps/desktop/src-tauri/src/core/llm/providers/managed_cloud_provider.rs` | Desktop (Tauri) cloud request writes detail low/high/auto (lines 340-343, 366-372). |
| service | desktop attachment mapper | `apps/desktop/src-tauri/src/sys/commands/chat/attachments.rs` | Sets Auto on chat image attachments (line 465). |
| service | extension computer-use agent loop | `apps/extension/src/features/computer-use/agentLoop.ts` | Sends screenshots with detail 'high' (line 214). |
| service | extension cloud bridge client | `apps/extension/src/features/cloud-bridge/freeTrialClient.ts` | Sends attachments with detail 'auto' and validates replies to auto/low/high (lines 515, 569, 645). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A developer's request arrives with image parts; the schema accepts detail auto, low, high or original. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:616 |
| The server refuses a turn with images if the model cannot read images (model_no_vision). | our servers | request-processor.ts:5100-5112 |
| The server looks up the model's accepted detail values in the catalog and refuses any other value except auto. | our servers | image-detail.ts:25-31; request-processor.ts:5115-5124 |
| The server then checks the number of images against the model or harness limit. | our servers | request-processor.ts:5126-5135; apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts:60-66 |
| Wire content is converted to provider-neutral image blocks, keeping a valid detail value. | our servers | packages/ai/provider-protocol/src/openai-wire-compat.ts:112-135 |
| The provider adapter writes detail into the provider request and the provider reads the image at that level. | outside service | packages/ai/providers/openai/src/translate.ts:51-57 (OpenAI only; other providers unknown) |
| CLI: the image is read from disk, optionally left unscaled, base64 encoded and queued for the next turn. | device | apps/cli/src/tui/tui_app.rs:832-877; apps/cli/src/lib.rs:8383-8395 |
| CLI: the queued block (mime and data only) is sent with the next message to the chosen provider. | device and our servers | apps/cli/src/lib.rs:8364-8368; where the CLI sends it depends on the selected provider, unknown which path adds a detail value |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Detail value on an image part | In the request only; no table found | No | Lives with the request; any storage of message content is covered by the chat pipeline (SYS-chat-turn-pipeline), unknown for this field |
| Accepted detail values per model | Generated model catalog file packages/contracts/types/src/models.json | Shipped with the code | Replaced on each catalog sync (pnpm sync:models) |
| CLI processed image cache | In-memory cache of 32 entries keyed by file hash and mode (crates/agiworkforce-utils-image/src/lib.rs:73-77) | No | Lost when the CLI process exits |

**Models and providers.** Which detail values work is decided per model by the catalog, not by the app (image-detail.ts:25). Provider adapters differ: only OpenAI translation was confirmed to write detail. Own-key and Local routes were not shown to apply the refusal; unknown.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud API calls need an account credential and are governed by the chat route's authentication (SYS-authentication-and-identity). CLI file attach itself needs no account; sending the turn does, unless using Local or own key. |
| Permissions | CLI attach is limited to paths inside the workspace (apps/cli/src/tui/tui_app.rs:842). No other permission rule for detail found in the code. |
| Subscription | No detail-specific entitlement found in the code. Model access and usage follow the shared subscription rules (SYS-subscriptions-entitlements-and-usage). |
| Limits and metering | Higher detail costs more input tokens (CLI message, tui_app.rs:6254-6256). The catalog records a maximum input tokens per image for some models (model-catalog.ts:750-755) and a max images per request (media-input.ts:60-66). Whether the maximum token figure is used for billing or admission is unknown. |
| Feature flags | none found in the code for the detail check. |
| Model compatibility | Accepted values are per model from imageInput.detailValues; default list auto, low, high when no record (image-detail.ts:10,25). Some catalog entries list original; others do not list a record at all. |
| Provider restrictions | Only the OpenAI adapter confirmed to forward detail; Anthropic and Google adapters showed no reference to detail in a source search. Result: unknown. |
| Local mode | CLI full-size attach works offline for staging and runs on the device; model reading depends on the chosen provider. The refusal check lives in the Cloud API only (mode:cloud). Local-model handling of detail: not found in the code read; unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Detail omitted | No detail field is sent; the provider default applies (image-detail.ts:29-30; translate.ts:57). | image-detail.ts:29-30 |
| Detail 'auto' | Always accepted. | image-detail.ts:30 |
| Unsupported value (error) | HTTP 400, code image_detail_unsupported, message lists accepted values; no retry logic, the caller must change the value. | request-processor.ts:5115-5125 |
| Invalid enum string | Rejected by the request schema as a validation failure (value not in the four allowed). | request-processor.ts:616 |
| Model cannot read images | 400 model_no_vision is returned before the detail check. | request-processor.ts:5100-5112 |
| CLI: duplicate attach | Refused with 'is already attached'. | tui_app.rs:877-879 |
| CLI: unreadable or corrupt image | Returns 'Failed to process image' error; the session stays alive. | apps/cli/src/lib.rs:8392-8393, 8370-8374 |
| Large original image over limits | CLI does not check the provider's size limit when sending a full-size image; handling not found in the code read. | crates/agiworkforce-utils-image/src/lib.rs:103-110 |
| Offline, timeout, cancel | not handled in the code for this feature specifically; the general chat pipeline applies. | none found |
| Accessibility | not handled in the code read; the CLI chip is plain text. | tui_app.rs:871-874 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `crates/agiworkforce-utils-image/src/lib.rs`: In-file tests: image within bounds is returned unchanged, large image is downscaled, large image is preserved in Original mode, invalid image fails, updated file is reprocessed (lines 312-410).
- `packages/ai/provider-protocol/src/__tests__/openai-wire-compat.test.ts`: Conversion of image_url parts (data URL and https) into image blocks (line 101); no assertion on detail was seen.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.model-compatibility.test.ts`: Model compatibility checks for the chat route; no detail-specific case was found by search.

**Test scenarios**

- **Unsupported detail refused**
  1. Pick a model whose models-list entry lacks 'original' in image_detail.
  2. Send a chat request with an image part and detail 'original'.
  - Expected: HTTP 400, error code image_detail_unsupported, message 'The selected model does not accept image detail "original". Use ...' listing accepted values.
- **Supported original accepted**
  1. Pick a model whose image_detail includes 'original'.
  2. Send an image with detail 'original'.
  - Expected: Request passes the detail check and the answer reads the image; inspect the provider request for detail original.
- **Auto always passes**
  1. Send an image with detail 'auto' to any vision model.
  - Expected: No image_detail_unsupported error.
- **Models list shows detail**
  1. Call GET /api/llm/v1/models.
  - Expected: Models with a catalog record include image_detail values.
- **CLI full-size attach**
  1. Open the CLI chat with a vision model.
  2. Run '/attach --full big.png' for an image larger than 2048 pixels on its long edge.
  3. Run '/attach small.png' for the same image without --full.
  - Expected: Full attach chip ends with ', full resolution' and confirmation text; default attach is scaled to the bounds.
- **CLI non-vision model**
  1. Select a model without vision.
  2. Run '/attach photo.png'.
  - Expected: Refused with a message to switch via /model.

**Where to look when it fails**

- HTTP 400 body error.code image_detail_unsupported or model_no_vision.
- CLI system messages beginning 'Could not attach'.
- Compare imageInput.detailValues in packages/contracts/types/src/models.json for the model.

**Hands-on test plans**

- CLI: [70-qa/test-plans/cli/043-image-and-visual-understanding.md](../../70-qa/test-plans/cli/043-image-and-visual-understanding.md)

## 10. Gaps and dependencies

- **No detail choice for people in web chat, Electron desktop, mobile or Chrome.** Affects: Web, Desktop, Mobile, Chrome people using images. Evidence: Brief S43.18 status missing; no detail control found; chat-attachment-hydration.ts:671-676 sets none; desktop attachments hard set Auto (attachments.rs:465). Work needed: Design a shared control or automatic rule in the shared chat UI and pass detail through the attachment path.
- **CLI full-size attach is not a detail value; the CLI block has no detail field.** Affects: CLI users. Evidence: apps/cli/src/lib.rs:8364-8368. Work needed: Decide whether the CLI should also send a detail value and add it to the block and provider calls.
- **Desktop (Tauri) vision command and cloud provider do not support original.** Affects: Tauri build only (internal). Evidence: vision.rs:335-342; managed_cloud_provider.rs:366-372. Work needed: Extend the enum or confirm the build is out of scope.
- **No tests for the detail refusal.** Affects: Cloud API. Evidence: No test file referencing image_detail_unsupported or unsupportedImageDetail found. Work needed: Add unit tests for image-detail.ts and a route test.
- **Detail support for non-OpenAI providers unknown.** Affects: Models served through other providers. Evidence: No detail reference found in anthropic or google provider sources. Work needed: Read each adapter and record behaviour or add translation.
- **Brief cited CLI lines (apps/cli/src/lib.rs:6478, tui_app.rs:4595, 662) do not show the resize or original choice; the real code is at tui_app.rs:832-877, 6251 and lib.rs:8383.** Affects: Documentation accuracy. Evidence: Lines read at those locations. Work needed: Correct the brief's code references.
- Not built on: Web, Desktop, Mobile, Chrome (from the capability ledger).

**Depends on**

- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-api-and-contracts
- SYS-chat-turn-pipeline
- SYS-execution-boundaries
- SYS-subscriptions-entitlements-and-usage
- file:apps/web/app/api/llm/v1/chat/completions/lib/image-detail.ts
- file:crates/agiworkforce-utils-image/src/lib.rs

## Unknown

- Whether Anthropic, Google and other provider adapters honour or drop the detail value.
- Whether the CLI adds a detail value anywhere before the provider call.
- Whether the models-list max tokens per image figure is used for billing or admission.
- How Local mode (on-device models) treats image detail.
- Whether own-key routes apply the unsupported-detail refusal.
- Whether any test covers image-detail.ts (none found by search).
