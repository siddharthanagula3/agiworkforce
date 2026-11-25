---
id: "PLAN-web-035"
type: "test-plan"
title: "Web · 35. Research workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "web"
area: "35"
---
# Web · 35. Research workspace

26 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/web/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S35.01 Research-task creation.

- **Expected:** The user can start a Deep Research task from the product and it runs as a research run.
- **Code:** done. Evidence present: apps/web/features/chat/components/Composer/ChatComposerNew.tsx:6107; apps/web/lib/hooks/useChatStream.ts:4600; apps/web/app/api/llm/v1/chat/completions/route.ts:568
- **Where to find it:** Composer > + menu > Deep Research, then send a question (labels found in the code)
- **Needs:** a paid account (a Free account sees the Upgrade to use Deep Research message)
- **Steps:**
  1. Open the + menu under the chat box.
  2. Click Deep Research so it is switched on.
  3. Type a research question and press send.
  4. Look for the Deep research status card in the reply, showing a phase such as Planning research.

## S35.02 Objective and deliverable selection.

- **Expected:** Before a research run starts, the user states the objective and chooses the deliverable (e.g. summary vs full report, format).
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchPlan.tsx:219; apps/web/features/chat/pages/WebChatPage.tsx:6265; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1420
- **Where to find it:** Composer > + menu > Deep Research, send a question > Research plan card > Deliverable (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Turn on Deep Research and send a question.
  2. When the Research plan card appears, find the Deliverable box.
  3. Pick Executive summary or Full report.
  4. Open the Format list and pick a format such as Bullet brief, then compare with the choices shown in Expected.

## S35.04 Editable research plan.

- **Expected:** The research plan is shown before searching and the user can edit its steps (add/remove/reword) before approving.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchPlan.tsx:121; apps/web/features/chat/components/research/ResearchActivity.tsx:799; apps/web/features/chat/pages/WebChatPage.tsx:6231; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:3106
- **Where to find it:** Research plan card (shown after sending a Deep Research question) > Add a step / Remove this step / Start research (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Send a Deep Research question and wait for the Research plan card.
  2. Change the words in a step box (Research step 1, 2...).
  3. Click Add a step, or click the X beside a step to remove it.
  4. Click Start research and check that the searches follow the edited steps.

## S35.05 Source-selection panel.

- **Expected:** A panel lets the user choose which sources (web, sites, files, connected apps) a research run may use.
- **Code:** done. Evidence present: apps/web/features/chat/pages/WebChatPage.tsx:6175; apps/web/features/chat/components/research/ResearchActivity.tsx:739; apps/web/features/chat/pages/WebChatPage.tsx:6278; apps/web/lib/hooks/useChatStream.ts:4612; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:732
- **Where to find it:** Research plan card > Add a source > My files / Only this site / Never this site / Connected app > Add (labels found in the code)
- **Needs:** a paid account; for Connected app, a connected work app
- **Steps:**
  1. On the Research plan card, open the Add a source list.
  2. Choose a kind: Only this site, Never this site, My files or Connected app.
  3. Click Add.
  4. Look for the chip under Sources for this run, or the text Searching the whole web. Add a source to narrow it. when the list is empty.

## S35.06 Website restrictions.

- **Expected:** The user can restrict a research run to (or away from) chosen websites, and the run respects it.
- **Code:** done. Evidence moved: apps/web/features/chat/components/research/ResearchActivity.tsx:200; apps/web/app/api/llm/v1/chat/completions/route.ts:538 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:637 (quoted code not found in the file now)
- **Where to find it:** Research plan card > Add a source > Only this site or Never this site, then type a site > Add (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. On the Research plan card, set Add a source to Only this site or Never this site.
  2. Type a domain in the Site to add box (placeholder nature.com, who.int) and press Enter, or click Add.
  3. Look for the chip, which reads Never plus the domain for a restricted site.
  4. Start the run and compare the report's sources with the chosen site rule.

## S35.07 Uploaded source intake.

- **Expected:** The user can add their own uploaded files as sources for a research run.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchActivity.tsx:202; apps/web/app/api/llm/v1/chat/completions/route.ts:624; apps/web/lib/services/research-file-source-service.ts:7
- **Where to find it:** Research plan card > Add a source > My files > Add (labels found in the code)
- **Needs:** a paid account, a file to upload
- **Steps:**
  1. On the Research plan card, set Add a source to My files.
  2. Click Add.
  3. Look for the My files chip under Sources for this run.
  4. Start the run and check that the report cites your uploaded material.

## S35.08 Connected source intake.

- **Expected:** The user can add connected work apps (Drive, Slack...) as sources for a research run.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/route.ts:661 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:3175; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2818; apps/web/lib/services/research-connector-source-service.ts:125; apps/web/lib/services/research-connector-source-service.ts:138; apps/web/app/api/llm/v1/chat/completions/lib/research-sources.ts:216; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2864
- **Where to find it:** Research plan card > Add a source > Connected app > Choose an app > Add (labels found in the code)
- **Needs:** a paid account, a connected work app (such as Drive or Slack); the option only appears when an app is connected
- **Steps:**
  1. On the Research plan card, set Add a source to Connected app.
  2. Open the Choose an app list and pick a connected app.
  3. Click Add.
  4. Look for the app's name as a chip under Sources for this run.

## S35.09 Research-progress view.

- **Expected:** While research runs, a progress view shows phase, counts (searches, sources) and elapsed time.
- **Code:** done. Evidence moved: apps/web/features/chat/components/research/ResearchActivity.tsx:482; apps/web/features/chat/components/research/ResearchActivity.tsx:199 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2241
- **Where to find it:** Chat reply > Deep research status card (above the answer) (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Start a Deep Research run and watch the status bar of the reply.
  2. Read the phase text, such as Planning research, Searching the web or Writing report.
  3. Read the counts on the right: searches and sources, and the elapsed time (m:ss).
  4. Check that the counts go up while the run is working.

## S35.10 Search activity timeline.

- **Expected:** The run shows a timeline of the searches/steps it performs with their status.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchActivity.tsx:824; apps/web/features/chat/components/research/ResearchActivity.tsx:142; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:3093
- **Where to find it:** Deep research status card > Research plan step list under the status bar (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Start a Deep Research run and let it work.
  2. Look at the list under the status bar, labelled Research plan.
  3. Read the status word on each step, and Not run on steps that were dropped.
  4. Compare with the steps as they run.

## S35.11 Visited-source list.

- **Expected:** The user can see the list of sources the research visited/used.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchPanel.tsx:503; apps/web/features/chat/components/messages/MessageBubble.tsx:2510; apps/web/features/chat/components/research/ResearchReportView.tsx:613
- **Where to find it:** Under the answer, click View N sources (or the globe button titled Research sources) > Sources tab (labels found in the code)
- **Needs:** a paid account, a finished or running Deep Research answer
- **Steps:**
  1. Under a Deep Research answer, click the View N sources button.
  2. In the side panel, check that the Sources tab is selected.
  3. Read the Citations and More lists.
  4. Compare the list with the sources the run visited.

## S35.12 Evidence collection.

- **Expected:** The run gathers evidence (sources with excerpts) into a collection the report is built from and the user can inspect.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1378 (quoted code not found in the file now); apps/web/features/chat/components/research/ResearchReportView.tsx:613; apps/web/lib/services/research-report-service.ts:212
- **Where to find it:** Research side panel > Sources tab (open from View N sources) (labels found in the code)
- **Needs:** a paid account, a finished Deep Research answer
- **Steps:**
  1. Open the Sources tab of the research side panel.
  2. Click or read a source row: the host, the Published and Retrieved dates, and the excerpt.
  3. Compare the evidence excerpts with the report's statements.

## S35.13 Findings grouped by question.

- **Expected:** The report or run view groups findings under each research question/plan step.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchReportView.tsx:547; apps/web/lib/services/research-report-service.ts:176
- **Where to find it:** Research side panel > Report tab > Planned questions (labels found in the code)
- **Needs:** a paid account, a finished report with planned questions
- **Steps:**
  1. Open a finished report in the Report tab.
  2. Find the section headed Planned questions.
  3. Read each line marked Answered or Not answered, and the reason under open questions.
  4. Compare with the report body.

## S35.15 Research steering.

- **Expected:** While research runs, the user can steer it (add guidance, change focus) and the run adapts.
- **Code:** done. Evidence moved: apps/web/features/chat/components/research/ResearchActivity.tsx:517; apps/web/features/chat/components/research/ResearchActivity.tsx:582; apps/web/features/chat/pages/WebChatPage.tsx:6133; apps/web/features/chat/pages/WebChatPage.tsx:4983 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:774; apps/web/app/api/llm/v1/chat/completions/route.ts:503; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2906; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:3024; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:3016
- **Where to find it:** Deep research status card > Steer (labels found in the code)
- **Needs:** a paid account, a run that is still searching
- **Steps:**
  1. While the run is searching, click Steer.
  2. Type in the box Add a focus, a question or a source to cover.
  3. Click Send.
  4. Look for the line Your guidance is applied when the current step finishes, and the plan updates to follow it.

## S35.17 Pause and resume.

- **Expected:** The user can pause a running research task and resume it later from where it stopped.
- **Code:** done. Evidence moved: apps/web/features/chat/components/research/ResearchActivity.tsx:527; apps/web/features/chat/pages/WebChatPage.tsx:6051; apps/web/app/api/llm/v1/chat/completions/route.ts:663 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:3171; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2092; apps/web/app/api/llm/v1/chat/completions/lib/assistant-turn-research.ts:51; apps/web/lib/hooks/useChatStream.ts:3351; apps/web/features/chat/components/research/ResearchActivity.tsx:655; apps/web/features/chat/pages/WebChatPage.tsx:6018; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1896; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:3020
- **Where to find it:** Deep research status card > Pause, then Resume (labels found in the code)
- **Needs:** a paid account, a run that is still searching
- **Steps:**
  1. While the run is searching, click Pause.
  2. Wait for the label to read Pausing… and then the status to read Research paused.
  3. Click Resume (optionally type guidance in the box next to it).
  4. Check that the run continues from the step it stopped at.

## S35.18 Cancel research.

- **Expected:** The user can cancel a research run; it stops and records that it was cancelled.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchActivity.tsx:504; apps/web/features/chat/pages/WebChatPage.tsx:6225; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2044
- **Where to find it:** Composer > Stop the current response (tooltip Stop generation) during a run; or Research plan card > Cancel before searching starts (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Start a Deep Research run.
  2. Click the stop button in the composer while the run works, or click Cancel on the Research plan card before it searches.
  3. Look for the status Research stopped and the note (stopped by you).
  4. Check that the run no longer adds searches.

## S35.19 Partial report.

- **Expected:** If a run is stopped or cut short, a partial report from gathered material is produced and labelled as partial.
- **Code:** done. Evidence moved: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:3314; apps/web/features/chat/components/research/ResearchReportView.tsx:584 (quoted code not found in the file now); apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:3595
- **Where to find it:** Research side panel > Report tab (or Library) > report banner after a stopped run (labels found in the code)
- **Needs:** a paid account, a run that is stopped before the report is written
- **Steps:**
  1. Stop a Deep Research run after some searching has happened.
  2. Open its report from the Report tab.
  3. Read the banner under the title, which begins This report is followed by the report status.
  4. Check that the report has the material gathered before the stop.

## S35.20 Full report reader.

- **Expected:** A finished report opens in a dedicated reader (title, summary, body, sources).
- **Code:** done. Evidence moved: apps/web/features/chat/components/research/ResearchReportView.tsx:599; apps/web/features/chat/components/research/ResearchPanel.tsx:261; apps/web/app/api/research/reports/route.ts:48 (quoted code not found in the file now)
- **Where to find it:** Under the answer, View N sources > Report tab (or Library > open a report) > Read report full screen (labels found in the code)
- **Needs:** a paid account, a finished report
- **Steps:**
  1. Open a finished report in the Report tab.
  2. Check the title, the summary, the body and the sources.
  3. Click Read report full screen to open the reader at full size.

## S35.21 Report outline.

- **Expected:** The report reader shows an outline of its sections the user can navigate.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchReportView.tsx:566; apps/web/features/chat/components/research/ResearchReportView.tsx:254
- **Where to find it:** Report reader > Contents box (above the body) (labels found in the code)
- **Needs:** a paid account, a finished report with three or more headings
- **Steps:**
  1. Open a finished report with at least three headings.
  2. Look for the box titled Contents.
  3. Click one heading in the list.
  4. Check that the page scrolls to that section.

## S35.22 Linked citations.

- **Expected:** Citations in the report link to their sources.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchReportView.tsx:213; apps/web/features/chat/components/research/ResearchReportView.tsx:70; apps/web/features/chat/components/research/ResearchReportView.tsx:601
- **Where to find it:** Report reader > body, numbered citations; Research side panel > Sources tab (labels found in the code)
- **Needs:** a paid account, a finished report with citations
- **Steps:**
  1. Open a finished report that has numbered citations in its text.
  2. Click a citation number in the body.
  3. Check that it takes you to or opens its source.
  4. Compare the link with the matching source in the Citations list.

## S35.23 Tables and charts.

- **Expected:** Reports can include tables and charts that render in the reader.
- **Code:** done. Evidence present: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1437; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1479; packages/ui/unified-chat/src/components/markdown/CodeBlock.tsx:312; apps/web/features/chat/components/research/ResearchReportView.tsx:601
- **Where to find it:** Plan card > Deliverable > Format > Prose with comparison tables; then read the report body (labels found in the code)
- **Needs:** a paid account
- **Steps:**
  1. Send a Deep Research question and wait for the Research plan card.
  2. Under Deliverable, open Format and pick Prose with comparison tables.
  3. Start research and open the finished report.
  4. Check that tables render in the body. Charts written as chart blocks render inline in the body.

## S35.25 Research-history list.

- **Expected:** The user can browse a list of past research reports and reopen one.
- **Code:** done. Evidence moved: apps/web/features/chat/components/research/ResearchReportsGallery.tsx:142; apps/web/features/chat/components/research/ResearchPanel.tsx:475; apps/web/app/api/research/reports/route.ts:48 (quoted code not found in the file now)
- **Where to find it:** Research side panel > Library tab (open from View N sources or the Research sources button) (labels found in the code)
- **Needs:** a paid account, at least one past report (the empty state says No reports yet)
- **Steps:**
  1. Open the research side panel and click the Library tab.
  2. Read the list of reports, newest first.
  3. Click a report title to reopen it.
  4. Scroll to the end of the list and check for Load older reports.

## S35.26 Refresh or rerun research.

- **Expected:** The user can refresh or rerun a finished research report to get updated results.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchReportView.tsx:359; apps/web/features/chat/pages/WebChatPage.tsx:6208
- **Where to find it:** Report reader toolbar > Run again (labels found in the code)
- **Needs:** a paid account, a finished report with a question
- **Steps:**
  1. Open a finished report.
  2. Click Run again in the toolbar.
  3. Look for a new Deep research status card in the chat.
  4. Compare the new run's results with the old report.

## S35.28 Export report.

- **Expected:** The user can export a research report (e.g. PDF, Word, Markdown).
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchReportView.tsx:134; apps/web/features/chat/components/research/ResearchReportView.tsx:264
- **Where to find it:** Report reader toolbar > Markdown, PDF or Word (labels found in the code)
- **Needs:** a paid account, a finished report
- **Steps:**
  1. Open a finished report.
  2. Click PDF in the toolbar and check that a file downloads.
  3. Repeat with Word and Markdown.
  4. Open each file and compare the title and body with the report.

## S35.31 Convert report to interactive page.

- **Expected:** The user can convert a research report into an interactive web page/app.
- **Code:** done. Evidence present: apps/web/features/chat/lib/visual-intent.ts:104; apps/web/features/chat/lib/visual-intent.ts:104; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:986
- **Where to find it:** Report reader toolbar > Artifact (labels found in the code)
- **Needs:** a paid account, a finished report
- **Steps:**
  1. Open a finished report.
  2. Click Artifact in the toolbar.
  3. Look for a new artifact opened from the report.
  4. Check that it can be shown as an interactive web page.

## S35.33 Notify on completion.

- **Expected:** When a research run finishes (or fails) the user is notified (in-app and/or push).
- **Code:** done. Evidence moved: apps/web/shared/components/layout/SidebarBrandRow.tsx:10; apps/web/lib/services/agent-notification-service.ts:209; apps/web/app/api/llm/v1/chat/completions/route.ts:573 (quoted code not found in the file now); apps/web/lib/services/notification-service.ts:74
- **Where to find it:** Deep research status card > Get a notification when this research finishes > Enable (labels found in the code)
- **Needs:** a paid account, a browser that allows notifications, a run that stays active
- **Steps:**
  1. Start a Deep Research run in the browser while the card shows Searching the web.
  2. Click Enable in the footer and allow notifications in the browser prompt.
  3. Wait for the run to finish or fail.
  4. Look for the browser notification and the completed status in the chat.

## S35.34 Remaining research allowance.

- **Expected:** The user can see how much research allowance (runs/credits) remains before starting.
- **Code:** done. Evidence present: apps/web/features/chat/components/research/ResearchActivity.tsx:805
- **Where to find it:** Composer plus button > Research (turn on), send a research question, then wait for the "Research plan" card to show its "Start research" button. The line "You have ... available right now." sits above "Start research". (labels found in the code)
- **Needs:** a Free account or a paid account with managed credits; the research plan must be waiting for approval
- **Steps:**
  1. Sign in with an account that has managed usage (a paid or Free plan with credits).
  2. In the message box, open the plus (attachment) menu and choose "Research" so it is checked.
  3. Type a research question and send it.
  4. Wait until the "Research plan" card appears and asks you to approve the plan (it is not running yet).
  5. Look under the plan steps for "Estimated cost: up to about ..." and the line "You have ... available right now." Compare the credit amount with the remaining credits you expect.
