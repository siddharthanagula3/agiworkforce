---
id: "PLAN-mobile-035"
type: "test-plan"
title: "Mobile · 35. Research workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "mobile"
area: "35"
---
# Mobile · 35. Research workspace

17 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/mobile/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S35.01 Research-task creation.

- **Expected:** The user can start a Deep Research task from the product and it runs as a research run.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/AddToChatSheet.tsx:555; apps/mobile/stores/chat/chatExecutionStore.ts:3395; apps/web/app/api/llm/v1/chat/completions/route.ts:568
- **Where to find it:** Chat screen > Add to chat (button beside the message box) > Deep research (labels found in the code)
- **Needs:** a Managed Cloud account on a plan granted Deep Research, and a research-capable model
- **Steps:**
  1. Sign in to a Managed Cloud account and open a chat.
  2. Check the model picker shows a model that supports research; the toggle is hidden for other models.
  3. Tap Add to chat beside the message box.
  4. Turn on Deep research.
  5. Type a research question and send it.
  6. Look for a Deep research card in the reply that shows a phase such as Planning research. Compare with Expected.

## S35.04 Editable research plan.

- **Expected:** The research plan is shown before searching and the user can edit its steps (add/remove/reword) before approving.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:372; apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:393; apps/mobile/stores/chat/chatExecutionStore.ts:3402
- **Where to find it:** Chat screen > Deep research card in the reply > plan editor (phase Review the plan to start searching) (labels found in the code)
- **Needs:** a Managed Cloud account with Deep Research and a run that stops at plan approval
- **Steps:**
  1. Start a Deep research run (S35.01).
  2. Wait until the card shows Review the plan to start searching.
  3. Edit the text of Step 1 (placeholder Describe what to search), tap Remove step on a step, and tap Add a step.
  4. Tap Approve plan.
  5. Look that only the edited steps are searched and the card moves on. Compare with Expected.

## S35.09 Research-progress view.

- **Expected:** While research runs, a progress view shows phase, counts (searches, sources) and elapsed time.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:477; apps/mobile/src/features/chat/utils/researchRunState.ts:351
- **Where to find it:** Chat screen > Deep research card in the reply, while the run is going (labels found in the code)
- **Needs:** a Managed Cloud account with Deep Research and a run that is still going
- **Steps:**
  1. Start a run and approve the plan (S35.01, S35.04).
  2. Watch the phase text under the card, for example Searching the web.
  3. Read the counts line under the title (round, searches, sources) once a search has run.
  4. Read the elapsed time at the top right of the card and check it keeps going.
  5. Compare with Expected.

## S35.10 Search activity timeline.

- **Expected:** The run shows a timeline of the searches/steps it performs with their status.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:204; apps/mobile/src/features/chat/components/MessageBubble.tsx:2363; apps/mobile/stores/chat/chatExecutionStore.ts:3753
- **Where to find it:** Chat screen > Deep research card in the reply > Research plan list (after plan approval) (labels found in the code)
- **Needs:** a Managed Cloud account with Deep Research
- **Steps:**
  1. Start a run and approve the plan (S35.01, S35.04).
  2. Look at the list of plan steps under the card once the editor is closed.
  3. Check each step shows its text and an icon, and the step being searched changes as the run goes.
  4. Compare with Expected.

## S35.11 Visited-source list.

- **Expected:** The user can see the list of sources the research visited/used.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/research/ResearchSourcesAppendix.tsx:66; apps/mobile/src/features/chat/components/MessageBubble.tsx:969
- **Where to find it:** Chat screen > Deep research card or reply > Sources list (labels found in the code)
- **Needs:** a finished Deep Research run that used web sources
- **Steps:**
  1. Finish a Deep research run that used web sources.
  2. Scroll below the reply to the sources block.
  3. Read the heading with the count, then the numbered source chips with title and URL.
  4. If there are more sources than the chip limit, use the expand control.
  5. Compare the list with Expected.

## S35.12 Evidence collection.

- **Expected:** The run gathers evidence (sources with excerpts) into a collection the report is built from and the user can inspect.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/research/ResearchSourcesAppendix.tsx:66; apps/mobile/src/features/research/service.ts:121
- **Where to find it:** Reports > open a finished report > Sources list at the end of the report (labels found in the code)
- **Needs:** a Managed Cloud account with at least one finished report
- **Steps:**
  1. Open Reports from the sidebar (S35.25).
  2. Open a finished report.
  3. Scroll to the end of the report.
  4. Read the Sources list and tap a source chip, then Open page to see its web page.
  5. Compare with Expected.

## S35.13 Findings grouped by question.

- **Expected:** The report or run view groups findings under each research question/plan step.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/utils/researchRunState.ts:150; apps/mobile/src/features/chat/utils/researchRunState.ts:216; apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:571; apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:595
- **Where to find it:** not found in the code. Searched research files for findings and question grouping. The report shows one flat Key findings list (ReportsScreen.tsx) and Sections grouped by report headings (ResearchReportSections.tsx); no view grouping findings under each question was found.
- **Needs:** a finished report with key findings and plan questions

## S35.17 Pause and resume.

- **Expected:** The user can pause a running research task and resume it later from where it stopped.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:655; apps/mobile/app/(app)/chat/[id].tsx:1094; apps/mobile/app/(app)/chat/[id].tsx:2624
- **Where to find it:** Chat screen > Deep research card in the reply > Pause, then Resume (labels found in the code)
- **Needs:** a Managed Cloud account with a research run that is still running
- **Steps:**
  1. Start a run and wait until it shows Searching the web (S35.01, S35.04).
  2. Tap Pause; the button changes to Pausing.
  3. Look for Research paused and the text Paused. Resume to continue from where it stopped.
  4. Tap Resume.
  5. Check the phase returns to searching and the counts continue from where they stopped. Compare with Expected.

## S35.18 Cancel research.

- **Expected:** The user can cancel a research run; it stops and records that it was cancelled.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:663; apps/mobile/app/(app)/chat/[id].tsx:2623; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2034
- **Where to find it:** Chat screen > Deep research card in the reply > Stop (during a run) or Cancel (at plan approval) (labels found in the code)
- **Needs:** a Managed Cloud account with a running research task
- **Steps:**
  1. Start a run and wait until it is searching (S35.01, S35.04).
  2. Tap Stop.
  3. Look for the phase Research stopped and the text Stopped before it finished.
  4. To test Cancel instead, start a run and tap Cancel at the plan step, then check the card.
  5. Compare with Expected, which also asks that the stop is recorded as a cancel.

## S35.19 Partial report.

- **Expected:** If a run is stopped or cut short, a partial report from gathered material is produced and labelled as partial.
- **Code:** done. Evidence present: apps/mobile/src/features/research/ReportsScreen.tsx:391; apps/mobile/src/features/research/service.ts:121
- **Where to find it:** Reports > open a report from a run that was stopped or failed (labels found in the code)
- **Needs:** a Managed Cloud account with a run that was stopped or failed
- **Steps:**
  1. Stop a run (S35.18), or use one that failed.
  2. Open Reports from the sidebar.
  3. Find that run in the list and check its row for a small badge with a warning icon and a status word.
  4. Open it and read the error box if one is shown.
  5. Compare with Expected, which asks that a partial report is labelled as partial.

## S35.20 Full report reader.

- **Expected:** A finished report opens in a dedicated reader (title, summary, body, sources).
- **Code:** done. Evidence moved: apps/mobile/src/features/research/ReportsScreen.tsx:380; apps/mobile/src/features/research/ReportsScreen.tsx:214 (quoted code not found in the file now); apps/mobile/src/features/research/service.ts:121
- **Where to find it:** Sidebar > Reports > tap a report row (labels found in the code)
- **Needs:** a Managed Cloud account with at least one finished report
- **Steps:**
  1. Open the sidebar and tap Reports (it is in the folded group of the sidebar).
  2. Tap a report row.
  3. Check the title at the top of the reader, the summary, the Key findings list, the Sections box and the body text.
  4. Scroll to the bottom and check the Sources list.
  5. Compare with Expected.

## S35.21 Report outline.

- **Expected:** The report reader shows an outline of its sections the user can navigate.
- **Code:** done. Evidence present: apps/mobile/src/features/research/ReportsScreen.tsx:452; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:833
- **Where to find it:** Reports > open a report > Sections box (shown when the report has three or more headings) (labels found in the code)
- **Needs:** a Managed Cloud account with a report that has three or more headings
- **Steps:**
  1. Open Reports and open a report with three or more headings.
  2. Find the Sections box above the report body.
  3. Tap a section name to jump to its heading.
  4. Check the reader scrolls to that section. Compare with Expected.
  5. In a chat reply, tap Show report sections to expand the outline.

## S35.22 Linked citations.

- **Expected:** Citations in the report link to their sources.
- **Code:** done. Evidence moved: apps/mobile/src/features/research/ReportsScreen.tsx:482; apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:218 (quoted code not found in the file now)
- **Where to find it:** Reports > open a report > tap a source chip under Sources, then Open page (labels found in the code)
- **Needs:** a Managed Cloud account with a report that has citations
- **Steps:**
  1. Open a report that has sources.
  2. Tap a source chip in the Sources list at the end of the report.
  3. Look for the action sheet with Open page and tap it.
  4. Check the source web page opens. Compare with Expected.

## S35.23 Tables and charts.

- **Expected:** Reports can include tables and charts that render in the reader.
- **Code:** done. Evidence moved: apps/mobile/src/features/chat/components/MessageContentRenderer.tsx:495 (quoted code not found in the file now); apps/mobile/src/features/chat/utils/mermaidChart.ts:156; apps/mobile/src/features/chat/components/ReportChart.tsx:811; apps/mobile/src/features/research/ReportsScreen.tsx:214 (quoted code not found in the file now)
- **Where to find it:** Reports > open a report (tables and charts appear in the body) (labels found in the code)
- **Needs:** a report that contains a table or a chart; the code does not say which reports do
- **Steps:**
  1. Open a report whose body has a table.
  2. Scroll the table sideways if it is wider than the screen.
  3. Look for a chart drawn in the body of a report that has a chart block.
  4. Compare with Expected.

## S35.25 Research-history list.

- **Expected:** The user can browse a list of past research reports and reopen one.
- **Code:** done. Evidence present: apps/mobile/src/features/research/ReportsScreen.tsx:517; apps/mobile/src/features/research/service.ts:134; apps/mobile/src/features/drawer/components/DrawerContent.tsx:160
- **Where to find it:** Sidebar > Reports (labels found in the code)
- **Needs:** a Managed Cloud account; an empty list or one with past reports
- **Steps:**
  1. Open the sidebar and tap Reports.
  2. If the list is empty, check for No reports yet and the line about turning on Research.
  3. If there are reports, check each row shows a date, a source count and a model name.
  4. Tap a row to reopen it, then go back.
  5. Scroll to the bottom to load older reports. Compare with Expected.

## S35.26 Refresh or rerun research.

- **Expected:** The user can refresh or rerun a finished research report to get updated results.
- **Code:** done. Evidence present: apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:679; apps/mobile/app/(app)/chat/[id].tsx:1080
- **Where to find it:** Chat screen > Deep research card in a finished run > Run again (labels found in the code)
- **Needs:** a Managed Cloud account with a finished research run
- **Steps:**
  1. Open a chat with a finished Deep research run (card shows Research complete).
  2. Tap Run again.
  3. Look for the card to start again with a new phase such as Planning research or Searching the web.
  4. Compare the new results with the old ones. Compare with Expected.

## S35.33 Notify on completion.

- **Expected:** When a research run finishes (or fails) the user is notified (in-app and/or push).
- **Code:** done. Evidence present: apps/web/lib/services/agent-notification-service.ts:201; apps/mobile/src/features/drawer/components/DrawerContent.tsx:163
- **Where to find it:** Settings > Notifications > Research complete (labels found in the code)
- **Needs:** a phone with notifications allowed for the app and a Deep Research run
- **Steps:**
  1. Open Settings and tap Notifications.
  2. Find the Research complete row; its description reads When a research report is ready.
  3. Turn it on, then start a Deep research run and leave the app.
  4. Wait for the run to finish and check for a push notification or an in-app notice.
  5. Compare with Expected, which also covers a failed run.
