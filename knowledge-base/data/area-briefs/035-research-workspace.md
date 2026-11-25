# Area 35. Research workspace

34 items. Status words: done, partial, missing, unverified, n/a (does not apply to that app).

## S35.01 Research-task creation.
- Should: The user can start a Deep Research task from the product and it runs as a research run.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing, api done
- Code: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:4495; apps/web/lib/hooks/useChatStream.ts:3514; apps/web/app/api/llm/v1/chat/completions/route.ts:517; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:257; apps/mobile/stores/chat/chatExecutionStore.ts:1742; apps/web/public/openapi.json:708; apps/web/public/openapi.json:712; apps/web/public/openapi.json:740

## S35.02 Objective and deliverable selection.
- Should: Before a research run starts, the user states the objective and chooses the deliverable (e.g. summary vs full report, format).
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing, api done
- Code: apps/web/features/chat/components/research/ResearchPlan.tsx:185; apps/web/features/chat/pages/WebChatPage.tsx:4745; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1069; apps/web/public/openapi.json:740

## S35.03 Clarifying-question flow.
- Should: A research run asks the user clarifying questions (with answers the user can give) before searching.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S35.04 Editable research plan.
- Should: The research plan is shown before searching and the user can edit its steps (add/remove/reword) before approving.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing, api done
- Code: apps/web/features/chat/components/research/ResearchPlan.tsx:108; apps/web/features/chat/components/research/ResearchActivity.tsx:451; apps/web/features/chat/pages/WebChatPage.tsx:4711; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2023; apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:191; apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:236; apps/mobile/stores/chat/chatExecutionStore.ts:2236; apps/web/public/openapi.json:740

## S35.05 Source-selection panel.
- Should: A panel lets the user choose which sources (web, sites, files, connected apps) a research run may use.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing, api done
- Code: apps/web/features/chat/pages/WebChatPage.tsx:5037; apps/web/features/chat/components/research/ResearchActivity.tsx:634; apps/web/features/chat/pages/WebChatPage.tsx:5159; apps/web/lib/hooks/useChatStream.ts:3767; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:522; apps/web/public/openapi.json:712

## S35.06 Website restrictions.
- Should: The user can restrict a research run to (or away from) chosen websites, and the run respects it.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing, api done
- Code: apps/web/features/chat/components/research/ResearchActivity.tsx:146; apps/web/app/api/llm/v1/chat/completions/route.ts:538; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:637; apps/web/public/openapi.json:708; apps/web/public/openapi.json:712; apps/web/public/openapi.json:740

## S35.07 Uploaded source intake.
- Should: The user can add their own uploaded files as sources for a research run.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing, api done
- Code: apps/web/features/chat/components/research/ResearchActivity.tsx:148; apps/web/app/api/llm/v1/chat/completions/route.ts:542; apps/web/lib/services/research-file-source-service.ts:6; apps/web/public/openapi.json:708; apps/web/public/openapi.json:712; apps/web/public/openapi.json:740

## S35.08 Connected source intake.
- Should: The user can add connected work apps (Drive, Slack...) as sources for a research run.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing, api done
- Code: apps/web/app/api/llm/v1/chat/completions/route.ts:661; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2445; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2162; apps/web/lib/services/research-connector-source-service.ts:119; apps/web/lib/services/research-connector-source-service.ts:132; apps/web/app/api/llm/v1/chat/completions/lib/research-sources.ts:207; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2208; apps/web/public/openapi.json:752

## S35.09 Research-progress view.
- Should: While research runs, a progress view shows phase, counts (searches, sources) and elapsed time.
- Status: web done, desktop done, mobile done, cli missing
- Code: apps/web/features/chat/components/research/ResearchActivity.tsx:282; apps/web/features/chat/components/research/ResearchActivity.tsx:199; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1585; apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:194; apps/mobile/src/features/chat/utils/researchRunState.ts:251

## S35.10 Search activity timeline.
- Should: The run shows a timeline of the searches/steps it performs with their status.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/research/ResearchActivity.tsx:467; apps/web/features/chat/components/research/ResearchActivity.tsx:108; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2019; apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:59; apps/mobile/src/features/chat/components/MessageBubble.tsx:779; apps/mobile/stores/chat/chatExecutionStore.ts:1915

## S35.11 Visited-source list.
- Should: The user can see the list of sources the research visited/used.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/research/ResearchPanel.tsx:432; apps/web/features/chat/components/messages/MessageBubble.tsx:1739; apps/web/features/chat/components/research/ResearchReportView.tsx:658; apps/mobile/src/features/chat/components/research/ResearchSourcesAppendix.tsx:58; apps/mobile/src/features/chat/components/MessageBubble.tsx:267

## S35.12 Evidence collection.
- Should: The run gathers evidence (sources with excerpts) into a collection the report is built from and the user can inspect.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1378; apps/web/features/chat/components/research/ResearchReportView.tsx:658; apps/web/lib/services/research-report-service.ts:213; apps/mobile/src/features/chat/components/research/ResearchSourcesAppendix.tsx:58; apps/mobile/src/features/research/service.ts:116

## S35.13 Findings grouped by question.
- Should: The report or run view groups findings under each research question/plan step.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/research/ResearchReportView.tsx:714; apps/web/lib/services/research-report-service.ts:178; apps/mobile/src/features/chat/utils/researchRunState.ts:137; apps/mobile/src/features/chat/utils/researchRunState.ts:195; apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:301; apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:317

## S35.14 Contradictory-evidence display.
- Should: Where sources disagree, the research view shows the conflicting evidence side by side or flags it.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S35.15 Research steering.
- Should: While research runs, the user can steer it (add guidance, change focus) and the run adapts.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/research/ResearchActivity.tsx:437; apps/web/features/chat/components/research/ResearchActivity.tsx:501; apps/web/features/chat/pages/WebChatPage.tsx:4962; apps/web/features/chat/pages/WebChatPage.tsx:4983; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:549; apps/web/app/api/llm/v1/chat/completions/route.ts:466; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2141; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2248

## S35.16 Add sources while running.
- Should: The user can add sources to a research run that is already running.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S35.17 Pause and resume.
- Should: The user can pause a running research task and resume it later from where it stopped.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/research/ResearchActivity.tsx:447; apps/web/features/chat/pages/WebChatPage.tsx:4950; apps/web/app/api/llm/v1/chat/completions/route.ts:663; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2349; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1680; apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-research.ts:54; apps/web/lib/hooks/useChatStream.ts:2779; apps/web/features/chat/components/research/ResearchActivity.tsx:548

## S35.18 Cancel research.
- Should: The user can cancel a research run; it stops and records that it was cancelled.
- Status: web done, desktop done, mobile done, cli missing, vscode done, chrome unverified
- Code: apps/web/features/chat/components/research/ResearchActivity.tsx:305; apps/web/features/chat/pages/WebChatPage.tsx:4703; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1530; apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:281; apps/mobile/app/(app)/chat/[id].tsx:1444; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1523; apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:118; apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:193

## S35.19 Partial report.
- Should: If a run is stopped or cut short, a partial report from gathered material is produced and labelled as partial.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2184; apps/web/features/chat/components/research/ResearchReportView.tsx:584; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2417; apps/mobile/src/features/research/ReportsScreen.tsx:149; apps/mobile/src/features/research/service.ts:116

## S35.20 Full report reader.
- Should: A finished report opens in a dedicated reader (title, summary, body, sources).
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/research/ResearchReportView.tsx:649; apps/web/features/chat/components/research/ResearchPanel.tsx:220; apps/web/app/api/research/reports/route.ts:48; apps/mobile/src/features/research/ReportsScreen.tsx:140; apps/mobile/src/features/research/ReportsScreen.tsx:214; apps/mobile/src/features/research/service.ts:116

## S35.21 Report outline.
- Should: The report reader shows an outline of its sections the user can navigate.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/research/ResearchReportView.tsx:615; apps/web/features/chat/components/research/ResearchReportView.tsx:367; apps/mobile/src/features/research/ReportsScreen.tsx:226; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:429

## S35.22 Linked citations.
- Should: Citations in the report link to their sources.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/research/ResearchReportView.tsx:340; apps/web/features/chat/components/research/ResearchReportView.tsx:208; apps/web/features/chat/components/research/ResearchReportView.tsx:654; apps/mobile/src/features/research/ReportsScreen.tsx:250; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:218

## S35.23 Tables and charts.
- Should: Reports can include tables and charts that render in the reader.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1197; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1230; packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:220; apps/web/features/chat/components/research/ResearchReportView.tsx:762; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:495; apps/mobile/src/features/chat/utils/mermaidChart.ts:138; apps/mobile/src/features/chat/components/ReportChart.tsx:246; apps/mobile/src/features/research/ReportsScreen.tsx:214

## S35.24 Supporting attachments.
- Should: A report can carry supporting attachments (data files, source documents) the user can open or download.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S35.25 Research-history list.
- Should: The user can browse a list of past research reports and reopen one.
- Status: web done, desktop done, mobile done, cli missing, chrome unverified
- Code: apps/web/features/chat/components/research/ResearchReportsGallery.tsx:106; apps/web/features/chat/components/research/ResearchPanel.tsx:405; apps/web/app/api/research/reports/route.ts:48; apps/mobile/src/features/research/ReportsScreen.tsx:222; apps/mobile/src/features/research/service.ts:123; apps/mobile/src/features/drawer/components/DrawerContent.tsx:109

## S35.26 Refresh or rerun research.
- Should: The user can refresh or rerun a finished research report to get updated results.
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/research/ResearchReportView.tsx:526; apps/web/features/chat/pages/WebChatPage.tsx:4929; apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:478; apps/mobile/app/(app)/chat/[id].tsx:738

## S35.27 Compare report revisions.
- Should: The user can compare two revisions of a report and see what changed.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S35.28 Export report.
- Should: The user can export a research report (e.g. PDF, Word, Markdown).
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/research/ResearchReportView.tsx:273; apps/web/features/chat/components/research/ResearchReportView.tsx:377

## S35.29 Convert report to slides.
- Should: The user can convert a research report into slides.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S35.30 Convert report to audio overview.
- Should: The user can convert a research report into an audio overview.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S35.31 Convert report to interactive page.
- Should: The user can convert a research report into an interactive web page/app.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/lib/visual-intent.ts:104; apps/web/features/chat/lib/visual-intent.ts:117; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:801

## S35.32 Schedule recurring research.
- Should: The user can schedule a research task to rerun on a recurring cadence.
- Status: web missing, desktop missing, mobile missing, cli missing, vscode missing, chrome missing

## S35.33 Notify on completion.
- Should: When a research run finishes (or fails) the user is notified (in-app and/or push).
- Status: web done, desktop done, mobile done, cli missing, vscode missing, chrome missing
- Code: apps/web/shared/components/layout/SidebarBrandRow.tsx:10; apps/web/lib/services/agent-notification-service.ts:188; apps/web/app/api/llm/v1/chat/completions/route.ts:573; apps/web/lib/services/notification-service.ts:65; apps/web/lib/services/agent-notification-service.ts:224; apps/mobile/src/features/drawer/components/DrawerContent.tsx:112

## S35.34 Remaining research allowance.
- Should: The user can see how much research allowance (runs/credits) remains before starting.
- Status: web done, desktop done, mobile missing, cli missing, vscode missing, chrome missing
- Code: apps/web/features/chat/components/research/ResearchActivity.tsx:474
