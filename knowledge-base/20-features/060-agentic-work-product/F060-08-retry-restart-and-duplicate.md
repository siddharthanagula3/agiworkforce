---
id: "F060-08"
type: "feature"
title: "Retry, restart and duplicate"
aliases: ["Retry, restart and duplicate", "Retry failed step (S60.24)", "Restart task (S60.25)", "Duplicate task (S60.26)", "Retry from this step", "Re-run this task", "Run again"]
area: "60 Agentic work product"
available_on: ["web", "desktop", "mobile", "cli"]
implementation: {web: "built", desktop: "built", mobile: "partial", cli: "partial", vscode: "missing", chrome: "missing"}
verification: {web: "not seen by a person", desktop: "not seen by a person", mobile: "n/a", cli: "not seen by a person", vscode: "not seen by a person", chrome: "n/a"}
requirement_items: ["S60.24", "S60.25", "S60.26"]
depends_on: ["surface:web", "surface:desktop", "surface:mobile", "surface:cli", "surface:vscode", "mode:cloud", "plan:pro", "plan:max", "plan:max_15x", "plan:team", "plan:team_premium", "plan:enterprise", "file:apps/web/features/chat/pages/WebChatPage.tsx", "file:packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx", "table:web_messages", "table:cloud_agent_runs", "SYS-chat-turn-pipeline", "SYS-model-catalog-and-routing", "SYS-subscriptions-entitlements-and-usage", "F060-11", "F060-07"]
basis: "code inspection"
second_reader: "not sampled: statements are code readings that nobody has re-checked"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# F060-08 Retry, restart and duplicate

After a Work task ends, the person can run it again from a loaded draft: web and the desktop build offer 'Re-run this task', mobile offers 'Run again'. On web a failed or stopped plan step offers 'Retry from this step', which sends a new message for that step onward. There is no one-click restart that resumes the same run.

Area: [60. Agentic work product](README.md). Requirement items: [S60.24](../../10-requirements/capabilities/060-agentic-work-product.md#s6024), [S60.25](../../10-requirements/capabilities/060-agentic-work-product.md#s6025), [S60.26](../../10-requirements/capabilities/060-agentic-work-product.md#s6026).

## Status

Two separate questions: is the code there, and has a person seen it work. "Seen working" comes only from results of real runs recorded in the project's ledger.

| App | In the code: this page's reading, 2026-11-24 | In the code: ledger audit, 2026-09-26 and later updates | Seen working by a person |
|---|---|---|---|
| Web | built | built | not seen by a person |
| Desktop | built | built | not seen by a person |
| Mobile | partly built **(disagrees with the ledger on whether it exists)** | not built | n/a |
| CLI | partly built | partly built | not seen by a person |
| VS Code | not built **(disagrees with the ledger on whether it exists)** | partly built | not seen by a person |
| Chrome | not built | not built | n/a |

The first column was derived from this page's text by a second, cheaper pass and has not been validated item by item; the ledger column is the project's own record. Neither is a test result.
Where the two disagree on whether the feature exists on an app, the case is listed in [ledger corrections](../../90-meta/ledger-corrections.md).

## 1. Purpose and user value

**What it does.** Turns a finished or failed Work task into a new task. 'Retry from this step' starts a new Work turn whose plan begins at the failed step. 'Re-run this task' (web, Tauri desktop) and 'Run again' (mobile) put the original goal back into the composer or start sheet so the person can edit and send it.

**Why it exists.** A task can fail on step 3 of 5, or the person wants the same job again next week. Rewriting the goal is slow and loses constraints and deliverable.

**Who uses it.** People with a finished, failed or cancelled Work task on web, desktop and mobile.

**Problems it solves**

- Retyping a long goal with its constraints and deliverable.
- Redoing earlier plan steps that already succeeded.
- Seeing exactly what will be sent before a re-run starts.

**Use cases**

- Step 4 of a report failed; press 'Retry from this step' to run steps 4 onward.
- Open last week's finished task and press 'Re-run this task', then change the date range.
- On mobile open a completed task and press 'Run again' to review the request in the start sheet.

## 2. User experience

**Where to find it**

- Web chat: on a Work message whose run has finished, a card 'Retry a step' shows the first failed or stopped plan step and the button 'Retry from this step' (apps/web/features/chat/components/work-session/AgiWorkPlanReview.tsx:51-79; mounted at apps/web/features/chat/components/messages/MessageBubble.tsx:2644).
- Web /tasks and Tauri Tasks: in the detail panel 'Goal' box, button 'Re-run this task', shown only when the task is not live, is a Work task, the host supplies rerunWork and the journal has a goal (packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:567-581; TasksPage.tsx:665).
- Desktop (public Electron app): the hosted web app, so the web controls (doc: AGENTS.md section 5).
- Mobile: task detail sheet, button 'Run again' (apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:608-616).
- VS Code: only the chat command 'agi-workforce.retryLastMessage' that resends the last chat message (apps/extension-vscode/src/features/chat/retry.ts:4,55-72).
- CLI: '/branch' or '/fork' copies the current local session; '/continue' asks the model to continue its last answer (apps/cli/src/repl/slash_commands.rs:491; apps/cli/src/claude_parity.rs:185).
- Chrome: none found.

**Before you start**

- Signed-in account; Work available on the plan (canUseAgiWork) for web and desktop composers (apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1057-1062; apps/desktop/src/features/v3/DesktopShellV3.tsx:254-259).
- For 'Re-run this task': the task has a Goal entry in its journal and is not live.
- For mobile 'Run again': the task is settled and has a conversation (apps/mobile/src/features/tasks/taskActions.ts:15-17).

**Screens and controls**

- Retry card text: '<n>. <step description> · Failed|Stopped' with the button 'Retry from this step' (AgiWorkPlanReview.tsx:65-77).
- Web re-run toast: 'Loaded this session's goal, constraints and deliverable into a new Work chat. Edit them if you like, then send to run it again.' (apps/web/features/tasks/components/TasksPage.tsx:68-70).
- Tauri re-run toast: 'Loaded this task into a new AGI Work chat. Edit it if you like, then send to run it again.' (DesktopTasks.tsx:34-36).
- Mobile start sheet opens with the original request prefilled; failures show alerts 'Could not run it again' (CloudTasksScreen.tsx:600-624,831).

**Journey**

1. 1. Open a finished task or the failed Work message.
2. 2. Web retry: press 'Retry from this step'. A new Work message 'Retry step N: <description>' is sent with the plan from step N onward.
3. 3. Re-run: press 'Re-run this task' (web, desktop) or 'Run again' (mobile).
4. 4. The composer or start sheet opens with the goal; web also restores constraints, deliverable and the tools that were switched off.
5. 5. Edit if needed and send. A new run starts and appears in the task list.

**What the person sees and gets**

- Web re-run navigates to /chat with the draft and Work mode on and shows a success toast.
- Mobile shows an alert if the original request cannot be found or loaded (CloudTasksScreen.tsx:609,618-621).
- If the trial allowance is used up, web retry opens the upgrade dialog instead of sending (WebChatPage.tsx:6358-6361).

**Settings**

- Composer Work scope (constraints, deliverable, excluded tools) in the chat store (apps/web/features/tasks/components/TasksPage.tsx:56-65).

## 3. Current implementation

From reading the code. Not a test result.

**Working in the code**

- Web retry: the card appears for the first failed or cancelled plan step once the message stops streaming; the handler sends a new agiwork message with the original goal and the plan sliced from that step (AgiWorkPlanReview.tsx:51-56; apps/web/features/chat/pages/WebChatPage.tsx:6363-6378).
- Web re-run: rerunWork writes the goal to the pending draft, sets Work mode and the scope (constraints, deliverable, excluded tools), navigates to /chat and shows a toast (apps/web/features/tasks/components/TasksPage.tsx:53-71).
- The goal text, 'Constraints:', 'Deliverable:' and 'Tools off:' lines are parsed from the goal journal entry (TaskDetailPanel.tsx:203-219,575).
- Tauri re-run: builds a draft of goal plus Constraints and Deliverable lines and appends it to a new chat in Work mode (DesktopTasks.tsx:22-39; DesktopShellV3.tsx:797-802).
- Mobile 'Run again': finds the user message nearest the run's start time across conversation pages, closes the sheet and opens the start sheet with it (apps/mobile/src/features/tasks/taskActions.ts:19-47; CloudTasksScreen.tsx:600-624).
- CLI '/branch' and '/fork' fork the saved local session into a new managed session named by the person or branch-<time> (apps/cli/src/repl/registry.rs:1381-1426).

**Incomplete**

- 'Retry from this step' is a new turn, not a resume of the failed run's checkpoint, so earlier context is whatever the conversation holds (WebChatPage.tsx:6368-6374).
- Tauri re-run drops the excluded tools that web restores (DesktopTasks.tsx:25-32 vs TasksPage.tsx:60-62 in apps/web/features/tasks/components).
- Mobile re-run carries only the request text; constraints and deliverable are not carried (taskActions.ts:19-47) [inferred from the code returning message content only].

**Present but disconnected or switched off**

- The Tauri build re-run hook is only wired when the shell passes onRerunWork, which it does (DesktopShellV3.tsx:797); the public Electron app shows the web page instead.

**Not available**

- No one-click 'restart with the same inputs' that starts immediately: every re-run is a draft the person must send.
- No separate 'Duplicate' control exists on web or desktop; 'Re-run this task' covers both (TaskDetailPanel.tsx:579).
- Retry step and re-run: not found on Chrome. Retry step: not found on mobile, VS Code or the CLI.
- VS Code retry.ts resends the last chat message only; it is not a task restart (retry.ts:38-53).
- Whether the Tauri desktop chat shows the plan retry card: unknown.

## 4. Required behaviour

**Established requirements**

- After a step fails, the user can retry just that step and the task continues. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.24)
- The user can restart a finished task with the same inputs. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.25)
- The user can duplicate a task into a new editable task. (source: capability ledger `audit/ledger/ecosystem-capability-ledger.jsonl`, item S60.26)
- Product behaviour is shared by contracts; each surface owns only transport, permissions and presentation. (source: doc: docs/product/definition.md:124)

**Acceptance criteria**

1. A Work message with a failed or stopped plan step, not streaming, shows 'Retry from this step' on that step only.
2. Pressing it sends 'Retry step N: ...' with the plan starting at step N and the original goal.
3. Pressing it with the trial allowance used up opens the upgrade dialog and sends nothing.
4. 'Re-run this task' is hidden while the task is live and when the host cannot start a run.
5. After 'Re-run this task' on web, the draft holds the goal and the constraints, deliverable and tool switches of the original.
6. Mobile 'Run again' is shown only for settled tasks and opens the start sheet with the original request; a missing request shows an alert.

**Inferred requirements** (not stated anywhere; reasoned from the code or from competitor parity)

- A re-run creates a new run row with no link to the old one [inferred: nothing in the transport or draft code stores the source run id].

**Proposed improvements** (suggestions, not requirements)

- [proposed] Resume a failed step from the run's own checkpoint so earlier work is not re-sent.
- [proposed] Carry excluded tools on Tauri and constraints and deliverable on mobile.
- [proposed] Offer a plain 'Duplicate' that opens an editable copy and a 'Restart' that starts at once after a confirmation.

## 5. Implementation map

| Kind | Name | Path | Role |
|---|---|---|---|
| component | AgiWorkPlanReview | `apps/web/features/chat/components/work-session/AgiWorkPlanReview.tsx` | Plan review and 'Retry from this step' card. |
| component | MessageBubble mount | `apps/web/features/chat/components/messages/MessageBubble.tsx` | Passes runFinished and onDecision to the retry card (line 2644). |
| hook | handleAgiWorkPlanDecision | `apps/web/features/chat/pages/WebChatPage.tsx` | Start, cancel and retry decisions; sends the retry message (lines 6304-6379). |
| service | agiwork plan helpers | `apps/web/features/chat/utils/agiwork-plan.ts` | Plan step and review shapes. |
| component | TaskDetailPanel | `packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx` | 'Re-run this task' button and goal parsing. |
| screen | TasksPage (shared) | `packages/ui/unified-chat/src/components/tasks/TasksPage.tsx` | Passes onRerun only when transport.rerunWork exists and mode is agiwork (lines 663-667, 958-962). |
| hook | web tasks transport | `apps/web/features/tasks/components/TasksPage.tsx` | rerunWork writes the draft and Work scope into the chat store. |
| component | DesktopTasks | `apps/desktop/src/features/tasks/DesktopTasks.tsx` | Tauri transport with rerunWork. |
| screen | DesktopShellV3 | `apps/desktop/src/features/v3/DesktopShellV3.tsx` | onRerunWork opens a new chat, appends the draft, sets Work mode. |
| service | mobile taskActions | `apps/mobile/src/features/tasks/taskActions.ts` | canRerunCloudRun and loadRerunGoal. |
| screen | CloudTasksScreen | `apps/mobile/src/features/tasks/CloudTasksScreen.tsx` | handleRerun opens the start sheet. |
| component | StartWorkSheet | `apps/mobile/src/features/tasks/components/StartWorkSheet.tsx` | Mobile sheet that receives the initial goal. |
| command | VS Code retryLastMessage | `apps/extension-vscode/src/features/chat/retry.ts` | Chat-level resend of the last user message (not a task restart). |
| command | CLI branch | `apps/cli/src/repl/registry.rs` | branch_session_for_display forks a local managed session. |
| command | CLI slash dispatch | `apps/cli/src/repl/slash_commands.rs` | Routes /branch and /fork. |
| test | TasksPage.agiwork test | `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.agiwork.test.tsx` | Re-run button behaviour. |
| test | mobile taskActions test | `apps/mobile/src/features/tasks/__tests__/taskActions.test.ts` | Re-run lookup behaviour. |

## 6. Execution and data flow

| Step | Runs on | Source |
|---|---|---|
| Person presses 'Retry from this step'; the page builds the retry text and plan from the saved message metadata. | device | WebChatPage.tsx:6363-6374 |
| sendMessage posts a new Work turn to the managed chat route with workMode agiwork, the goal and the shortened plan; a new run row and events are created. | our servers | WebChatPage.tsx:6368-6374; request flow in SYS-chat-turn-pipeline (not re-traced) |
| Re-run: the page parses the goal journal line, writes it to a draft in browser state and navigates to /chat; nothing is sent until the person sends. | device | TaskDetailPanel.tsx:203-219,575; apps/web/features/tasks/components/TasksPage.tsx:53-71 |
| Mobile re-run reads the conversation messages from the server to find the original request, then opens the start sheet. | device and our servers | taskActions.ts:29-45 |
| When the person sends, the normal Work start path runs (plan, executor), billed like any new Work run. | our servers | Start path is outside this feature; see SYS-chat-turn-pipeline |

**Data**

| What | Stored in | Synced | Kept or deleted |
|---|---|---|---|
| Draft goal and Work scope | web chat store under the pending conversation key (browser memory) | No | Until sent or the draft is cleared |
| Retry message and new run | tables web_messages, cloud_agent_runs, cloud_agent_events | Yes, like any Work turn | Normal chat and run retention (unknown) |

**Models and providers.** The retry sends with activeModelId, the model currently selected, not necessarily the one the failed run used (WebChatPage.tsx:6369). Mobile start uses cloudWorkModelId, the selected cloud model or the tier default (apps/mobile/src/features/tasks/startWork.ts:38-42). Model choice and routing: SYS-model-catalog-and-routing.

## 7. Access and usage rules

| Rule | What the code does |
|---|---|
| Account | Signed-in account required. |
| Permissions | Same as sending a Work message; blocked while another turn is streaming (WebChatPage.tsx:6306). |
| Subscription | canUseAgiWork gates the Work composer; the Tauri shell shows 'AGI Work is not included in this account plan. Project chat still works.' when it is not (DesktopShellV3.tsx:256-259). The task list route itself has no plan check. |
| Limits and metering | A retry or re-run is a new Work run metered like any other; if the free trial is exhausted web opens the upgrade dialog (WebChatPage.tsx:6358-6361). Rate limits are those of the chat route (SYS-subscriptions-entitlements-and-usage). |
| Feature flags | Mobile FEATURES.cloudTasks (apps/mobile/lib/v1FeatureFlags.ts:10). |
| Model compatibility | none found in the code |
| Provider restrictions | Retry from the plan card is not offered for temporary or own-key or local conversations? Not established; the cancel branch skips saving for those (WebChatPage.tsx:6319-6330). For retry itself none found in the code. |
| Local mode | Retry and re-run are Work (cloud) features; the Tauri Tasks panel is hidden in local privacy mode and local agent eligibility uses the model check (DesktopShellV3.tsx:254-259,790). The CLI branch works fully offline on local sessions. |

## 8. States and edge cases

| State | Behaviour | Source |
|---|---|---|
| Run still streaming | No retry card; decision handler returns if isStreaming. | AgiWorkPlanReview.tsx:51-55; WebChatPage.tsx:6306 |
| Trial exhausted | Upgrade dialog, nothing sent. | WebChatPage.tsx:6358-6361 |
| Retry in flight | Button disabled while busy and the message id is marked retrying. | AgiWorkPlanReview.tsx:71; WebChatPage.tsx:6366-6377 |
| Task still live or host cannot start a run | 'Re-run this task' hidden. | TaskDetailPanel.tsx:567; TasksPage.agiwork.test.tsx:155-166 |
| Original request not found (mobile) | Alert 'Could not run it again' with 'The original request could not be found.' | CloudTasksScreen.tsx:608-610 |
| Offline or load error (mobile) | Alert asking to check the connection. | CloudTasksScreen.tsx:617-622 |
| Retry on a plan that was never started (awaiting approval) | The card shows the plan editor instead ('Start work', 'Cancel'), not retry. | AgiWorkPlanReview.tsx:55,85-139 |
| Accessibility | Retry card has aria-label 'Retry a step'; each plan step textarea is labelled 'Step n'. | AgiWorkPlanReview.tsx:61,103 |

## 9. Verification

What has actually been seen by a person is in the Status table above. This section lists what exists to check with.

**Existing tests**

- `packages/ui/unified-chat/src/components/tasks/__tests__/TasksPage.agiwork.test.tsx`: Goal and plan sections, Re-run sends the reconstructed goal, hidden when host cannot start or run is live.
- `apps/mobile/src/features/tasks/__tests__/taskActions.test.ts`: Run again only for settled tasks; full original request; paging lookup; no chat.
- `apps/web/features/tasks/components/TasksPage.test.tsx`: Web tasks page: deep link, empty state start, save as routine (re-run not seen in the cases read).
- `apps/desktop/src/features/tasks/__tests__`: Desktop tasks tests: sign-in prompt, desktop client, conversation open, error surfacing (re-run not seen).
- `apps/cli/src/repl/registry.rs`: Branch tests inside the file (refuses forks the privacy flag forbids, names the forked session).

**Test scenarios**

- **Retry from failed step**
  1. Run a Work task whose step 3 fails (force with a tool that errors).
  2. When streaming ends, find the card 'Retry a step'.
  3. Press 'Retry from this step'.
  - Expected: A new Work message 'Retry step 3: ...' is sent and the new run's plan starts at step 3.
- **Re-run keeps scope**
  1. Finish a Work task started with constraints, a deliverable and web search off.
  2. Open it in /tasks and press 'Re-run this task'.
  - Expected: /chat opens with the goal in the draft, Work mode on, constraints and deliverable filled, web search off, and the success toast.
- **Re-run hidden while live**
  1. Open a Running task.
  - Expected: No 'Re-run this task' or 'Save as routine' button.
- **Mobile run again**
  1. Open a Completed task in the phone app.
  2. Press 'Run again'.
  - Expected: Start sheet opens with the full original request (not the 200-character preview).
- **Trial exhausted retry**
  1. Use an account whose trial allowance is spent and press 'Retry from this step'.
  - Expected: Upgrade dialog opens and no message is sent.

**Where to look when it fails**

- Retry failures surface through the chat error banner (setChatError) in WebChatPage.
- Mobile alerts 'Could not run it again'.
- Tables web_messages (metadata.agiWorkPlan) and cloud_agent_runs to see the new run.

**Hands-on test plans**

- Web: [70-qa/test-plans/web/060-agentic-work-product.md](../../70-qa/test-plans/web/060-agentic-work-product.md)
- Desktop: [70-qa/test-plans/desktop/060-agentic-work-product.md](../../70-qa/test-plans/desktop/060-agentic-work-product.md)
- Mobile: [70-qa/test-plans/mobile/060-agentic-work-product.md](../../70-qa/test-plans/mobile/060-agentic-work-product.md)
- CLI: [70-qa/test-plans/cli/060-agentic-work-product.md](../../70-qa/test-plans/cli/060-agentic-work-product.md)

## 10. Gaps and dependencies

- **Retry is a new turn, not a resume of the failed step in the same run.** Affects: Web users. Evidence: WebChatPage.tsx:6363-6378. Work needed: Decide if the requirement means checkpoint resume; if so build it on the run checkpoint.
- **Retry step is missing on mobile, VS Code, CLI, Chrome and, as far as traced, the Tauri chat.** Affects: Those apps. Evidence: No retry-step control found in those apps.. Work needed: Add a retry control or record the intended gap.
- **No separate Restart and Duplicate; no one-click restart.** Affects: Web, desktop, mobile. Evidence: TaskDetailPanel.tsx:579. Work needed: Clarify the requirement against the shipped 'Re-run this task' draft flow.
- **Tauri drops excluded tools; mobile drops constraints and deliverable on re-run.** Affects: Desktop (Tauri), mobile. Evidence: DesktopTasks.tsx:25-32; taskActions.ts:19-47. Work needed: Carry the full goal object through each transport.
- **The brief's VS Code and CLI 'restart' and 'duplicate' citations point at chat retry, code review retry and local session fork, not cloud task restart.** Affects: VS Code, CLI. Evidence: retry.ts:38-53; commandSetup.ts:1210-1218; registry.rs:1381-1426. Work needed: Correct the brief or build task-level restart in those apps.
- **The brief cites tool-loop.ts:4744 for retry; that line is unrelated search retry code.** Affects: Documentation. Evidence: tool-loop.ts:4745-4752. Work needed: Update the brief rows.
- Not built on: VS Code, Chrome (from the capability ledger).

**Depends on**

- surface:web
- surface:desktop
- surface:mobile
- surface:cli
- surface:vscode
- mode:cloud
- plan:pro
- plan:max
- plan:max_15x
- plan:team
- plan:team_premium
- plan:enterprise
- file:apps/web/features/chat/pages/WebChatPage.tsx
- file:packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx
- table:web_messages
- table:cloud_agent_runs
- SYS-chat-turn-pipeline
- SYS-model-catalog-and-routing
- SYS-subscriptions-entitlements-and-usage
- F060-11
- F060-07

## Unknown

- Whether the Tauri desktop chat renders the plan retry card.
- Whether a re-run is recorded against its source run anywhere.
- How plan steps are persisted in message metadata beyond the lines read.
- Whether any test covers the web retry card click end to end (not searched).
- Whether Chrome can start Work tasks at all (brief says missing).
