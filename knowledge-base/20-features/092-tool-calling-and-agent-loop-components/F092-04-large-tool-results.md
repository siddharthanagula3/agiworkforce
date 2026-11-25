---
id: "F092-04"
type: "feature"
title: "Large tool results"
aliases: ["Large-result reference service", "Tool result store", "read_tool_result", "Stored tool result", "Trimmed tool result reference"]
area: "92 Tool-calling and agent-loop components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S92.09"]
depends_on: ["SYS-files-artifacts-and-storage", "SYS-security-and-privacy", "SYS-chat-turn-pipeline", "SYS-data-model-and-migrations", "F092-03", "F092-01", "surface:web", "mode:cloud", "file:apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F092-04 Large tool results

When a tool returns more than 100,000 bytes, the first part goes to the model and the rest is kept for 24 hours under a reference id; the model reads it in 40,000-character pages with the read_tool_result tool. Older results trimmed from long chats are kept the same way. Needs a key-value store; otherwise the result is just cut.

Area: [92. Tool-calling and agent-loop components](README.md). Requirement items: [S92.09](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9209).

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

**What it does.** referenceOversizedToolResult checks the secret policy, stores the full result (up to 900,000 characters) under a random reference and returns the first 100,000 bytes plus a note telling the model how to read the rest (apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts:153-215). readStoredToolResult returns a page of up to 40,000 characters wrapped as untrusted data (tool-result-store.ts:262-337).

**Why it exists.** Long tool output would fill the model's context. Keeping it by reference lets the model fetch only what it needs, and lets it re-read results that were trimmed from history.

**Who uses it.** The model, through a reader tool. The person is not given a control; what they see of the notice is unknown.

**Problems it solves**

- Oversized sandbox, connector and MCP results no longer flood the context (tool-loop.ts:2850-2860,2905-2925,3005-3020).
- Results trimmed from a long chat remain readable (tool-loop.ts:1657-1700).
- Secrets in stored results are checked before storage and on read (tool-result-store.ts:158-160,299-304).

**Use cases**

- A sandbox command prints a large log; the model reads page two with offset 40000.
- A connector returns a big document; the first part is shown and the model asks for more.
- In a later turn the model re-reads a result trimmed earlier.

## 2. User experience

**Where to find it**

- Model-facing only: tool 'read_tool_result' with 'reference' and 'offset' (tool-result-store.ts:339-361).
- Web chat shows the tool step; what the person sees of the shortened-result note is unknown.
- Other apps: no user control found.

**Before you start**

- Cloud mode hosted chat.
- A key-value store configured and a user and conversation id; otherwise the result is truncated, not stored (tool-result-store.ts:168-169).

**Screens and controls**

- No person-facing control found.

**Journey**

1. A tool returns more than 100,000 bytes.
2. The server redacts or blocks secrets per the account policy.
3. The full text (up to 900,000 characters) is stored for 24 hours and indexed for the conversation.
4. The model gets the first 100,000 bytes and a note: 'This result is N characters and only the first M are shown. Call read_tool_result with reference "id" and an offset to read the rest.'
5. On later steps read_tool_result is offered and the model reads pages.

**What the person sees and gets**

- Each page ends with 'Characters X to Y of Z. Read on from offset Y.' or 'This is the end of the kept result.' (tool-result-store.ts:326-331).
- Errors: 'No stored tool result matches "ref". Stored results are kept for one day.' (tool-result-store.ts:287-292).

**Settings**

- Window 24 hours (tool-result-store.ts:16); list at most 10 recent results (line 18); page 40,000 characters (line 19). Hard-coded, no setting found.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Inline limit 100,000 bytes; kept limit 900,000 characters (apps/web/lib/e2b/types.ts:117,120).
- Storage is keyed by user id, conversation id and reference with a 24 hour expiry, written only if absent (tool-result-store.ts:42-44,171-181).
- An index lists up to 10 results for later turns and a notice names them to the model (tool-result-store.ts:109-136,pending earlierToolResultsNotice at 342-349 region).
- Reader tool is offered only when earlier results exist or a notice marker is already in the messages (tool-loop.ts:3965-3980).
- Secret policy: blocked content returns a block message; redacted content is stored redacted (tool-result-store.ts:158-165; apps/web/lib/security/tool-result-secret-policy.ts:19-60).
- History trimming above 200,000 characters keeps the 6 most recent results and stores older ones by reference (tool-loop.ts:544-545,1657-1700).
- Missing or invalid references return an error; offsets past the end return an error (tool-result-store.ts:262-325).
- Error results are not stored; they are capped (tool-loop.ts:2918-2925).

**Incomplete**

- Without a key-value store or with a store write failure, the result is only cut to 100,000 bytes and the model gets a truncation line, no reference (tool-result-store.ts:165-181; apps/web/lib/e2b/execution-tools.ts:286-290).
- No person-facing way to open a stored result was found.

**Present but disconnected or switched off**

- The reader is hidden when there are no stored results (tool-loop.ts:3965-3980).

**Not available**

- A user-facing fetch of stored results on any app: none found.
- Stored result handling on mobile, CLI, extensions: not established; the CLI has a per-tool size cap in its catalog (apps/cli/src/platform/runtime/tool_catalog.rs:151-157).

## 4. Required behaviour

**Established requirements**

- Oversized tool results are stored once and referenced by id, so the model and user can fetch the full result later. (source: Brief S92.09)
- Tool outputs are normalised into a bounded, redacted result before they reach the model. (source: Brief S92.07)
- Tool results are stored durably with the run so a paused turn and the transcript can read them. (source: Brief S92.08 (not examined in detail))

**Acceptance criteria**

1. A result over 100,000 bytes returns a first slice plus a reference note.
2. read_tool_result with the reference and offset 0 returns up to 40,000 characters, fenced as untrusted data.
3. Reading with an offset past the end returns an error naming the kept length.
4. A reference older than 24 hours returns 'No stored tool result matches'.
5. A result with a high-confidence secret under a 'block' policy is replaced by a block message.
6. With no key-value store, the result is cut and no reference is given.
7. After 200,000 characters of history, older tool results are replaced by a notice naming a reference.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- The brief says the user can fetch the full result; no user path exists in the code read [inferred gap].
- The first draft's 'at most 10 results are listed' refers to the earlier-results notice only [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Give the person a way to open or download a stored result.
- [proposed] Surface 'stored for 24 hours' to the person.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | referenceOversizedToolResult | `apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts` | Stores large results and builds the note (line 153) |
| service | readStoredToolResult | `apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts` | Returns a page, verifies reference, applies secret policy (line 262) |
| service | toolResultReaderToolDef | `apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts` | The read_tool_result tool schema (line 339) |
| service | listConversationToolResults | `apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts` | Lists up to 10 stored results for later turns (line 109) |
| service | trimToolResultHistoryKeepingReferences | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Trims history and stores older results by reference (line 1657) |
| service | capOutput | `apps/web/lib/e2b/execution-tools.ts` | Fallback truncation at 100,000 bytes (line 286) |
| config | output size constants | `apps/web/lib/e2b/types.ts` | MAX_EXECUTION_OUTPUT_BYTES and MAX_KEPT_TOOL_OUTPUT_CHARS (lines 117,120) |
| service | tool result secret policy | `apps/web/lib/security/tool-result-secret-policy.ts` | Allow, warn, redact or block secrets in results |
| service | key-value store | `apps/web/lib/server/key-value.ts` | Resolves the backend for stored results |
| service | result owner scope | `apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts` | toolResultOwnerForTurn keeps no-conversation turns private (line 32) |
| service | tool-result-resume | `apps/web/app/api/llm/v1/chat/completions/lib/tool-result-resume.ts` | Resume handling of tool results (named only; not opened) |
| test | tool-result-store test | `apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.test.ts` | Store behaviour (by file name) |
| test | tool-result-store secret policy test | `apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.secret-policy.test.ts` | Secret handling in the store (by file name) |
| test | tool-loop.large-file test | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.large-file.test.ts` | Large file turns (by file name) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| An executor (sandbox, connector, MCP) returns long text. | outside service | tool-loop.ts:2850,2905,3005 |
| Server scans for secrets and applies the account policy (allow, warn, redact, block). | our servers | tool-result-store.ts:158-160; tool-result-secret-policy.ts:19-60 |
| Full text is written to the key-value store with a 24 hour expiry and indexed per conversation. | our servers | tool-result-store.ts:171-190 |
| First 100,000 bytes and a reference note go to the model. | our servers | tool-result-store.ts:192-203 |
| The model calls read_tool_result with reference and offset; the page is read, secret-checked again, and fenced. | our servers | tool-result-store.ts:262-337; tool-loop.ts:5488-5499 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Full oversized tool result and a per-conversation index | Key-value store keys 'agi-tool-result:<user>:<conversation>:<ref>' and an index hash (backend chosen by resolveKeyValueRuntime) | Server-side only; any device in the same conversation can ask the model to read it | Expires after 24 hours (tool-result-store.ts:16) |

**Models and providers.** The model reads pages in later steps; any provider that supports tool calls. The note is plain text to the model.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Needs a user id and conversation id (a request id stands in when there is no conversation) (tool-result-store.ts:32-40). |
| Permissions | Reads are scoped to user and conversation key (tool-result-store.ts:42-44). |
| Subscription | none found in the code |
| Limits and metering | 100,000 bytes inline; 900,000 characters kept; 24 hours; 40,000 characters per page; 10 listed (tool-result-store.ts:16-19; types.ts:117,120). No metering found. |
| Feature flags | none found in the code; depends on a key-value backend being configured. |
| Model compatibility | Needs tool calling. |
| Provider restrictions | none found in the code |
| Local mode | Server side only, so not used for Local mode. Local stored-result handling not examined. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Empty: nothing stored | Reader tool not offered | tool-loop.ts:3965-3980 |
| Reference not found or expired | Error: No stored tool result matches the id; kept one day | tool-result-store.ts:287-292 |
| Bad reference format | Same not-found error | tool-result-store.ts:273-275 |
| Store unavailable on write | Falls back to a truncated result | tool-result-store.ts:165-181 |
| Store unavailable on read | 'The stored tool result could not be read. Try again.' | tool-result-store.ts:279-286 |
| Secret blocked | Block message returned instead of content | tool-result-store.ts:159,300 |
| Offset past end | Error with kept length | tool-result-store.ts:311-316 |
| Result over 900,000 characters | Only the first 900,000 are kept and the note says so | tool-result-store.ts:157,201-203 |
| Offline, cancel, accessibility | not handled in the code for this step | tool-result-store.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.test.ts`: Store (by file name)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.secret-policy.test.ts`: Secret policy on stored results (by file name)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.large-file.test.ts`: Large file turns (by file name)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.secret-results.test.ts`: Secret policy applied to tool results in the loop (describe at lines 143 and 236)

**Test scenarios**

- **Oversized result**
  1. Run sandbox code that prints 300,000 characters.
  - Expected: Model sees about 100,000 bytes and a note with a reference.
- **Read a page**
  1. Have the model call read_tool_result with that reference and offset 40000.
  - Expected: A fenced page and 'Characters 40000 to 80000 of N'.
- **Expired reference**
  1. Call read_tool_result with a reference older than 24 hours.
  - Expected: 'No stored tool result matches ... kept for one day'.
- **Secret in result**
  1. Return a high-confidence secret in a large result under a Block policy.
  - Expected: Block message instead of the text.
- **No store**
  1. Run with no key-value backend.
  - Expected: Truncated result with no reference.

**Where to look when it fails**

- Log '[tool-result-store] oversized result not kept' (tool-result-store.ts:184).
- Log '[tool-result-store] stored result could not be read'.
- Text 'is not available on this turn' for reader (tool-loop.ts:5493).

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **No person-facing path to fetch a stored result; brief says 'the model and user'.** Affects: Web, mobile, all apps. Evidence: Search of tool-result-store.ts shows only the model tool. Work needed: Add a route or UI, or change the requirement.
- **Silent downgrade to truncation when the store is missing.** Affects: Deployments without a key-value backend. Evidence: tool-result-store.ts:168-169. Work needed: Log or expose a metric when downgraded.
- **Brief line numbers 2176, 3087, 4233 do not match the files.** Affects: Documentation. Evidence: audit brief S92.09. Work needed: Refresh the brief.
- **Durable storage of tool calls with the run (S92.08) not examined here.** Affects: Documentation. Evidence: Brief S92.08. Work needed: Verify in the data model.

**Depends on**

- SYS-files-artifacts-and-storage
- SYS-security-and-privacy
- SYS-chat-turn-pipeline
- SYS-data-model-and-migrations
- F092-03
- F092-01
- surface:web
- mode:cloud
- file:apps/web/app/api/llm/v1/chat/completions/lib/tool-result-store.ts

## Unknown

- Which key-value backend runs in production.
- What the person sees of the shortened-result notice.
- What the stored-results tests assert (not opened).
- Whether tool calls and results are stored durably with the run as S92.08 requires.
- Behaviour on mobile, CLI and extensions.
