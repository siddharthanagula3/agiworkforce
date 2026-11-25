# Area 60. Agentic work product

34 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S60.01 Work-task composer.
- Should: The user can open a dedicated entry to describe and start an agentic work task (not a plain chat turn) and it starts a real agent run.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4562; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:877; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2983; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:774; apps/mobile/src/features/tasks/CloudTasksScreen.tsx:93; apps/mobile/src/features/tasks/components/StartWorkSheet.tsx:116; apps/mobile/src/features/tasks/CloudTasksScreen.tsx:395; apps/mobile/src/features/tasks/startWork.ts:38

## S60.02 Task title.
- Should: Each work task shows a readable title in the task list, and the user can set or change it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:566; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:421; apps/web/app/api/llm/v1/chat/completions/runs/route.ts:120; apps/mobile/src/features/tasks/components/CloudRunCard.tsx:57; apps/mobile/src/features/tasks/startWork.ts:27; apps/mobile/src/features/tasks/CloudTasksScreen.tsx:395; apps/cli/src/tui/tui_app.rs:3574; apps/cli/src/lib.rs:309

## S60.03 Objective.
- Should: The user states the objective of the task, and the objective is stored with the run and shown back.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2983; apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts:16; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:469; apps/mobile/src/features/tasks/components/StartWorkSheet.tsx:116; apps/mobile/src/features/tasks/startWork.ts:38; apps/cli/src/tui/tui_app.rs:2471; apps/cli/src/tui/tui_app.rs:5056; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3937

## S60.04 Deliverable selection.
- Should: The user can specify what deliverable the task should produce (e.g. a report or file) and the run receives it.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5529; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2983; apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts:16; apps/mobile/src/features/tasks/components/StartWorkSheet.tsx:149; apps/mobile/src/features/tasks/startWork.ts:38

## S60.05 Source selection.
- Should: While composing a task the user can choose which sources it may use (project, files, connectors).
- Status: web done, desktop done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2195; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5266; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2975; apps/cli/src/tui/widgets/mention_popup.rs:17; apps/cli/src/mentions.rs:251; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4963; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1258

## S60.06 Tool selection.
- Should: The user can choose which tools the task may use before it runs.
- Status: web done, desktop done, mobile missing, cli done, vscode done, chrome missing
- Code: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:820; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:822; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:5586; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6113; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1107; apps/desktop/electron/windowPolicy.ts:86; apps/cli/src/lib.rs:392; apps/cli/src/lib.rs:3158

## S60.07 Execution-location selection.
- Should: The user can choose where the task executes (cloud sandbox versus this computer or another device).
- Status: web missing, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerPlusMenu.tsx:1062; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4921; apps/web/lib/device-steps/host-headers.ts:40; apps/web/lib/hooks/useChatStream.ts:3707

## S60.08 Model/profile selection.
- Should: The user can pick the model (or profile) the task runs on, and the run records it.
- Status: web done, desktop done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4964; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:584; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2983; apps/cli/src/tui/tui_app.rs:3259; apps/cli/src/tui/tui_app.rs:3267; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:4539; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1210

## S60.09 Effort selection.
- Should: The user can set reasoning effort for the task and it is sent with the run.
- Status: web done, desktop done, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/Composer/ComposerFooter.tsx:1626; apps/web/lib/hooks/useChatStream.ts:3466; apps/cli/src/tui/tui_app.rs:3871; apps/cli/src/tui/tui_app.rs:5032; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3555; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:1049

## S60.10 Spend budget.
- Should: The user can cap how much a task may spend, and the run stops at the cap.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/claude_parity.rs:1005

## S60.11 Time budget.
- Should: The user can set how long a task may run, and the run stops when time is up.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S60.12 Completion condition.
- Should: The user can state an explicit completion condition that the agent checks before it finishes.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S60.13 Reviewable task plan.
- Should: Before the agent acts, the user sees its plan and can approve, edit or reject it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4789; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4744; apps/web/lib/hooks/useChatStream.ts:3773; apps/web/features/chat/components/work-session/AgiWorkPlanReview.tsx:90; apps/web/features/chat/pages/WebChatPage.tsx:4974; apps/mobile/src/features/chat/components/MessageBubble.tsx:1184; apps/mobile/stores/chat/chatExecutionStore.ts:3826; apps/cli/src/app_server/developer_host.rs:3566

## S60.14 Step list.
- Should: The task view lists its steps with an accurate per-step status.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: packages/ui/unified-chat/src/components/AgentActivityTimeline.tsx:934; apps/mobile/src/features/tasks/runPresentation.ts:290; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:318; apps/cli/src/tui/tui_app.rs:3693; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5091; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5576; apps/extension-vscode/src/features/sidebar-webview/ChatStateManager.ts:2830

## S60.15 Dependency display.
- Should: The task view shows which steps depend on which.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S60.16 Running-step indicator.
- Should: While a task runs, the view marks which step is currently executing.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4719; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:5295; apps/web/app/api/llm/v1/chat/completions/lib/agiwork-plan.ts:194; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:318; apps/cli/src/tui/transcript_cell.rs:30; apps/cli/src/tui/tui_app.rs:5123; apps/cli/src/tui/tui_app.rs:5056; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:5576

## S60.17 Parallel-work indicator.
- Should: When the agent works on several things at once, the view shows the parallel work.
- Status: web done, desktop done, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4157; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:990; apps/web/lib/hooks/useChatStream.ts:2878; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4557; apps/web/features/chat/components/messages/ToolTimeline.tsx:773; apps/desktop/electron/windowPolicy.ts:86; apps/cli/src/tui/tui_app.rs:1915

## S60.18 Clarification request.
- Should: The agent can pause a task to ask the user a clarifying question and continue with the answer.
- Status: web done, desktop done, mobile done, cli done, vscode missing, chrome done
- Code: apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:759; apps/web/lib/services/clarify-tool-service.ts:56; apps/web/lib/services/clarify-tool-service.ts:55; apps/desktop/electron/windowPolicy.ts:86; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:270; apps/mobile/src/features/tasks/store.ts:282; packages/contracts/cloud-contracts/src/managed-cloud-agent-runs-client.ts:414; apps/web/app/api/llm/v1/chat/completions/resume-input/route.ts:457

## S60.19 Approval request.
- Should: When the agent needs permission for an action, the task pauses and the user can approve or deny it.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:727; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:396; apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts:121; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:219; apps/mobile/src/features/tasks/service.ts:45; apps/cli/src/tui/widgets/approval_overlay.rs:157; apps/cli/src/tui/approval_broker.rs:22; apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:105

## S60.20 Task steering.
- Should: The user can redirect a running task with new guidance without starting over.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: packages/ui/unified-chat/src/components/tasks/TaskSteerSection.tsx:83; packages/ui/unified-chat/src/components/tasks/TaskSteerSection.tsx:93; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:399; apps/web/features/tasks/components/TasksPage.tsx:48; apps/web/app/api/llm/v1/chat/completions/runs/[runId]/steer/[steerId]/route.ts:68; apps/web/lib/services/cloud-agent-run-service.ts:2419; apps/mobile/src/features/tasks/components/CloudRunSteerSection.tsx:13; apps/mobile/src/features/tasks/components/CloudRunSteerSection.tsx:30

## S60.21 Pause.
- Should: The user can pause a running task at a step boundary and it keeps its work.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:619; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:311; apps/web/app/api/llm/v1/chat/completions/runs/[runId]/pause/route.ts:29

## S60.22 Resume.
- Should: The user can resume a paused or stopped task from where it left off.
- Status: web done, desktop done, mobile missing, cli done, vscode done, chrome missing
- Code: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:636; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:328; apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts:121; apps/cli/src/tui/tui_app.rs:3550; apps/cli/src/lib.rs:3372

## S60.23 Cancel.
- Should: The user can stop a running task and the run is cancelled on the server.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:653; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:280; apps/web/app/api/llm/v1/chat/completions/runs/[runId]/route.ts:70; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:342; apps/mobile/src/features/tasks/service.ts:58; apps/cli/src/tui/tui_app.rs:5123; apps/cli/src/tui/tui_app.rs:5133; apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:117

## S60.24 Retry failed step.
- Should: After a step fails, the user can retry just that step and the task continues.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/work-session/AgiWorkPlanReview.tsx:64; apps/web/features/chat/pages/WebChatPage.tsx:5001; apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:4744

## S60.25 Restart task.
- Should: The user can restart a finished task with the same inputs.
- Status: web done, desktop done, mobile missing, cli missing, vscode done, chrome missing
- Code: apps/web/features/tasks/components/TasksPage.tsx:52; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:950; apps/desktop/src/features/tasks/DesktopTasks.tsx:24; apps/desktop/src/features/v3/DesktopShellV3.tsx:751; apps/extension-vscode/src/features/chat/retry.ts:55; apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:3428

## S60.26 Duplicate task.
- Should: The user can duplicate a task into a new editable task.
- Status: web done, desktop done, mobile missing, cli done, vscode done, chrome missing
- Code: apps/web/features/tasks/components/TasksPage.tsx:52; apps/desktop/src/features/tasks/DesktopTasks.tsx:24; apps/cli/src/tui/tui_app.rs:3562; apps/cli/src/repl/registry.rs:932; apps/extension-vscode/src/core/commandSetup.ts:1210; apps/extension-vscode/src/core/commandSetup.ts:1219

## S60.27 Save as routine.
- Should: From a task the user can save it as a routine/schedule that reruns it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S60.28 Save as Skill.
- Should: From a finished task the user can save its procedure as a reusable Skill.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/claude_parity.rs:255; apps/cli/src/claude_parity.rs:767

## S60.29 Results summary.
- Should: When a task ends the user sees a summary of the result.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:647; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:301; apps/mobile/src/features/tasks/runPresentation.ts:210; apps/cli/src/tui/tui_app.rs:2471; apps/cli/src/claude_parity.rs:225; apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:90; apps/extension-vscode/src/features/cloud-tasks/cloudRunPresentation.ts:187

## S60.30 Generated deliverables.
- Should: Files the task produced are listed and can be opened or downloaded.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: apps/web/app/api/files/[id]/route.ts:71; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:249; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:589; apps/web/features/chat/components/work-session/WorkSessionPanel.tsx:562; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:22; apps/cli/src/tui/tui_app.rs:3490; apps/cli/src/tui/tui_app.rs:5056; apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:90

## S60.31 Partial-outcome summary.
- Should: When a task stops short, the user sees what was done and what remains.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome unverified
- Code: apps/web/app/api/llm/v1/chat/completions/lib/tool-loop.ts:3997; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:603; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:343; apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:83; apps/extension-vscode/src/features/cloud-tasks/cloudRunPresentation.ts:195

## S60.32 Task history.
- Should: The user can browse past tasks with their state and open any of them.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:461; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:199; apps/web/app/api/llm/v1/chat/completions/runs/route.ts:120; apps/mobile/src/features/tasks/CloudTasksScreen.tsx:452; apps/mobile/src/features/tasks/service.ts:29; apps/cli/src/tui/tui_app.rs:3545; apps/cli/src/tui/tui_app.rs:2674; apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:101

## S60.33 Task sharing.
- Should: The user can share a task (its plan, steps and results) with someone else.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:774; apps/web/features/tasks/components/TasksPage.tsx:37; packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:777; packages/contracts/types/src/product-routes.ts:28

## S60.34 Cross-device task continuation.
- Should: A task started on one device can be followed and acted on from another device.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:199; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:135; apps/web/app/api/llm/v1/chat/completions/runs/route.ts:120; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:169; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:219; apps/mobile/src/features/tasks/service.ts:29; apps/cli/src/lib.rs:829; apps/cli/src/lib.rs:3372
