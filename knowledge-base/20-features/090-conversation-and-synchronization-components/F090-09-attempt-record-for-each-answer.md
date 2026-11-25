---
id: "F090-09"
type: "feature"
title: "Attempt record for each answer"
aliases: ["Generation attempt", "Attempt outcome", "attempt_outcome", "attempt_error_class", "managed_usage_requests", "free_daily_usage_reservations", "S90.05"]
area: "90 Conversation and synchronization components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S90.05"]
depends_on: ["mode:cloud", "table:managed_usage_requests", "table:free_daily_usage_reservations", "table:web_conversations", "SYS-subscriptions-entitlements-and-usage", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-observability-and-operations", "SYS-data-model-and-migrations", "F090-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F090-09 Attempt record for each answer

For every Cloud turn the server keeps a usage row that now also records which conversation it answered, and how it ended: completed, failed or cancelled, with a failure class. It is written once at settlement. No screen or API that reads it was found, so people cannot see failed tries yet.

Area: [90. Conversation and synchronization components](README.md). Requirement items: [S90.05](../../10-requirements/capabilities/090-conversation-and-synchronization-components.md#s9005).

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

**What it does.** Adds conversation_id, attempt_outcome and attempt_error_class to the usage row of each managed request (paid or managed route) and to the Free-pool reservation row. Provider and model were already columns. (apps/web/db/neon/0329_managed_usage_attempt_record.sql:23-32; apps/web/db/neon/0331_free_usage_attempt_record.sql; apps/web/db/neon/0056_managed_usage_requests.sql:18-19)

**Why it exists.** Before this, a failed and a cancelled try both ended as 'released', and the row did not say which chat it belonged to. The brief requires every attempt (first answer, retry, regenerate) to be recorded with its own id, status, provider and model, including failed and cancelled ones (brief S90.05). Migration comment: it could not say which conversation, how it ended, or why. (apps/web/db/neon/0329_managed_usage_attempt_record.sql:4-9)

**Who uses it.** The server and operators (support, billing reconciliation). End users see the effect only as answers or errors. (apps/web/lib/services/managed-usage-request-service.ts:673-695)

**Problems it solves**

- Telling a failed turn from a cancelled one in the ledger.
- Linking cost rows to a chat so support can explain a charge. [inferred]
- Keeping a record when a Free-pool turn reserved nothing: it now writes a zero-cost row. (apps/web/db/neon/0331_free_usage_attempt_record.sql:8-12)

**Use cases**

- Support asks why a turn did not complete: error class such as a rate limit is stored.
- Billing review separates cancelled tries from failed ones.
- Deleting a chat clears conversation_id but keeps the cost row. (0329:24-26 on delete set null)

## 2. User experience

**Where to find it**

- No screen found. The person sees only the answer, a retry or an error message in the chat. (grep of apps/web app and lib shows attempt_outcome only in the two services and a test)

**Before you start**

- A Cloud turn that reserves usage (managed or Free route).

**Screens and controls**

- None.

**Journey**

1. Person sends a message in a Cloud chat.
2. Server reserves usage for the request under an idempotency key and attaches the conversation id.
3. Provider call runs; the turn completes, fails or is stopped.
4. Settlement writes the outcome once.

**What the person sees and gets**

- None to the person. A warning log is written if the outcome could not be saved. (apps/web/lib/services/managed-usage-request-service.ts:685-695)

**Settings**

- None.

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Columns, constraints and an index by conversation exist in migrations 0329 and 0331. (apps/web/db/neon/0329_managed_usage_attempt_record.sql:23-36)
- Conversation id is written when the request is reserved, only if still empty. (apps/web/lib/services/managed-usage-request-service.ts:653-671,881)
- Outcome and error class are written once, guarded by 'attempt_outcome is null'. (managed-usage-request-service.ts:673-695,1228-1230)
- Free-pool turns write the same fields at settlement, including zero-cost rows. (apps/web/lib/services/free-trial-service.ts:785-806,820-832,898-918)
- Error class must match ^[a-z][a-z0-9_]{0,63}$ and is kept only for failed attempts. (apps/web/lib/services/generation-attempt.ts:7-15)
- Callers pass failed with a class, or cancelled for stopped streams and stopped agent turns. (apps/web/app/api/llm/v1/chat/completions/route.ts:205,215; lib/stream-transform.ts:221; lib/managed-agent-stream.ts:570)

**Incomplete**

- A turn that only paused for input leaves the outcome null by design (attempt null). (managed-usage-request-service.ts:1228; apps/web/app/api/llm/v1/chat/completions/lib/managed-agent-stream.ts:570)
- The attempt has no id of its own: the row id and idempotency key identify it. Whether a retry or regenerate gets a fresh key is not established. (apps/web/db/neon/0056_managed_usage_requests.sql:14-16; managed-usage-request-service.ts:881)

**Present but disconnected or switched off**

- No read path: no API, screen or export field reading attempt_outcome or attempt_error_class was found in apps/web/app or lib outside the writers. (grep result)

**Not available**

- Local mode and own-key mode: the row exists only for managed reservations; BYOK and Local attempts are not recorded here. [inferred from the table name and managed reservation path]
- Mobile, Desktop, CLI, VS Code, Chrome have no view of it.

## 4. Required behaviour

**Established requirements**

- Every generation attempt (first answer, retry, regenerate) is recorded with its own id, status, provider and model, including failed and cancelled attempts. (source: brief S90.05)
- Outcome and error class are written once by the first finalization; null means the attempt predates the record. (source: apps/web/db/neon/0329_managed_usage_attempt_record.sql:13-16)
- The ledger separates what the first attempt cost from what repeating it cost; a regenerated turn sends the same payload and hashes the same. (source: apps/web/lib/services/managed-usage-request-service.ts:1233-1236)
- Warn when the outcome cannot be saved. (source: apps/web/lib/services/managed-usage-request-service.ts:685-695)

**Acceptance criteria**

1. After a successful managed turn the row shows attempt_outcome = completed and the conversation id.
2. After a provider failure the row shows failed and a snake_case class.
3. After the person stops a stream the row shows cancelled.
4. A second finalization of the same request does not change the outcome.
5. Deleting the conversation leaves the row with conversation_id null.
6. A Free-pool turn with no reserved money still produces a row with an outcome.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Retries and regenerations should be distinguishable in the record, since the brief names them. [inferred]
- Users or support should be able to see failed tries; the brief says 'so failed and cancelled tries can be seen later'. [inferred from the item text]

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add an attempt number or parent attempt link so retries group under one turn.
- [proposed] Add a read API or a section in usage history showing failed and cancelled tries.
- [proposed] Record the same fields for own-key turns if usage history should cover them.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| schema | 0329 attempt record | `apps/web/db/neon/0329_managed_usage_attempt_record.sql` | Adds the three columns and index on managed_usage_requests. |
| schema | 0331 free attempt record | `apps/web/db/neon/0331_free_usage_attempt_record.sql` | Same columns on free_daily_usage_reservations; allows zero reservations. |
| table | managed_usage_requests | apps/web/db/neon/0056_managed_usage_requests.sql (not found) (not found) | Per-request usage row with provider, model, status. |
| table | free_daily_usage_reservations | `apps/web/lib/services/free-trial-service.ts` | Free-route reservation row with attempt fields. |
| service | managed-usage-request-service | `apps/web/lib/services/managed-usage-request-service.ts` | attributeToConversation, recordAttemptOutcome, finalization. |
| service | free-trial-service | `apps/web/lib/services/free-trial-service.ts` | settleFreeTrialRequest and unmetered settle. |
| service | generation-attempt | `apps/web/lib/services/generation-attempt.ts` | Outcome type and error class rule. |
| service | request-processor | `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Passes failed outcomes with classes (lines 6743, 6810). |
| service | stream-transform | `apps/web/app/api/llm/v1/chat/completions/lib/stream-transform.ts` | Marks stopped streams cancelled (line 221). |
| service | managed-agent-stream | `apps/web/app/api/llm/v1/chat/completions/lib/managed-agent-stream.ts` | Agent turn terminal outcomes (lines 202-290, 570). |
| service | settle-refused-free-trial | `apps/web/app/api/llm/v1/chat/completions/lib/settle-refused-free-trial.ts` | Records failed outcome for refused Free turns. |
| test | managed-usage-lifecycle invariants | `apps/web/lib/services/__tests__/managed-usage-lifecycle.invariants.test.ts` | Fake database models the outcome write. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Server reserves usage for the request, creating the row with provider and model. | our servers | apps/web/lib/services/managed-usage-request-service.ts:810-881 |
| Conversation id is attached if the caller owns it. | our servers | managed-usage-request-service.ts:653-671 |
| Provider call runs. | outside service | Cloud route calls the provider (see SYS-inference-providers) |
| Finalization records outcome and class once. | our servers | managed-usage-request-service.ts:1228-1230 |
| Free-pool turns settle the reservation row with the same fields. | our servers | apps/web/lib/services/free-trial-service.ts:785-806 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| conversation_id, attempt_outcome, attempt_error_class, provider, model, status | table managed_usage_requests; table free_daily_usage_reservations | Not synced to devices | conversation_id set null on conversation delete; other retention unknown. |

**Models and providers.** Provider and model are recorded per request as dispatched. (apps/web/db/neon/0056_managed_usage_requests.sql:18-19) Failure class comes from the provider failure category, for example rate limit. (apps/web/db/neon/0329_managed_usage_attempt_record.sql:42-43)

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Cloud account; the row is keyed by user id. (0056:15) |
| Permissions | Server-internal; no user API found. |
| Subscription | The row is part of the subscription usage ledger: managed requests reserve cost against plan allowance. The attempt fields are record-keeping and do not change allowance. (apps/web/lib/services/managed-usage-request-service.ts:1011-1030,1228-1230) |
| Limits and metering | None specific to the record. |
| Feature flags | None found. |
| Model compatibility | Any model that is routed through the managed path. |
| Provider restrictions | None. |
| Local mode | Not recorded: Local inference does not reserve a managed request. [inferred] |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Outcome write fails | Warning log 'managed_usage_attempt_outcome_unrecorded'; the finalization continues. (Logged at error level in code.) | managed-usage-request-service.ts:685-695 |
| Conversation id write fails | Log 'managed_usage_conversation_unrecorded'; reservation continues. | managed-usage-request-service.ts:664-670 |
| Repeat finalization | No change because of 'attempt_outcome is null'. | managed-usage-request-service.ts:681-682 |
| Paused for input | Outcome stays null. | managed-agent-stream.ts:570 |
| Invalid error class text | Stored as null. | generation-attempt.ts:11-15 |
| Old rows | Null means predates the record. | 0329:15-16 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/managed-usage-lifecycle.invariants.test.ts`: Fake store with the attempt outcome update (line 247).
- `apps/web/lib/services/__tests__/managed-usage-request-service.provider-cost.test.ts`: Provider cost handling of the same service (attempt fields not confirmed).
- `apps/web/app/api/llm/v1/chat/completions/lib/stream-billing-outcome.test.ts`: Stream billing outcome.

**Test scenarios**

- **Completed turn**
  1. Send one Cloud message on a paid or managed route.
  2. Query managed_usage_requests for the request.
  - Expected: attempt_outcome completed, conversation_id set, provider and model filled.
- **Cancelled turn**
  1. Start a long answer and press stop.
  2. Query the row.
  - Expected: attempt_outcome cancelled.
- **Failed turn**
  1. Force a provider failure in a test route.
  2. Query the row.
  - Expected: failed with a class matching the pattern.
- **Free-pool zero cost**
  1. On a Free account with the pool spent, send a message that is allowed on the free-pool route.
  - Expected: A free_daily_usage_reservations row with reserved_microusd 0 and an outcome.
- **Chat deleted**
  1. Delete the chat, query the row.
  - Expected: conversation_id null, outcome unchanged.

**Where to look when it fails**

- Log events managed_usage_attempt_outcome_unrecorded and managed_usage_conversation_unrecorded.
- Tables managed_usage_requests and free_daily_usage_reservations.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Nothing reads the attempt record; people cannot see failed or cancelled tries** Affects: All users and support on every app. Evidence: attempt_outcome appears only in managed-usage-request-service.ts and free-trial-service.ts under apps/web/lib and app. Work needed: Add a read path (usage history or support view).
- **No own id per attempt and no link between a retry and the first try** Affects: Retry and regenerate analysis. Evidence: apps/web/lib/services/managed-usage-request-service.ts:1233-1236 says a regenerated turn hashes the same. Work needed: Establish whether idempotency key differs per retry; add an attempt number if required.
- **Own-key and Local attempts are not recorded** Affects: BYOK and Local users. Evidence: table is a managed usage ledger (0056). Work needed: Decide whether usage history should include them.
- **Brief says warning, code logs at error level** Affects: Log filters only. Evidence: managed-usage-request-service.ts:685-695. Work needed: Align the brief or the level.

**Depends on**

- mode:cloud
- table:managed_usage_requests
- table:free_daily_usage_reservations
- table:web_conversations
- SYS-subscriptions-entitlements-and-usage
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-observability-and-operations
- SYS-data-model-and-migrations
- F090-08

## Unknown

- Whether a retry or regenerate uses a new idempotency key.
- Any reader of the attempt fields outside apps/web (not searched exhaustively).
- Retention period of usage rows.
- Whether cancelled is written for every stop path on every provider route.
