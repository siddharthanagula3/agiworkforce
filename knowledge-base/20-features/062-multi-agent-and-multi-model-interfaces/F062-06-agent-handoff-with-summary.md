---
id: "F062-06"
type: "feature"
title: "Agent handoff with summary"
aliases: ["Agent handoff", "Continue here", "Continue in the cloud", "Bring branch in", "Summary-only handoff", "S62.14", "S62.15"]
area: "62 Multi-agent and multi-model interfaces"
available_on: ["vscode"]
implementation: {web: "missing", desktop: "missing", mobile: "missing", cli: "missing", vscode: "partial", chrome: "missing"}
verification: {web: "n/a", desktop: "n/a", mobile: "n/a", cli: "n/a", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S62.14", "S62.15"]
depends_on: ["surface:vscode", "mode:cloud", "plan:free", "SYS-subscriptions-entitlements-and-usage", "SYS-sync-and-continuity", "SYS-authentication-and-identity", "SYS-execution-boundaries", "SYS-agents-tools-and-automation", "SYS-memory-projects-and-context", "api:POST /api/llm/v1/chat/completions"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F062-06 Agent handoff with summary

Moves work between places so the receiver continues it. In VS Code, 'Continue here' loads a cloud code session into the local chat with a clipped conversation summary, and 'Continue in the cloud' starts a cloud session from the open branch. It is device-to-device, not agent-to-agent. Summary-only handoff display does not exist.

Area: [62. Multi-agent and multi-model interfaces](README.md). Requirement items: [S62.14](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6214), [S62.15](../../10-requirements/capabilities/062-multi-agent-and-multi-model-interfaces.md#s6215).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | not built | not built | n/a |
| Desktop | not built | not built | n/a |
| Mobile | not built | not built | n/a |
| CLI | not built | not built | n/a |
| VS Code | partly built | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.

## 1. Purpose and user value

**What it does.** VS Code only. From a cloud code session the person can pick 'Continue here', which drops a draft (recent turns plus branch) into the local chat, or 'Bring branch in', which checks out the cloud branch. The reverse command 'Continue in the cloud' creates a cloud session on the current GitHub branch and starts a task there.

**Why it exists.** Work started in one place often has to finish in another; the product contract requires such moves to be explicit, with provenance, and never a background sync (doc: docs/product/requirements.md:276-283; docs/product/experience-contract.md Handoff Snapshot row).

**Who uses it.** VS Code developers using AGI Code cloud sessions.

**Problems it solves**

- Carry a cloud session's context into the local editor.
- Send local branch work to a cloud agent with a review step.

**Use cases**

- Continue a cloud session in the VS Code chat.
- Check out a cloud session's branch locally.
- Start a cloud session from the current branch with a goal.

## 2. User experience

**Where to find it**

- VS Code command 'Continue in the cloud' (agi-workforce/continueInCloud: apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts:15; registered at apps/extension-vscode/src/extension.ts:265).
- VS Code cloud code session pick list opened by command agi-workforce.openCloudCodeSession (cloudCodeSessions.ts:35, extension.ts:218-243).
- Web Code page has cloud and local sessions but no agent handoff found (apps/web/features/code/CloudCodePage.tsx).
- CLI, desktop, mobile, Chrome: not available; mobile has a separate Dispatch concept (docs/product/requirements.md:1749) not traced here.

**Before you start**

- Signed in to AGI Cloud.
- Continue in the cloud: open folder whose git remote is on GitHub, a checked out branch, and the branch pushed (continueInCloud.ts:23-34).
- Continue here: the chat view must be available (extension.ts:239-246).

**Screens and controls**

- Pick list with separators 'Transcript', approval heading, 'Actions'; items 'Continue here' (detail 'Start a chat in this window from this session’s conversation'), 'Bring branch in', 'Open on web', 'Stop turn' (cloudCodeSessions.ts:190-223).
- Review dialog before 'Continue in the cloud' lists repository, branch, model, network, what moves and what stays, unpushed commits and uncommitted files (continueInCloud.ts:52-78).
- Input box 'What should the cloud session do on <branch>?'

**Journey**

1. Continue here: 1. Open a cloud code session. 2. Pick 'Continue here'. 3. The chat gets a draft 'Continuing AGI Code session ... Conversation so far: ...' and the person sends it.
2. Continue in the cloud: 1. Run the command. 2. Type the goal. 3. Read the review dialog. 4. Press 'Continue in the cloud'. 5. Wait for the cloud turn, then 'Open session' from the notification.

**What the person sees and gets**

- Refusal text, for example 'Push <branch> to GitHub first. The cloud session clones it from there.' (continueInCloud.ts:31).
- Progress notifications 'starting a cloud session' and 'the cloud session is working' (continueInCloud.ts:120, :140).
- Stop reason label shown when the cloud turn ends; failure shows a warning with 'Open session' (continueInCloud.ts:146-153).
- The draft is 'Conversation so far' with the last 12 turns, each clipped to 2,000 characters (packages/contracts/types/src/remote-code.ts:30-31; cloudCodeSessions.ts:113-122).

**Settings**

- Model for the cloud session comes from the configured model if cloud routed, else the plan's default cloud code agent model (continueInCloud.ts:112-118). Network access is set to trusted (continueInCloud.ts:129).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Continue here builds the continuation draft from the session title, repository, branch and recent turns (cloudCodeSessions.ts:96-125).
- Bring branch in passes an encoded handoff (run id, goal, branch, repository) to the pull command (cloudCodeSessions.ts:127-134, :318-330).
- Continue in the cloud creates a session and starts an agent turn, with a review dialog and refusals (continueInCloud.ts:84-179).
- Review dialog states what moves and what stays (continueInCloud.ts:52-70).

**Incomplete**

- 'Continue here' passes only a clipped recent-turns draft. That is a de-facto summary, but nothing tells the person it is partial; there is no 'summary only' control or label.
- The handoff moves work between a cloud session and the local editor, not between two agents or models.

**Present but disconnected or switched off**

- none found

**Not available**

- Web, desktop, mobile, CLI, Chrome: no agent handoff found.
- Summary-only handoff mode with a visible indicator: not found on any app (brief S62.15).

## 4. Required behaviour

**Established requirements**

- Work can be handed from one agent to another and the receiving agent continues it. (source: brief S62.14)
- A handoff can pass only a summary, not the full history, and the user can see that. (source: brief S62.15)
- A cross-domain continuation requires an explicit provenance-preserving handoff; a Cloud chat does not silently become a local session. (source: docs/product/requirements.md:279-283)
- Handoff Snapshot is redacted selected context with provenance, a user-approved copy or fork, never background sync. (source: docs/product/experience-contract.md:63)
- Cloud handoff must not overwrite local context. (source: docs/product/requirements.md:694)

**Acceptance criteria**

1. Continue in the cloud refuses without a GitHub remote, branch or pushed upstream, each with its own message.
2. The review dialog appears before any cloud session is created and cancelling creates nothing.
3. Continue here puts a draft in the chat and does not send it.
4. Bring branch in is offered only when the session has a branch and a recognised repository.
5. A handoff that sends only a summary says so on screen (not met today).

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- [inferred] The 12-turn, 2,000-character clipping is the nearest thing to summary-only today and should be named in the draft header.
- [inferred] Chrome and web would need a Handoff Snapshot UI to meet S62.14.

**Proposed improvements** (suggestions, not requirements)

- [proposed] Add a 'Handoff: summary only / full history' line to the continuation draft and the dialog.
- [proposed] Add a handoff action to the CLI and web Code page.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| command | agi-workforce.continueInCloud | `apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts` | Local branch to cloud session. |
| service | describeCloudSourceRefusal and describeCloudContinuationReview | `apps/extension-vscode/src/features/cloud-tasks/continueInCloud.ts` | Refusals and review text (23-78). |
| service | showCloudCodeSession | `apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts` | Pick list with Continue here and Bring branch in (243-343). |
| service | buildCloudCodeContinuationDraft | `apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts` | Draft with clipped recent turns (96-125). |
| service | cloudCodeHandoff | `apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts` | Builds the CloudTaskHandoff object (127-134). |
| command | openCloudCodeSession registration | `apps/extension-vscode/src/extension.ts` | Wires continueHere and bringBranchIn (218-262). |
| service | continueCloudWorkHere | `apps/extension-vscode/src/features/context-handoff` | Places the draft into the chat (imported in extension.ts; file not read). |
| config | REMOTE_CODE_LIMITS | `packages/contracts/types/src/remote-code.ts` | transcriptMessages 12, messageLength 2000 (27-35). |
| service | createManagedCloudCodeApi | `packages/contracts/cloud-contracts` | Cloud code session API client used by VS Code (path of source not traced). |
| component | CloudCodePage | `apps/web/features/code/CloudCodePage.tsx` | Web cloud and local code sessions; no handoff control found. |
| test | continueInCloud tests | `apps/extension-vscode/src/__tests__/continueInCloud.test.ts` | Command behaviour. |
| test | cloud session tests | `apps/extension-vscode/src/__tests__/cloudSessions.test.ts` | Cloud code session pick list. |
| test | context handoff tests | `apps/extension-vscode/src/__tests__/contextHandoff.test.ts` | Handoff query handling. |
| test | session handoff commands | `apps/extension-vscode/src/__tests__/sessionHandoffCommands.test.ts` | Handoff commands (detail not read). |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person runs the command; the extension reads the workspace git source (repository, branch, upstream). | device | continueInCloud.ts:84-90 |
| A review dialog is shown; on confirmation the extension asks our service to create a cloud session for the repository and branch. | our servers | continueInCloud.ts:101-135 |
| The cloud agent starts a turn on the cloned repository. | our servers | continueInCloud.ts:140-142 |
| The cloud agent calls a model provider on our managed route. | outside service | api.startAgentTurn with a model id (continueInCloud.ts:142); provider route not traced |
| Continue here reads the session and its turns, builds a draft and places it in the local chat; nothing is sent until the person sends. | device and our servers | cloudCodeSessions.ts:243-256, :288-296 |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Cloud code session and turns | Our servers (cloud code session API) | Visible on web Code and VS Code | unknown |
| Continuation draft | VS Code chat composer in memory | No | Until sent or cleared |
| Git branch contents | GitHub remote the person pushed to | By git | By the repository |

**Models and providers.** The cloud session model is the configured cloud model or the plan's default cloud code model via resolveCloudCodeAgentModel; if the local model is not cloud routed the review dialog names the local default that will not be used (continueInCloud.ts:112-118, :56-61).

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in AGI Cloud account required ('sign in to AGI Cloud to continue work in the cloud', continueInCloud.ts:98). |
| Permissions | Network access for the cloud session is 'trusted' (continueInCloud.ts:129). Pushing the branch is the person's own git action. |
| Subscription | Model chosen by plan tier (resolveCloudCodeAgentModel with planTier, continueInCloud.ts:113). Cloud turn usage is metered on our servers [inferred]. |
| Limits and metering | Task text limited by CLOUD_CODE_LIMITS.task; title by CLOUD_CODE_LIMITS.title (continueInCloud.ts:90-110). Draft limited to 12 turns of 2,000 characters. |
| Feature flags | none found in the code |
| Model compatibility | Plan decides the cloud code model. |
| Provider restrictions | Cloud route only; local model is not used for the cloud session. |
| Local mode | Continue in the cloud sends repository identity and the task to our servers, so it leaves Local; the dialog states this ('network' and 'what moves' lines). Continue here is local after reading the session. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Refusal | Four messages: no GitHub remote, no branch (detached), branch not pushed, signed out. | continueInCloud.ts:23-34, :96-100 |
| Cancel | Closing the input or choosing nothing in the dialog stops with no session created. | continueInCloud.ts:108, :125 |
| Loading | Notification progress while starting and while working. | continueInCloud.ts:120-143 |
| Error | 'the cloud session could not start' or 'started but its task did not', with Open session. | continueInCloud.ts:136-171 |
| Session open fails | Error message 'this AGI Code session could not be opened'. | cloudCodeSessions.ts:262-269 |
| Chat view unavailable | Warning that the session was not placed. | extension.ts:239-246 |
| Approval pending in session | Approve or reject items in the pick list. | cloudCodeSessions.ts:178-198 |
| Offline / retry | not handled in the code beyond the error messages. | continueInCloud.ts:136 |
| Accessibility | Uses native VS Code quick pick and modal dialogs; custom labels not found. | cloudCodeSessions.ts:271-276 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `apps/extension-vscode/src/__tests__/continueInCloud.test.ts`: continueInCloud behaviour (detail not read).
- `apps/extension-vscode/src/__tests__/cloudSessions.test.ts`: Cloud sessions list and items.
- `apps/extension-vscode/src/__tests__/cloudSessionsSheet.test.ts`: Cloud sessions sheet.
- `apps/extension-vscode/src/__tests__/contextHandoff.test.ts`: Context handoff.
- `apps/extension-vscode/src/__tests__/sessionHandoffCommands.test.ts`: Handoff commands.
- `apps/extension-vscode/src/__tests__/developerSessionHandoff.test.ts`: Developer session handoff.

**Test scenarios**

- **Refusal paths**
  1. Run Continue in the cloud with no remote, then detached HEAD, then unpushed branch.
  - Expected: Each shows its own refusal message and no session is created.
- **Happy path**
  1. Push a branch, run the command, enter a goal, confirm.
  - Expected: Cloud session created; notification offers Open session.
- **Continue here**
  1. Open a cloud session with several turns, pick Continue here.
  - Expected: Chat draft starts 'Continuing AGI Code session' with up to 12 recent turns; not sent.
- **Bring branch in**
  1. Pick Bring branch in on a session with a branch.
  - Expected: The branch is checked out in the open folder.
- **Summary visibility**
  1. Read the draft and dialog for any mention that only recent turns are passed.
  - Expected: Currently none; documents the S62.15 gap.

**Where to look when it fails**

- Error text from describeCloudRunFailure in the notifications (cloudRunApproval.ts:34-40).
- Cloud code session records on our servers (table names not traced).

**Hands-on test plans**

- VS Code: [70-qa/test-plans/vscode/062-multi-agent-and-multi-model-interfaces.md](../../70-qa/test-plans/vscode/062-multi-agent-and-multi-model-interfaces.md)

## 10. Gaps and dependencies

- **No summary-only handoff mode or indicator on any app.** Affects: All apps. Evidence: brief S62.15; draft helper at cloudCodeSessions.ts:96 always clips to recent turns without saying so. Work needed: Add a mode and visible label.
- **Handoff exists only in VS Code and is device-to-device, not agent-to-agent.** Affects: Web, desktop, mobile, CLI, Chrome. Evidence: No handoff code found in those apps. Work needed: Product decision about which surfaces need it.
- **Desktop and mobile handoff concepts (Dispatch) are in product requirements but were not traced.** Affects: Mobile, desktop. Evidence: docs/product/requirements.md:1749. Work needed: Trace and map to this feature.
- **The brief marks VS Code done; code supports Continue here and Continue in the cloud only partly against 'receiving agent continues it'.** Affects: VS Code. Evidence: cloudCodeSessions.ts:243-343. Work needed: Verify by run that the continuing chat actually picks up the work.
- Not built on: Web, Desktop, Mobile, CLI, Chrome (from the capability ledger).

**Depends on**

- surface:vscode
- mode:cloud
- plan:free
- SYS-subscriptions-entitlements-and-usage
- SYS-sync-and-continuity
- SYS-authentication-and-identity
- SYS-execution-boundaries
- SYS-agents-tools-and-automation
- SYS-memory-projects-and-context
- api:POST /api/llm/v1/chat/completions

## Unknown

- What continueCloudWorkHere does in detail (file not read).
- What the context-handoff tests prove.
- Whether Dispatch on mobile is an agent handoff and what it passes.
- Where cloud code session rows are stored.
- Whether the brief's 'done' for VS Code was verified by anyone running it.
