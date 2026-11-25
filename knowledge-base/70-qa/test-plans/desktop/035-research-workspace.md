---
id: "PLAN-desktop-035"
type: "test-plan"
title: "Desktop · 35. Research workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "desktop"
area: "35"
---
# Desktop · 35. Research workspace

26 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/desktop/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S35.01 Research-task creation.

- **Expected:** The user can start a Deep Research task from the product and it runs as a research run.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6107; apps/web/lib/hooks/useChatStream.ts:4600; apps/web/app/api/llm/v1/chat/completions/route.ts:568
- **Where to find it:** Composer "More composer options" (+ button) > Deep Research, then type a question and press "Send message" (labels found in the code)
- **Needs:** a paid plan (a Free trial account sees "Upgrade to use Deep Research" and cannot turn it on)
- **Steps:**
  1. Click the + button labelled "More composer options" under the message box.
  2. Turn on the "Deep Research" row.
  3. Type a research question and press "Send message".
  4. Look for the "Research plan" card and the activity bar "Planning research" above the answer, which means a research run has started. Compare with Expected.

## S35.02 Objective and deliverable selection.

- **Expected:** Before a research run starts, the user states the objective and chooses the deliverable (e.g. summary vs full report, format).
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchPlan.tsx:219; apps/web/features/chat/pages/WebChatPage.tsx:6265; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1420
- **Where to find it:** After sending with Deep Research: "Research plan" card > "Deliverable" section (labels found in the code)
- **Needs:** a paid plan with Deep Research on
- **Steps:**
  1. Turn on Deep Research and send your question; the typed question is the objective.
  2. In the "Research plan" card, open the "Deliverable" section.
  3. Pick "Executive summary" or "Full report" with the radio buttons.
  4. Open the "Format" menu and pick "Prose", "Prose with comparison tables" or "Bullet brief".
  5. Check the choice is still shown before you press "Start research".

## S35.04 Editable research plan.

- **Expected:** The research plan is shown before searching and the user can edit its steps (add/remove/reword) before approving.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchPlan.tsx:121; apps/web/features/chat/components/research/ResearchActivity.tsx:799; apps/web/features/chat/pages/WebChatPage.tsx:6231; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:3106
- **Where to find it:** "Research plan" card after sending a Deep Research question (status "Review the plan to start searching") (labels found in the code)
- **Needs:** a paid plan with Deep Research on
- **Steps:**
  1. Send a Deep Research question and wait for the plan card to appear.
  2. Click into a step text box and reword the step.
  3. Click "Add a step" to add a step, or the X labelled "Remove this step" to remove one.
  4. Press "Start research" and check the activity list shows your edited steps as the ones searched.

## S35.05 Source-selection panel.

- **Expected:** A panel lets the user choose which sources (web, sites, files, connected apps) a research run may use.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:6175; apps/web/features/chat/components/research/ResearchActivity.tsx:739; apps/web/features/chat/pages/WebChatPage.tsx:6278; apps/web/lib/hooks/useChatStream.ts:4612; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:732
- **Where to find it:** "Research plan" card > "Add a source" dropdown (the line above it says "Searching the whole web. Add a source to narrow it.") (labels found in the code)
- **Needs:** none for web sites; a connected app account for the "Connected app" option
- **Steps:**
  1. Send a Deep Research question and read the line "Searching the whole web. Add a source to narrow it." in the plan card.
  2. Open the "Add a source" dropdown and choose an option: "Only this site", "Never this site", "My files" or "Connected app".
  3. Click "Add" to put the source in the list.
  4. Look for the chip under "Sources for this run" and the changed line text; then press "Start research".

## S35.06 Website restrictions.

- **Expected:** The user can restrict a research run to (or away from) chosen websites, and the run respects it.
- **Code:** done. Evidence moved: apps/web/features/chat/components/research/ResearchActivity.tsx:200; apps/web/app/api/llm/v1/chat/completions/route.ts:538 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:637 (quoted code not found in the file now)
- **Where to find it:** "Research plan" card > "Add a source" > "Only this site" or "Never this site", then type in the "Site to add" box (labels found in the code)
- **Needs:** a paid plan with Deep Research on
- **Steps:**
  1. In "Add a source", choose "Only this site", type nature.com, who.int in the box and click "Add".
  2. Check the chips appear under "Sources for this run".
  3. Choose "Never this site", type a site and click "Add"; the chip reads "Never" followed by the site, in red.
  4. Press "Start research" and check the report's sources only come from the allowed sites and none from the excluded one.

## S35.07 Uploaded source intake.

- **Expected:** The user can add their own uploaded files as sources for a research run.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchActivity.tsx:202; apps/web/app/api/llm/v1/chat/completions/route.ts:624; apps/web/lib/services/research-file-source-service.ts:7
- **Where to find it:** "Research plan" card > "Add a source" > "My files", then "Add" (labels found in the code)
- **Needs:** a file to upload
- **Steps:**
  1. Attach or have a file ready in the conversation.
  2. In "Add a source", choose "My files" (no text box appears).
  3. Click "Add" and check a "My files" chip appears under "Sources for this run".
  4. Press "Start research" and check the run's sources include your file.

## S35.08 Connected source intake.

- **Expected:** The user can add connected work apps (Drive, Slack...) as sources for a research run.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/route.ts:661 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:3175; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2818; apps/web/lib/services/research-connector-source-service.ts:125; apps/web/lib/services/research-connector-source-service.ts:138; apps/web/app/api/llm/v1/chat/completions/lib/research-sources.ts:216; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2864
- **Where to find it:** "Research plan" card > "Add a source" > "Connected app" > "Choose an app" (labels found in the code)
- **Needs:** a connected work app account (for example one connected under Settings > Connectors)
- **Steps:**
  1. In Settings, open "Connectors" and connect a work app.
  2. Send a Deep Research question and wait for the plan card.
  3. In "Add a source", choose "Connected app", then pick the app in "Choose an app" and click "Add".
  4. Press "Start research" and check the app's name appears in the run's sources.

## S35.09 Research-progress view.

- **Expected:** While research runs, a progress view shows phase, counts (searches, sources) and elapsed time.
- **Code:** done. Evidence moved: apps/web/features/chat/components/research/ResearchActivity.tsx:482; apps/web/features/chat/components/research/ResearchActivity.tsx:199 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2241
- **Where to find it:** Activity bar above the answer after pressing "Start research" (labelled "Deep research: ...") (labels found in the code)
- **Needs:** a research run in progress
- **Steps:**
  1. Start a research run.
  2. Read the phase text at the left of the bar: "Planning research", then "Searching the web", then "Writing report".
  3. Read the counts in the middle: for example "3 of 6 searches" or "4 sources".
  4. Read the timer at the right (m:ss) and check it counts up while the run is active.

## S35.10 Search activity timeline.

- **Expected:** The run shows a timeline of the searches/steps it performs with their status.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchActivity.tsx:824; apps/web/features/chat/components/research/ResearchActivity.tsx:142; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:3093
- **Where to find it:** The plan list under the activity bar once the run is approved (labelled "Research plan") (labels found in the code)
- **Needs:** a research run in progress
- **Steps:**
  1. Start a run and approve the plan.
  2. Look at the list of steps under the activity bar.
  3. Watch each step's status on the right: "Queued", "Running", "Completed", "Failed" or "Not run".
  4. Compare the statuses with the steps as they run.

## S35.11 Visited-source list.

- **Expected:** The user can see the list of sources the research visited/used.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchPanel.tsx:503; apps/web/features/chat/components/messages/MessageBubble.tsx:2510; apps/web/features/chat/components/research/ResearchReportView.tsx:613
- **Where to find it:** "Sources" button under the answer > side panel "Sources" tab > "Citations" and "More" lists (labels found in the code)
- **Needs:** a finished research run
- **Steps:**
  1. Finish a research run and find the "Sources" button under the answer.
  2. Click it to open the research side panel on the "Sources" tab.
  3. Read the "Citations" list and the "More" list.
  4. Check the sources match what the run visited.

## S35.12 Evidence collection.

- **Expected:** The run gathers evidence (sources with excerpts) into a collection the report is built from and the user can inspect.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1378 (quoted code not found in the file now); apps/web/features/chat/components/research/ResearchReportView.tsx:613; apps/web/lib/services/research-report-service.ts:212
- **Where to find it:** "Sources" button under the answer > side panel "Sources" tab (each source row) and "Report" tab (labels found in the code)
- **Needs:** a finished research run
- **Steps:**
  1. Open the side panel from the "Sources" button under a finished run.
  2. Read each source row: its title, its host and the short excerpt under it.
  3. Open the "Report" tab and check the report uses these sources.

## S35.13 Findings grouped by question.

- **Expected:** The report or run view groups findings under each research question/plan step.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchReportView.tsx:547; apps/web/lib/services/research-report-service.ts:176
- **Where to find it:** Research panel > "Report" tab > "Planned questions" section of the report (labels found in the code)
- **Needs:** a finished research report with planned questions
- **Steps:**
  1. Open a finished report in the "Report" tab.
  2. Find the "Planned questions" heading.
  3. Read each line: "Answered:" or "Not answered:" followed by the question.
  4. Compare with Expected, which asks for findings grouped under each question.

## S35.15 Research steering.

- **Expected:** While research runs, the user can steer it (add guidance, change focus) and the run adapts.
- **Code:** done. Evidence moved: apps/web/features/chat/components/research/ResearchActivity.tsx:517; apps/web/features/chat/components/research/ResearchActivity.tsx:582; apps/web/features/chat/pages/WebChatPage.tsx:6133; apps/web/features/chat/pages/WebChatPage.tsx:4983 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:774; apps/web/app/api/llm/v1/chat/completions/route.ts:503; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2906; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:3024; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:3016
- **Where to find it:** Activity bar > "Steer" (while the run is planning or searching), then type in the guidance box and click "Send" (labels found in the code)
- **Needs:** a research run in progress
- **Steps:**
  1. While the bar shows "Searching the web", click "Steer".
  2. Type a focus or question in the box labelled "Add a focus, a question or a source to cover" and click "Send".
  3. Read the note that the guidance is applied when the current step finishes.
  4. Check a new step named "Your guidance" appears in the plan list and the run follows it.

## S35.17 Pause and resume.

- **Expected:** The user can pause a running research task and resume it later from where it stopped.
- **Code:** done. Evidence moved: apps/web/features/chat/components/research/ResearchActivity.tsx:527; apps/web/features/chat/pages/WebChatPage.tsx:6051; apps/web/app/api/llm/v1/chat/completions/route.ts:663 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:3171; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2092; apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-research.ts:51; apps/web/lib/hooks/useChatStream.ts:3351; apps/web/features/chat/components/research/ResearchActivity.tsx:655; apps/web/features/chat/pages/WebChatPage.tsx:6018; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1896; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:3020
- **Where to find it:** Activity bar > "Pause" while running, then "Resume" (labels found in the code)
- **Needs:** a research run in progress
- **Steps:**
  1. While the run is "Searching the web", click "Pause".
  2. Wait for the bar to show "Research paused".
  3. Click "Resume" (optionally type guidance first).
  4. Check the run continues from the same steps and counts instead of starting over.

## S35.18 Cancel research.

- **Expected:** The user can cancel a research run; it stops and records that it was cancelled.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchActivity.tsx:504; apps/web/features/chat/pages/WebChatPage.tsx:6225; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2044
- **Where to find it:** While a run is searching, the "Stop the current response" button in the composer; during the plan card, the "Cancel" button (labels found in the code)
- **Needs:** a research run in progress
- **Steps:**
  1. While the run shows "Searching the web", click the square stop button in place of Send (labelled "Stop the current response").
  2. Look at the activity bar: it changes to "Research stopped" with "(stopped by you)".
  3. To cancel before searching, click "Cancel" on the "Research plan" card instead.
  4. Check the run no longer updates and the bar says it was stopped or cancelled.

## S35.19 Partial report.

- **Expected:** If a run is stopped or cut short, a partial report from gathered material is produced and labelled as partial.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:3314; apps/web/features/chat/components/research/ResearchReportView.tsx:584 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:3595
- **Where to find it:** Stop a running research, then open the "Report" tab in the research side panel and read the banner at the top of the report (labels found in the code)
- **Needs:** a research run you can stop mid-way
- **Steps:**
  1. Start a run and press the stop button while it is searching.
  2. Open the "Sources" button under the answer, then the "Report" tab.
  3. Read the banner at the top of the report: "This report is" followed by the status and reason.
  4. Check the report summarises what was gathered and says it is incomplete.

## S35.20 Full report reader.

- **Expected:** A finished report opens in a dedicated reader (title, summary, body, sources).
- **Code:** done. Evidence moved: apps/web/features/chat/components/research/ResearchReportView.tsx:599; apps/web/features/chat/components/research/ResearchPanel.tsx:261; apps/web/app/api/research/reports/route.ts:48 (quoted code not found in the file now)
- **Where to find it:** "Sources" button under the answer > side panel "Report" tab (or "Library" tab > click a report) (labels found in the code)
- **Needs:** a finished research run
- **Steps:**
  1. Finish a research run and click the "Sources" button under the answer.
  2. Click the "Report" tab.
  3. Check the title, the summary, the body and the sources at the end.
  4. Click "Read report full screen" to open the reader view.

## S35.21 Report outline.

- **Expected:** The report reader shows an outline of its sections the user can navigate.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchReportView.tsx:566; apps/web/features/chat/components/research/ResearchReportView.tsx:254
- **Where to find it:** Research panel > "Report" tab > "Contents" box above the report body (labels found in the code)
- **Needs:** a finished report with three or more headings
- **Steps:**
  1. Open a finished report with at least three headings in the "Report" tab.
  2. Find the box labelled "Contents" above the body.
  3. Click one heading in the list.
  4. Check the page scrolls to that section.

## S35.22 Linked citations.

- **Expected:** Citations in the report link to their sources.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchReportView.tsx:213; apps/web/features/chat/components/research/ResearchReportView.tsx:70; apps/web/features/chat/components/research/ResearchReportView.tsx:601
- **Where to find it:** Research panel > "Report" tab > numbered citation markers in the report body, then the "Sources" list at the bottom (labels found in the code)
- **Needs:** a finished report with citations
- **Steps:**
  1. Open a finished report in the "Report" tab.
  2. Find a numbered citation marker in the text.
  3. Click it and check the page jumps to the matching entry under "Sources" at the bottom.
  4. Check that entry links to the web page.

## S35.23 Tables and charts.

- **Expected:** Reports can include tables and charts that render in the reader.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1437; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1479; packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:312; apps/web/features/chat/components/research/ResearchReportView.tsx:601
- **Where to find it:** "Research plan" card > "Format" > "Prose with comparison tables" (tables); charts appear in the report body when sources give comparable figures (labels found in the code)
- **Needs:** a paid plan with Deep Research on; a question whose sources include comparable figures for charts
- **Steps:**
  1. In the plan card, set "Format" to "Prose with comparison tables".
  2. Press "Start research" and wait for the report.
  3. Open the "Report" tab and look for a comparison table in the body.
  4. Look for a drawn chart in the body; compare with Expected.

## S35.25 Research-history list.

- **Expected:** The user can browse a list of past research reports and reopen one.
- **Code:** done. Evidence moved: apps/web/features/chat/components/research/ResearchReportsGallery.tsx:142; apps/web/features/chat/components/research/ResearchPanel.tsx:475; apps/web/app/api/research/reports/route.ts:48 (quoted code not found in the file now)
- **Where to find it:** Research sources button (title "Research sources") or a "Sources" button under an answer > side panel "Library" tab (labels found in the code)
- **Needs:** at least one saved research report; if none, the tab shows "No reports yet"
- **Steps:**
  1. Open the research side panel with the "Research sources" button or a "Sources" button.
  2. Click the "Library" tab.
  3. Read the list of past reports: title, date, source count.
  4. Click a report to reopen it.

## S35.26 Refresh or rerun research.

- **Expected:** The user can refresh or rerun a finished research report to get updated results.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchReportView.tsx:359; apps/web/features/chat/pages/WebChatPage.tsx:6208
- **Where to find it:** Research panel > "Report" tab > "Run again" in the report header (labels found in the code)
- **Needs:** a finished report that has its question saved
- **Steps:**
  1. Open a finished report in the "Report" tab.
  2. Click "Run again" in the report header.
  3. Watch a new run start in the chat with the same question.
  4. Check the new run uses current sources and produces a new report.

## S35.28 Export report.

- **Expected:** The user can export a research report (e.g. PDF, Word, Markdown).
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchReportView.tsx:134; apps/web/features/chat/components/research/ResearchReportView.tsx:264
- **Where to find it:** Research panel > "Report" tab > "Markdown", "PDF" or "Word" buttons in the report header (labels found in the code)
- **Needs:** a finished report
- **Steps:**
  1. Open a finished report in the "Report" tab.
  2. Click "PDF", "Word" or "Markdown" in the header.
  3. Check a file downloads and opens with the title and body.
  4. If it fails, read the error text under the header.

## S35.31 Convert report to interactive page.

- **Expected:** The user can convert a research report into an interactive web page/app.
- **Code:** done. Evidence present: apps/web/features/chat/lib/visual-intent.ts:104; apps/web/features/chat/lib/visual-intent.ts:104; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:986
- **Where to find it:** Research panel > "Report" tab > "Artifact" button in the report header; or type a request in "Ask a follow-up about this report" (labels found in the code)
- **Needs:** a finished report
- **Steps:**
  1. Open a finished report in the "Report" tab.
  2. Click "Artifact" in the report header (it hands the report to the artifacts panel).
  3. Or type "interactive web page" wording in "Ask a follow-up about this report" and click "Ask".
  4. Check the result is an interactive page as in Expected.

## S35.33 Notify on completion.

- **Expected:** When a research run finishes (or fails) the user is notified (in-app and/or push).
- **Code:** done. Evidence moved: apps/web/shared/components/layout/SidebarBrandRow.tsx:10; apps/web/lib/services/agent-notification-service.ts:209; apps/web/app/api/llm/v1/chat/completions/route.ts:573 (quoted code not found in the file now); apps/web/lib/services/notification-service.ts:74
- **Where to find it:** Bell icon at the top of the sidebar (label "Notifications") for results; the footer under the running research for the browser prompt (labels found in the code)
- **Needs:** a browser that allows notifications; a finished or failed research run
- **Steps:**
  1. Start a research run and switch to another tab or window.
  2. If the footer shows, read "Get a notification when this research finishes" and click "Enable", then allow the browser prompt.
  3. When the run ends, open the bell and look for "Research report ready" (or "Research did not finish").
  4. Check the entry matches the run that finished.

## S35.34 Remaining research allowance.

- **Expected:** The user can see how much research allowance (runs/credits) remains before starting.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchActivity.tsx:805
- **Where to find it:** Chat > attachment menu > Research > send a research question > read the line that starts "Estimated cost" on the research plan card, just above "Start research" (labels found in the code)
- **Needs:** a signed-in account; the "You have ... available right now" line appears only when usage data loads, and a line saying the estimate is not available appears for models with no estimate
- **Steps:**
  1. Sign in and open a new chat.
  2. Open the attachment menu in the message box and click "Research" to turn research on.
  3. Type a research question and send it.
  4. When the plan card appears, read the line starting "Estimated cost: up to about" and the line under it starting "You have" and "available right now".
  5. Compare with Expected: the remaining amount is shown before you click "Start research".
