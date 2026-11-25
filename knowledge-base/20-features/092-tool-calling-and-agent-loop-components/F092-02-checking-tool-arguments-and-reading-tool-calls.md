---
id: "F092-02"
type: "feature"
title: "Checking tool arguments and reading tool calls"
aliases: ["Tool argument validator", "Tool-call parser", "toolArgumentProblem", "invalidToolArgumentsMessage", "argsMalformed", "Tool call shape (id, name, arguments)"]
area: "92 Tool-calling and agent-loop components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S92.04", "S92.05"]
depends_on: ["SYS-chat-turn-pipeline", "SYS-agents-tools-and-automation", "SYS-api-and-contracts", "F092-01", "F092-03", "F092-05", "surface:web", "mode:cloud", "file:packages/ai/provider-protocol/src/tool-argument-validation.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F092-02 Checking tool arguments and reading tool calls

Tool calls from a model stream or from saved messages are turned into one shape (id, name, arguments). Before anything runs, the arguments get a shallow schema check: valid JSON, required keys, top-level types and fixed value lists. A bad call is refused with a reason sent back to the model, and does not ask the person first. Web server path.

Area: [92. Tool-calling and agent-loop components](README.md). Requirement items: [S92.04](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9204), [S92.05](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9205).

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

**What it does.** Reads streamed tool-call fragments and stored assistant messages into PendingToolCall objects with id, qualified name and parsed arguments, flagging text that is not JSON (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:2163-2190,3026-3057). It then checks arguments against the tool's declared input schema (packages/ai/provider-protocol/src/tool-argument-validation.ts:74-108).

**Why it exists.** Models sometimes send arguments that are missing a required field or have the wrong type. Refusing early with a clear reason lets the model fix the call instead of running a tool on bad input.

**Who uses it.** The tool loop on every call; the model sees the rejection text. The person is not asked to do anything.

**Problems it solves**

- Broken JSON from a model no longer runs a tool (tool-argument-validation.ts:78).
- Missing required fields and wrong types are caught before execution (tool-argument-validation.ts:84-106).
- A bad call does not trigger an approval prompt (tool-loop.ts:7498-7510).

**Use cases**

- A model calls a connector tool without a required 'owner' field; the call is refused with 'missing required argument "owner"'.
- A model sends a number where a string is declared; the refusal names the argument and type.
- A provider streams arguments in pieces; they are joined and parsed once at the end.

## 2. User experience

**Where to find it**

- Web chat: a refused call appears as a failed tool step in the activity list (tool status 'failed'; tool-loop.ts:5525-5545 region) [inferred for the visible wording].
- Desktop (Electron) shows the same hosted web chat (AGENTS.md section 5).
- Mobile, CLI, VS Code, Chrome: they receive the same server events when they use the hosted chat; their own validators for local tool runs were not examined.

**Before you start**

- A model that calls tools through hosted chat (Cloud mode).
- The tool must have a declared input schema; without one the check passes (tool-argument-validation.ts:79).

**Screens and controls**

- No control. The person sees a failed tool step.

**Journey**

1. Model answers with a tool call.
2. Server parses id, name, arguments; invalid JSON sets a flag.
3. Server gates calls; calls with an argument problem are separated out before approval and settled as errors (tool-loop.ts:7498-7510).
4. The error text goes back to the model: 'Tool "X" was not run because its arguments were rejected: ... Call it again with arguments that match its schema.' (packages/ai/provider-protocol/src/tool-argument-validation.ts:110-115).
5. The model usually retries with fixed arguments on the next step.

**What the person sees and gets**

- Tool result marked as error with the rejection text (tool-loop.ts:5504-5510).
- Counter of malformed versus well formed calls kept as capability evidence per route (tool-loop.ts:5411-5413).

**Settings**

- none found in the code

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Streamed fragments are joined per call index and capped at 256 K characters (262,144) by slicing; extra text is dropped silently (tool-loop.ts:535,2137-2146).
- At most 32 tool calls are read per step; calls without a name are skipped; a repeated id is replaced with a new UUID (tool-loop.ts:2163-2190; packages/contracts/cloud-contracts/src/tool-call-limits.ts:2).
- Arguments that fail JSON.parse become { _raw: text } with argsMalformed true (tool-loop.ts:2171-2186,3038-3046).
- Malformed arguments are refused, not run: toolArgumentProblem returns 'the arguments were not valid JSON' first (packages/ai/provider-protocol/src/tool-argument-validation.ts:78). The code comment on PendingToolCall that says the call still runs on raw text is out of date (tool-loop.ts:910-917).
- The schema check covers: required keys present; each given property matches its top-level declared type; each given value is in a primitive enum list. null is allowed for optional keys (tool-argument-validation.ts:84-106).
- Schemas using anyOf, oneOf, allOf, not, $ref or if are skipped, and unknown extra properties are not rejected (tool-argument-validation.ts:13,80,96-105).
- Sandbox execution tools use their own schemas through the same function (apps/web/lib/e2b/execution-tools.ts:177-182,312-315).
- The same check also runs for the voice tool runner through executeOfferedToolCall (tool-loop.ts:3656-3700).

**Incomplete**

- Validation is shallow: no nested objects, array item types, min/max, patterns or additionalProperties (tool-argument-validation.ts:1-108).
- The 256 K cap applies to streamed parsing only; parseAssistantToolCalls (saved messages) has no cap (tool-loop.ts:3026-3057).
- Platform tools other than execution tools: which have schemas in externalToolSchemas is limited to the offered MCP/connector tool list, so built-in tools such as web search are not checked by this map (tool-loop.ts:4038-4042); whether they self-validate was not checked.

**Present but disconnected or switched off**

- The brief cites tool-argument-validation.ts:76 in the web folder; that file is a 3-line re-export of the provider-protocol package (apps/web/app/api/llm/v1/chat/completions/lib/tool-argument-validation.ts:1-3).

**Not available**

- Schema validation for tool calls on mobile, CLI, extensions and desktop local runs was not established.

## 4. Required behaviour

**Established requirements**

- Streamed and stored tool calls from any provider are parsed into one internal call shape (id, name, arguments). (source: Brief S92.05)
- Every tool call's arguments are validated against the declared schema before execution and invalid calls are rejected with a reason. (source: Brief S92.04)
- No sensitive action without user approval; approval prompts show action, target and risk. (source: doc: docs/product/requirements.md section 9.7 and line 1639)

**Acceptance criteria**

1. A call with a missing required argument is not executed and the result names the missing argument.
2. A call whose arguments are not valid JSON is not executed and the result says the arguments were not valid JSON.
3. A call with a wrong top-level type or an out-of-list enum value is refused with the argument name.
4. An invalid call produces no approval request.
5. A call with valid arguments proceeds to approval and execution.
6. Argument text above 256 K characters is cut at that size.
7. Two calls with the same id in one step get distinct ids.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Malformed arguments were meant to run on raw text once (old comment) and now do not; the comment should be treated as stale [inferred].
- Counting malformed calls feeds a route capability judgement [inferred from tool-loop.ts:5411-5413].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Validate nested objects and arrays against the declared schema, or use a full JSON Schema validator.
- [proposed] Apply the same 256 K cap in parseAssistantToolCalls.
- [proposed] Fix the stale PendingToolCall comment.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | toolArgumentProblem / invalidToolArgumentsMessage | `packages/ai/provider-protocol/src/tool-argument-validation.ts` | The schema check and the message sent to the model |
| service | web re-export | `apps/web/app/api/llm/v1/chat/completions/lib/tool-argument-validation.ts` | Marks the validator server-only for the web app |
| service | collectProviderStream tool-call assembly | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Joins streamed fragments, caps at 256 K characters, builds PendingToolCall (lines 2130-2190) |
| service | parseAssistantToolCalls | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Parses tool calls from stored assistant messages (line 3026) |
| service | argumentProblemFor | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Chooses sandbox schemas or connector schemas for the check (line 4038) |
| service | pre-approval screening | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Separates invalidCalls before approval (lines 7498-7510) |
| service | executeOfferedToolCall | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Offered-tool executor for voice that applies the same check (line 3656) |
| service | executionToolArgumentProblem | `apps/web/lib/e2b/execution-tools.ts` | Schemas for sandbox tools using the same validator |
| config | tool call limits | `packages/contracts/cloud-contracts/src/tool-call-limits.ts` | 32 calls per step and default step limits |
| test | tool-argument-validation test | `packages/ai/provider-protocol/src/__tests__/tool-argument-validation.test.ts` | Unit tests for the validator (contents not opened) |
| test | tool-loop.hardening test | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.hardening.test.ts` | Loop hardening cases (by file name; contents not opened) |
| service | live voice tool runner | `apps/web/lib/voice/live-voice-tool-runner.ts` | Caller of executeOfferedToolCall for voice tools |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Provider stream arrives; tool-call fragments are joined per index and capped. | our servers | tool-loop.ts:2130-2146 |
| JSON.parse of the joined text; failure keeps the raw text and sets argsMalformed. | our servers | tool-loop.ts:2171-2186 |
| Calls are gated; those with an argument problem are removed from the approval and run lists. | our servers | tool-loop.ts:7498-7510 |
| Invalid calls are settled with the rejection message as an error tool result added to the conversation. | our servers | tool-loop.ts:5504-5510 and callsToSettle at 7512-7518 |
| The next provider step lets the model retry. | outside service | loop continues to the provider (tool-loop.ts:6697) |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Rejection text as a tool message | Conversation transcript and run events | With the chat | With the conversation |
| Malformed and well-formed call counts | In memory per turn, then a route capability observation (storage not opened) | unknown | unknown |

**Models and providers.** Provider-neutral: any provider adapter's stream is reduced to the same fragments. Which providers more often send bad JSON is recorded as capability evidence but its use was not examined.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Applies on hosted chat for any signed-in account. |
| Permissions | none found in the code |
| Subscription | none found in the code |
| Limits and metering | 256 K characters per call, 32 calls per step (tool-loop.ts:535; tool-call-limits.ts:2). No billing for rejection found. |
| Feature flags | none found in the code |
| Model compatibility | Any model that emits tool calls; no per-model rule. |
| Provider restrictions | none found in the code |
| Local mode | This path is server-side and does not run for Local mode. The CLI and mobile local runs have their own parsing, not examined. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Invalid JSON | Refused with 'the arguments were not valid JSON' | packages/ai/provider-protocol/src/tool-argument-validation.ts:78 |
| Missing required argument | Refused naming the arguments | tool-argument-validation.ts:84-94 |
| Wrong type or enum value | Refused naming the argument; enum lists show up to 8 values | tool-argument-validation.ts:57-72 |
| Composite schema or no schema | Check passes | tool-argument-validation.ts:79-82 |
| Over 256 K characters | Silently cut; the result is usually invalid JSON and is refused | tool-loop.ts:2137-2146 [inferred for the refusal] |
| Retry | Model is told to call again with matching arguments | tool-argument-validation.ts:110-115 |
| Caller-owned tool | Handed to the caller; not checked here | tool-loop.ts:7485-7500 (callerOwnedTools excluded from gatedCalls) |
| Offline, cancel, accessibility | not handled in the code for this step; the check is synchronous | tool-argument-validation.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ai/provider-protocol/src/__tests__/tool-argument-validation.test.ts`: The validator (by file name; contents not opened)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.hardening.test.ts`: Loop hardening (by file name; contents not opened)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.args.test.ts`: Only toolStatusEvent argument echo (describe at line 15); not the validator
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.e2e.test.ts`: General loop end to end (by file name)

**Test scenarios**

- **Missing required field**
  1. Offer a tool with required 'owner'.
  2. Have the model call it with no arguments.
  - Expected: Result: 'Tool "..." was not run because its arguments were rejected: missing required argument "owner"'; no approval card; tool not run.
- **Broken JSON**
  1. Make a model stream arguments '{"a":'.
  2. Let the step finish.
  - Expected: Call refused with 'the arguments were not valid JSON'.
- **Wrong type**
  1. Declare 'count' as integer.
  2. Send "three".
  - Expected: Refusal 'argument "count" must be a whole number'.
- **Oversized arguments**
  1. Stream more than 262,144 characters of arguments.
  - Expected: Text cut at 262,144 characters; call refused as malformed.
- **Valid call**
  1. Send arguments matching the schema.
  - Expected: Call proceeds to approval or execution.

**Where to look when it fails**

- Search results for the text 'was not run because its arguments were rejected'.
- toolCapabilityEvidence.malformedCalls counter (tool-loop.ts:5412).
- Log lines starting '[tool-loop]'.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Validation does not look inside nested objects, arrays, ranges or patterns, and skips composite schemas.** Affects: Web Cloud chat, all connectors. Evidence: packages/ai/provider-protocol/src/tool-argument-validation.ts:80,96-105. Work needed: Use a full validator or extend the checks and add tests.
- **Stale comment says malformed arguments still run on raw text; code refuses them.** Affects: Engineers and testers reading the code. Evidence: tool-loop.ts:910-917 vs tool-argument-validation.ts:78. Work needed: Correct the comment; keep a test that locks the refusal.
- **256 K cap only on streamed parsing.** Affects: Resumed or stored tool calls. Evidence: tool-loop.ts:3026-3057. Work needed: Apply the cap in both parsers.
- **The brief and the first draft state malformed calls run; the brief line numbers (2835, 4178, 1717, 2197) do not match the files.** Affects: Documentation. Evidence: audit brief S92.04 and S92.05. Work needed: Refresh the brief.

**Depends on**

- SYS-chat-turn-pipeline
- SYS-agents-tools-and-automation
- SYS-api-and-contracts
- F092-01
- F092-03
- F092-05
- surface:web
- mode:cloud
- file:packages/ai/provider-protocol/src/tool-argument-validation.ts

## Unknown

- What the validator test asserts (not opened).
- Whether built-in tools other than the sandbox ones check their own arguments.
- Whether other apps validate tool arguments locally.
- How malformed-call evidence is used after it is counted.
