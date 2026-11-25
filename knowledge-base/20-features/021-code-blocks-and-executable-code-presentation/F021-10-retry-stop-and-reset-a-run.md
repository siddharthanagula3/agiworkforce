---
id: "F021-10"
type: "feature"
title: "Retry, stop and reset a run"
aliases: ["Run again", "Run this code again", "Stop the run", "Stop response", "Esc / Ctrl-C to cancel a turn", "Reset runtime (none)"]
area: "21 Code blocks and executable code presentation"
available_on: ["web", "desktop", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "partial", mobile: "partial", cli: "partial", vscode: "built", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S21.21", "S21.22", "S21.23"]
depends_on: ["F021-07", "F021-08", "SYS-subscriptions-entitlements-and-usage", "SYS-execution-boundaries", "SYS-security-and-privacy", "SYS-api-and-contracts", "SYS-authorization-and-workspaces", "surface:mobile", "surface:cli", "surface:vscode", "surface:web", "mode:cloud", "api:POST /api/chat/conversations/[id]/code-runs", "table:web_conversations"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F021-10 Retry, stop and reset a run

Mobile can re-run an executed code step with Run again and stop it with Stop. CLI and VS Code stop the whole turn (Esc, Ctrl-C or Stop response), not a single run. The web server has a rerun endpoint, but no web button calls it. No app has a reset control.

Area: [21. Code blocks and executable code presentation](README.md). Requirement items: [S21.21](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2121), [S21.22](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2122), [S21.23](../../10-requirements/capabilities/021-code-blocks-and-executable-code-presentation.md#s2123).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | partly built | partly built | not seen by a person |
| Mobile | partly built | partly built | not seen by a person |
| CLI | partly built | partly built | not seen by a person |
| VS Code | partly built (this page lists unfinished parts) | built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Run again sends the same code to the chat's cloud sandbox and shows the new output in place (apps/mobile/src/features/chat/components/CodeRunAgain.tsx:50-78, :153-201). Stop cancels the request (CodeRunAgain.tsx:80). CLI and VS Code stop the response in progress (apps/cli/src/tui/tui_app.rs:8441-8449; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5865-5871).

**Why it exists.** Re-running a script after a fix or a hiccup should not need a new chat message; a runaway run needs an exit. [inferred]

**Who uses it.** Mobile users who want to rerun code; CLI and VS Code users who want to interrupt an agent.

**Problems it solves**

- Re-run without retyping.
- Stop long waits.
- Ask before running again when approvals are strict.

**Use cases**

- Tap Run again after the first output looked wrong.
- Stop a rerun that takes too long.
- Press Esc in the CLI to cancel an agent turn.
- Click Stop response in VS Code.

## 2. User experience

**Where to find it**

- Mobile: a Run again button under a finished code step in the agent activity timeline and tool call rows, only in cloud mode with the capability granted (apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx:389-394, :554-562; ToolCallTimeline.tsx tool row; CodeRunAgain.tsx:95).
- CLI: Esc or Ctrl-C while a turn runs (apps/cli/src/tui/tui_app.rs:8441-8449).
- VS Code: the Stop response button in the composer; Escape also stops when the setting allows (webviewContent.ts:3365, :5865-5871, :5939-5941).
- Web: no rerun or stop control in the Code Execution panel (apps/web/features/chat/components/messages/CodeExecutionBlock.tsx). The chat composer's general stop for a turn was not read.
- Chrome: shows a Stopping status line for a response stop (apps/extension/src/features/side-panel/bubbles.ts:651-657); no run-level control.

**Before you start**

- Mobile: cloud mode, canUseCloudExecution granted, a conversation id, a finished step whose tool is execute_code with code text (AgentActivityTimeline.tsx:389-394; apps/mobile/src/features/chat/utils/executedToolCode.ts:42-44).

**Screens and controls**

- Run again button, accessibility label Run this code again (CodeRunAgain.tsx:132-142).
- Stop button, accessibility label Stop the run, plus a Running indicator (CodeRunAgain.tsx:118-130).
- Confirmation alert titled Run this code again? with buttons Cancel and Run again (packages/contracts/cloud-contracts/src/chat-code-runs.ts:11-16; CodeRunAgain.tsx:82-87).

**Journey**

1. 1. Mobile: tap Run again.
2. 2. If approvals are set to ask every time, or the setting is not loaded, an alert asks first (CodeRunAgain.tsx:40, :90-93).
3. 3. The app posts the code to the server (apps/mobile/src/features/chat/services/codeRun.ts:35-48).
4. 4. A Stop button replaces Run again while running.
5. 5. Output, Error and plots appear under the step (CodeRunAgain.tsx:153-201).
6. 6. A timeout shows the took-too-long text; other failures show the did-not-run text.

**What the person sees and gets**

- Took too long: This run took too long to answer, so the app stopped waiting. It may still finish on the server. (CodeRunAgain.tsx:20-21).
- Failure: The code did not run. Try again. (codeRun.ts:10).
- Server messages such as Running code is turned off for this account. Turn it on in Settings, Capabilities. (apps/web/app/api/chat/conversations/[id]/code-runs/route.ts:109-112).
- Approval prompt message: Your approvals are set to ask before every action. The code runs again in this chat's cloud sandbox and can change the files there. (chat-code-runs.ts:13-15).

**Settings**

- Tool approvals policy (ask every time) (route.ts:116-128; mobile hook useToolApprovalPolicySync).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Mobile Run again with approval prompt, stop, timeout text, failure text, output, error and plots (CodeRunAgain.tsx).
- Server route checks ownership, capability, account switch, approval, managed compute, then runs and records audit events (route.ts:76-199).
- Server run honours the request's abort signal and answers with CODE_RUN_STOPPED_MESSAGE; the message warns that stopping restarts the code session and earlier variables are gone (apps/web/lib/e2b/types.ts:118-119; runtime.ts:1179, :1214-1222, :1256).
- CLI cancel: Esc or Ctrl-C breaks the wait, cancels the in-flight stream and records the turn as cancelled (tui_app.rs:8441-8449, :8714-8722).
- VS Code Stop response sends a cancel message and shows Stopping (webviewContent.ts:5865-5871).

**Incomplete**

- CLI and VS Code stops cancel the whole turn; no per-run stop was found (tui_app.rs:8441; webviewContent.ts:5870).
- Mobile Stop aborts the app's wait; the copy admits the server may still finish (CodeRunAgain.tsx:20-21). The server passes the request signal to runCode (route.ts:184), so an abort should reach it [inferred].
- The web server has a rerun endpoint but no web client caller was found.
- Rerun is limited to the execute_code tool name (executedToolCode.ts:42-44).

**Present but disconnected or switched off**

- Web: POST code-runs exists with a test but nothing in apps/web calls it (search of apps and packages).

**Not available**

- Reset runtime: no control in any app found. The nearest behaviour is that stopping a run restarts the code session (types.ts:118-119) and a deleted conversation releases its sandbox (runtime.ts:15-18).
- VS Code retry and reset claimed by the brief: the cited lines (webviewContent.ts:3722, :2510) are not about code runs; not confirmed.
- Chrome: none.

## 4. Required behaviour

**Established requirements**

- A failed or finished execution can be re-run in place. (source: brief S21.21)
- A running execution can be stopped by the user. (source: brief S21.22)
- The user can reset the execution runtime or state. (source: brief S21.23)
- When approvals ask before every action, the rerun must ask first and name the consequence. (source: packages/contracts/cloud-contracts/src/chat-code-runs.ts:11-16)
- An action a user cannot undo asks first and names the consequence. (source: doc: AGENTS.md section 9)

**Acceptance criteria**

1. Mobile Run again shows only in cloud mode with the capability granted and a finished code step.
2. With approvals set to ask, tapping Run again shows the alert before any request; Cancel sends nothing.
3. While running, Stop replaces Run again; tapping it stops the wait without an error message.
4. A request that exceeds the wait shows the took-too-long text.
5. The server returns 409 approval_required when approval is needed and not given.
6. The server refuses a rerun for a conversation the caller does not own (404).
7. CLI: Esc during a turn returns control with the partial reply kept.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Stopping a run should say it restarts the session (the server message does) [inferred requirement from types.ts:118].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add Run again to the web Code Execution panel using the existing endpoint.
- [proposed] Add a Reset code session control with a confirmation naming lost variables.
- [proposed] Stop one run without cancelling the whole CLI or VS Code turn.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | CodeRunAgain | `apps/mobile/src/features/chat/components/CodeRunAgain.tsx` | Run again, Stop, messages |
| service | codeRun service | `apps/mobile/src/features/chat/services/codeRun.ts` | POST to code-runs, CODE_RUN_FAILED, approval-required mapping |
| component | AgentActivityTimeline | `apps/mobile/src/features/chat/components/AgentActivityTimeline.tsx` | canRunAgain rule and mount (389-394, 554-562) |
| component | ToolCallTimeline (mobile) | `apps/mobile/src/features/chat/components/ToolCallTimeline.tsx` | Mounts CodeRunAgain on tool rows |
| service | executedToolCode | `apps/mobile/src/features/chat/utils/executedToolCode.ts` | Extracts language and code; canRunCodeAgain |
| hook | useToolApprovalPolicySync | `apps/mobile/src/features/settings/tool-approvals/useToolApprovalPolicySync.ts` | Approval policy for the prompt |
| endpoint | POST code-runs | `apps/web/app/api/chat/conversations/[id]/code-runs/route.ts` | Server rerun |
| schema | chat-code-runs contract | `packages/contracts/cloud-contracts/src/chat-code-runs.ts` | Schemas, limits, confirmation copy, path helper |
| service | E2B types | `apps/web/lib/e2b/types.ts` | CODE_RUN_STOPPED_MESSAGE |
| service | E2B runtime | `apps/web/lib/e2b/runtime.ts` | Abort handling in runCode |
| service | session store | `apps/web/lib/e2b/session-store.ts` | Conversation sandbox mapping, per-user lock |
| service | tool approval policy | `apps/web/app/api/llm/v1/chat/completions/lib/tool-approval-policy.ts` | loadToolApprovalPolicy |
| service | security audit | `apps/web/lib/security-audit.ts` | recordAuditEvent tool_executed, tool_approval_decided |
| component | tui_app turn loop | `apps/cli/src/tui/tui_app.rs` | Cancel keys and cancel_turn (8441-8449, 8714-8722) |
| component | webviewContent stop button | `apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts` | stopBtn and cancel message (3365, 5865-5871) |
| component | bubbles transient status (Chrome) | `apps/extension/src/features/side-panel/bubbles.ts` | Stopping status line (651-657) |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person taps Run again; the app may show an approval alert first. | device | CodeRunAgain.tsx:82-93 |
| The app posts language and code (and approved true when approved) to the code-runs endpoint, waiting up to 300 seconds. | device and our servers | codeRun.ts:35-48; chat-code-runs.ts:6 |
| The server checks ownership, the capability, the account switch, the approval policy and managed compute access, then gets the conversation sandbox. | our servers | route.ts:76-150 |
| The code runs in the sandbox; output and PNG results return; audit events record only names, never code or output. | outside service | route.ts:184-205; route.test.ts test titled records the rerun as a tool execution by name |
| The sandbox session is disposed or paused after the call. | our servers | route.ts:206-212 |
| CLI: Esc or Ctrl-C drops the pending model request and keeps the partial reply. | device | tui_app.rs:8441-8449, :8714-8722 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Rerun result (output, error, images) | Component state on the phone only | no | lost when the component leaves the screen [inferred from useState at CodeRunAgain.tsx:43-44] |
| Audit events | Security audit log (table unknown) | server side | unknown |
| Sandbox session | Redis mapping and the sandbox service | server side | paused or killed (runtime.ts:10-18) |

**Models and providers.** No model is involved in a rerun: the saved code is sent straight to the sandbox (route.ts:184). It needs the managed sandbox, not a provider tool.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; the conversation must belong to the caller and organisation (route.ts:80-93). |
| Permissions | Account switch, tool approval policy, capability flag (route.ts:94-128). |
| Subscription | canUseCloudExecution via assertCapabilityAvailable and managed compute access (route.ts:94-104, :131-141); a budget refusal answers with its own status and the upgrade path (route.ts:146-165). |
| Limits and metering | 300-second function limit; code up to 100,000 characters; language up to 32 characters (chat-code-runs.ts:4-6; route.ts:46). Rate limit chat-conversation per user (route.ts:60-61). |
| Feature flags | AGI_E2B_EXECUTION cut-over (route.ts:76-78; gate.ts:16-18). |
| Model compatibility | not applicable: no model runs. |
| Provider restrictions | none found in the code. |
| Local mode | Mobile Local mode: control hidden (CodeRunAgain.tsx:95). CLI and VS Code cancel works locally. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Running | Stop button and Running indicator | CodeRunAgain.tsx:118-130 |
| Approval needed (server) | 409 with approval_required; app asks then retries with approved | route.ts:116-128; CodeRunAgain.tsx:66 |
| Approval setting not loaded | Treated as ask first | CodeRunAgain.tsx:40; test titled asks while the approval setting has not loaded |
| Timeout | Took-too-long text | CodeRunAgain.tsx:20-26, :70 |
| Other failure | Did-not-run text | CodeRunAgain.tsx:70; codeRun.ts:10 |
| Stopped by user | No error shown after abort | CodeRunAgain.tsx:69 |
| Leave screen | Request aborted on unmount | CodeRunAgain.tsx:46 |
| Account switch off, managed access denied, budget refused | Server messages shown | route.ts:106-165 |
| Accessibility | Buttons have roles and labels; output headings have role header; error has role alert; live region polite | CodeRunAgain.tsx:121-123, :146-148, :154-156 |
| Offline | Shown as the generic did-not-run text [inferred] | CodeRunAgain.tsx:70 uses CODE_RUN_FAILED for any non-timeout failure |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/mobile/__tests__/CodeRunAgainOutcome.test.tsx`: Labels, plots, timeout text, failure text, approval flow, cancel, immediate run
- `apps/mobile/__tests__/codeRunService.test.ts`: Request body, timeout, approval-required marking, fallback message
- `apps/web/app/api/chat/conversations/[id]/code-runs/route.test.ts`: Route success, ownership, refusals, approvals, audit
- `apps/mobile/__tests__/AgentActivityTurnEnd.test.tsx`: Mentions run-again in agent activity (matched by search; contents not read)
- `apps/mobile/__tests__/DeclinedToolSteps.test.tsx`: Declined steps (matched by search)
- `apps/extension-vscode/src/__tests__/chatRetry.test.ts`: Chat retry (by file name; not confirmed to cover code runs)

**Test scenarios**

- **Rerun with strict approvals**
  1. Set approvals to ask every time.
  2. On mobile in cloud mode tap Run again on a code step.
  3. Cancel, then repeat and confirm.
  - Expected: Cancel sends nothing; Run again sends approved true and shows output.
- **Stop a rerun**
  1. Start Run again on a slow script.
  2. Tap Stop.
  - Expected: Run again returns, no error shown.
- **Timeout**
  1. Run a script longer than the wait.
  - Expected: Took-too-long text.
- **CLI cancel**
  1. Start a long agent turn in the CLI.
  2. Press Esc.
  - Expected: Turn stops, partial reply kept, status cancelled.
- **VS Code stop**
  1. Start a turn.
  2. Click Stop response.
  - Expected: Button shows Stopping and the turn ends.
- **Reset check**
  1. Look for any reset control in each app.
  - Expected: None found (documents the gap).

**Where to look when it fails**

- Server audit events tool_executed with durationMs (route.ts:186-198).
- Log: [code-runs] sandbox session was not saved (route.ts:211).
- Mobile error strings CODE_RUN_FAILED and CODE_RUN_TOOK_TOO_LONG.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/web/021-code-blocks-and-executable-code-presentation.md)
- Desktop: [70-qa/test-plans/desktop/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/desktop/021-code-blocks-and-executable-code-presentation.md)
- Mobile: [70-qa/test-plans/mobile/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/mobile/021-code-blocks-and-executable-code-presentation.md)
- CLI: [70-qa/test-plans/cli/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/cli/021-code-blocks-and-executable-code-presentation.md)
- VS Code: [70-qa/test-plans/vscode/021-code-blocks-and-executable-code-presentation.md](../../70-qa/test-plans/vscode/021-code-blocks-and-executable-code-presentation.md)

## 10. Gaps and dependencies

- **No web or desktop (Electron) rerun control although the endpoint exists** Affects: Web, desktop. Evidence: route.ts exists; no caller in apps/web. Work needed: Add Run again to the web panel through useConfirmAction.
- **No reset runtime control** Affects: All apps. Evidence: brief S21.23; none found in code. Work needed: Add a confirmed Reset code session action that kills the conversation sandbox.
- **CLI and VS Code stop is whole-turn, not per run** Affects: CLI, VS Code. Evidence: tui_app.rs:8441-8449; webviewContent.ts:5870. Work needed: Optional per-command stop.
- **Mobile Stop leaves the server run possibly continuing** Affects: Mobile. Evidence: CodeRunAgain.tsx:20-21. Work needed: Confirm the abort reaches the sandbox and say so.
- **Brief marks VS Code retry and reset done, not confirmed** Affects: VS Code. Evidence: webviewContent.ts:3722 and :2510 are unrelated. Work needed: Re-check and correct the brief.
- **No retry on Chrome** Affects: Chrome. Evidence: none found. Work needed: Decide scope.
- Not built on: Chrome (from the capability ledger).

**Depends on**

- F021-07
- F021-08
- SYS-subscriptions-entitlements-and-usage
- SYS-execution-boundaries
- SYS-security-and-privacy
- SYS-api-and-contracts
- SYS-authorization-and-workspaces
- surface:mobile
- surface:cli
- surface:vscode
- surface:web
- mode:cloud
- api:POST /api/chat/conversations/[id]/code-runs
- table:web_conversations

## Unknown

- Whether the web composer's general Stop reaches the sandbox: the server honours an abort signal but the web stop path was not read.
- Whether the CLI kills a running child shell on cancel.
- Whether VS Code has any retry or reset for runs.
- Which audit table stores events.
- Whether the mobile abort stops the server run.
