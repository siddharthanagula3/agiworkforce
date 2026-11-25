---
id: "F105-12"
type: "feature"
title: "Inspectors and data tools (not built)"
aliases: ["Inspectors and data tools", "Streaming event inspector (S105.07)", "Tool-call inspector (S105.08)", "Structured-output schema editor (S105.09)", "File upload and reuse (S105.10)", "Retrieval collection manager (S105.11)"]
area: "105 Developer platform and console"
available_on: ["web", "desktop"]
implementation: {web: "partial", desktop: "partial", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S105.07", "S105.08", "S105.09", "S105.10", "S105.11"]
depends_on: ["surface:web", "surface:desktop", "mode:cloud", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-inference-providers", "SYS-files-artifacts-and-storage", "SYS-api-and-contracts", "api:POST /api/llm/v1/chat/completions", "api:GET /api/llm/v1/models", "plan:pro", "F105-07", "F105-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F105-12 Inspectors and data tools (not built)

Five planned developer tools. Only a small part of one exists: the 'Try a request' card accepts a tools list and shows the tool calls a model made, for a single non-streamed request. No stream viewer, schema editor, file store for the gateway or retrieval collection manager was found. The gateway itself does enforce a JSON schema reply.

Area: [105. Developer platform and console](README.md). Requirement items: [S105.07](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10507), [S105.08](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10508), [S105.09](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10509), [S105.10](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10510), [S105.11](../../10-requirements/capabilities/105-developer-platform-and-console.md#s10511).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Desktop | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | does not apply | does not apply | n/a |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Planned: watch raw stream events, inspect tool calls with arguments and results, author and check a structured-output schema, upload files once and reuse them by id, and manage retrieval collections queried from API calls (brief S105.07 to S105.11). Today the 'Try a request' card sends one non-streamed request and lists any tool calls (apps/web/features/developers/components/RequestPlayground.tsx:104-122, :405-430).

**Why it exists.** The brief lists these as expected developer-console tools. [inferred] They let a developer debug a request without writing code.

**Who uses it.** Developers calling the managed gateway; none can use the unbuilt parts.

**Problems it solves**

- Seeing which tool the model chose and with what arguments (partly solved in the playground).
- Not yet solved: reading stream events, authoring a schema, reusing files, retrieval collections.

**Use cases**

- Paste a tools array into 'Try a request' and read the call arguments.
- Send json_schema in a raw API call and get a validated reply (no console editor).
- Planned: upload a file once and cite it by id.
- Planned: attach a collection to a request.

## 2. User experience

**Where to find it**

- Web: /developers, card 'Try a request', field 'Tools' (apps/web/features/developers/components/RequestPlayground.tsx:243, :340-353).
- Web gateway: response_format json_schema is accepted by POST /api/llm/v1/chat/completions (apps/web/public/openapi.json:724-735; apps/web/app/api/llm/v1/chat/completions/lib/json-schema-mode.ts:402-412).
- Desktop: hosted web app (doc: AGENTS.md section 5).
- Stream inspector, schema editor, file reuse, collections: no screen found (searched apps/web/features/developers and apps/web/app).

**Before you start**

- Signed in; the playground uses the session credential, not an API key (RequestPlayground.tsx:181-193).
- A tools JSON array for the tool view.

**Screens and controls**

- Fields in 'Try a request': Model (auto or a listed model), System message, User message, Tools, max tokens and temperature; send; copy as curl (RequestPlayground.tsx:243-353).
- Result: 'Answered by <model> in N ms', text, a 'Tool calls' list with name, call id and argument text, and a finish reason (RequestPlayground.tsx:396-427).

**Journey**

1. Open /developers, 'Try a request'.
2. Enter a message and a Tools array of function definitions.
3. Send; read the tool calls and arguments.
4. To stream or use a schema, call the API outside the console.

**What the person sees and gets**

- Tools errors: 'Tools must be a JSON array.' and 'Tools are not valid JSON.' (RequestPlayground.tsx:80-83).
- Gateway errors shown with status (RequestPlayground.tsx:196-199).
- Remaining requests line (see F105-08).

**Settings**

- None for these tools.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Tools input and tool-call display in the playground, with a test for parsing and reading tool calls (RequestPlayground.tsx:75-101; apps/web/features/developers/__tests__/request-playground-tools.test.ts).
- Gateway enforcement of json_object and json_schema when stream is false, with errors json_schema_not_satisfied and model_no_structured_output (apps/web/public/openapi.json:726; apps/web/app/api/llm/v1/chat/completions/lib/json-schema-mode.ts:824-893).

**Incomplete**

- Tool-call inspector (S105.08): shows calls the model made, with arguments, for one request; no results, no history, no streamed calls (RequestPlayground.tsx:95-101, :412-427).
- The brief marks S105.08 missing on web; that is stale in part (doc: area brief:37-39).

**Present but disconnected or switched off**

- none found

**Not available**

- Streaming event inspector: the playground body is built with stream false (RequestPlayground.tsx:114).
- Structured-output schema editor: no response_format control in apps/web/features/developers (grep found none).
- File upload and reuse by id for the gateway: no files route under apps/web/app/api/llm/v1 (directories: audio, chat, credits, embeddings, models, route); the docs say there is no Files endpoint (apps/web/app/api-docs/page.tsx:321-324); API key scopes are only models:read, inference:write, usage:read (apps/web/lib/api-key-scopes.ts:1).
- Retrieval collections: no match for 'vector_store', 'vectorStore' or 'retrieval collection' in apps/web/app/api and apps/web/lib.
- Desktop, CLI: none.

## 4. Required behaviour

**Established requirements**

- Developers can watch the raw streamed events of an API call in an inspector. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.07)
- Developers can inspect the tool calls (arguments, results) made during an API request. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.08)
- Developers can author and validate a structured-output JSON schema in the console. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.09)
- Developers can upload files once through the API or console and reuse them by id across requests. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.10)
- Developers can create and manage retrieval collections and query them from API calls. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S105.11)
- A structured reply is validated before it is returned, so json_object and json_schema need stream false. (source: apps/web/public/openapi.json:726)

**Acceptance criteria**

1. Tool-call view: with a tools array and a prompt that triggers a call, the card lists the call name, id and arguments.
2. Stream inspector (not built): a streamed call would show each event in order with timestamps.
3. Schema editor (not built): an invalid schema would be flagged before sending.
4. File reuse (not built): a file uploaded once would be usable by id in two requests.
5. Retrieval (not built): a collection would be queryable from a request.
6. Gateway: a json_schema request whose reply does not match returns 502 json_schema_not_satisfied.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] A stream inspector must work with the playground's session credential or add an API-key path, because the card sends stream false (RequestPlayground.tsx:114).
- [inferred] A file store for the gateway needs a new API-key scope, since only three scopes exist (api-key-scopes.ts:1).

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a stream switch to the playground and a raw event pane.
- [proposed] Show tool results by adding a follow-up turn in the playground.
- [proposed] Add a schema box that validates against the limits in json-schema-mode.ts before sending.
- [proposed] Reuse the chat upload store for a gateway Files route only after a trust review.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | RequestPlayground | `apps/web/features/developers/components/RequestPlayground.tsx` | Request form, tools input, tool-call and result display |
| service | run-completion | `apps/web/features/developers/lib/run-completion.ts` | Completion helper used by prompt evaluations (adjacent) |
| hook | use-gateway-models | `apps/web/features/developers/hooks/use-gateway-models.ts` | Reads GET /api/llm/v1/models for the model select |
| endpoint | POST /api/llm/v1/chat/completions | `apps/web/app/api/llm/v1/chat/completions/route.ts` | Gateway the playground calls |
| service | json-schema-mode | `apps/web/app/api/llm/v1/chat/completions/lib/json-schema-mode.ts` | Validates a reply against a supplied schema, with size and depth limits (lines 9-40) |
| service | json-object-mode | `apps/web/app/api/llm/v1/chat/completions/lib/json-object-mode.ts` | Directive and parse for json_object |
| other | OpenAPI response_format | `apps/web/public/openapi.json` | Documents text, json_object, json_schema (line 724-735) |
| config | API key scopes | `apps/web/lib/api-key-scopes.ts` | Only models:read, inference:write, usage:read |
| test | request-playground-tools test | `apps/web/features/developers/__tests__/request-playground-tools.test.ts` | Covers tools parsing and tool-call reading |
| component | api-docs migrating text | `apps/web/app/api-docs/page.tsx` | States there is no Files endpoint and json_schema is enforced when stream is false (lines 292-325) |
| endpoint | chat uploads (adjacent, not gateway) | `apps/web/app/api/uploads/knowledge-file` | Project knowledge file upload for the chat app; not an API-key route as far as read |
| component | PromptEvaluations (adjacent) | `apps/web/features/developers/components/PromptEvaluations.tsx` | Existing evaluation tool in the console, outside this feature |
| screen | DeveloperConsolePage | `apps/web/features/developers/components/DeveloperConsolePage.tsx` | Lists the cards; none for the unbuilt tools (lines 67-75) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The browser builds a non-streamed chat request with optional tools and sends it with the session credential and an idempotency key. | device | RequestPlayground.tsx:104-122, :181-193 |
| The gateway admits the request, routes it to a model and returns the completion; tool calls arrive in the message. | our servers | apps/web/app/api/llm/v1/chat/completions/route.ts:446-520 |
| The model runs at an outside provider chosen by routing. | outside service | route.ts:1405-1425 (upstream call and error path) |
| The card reads choices[0].message.tool_calls and prints arguments. | device | RequestPlayground.tsx:95-101, :412-427 |
| For json_schema the server validates the reply before returning it. | our servers | json-schema-mode.ts:824-893; openapi.json:726 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Playground request and result | Component state in the browser | no | Gone on reload |
| Billed usage row for the playground request | managed_usage_requests (gateway ledger) | Server | unknown |

**Models and providers.** The playground lets the person pick auto or a listed model; routing and provider are chosen by the gateway (use-gateway-models.ts:5-20). Structured output works only on a model the registry marks for it, else 400 model_no_structured_output (openapi.json:726).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account for the playground. Gateway use with a key needs plan:pro or above. |
| Permissions | none found in the code for the playground beyond sign-in. |
| Subscription | Playground requests spend credits like any managed call (RequestPlayground.tsx:181-193). Gateway keys need managed_api tiers: plan:pro, plan:max, plan:max_15x, plan:team, plan:team_premium, plan:enterprise (billing-catalog.ts:341, :358). |
| Limits and metering | Chat completions 30 per minute per user (rate-limit.ts:359-363). Schema limits: 32,000 characters, depth 10, 5,000 nodes (json-schema-mode.ts:9-12). |
| Feature flags | none found in the code |
| Model compatibility | json_schema needs a model the registry marks for structured output (openapi.json:726). Tool use depends on the model; not checked per model. |
| Provider restrictions | A provider's native JSON mode is requested only when the registry marks the model for it (openapi.json:726). |
| Local mode | Not applicable: these tools call the managed gateway. Local and own-key requests do not use it, so none of these tools could observe them. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Invalid tools text | Send is disabled and the help line shows the error. | RequestPlayground.tsx:172-173, :351-353 |
| Gateway error | Failure message with the status. | RequestPlayground.tsx:144-166, :196-199 |
| Network failure | 'The request could not be sent. Try again.' | RequestPlayground.tsx:212-216 |
| Model returns no text | 'The model returned no text.' unless tool calls exist. | RequestPlayground.tsx:407-411 |
| Unparseable arguments | Shown as raw text. | RequestPlayground.tsx:86-91, test lines in request-playground-tools.test.ts |
| Streaming, schema editor, files, collections | not handled in the code; the features do not exist. | searches listed above |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/features/developers/__tests__/request-playground-tools.test.ts`: Tools field accepts empty or a JSON array and explains errors; reads tool calls with readable arguments and keeps unparseable ones
- `apps/web/app/api/llm/v1/chat/completions/lib/__tests__`: Directory exists; whether it holds json-schema tests was not checked
- `apps/web/app/api-docs/__tests__/api-docs-credential-claims.test.ts`: Docs claims about operations and credentials (relevant to the no-Files statement only by path checks)

**Test scenarios**

- **Tool-call view**
  1. Open 'Try a request'.
  2. Enter a tools array with one function.
  3. Ask for something that needs it.
  4. Send.
  - Expected: The 'Tool calls' list shows the name, id and arguments, with a finish reason.
- **Invalid tools**
  1. Enter 'oops' in Tools.
  - Expected: Send is disabled and the help line says 'Tools are not valid JSON.'
- **Schema enforcement**
  1. Call the gateway with response_format json_schema and stream false.
  2. Use a schema the model's reply cannot satisfy.
  - Expected: 502 with code json_schema_not_satisfied.
- **Schema with stream**
  1. Send json_schema with stream true.
  - Expected: The request is refused (per the OpenAPI note).
- **No Files route**
  1. Call POST /api/llm/v1/files with a key.
  - Expected: A not-found answer.
- **No stream view**
  1. Look in /developers for a stream switch.
  - Expected: None exists.

**Where to look when it fails**

- Gateway error codes json_schema_refused, json_schema_incomplete, json_schema_not_satisfied (json-schema-mode.ts:824-893).
- Server and browser network tab for the playground request.
- Search results recorded in this page's gaps for the missing routes.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/105-developer-platform-and-console.md](../../70-qa/test-plans/web/105-developer-platform-and-console.md)
- Desktop: [70-qa/test-plans/desktop/105-developer-platform-and-console.md](../../70-qa/test-plans/desktop/105-developer-platform-and-console.md)

## 10. Gaps and dependencies

- **No streaming event inspector.** Affects: Web and desktop developers. Evidence: RequestPlayground.tsx:114 stream false. Work needed: Add streaming to the playground and an event pane.
- **Tool-call inspector is partial: no results, no history.** Affects: Web and desktop developers. Evidence: RequestPlayground.tsx:95-101. Work needed: Add tool result turn and logging of calls with no prompt text.
- **No structured-output schema editor although the gateway enforces schemas.** Affects: Web and desktop developers. Evidence: openapi.json:726; no control in features/developers. Work needed: Add an editor and checks against the server limits.
- **No file upload and reuse for the gateway API.** Affects: API developers. Evidence: No files route in apps/web/app/api/llm/v1; api-docs page.tsx:321-324. Work needed: Design a route, scope and storage with a trust review.
- **No retrieval collection manager.** Affects: API developers. Evidence: No match for the terms searched. Work needed: Design and build, or cut from the brief.
- **The decision record says json_schema is refused; code and docs say it is enforced.** Affects: Readers of the decision doc. Evidence: docs/decisions/wire-or-cut.md (2026-08-06 section) vs openapi.json:726. Work needed: Update the decision doc.

**Depends on**

- surface:web
- surface:desktop
- mode:cloud
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-inference-providers
- SYS-files-artifacts-and-storage
- SYS-api-and-contracts
- api:POST /api/llm/v1/chat/completions
- api:GET /api/llm/v1/models
- plan:pro
- F105-07
- F105-08

## Unknown

- Whether json-schema-mode has its own tests (directory not listed).
- Whether the chat upload routes accept an API key.
- Retention of playground request rows in the ledger.
- Whether the brief's S105.07 to S105.11 statuses were derived from an older build.
- Whether any docs/product file requires these tools.
