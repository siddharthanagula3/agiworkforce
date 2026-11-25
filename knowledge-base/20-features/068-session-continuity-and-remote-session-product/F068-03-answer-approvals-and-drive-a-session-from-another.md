---
id: "F068-03"
type: "feature"
title: "Answer approvals and drive a session from another client"
aliases: ["Answer approvals and drive a session from another client", "Same pending approvals", "Active-control attachment", "Approval required card", "agi code approvals / approve / reject"]
area: "68 Session continuity and remote-session product"
available_on: ["web", "mobile", "cli", "vscode"]
implementation: {web: "partial", desktop: "n/a", mobile: "built", cli: "built", vscode: "built", chrome: "n/a"}
verification: {web: "not seen by a person", desktop: "n/a", mobile: "not seen by a person", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S68.08", "S68.11"]
depends_on: ["surface:web", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "SYS-authorization-and-workspaces", "SYS-subscriptions-entitlements-and-usage", "SYS-agents-tools-and-automation", "table:cloud_code_agent_approvals", "api:POST /api/code/sessions/[sessionId]/agent/approvals", "F068-01", "F068-02"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F068-03 Answer approvals and drive a session from another client

When a cloud coding agent pauses for permission, the request is stored on the server for 30 minutes and any signed-in client of the account can approve or deny it: web, phone, command line and VS Code. The same clients can send a new task and stop a running turn.

Area: [68. Session continuity and remote-session product](README.md). Requirement items: [S68.08](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6808), [S68.11](../../10-requirements/capabilities/068-session-continuity-and-remote-session-product.md#s6811).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | partly built | partly built | not seen by a person |
| Desktop | does not apply | does not apply | n/a |
| Mobile | partly built (this page lists unfinished parts) | built | not seen by a person |
| CLI | built | built | not seen by a person |
| VS Code | built | built | not seen by a person |
| Chrome | does not apply | does not apply | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** Lets the person answer an agent's permission request, send new tasks and stop a turn from whichever client is at hand.

**Why it exists.** Agents ask before risky steps. If the answer only worked in the starting client, work would stall when the person moves away.

**Who uses it.** Developers running cloud Code tasks across devices; testers of approval flows.

**Problems it solves**

- A task waiting on approval can be finished from the phone.
- A decision on an expired request is refused clearly.
- Two clients cannot both decide the same step.

**Use cases**

- Approve a command from the phone while away from the desk.
- Run agi code approvals in a terminal and agi code approve <handle>.
- Reject a step from the VS Code Sessions quick pick.
- Stop a runaway turn from the phone.

## 2. User experience

**Where to find it**

- Web: approval cards in the session on the Code page (apps/web/features/code/CloudCodePage.tsx:2649).
- Phone: an 'Approval required' card under the transcript (apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx:535-541).
- CLI: agi code approvals, agi code approve <handle>, agi code reject <handle> (apps/cli/src/lib.rs:1218-1224).
- VS Code: Sessions quick pick shows 'Approval required' with 'Approve and continue' and 'Deny' rows (apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:178-205).

**Before you start**

- A cloud session whose latest turn is waiting for approval.
- Cloud switch on and the account's plan allowed (see access).
- Approval not older than 30 minutes (apps/web/lib/services/cloud-code-agent-service.ts:957-966).

**Screens and controls**

- Phone buttons use the labels 'Approve and continue' and 'Deny' (packages/contracts/types/src/cloud-code.ts:247-250; packages/contracts/types/src/tool-approval-policy.ts:30-31; CloudCodeApprovalCard.tsx:50-58).
- Phone stop control 'Stop the task' (cloud-code.ts:244) in the composer (CloudCodeSessionScreen.tsx:579).
- CLI handle format <session>/<turn>/<step> (apps/cli/src/cloud/code_sessions.rs:147-157).
- Phone first-run notice 'Code sessions use your approval setting' (apps/mobile/src/features/cloud-code/components/CodeApprovalNotice.tsx:13).

**Journey**

1. 1. The agent hits a step needing permission and the turn stops with 'awaiting approval'.
2. 2. The server stores an approval row (command, reason) valid for 30 minutes.
3. 3. A client lists approvals (web and phone on each read; CLI agi code approvals; VS Code when opening the session).
4. 4. The person taps Approve and continue or Deny.
5. 5. The client sends turn id, step index and decision; the server resumes the same turn and returns its result.
6. 6. Other clients see the new state on their next read.

**What the person sees and gets**

- Phone: the card for the decision in flight is hidden and the composer is disabled while it runs (useCloudCodeSession.ts:208-211; CloudCodeSessionScreen.tsx:538).
- Phone error 'Your decision could not be sent' (apps/mobile/src/features/cloud-code/service.ts:13).
- CLI: 'Approving the step; the session continues in the cloud, which can take a few minutes.' then status (apps/cli/src/lib.rs:3117-3140).
- CLI first turn text: 'Waiting for your approval to run `<command>`... Approve or deny it at <url>' (apps/cli/src/cloud/code_handoff.rs:524-538).
- Web: error from the server; the card list is re-read after a failed decision (CloudCodePage.tsx:1530-1545).

**Settings**

- Tool approval policy synced on the phone (apps/mobile/src/features/cloud-code/components/CodeApprovalNotice.tsx:9,17-19; route /(app)/settings/auto-approve at line 14).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- List and decide approvals through /api/code/sessions/<id>/agent/approvals (apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:46-57,59-126).
- Decision body needs turnId, a non-negative integer stepIndex and decision approve or reject (route.ts:80-94).
- Decision runs rate limit, CSRF check, deployment gate, then managed compute access for the account (route.ts:62-69,97-106).
- An expired approval gives a conflict error (route.ts:42; apps/web/lib/services/cloud-code-agent-approval-service.ts:29-34,305-316).
- Pending approvals are retired when their turn is no longer suspended (cloud-code-agent-approval-service.ts:85-97).
- Phone, web, CLI and VS Code all call listApprovals/decideApproval (apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:126-127; apps/web/features/code/CloudCodePage.tsx:775,1522; apps/cli/src/cloud/code_sessions.rs:118-145; apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:243-270).
- Phone blocks a new send while a turn runs (useCloudCodeSession.ts:215) and allows stop only while working (line 260).
- Stop is recorded on the server and audited (apps/web/app/api/code/sessions/[sessionId]/agent/cancel/route.ts:56-59); CLI cancel uses the same endpoint (apps/cli/src/cloud/code_handoff.rs:500-508).
- The CLI decision is idempotent by a key built from session, turn, step and decision (code_sessions.rs:136).

**Incomplete**

- The list route has no deployment gate, but the web page reads approvals only when it may run (route.ts:46-57; CloudCodePage.tsx:770).
- Web is partial in the brief pending the cloud switch (doc: audit/partial/068-session-continuity-and-remote-session-product.md).
- Local-session approvals in the terminal UI and the remote host are listed in the brief but their code (tui_app.rs) was not opened (doc: brief S68.08).

**Present but disconnected or switched off**

- Cloud approvals refuse with 'Managed Code is not enabled for this deployment' when the switch is off (route.ts:68-70).
- Phone Remote Control to desktop approvals: hidden by FEATURES.companion = false (apps/mobile/lib/v1FeatureFlags.ts:16).

**Not available**

- Desktop: S68.08 and S68.11 are not listed in the brief for desktop; desktop uses the web page. Local approvals on desktop are handled in developerSessionService (approval-answered event, apps/desktop/electron/runtime/developerSessionService.ts:880-887).
- Attaching to a turn running in another process on CLI, VS Code, desktop: declined (doc: docs/decisions/2026-09-27-founder-decisions.md:88).

## 4. Required behaviour

**Established requirements**

- An approval pending in the session shows on every attached client and can be answered from any of them. (source: brief S68.08)
- A client attaches with full control: send turns, stop, approve. (source: brief S68.11)
- Attaching to a turn running in another process is not built for CLI, VS Code, desktop; work moves by reviewed hand-off. (source: docs/decisions/2026-09-27-founder-decisions.md:88)
- An action a user cannot undo asks first and names the consequence. (source: AGENTS.md section 9)

**Acceptance criteria**

1. An approval created by a turn shows on web, phone, CLI and VS Code for the same account.
2. Approving on one client resumes the turn; a second decision on the same step gets a conflict.
3. A decision after 30 minutes is refused as expired.
4. With the cloud switch off the decision returns 'Managed Code is not enabled for this deployment'.
5. The phone does not reload while a decision is pending and hides that card.
6. Send is blocked while a turn runs; Stop works only while a turn runs.
7. A decision for an account without managed compute access is refused by the access gate.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- Two clients racing on one approval resolve to one success and one conflict [inferred from the 'already decided' conflict in cloud-code-agent-approval-service.ts:316].
- Stop should confirm what is lost [inferred from AGENTS.md section 9]; the phone stop has no confirmation in the code read.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Show who decided an approval on the other clients.
- [proposed] Add a confirmation naming what a stop discards.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| endpoint | GET/POST agent/approvals | `apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts` | Lists and decides approvals |
| service | cloud-code-agent-approval-service | `apps/web/lib/services/cloud-code-agent-approval-service.ts` | List, expire and decide approvals |
| table | cloud_code_agent_approvals | `apps/web/lib/services/cloud-code-agent-service.ts` | Approval rows with 30 minute expiry |
| service | managed compute access | `apps/web/lib/services/managed-compute-access.ts` | Subscription and workspace access check before a decision |
| service | entitlement resolution | `apps/web/lib/services/entitlement-resolution.ts` | Resolves plan and subscription |
| endpoint | POST agent/cancel | `apps/web/app/api/code/sessions/[sessionId]/agent/cancel/route.ts` | Stops a running turn |
| component | CloudCodePage approvals | `apps/web/features/code/CloudCodePage.tsx` | Web approval cards, decide handler, stop handler |
| hook | useCloudCodeSession | `apps/mobile/src/features/cloud-code/useCloudCodeSession.ts` | Phone send, stop, decide |
| component | CloudCodeApprovalCard | `apps/mobile/src/features/cloud-code/components/CloudCodeApprovalCard.tsx` | Phone Approve and Deny buttons |
| component | CodeApprovalNotice | `apps/mobile/src/features/cloud-code/components/CodeApprovalNotice.tsx` | First-run notice about the approval setting |
| store | cloudCodeRequests | `apps/mobile/src/features/cloud-code/cloudCodeRequests.ts` | Tracks pending send and decision requests |
| service | code_sessions approvals | `apps/cli/src/cloud/code_sessions.rs` | CLI list, decide, handle format |
| command | agi code approvals/approve/reject | `apps/cli/src/lib.rs` | CLI commands |
| service | cloudCodeSessions decide | `apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts` | VS Code approve, reject, stop rows |
| schema | CLOUD_CODE_SESSION_COPY | `packages/contracts/types/src/cloud-code.ts` | Shared labels: Approval required, Approve and continue, Deny, Stop the task |
| service | managed cloud code api client | packages/cloud-contracts (not found) (not found) | createManagedCloudCodeApi used by phone, web and VS Code (folder not opened) |
| service | developerSessionService approvals | `apps/desktop/electron/runtime/developerSessionService.ts` | Desktop local-session approval events |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| The agent turn stops and an approval row is inserted with a 30 minute expiry. | our servers | apps/web/lib/services/cloud-code-agent-service.ts:957-966 |
| A client lists approvals for the session. | device and our servers | apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:46-57 |
| Person chooses Approve or Deny; client posts turn id, step index and decision. | device | apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:278-303 |
| Server checks rate limit, CSRF, deployment, subscription and workspace access, then resumes the turn. | our servers | route.ts:62-69,97-126 |
| The resumed command runs in the cloud sandbox. | outside service | apps/web/lib/e2b/gate.ts:1-28 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Approval row: command, reason, tool name, tool arguments, state, decided time | table cloud_code_agent_approvals | Read by every client of the account | Expires after 30 minutes; state set to 'expired' by a sweep (cloud-code-agent-approval-service.ts:85-97) |
| Audit event on stop | audit log table (name not opened) | Server only | unknown |

**Models and providers.** The decision itself uses no model. The resumed turn uses the model of the turn (stored with the turn; apps/web/lib/services/cloud-code-agent-service.ts:661-683). The plan tier is passed to the resume for metering (approvals route.ts:107-115).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed in; session owned by the same user and organization (route.ts:60,110-115). |
| Permissions | Rate limit class 'chat-conversation'; CSRF token; owner scope on queries (route.ts:62-66). |
| Subscription | Entitlement bundle is resolved and managed compute access evaluated; a refusal is returned as 403 or 503 (route.ts:97-106; apps/web/lib/services/managed-compute-access.ts:194-209). |
| Limits and metering | Resumed turn runs under the same budget: route maxDuration is 800 seconds, kept equal to the agent service budget (route.ts:31-37). |
| Feature flags | AGI_E2B_EXECUTION and E2B_API_KEY via e2bProvisioningReady (route.ts:68-70; apps/web/lib/e2b/gate.ts:20-28). |
| Model compatibility | Not applicable to the decision. |
| Provider restrictions | none found in the code for the decision step. |
| Local mode | Cloud approvals do not exist in Local or own-key mode. Local session approvals are answered in the local client (terminal, VS Code, desktop) and never reach our servers [inferred from the local app server design]. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Approval expired | Server returns a conflict with 'This approval request expired and can no longer be decided'. | apps/web/lib/services/cloud-code-agent-approval-service.ts:29-34,305-315; route.ts:42 |
| Already decided or turn no longer suspended | Conflict; orphaned row retired. Web re-reads approvals after a failed decision. | cloud-code-agent-approval-service.ts:316; apps/web/features/code/CloudCodePage.tsx:1530-1545; test '409s on a turn that is no longer suspended' |
| Decision in flight on phone | That card is hidden, page reload is held back and send is blocked. | apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:208-211,215 |
| Send refused while away | A refused draft is kept and restored (test CloudCodeRefusedDraft). | apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:152-158,247-256 |
| Switch off | Decision throws capability unavailable. | route.ts:68-70 |
| Offline | Request error text shown as a dismissible notice; no queued retry found. | apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:292-296; offline queue not handled in the code |
| Accessibility | Dismiss button labelled; card text uses plain text nodes. Screen reader coverage of the card: not checked. | apps/mobile/src/features/cloud-code/CloudCodeSessionScreen.tsx:202 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.test.ts`: Lists live approvals; retires approvals of failed or expired turns; 409 when the turn is no longer suspended; approves and resumes a suspended turn
- `apps/web/lib/services/__tests__/cloud-code-agent-approval-service.test.ts`: Approval service (cases not opened)
- `apps/mobile/__tests__/CloudCodeSessionsApprovalNotice.test.tsx`: The approval-setting notice shows once and holds back behind sheets
- `apps/mobile/__tests__/CloudCodeRefusedDraft.test.tsx`: Refused send keeps the draft (title read, cases not opened)
- `apps/web/features/code/components/LocalApprovalCard.test.tsx`: Local-session approval card on web

**Test scenarios**

- **Approve from phone**
  1. Start a task that needs approval on web.
  2. Open the session on the phone.
  3. Tap Approve and continue.
  - Expected: Turn resumes; web shows the result on next read.
- **Expired**
  1. Wait over 30 minutes.
  2. Try to decide.
  - Expected: Conflict about an expired request.
- **CLI**
  1. Run agi code approvals.
  2. Run agi code approve <handle>.
  - Expected: Prints status and the show hint.
- **Switch off**
  1. Disable AGI_E2B_EXECUTION.
  2. POST a decision.
  - Expected: 'Managed Code is not enabled for this deployment'.
- **Race**
  1. Open the same approval on two clients.
  2. Approve on one, then the other.
  - Expected: Second gets a conflict; result not recorded in a file, run to confirm.

**Where to look when it fails**

- Table cloud_code_agent_approvals (state, expires_at).
- Error classes CloudCodeApprovalExpiredError and ManagedUsageRequestError (route.ts:15,42).
- Phone string 'Your decision could not be sent' (service.ts:13).

**Hands-on test plans**

- Web: [70-qa/test-plans/web/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/web/068-session-continuity-and-remote-session-product.md)
- Mobile: [70-qa/test-plans/mobile/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/mobile/068-session-continuity-and-remote-session-product.md)
- CLI: [70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/cli/068-session-continuity-and-remote-session-product.md)
- VS Code: [70-qa/test-plans/vscode/068-session-continuity-and-remote-session-product.md](../../70-qa/test-plans/vscode/068-session-continuity-and-remote-session-product.md)

## 10. Gaps and dependencies

- **Web approvals work only when cloud Code is switched on.** Affects: Web and desktop. Evidence: apps/web/app/api/code/sessions/[sessionId]/agent/approvals/route.ts:68-70. Work needed: Switch-on and live check (doc: audit/partial/068-session-continuity-and-remote-session-product.md).
- **Decision route checks the deployment flag but not the managed-compute kill switch directly; session creation checks both.** Affects: All clients. Evidence: route.ts:68-70 versus apps/web/lib/services/cloud-code-session-open.ts:49-53. Work needed: Confirm whether evaluateManagedComputeAccess covers the kill switch [unknown].
- **Brief says desktop 08 and 11 not listed; desktop relies on the web page.** Affects: Desktop. Evidence: doc: brief S68.08, S68.11. Work needed: State the desktop status explicitly.
- **Stop has no confirmation naming the consequence.** Affects: Phone, web. Evidence: apps/mobile/src/features/cloud-code/useCloudCodeSession.ts:259-276. Work needed: Check against AGENTS.md section 9 and add if required.

**Depends on**

- surface:web
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- SYS-authorization-and-workspaces
- SYS-subscriptions-entitlements-and-usage
- SYS-agents-tools-and-automation
- table:cloud_code_agent_approvals
- api:POST /api/code/sessions/[sessionId]/agent/approvals
- F068-01
- F068-02

## Unknown

- Whether evaluateManagedComputeAccess includes the managed-compute kill switch.
- Where the audit event for stop is stored.
- What the CLI terminal UI and VS Code local approval code do beyond the brief's citations (tui_app.rs not opened).
- Exact web card labels (CloudCodePage approval card component not opened).
