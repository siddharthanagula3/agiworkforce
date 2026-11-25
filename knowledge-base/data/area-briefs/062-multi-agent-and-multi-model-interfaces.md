# Area 62. Multi-agent and multi-model interfaces

28 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S62.01 Parent task.
- Should: A parent task visibly owns child agents it spawned, and the user can see that relationship.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/tui/tui_app.rs:5143; apps/cli/src/repl/registry.rs:419

## S62.02 Child-agent list.
- Should: The user sees a list of the child agents working under a task.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/tui/tui_app.rs:5143; apps/cli/src/repl/registry.rs:419

## S62.03 Role labels.
- Should: Each child agent is labelled with its role.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/subagent.rs:556

## S62.04 Model labels.
- Should: Each participating agent or model is labelled with the model it runs on.
- Status: web missing, desktop missing, mobile done, cli done, vscode missing, chrome missing
- Code: apps/mobile/src/features/compare/index.tsx:468; apps/mobile/src/features/compare/index.tsx:415; apps/mobile/src/features/compare/index.tsx:191; apps/cli/src/subagent.rs:80

## S62.05 Per-agent status.
- Should: The view shows the live status of each participating agent or model.
- Status: web missing, desktop missing, mobile done, cli done, vscode missing, chrome missing
- Code: apps/mobile/src/features/compare/index.tsx:558; apps/mobile/src/features/compare/index.tsx:415; apps/mobile/src/features/compare/index.tsx:191; apps/cli/src/tui/tui_app.rs:5143; apps/cli/src/repl/registry.rs:419

## S62.06 Per-agent transcript.
- Should: The user can read each participating agent's own transcript.
- Status: web missing, desktop missing, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/mobile/src/features/compare/index.tsx:558; apps/mobile/src/features/compare/index.tsx:191

## S62.07 Per-agent result.
- Should: Each participating agent's result is shown separately.
- Status: web missing, desktop missing, mobile done, cli done, vscode missing, chrome missing
- Code: apps/mobile/src/features/compare/index.tsx:558; apps/mobile/src/features/compare/index.tsx:247; apps/cli/src/tui/tui_app.rs:5221; apps/cli/src/repl/registry.rs:419

## S62.08 Per-agent usage.
- Should: The user sees usage or cost per participating agent or model.
- Status: web missing, desktop missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/subagent.rs:80

## S62.09 Concurrent task view.
- Should: The user can watch several running tasks or agents at once in one view.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:59; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:199; apps/web/app/api/llm/v1/chat/completions/runs/route.ts:120; apps/mobile/src/features/tasks/CloudTasksScreen.tsx:452; apps/mobile/src/features/tasks/service.ts:29; apps/cli/src/tui/tui_app.rs:5143; apps/cli/src/repl/registry.rs:419; apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:101

## S62.10 Needs-input prioritization.
- Should: Tasks or agents that need the user's input are surfaced first.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome unverified
- Code: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:71; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:203; apps/mobile/src/features/tasks/runPresentation.ts:17; apps/mobile/src/features/tasks/CloudTasksScreen.tsx:452; apps/mobile/src/features/tasks/service.ts:29; apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:27; apps/extension-vscode/src/features/cloud-tasks/cloudTasksTree.ts:110

## S62.11 Inline unblock response.
- Should: The user can unblock a waiting task or agent inline without leaving the overview.
- Status: web done, desktop done, mobile done, cli done, vscode done, chrome unverified
- Code: packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:727; packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:396; apps/web/app/api/llm/v1/chat/completions/runs/[runId]/resume/route.ts:121; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:219; apps/mobile/src/features/tasks/service.ts:45; apps/cli/src/tui/widgets/approval_overlay.rs:157; apps/cli/src/tui/tui_app.rs:5056; apps/extension-vscode/src/core/commandSetup.ts:2208

## S62.12 Full-transcript drill-down.
- Should: From an overview the user can drill into the full transcript of a task.
- Status: web done, desktop done, mobile done, cli done, chrome unverified
- Code: packages/ui/unified-chat/src/components/tasks/TaskDetailPanel.tsx:623; apps/web/features/tasks/components/TasksPage.tsx:36; apps/mobile/src/features/tasks/components/CloudRunDetailSheet.tsx:334; apps/mobile/src/features/tasks/CloudTasksScreen.tsx:417; apps/cli/src/tui/tui_app.rs:3550; apps/cli/src/tui/tui_app.rs:2674

## S62.13 Shared-workspace versus isolated-workspace indicator.
- Should: The view shows whether agents share one workspace or work in isolated ones.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S62.14 Agent handoff.
- Should: Work can be handed from one agent to another, and the receiving agent continues it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode done, chrome missing
- Code: apps/extension-vscode/src/features/cloud-tasks/cloudCodeSessions.ts:213

## S62.15 Summary-only handoff.
- Should: A handoff can pass only a summary, not the full history, and the user can see that.
- Status: web missing, desktop missing, mobile missing, vscode missing, chrome missing

## S62.16 Background fork.
- Should: The user can fork a side task that runs in the background without disturbing the main one.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/tui/tui_app.rs:5113

## S62.17 Interactive branch.
- Should: The user can branch the conversation from a point and continue interactively in the branch.
- Status: web done, desktop done, mobile missing, cli done, vscode done, chrome missing
- Code: apps/web/features/chat/components/messages/MessageBubble.tsx:2994; apps/web/features/chat/pages/WebChatPage.tsx:5736; apps/web/features/chat/hooks/use-conversation-branches.ts:105; apps/cli/src/tui/tui_app.rs:3562; apps/cli/src/repl/registry.rs:932; apps/extension-vscode/src/core/commandSetup.ts:1210; apps/extension-vscode/src/core/commandSetup.ts:1219

## S62.18 Advisor consultation.
- Should: The user or agent can consult an advisor model on a side question and see its answer.
- Status: web missing, desktop missing, mobile missing, cli done, vscode missing, chrome missing
- Code: apps/cli/src/tui/tui_app.rs:4036; apps/cli/src/tui/tui_app.rs:4769

## S62.19 Model-comparison view.
- Should: The user can open a view that runs one prompt on several models side by side.
- Status: web missing, desktop missing, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/mobile/src/features/chat/components/ChatInput.tsx:635; apps/mobile/src/features/compare/index.tsx:415; apps/mobile/src/features/compare/index.tsx:191

## S62.20 Independent parallel answers.
- Should: Each model answers the same prompt independently and in parallel.
- Status: web missing, desktop missing, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/mobile/src/features/compare/index.tsx:415; apps/mobile/src/features/compare/index.tsx:191; apps/mobile/src/features/compare/index.tsx:247

## S62.21 Synthesis answer.
- Should: After parallel answers, the product produces one synthesized answer.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S62.22 Agreement and disagreement display.
- Should: The comparison highlights where models agree and disagree.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S62.23 Unique findings per model.
- Should: The comparison lists findings unique to each model.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S62.24 Combined-source inspection.
- Should: The user can inspect the combined sources all participants used.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S62.25 Comparison-cost estimate.
- Should: Before running a comparison the user sees its estimated cost.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S62.26 Selected model set.
- Should: The user chooses which set of models takes part in the comparison.
- Status: web missing, desktop missing, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/mobile/src/features/compare/index.tsx:468; apps/mobile/src/features/compare/index.tsx:303

## S62.27 Rerun one participant.
- Should: The user can rerun a single participant without rerunning the whole comparison.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S62.28 Save comparison.
- Should: The user can save a comparison and reopen it later.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing
