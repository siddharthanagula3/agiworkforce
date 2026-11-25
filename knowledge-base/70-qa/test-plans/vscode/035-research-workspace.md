---
id: "PLAN-vscode-035"
type: "test-plan"
title: "VS Code · 35. Research workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
app: "vscode"
area: "35"
---
# VS Code · 35. Research workspace

1 items. For each one: find it in the app, do it like a person, compare what you see with **Expected**, then record the result in `results/vscode/results.csv` under the same ID.

The line **Code** says what the code audit found and whether the code it pointed to is still there today. It is not proof that the feature works.

## S35.18 Cancel research.

- **Expected:** The user can cancel a research run; it stops and records that it was cancelled.
- **Code:** done. Evidence present: apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:178; apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts:314; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2034
- **Where to find it:** Code: Show Cloud Tasks > select the research task in the Cloud tasks list > Actions > $(stop-circle) Stop this task > Stop this task (modal confirmation) (labels found in the code)
- **Needs:** A signed-in AGI Cloud account and a research run that has not yet finished.
- **Steps:**
  1. Sign in to AGI Cloud if asked, then run the command Code: Show Cloud Tasks from the Command Palette.
  2. Select the research task row in the Cloud tasks list while it is still running (not finished, failed or stopped).
  3. In the task detail list, scroll to the Actions section and select Stop this task.
  4. In the modal dialog that asks Stop "<task title>"?, click Stop this task.
  5. Look for the notice This task was asked to stop. Then refresh the list and check the task shows as stopped (state label stopped), with the work done so far kept in the conversation.
