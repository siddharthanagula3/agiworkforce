---
id: "GAPS-AREA-060"
type: "gap-list"
title: "Gaps: Agentic work product"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 60. Agentic work product

117 open gaps that touch this area. Area page: [20-features/060-agentic-work-product](../../20-features/060-agentic-work-product/README.md).

## CMP-C119

**Goal loop: keep working until a condition is met**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md)
- Detail: Ours has no /goal command or completion-condition loop.
- Evidence: searched: /goal, completion_condition in apps/cli/src

## CMP-C135

**ScheduleWakeup for self-paced loops**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md)
- Detail: No loop and no wake-up tool.
- Evidence: searched: ScheduleWakeup, schedule_wakeup in apps/cli/src and crates, no hit

## CMP-CP180

**Steer a running turn by sending a message**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md), [F016-09](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md), [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md), [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Detail: The app server can steer, the terminal screen cannot Messages typed during a turn are queued for after it; /btw asks aside. The app server can steer, the terminal screen cannot.
- Evidence: apps/cli/src/tui/tui_app.rs:2024-2034; apps/cli/src/app_server/developer_host.rs:133

## CMP-CP21

**Queue a message while the agent works**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md), [F016-09](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md), [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md), [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Detail: There is no send-now key Typing during a turn queues the message and a stopped turn returns queued text to the composer; there is no send-now key.
- Evidence: apps/cli/src/tui/tui_app.rs:8423; apps/cli/src/tui/tui_app.rs:8686

## CMP-CP27

**Steer or queue a message while a turn is running**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md), [F016-09](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md), [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md), [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Detail: It cannot steer the running turn and Up does not pull queued text back (a stop returns it to the composer) Typing while a turn runs queues the message for later; it cannot steer the running turn and Up does not pull queued text back (a stop returns it to the composer).
- Evidence: apps/cli/src/tui/tui_app.rs:8423,8686

## CMP-CP57

**Cap on parallel subagents**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md), [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md), [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md), [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Detail: Ours caps running subagents at 7 as a fixed constant that users cannot change Ours caps running subagents at 7 as a fixed constant that users cannot change.
- Evidence: apps/cli/src/subagent.rs:383,598

## CMP-CP80

**Subagent limits: concurrent count and nesting depth**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md), [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md), [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md), [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Detail: Up to 7 subagents at once and 3 levels deep, both fixed in code with no setting to change them Up to 7 subagents at once and 3 levels deep, both fixed in code with no setting to change them.
- Evidence: apps/cli/src/subagent.rs:383,407

## CMP-D28

**Goal loop: a completion condition the agent keeps working toward**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md)
- Detail: No /goal command or progress row exists; a task has a goal and constraints but no checked completion condition that keeps it running.
- Evidence: searched: /goal, goal mode, goalCondition in apps/web/features, packages/ui; slash list at apps/web/features/chat/lib/chat-slash-commands.ts:26

## CMP-D29

**Parallel chunks of work and parallel goals per chat**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md), [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md), [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md), [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Detail: A chat runs one thing at a time; you can start other chats or tasks, but one request is not split into parallel pieces.
- Evidence: searched: parallel agents, fork in apps/web/features/chat, apps/web/app/api/llm

## CMP-D31

**Subagents and built-in helper agents (explorer, worker, planner) with their own context**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md), [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md), [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md), [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Detail: Cloud chat and tasks have no delegation to subagents with separate context; only local Code sessions on this computer list child tasks, which is out of scope here.
- Evidence: searched: subagent, spawn_agent, delegate in apps/web/app/api/llm, apps/web/features/chat

## CMP-DP29

**Custom rules and approval tiers for a personal agent**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: No free-text custom rules Three approval levels and per-tool Always allow, Needs approval or Blocked exist, but no free-text custom rules.
- Evidence: packages/contracts/types/src/tool-approval-policy.ts:52

## CMP-DP35

**Send a task from the phone to run on the paired desktop (Dispatch)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F060-02](../../20-features/060-agentic-work-product/F060-02-choose-sources-tools-place-model-and-effort.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md), [F110-10](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-10-moving-work-between-devices.md)
- Detail: The phone side is hidden in mobile v1 by owner decision, and there is no single persistent thread Desktop can pair a phone or a signed-in browser to send tasks to this computer; the phone side is hidden in mobile v1 by owner decision, and there is no single persistent thread.
- Evidence: apps/web/features/desktop-host/components/RemoteControlSection.tsx:37; apps/web/features/remote-dispatch/components/RemoteComputerPage.tsx:33

## CMP-DP72

**Interrupt, or steer a running task by typing a correction**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md), [F035-05](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md), [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Detail: The message box cannot send while a task runs, so a correction needs Stop first Stop ends the running task; the message box cannot send while a task runs, so a correction needs Stop first.
- Evidence: apps/web/features/code/components/CodeComposer.tsx:1752,1914-1925

## CMP-MP51

**Scheduled task caps by plan**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md), [F061-04](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md), [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Free users cannot schedule at all Caps come from the plan catalog: Free 0, Basic 3, Pro 5, Max 25, Team 10. Free users cannot schedule at all.
- Evidence: packages/contracts/types/src/billing-catalog.ts:617; :644; :663; :683; apps/mobile/app/(app)/schedules/index.tsx:62

## CMP-VP31

**Subagent and background task view**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: VS Code
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md), [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md), [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md), [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Detail: There is no map view A Subagents panel lists child tasks with state counts; there is no map view.
- Evidence: apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3190-3225

## CMP-W158

**Parallel subagents inside one task with a read-only activity list**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md), [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md), [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md), [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Detail: Cloud tasks and Work run as one agent; there is no way to delegate parts to subagents and see their results in the chat.
- Evidence: searched: subagent, spawn_agent, delegate in apps/web/lib, features, unified-chat (only local code panel)

## CMP-WP119

**Active scheduled task limit by plan**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md), [F061-04](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md), [F063-02](../../20-features/063-routines-schedules-and-triggers/F063-02-create-a-routine-from-a-prompt-from-a-chat-turn-fr.md), [F063-04](../../20-features/063-routines-schedules-and-triggers/F063-04-when-it-runs-one-time-repeating-time-zone-advanced.md), [F063-06](../../20-features/063-routines-schedules-and-triggers/F063-06-run-now-and-run-results.md), [F063-07](../../20-features/063-routines-schedules-and-triggers/F063-07-pause-resume-edit-delete-share.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Limits are Free 0 (paid only), Basic 3, Pro 5, Max 15, Max 15x 25, Team 10 Limits are Free 0 (paid only), Basic 3, Pro 5, Max 15, Max 15x 25, Team 10.
- Evidence: packages/contracts/types/src/billing-catalog.ts:593; packages/contracts/types/src/billing-catalog.ts:683

## CMP-WP120

**Agent work inside chat (Chat and Work modes)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F060-01](../../20-features/060-agentic-work-product/F060-01-start-a-task-from-a-goal.md), [F060-10](../../20-features/060-agentic-work-product/F060-10-results-deliverables-and-partial-outcome.md), [F060-11](../../20-features/060-agentic-work-product/F060-11-task-list-history-sharing-and-handoff.md)
- Detail: Only Pro and higher plans get it Work is a mode in the composer with a plan review and run dock, but only Pro and higher plans get it.
- Evidence: packages/contracts/types/src/billing-catalog.ts:354; apps/web/features/chat/lib/agi-work.ts:32

## CMP-WP124

**Send a task to your own computer and follow it from the browser (Dispatch, Remote)**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F060-02](../../20-features/060-agentic-work-product/F060-02-choose-sources-tools-place-model-and-effort.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Desktop is not yet released The Code page has Your computer: paste a pairing link from Desktop to send tasks; Desktop is not yet released.
- Evidence: apps/web/features/remote-dispatch/lib/browser-pairing.ts:3; apps/web/lib/surface-status.ts:8

## CMP-WP127

**Agent splits work among parallel background agents**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md), [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md), [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md), [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Detail: Web chat does not split work for you Code shows child tasks in the session panel, but web chat does not split work for you.
- Evidence: apps/web/features/code/components/LocalSessionPanel.tsx:172-177

## CMP-WP137

**Several tasks at once, and starting tasks from a phone**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md), [F061-04](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Detail: Concurrent chat turns are capped by plan: 1 on Free, 3 on Pro, 5 on Max, 10 on Max 15x Concurrent chat turns are capped by plan: 1 on Free, 3 on Pro, 5 on Max, 10 on Max 15x.
- Evidence: packages/contracts/types/src/billing-catalog.ts:622; packages/contracts/types/src/billing-catalog.ts:678

## CMP-XP10

**Always asks before downloads, sensitive input and granting access**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: But the ask is not complete: a click that starts a download is not asked (cdpDriver.ts:1273-1276, 1331-1341) The row text is also wrong: these steps ask in every mode including Full access (apps/extension/src/features/computer-use/askBeforeActing.ts:36, crucialActions.ts:11-30), not only outside it. But the ask is not complete: a click that starts a download is not asked (cdpDriver.ts:1273-1276, 1331-1341)
- Evidence: apps/extension/src/features/computer-use/crucialActions.ts:11-28

## CMP-XP11

**Approval mode: skip all approvals**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md), [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: Still asks for protected steps and never completes a purchase Full access skips routine confirmations but still asks for protected steps and never completes a purchase.
- Evidence: apps/extension/src/side_panel.ts:14785-14795; apps/extension/src/features/options/site-permission-policy.ts:12

## CMP-XP20

**Approval mode: automatic with pauses for risky steps**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F059-05](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-05-permission-modes.md), [F059-06](../../20-features/059-approvals-and-human-in-the-loop-ui/F059-06-what-the-approval-shows-and-stronger-checks-for-ri.md), [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: It does not run a model safety review Auto is the default and asks before crucial steps by fixed rules; it does not run a model safety review.
- Evidence: apps/extension/src/features/computer-use/crucialActions.ts:1-45; apps/extension/src/side_panel.ts:14773-14783

## CMP-XP24

**Notice shown when Auto or Full access is on**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Detail: A dismissible notice appears for Full access only, not for Auto A dismissible notice appears for Full access only, not for Auto.
- Evidence: apps/extension/src/side_panel.ts:14909

## CMP-XP7

**Panel session runs as a full cloud work session**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Chrome
- Features: [F060-01](../../20-features/060-agentic-work-product/F060-01-start-a-task-from-a-goal.md), [F060-10](../../20-features/060-agentic-work-product/F060-10-results-deliverables-and-partial-outcome.md), [F060-11](../../20-features/060-agentic-work-product/F060-11-task-list-history-sharing-and-handoff.md)
- Detail: Documents, sheets and decks were not checked AGI Work runs multi-step tasks with tools and files and code runs show in the reply; plan-gated; documents, sheets and decks were not checked.
- Evidence: apps/extension/src/side_panel.ts:10432; apps/extension/src/features/side-panel/bubbles.ts:695

## GAP-AREA060-LW05

**Pause accepts a request and records pause_requested_at, but the step-boundary stop it promises was not traced in the executor. Pause is only allowed in executor-held states.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-060
- Detail: Area 60. Agentic work product
- Evidence: apps/web/lib/services/cloud-agent-run-service.ts:2727-2744

## GAP-AREA060-LW06

**Save as routine is wired only through an optional transport callback; no provider of saveAsRoutine was found, so the control may never show.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-060
- Detail: Area 60. Agentic work product
- Evidence: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:199, :668-670

## GAP-CAP-agent-actions-01

**Delegated multi-step task mode: Chrome panel does not run as a full Work session (S60.01 missing there). Free users get no Work switch and no message (seen on Web). Reloading a finished task showed duplicate rows, scaffold text and a live Start work button. docs/product/requirements.md section 20 sa**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F060-01](../../20-features/060-agentic-work-product/F060-01-start-a-task-from-a-goal.md), [F060-10](../../20-features/060-agentic-work-product/F060-10-results-deliverables-and-partial-outcome.md), [F060-11](../../20-features/060-agentic-work-product/F060-11-task-list-history-sharing-and-handoff.md)
- Requirement items: S60.01, S60.02, S60.03, S60.29, S60.30, S60.32
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-02

**Plan review, questions and approvals during a run: VS Code has no clarification request. A read-only PDF read was labelled high risk when seen on Web.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F060-04](../../20-features/060-agentic-work-product/F060-04-review-the-plan-before-it-acts.md), [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md)
- Requirement items: S60.13, S60.18, S60.19, S63.32
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-agent-actions-03

**Run progress, steering, pause, stop and retry: Pause and retry are missing on several apps. Stopping an answer raised a false Agent run failed bell notification, and a stopped run showed every step in red.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md), [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md), [F060-08](../../20-features/060-agentic-work-product/F060-08-retry-restart-and-duplicate.md)
- Requirement items: S60.14, S60.16, S60.20, S60.21, S60.22, S60.23, S60.24
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-04

**Long-running work that continues when the device is off: On Web the first turn of every new cloud coding task was cancelled and no live progress showed (W-18).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F060-11](../../20-features/060-agentic-work-product/F060-11-task-list-history-sharing-and-handoff.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Requirement items: S60.34, S65.27
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-05

**Choose where a task runs: Only Desktop offers the choice. The Web Your computer page needs a paired Desktop link; the phone cannot add a file to a computer session.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F060-02](../../20-features/060-agentic-work-product/F060-02-choose-sources-tools-place-model-and-effort.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Requirement items: S60.07, S65.29
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-06

**Parallel subagents and background agents: Cloud Work and Desktop run as one agent; no delegation or child list on Web, Desktop or Mobile; CLI limits are fixed constants.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md), [F062-01](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-01-parent-task-and-child-agent-list.md), [F062-02](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-02-per-agent-status-model-and-result.md), [F062-07](../../20-features/062-multi-agent-and-multi-model-interfaces/F062-07-background-fork-and-conversation-branch.md)
- Requirement items: S60.17, S62.01, S62.02, S62.03, S62.08, S62.16
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-agent-actions-07

**Goal loop with a completion condition: No /goal, no completion condition, no time budget. Spend budget exists only on the CLI.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md)
- Requirement items: S60.11, S60.12
- Detail: Claude partly, ChatGPT partly; AGI not built

## GAP-CAP-agent-actions-14

**Approval modes and per-tool permission levels: No notice when Auto is on in Chrome; no free-text standing rules; no per-chat approval for sending messages.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F065-99](../../20-features/065-computer-use-experience/F065-99-other-items.md)
- Requirement items: S60.19, S63.32, S65.23
- Detail: Claude yes, ChatGPT yes; AGI built

## GAP-CAP-agent-actions-28

**Usage accounting and limits for agent runs: No spend or time budget for tasks on Web, Desktop or Mobile; held runs do not resume after an allowance reset; Billing showed no renewal info when a limit error pointed to it.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md), [F061-04](../../20-features/061-persistent-agents-and-agent-rosters/F061-04-shared-tools-skills-and-per-agent-limits.md), [F063-08](../../20-features/063-routines-schedules-and-triggers/F063-08-cost-and-safety-controls-caps-notifications-approv.md), [F063-09](../../20-features/063-routines-schedules-and-triggers/F063-09-missed-runs-retries-and-held-runs.md)
- Requirement items: S60.10, S61.20, S63.31, S63.34
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-14

**Send, queue or steer while a reply is running: Ledger and comparison disagree on Chrome queue (ledger missing, comparison Better with code). CLI queue is partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F013-13](../../20-features/013-composer-text-interaction/F013-13-queued-and-steering-messages-side-questions.md), [F016-09](../../20-features/016-user-message-components/F016-09-sending-state-queued-pending-draft.md), [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Requirement items: S13.38, S13.39, S13.40, S16.17, S60.20
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-editing-regeneration-and-branching-15

**Interrupt a long research or agent run and add context: Desktop comparison marks interrupt and steer partial; Chrome unverified. A cloud task page showed a stale 'model failed' line after Stop.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F035-05](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md), [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Requirement items: S35.15, S35.18, S60.20, S60.23
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-F060-01-01

**Mobile New task sheet skips plan review while web, desktop and Chrome always review.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-01](../../20-features/060-agentic-work-product/F060-01-start-a-task-from-a-goal.md)
- Detail: Affects: Mobile users. Work needed: Decide the intended behaviour, then send agi_work_plan_approval from the sheet path and show the review card in the run detail. Verify by running.
- Evidence: apps/mobile/stores/chat/chatExecutionStore.ts:3291-3295 and 3451 set agi_work_plan_approval only when the goal came from the composer, not from options.agiWorkGoal passed by startWork.ts:64-69

## GAP-F060-01-02

**Chrome sends only the goal.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-01](../../20-features/060-agentic-work-product/F060-01-start-a-task-from-a-goal.md)
- Detail: Affects: Chrome users. Work needed: Add constraints, deliverable and tool exclusions to the side panel and request.
- Evidence: freeTrialClient.ts:1594

## GAP-F060-01-03

**No Work start on CLI terminal UI or VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-01](../../20-features/060-agentic-work-product/F060-01-start-a-task-from-a-goal.md)
- Detail: Affects: CLI and VS Code users. Work needed: Product decision: keep N/A or add; the brief marks them done, which the code does not support.
- Evidence: No work_mode use in apps/extension-vscode/src or the TUI; doc: docs/product/experience-contract.md:635 says N/A

## GAP-F060-01-04

**Run title rule not shared: mobile cuts the goal to 60 characters, web title source not traced, run row has no title.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-01](../../20-features/060-agentic-work-product/F060-01-start-a-task-from-a-goal.md)
- Detail: Affects: All surfaces. Work needed: Trace the web title source; store one title with the run.
- Evidence: startWork.ts:33-36; cloud-agent-run-service.ts:1295-1300

## GAP-F060-01-05

**Brief line references drifted (many cited lines no longer match the code), so the brief cannot be used as a code map.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-01](../../20-features/060-agentic-work-product/F060-01-start-a-task-from-a-goal.md)
- Detail: Affects: Engineers and testers. Work needed: Regenerate the brief against current code.
- Evidence: apps/desktop/electron/windowPolicy.ts:86 is URL navigation policy, not a Work feature

## GAP-F060-01-NOTBUILT

**Start a task from a goal: not built on CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code
- Features: [F060-01](../../20-features/060-agentic-work-product/F060-01-start-a-task-from-a-goal.md)
- Requirement items: S60.01, S60.03, S60.04
- Detail: CLI: S60.04; VS Code: S60.01, S60.03, S60.04

## GAP-F060-02-01

**No whole-task place choice: web has none, mobile none, CLI and VS Code none; desktop has a per-device-step toggle.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-02](../../20-features/060-agentic-work-product/F060-02-choose-sources-tools-place-model-and-effort.md)
- Detail: Affects: Web, mobile, desktop users. Work needed: Product decision on the choice (Cloud sandbox, this computer, another device) and a shared control.
- Evidence: ComposerPlusMenu.tsx:1288-1297 is the only place control found

## GAP-F060-02-02

**Mobile has no tool selection and no effort; Chrome has no tool selection or place.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-02](../../20-features/060-agentic-work-product/F060-02-choose-sources-tools-place-model-and-effort.md)
- Detail: Affects: Mobile and Chrome. Work needed: Add controls and send excludedTools and effort.
- Evidence: agiWorkGoal.ts:1-20; freeTrialClient.ts:1594

## GAP-F060-02-03

**Effort is not recorded on the run.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-02](../../20-features/060-agentic-work-product/F060-02-choose-sources-tools-place-model-and-effort.md)
- Detail: Affects: All surfaces. Work needed: Store effort with the run and show it in the task detail.
- Evidence: cloud-agent-run-service.ts:98-125 has no effort column

## GAP-F060-02-04

**The brief marks CLI and VS Code done for sources, tools, model and effort, but those controls belong to the local agent, not to an AGI Work run.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-02](../../20-features/060-agentic-work-product/F060-02-choose-sources-tools-place-model-and-effort.md)
- Detail: Affects: CLI and VS Code. Work needed: Clarify the brief.
- Evidence: doc: docs/product/experience-contract.md:635 N/A; no work_mode use found

## GAP-F060-02-05

**Brief evidence for place uses windowPolicy.ts, which is not a place control.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-02](../../20-features/060-agentic-work-product/F060-02-choose-sources-tools-place-model-and-effort.md)
- Detail: Affects: Desktop status. Work needed: Correct the brief to cite the 'Use this computer' toggle.
- Evidence: apps/desktop/electron/windowPolicy.ts:70-110

## GAP-F060-02-NOTBUILT

**Choose sources, tools, place, model and effort: not built on Web, CLI, VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, CLI, VS Code
- Features: [F060-02](../../20-features/060-agentic-work-product/F060-02-choose-sources-tools-place-model-and-effort.md)
- Requirement items: S60.05, S60.06, S60.07, S60.08, S60.09
- Detail: Web: S60.07; CLI: S60.05, S60.06, S60.07, S60.08, S60.09; VS Code: S60.05, S60.06, S60.07, S60.08, S60.09

## GAP-F060-03-01

**No person-set spend cap, time budget or completion condition for Cloud Work.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md)
- Detail: Affects: Web, desktop, mobile, Chrome Work users. Work needed: Design fields, contract change, enforcement in tool-loop, UI on all surfaces.
- Evidence: Search of the composer, sheet, Tasks page and request schema finds no such field (request-processor.ts:795-801)

## GAP-F060-03-02

**CLI cap is per turn on the local agent, while the brief wants a per-task cap on any task; flag help says session.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md)
- Detail: Affects: CLI users. Work needed: Align text and behaviour; decide scope.
- Evidence: engine.rs:79-90; lib.rs:489-490; claude_parity.rs:1435

## GAP-F060-03-03

**Step-limit pause is built but not connected.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md)
- Detail: Affects: Cloud Work users hitting 100 steps. Work needed: Provide the hook and a UI decision that raises maxSteps.
- Evidence: onStepBudgetCheckpoint only in tool-loop.ts:846,7910,7947

## GAP-F060-03-04

**Plan steps are marked completed at the end of a turn regardless of outcome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md)
- Detail: Affects: All Work surfaces. Work needed: Tie completion to a checked condition.
- Evidence: tool-loop.ts:5217-5227

## GAP-F060-03-05

**VS Code is listed as missing in the brief and the code agrees; CLI status in the brief is correct only for the local agent.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md)
- Detail: Affects: Reporting. Work needed: Keep the brief precise.
- Evidence: No budget fields found in apps/extension-vscode/src

## GAP-F060-03-NOTBUILT

**Spend, time and completion limits: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F060-03](../../20-features/060-agentic-work-product/F060-03-spend-time-and-completion-limits.md)
- Requirement items: S60.10, S60.11, S60.12
- Detail: Web: S60.10, S60.11, S60.12; Desktop: S60.10, S60.11, S60.12; Mobile: S60.10, S60.11, S60.12; CLI: S60.11, S60.12; VS Code: S60.10, S60.11, S60.12; Chrome: S60.10, S60.11, S60.12

## GAP-F060-04-01

**Cancel and review are client-side; the server has no record of a rejected plan.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-04](../../20-features/060-agentic-work-product/F060-04-review-the-plan-before-it-acts.md)
- Detail: Affects: All surfaces. Work needed: Write a decision to the durable plan tables and the journal.
- Evidence: WebChatPage.tsx:6312-6320

## GAP-F060-04-02

**Mobile New task sheet skips review.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-04](../../20-features/060-agentic-work-product/F060-04-review-the-plan-before-it-acts.md)
- Detail: Affects: Mobile. Work needed: Send the flag and render the card.
- Evidence: chatExecutionStore.ts:3451

## GAP-F060-04-03

**Brief says VS Code and the CLI are done; neither terminal UI nor VS Code shows a plan review.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-04](../../20-features/060-agentic-work-product/F060-04-review-the-plan-before-it-acts.md)
- Detail: Affects: CLI, VS Code. Work needed: Correct the brief or build it.
- Evidence: No plan review component found in apps/extension-vscode/src; docs list N/A for Work

## GAP-F060-04-04

**Durable plan tables not used for steps or edits.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-04](../../20-features/060-agentic-work-product/F060-04-review-the-plan-before-it-acts.md)
- Detail: Affects: Resume on another device, audit. Work needed: Write steps and revisions; read them for display.
- Evidence: work-plan-steps.ts:29-36

## GAP-F060-04-05

**The review flag is sent for every Work message, even follow-ups in a running Work chat.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-04](../../20-features/060-agentic-work-product/F060-04-review-the-plan-before-it-acts.md)
- Detail: Affects: Web, Chrome users. Work needed: Decide whether follow-ups need review.
- Evidence: useChatStream.ts:4669-4670

## GAP-F060-04-NOTBUILT

**Review the plan before it acts: not built on VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code
- Features: [F060-04](../../20-features/060-agentic-work-product/F060-04-review-the-plan-before-it-acts.md)
- Requirement items: S60.13
- Detail: VS Code: S60.13

## GAP-F060-05-01

**Dependency display and storage are not connected.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md)
- Detail: Affects: All apps. Work needed: Write steps with dependencies; render them.
- Evidence: No writer of work_plan_steps outside tests (work-plan-steps.ts only opens the plan)

## GAP-F060-05-02

**Step status is inferred from model text and from end-of-turn completion, not from verified outcomes.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md)
- Detail: Affects: All apps. Work needed: Tie status to tool results or explicit step tools.
- Evidence: agiwork-plan.ts:207-216; tool-loop.ts:5217-5227

## GAP-F060-05-03

**No parallel indicator on mobile, VS Code, Chrome.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md)
- Detail: Affects: Those apps. Work needed: Carry parallel_group into the run view.
- Evidence: CloudRunDetailSheet.tsx has no grouping; cloudRunDetail.ts lists flat progress

## GAP-F060-05-04

**Brief evidence lines for running step and parallel (tool-loop 4157, 4557, windowPolicy.ts:86) do not point at that code any more.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md)
- Detail: Affects: Engineers. Work needed: Update the brief.
- Evidence: windowPolicy.ts:70-110 is link policy

## GAP-F060-05-05

**CLI and Chrome step lists were not verified as Cloud Work views.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md)
- Detail: Affects: CLI, Chrome. Work needed: Trace and test.
- Evidence: Not traced

## GAP-F060-05-NOTBUILT

**Follow progress: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md)
- Requirement items: S60.15, S60.17
- Detail: Web: S60.15; Desktop: S60.15; Mobile: S60.15, S60.17; CLI: S60.15; VS Code: S60.15, S60.17; Chrome: S60.15, S60.17

## GAP-F060-05-PARTLY

**Follow progress: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F060-05](../../20-features/060-agentic-work-product/F060-05-follow-progress.md)
- Requirement items: S60.14, S60.16

## GAP-F060-06-01

**Clarify is probably not offered on the desktop surface.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md)
- Detail: Affects: Desktop. Work needed: Add desktop to the offer list or confirm by running; update the brief.
- Evidence: request-processor.ts:1279 allows web, mobile, chrome; host-headers.ts:38-54 sends desktop

## GAP-F060-06-02

**Web Tasks page cannot answer connector input requests.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md)
- Detail: Affects: Web, desktop. Work needed: Add the form to the Tasks detail.
- Evidence: No pendingInput use in packages/ui/unified-chat or apps/web/features; mobile has CloudRunInputForm

## GAP-F060-06-03

**Approval prompts may never appear on cloud accounts whose stored default is autonomous.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md)
- Detail: Affects: New cloud accounts. Work needed: Product check against the approval-prompt requirement in docs/product/requirements.md:768-780.
- Evidence: toolApprovalPolicy.ts:29-30, 45-52

## GAP-F060-06-04

**Approval cards do not state the consequence as AGENTS.md section 9 requires; not verified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md)
- Detail: Affects: All. Work needed: Review card text.
- Evidence: Card labels are generic (TasksPage.tsx:889-899)

## GAP-F060-06-05

**VS Code has no clarify; Chrome approval and CLI Cloud approvals unverified.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md)
- Detail: Affects: VS Code, Chrome, CLI. Work needed: Trace and test.
- Evidence: Brief; no clarify code in apps/extension-vscode/src found

## GAP-F060-06-06

**The draft claim that clarify uses the paused-run resume route is wrong: that route is the pause resume.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md)
- Detail: Affects: Documentation. Work needed: Use the three mechanisms in this page.
- Evidence: runs/[runId]/resume/route.ts imports PausedRunResumeRequestSchema (line 11)

## GAP-F060-06-NOTBUILT

**Answer questions and approvals: not built on VS Code**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: VS Code
- Features: [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md)
- Requirement items: S60.18
- Detail: VS Code: S60.18

## GAP-F060-06-PARTLY

**Answer questions and approvals: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F060-06](../../20-features/060-agentic-work-product/F060-06-answer-questions-and-approvals.md)
- Requirement items: S60.19

## GAP-F060-07-01

**Pause is missing on VS Code, Chrome and the CLI, and is limited on mobile (running only, no guidance on resume).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Detail: Affects: VS Code, Chrome, CLI users; mobile users. Work needed: Add pause and resume actions to VS Code and Chrome; accept guidance on mobile resume.
- Evidence: cloudRunDetail.ts:35-38; CloudRunDetailSheet.tsx:588-606; service.ts:89-91

## GAP-F060-07-02

**S60.22 says paused or stopped runs can resume, but a stopped run cannot be resumed by design.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Detail: Affects: All apps. Work needed: Decide the requirement; update the brief or build resume-after-stop.
- Evidence: cloud-agent-run-service.ts:3195; mobile and Chrome confirmation texts say it cannot be resumed

## GAP-F060-07-03

**Stop on web and the Tauri desktop build has no confirmation, though it is irreversible.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Detail: Affects: Web, desktop. Work needed: Use the shared confirmation surface before cancelRun.
- Evidence: TasksPage.tsx:826; AGENTS.md section 9

## GAP-F060-07-04

**The inline completions path has no pause reader, so a pause request there may never land.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Detail: Affects: Runs on that path (which ones is unknown). Work needed: Trace which runs use it; refuse pause there or pass the pause reader and checkpoint saver.
- Evidence: route.ts:1088-1095 vs tool-loop.ts:6702

## GAP-F060-07-05

**A queued steer cannot be taken back while the task is live, and the UI does not say so.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Detail: Affects: Web, mobile. Work needed: Explain in the UI or allow withdrawal before the executor takes it.
- Evidence: cloud-agent-run-service.ts:2899; TaskSteerSection.tsx:81-99

## GAP-F060-07-06

**Chrome has no steer; the CLI queue is a next prompt, not a mid-run steer; the brief marks CLI and VS Code resume as done but neither resumes a cloud run.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Detail: Affects: Chrome, CLI, VS Code. Work needed: Correct the brief; build or consciously drop each control per app.
- Evidence: tasksSheet.ts; tui_app.rs:7274-7275; cloudRunDetail.ts:35-38

## GAP-F060-07-NOTBUILT

**Steer, pause, resume and stop: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Requirement items: S60.21, S60.22
- Detail: Mobile: S60.21, S60.22; CLI: S60.21; VS Code: S60.21; Chrome: S60.21, S60.22

## GAP-F060-07-PARTLY

**Steer, pause, resume and stop: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Requirement items: S60.20, S60.23

## GAP-F060-08-01

**Retry is a new turn, not a resume of the failed step in the same run.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-08](../../20-features/060-agentic-work-product/F060-08-retry-restart-and-duplicate.md)
- Detail: Affects: Web users. Work needed: Decide if the requirement means checkpoint resume; if so build it on the run checkpoint.
- Evidence: WebChatPage.tsx:6363-6378

## GAP-F060-08-02

**Retry step is missing on mobile, VS Code, CLI, Chrome and, as far as traced, the Tauri chat.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-08](../../20-features/060-agentic-work-product/F060-08-retry-restart-and-duplicate.md)
- Detail: Affects: Those apps. Work needed: Add a retry control or record the intended gap.
- Evidence: No retry-step control found in those apps.

## GAP-F060-08-03

**No separate Restart and Duplicate; no one-click restart.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-08](../../20-features/060-agentic-work-product/F060-08-retry-restart-and-duplicate.md)
- Detail: Affects: Web, desktop, mobile. Work needed: Clarify the requirement against the shipped 'Re-run this task' draft flow.
- Evidence: TaskDetailPanel.tsx:579

## GAP-F060-08-04

**Tauri drops excluded tools; mobile drops constraints and deliverable on re-run.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-08](../../20-features/060-agentic-work-product/F060-08-retry-restart-and-duplicate.md)
- Detail: Affects: Desktop (Tauri), mobile. Work needed: Carry the full goal object through each transport.
- Evidence: DesktopTasks.tsx:25-32; taskActions.ts:19-47

## GAP-F060-08-05

**The brief's VS Code and CLI 'restart' and 'duplicate' citations point at chat retry, code review retry and local session fork, not cloud task restart.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-08](../../20-features/060-agentic-work-product/F060-08-retry-restart-and-duplicate.md)
- Detail: Affects: VS Code, CLI. Work needed: Correct the brief or build task-level restart in those apps.
- Evidence: retry.ts:38-53; commandSetup.ts:1210-1218; registry.rs:1381-1426

## GAP-F060-08-06

**The brief cites tool-loop.ts:4744 for retry; that line is unrelated search retry code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-08](../../20-features/060-agentic-work-product/F060-08-retry-restart-and-duplicate.md)
- Detail: Affects: Documentation. Work needed: Update the brief rows.
- Evidence: tool-loop.ts:4745-4752

## GAP-F060-08-NOTBUILT

**Retry, restart and duplicate: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F060-08](../../20-features/060-agentic-work-product/F060-08-retry-restart-and-duplicate.md)
- Requirement items: S60.24, S60.25, S60.26
- Detail: CLI: S60.24, S60.25; VS Code: S60.24, S60.25, S60.26; Chrome: S60.24, S60.25, S60.26

## GAP-F060-09-01

**The brief says Save as routine is missing on every app; the code has it on web and mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-09](../../20-features/060-agentic-work-product/F060-09-save-a-task-as-a-routine-or-a-skill.md)
- Detail: Affects: Documentation, web, mobile. Work needed: Update the brief rows S60.27.
- Evidence: apps/web/features/tasks/components/TasksPage.tsx:72-74; CloudRunDetailSheet.tsx:627

## GAP-F060-09-02

**Save as Skill by user action does not exist anywhere.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-09](../../20-features/060-agentic-work-product/F060-09-save-a-task-as-a-routine-or-a-skill.md)
- Detail: Affects: All apps. Work needed: Design and build 'Save as skill' from a finished task.
- Evidence: No control found; CLI only auto-learns (agent/chat.rs:1557-1592)

## GAP-F060-09-03

**Routine prompt is incomplete: excluded tools dropped (web); 200-character preview (mobile).**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-09](../../20-features/060-agentic-work-product/F060-09-save-a-task-as-a-routine-or-a-skill.md)
- Detail: Affects: Web, mobile. Work needed: Build the routine from the full goal object.
- Evidence: schedule-form.ts:196-204; runPresentation.ts:379

## GAP-F060-09-04

**No routine control on Tauri desktop, VS Code, Chrome, CLI.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-09](../../20-features/060-agentic-work-product/F060-09-save-a-task-as-a-routine-or-a-skill.md)
- Detail: Affects: Those apps. Work needed: Add or record as not applicable.
- Evidence: DesktopTasks.tsx:16-41

## GAP-F060-09-05

**CLI skill learning treats every session as successful and is not tied to a task the person chose.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-09](../../20-features/060-agentic-work-product/F060-09-save-a-task-as-a-routine-or-a-skill.md)
- Detail: Affects: CLI. Work needed: Use the real outcome and let the person confirm or reject a learned skill.
- Evidence: agent/chat.rs:1575-1579

## GAP-F060-09-06

**Goal text travels in a URL query on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-09](../../20-features/060-agentic-work-product/F060-09-save-a-task-as-a-routine-or-a-skill.md)
- Detail: Affects: Web. Work needed: Consider handing the draft through state instead of the address.
- Evidence: schedule-from-turn.ts:21-23

## GAP-F060-09-NOTBUILT

**Save a task as a routine or a skill: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F060-09](../../20-features/060-agentic-work-product/F060-09-save-a-task-as-a-routine-or-a-skill.md)
- Requirement items: S60.27, S60.28
- Detail: CLI: S60.27; VS Code: S60.27, S60.28; Chrome: S60.27, S60.28

## GAP-F060-10-01

**Remaining steps are not listed on mobile and VS Code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-10](../../20-features/060-agentic-work-product/F060-10-results-deliverables-and-partial-outcome.md)
- Detail: Affects: Mobile, VS Code. Work needed: List the unfinished steps like web.
- Evidence: CloudRunDetailSheet.tsx:536; cloudRunPresentation.ts:199-201

## GAP-F060-10-02

**No result, files or partial summary on Chrome; CLI has no partial-outcome summary.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-10](../../20-features/060-agentic-work-product/F060-10-results-deliverables-and-partial-outcome.md)
- Detail: Affects: Chrome, CLI. Work needed: Add or deliberately route to the web task.
- Evidence: tasksSheet.ts:70-87; tui_app.rs:8655-8660

## GAP-F060-10-03

**VS Code outputs are per conversation, not per run.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-10](../../20-features/060-agentic-work-product/F060-10-results-deliverables-and-partial-outcome.md)
- Detail: Affects: VS Code. Work needed: Filter by artifacts produced in this run.
- Evidence: cloudRunDetail.ts:57-68

## GAP-F060-10-04

**Result is truncated at 4,000 characters on web.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-10](../../20-features/060-agentic-work-product/F060-10-results-deliverables-and-partial-outcome.md)
- Detail: Affects: Web, Tauri desktop. Work needed: Offer full text or link to the source chat in the section.
- Evidence: task-display.ts:131,146

## GAP-F060-10-05

**Brief citations for partial outcome and files are stale.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-10](../../20-features/060-agentic-work-product/F060-10-results-deliverables-and-partial-outcome.md)
- Detail: Affects: Documentation. Work needed: Update S60.30 and S60.31 rows.
- Evidence: tool-loop.ts:3997 is schema code; files route line 71 is range parsing

## GAP-F060-10-06

**Old outputs with non-/api/files uris cannot be downloaded.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-10](../../20-features/060-agentic-work-product/F060-10-results-deliverables-and-partial-outcome.md)
- Detail: Affects: Web. Work needed: Backfill or map historic uris.
- Evidence: TaskDetailPanel.tsx:228-230,327-330

## GAP-F060-10-NOTBUILT

**Results, deliverables and partial outcome: not built on CLI**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI
- Features: [F060-10](../../20-features/060-agentic-work-product/F060-10-results-deliverables-and-partial-outcome.md)
- Requirement items: S60.31
- Detail: CLI: S60.31

## GAP-F060-10-PARTLY

**Results, deliverables and partial outcome: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F060-10](../../20-features/060-agentic-work-product/F060-10-results-deliverables-and-partial-outcome.md)
- Requirement items: S60.29, S60.30, S60.31

## GAP-F060-11-01

**Sharing exists on web and mobile but not on Board layout, Tauri desktop, VS Code, Chrome or CLI, and it shares the chat rather than a plan, steps and results view.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-11](../../20-features/060-agentic-work-product/F060-11-task-list-history-sharing-and-handoff.md)
- Detail: Affects: All apps except web list layout and mobile. Work needed: Decide the requirement; add share to the missing apps or the Board.
- Evidence: TasksPage.tsx:650-675; DesktopTasks.tsx:16-41; WebChatPage.tsx:1686-1694

## GAP-F060-11-02

**Brief says mobile sharing is missing; code has 'Share task' on mobile.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-11](../../20-features/060-agentic-work-product/F060-11-task-list-history-sharing-and-handoff.md)
- Detail: Affects: Documentation. Work needed: Update S60.33.
- Evidence: CloudRunDetailSheet.tsx:618; taskActions.ts:49-65

## GAP-F060-11-03

**The user cannot rename a task on web, desktop or mobile Tasks pages; VS Code can.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-11](../../20-features/060-agentic-work-product/F060-11-task-list-history-sharing-and-handoff.md)
- Detail: Affects: Web, desktop, mobile. Work needed: Add rename to the shared page and mobile detail.
- Evidence: cloudRunDetail.ts:182-188; no rename in TasksPage.tsx

## GAP-F060-11-04

**VS Code and Chrome list only active states, so history of finished tasks is missing there.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-11](../../20-features/060-agentic-work-product/F060-11-task-list-history-sharing-and-handoff.md)
- Detail: Affects: VS Code, Chrome. Work needed: Pass all or finished states and add filters.
- Evidence: cloudTasksTree.ts:146; managedRunControl.ts:528; runs/route.ts:34-40

## GAP-F060-11-05

**CLI has no cloud task list in its terminal UI; '/history' is local-only. The brief's CLI citations (tui_app.rs:3545, lib.rs:829, 3372) point at other code.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-11](../../20-features/060-agentic-work-product/F060-11-task-list-history-sharing-and-handoff.md)
- Detail: Affects: CLI. Work needed: Expose cloud/run/list in a CLI command or mark not applicable.
- Evidence: registry.rs:306-330; tui_app.rs:3545-3600 is footer drawing

## GAP-F060-11-06

**Desktop Tauri lacks archive, share and routine; behaviour differs from the Electron app that shows the web page.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-11](../../20-features/060-agentic-work-product/F060-11-task-list-history-sharing-and-handoff.md)
- Detail: Affects: Desktop (Tauri build). Work needed: Wire the missing transport methods or retire the build's panel.
- Evidence: DesktopTasks.tsx:16-41

## GAP-F060-11-07

**Chrome is marked unverified in the brief for list and handoff; the sheet exists but title, history and cross-device are partly covered.**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F060-11](../../20-features/060-agentic-work-product/F060-11-task-list-history-sharing-and-handoff.md)
- Detail: Affects: Chrome. Work needed: Verify against the brief and update rows.
- Evidence: tasksSheet.ts; tasks-sheet.test.ts

## GAP-F060-11-NOTBUILT

**Task list, history, sharing and handoff: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F060-11](../../20-features/060-agentic-work-product/F060-11-task-list-history-sharing-and-handoff.md)
- Requirement items: S60.33
- Detail: Mobile: S60.33; CLI: S60.33; VS Code: S60.33; Chrome: S60.33

## GAP-F060-11-PARTLY

**Task list, history, sharing and handoff: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F060-11](../../20-features/060-agentic-work-product/F060-11-task-list-history-sharing-and-handoff.md)
- Requirement items: S60.02, S60.32, S60.34
