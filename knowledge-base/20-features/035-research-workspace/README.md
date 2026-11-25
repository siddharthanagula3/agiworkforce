---
id: "AREA-035"
type: "area"
title: "Research workspace"
features: ["F035-01", "F035-02", "F035-03", "F035-04", "F035-05", "F035-06", "F035-07", "F035-08", "F035-09", "F035-10"]
basis: "code inspection"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# 35. Research workspace

A person asks a question and the product runs a multi-step research job. It makes a plan, searches the web (and optionally the person's own files and connected work apps), then writes a cited report. The person can edit the plan, steer or pause the run, read the report, export it, and find it again later. It matters because it turns a long reading job into one reviewed, sourced document.

**Who uses it.** Paid Cloud plans only. The server allows Deep Research on pro, max, max_15x, team, team_premium and enterprise (PRO_TIERS in packages/contracts/types/src/billing-catalog.ts:341,355). Free users get a 403 "plan_upgrade_required" (request-processor.ts:1503-1520). The model must also support research: a research flag, or tools plus a context window of at least 500,000 (apps/web/features/chat/lib/research-capability-gate.ts). Reports belong to one user and are protected by row-level security (migration 0094).

## Features in this area

| ID | Feature | Web | Desktop | Mobile | CLI | VS Code | Chrome |
|---|---|---|---|---|---|---|---|
| [F035-01](F035-01-start-a-research-run-and-see-what-it-may-cost.md) | Start a research run and see what it may cost | built | built | partly | no | no | no |
| [F035-02](F035-02-plan-review-questions-and-deliverable.md) | Plan review, questions and deliverable | partly | partly | partly | no | no | no |
| [F035-03](F035-03-choose-and-restrict-sources.md) | Choose and restrict sources | partly | partly | partly | no | no | no |
| [F035-04](F035-04-watch-the-run-progress-timeline-sources-and-findin.md) | Watch the run: progress, timeline, sources and findings | partly | partly | partly | no | no | no |
| [F035-05](F035-05-steer-pause-resume-and-cancel.md) | Steer, pause, resume and cancel | built | built | partly | no | partly | partly |
| [F035-06](F035-06-partial-report.md) | Partial report | built | built | built | no | no | no |
| [F035-07](F035-07-report-reader.md) | Report reader | partly | partly | partly | no | no | no |
| [F035-08](F035-08-history-run-again-and-compare.md) | History, run again and compare | partly | partly | partly | no | no | no |
| [F035-09](F035-09-export-and-convert-a-report.md) | Export and convert a report | partly | partly | built | no | no | no |
| [F035-10](F035-10-schedule-and-notify.md) | Schedule and notify | partly | partly | partly | no | no | no |

Requirement items for this area: [10-requirements/capabilities/035-research-workspace.md](../../10-requirements/capabilities/035-research-workspace.md).

## How this area works in the code

1. **Person turns on Deep Research.** The composer shows the toggle only when the model supports research and the plan allows it, and turns it off if the model changes. (`apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1616`, `apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1700`, `apps/web/features/chat/lib/research-capability-gate.ts:1`)
2. **Page sends the turn.** The chat page sends research true with the model and, on retry or plan start, the resume data and source choices. (`apps/web/features/chat/pages/WebChatPage.tsx:6215`, `apps/web/features/chat/pages/WebChatPage.tsx:5964`)
3. **Server checks the request.** The request schema accepts research, research_sources and research_resume. A free plan is refused, domain rules are merged with workspace rules, and research mode is allowed only if the model supports it. (`apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:721`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1503`, `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:5265`)
4. **Route starts a cloud run.** The route checks budget and workspace policy, blocks secrets, creates an agent run record, loads connector permissions and searches the person's files. If the plan is approved and durable runs are on, it starts a durable workflow; otherwise it streams in the request. (`apps/web/app/api/llm/v1/chat/completions/route.ts:446`, `apps/web/app/api/llm/v1/chat/completions/route.ts:573`, `apps/web/app/api/llm/v1/chat/completions/route.ts:661`)
5. **Research loop plans, searches, writes.** First turn makes the plan and questions; with approval required it stops at awaiting_approval. After approval it runs search rounds within the limits, reads connector and file sources, then writes a cited report. It checks for cancel and pause at each boundary. (`apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1746`, `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:3097`, `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2034`, `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2092`)
6. **Sources are gathered and numbered.** Files come from the retrieval index; connected apps are read through their search and fetch tools; all are added to one list so citations share numbers. (`apps/web/lib/services/research-file-source-service.ts:25`, `apps/web/lib/services/research-connector-source-service.ts:119`, `apps/web/app/api/llm/v1/chat/completions/lib/research-sources.ts:207`)
7. **Report is saved and the person notified.** persistRun saves the report once (with retries), the service upserts it by user and request id, and a notification is recorded for completed or failed. (`apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:1982`, `apps/web/app/api/llm/v1/chat/completions/lib/research-run-options.ts:70`, `apps/web/lib/services/research-report-service.ts:213`, `apps/web/lib/services/agent-notification-service.ts:209`)
8. **Live view reads the stream.** The stream sends status, plan and gaps events; the chat shows them in the status bar and step list. Pause and steer go to separate run endpoints. (`apps/web/features/chat/components/research/ResearchActivity.tsx:282`, `apps/web/features/chat/pages/WebChatPage.tsx:6040`, `apps/web/app/api/llm/v1/chat/completions/runs/[runId]/pause/route.ts:1`)
9. **Reports are listed and read.** GET /api/research/reports returns one report or a page of them for the signed-in user. The web gallery and the mobile screen call it. (`apps/web/app/api/research/reports/route.ts:48`, `apps/web/features/chat/components/research/ResearchReportsGallery.tsx:106`, `apps/mobile/src/features/research/service.ts:116`)
10. **Reader shows and exports.** The report view builds contents from headings, links citations, offers Markdown, PDF and Word export and Run again. (`apps/web/features/chat/components/research/ResearchReportView.tsx:259`, `apps/web/features/chat/components/research/ResearchReportView.tsx:336`, `apps/web/features/chat/components/research/ResearchReportView.tsx:567`)

## Files to know

| File | Role |
|---|---|
| `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts` | The whole run: plan, search rounds, pause, cancel, writing the report, saving it. |
| `apps/web/app/api/llm/v1/chat/completions/route.ts` | Entry point that starts a research run and wires sources, billing and durable runs. |
| `apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts` | Request schema for research fields, plan gate, domain rules, model support check. |
| `apps/web/app/api/llm/v1/chat/completions/lib/research-run-options.ts` | Connects the loop to report saving and notification. |
| `apps/web/lib/services/research-report-service.ts` | Saves, lists and reads reports in the database. |
| `apps/web/app/api/research/reports/route.ts` | Read API for the report list and a single report. |
| `apps/web/features/chat/components/research/ResearchActivity.tsx` | Status bar, step list, steer, pause, resume, stop controls and source add menu. |
| `apps/web/features/chat/components/research/ResearchPlan.tsx` | Plan editor: questions, steps, deliverable choices, Start. |
| `apps/web/features/chat/components/research/ResearchReportView.tsx` | Report reader: contents, citations, export, Run again, partial banner. |
| `apps/web/features/chat/pages/WebChatPage.tsx` | Web handlers for plan decision, resume, pause and steer. |
| `apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx` | Mobile run card with plan editing, pause, stop, rerun. |
| `apps/mobile/src/features/research/ReportsScreen.tsx` | Mobile list and reader of saved reports. |

## What is stored

- Research reports: query, title, summary, content, citations, steps, key findings, status (pending, researching, synthesizing, completed, interrupted, failed), sources count, duration, error, model, provider, completed time, settled credit cost. One row per user and request id; row-level security keeps each user to their own rows.: database table public.research_reports (apps/web/db/neon/0094_research_reports.sql, 0191_research_report_settled_cost.sql; written in apps/web/lib/services/research-report-service.ts:213)
- Retention rules for research data: apps/web/db/neon/0224_research_retention_domain.sql (named in the migration list; contents not read)
- Run record with run id, used for pause, steer and cancel: cloud agent run service (apps/web/lib/services/cloud-agent-run-service.ts); exact table not read
- Notifications 'Research report ready' / 'did not finish': notification service via apps/web/lib/services/agent-notification-service.ts:209; table not read
- Settled cost retry job when the cost write fails: job queue, kind research.settle-report-cost (apps/web/lib/services/research-report-settlement.ts)
- Research state on the chat message (phase, steps, sources for retry, run settings) so a retry or resume can continue: message metadata in the chat store (read in apps/web/features/chat/pages/WebChatPage.tsx:5964)
- The person's indexed files that research can read: retrieval index (migration 0202 per a code comment); read through research-file-source-service.ts

## Switches

Plan gates, flags and settings that turn parts of this area on or off.

- **deep_research plan gate**: Only pro, max, max_15x, team, team_premium and enterprise can run research; others get 403. (packages/contracts/types/src/billing-catalog.ts:341,355; apps/web/app/api/llm/v1/chat/completions/lib/request-processor.ts:1503)
- **canUseDeepResearch capability**: Hides or disables the toggle on web and mobile; removed for non-eligible plans in the capability handshake. (apps/web/lib/services/capability-handshake-service.ts:120; apps/web/features/chat/components/Composer/ChatComposerNew.tsx:1621; apps/mobile/src/features/chat/components/AddToChatSheet.tsx:235)
- **Model research support**: Research flag, or tools plus a 500,000 context window, is required. (apps/web/features/chat/lib/research-capability-gate.ts:1)
- **FEATURES.research (mobile)**: Mobile switch; set true. (apps/mobile/lib/v1FeatureFlags.ts:24)
- **AGI_RESEARCH_MAX_ITERATIONS, AGI_RESEARCH_MAX_SEARCHES, AGI_RESEARCH_BUDGET_MS, AGI_RESEARCH_MAX_PARALLEL_TOOL_CALLS**: Change run limits (defaults 6, 12, 4 minutes, 3), clamped to fixed ranges. (apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:171-184,1769-1783)
- **Durable initial turns**: Approved research runs may start as a durable workflow when enabled and the transport is not cooling down. (apps/web/app/api/llm/v1/chat/completions/route.ts:631 (areDurableInitialTurnsEnabled))
- **Tool lockdown, tool approval policy, workspace spend limit, workspace site rules**: Can refuse research, ask before tools, stop for budget, or narrow allowed sites. (request-processor.ts:5313; route.ts:446-460,590)
- **Save to library checkbox**: Part of the deliverable settings sent with the plan. (apps/web/features/chat/components/research/ResearchPlan.tsx:235)

## Shared between apps

Shared: the research types and rules (steps, deliverable, report shape, guidance limit) live in packages/contracts/types/src/research.ts; plan-answer text and domain normalisation come from shared packages (@agiworkforce/unified-chat/research-plan, @agiworkforce/cloud-contracts). The server loop and the reports API are one copy used by every app that calls them. The Desktop (Electron) shows the hosted web app, so it uses the same web code. Separate per app: the web React components in apps/web/features/chat/components/research/, and the mobile native screens in apps/mobile/src/features/research/ and apps/mobile/src/features/chat/components/research/. VS Code only has a general cloud-run detail view (apps/extension-vscode/src/features/cloud-tasks/cloudRunDetail.ts), not a research view.

## Looks wrong in the code

From reading only; not confirmed in the running app. Each line is also in the gap register.

- Brief says clarifying questions are missing on all apps (S35.03), but the web plan card shows a 'Before I search' questions form and sends the answers as guidance; the loop parses plan questions. (apps/web/features/chat/components/research/ResearchPlan.tsx:28,95; apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:670)
- Mobile has plan questions, deliverable and source options, but the brief marks deliverable, sources, website and file/connector intake as missing on mobile. (apps/mobile/src/features/chat/components/research/ResearchRunCard.tsx:105; apps/mobile/src/features/chat/components/research/ResearchPlanOptions.tsx:27)
- Many line numbers in the brief are out of date. For example WebChatPage.tsx research handlers are at about lines 5964-6290, not 4700-5160. (apps/web/features/chat/pages/WebChatPage.tsx:6040)
- Paused and cancelled runs both store a report with status 'interrupted' and empty content; a pause is told apart only by the error text. (apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2044,2094; apps/web/features/chat/components/research/ResearchReportView.tsx:507)
- Notifications are sent only for completed and failed, so a cancelled or paused run sends none. (apps/web/lib/services/agent-notification-service.ts:212)
- A failed pause or a missing run id on a run started in the request path leaves the person with only a toast telling them to stop instead. (apps/web/features/chat/pages/WebChatPage.tsx:6044)
- Interactive page is a chat intent match, not a button on the report. (apps/web/features/chat/lib/visual-intent.ts:104)
- Not built, matching the brief: contradictory evidence, adding sources mid-run, attachments, compare revisions, slides, audio, scheduling. (no code found for S35.14, S35.16, S35.24, S35.27, S35.29, S35.30, S35.32)

## Not established

- Where requirePlanApproval is set to true (whether the plan step is always on), I did not trace.
- The exact table behind agent runs, notifications and the pause/steer flag; I saw only the service names.
- The contents of migrations 0224 (retention) and 0202 (retrieval index); I saw only their names or a code comment.
- What Desktop adds beyond the hosted web app for research, and whether the brief's 'desktop done' rests on tests.
- How the mobile app handles the cost estimate or allowance; I found no mobile counterpart of ResearchCostEstimate.
- Whether the Chrome extension can cancel research; the brief says unverified and I did not search it deeply.
- Where 'Stop' for the web run is wired (ResearchActivity.tsx near line 305 and WebChatPage); I did not read the stop handler.
- Whether the Library tab and mobile reports honour the retention rules.
- The exact code that routes the visual/interactive request from a report into Artifacts.
