---
id: "F043-05"
type: "feature"
title: "Turn an image into structured data (API)"
aliases: ["Image to structured data", "Receipt and form extraction", "Structured output from an image", "API image extraction", "S43.15"]
area: "43 Image and visual understanding"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S43.15"]
depends_on: ["SYS-api-and-contracts", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-subscriptions-entitlements-and-usage", "SYS-authentication-and-identity", "SYS-chat-turn-pipeline", "SYS-security-and-privacy", "provider:openai", "mode:cloud", "file:apps/web/public/openapi.json"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F043-05 Turn an image into structured data (API)

A developer sends an image part and a prompt to the OpenAI-style chat endpoint and asks for JSON. The server passes the image through and can check the reply against a JSON schema. There is no screen and no dedicated extraction step; CSV or rows come only from the model's text.

Area: [43. Image and visual understanding](README.md). Requirement items: [S43.15](../../10-requirements/capabilities/043-image-and-visual-understanding.md#s4315).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets an API caller turn a picture such as a receipt or form into structured fields by combining an image part with a JSON-object or JSON-schema response format. The server validates a schema reply.

**Why it exists.** The brief lists image-to-structured-data extraction as done for the API only (doc: knowledge-base/data/area-briefs/043-image-and-visual-understanding.md, S43.15). Developers need data, not prose.

**Who uses it.** Developers calling the public chat completions endpoint.

**Problems it solves**

- Manual data entry from receipts, forms and cards.
- Getting a machine-readable reply from a vision model.

**Use cases**

- POST a receipt image with response_format json_schema to get fields.
- Ask for rows of a table in a photo and parse them.
- Extract fields from a business card image.

## 2. User experience

**Where to find it**

- API only: the chat completions endpoint under apps/web/app/api/llm/v1/chat/completions, documented in apps/web/public/openapi.json (message content parts text, image_url, file; response_format text, json_object, json_schema).

**Before you start**

- An API credential for the endpoint (auth details are in SYS-authentication-and-identity; not read here).
- A model that reads images and, for json_schema, supports structured output (request-processor.ts:5099, 5168-5175).
- stream set to false for json_object and json_schema (request-processor.ts:867-876).

**Screens and controls**

- No screen. Request fields: messages[].content[] with type image_url and image_url.url (https URL or data URL) with optional detail auto, low, high or original; response_format with type and json_schema (request-processor.ts:601-616, 682-705).

**Journey**

1. Build a request with a text part describing the fields and an image_url part.
2. Add response_format json_schema with the fields, and stream false.
3. Send to the endpoint.
4. Read the choices[0].message content as JSON.
5. If the reply fails the schema the call returns an error instead of text (response-builder.ts:325-340).

**What the person sees and gets**

- JSON text content in the reply.
- Errors: 'image_url blocked by egress policy', 'invalid image_url', model_no_vision, image_detail_unsupported, too_many_images, model_no_structured_output (request-processor.ts:611-612, 5099-5147, 5168-5175).
- The documented error for a streamed structured request (request-processor.ts:875).

**Settings**

- response_format type text, json_object or json_schema.
- detail on each image part: auto, low, high, original (image-detail.ts:5).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- The request schema accepts image_url parts with a url checked against the egress policy and a detail value from auto, low, high, original (apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:601-616; image-detail.ts:5).
- The server refuses an unsupported detail value for the model (image-detail.ts:18-28; request-processor.ts:5115-5128).
- json_object mode adds a directive; json_schema mode needs a model that supports structured output, adds a schema directive and, after generation, settles the reply against the schema (request-processor.ts:5166-5190; apps/web/app/api/llm/v1/chat/completions/lib/json-schema-mode.ts:869; response-builder.ts:323-340).
- The OpenAPI document describes image parts and response formats (apps/web/public/openapi.json:609, 726).

**Incomplete**

- Output as CSV or table rows is not validated; only JSON schema replies are settled. No CSV mode was found.
- Whether an invalid reply is retried before failing was not read: unknown (json-schema-mode.ts not opened beyond the export).

**Present but disconnected or switched off**

- nothing found

**Not available**

- No app screen for image extraction. S43.16 (image-to-table workflow) is not applicable on any app per the brief (doc: knowledge-base/data/area-briefs/043-image-and-visual-understanding.md S43.16).

## 4. Required behaviour

**Established requirements**

- The user turns an image (receipt, form, card) into structured fields (JSON, CSV or rows) that can be reused. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S43.15)
- The structured reply must be honest about what the route supports; web structured output is refused on models without it. (source: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5168-5175 (current implementation))
- Provider capabilities are not intrinsic model abilities. (source: AGENTS.md section 4)

**Acceptance criteria**

1. A request with an image_url part and json_schema returns JSON that matches the schema.
2. A request with json_schema and stream true is refused with a message naming stream false.
3. A model without structured output is refused with code model_no_structured_output.
4. An image URL that points at an internal host is refused by the egress policy.
5. A detail value the model does not list is refused with image_detail_unsupported.
6. A reply that does not fit the schema returns an error, not partial text.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Reusing the data means the schema reply is the product's contract; CSV is a caller conversion [inferred].
- Receipt and form accuracy depends on the model and image quality, as in F043-02 [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Provide a documented example in the OpenAPI document for image extraction.
- [proposed] Add an extraction preset in the apps once the API behaviour has a live run.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | chat completions route | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Public endpoint taking image parts. |
| service | request-processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Request schema, vision, detail, image limit and response_format checks. |
| service | image-detail | `apps/web/app/api/llm/v1/chat/completions/lib/image-detail.ts` | Allowed detail values per model. |
| service | json-schema-mode | `apps/web/app/api/llm/v1/chat/completions/lib/json-schema-mode.ts` | Schema directive and settleJsonSchemaCompletion. |
| service | json-object-mode | `apps/web/app/api/llm/v1/chat/completions/lib/json-object-mode.ts` | JSON object directive. |
| service | response-builder | `apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts` | Settles a json_schema reply or returns an error. |
| service | media-input | `apps/web/app/api/llm/v1/chat/completions/lib/media-input.ts` | Image count per request. |
| config | OpenAPI document | `apps/web/public/openapi.json` | Documents image_url, detail and response_format. |
| service | egress policy | `apps/web/lib/egress-policy.ts` | validateUserImageUrl blocks internal hosts (import at request-processor.ts:244). |
| config | provider wire translation | `packages/ai/provider-protocol/src/openai-wire-compat.ts` | Wire shape for image parts (named in the brief for S43.18; not opened). |
| service | OpenAI provider translate | `packages/ai/providers/openai/src/translate.ts` | Provider translation of image detail (named in the brief; not opened). |
| test | json-schema-mode test | `apps/web/app/api/llm/v1/chat/completions/lib/json-schema-mode.test.ts` | Schema settlement tests. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The caller sends a chat completions request with an image_url part and a response_format. | our servers | apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:590-705 |
| The server validates the image URL against the egress policy and the detail value. | our servers | request-processor.ts:601-616, 4430-4455, 5115-5128 |
| The server checks the model reads images, the image count, and structured output support, then adds the JSON directive. | our servers | request-processor.ts:5099-5147, 5166-5190 |
| The model provider reads the image and writes JSON. | outside service | provider route resolved before request-processor.ts:5098 |
| For json_schema the server settles the reply against the schema and returns it or an error. | our servers | response-builder.ts:323-340 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Request image (URL or data URL) | Not stored by this route as a file; data stays in the request unless the call persists a conversation (not read) | No | unknown |
| Structured reply | Returned to the caller; usage accounting per SYS-subscriptions-entitlements-and-usage | No | unknown |

**Models and providers.** The model must have vision and, for json_schema, the json capability in registry metadata (request-processor.ts:5099, 5168). The wire shape to each provider is translated by provider-protocol and provider packages (doc: brief S43.18 lists those files).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | The endpoint needs an authenticated caller; the exact credential types were not read: unknown. A guest route exists and its image handling is unknown. |
| Permissions | No device permission. Egress policy blocks internal image URLs (request-processor.ts:611-612, 4440-4450). |
| Subscription | Plan, quota and credit rules for API calls apply through SYS-subscriptions-entitlements-and-usage; an image-specific entitlement for reading images: none found in the code read. The quota label 'image' at request-processor.ts:5621 is for image generation, not reading. |
| Limits and metering | Image count limit per model or harness (media-input.ts:60-66). max_tokens up to 64000 (request-processor.ts:640s schema). Image input token estimate exists for the free trial (apps/web/lib/services/free-trial-service.ts:197-209); paid metering for image tokens: not established. |
| Feature flags | none found specific to this feature. |
| Model compatibility | Vision and structured output are both needed for json_schema; detail 'original' only on models that list it (image-detail.ts:12-28). |
| Provider restrictions | Per-route image counts and detail values; provider differences are in the registry, not read here. |
| Local mode | Not applicable: this is a Cloud API. Local and own-key calls to the same endpoint: unknown. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Blocked image URL | 400 with code image_url_blocked and message 'Image URL not permitted: must be https with a non-internal hostname, or a data: URL'. | request-processor.ts:4440-4452 |
| Invalid image URL | Schema error 'invalid image_url'. | request-processor.ts:611-613 |
| Model cannot read images | 400 model_no_vision. | request-processor.ts:5099-5113 |
| Unsupported detail | 400 image_detail_unsupported, listing accepted values. | request-processor.ts:5115-5128; image-detail.ts:31-36 |
| Structured output unsupported | 400 model_no_structured_output. | request-processor.ts:5168-5175 |
| Streaming with a JSON format | Refused: json_object and json_schema need stream false. | request-processor.ts:865-876 |
| Reply fails the schema | Settlement returns an error with its own status and code. | response-builder.ts:323-340 |
| Retry, cancel, timeout, offline | not handled by this feature specifically; endpoint-wide handling in SYS-chat-turn-pipeline was not read. | none found |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/json-schema-mode.test.ts`: Schema settlement: valid replies pass, ordering and invalid replies fail.
- `apps/web/app/api/llm/v1/chat/completions/lib/json-object-mode.test.ts`: JSON object mode.
- `apps/web/app/api/llm/v1/chat/completions/lib/response-builder.json-object.test.ts`: Response building for JSON object mode.
- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.model-compatibility.test.ts`: Image turn refused for non-vision model.

**Test scenarios**

- **Receipt to JSON**
  1. Send a data-URL receipt image with a json_schema listing merchant, date and total, stream false.
  2. Read the reply.
  - Expected: A JSON object with those keys that satisfies the schema.
- **Streaming refused**
  1. Repeat with stream true.
  - Expected: A 400 error naming stream false.
- **Non-vision model**
  1. Send the image with a model that cannot read images.
  - Expected: model_no_vision.
- **Blocked URL**
  1. Send an image_url pointing at an internal host.
  - Expected: image_url_blocked.
- **Invalid detail**
  1. Set detail original on a model that does not list it.
  - Expected: image_detail_unsupported with the accepted values.

**Where to look when it fails**

- Error codes model_no_vision, image_detail_unsupported, image_url_blocked, too_many_images, model_no_structured_output.
- Egress block log 'Blocked user-supplied image URL (egress policy)' (request-processor.ts:4439).
- No recorded live API run for image extraction was found.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No CSV or table-row output mode and no check beyond JSON schema.** Affects: API callers wanting CSV or rows. Evidence: only json_object and json_schema in request-processor.ts:682-705. Work needed: Decide whether the product should offer CSV and validate it.
- **No app screen for image extraction.** Affects: Web, desktop, mobile, CLI, VS Code, Chrome users. Evidence: brief S43.15 status api done only. Work needed: Decide if an in-app extraction flow is required.
- **No recorded live run of image extraction.** Affects: API. Evidence: none found in audit files read. Work needed: Run and record a receipt example.
- **Brief code pointers for this item are stale (request-processor lines 3858 and 3868 are project-context code).** Affects: Readers of the brief. Evidence: request-processor.ts:3850-3875. Work needed: Update the brief pointers.

**Depends on**

- SYS-api-and-contracts
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-subscriptions-entitlements-and-usage
- SYS-authentication-and-identity
- SYS-chat-turn-pipeline
- SYS-security-and-privacy
- provider:openai
- mode:cloud
- file:apps/web/public/openapi.json

## Unknown

- Which credentials are accepted by the endpoint.
- Whether an invalid schema reply is retried.
- Whether the request image is stored or logged after the call.
- Paid metering of image input tokens.
- Whether guest chat accepts images.
