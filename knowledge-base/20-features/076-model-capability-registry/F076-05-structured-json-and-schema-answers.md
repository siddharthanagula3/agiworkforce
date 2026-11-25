---
id: "F076-05"
type: "feature"
title: "Structured JSON and schema answers"
aliases: ["Structured output", "JSON mode", "response_format", "json_object", "json_schema", "Schema-constrained output", "S76.24", "S76.25", "structuredOutput"]
area: "76 Model-capability registry"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S76.24", "S76.25"]
depends_on: ["SYS-api-and-contracts", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-chat-turn-pipeline", "api:POST /api/llm/v1/chat/completions", "api:GET /api/llm/v1/models", "file:apps/web/app/api/llm/v1/chat/completions/lib/json-schema-mode.ts", "provider:openai", "provider:anthropic", "provider:google", "mode:cloud"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F076-05 Structured JSON and schema answers

API-only. A developer can ask for JSON, or JSON that matches a schema. Streaming is refused with these formats. A schema request on a model without the json flag is refused. A reply that breaks the schema is refused with an error. No app has a JSON switch.

Area: [76. Model-capability registry](README.md). Requirement items: [S76.24](../../10-requirements/capabilities/076-model-capability-registry.md#s7624), [S76.25](../../10-requirements/capabilities/076-model-capability-registry.md#s7625).

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

**What it does.** Accepts response_format of text, json_object or json_schema on chat completions, checks the model and schema, adds a directive, and validates the final reply.

**Why it exists.** Developers need parseable output. The registry says which models and routes can do it so the server does not forward an impossible request.

**Who uses it.** API developers.

**Problems it solves**

- Answers that cannot be parsed.
- Unenforceable schemas being accepted and then silently failing.
- Sending JSON mode to models that do not support it.

**Use cases**

- Extract fields from text into a fixed schema.
- Get a JSON object for a script.
- Validate a model's reply against a contract in CI.

## 2. User experience

**Where to find it**

- API: POST /api/llm/v1/chat/completions with response_format (request-processor.ts:682-702).
- Web, Desktop, Mobile, CLI, VS Code, Chrome: no switch found; Mobile local model rows show a 'Structured' label for on-device models (service.ts:140-150).

**Before you start**

- API key or signed-in session; stream false.

**Screens and controls**

- Request field response_format with type and json_schema.

**Journey**

1. Send the request with stream false.
2. The server validates the format and model.
3. The model answers.
4. The server validates the reply and returns it or an error.

**What the person sees and gets**

- 400 with text "response_format type 'json_schema' requires a json_schema object." (request-processor.ts:689-694).
- 400 "requires stream: false" for a streamed JSON request (request-processor.ts:867-876).
- 400 model_no_structured_output: 'The selected model does not support structured output. Choose a model that does, or use response_format json_object.' (request-processor.ts:5169-5185).
- An error response with a settlement code when the reply does not match the schema (response-builder.ts:314-340).

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Schema validation of response_format at request parse (request-processor.ts:682-702); schema problems refused through jsonSchemaFormatProblem.
- Stream refused with json formats (request-processor.ts:867-876).
- json_object mode directive added (request-processor.ts:5166-5168; json-object-mode.ts).
- json_schema: refused with model_no_structured_output when the model lacks the json flag, else a schema directive is appended to the system prompt (request-processor.ts:5169-5191).
- Reply validated against the schema after generation (response-builder.ts:314-340).
- Canonical request keeps the format only if the model has capabilities.json true and the route or harness lists the format (canonical-request.ts:199-206).
- Harnesses list responseFormats (harnesses.json:34 for one route family); provider translators map the format (openai translate.ts:279; anthropic translate.ts:297; google translate.ts:170).

**Incomplete**

- For json_object, a model without the json flag has its format dropped by canonical-request.ts:199-206 without an error; the directive is still added by applyJsonObjectMode. Net effect for the caller: not established.
- Whether providers use native constrained decoding versus the directive plus post-check was not established per route.

**Present but disconnected or switched off**

- none found in the code

**Not available**

- All six apps: no structured-output switch (brief S76.24, S76.25 API only).

## 4. Required behaviour

**Established requirements**

- The registry records native structured JSON output per model and JSON requests use it (S76.24). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.24)
- The registry records schema-constrained output support and schema requests are honoured on supporting models (S76.25). (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S76.25)

**Acceptance criteria**

1. json_schema with stream true returns 400 naming stream false.
2. json_schema root that is not an object returns 400.
3. json_schema to a model without the json flag returns 400 model_no_structured_output.
4. json_schema to a supporting model returns content that matches the schema.
5. A reply that breaks the schema returns an error, not the bad content.
6. json_object returns valid JSON text.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- json_object on a model without the json flag may return non-JSON because the format is dropped. [inferred from canonical-request.ts:199-206]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Refuse json_object too on a model without the flag, so both formats behave the same.
- [proposed] Publish a response_formats list per model in GET /api/llm/v1/models.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | request-processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Schema, stream and model checks (lines 682-702, 867-876, 5166-5191). |
| service | json-object-mode | `apps/web/app/api/llm/v1/chat/completions/lib/json-object-mode.ts` | JSON object directive and settlement. |
| service | json-schema-mode | `apps/web/app/api/llm/v1/chat/completions/lib/json-schema-mode.ts` | Schema problem check, directive, reply settlement. |
| service | canonical-request | `apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.ts` | Keeps responseFormat only when model and route allow (199-206). |
| service | response-builder | `apps/web/app/api/llm/v1/chat/completions/lib/response-builder.ts` | Validates reply (314-340). |
| config | harness responseFormats | `packages/ai/model-registry/catalog/harnesses.json` | Formats each route accepts. |
| service | OpenAI translate | `packages/ai/providers/openai/src/translate.ts` | Maps format to provider (line 279). |
| service | Anthropic translate | `packages/ai/providers/anthropic/src/translate.ts` | Maps format (line 297). |
| service | Google translate | `packages/ai/providers/google/src/translate.ts` | Maps format (line 170). |
| config | json capability | `packages/ai/model-registry/scripts/compile.mjs` | json maps to structuredOutput (lines 1576, 1629). |
| endpoint | GET /api/llm/v1/models | `apps/web/app/api/llm/v1/models/route.ts` | Publishes structured_output flag. |
| service | routing policy | `packages/ai/model-registry/catalog/routing-policies.json` | A task policy requires structuredOutput (line 592). |
| test | json-schema-mode test | `apps/web/app/api/llm/v1/chat/completions/lib/json-schema-mode.test.ts` | Schema mode behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The request is parsed; response_format and stream are validated. | our servers | request-processor.ts:682-702, 867-876 |
| The model flag is checked and a directive is added to the system prompt. | our servers | request-processor.ts:5166-5191 |
| The provider adapter maps the format and the provider answers. | outside service | openai translate.ts:279; anthropic translate.ts:297; google translate.ts:170 |
| The server settles the reply against the schema and returns content or an error. | our servers | response-builder.ts:314-340 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| The schema and reply | Request and normal conversation records; no separate store found | not applicable | unknown |

**Models and providers.** Needs capabilities.json on the model and the format listed on the route or harness. Providers differ in how they enforce.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | API key or session required like any chat completion. |
| Permissions | none found in the code specific to this feature. |
| Subscription | API surface plan rules apply as for chat completions (managedCloudSurfaceRefusal appears for the API in the transcription route; the chat equivalent was not read). |
| Limits and metering | Normal token metering; schema size bounds before provider work (json-schema-mode.test.ts 'bounds reference expansion'). |
| Feature flags | none found in the code |
| Model compatibility | Model json flag true; route lists json_object or json_schema. |
| Provider restrictions | Route harness responseFormats. |
| Local mode | Not available on the managed API. Mobile local rows show a 'Structured' label (service.ts:140-150); no request path using it was read. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Streaming with JSON format | 400 requires stream false. | request-processor.ts:867-876 |
| Schema root not object or unsupported | 400 at parse. | request-processor.ts:697-702; request-processor.response-format.test.ts |
| Model lacks json flag with json_schema | 400 model_no_structured_output. | request-processor.ts:5169-5185 |
| Reply breaks schema | Error response with settlement status. | response-builder.ts:314-340 |
| Truncated reply (finish reason length) | Settlement receives the finish reason; outcome not read. | response-builder.ts:321-325 |
| Timeout, retry, offline | not handled specially for this feature in the code read. | not established |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.response-format.test.ts`: Accepts text, omitted, json_object; refuses json_object on a stream; refuses non-object schema roots; accepts enforceable schemas.
- `apps/web/app/api/llm/v1/chat/completions/lib/json-schema-mode.test.ts`: Schema enforcement: prototype names, signed zero, references, recursion, bounded expansion.
- `apps/web/app/api/llm/v1/chat/completions/lib/json-object-mode.test.ts`: JSON object mode (assertions not read).
- `apps/web/app/api/llm/v1/chat/completions/lib/response-builder.json-object.test.ts`: Reply settlement for json_object (assertions not read).
- `apps/web/app/api/llm/v1/chat/completions/lib/canonical-request.test.ts`: Canonical request building (assertions not read for responseFormat).

**Test scenarios**

- **Stream refusal**
  1. Send response_format json_schema with stream true.
  - Expected: 400 stating stream false is required.
- **No json flag**
  1. Send json_schema to a model without the json flag.
  - Expected: 400 model_no_structured_output.
- **Schema success**
  1. Send json_schema with required fields to a supporting model, stream false.
  - Expected: Content parses and matches the schema.
- **Bad reply**
  1. Use a test double that returns off-schema text.
  - Expected: Error response, not the bad content.
- **json_object on non-flag model**
  1. Send json_object to a model without the json flag.
  - Expected: Observe whether the format is dropped; record the result (not established).

**Where to look when it fails**

- Log 'json_schema mode: model output did not satisfy the schema' (response-builder.ts:326-329).
- Error code model_no_structured_output.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **json_object on a non-flag model is dropped without a refusal in the canonical path.** Affects: API callers.. Evidence: canonical-request.ts:199-206. Work needed: Verify the final behaviour and align with json_schema.
- **No app exposes structured output.** Affects: All six apps.. Evidence: brief S76.24-25 status API only. Work needed: Decide whether apps need it.
- **Models API does not publish which formats a route accepts, only structured_output.** Affects: API developers.. Evidence: models/route.ts:62-112. Work needed: Optionally add formats.

**Depends on**

- SYS-api-and-contracts
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-chat-turn-pipeline
- api:POST /api/llm/v1/chat/completions
- api:GET /api/llm/v1/models
- file:apps/web/app/api/llm/v1/chat/completions/lib/json-schema-mode.ts
- provider:openai
- provider:anthropic
- provider:google
- mode:cloud

## Unknown

- Net behaviour of json_object on models without the json flag.
- Plan rules specific to the API surface for chat.
- Retention of schemas.
- Whether the web app has any hidden JSON control (none found).
