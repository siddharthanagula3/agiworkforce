---
id: "F092-06"
type: "feature"
title: "Receipts, retries and outcome checks"
aliases: ["Action-receipt store", "Connector call log", "Recent calls", "connector_call_events", "Idempotency manager", "runToolCallOnce", "External-outcome reconciliation", "writeWithReconciledOutcome", "Tool audit"]
area: "92 Tool-calling and agent-loop components"
available_on: []
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "n/a", chrome: "n/a"}
requirement_items: ["S92.17", "S92.18", "S92.19"]
depends_on: ["SYS-observability-and-operations", "SYS-connectors-plugins-and-skills", "SYS-data-model-and-migrations", "SYS-security-and-privacy", "SYS-sync-and-continuity", "F092-03", "F092-05", "surface:web", "surface:mobile", "mode:cloud", "table:connector_call_events"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F092-06 Receipts, retries and outcome checks

Each tool call leaves a trace: the audit log gets a row for platform tool runs, and connector calls add a row with outcome and duration that the person can read as 'Recent calls'. Retry-unsafe calls are claimed for 15 minutes so a retried step does not run twice. GitHub comment and review writes whose outcome is unknown are checked on GitHub.

Area: [92. Tool-calling and agent-loop components](README.md). Requirement items: [S92.17](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9217), [S92.18](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9218), [S92.19](../../10-requirements/capabilities/092-tool-calling-and-agent-loop-components.md#s9219).

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

**What it does.** recordToolCallAudit writes a security audit event for each tool outcome (completed, failed, blocked, handed off, sent to device) (apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3514-3540). meterConnectorCall inserts a connector_call_events row without waiting (apps/web/lib/connectors/health.ts:281-300; apps/web/lib/services/connector-call-log-service.ts:52-75). runToolCallOnce claims a key in the key-value store before a retry-unsafe call (apps/web/app/api/llm/v1/chat/completions/lib/tool-idempotency.ts:164-204). The GitHub write path checks GitHub after an unknown outcome (apps/web/lib/user-connector-tools.ts:413-458).

**Why it exists.** People need to know what the agent did with their accounts, a retry must not post or send twice, and a timeout must not leave the truth unknown.

**Who uses it.** People reading a connector's recent calls; the loop on every retry-unsafe call; admins reading the audit log.

**Problems it solves**

- Duplicate writes after a retry or resume (tool-idempotency.ts:1-12).
- Silent connector failures: three failures in a row mark a connector not responding (connector-call-log-service.ts:37).
- A GitHub timeout no longer leaves the model guessing (user-connector-tools.ts:413-458).

**Use cases**

- User opens a connector and reads 'Recent calls' with outcome and duration.
- A step is retried after a lost connection and the same write is not repeated.
- The model posts a GitHub comment, GitHub times out, the server checks and reports whether it landed.

## 2. User experience

**Where to find it**

- Web Connectors: 'Recent calls' list inside the connector's Tool Permissions panel (apps/web/features/connectors/components/ConnectorCallLog.tsx:31; ToolPermissionsPanel.tsx:377).
- Mobile: connector call log screen (apps/mobile/src/features/settings/cloud-connectors/ConnectorCallLog.tsx; apps/mobile/services/connectors.ts).
- Desktop public app: hosted web app (AGENTS.md section 5).
- CLI, VS Code, Chrome: no call log screen found.

**Before you start**

- Signed-in account; Cloud mode connector calls.
- Migration 0223 applied: its header says 'NOT YET APPLIED : draft only', so whether the table exists in each environment is unknown (apps/web/db/neon/0223_connector_call_events.sql:4).

**Screens and controls**

- 'Recent calls' list: connector, tool, outcome (succeeded, failed, blocked), duration, time; text 'What it was asked and if it answered. Repeated failures mark it as not responding. Arguments and results are never recorded.'; loading 'Reading the call log'; error 'The call log could not be read.' with Retry (ConnectorCallLog.tsx:31-39).

**Journey**

1. A connector tool call runs.
2. The executor times it and writes a log row in the background.
3. The person opens the connector's permissions panel.
4. The page calls GET /api/connectors/calls with the connector id and limit.
5. The list shows the latest calls newest first.

**What the person sees and gets**

- Empty list text: 'This connector has not been called yet, so there is nothing to show.' (ConnectorCallLog.tsx:33).
- GitHub unknown outcome messages: 'It is safe to try again.' or 'Check ... before trying again, so it is not posted twice.' (user-connector-tools.ts:436-451).
- Idempotent replay messages: 'already ran for this step and was not run again', 'outcome is unknown' (tool-idempotency.ts:60-82).

**Settings**

- AGI_TOOL_IDEMPOTENCY_WINDOW_MS, default 900,000 ms, minimum 1,000 (tool-idempotency.ts:16-20,45-58).
- Call log read limit: default 50, maximum 100 (apps/web/app/api/connectors/calls/route.ts:16; connector-call-log-service.ts:40).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Audit event per tool outcome with tool name, category, status and duration; eventType tool_executed, browser_action or computer_use_action (tool-loop.ts:3500-3540).
- Every call result path in the loop awaits auditToolCall (tool-loop.ts:5820-5830).
- Connector calls log succeeded, failed or blocked with duration; the insert is not awaited and a failure only logs a warning (connector-call-log-service.ts:46-75).
- GET /api/connectors/calls returns the signed-in user's rows, rate limited, no arguments or results (apps/web/app/api/connectors/calls/route.ts:18-35; 0223 table columns).
- Idempotency: every tool except a short safe list is 'unsafe' and is claimed before running; a replay returns the settled result or 'already ran'; a claim that cannot be written refuses the call; no key-value store means the call runs unguarded (tool-loop.ts:932-943; tool-idempotency.ts:164-204).
- The idempotency key is built from the request key, step, tool call id, user and organization and resume round (tool-loop.ts:5695-5702).
- Settled results above 16 KB store only 'settled' (tool-idempotency.ts:31).
- GitHub post_issue_comment and post_pull_request_review: on GitHubWriteOutcomeUnknownError the server lists recent comments or reviews since the start time and returns landed, not landed, or could not confirm (user-connector-tools.ts:413-458,499-540; apps/web/lib/github-app.ts:994-1090).

**Incomplete**

- Reconciliation covers only the two GitHub write tools; other external writes have no outcome check (user-connector-tools.ts:499-540).
- The first-draft claim 'receipt of every tool action the user can read' is partly met: platform tools go to the audit log, connector calls to the call log; no screen for the audit log of platform tools was examined.
- The 'surface' column of connector_call_events is not filled by meterConnectorCall callers seen (user-connector-tools.ts:2753-2760).
- The idempotency 'safe' list is a name list in the loop and does not use the metadata retrySafety field, so a read tool like web search is also claimed (tool-loop.ts:932-943; tool-metadata.ts:961-969).

**Present but disconnected or switched off**

- Idempotency guard is skipped when the durable workflow passes its own toolExecutor (tool-loop.ts:5703-5716).

**Not available**

- Reconciliation for non-GitHub writes (mail, calendar, messages).
- A user-facing receipt screen for platform tool actions.

## 4. Required behaviour

**Established requirements**

- Every tool action leaves a durable receipt (who, which tool, when, outcome) the user can later read. (source: Brief S92.17)
- Retry-unsafe tool calls are remembered by an idempotency key so a retried step does not run them twice. (source: Brief S92.18)
- When an external action's outcome is unknown, the runtime checks the external system and records the real outcome before retrying or reporting. (source: Brief S92.19)
- Approval prompts and logs: the product requires logs for connectors. (source: doc: docs/product/requirements.md (connector requirements list 'Logs'))

**Acceptance criteria**

1. A connector tool call adds a row with outcome and duration visible in Recent calls.
2. A failed log insert does not fail the tool call.
3. A retried step with the same key does not run an unsafe tool twice and says it already ran or its outcome is unknown.
4. With the store unreachable on claim, an unsafe call is refused with a message to the model.
5. A GitHub comment that times out but landed reports success once.
6. A GitHub comment that timed out and did not land says it is safe to try again.
7. If GitHub cannot be checked, the message says the outcome could not be confirmed.
8. An account with no connector calls sees the empty message.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Because the log write is fire-and-forget, a lost row is possible without an error [inferred from connector-call-log-service.ts:46-52].
- Idempotency for web search and other reads costs a key-value write per call [inferred].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Extend reconciliation to other external writes (mail, calendar).
- [proposed] Add a person-facing activity log for platform tool actions.
- [proposed] Use metadata retrySafety to choose which calls to claim.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | recordToolCallAudit / auditToolOutcome | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Audit event per tool outcome (lines 3514,3542) |
| service | recordConnectorCallOutcome | `apps/web/lib/services/connector-call-log-service.ts` | Background insert of a call row, read and health verdict |
| service | meterConnectorCall | `apps/web/lib/connectors/health.ts` | Writes the log row and the cost record from one place (line 281) |
| service | connector executor logging | `apps/web/lib/user-connector-tools.ts` | Times each connector call and calls meterConnectorCall (line 2750) |
| endpoint | GET /api/connectors/calls | `apps/web/app/api/connectors/calls/route.ts` | Returns recent calls for the user |
| table | connector_call_events | `apps/web/db/neon/0223_connector_call_events.sql` | One row per connector call with row-level security |
| service | runToolCallOnce | `apps/web/app/api/llm/v1/chat/completions/lib/tool-idempotency.ts` | Claim, replay and settle for retry-unsafe calls |
| service | resolveToolRetrySafety and key builder | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts` | Safe name list (line 932) and idempotency key (line 5695) |
| service | writeWithReconciledOutcome | `apps/web/lib/user-connector-tools.ts` | Checks GitHub after an unknown outcome (line 413) |
| service | GitHub write helpers | `apps/web/lib/github-app.ts` | GitHubWriteOutcomeUnknownError and issueCommentPostedSince, pullRequestReviewPostedSince (lines 994-1090) |
| component | ConnectorCallLog (web) | `apps/web/features/connectors/components/ConnectorCallLog.tsx` | Recent calls list |
| component | ConnectorCallLog (mobile) | `apps/mobile/src/features/settings/cloud-connectors/ConnectorCallLog.tsx` | Mobile call list |
| schema | ConnectorCallLogResponse | `packages/contracts/cloud-contracts` | Wire type for the calls endpoint (imported by route.ts:5) |
| service | account erasure and export | `apps/web/lib/server/account-erasure.ts` | Names connector_call_events for erasure; export route also lists it (apps/web/app/api/user/export/route.ts) |
| service | key-value store | `apps/web/lib/server/key-value.ts` | Backend for idempotency claims |
| test | connector-call-log-service test | `apps/web/lib/services/__tests__/connector-call-log-service.test.ts` | Call log service (by file name) |
| test | calls route test | `apps/web/app/api/connectors/calls/route.test.ts` | Endpoint (by file name) |
| test | tool-idempotency test | `apps/web/app/api/llm/v1/chat/completions/lib/tool-idempotency.test.ts` | Idempotency guard (by file name) |
| test | tool-loop.tool-audit test | `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.tool-audit.test.ts` | Audit event type and recordToolCallAudit (describes at lines 16 and 37) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| A tool call is settled; the loop writes an audit event with status and duration. | our servers | tool-loop.ts:5820-5830,3514-3540 |
| For a retry-unsafe call, the loop claims an idempotency key in the key-value store before execution. | our servers | tool-idempotency.ts:164-204 |
| The connector call runs against the outside provider; start time is taken. | outside service | user-connector-tools.ts:2751-2763 |
| A call row is inserted in the background. | our servers | connector-call-log-service.ts:52-75 |
| On a GitHub timeout or 5xx, the server asks GitHub for recent comments or reviews since the start time. | outside service | user-connector-tools.ts:413-458; github-app.ts:994-1090 |
| The person opens Recent calls; the page fetches the endpoint. | device and our servers | ConnectorCallLog.tsx:50-60; calls/route.ts:18-35 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Connector call row (connector, tool, outcome, duration, time, optional surface) | table connector_call_events, row-level security by user | Server side; shown on web and mobile | Deleted with the account (user_id cascades); no age-based cleanup found |
| Audit event per tool outcome | Security audit log | Server side | unknown |
| Idempotency record | Key-value store key agi-tool-idem:<key> | Server side | Expires after 15 minutes by default |

**Models and providers.** Provider-neutral. GitHub reconciliation talks to GitHub through its app installation token, not a model provider.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account; the calls endpoint uses a user-scoped database and rate limit bucket 'chat-conversation' (calls/route.ts:14-27). |
| Permissions | Each user reads only their own rows (0223 policy). |
| Subscription | none found in the code for the call log; connector cost is also recorded by recordConnectorCall (health.ts:290-296). |
| Limits and metering | Read limit 50 default, 100 maximum; failure streak of 3 within 30 minutes marks a connector not responding (connector-call-log-service.ts:37-40); idempotency window 15 minutes. |
| Feature flags | AGI_TOOL_IDEMPOTENCY_WINDOW_MS. |
| Model compatibility | none found in the code |
| Provider restrictions | Reconciliation: GitHub only. |
| Local mode | These records are server-side and apply to Cloud mode. Local tool runs on desktop or mobile write no connector_call_events row (no code path found); CLI audit not examined. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Loading | 'Reading the call log' | ConnectorCallLog.tsx:34 |
| Empty | Empty text for a connector never called | ConnectorCallLog.tsx:33 |
| Error and retry | 'The call log could not be read.' with Retry | ConnectorCallLog.tsx:35-36 |
| Log write fails | Warning log only; the call result stands | connector-call-log-service.ts:70-73 |
| Idempotency store unreachable | Unsafe call refused with a message; with no store configured it runs as before | tool-idempotency.ts:169,176-180 |
| Claimed but never settled | 'outcome is unknown' and not run again | tool-idempotency.ts:196-203 |
| Paused for input | Claim released so the resume round can run | tool-idempotency.ts:206-210 |
| GitHub timeout and landed | Success message | user-connector-tools.ts:426-433 |
| GitHub timeout and not landed | Error 'safe to try again' | user-connector-tools.ts:434-441 |
| Cannot reconcile | Error asking the person to check before retrying | user-connector-tools.ts:442-452 |
| Cancel, offline | not handled in the code for the log itself | connector-call-log-service.ts |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/lib/services/__tests__/connector-call-log-service.test.ts`: Call log service (by file name)
- `apps/web/app/api/connectors/calls/route.test.ts`: Calls endpoint (by file name)
- `apps/web/features/connectors/components/__tests__/ConnectorCallLog.test.tsx`: Web call log component (by file name)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-idempotency.test.ts`: Idempotency (by file name)
- `apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.tool-audit.test.ts`: toolAuditEventType and recordToolCallAudit
- `apps/web/lib/__tests__/user-connector-tools.test.ts`: Connector tools; it mocks GitHubWriteOutcomeUnknownError (line 45) but whether it asserts the reconciliation outcomes was not confirmed

**Test scenarios**

- **Recent calls**
  1. Call a connector tool from chat.
  2. Open the connector's permissions panel.
  - Expected: A new row with outcome and duration appears.
- **Retry safety**
  1. Run a step with an unsafe tool.
  2. Retry the same step with the same request key.
  - Expected: The tool does not run twice; the model gets 'already ran' or 'outcome unknown'.
- **GitHub landed**
  1. Make GitHub time out after accepting a comment.
  2. Call post_issue_comment.
  - Expected: Result 'Posted comment on owner/repo#N'.
- **GitHub not landed**
  1. Make GitHub time out without accepting.
  - Expected: Error says it is safe to try again.
- **Log failure**
  1. Make the insert fail.
  - Expected: Tool result unaffected; warning '[connector-call-log] a connector call was not logged'.
- **No calls**
  1. Open a connector never used.
  - Expected: Empty message.

**Where to look when it fails**

- Log '[connector-call-log] a connector call was not logged'.
- Logs '[tool-idempotency] ...' (claim failed, refusing to run a tool call this step already settled).
- Logs '[user-connector] github write outcome reconciled: it landed / did not land / could not be reconciled'.
- Table connector_call_events; audit events with eventType tool_executed.

**Hands-on test plans**

- none: not built on any app

## 10. Gaps and dependencies

- **Migration 0223 states it is not yet applied; its application status in each environment is not shown by the repo.** Affects: Web and mobile Recent calls. Evidence: 0223_connector_call_events.sql:4. Work needed: Check the migration status (pnpm db:migrate -- status) and correct the header.
- **Log rows can be lost silently by design.** Affects: Receipt completeness. Evidence: connector-call-log-service.ts:46-52. Work needed: Decide if receipts need a retry queue; at least count dropped rows.
- **Reconciliation exists only for two GitHub tools.** Affects: All other external writes. Evidence: user-connector-tools.ts:499-540. Work needed: Add per-connector reconciliation.
- **Platform tool actions have an audit row but no person-facing receipt screen.** Affects: Web, mobile. Evidence: No screen found; only ConnectorCallLog.tsx. Work needed: Add a reader or change the requirement.
- **Idempotency 'safe' name list is separate from metadata retrySafety.** Affects: Web Cloud chat. Evidence: tool-loop.ts:932-943 vs tool-metadata.ts:961-969. Work needed: Use one source and test.
- **Brief line references 2586, 33, 119, 17, 865, 406-512 mostly do not match current files.** Affects: Documentation. Evidence: audit briefs S92.17 to S92.19. Work needed: Refresh the brief.

**Depends on**

- SYS-observability-and-operations
- SYS-connectors-plugins-and-skills
- SYS-data-model-and-migrations
- SYS-security-and-privacy
- SYS-sync-and-continuity
- F092-03
- F092-05
- surface:web
- surface:mobile
- mode:cloud
- table:connector_call_events

## Unknown

- Whether migration 0223 is applied in production and local databases.
- Retention period of audit events and call rows.
- What the GitHub reconciliation tests assert.
- Whether the CLI or Tauri desktop keep any receipts.
- How the audit log of platform tool actions is shown to people.
