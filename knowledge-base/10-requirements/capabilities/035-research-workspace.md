---
id: "REQ-AREA-035"
type: "requirements"
title: "Requirement items: Research workspace"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 35. Research workspace

34 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S35.01

**Research-task creation.** The user can start a Deep Research task from the product and it runs as a research run.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-01 Start a research run and see what it may cost](../../20-features/035-research-workspace/F035-01-start-a-research-run-and-see-what-it-may-cost.md)
- Competitor trace: CAP-research-01, CAP-research-19

## S35.02

**Objective and deliverable selection.** Before a research run starts, the user states the objective and chooses the deliverable (e.g. summary vs full report, format).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-02 Plan review, questions and deliverable](../../20-features/035-research-workspace/F035-02-plan-review-questions-and-deliverable.md)
- Competitor trace: CAP-research-02

## S35.03

**Clarifying-question flow.** A research run asks the user clarifying questions (with answers the user can give) before searching.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-02 Plan review, questions and deliverable](../../20-features/035-research-workspace/F035-02-plan-review-questions-and-deliverable.md)
- Competitor trace: CAP-research-03

## S35.04

**Editable research plan.** The research plan is shown before searching and the user can edit its steps (add/remove/reword) before approving.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-02 Plan review, questions and deliverable](../../20-features/035-research-workspace/F035-02-plan-review-questions-and-deliverable.md)
- Competitor trace: CAP-research-02

## S35.05

**Source-selection panel.** A panel lets the user choose which sources (web, sites, files, connected apps) a research run may use.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-03 Choose and restrict sources](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Competitor trace: CAP-research-04, CAP-research-07

## S35.06

**Website restrictions.** The user can restrict a research run to (or away from) chosen websites, and the run respects it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-03 Choose and restrict sources](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Competitor trace: CAP-research-05

## S35.07

**Uploaded source intake.** The user can add their own uploaded files as sources for a research run.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-03 Choose and restrict sources](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Competitor trace: CAP-research-04

## S35.08

**Connected source intake.** The user can add connected work apps (Drive, Slack...) as sources for a research run.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-03 Choose and restrict sources](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Competitor trace: CAP-research-04, CAP-research-06, CAP-research-07

## S35.09

**Research-progress view.** While research runs, a progress view shows phase, counts (searches, sources) and elapsed time.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing
- Feature: [F035-04 Watch the run: progress, timeline, sources and findings](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md)
- Competitor trace: CAP-research-09

## S35.10

**Search activity timeline.** The run shows a timeline of the searches/steps it performs with their status.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-04 Watch the run: progress, timeline, sources and findings](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md)
- Competitor trace: CAP-research-09

## S35.11

**Visited-source list.** The user can see the list of sources the research visited/used.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-04 Watch the run: progress, timeline, sources and findings](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md)
- Competitor trace: CAP-research-09

## S35.12

**Evidence collection.** The run gathers evidence (sources with excerpts) into a collection the report is built from and the user can inspect.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-04 Watch the run: progress, timeline, sources and findings](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md)
- Competitor trace: CAP-research-10

## S35.13

**Findings grouped by question.** The report or run view groups findings under each research question/plan step.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-04 Watch the run: progress, timeline, sources and findings](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md)
- Competitor trace: CAP-research-10

## S35.14

**Contradictory-evidence display.** Where sources disagree, the research view shows the conflicting evidence side by side or flags it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-04 Watch the run: progress, timeline, sources and findings](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md)
- Competitor trace: CAP-research-10, CAP-research-18

## S35.15

**Research steering.** While research runs, the user can steer it (add guidance, change focus) and the run adapts.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-05 Steer, pause, resume and cancel](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md)
- Competitor trace: CAP-editing-regeneration-and-branching-15, CAP-research-07, CAP-research-08

## S35.16

**Add sources while running.** The user can add sources to a research run that is already running.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-03 Choose and restrict sources](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Competitor trace: CAP-research-08

## S35.17

**Pause and resume.** The user can pause a running research task and resume it later from where it stopped.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-05 Steer, pause, resume and cancel](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md)
- Competitor trace: CAP-research-08

## S35.18

**Cancel research.** The user can cancel a research run; it stops and records that it was cancelled.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code done, Chrome unverified
- Feature: [F035-05 Steer, pause, resume and cancel](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md)
- Competitor trace: CAP-editing-regeneration-and-branching-15, CAP-research-08

## S35.19

**Partial report.** If a run is stopped or cut short, a partial report from gathered material is produced and labelled as partial.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-06 Partial report](../../20-features/035-research-workspace/F035-06-partial-report.md)
- Competitor trace: CAP-research-12

## S35.20

**Full report reader.** A finished report opens in a dedicated reader (title, summary, body, sources).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-07 Report reader](../../20-features/035-research-workspace/F035-07-report-reader.md)
- Competitor trace: CAP-research-10

## S35.21

**Report outline.** The report reader shows an outline of its sections the user can navigate.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-07 Report reader](../../20-features/035-research-workspace/F035-07-report-reader.md)
- Competitor trace: CAP-research-10

## S35.22

**Linked citations.** Citations in the report link to their sources.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-07 Report reader](../../20-features/035-research-workspace/F035-07-report-reader.md)
- Competitor trace: CAP-research-10

## S35.23

**Tables and charts.** Reports can include tables and charts that render in the reader.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-07 Report reader](../../20-features/035-research-workspace/F035-07-report-reader.md)
- Competitor trace: CAP-research-10

## S35.24

**Supporting attachments.** A report can carry supporting attachments (data files, source documents) the user can open or download.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-07 Report reader](../../20-features/035-research-workspace/F035-07-report-reader.md)
- Competitor trace: CAP-research-10

## S35.25

**Research-history list.** The user can browse a list of past research reports and reopen one.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, Chrome unverified
- Feature: [F035-08 History, run again and compare](../../20-features/035-research-workspace/F035-08-history-run-again-and-compare.md)
- Competitor trace: CAP-research-12

## S35.26

**Refresh or rerun research.** The user can refresh or rerun a finished research report to get updated results.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-08 History, run again and compare](../../20-features/035-research-workspace/F035-08-history-run-again-and-compare.md)
- Competitor trace: CAP-research-12

## S35.27

**Compare report revisions.** The user can compare two revisions of a report and see what changed.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-08 History, run again and compare](../../20-features/035-research-workspace/F035-08-history-run-again-and-compare.md)

## S35.28

**Export report.** The user can export a research report (e.g. PDF, Word, Markdown).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-09 Export and convert a report](../../20-features/035-research-workspace/F035-09-export-and-convert-a-report.md)
- Competitor trace: CAP-research-07, CAP-research-11

## S35.29

**Convert report to slides.** The user can convert a research report into slides.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-09 Export and convert a report](../../20-features/035-research-workspace/F035-09-export-and-convert-a-report.md)
- Competitor trace: CAP-research-27

## S35.30

**Convert report to audio overview.** The user can convert a research report into an audio overview.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-09 Export and convert a report](../../20-features/035-research-workspace/F035-09-export-and-convert-a-report.md)
- Competitor trace: CAP-research-27

## S35.31

**Convert report to interactive page.** The user can convert a research report into an interactive web page/app.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-09 Export and convert a report](../../20-features/035-research-workspace/F035-09-export-and-convert-a-report.md)
- Competitor trace: CAP-research-27

## S35.32

**Schedule recurring research.** The user can schedule a research task to rerun on a recurring cadence.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-10 Schedule and notify](../../20-features/035-research-workspace/F035-10-schedule-and-notify.md)
- Competitor trace: CAP-research-26

## S35.33

**Notify on completion.** When a research run finishes (or fails) the user is notified (in-app and/or push).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-10 Schedule and notify](../../20-features/035-research-workspace/F035-10-schedule-and-notify.md)
- Competitor trace: CAP-research-26

## S35.34

**Remaining research allowance.** The user can see how much research allowance (runs/credits) remains before starting.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing, CLI missing, VS Code missing, Chrome missing
- Feature: [F035-01 Start a research run and see what it may cost](../../20-features/035-research-workspace/F035-01-start-a-research-run-and-see-what-it-may-cost.md)
- Competitor trace: CAP-research-13
