---
id: "F073-09"
type: "feature"
title: "Approvals and task notices"
aliases: ["Task and approval notifications", "Activity Bar badge", "Background session notifications", "Approval history", "Show Approval History", "S73.21"]
area: "73 VS Code and IDE extension"
available_on: ["vscode"]
implementation: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "built", chrome: "n/a"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S73.21"]
depends_on: ["surface:vscode", "surface:web", "mode:local", "mode:own-key", "mode:cloud", "api:GET /api/settings/approvals", "table:security_audit_logs", "SYS-agents-tools-and-automation", "SYS-authentication-and-identity", "SYS-sync-and-continuity", "SYS-observability-and-operations", "F073-08"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F073-09 Approvals and task notices

In VS Code, AGI Code signals a waiting approval or a finished or failed turn when the chat view is out of sight: an Activity Bar badge, and a pop-up with Allow once, Deny and Open chat when the editor window is not focused. A separate command lists past approval decisions from the account. VS Code only.

Area: [73. VS Code and IDE extension](README.md). Requirement items: [S73.21](../../10-requirements/capabilities/073-vs-code-and-ide-extension.md#s7321).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | does not apply | does not apply | n/a |
| Desktop | does not apply | does not apply | n/a |
| Mobile | does not apply | does not apply | n/a |
| CLI | does not apply | does not apply | n/a |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Shows a count badge on the AGI Code Activity Bar icon while the chat is hidden, raises a notification when the whole VS Code window has no focus, lets the person answer a tool approval from that notification, and offers an account-wide approval history list.

**Why it exists.** A turn keeps running while its panel is hidden, so an approval could wait forever with nothing on screen (comment in apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:152-159). The brief asks for pending approvals and finished tasks to be signalled when the view is hidden, and for approvals to be answerable (S73.21).

**Who uses it.** Developers who start an agent task and switch to another file, view or application.

**Problems it solves**

- Missed approval prompts that block a turn
- Not knowing a long task ended
- Reviewing which tools were approved or denied earlier

**Use cases**

- Start an agent turn, switch to the Explorer; the chat icon shows a badge '1' when approval is needed.
- Switch to another application; VS Code shows 'Allow once / Deny / Open chat' for a tool approval.
- Run 'Code: Show Approval History' to see decisions made on any AGI client.

## 2. User experience

**Where to find it**

- Activity Bar icon 'AGI Code' (apps/extension-vscode/package.json:953-960); badge on the sidebar view.
- Pop-up notifications from VS Code (title text from the shared codeSessionActivityNotice) (apps/extension-vscode/src/features/sidebar-webview/sessionActivityAlert.ts:26-34).
- Command Palette: 'Code: Show Approval History' (package.json:582-584).

**Before you start**

- A running or finished turn in the sidebar or the chat editor panel.
- For the pop-up: the VS Code window is not focused (sessionActivityAlert.ts:28).
- For approval history: signed in to AGI Cloud (apps/extension-vscode/src/features/permissions/approvalHistory.ts:34-40).

**Screens and controls**

- Badge value equals the count of pending approvals; tooltip '<Code> is waiting for your approval' or 'is waiting on N approvals'; otherwise '<Code> finished a reply' (apps/extension-vscode/src/features/sidebar-webview/attentionBadge.ts:44-58).
- Warning pop-up with buttons 'Allow once', 'Deny', 'Open chat' for a tool approval; only 'Open chat' for a question (sessionActivityAlert.ts:36-52).
- Info pop-up with 'Open chat' for a finished turn; warning pop-up for a failed turn (sessionActivityAlert.ts:54-62).
- Quick pick 'Code, Approval history' with 'Open the conversation' detail (approvalHistory.ts:67-75).

**Journey**

1. 1. The person sends a message that needs an approval.
2. 2. The chat posts an approvalRequested message to the view.
3. 3. The provider counts it into the badge and, if the window has no focus, shows the pop-up (sidebarProvider.ts:165-178).
4. 4. The person clicks Allow once or Deny in the pop-up, or Open chat to review in the chat.
5. 5. The decision is sent to the chat as respondToApproval and the badge count drops (sidebarProvider.ts:173-178).
6. 6. When the turn ends the badge shows 'finished a reply' until the view is seen.

**What the person sees and gets**

- Badge number and tooltip.
- Pop-up text '<Code>: <title>. <summary>' for approvals and '<title>. <body>' for end of turn (sessionActivityAlert.ts:36-37, 54).
- Approval history items: '<tool name>' with 'Approved' or 'Denied' and a time; 'No approvals decided yet' when empty (approvalHistory.ts:58-66).

**Settings**

- No setting found that turns these notices off.
- agiWorkforce.agent.mode and agentWorkforce approval settings change when approvals happen (see F073-08).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- AttentionState counts approvals and a finished flag, approval outranks finished, never below zero, 'seen' clears (apps/extension-vscode/src/features/sidebar-webview/attentionBadge.ts:20-58).
- SidebarProvider records events from outgoing webview messages and sets view.badge (sidebarProvider.ts:165-198).
- Both the sidebar and the chat editor panel call alertSessionActivity (sidebarProvider.ts:172; apps/extension-vscode/src/providers/chatEditorPanel.ts:202).
- Pop-up appears only when vscode.window.state.focused is false (sessionActivityAlert.ts:28).
- Approval history fetches GET /api/settings/approvals with the account token, validates the response and opens the conversation on the web (approvalHistory.ts:33-83).

**Incomplete**

- A hidden chat view in a focused window gets only the badge, no pop-up, by design (sessionActivityAlert.ts:28) [inferred].
- The first draft said approval history reads the secret store. It only reads the account token from it; the history itself comes from the server (approvalHistory.ts:34, 44-48).
- Approval history lists past decisions only; it cannot answer a pending approval, so 'answer older approvals' in the first draft is wrong (approvalHistory.ts:33-83).

**Present but disconnected or switched off**

- The badge write is wrapped in try/catch because some editor forks lack it (sidebarProvider.ts:183-192).

**Not available**

- Other apps are not covered here; the brief marks VS Code only.

## 4. Required behaviour

**Established requirements**

- Pending approvals and finished tasks are signalled even when the chat view is hidden, and approvals can be answered. (source: S73.21)
- Approval decisions are shared across clients; the web endpoint lists decisions of the user from the security audit log. (source: apps/web/app/api/settings/approvals/route.ts:84-95)
- Host Developer surfaces share permission decisions. (source: doc: docs/product/definition.md:119)

**Acceptance criteria**

1. With the chat view hidden and the window focused, a new approval shows badge value 1.
2. With two pending approvals the tooltip says 'waiting on 2 approvals'; answering one drops it to 1.
3. With the window unfocused, an approval shows Allow once, Deny and Open chat; Allow once sends the decision to the turn.
4. A question approval offers only Open chat.
5. A finished turn shows 'finished a reply' and the badge clears after the view is shown.
6. Stopped turns do not raise the finished notice.
7. Show Approval History signed out says to sign in; signed in lists decisions, newest first.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- An approval decided on the pop-up should leave the same audit record as one decided in the chat [inferred; writer of tool_approval_decided was not traced].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a setting to turn the pop-ups off.
- [proposed] Show a pop-up for a hidden view in a focused window after a delay.
- [proposed] Let Approval History open the pending approval in the extension, not the web.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| service | AttentionState | `apps/extension-vscode/src/features/sidebar-webview/attentionBadge.ts` | Counts pending approvals and finished replies and builds the badge. |
| service | alertSessionActivity | `apps/extension-vscode/src/features/sidebar-webview/sessionActivityAlert.ts` | Raises pop-ups when the window is unfocused and routes Allow once or Deny. |
| component | SidebarProvider._postToWebview and _refreshBadge | `apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts` | Lines 165 and 183; record events, set badge, call the alert. |
| component | ChatEditorPanel alert hook | `apps/extension-vscode/src/providers/chatEditorPanel.ts` | Line 202; same alert for the chat opened in an editor tab. |
| service | codeSessionActivityNotice | `packages/contracts/cloud-contracts/src/local-code-session-activity.ts` | Shared title and body text for approval, completed and failed events (line 32). |
| command | agi-workforce.showApprovalHistory | `apps/extension-vscode/src/features/permissions/approvalHistory.ts` | Command constant line 8; showApprovalHistory line 33. |
| command | Registration of the history command | `apps/extension-vscode/src/extension.ts` | Lines 251-253. |
| endpoint | GET /api/settings/approvals | `apps/web/app/api/settings/approvals/route.ts` | Returns the user's approval decisions, paged. |
| table | security_audit_logs | `apps/web/db/neon/0014_security.sql` | Source rows where event_type is tool_approval_decided. |
| service | readAccountRefusal | `apps/extension-vscode/src/utils/accountRefusal.ts` | Turns a refusal response into a readable message. |
| config | Activity Bar container and view | `apps/extension-vscode/package.json` | Lines 953-970; the view that carries the badge. |
| config | Approval history command declaration | `apps/extension-vscode/package.json` | Line 582. |
| service | Approval flow in chat state | `apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts` | approval_requested handling (line 6709) and respondToApproval. |
| test | attentionBadge.test | `apps/extension-vscode/src/__tests__/attentionBadge.test.ts` | Badge rules. |
| test | sessionActivityAlert.test | `apps/extension-vscode/src/__tests__/sessionActivityAlert.test.ts` | Pop-up behaviour. |
| test | codeSessionActivityPost.test | `apps/extension-vscode/src/__tests__/codeSessionActivityPost.test.ts` | Related activity post (contents not opened). |
| test | approvals route test | `apps/web/app/api/settings/approvals/__tests__/route.test.ts` | Server route tests (contents not opened). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The CLI runtime raises an approval request that the chat state manager turns into an approvalRequested message. | device | apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:6709 |
| The provider updates the badge and, if the window is unfocused, shows the pop-up. | device | sidebarProvider.ts:165-178; sessionActivityAlert.ts:28 |
| A click on Allow once or Deny sends respondToApproval to the chat state manager. | device | sidebarProvider.ts:173-178 |
| Approval history requests GET /api/settings/approvals with a bearer token and shows the result. | our servers | apps/extension-vscode/src/features/permissions/approvalHistory.ts:44-48 |
| The server reads rows from the security audit log for the signed-in user. | our servers | apps/web/app/api/settings/approvals/route.ts:84-95 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Badge counts | Extension memory | No | Cleared when the view is seen or disposed (sidebarProvider.ts:150, 186) |
| Approval decisions (tool name, decision, conversation id, time) | table security_audit_logs, event_type tool_approval_decided | Shown to every client of the account via the endpoint | unknown; retention of the audit log was not traced. Who writes these rows was not traced. |

**Models and providers.** Not involved. Notices are produced from turn events whatever model ran.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Badge and pop-ups need no account in the extension code. Approval history needs a signed-in AGI Cloud token (approvalHistory.ts:34-40). |
| Permissions | Allow once from a pop-up grants the same one-time approval as in chat [inferred]. Workspace Trust is not checked in these files. |
| Subscription | none found in the code for badge or pop-up. The history endpoint needs only a user id (route.ts:84-95). |
| Limits and metering | Approval history page size is set by the server route (limit parameter); badge has no limit. Details not traced. |
| Feature flags | none found in the code. |
| Model compatibility | Not model dependent. |
| Provider restrictions | none found in the code. |
| Local mode | Badge and pop-ups work with Local model turns because they come from the local runtime events [inferred]. Approval history needs the Cloud account, so it is unavailable without sign-in. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Signed out | Approval history says 'Sign in to AGI Cloud to see the approvals you decided on every device.' | approvalHistory.ts:34-40 |
| History fetch error | Error message 'approval history could not be loaded, ...'. | approvalHistory.ts:49-60 |
| Empty history | Item 'No approvals decided yet'. | approvalHistory.ts:63-64 |
| Window focused | No pop-up; badge only if the view is hidden. | sessionActivityAlert.ts:28; sidebarProvider.ts:183-192 |
| Stopped turn | No finished notice. | sessionActivityAlert.ts:14; sidebarProvider.ts:168 |
| Editor lacks badge API | The badge write is skipped without error. | sidebarProvider.ts:189-192 |
| Offline | History shows the fetch error; badge and pop-ups are local and unaffected. | approvalHistory.ts:49-60 |
| Accessibility | Standard VS Code notifications and badge tooltips; no extra handling found. | not handled in the code beyond host defaults |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/attentionBadge.test.ts`: No badge at rest, single and multiple approvals, resolution, no negative count, finished reply, approval outranking finished, seen clears.
- `apps/extension-vscode/src/__tests__/sessionActivityAlert.test.ts`: Allow once and Deny for approvals, question approvals only offer the chat, silence while the editor is focused.
- `apps/extension-vscode/src/__tests__/codeSessionActivityPost.test.ts`: Related session activity posting (not opened).
- `apps/extension-vscode/src/__tests__/accountRefusalCallers.test.ts`: showApprovalHistory is one of the callers checked for account refusal handling.
- `apps/web/app/api/settings/approvals/__tests__/route.test.ts`: Server route (not opened).

**Test scenarios**

- **Badge on a hidden view**
  1. Start a turn that needs an approval.
  2. Open the Explorer so the chat is hidden.
  - Expected: The AGI Code icon shows 1 with the waiting tooltip; opening the chat clears it.
- **Pop-up in an unfocused window**
  1. Start such a turn.
  2. Click another application.
  - Expected: A warning with Allow once, Deny and Open chat appears; Allow once lets the turn continue.
- **Finished turn**
  1. Start a short turn.
  2. Hide the chat.
  3. Wait for the end.
  - Expected: Badge shows 'finished a reply'.
- **Approval history signed in**
  1. Sign in.
  2. Approve a tool in the chat.
  3. Run 'Code: Show Approval History'.
  - Expected: The decision is listed as Approved with its time; picking it opens the web chat.
- **Approval history signed out**
  1. Sign out.
  2. Run the command.
  - Expected: The sign-in message appears.

**Where to look when it fails**

- Error text 'approval history could not be loaded'.
- Server route logs 'Failed to fetch approval history' (apps/web/app/api/settings/approvals/route.ts:118).
- Table security_audit_logs, event_type tool_approval_decided.

**Hands-on test plans**

- VS Code: [70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md](../../70-qa/test-plans/vscode/073-vs-code-and-ide-extension.md)

## 10. Gaps and dependencies

- **The brief points at sidebarProvider.ts:138 and ChatStateManager.ts:973 for the notices; line 138 is focus handling and 973 is an unrelated type, the real code is at sidebarProvider.ts:165-198 and sessionActivityAlert.ts.** Affects: Engineers using the brief. Evidence: apps/extension-vscode/src/features/sidebar-webview/sidebarProvider.ts:165-198. Work needed: Correct the brief references.
- **No setting to turn off the pop-ups.** Affects: VS Code users. Evidence: package.json setting search found none. Work needed: Add a setting if wanted.
- **Approvals decided in the extension may not write the audit rows that history shows; the writer was not traced.** Affects: Approval history users. Evidence: apps/web/app/api/settings/approvals/route.ts:84-95. Work needed: Trace who inserts tool_approval_decided and cover VS Code.
- **Approval history is read-only and opens the web.** Affects: VS Code users. Evidence: approvalHistory.ts:77-83. Work needed: Decide whether history should answer or reopen pending items.

**Depends on**

- surface:vscode
- surface:web
- mode:local
- mode:own-key
- mode:cloud
- api:GET /api/settings/approvals
- table:security_audit_logs
- SYS-agents-tools-and-automation
- SYS-authentication-and-identity
- SYS-sync-and-continuity
- SYS-observability-and-operations
- F073-08

## Unknown

- Who writes tool_approval_decided rows and whether VS Code decisions are included.
- Retention of security_audit_logs.
- Whether the chat webview itself shows an in-view approval card for the same event (approvalCard test exists, not opened).
- Contents of codeSessionActivityPost.test.ts and the web route test.
