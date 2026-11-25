---
id: "GAPS-AREA-035"
type: "gap-list"
title: "Gaps: Research workspace"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Gaps: 35. Research workspace

94 open gaps that touch this area. Area page: [20-features/035-research-workspace](../../20-features/035-research-workspace/README.md).

## CMP-C264

**Slash command /deep-research**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: CLI
- Features: [F012-05](../../20-features/012-new-chat-experience/F012-05-search-research-agentic-and-coding-entries.md), [F013-11](../../20-features/013-composer-text-interaction/F013-11-context-chips-selected-sources-and-tools.md), [F035-01](../../20-features/035-research-workspace/F035-01-start-a-research-run-and-see-what-it-may-cost.md), [F035-04](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md), [F036-06](../../20-features/036-sources-and-grounding-interface/F036-06-conflicting-source-presentation.md), [F036-11](../../20-features/036-sources-and-grounding-interface/F036-11-citation-preserving-export.md)
- Detail: No deep-research command; /search answers one question from a web search.
- Evidence: searched: deep-research in apps/cli/src (only plan text)

## CMP-D25

**Reviewer that flags wrong citations and untraceable numbers**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F035-04](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md), [F036-06](../../20-features/036-sources-and-grounding-interface/F036-06-conflicting-source-presentation.md)
- Detail: Citations show as pills and artifacts have a changes review, but nothing checks numbers or citations against their source.
- Evidence: searched: citation check, factCheck in apps/web/features/chat/components/artifacts/review

## CMP-DP72

**Interrupt, or steer a running task by typing a correction**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Desktop
- Features: [F019-01](../../20-features/019-streaming-and-response-presentation-states/F019-01-turn-accepted-queued-and-preparing.md), [F035-05](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md), [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Detail: The message box cannot send while a task runs, so a correction needs Stop first Stop ends the running task; the message box cannot send while a task runs, so a correction needs Stop first.
- Evidence: apps/web/features/code/components/CodeComposer.tsx:1752,1914-1925

## CMP-M43

**Interrupt a running research report to change focus**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md), [F035-05](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md), [F035-09](../../20-features/035-research-workspace/F035-09-export-and-convert-a-report.md)
- Detail: Research can be started and read but not steered during a run.
- Evidence: searched: steer, redirect research in src/features/research, chat/utils/researchRunState.ts

## CMP-M44

**Restrict research to chosen sites**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F034-04](../../20-features/034-search-experiences/F034-04-assistant-searches-the-public-web.md), [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md), [F035-05](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md), [F035-09](../../20-features/035-research-workspace/F035-09-export-and-convert-a-report.md)
- Detail: No way to limit research to chosen sites.
- Evidence: searched: prioritize, preferredSites, allowedDomains in apps/mobile/src, app

## CMP-MP88

**Notification switch for finished research**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Mobile
- Features: [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md), [F035-05](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md), [F035-09](../../20-features/035-research-workspace/F035-09-export-and-convert-a-report.md), [F035-10](../../20-features/035-research-workspace/F035-10-schedule-and-notify.md), [F042-07](../../20-features/042-proactive-assistance-briefings-and-reflection/F042-07-work-completion-notices.md)
- Detail: A Research complete switch shows only when research is on and the server announces the group A Research complete switch shows only when research is on and the server announces the group.
- Evidence: apps/mobile/src/features/settings/notifications/categories.ts:29; apps/mobile/src/features/settings/notifications/categories.ts:64

## CMP-W209

**Company knowledge and search across connected sources**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Detail: No workspace-wide search across connected apps; research reads connected apps only inside a research run.
- Evidence: searched: company knowledge, enterprise search in apps/web, packages/ui

## CMP-W35

**Counter of deep research runs left**

- Kind: missing compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F035-01](../../20-features/035-research-workspace/F035-01-start-a-research-run-and-see-what-it-may-cost.md), [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md), [F082-05](../../20-features/082-usage-dashboard-and-limit-ui/F082-05-voice-image-video-research-storage-and-running-job.md)
- Detail: Research draws on the shared plan usage and only a quota warning header is sent; no remaining-runs counter is shown.
- Evidence: apps/web/app/api/llm/v1/chat/completions/route.ts:677,775 (X-Quota-Warning); searched apps/web (app, features, lib, shared) and packages (ui, contracts, client), tests excluded: research remaining, research quota

## CMP-WP178

**Deep research reads your connected apps**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F009-02](../../20-features/009-compound-interface-components/F009-02-source-project-and-connected-account-pickers.md), [F010-06](../../20-features/010-modal-and-dialog-inventory/F010-06-sources-uploads-and-screen-share.md), [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Detail: Only 13 connectors are released (airtable, canva, clickup, cloudflare, confluence, datadog, jira, linear, monday, notio… The research loop does read connected apps (apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2818), but only 13 connectors are released (airtable, canva, clickup, cloudflare, confluence, datadog, jira, linear, monday, notion, posthog, sentry, todoist: packages/contracts/types/src/connec
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2812-2842

## CMP-WP78

**Company knowledge and enterprise search across connected tools**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F034-05](../../20-features/034-search-experiences/F034-05-search-connected-company-sources.md), [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Detail: There is no single company-knowledge option or ready-made cross-tool search project Connected apps can be switched on per chat and used by research, but there is no single company-knowledge option or ready-made cross-tool search project.
- Evidence: searched: company knowledge, enterprise search in apps/web/features, app (only connector directory json); ComposerPlusMenu.tsx:1420 per-connector toggles

## CMP-WP80

**Research uses connected apps**

- Kind: partly there compared with Claude or ChatGPT (competitor evidence; source: comparison of 2026-11-22)
- Apps: Web
- Features: [F009-02](../../20-features/009-compound-interface-components/F009-02-source-project-and-connected-account-pickers.md), [F010-06](../../20-features/010-modal-and-dialog-inventory/F010-06-sources-uploads-and-screen-share.md), [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md), [F036-11](../../20-features/036-sources-and-grounding-interface/F036-11-citation-preserving-export.md)
- Detail: Research can include connectors, but connectors are mostly Coming soon Research can include connectors, but connectors are mostly Coming soon.
- Evidence: apps/web/features/chat/components/research/ResearchActivity.tsx:218,313; packages/contracts/types/src/connector-release.ts:14

## GAP-AREA035-LW04

**Paused and cancelled runs both store a report with status 'interrupted' and empty content; a pause is told apart only by the error text.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-035
- Detail: Area 35. Research workspace
- Evidence: apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts:2044,2094; apps/web/features/chat/components/research/ResearchReportView.tsx:507

## GAP-AREA035-LW05

**Notifications are sent only for completed and failed, so a cancelled or paused run sends none.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-035
- Detail: Area 35. Research workspace
- Evidence: apps/web/lib/services/agent-notification-service.ts:212

## GAP-AREA035-LW06

**A failed pause or a missing run id on a run started in the request path leaves the person with only a toast telling them to stop instead.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-035
- Detail: Area 35. Research workspace
- Evidence: apps/web/features/chat/pages/WebChatPage.tsx:6044

## GAP-AREA035-LW07

**Interactive page is a chat intent match, not a button on the report.**

- Kind: looks wrong in the code (read in the code; source: area page (code reading))
- Features: AREA-035
- Detail: Area 35. Research workspace
- Evidence: apps/web/features/chat/lib/visual-intent.ts:104

## GAP-CAP-editing-regeneration-and-branching-15

**Interrupt a long research or agent run and add context: Desktop comparison marks interrupt and steer partial; Chrome unverified. A cloud task page showed a stale 'model failed' line after Stop.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F035-05](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md), [F060-07](../../20-features/060-agentic-work-product/F060-07-steer-pause-resume-and-stop.md)
- Requirement items: S35.15, S35.18, S60.20, S60.23
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-research-01

**Start a deep research run: No entry on CLI, VS Code or Chrome. Free users are denied by the capability handshake. Local-mode behaviour of the toggle was not confirmed in code.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F012-05](../../20-features/012-new-chat-experience/F012-05-search-research-agentic-and-coding-entries.md), [F013-11](../../20-features/013-composer-text-interaction/F013-11-context-chips-selected-sources-and-tools.md), [F035-01](../../20-features/035-research-workspace/F035-01-start-a-research-run-and-see-what-it-may-cost.md)
- Requirement items: S12.11, S13.33, S35.01
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-research-02

**Review and edit the research plan before it runs: Objective and deliverable choice (S35.02) is missing on mobile. Nothing on CLI, VS Code, Chrome.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F035-02](../../20-features/035-research-workspace/F035-02-plan-review-questions-and-deliverable.md)
- Requirement items: S35.02, S35.04
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-research-03

**Clarifying questions before research: Ledger and comparison disagree; the code was not re-read to settle it. Mobile has a plan-options component that may cover it.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F035-02](../../20-features/035-research-workspace/F035-02-plan-review-questions-and-deliverable.md)
- Requirement items: S35.03
- Detail: Claude unknown, ChatGPT partly; AGI unknown

## GAP-CAP-research-04

**Choose research sources: web, uploads, connected apps: Comparison marks connected-app research as Partial (WP80, WP178); the exact missing part was not read. Mobile has no source panel.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F009-02](../../20-features/009-compound-interface-components/F009-02-source-project-and-connected-account-pickers.md), [F010-06](../../20-features/010-modal-and-dialog-inventory/F010-06-sources-uploads-and-screen-share.md), [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Requirement items: S10.16, S35.05, S35.07, S35.08, S9.03
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-research-05

**Restrict research to chosen websites: Mobile has no site restriction.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Requirement items: S35.06
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-research-06

**Research through connected apps (read-only): It was not shown that write tools are blocked in research. Comparison says Partial and the exact shortfall was not read.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Requirement items: S35.08
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-research-07

**Research on phones: Mobile lacks source choice, site limits and steering (M43). Ledger says no export; comparison says export exists at ReportsScreen.tsx:499.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md), [F035-05](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md), [F035-09](../../20-features/035-research-workspace/F035-09-export-and-convert-a-report.md)
- Requirement items: S35.05, S35.08, S35.15, S35.28
- Detail: Claude partly, ChatGPT partly; AGI partly built

## GAP-CAP-research-08

**Steer, pause, resume or cancel a run in progress: No steering on mobile; no add-source during a run. A seen defect shows stopping a web-search turn leaves mixed status text.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md), [F035-05](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md)
- Requirement items: S35.15, S35.16, S35.17, S35.18
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-research-09

**Live progress and activity view: none known in code; not confirmed by a person.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F035-04](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md)
- Requirement items: S35.09, S35.10, S35.11
- Detail: Claude unknown, ChatGPT yes; AGI built

## GAP-CAP-research-10

**Cited report with outline and full-screen reader: No conflicting-evidence display; no attachments; no CLI, VS Code or Chrome reader.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F004-99](../../20-features/004-signed-in-application-destinations/F004-99-other-items.md), [F007-06](../../20-features/007-layout-systems/F007-06-full-screen-readers-and-viewers.md), [F035-04](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md), [F035-07](../../20-features/035-research-workspace/F035-07-report-reader.md)
- Requirement items: S35.12, S35.13, S35.14, S35.20, S35.21, S35.22, S35.23, S35.24, S4.32, S7.16
- Detail: Claude yes, ChatGPT yes; AGI partly built

## GAP-CAP-research-11

**Export a research report: Mobile ledger and comparison disagree. Citation-preserving export is missing on mobile (S36.25).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F035-09](../../20-features/035-research-workspace/F035-09-export-and-convert-a-report.md), [F036-11](../../20-features/036-sources-and-grounding-interface/F036-11-citation-preserving-export.md)
- Requirement items: S35.28, S36.25
- Detail: Claude unknown, ChatGPT yes; AGI partly built

## GAP-CAP-research-12

**Research history, reopen and rerun: Comparing report revisions (S35.27) is missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F004-99](../../20-features/004-signed-in-application-destinations/F004-99-other-items.md), [F035-06](../../20-features/035-research-workspace/F035-06-partial-report.md), [F035-08](../../20-features/035-research-workspace/F035-08-history-run-again-and-compare.md)
- Requirement items: S35.19, S35.25, S35.26, S4.32
- Detail: Claude unknown, ChatGPT partly; AGI partly built

## GAP-CAP-research-13

**Research allowance, cost estimate and limits: Comparison W35 says the counter of runs left is Missing while ledger S35.34 says done; they conflict. Mobile has no allowance view.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F035-01](../../20-features/035-research-workspace/F035-01-start-a-research-run-and-see-what-it-may-cost.md), [F082-03](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md), [F082-05](../../20-features/082-usage-dashboard-and-limit-ui/F082-05-voice-image-video-research-storage-and-running-job.md)
- Requirement items: S35.34, S82.05, S82.09
- Detail: Claude partly, ChatGPT yes; AGI partly built

## GAP-CAP-research-18

**Claim cross-checking in research: No claim voting, no unverified list, no side-by-side evidence. The reviewer that flags wrong citations (D25) is missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F035-04](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md), [F036-06](../../20-features/036-sources-and-grounding-interface/F036-06-conflicting-source-presentation.md)
- Requirement items: S35.14, S36.18
- Detail: Claude yes, ChatGPT unknown; AGI not built

## GAP-CAP-research-19

**Delegated and parallel research agents: CLI, VS Code and Chrome have no research run (S35.01 missing for the three).**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F035-01](../../20-features/035-research-workspace/F035-01-start-a-research-run-and-see-what-it-may-cost.md)
- Requirement items: S35.01
- Detail: Claude yes, ChatGPT unknown; AGI unknown

## GAP-CAP-research-26

**Completion notice and scheduled research: No scheduling; mobile switch partial.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F035-10](../../20-features/035-research-workspace/F035-10-schedule-and-notify.md)
- Requirement items: S35.32, S35.33
- Detail: Claude unknown, ChatGPT unknown; AGI partly built

## GAP-CAP-research-27

**Report to interactive page and other outputs: Slides and audio missing; mobile missing.**

- Kind: behind a competitor (competitor evidence; source: competitor trace)
- Features: [F035-09](../../20-features/035-research-workspace/F035-09-export-and-convert-a-report.md), [F110-03](../../20-features/110-cross-product-experiences-to-include-in-the-product-map/F110-03-research-outputs-audio-overview-and-interactive-pa.md)
- Requirement items: S110.05, S35.29, S35.30, S35.31
- Detail: Claude unknown, ChatGPT unknown; AGI partly built

## GAP-F035-01-01

**Estimate not shown before sending and not on mobile**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-01](../../20-features/035-research-workspace/F035-01-start-a-research-run-and-see-what-it-may-cost.md)
- Detail: Affects: Web composer users, all mobile users. Work needed: Add the estimate and available credits to the mobile plan card and optionally the composer
- Evidence: ResearchPlan.tsx:321; no estimate code in apps/mobile research folder

## GAP-F035-01-02

**Estimate uses the picked model, not the serving model**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-01](../../20-features/035-research-workspace/F035-01-start-a-research-run-and-see-what-it-may-cost.md)
- Detail: Affects: Auto and routed turns. Work needed: Use the resolved serving model or say it is approximate
- Evidence: ResearchActivity.tsx:277-281

## GAP-F035-01-03

**Mobile gate stricter than web gate**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-01](../../20-features/035-research-workspace/F035-01-start-a-research-run-and-see-what-it-may-cost.md)
- Detail: Affects: Mobile users with large-context tool models. Work needed: Share one gate
- Evidence: AddToChatSheet.tsx:230-235 vs research-capability-gate.ts:5

## GAP-F035-01-04

**CLI, VS Code and Chrome cannot start research**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-01](../../20-features/035-research-workspace/F035-01-start-a-research-run-and-see-what-it-may-cost.md)
- Detail: Affects: Those apps. Work needed: Product decision and client work
- Evidence: no research flag in apps/cli/src, extension sources

## GAP-F035-01-05

**Mobile shows no upgrade hint for Free users (toggle just hidden)**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-01](../../20-features/035-research-workspace/F035-01-start-a-research-run-and-see-what-it-may-cost.md)
- Detail: Affects: Mobile Free users. Work needed: Show a disabled row with an upgrade hint
- Evidence: AddToChatSheet.tsx:230-236

## GAP-F035-01-NOTBUILT

**Start a research run and see what it may cost: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F035-01](../../20-features/035-research-workspace/F035-01-start-a-research-run-and-see-what-it-may-cost.md)
- Requirement items: S35.01, S35.34
- Detail: Mobile: S35.34; CLI: S35.01, S35.34; VS Code: S35.01, S35.34; Chrome: S35.01, S35.34

## GAP-F035-02-01

**Save to library tick has no effect**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-02](../../20-features/035-research-workspace/F035-02-plan-review-questions-and-deliverable.md)
- Detail: Affects: Web users. Work needed: Save the report to the library when ticked, or remove the control
- Evidence: grep: saveToLibrary appears only in research.ts:283-321 and ResearchPlan.tsx:294

## GAP-F035-02-02

**Mobile missing minimum sources, stop rule and save tick**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-02](../../20-features/035-research-workspace/F035-02-plan-review-questions-and-deliverable.md)
- Detail: Affects: Mobile. Work needed: Add controls or document the difference
- Evidence: ResearchPlanOptions.tsx has depth, format, sources only

## GAP-F035-02-03

**Guidance re-plan may overwrite edited steps**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-02](../../20-features/035-research-workspace/F035-02-plan-review-questions-and-deliverable.md)
- Detail: Affects: Web and mobile users who answer questions. Work needed: Keep approved steps and append guidance
- Evidence: research-loop.ts:2906-2960

## GAP-F035-02-04

**Brief rows stale**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-02](../../20-features/035-research-workspace/F035-02-plan-review-questions-and-deliverable.md)
- Detail: Affects: Documentation. Work needed: Update the brief rows
- Evidence: brief S35.02/S35.03 versus ResearchPlan.tsx

## GAP-F035-02-05

**No plan card on CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-02](../../20-features/035-research-workspace/F035-02-plan-review-questions-and-deliverable.md)
- Detail: Affects: Those apps. Work needed: Decide scope
- Evidence: no research code

## GAP-F035-02-NOTBUILT

**Plan review, questions and deliverable: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F035-02](../../20-features/035-research-workspace/F035-02-plan-review-questions-and-deliverable.md)
- Requirement items: S35.02, S35.03, S35.04
- Detail: Web: S35.03; Desktop: S35.03; Mobile: S35.02, S35.03; CLI: S35.02, S35.03, S35.04; VS Code: S35.02, S35.03, S35.04; Chrome: S35.02, S35.03, S35.04

## GAP-F035-03-01

**Cannot add sources to a running run**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Detail: Affects: All apps. Work needed: Allow it while paused or via steer
- Evidence: sources UI only when plan waits (ResearchActivity.tsx:680); no endpoint

## GAP-F035-03-02

**Brief marks mobile missing though mobile has controls**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Detail: Affects: Documentation. Work needed: Update the brief
- Evidence: ResearchPlanOptions.tsx:272-316

## GAP-F035-03-03

**Mobile has no My files label check or per-source outcome display**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Detail: Affects: Mobile. Work needed: Show outcomes
- Evidence: unknown depth of outcome display (not found)

## GAP-F035-03-04

**No CLI, VS Code, Chrome controls**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Detail: Affects: Those apps. Work needed: Decide scope
- Evidence: no code

## GAP-F035-03-NOTBUILT

**Choose and restrict sources: not built on Web, Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code, Chrome
- Features: [F035-03](../../20-features/035-research-workspace/F035-03-choose-and-restrict-sources.md)
- Requirement items: S35.05, S35.06, S35.07, S35.08, S35.16
- Detail: Web: S35.16; Desktop: S35.16; CLI: S35.05, S35.06, S35.07, S35.08, S35.16; VS Code: S35.05, S35.06, S35.07, S35.08, S35.16; Chrome: S35.05, S35.06, S35.07, S35.08, S35.16

## GAP-F035-04-01

**Findings not grouped under questions**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-04](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md)
- Detail: Affects: Web, desktop, mobile. Work needed: Map findings and citations to plan steps
- Evidence: ResearchReportView.tsx:529,539; ResearchRunCard.tsx:572

## GAP-F035-04-02

**Contradictory evidence not shown**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-04](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md)
- Detail: Affects: All apps. Work needed: Detect and display conflicts
- Evidence: no code found

## GAP-F035-04-03

**Gaps block unreachable in the chat plan card**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-04](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md)
- Detail: Affects: Web. Work needed: Show gaps on the finished run or remove the block
- Evidence: ResearchActivity.tsx:799 only renders editable plan

## GAP-F035-04-04

**Answered test is word overlap**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-04](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md)
- Detail: Affects: All. Work needed: Better coverage check
- Evidence: research-loop.ts:590-640

## GAP-F035-04-05

**No progress view on CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-04](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md)
- Detail: Affects: Those apps. Work needed: Decide scope
- Evidence: no code

## GAP-F035-04-NOTBUILT

**Watch the run: progress, timeline, sources and findings: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F035-04](../../20-features/035-research-workspace/F035-04-watch-the-run-progress-timeline-sources-and-findin.md)
- Requirement items: S35.09, S35.10, S35.11, S35.12, S35.13, S35.14
- Detail: Web: S35.14; Desktop: S35.14; Mobile: S35.14; CLI: S35.09, S35.10, S35.11, S35.12, S35.13, S35.14; VS Code: S35.10, S35.11, S35.12, S35.13, S35.14; Chrome: S35.10, S35.11, S35.12, S35.13, S35.14

## GAP-F035-05-01

**No Steer on mobile research card**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-05](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md)
- Detail: Affects: Mobile. Work needed: Add a steer control using the cloud run client
- Evidence: no steer call in ResearchRunCard.tsx

## GAP-F035-05-02

**Pause ignored during the writing turn**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-05](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md)
- Detail: Affects: All apps. Work needed: Honour or refuse with a clear message
- Evidence: research-loop.ts:3171

## GAP-F035-05-03

**VS Code has no Pause or Resume for research**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-05](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md)
- Detail: Affects: VS Code. Work needed: Add actions
- Evidence: cloudRunDetail.ts:154-181

## GAP-F035-05-04

**Chrome research control unverified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-05](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md)
- Detail: Affects: Chrome. Work needed: Verify or build
- Evidence: only a generic managed run test

## GAP-F035-05-05

**Mobile Resume lacks a guidance note**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-05](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md)
- Detail: Affects: Mobile. Work needed: Add the optional note
- Evidence: ResearchRunCard.tsx:679

## GAP-F035-05-NOTBUILT

**Steer, pause, resume and cancel: not built on Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Mobile, CLI, VS Code, Chrome
- Features: [F035-05](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md)
- Requirement items: S35.15, S35.17, S35.18
- Detail: Mobile: S35.15; CLI: S35.15, S35.17, S35.18; VS Code: S35.15, S35.17; Chrome: S35.15, S35.17

## GAP-F035-05-PARTLY

**Steer, pause, resume and cancel: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F035-05](../../20-features/035-research-workspace/F035-05-steer-pause-resume-and-cancel.md)
- Requirement items: S35.18

## GAP-F035-06-01

**Stop and pause give no written partial text**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-06](../../20-features/035-research-workspace/F035-06-partial-report.md)
- Detail: Affects: All apps. Work needed: Write a short report from gathered sources or label the result as sources only
- Evidence: research-loop.ts:2044,2094

## GAP-F035-06-02

**Mobile lacks paused banner**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-06](../../20-features/035-research-workspace/F035-06-partial-report.md)
- Detail: Affects: Mobile. Work needed: Use isPausedResearchReport
- Evidence: ReportsScreen.tsx:214,391

## GAP-F035-06-03

**Interrupted reports send no notification**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-06](../../20-features/035-research-workspace/F035-06-partial-report.md)
- Detail: Affects: All apps. Work needed: Decide and document
- Evidence: agent-notification-service.ts:214

## GAP-F035-06-04

**Resume creates a second row**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-06](../../20-features/035-research-workspace/F035-06-partial-report.md)
- Detail: Affects: Library users. Work needed: Link or merge resumed reports
- Evidence: unique (user_id, request_id) and new request id

## GAP-F035-06-05

**Migrations 0191 and 0224 marked not applied**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-06](../../20-features/035-research-workspace/F035-06-partial-report.md)
- Detail: Affects: Cost on report and retention. Work needed: Confirm apply status
- Evidence: migration headers

## GAP-F035-06-06

**No report reader on CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-06](../../20-features/035-research-workspace/F035-06-partial-report.md)
- Detail: Affects: Those apps. Work needed: Decide scope
- Evidence: docs/product/surface-feature-matrix.md:277

## GAP-F035-06-NOTBUILT

**Partial report: not built on CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: CLI, VS Code, Chrome
- Features: [F035-06](../../20-features/035-research-workspace/F035-06-partial-report.md)
- Requirement items: S35.19
- Detail: CLI: S35.19; VS Code: S35.19; Chrome: S35.19

## GAP-F035-07-01

**Supporting attachments are not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-07](../../20-features/035-research-workspace/F035-07-report-reader.md)
- Detail: Affects: All apps. Work needed: Design storage, show list in reader, open and download.
- Evidence: brief S35.24; no attachment code found

## GAP-F035-07-02

**Mobile header lacks source count, duration and cost**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-07](../../20-features/035-research-workspace/F035-07-report-reader.md)
- Detail: Affects: Mobile. Work needed: Add a meta line in ReportDetail.
- Evidence: ReportsScreen.tsx:278-500 vs ResearchReportView.tsx:338-349

## GAP-F035-07-03

**Brief says reading mode is a wider layout; code opens a full-screen dialog with a max-w-3xl column**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-07](../../20-features/035-research-workspace/F035-07-report-reader.md)
- Detail: Affects: Web, public Desktop. Work needed: Correct the brief or product text; no code change needed.
- Evidence: ResearchReportView.tsx:327,694-709

## GAP-F035-07-04

**Charts in PDF and Word exports not established**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-07](../../20-features/035-research-workspace/F035-07-report-reader.md)
- Detail: Affects: Web. Work needed: Check export of mermaid blocks and add rendering if absent.
- Evidence: No chart handling found in export path read

## GAP-F035-07-05

**No reader on CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-07](../../20-features/035-research-workspace/F035-07-report-reader.md)
- Detail: Affects: Those apps. Work needed: Decide whether a link to the web report suffices.
- Evidence: docs/product/surface-feature-matrix.md

## GAP-F035-07-NOTBUILT

**Report reader: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F035-07](../../20-features/035-research-workspace/F035-07-report-reader.md)
- Requirement items: S35.20, S35.21, S35.22, S35.23, S35.24
- Detail: Web: S35.24; Desktop: S35.24; Mobile: S35.24; CLI: S35.20, S35.21, S35.22, S35.23, S35.24; VS Code: S35.20, S35.21, S35.22, S35.23, S35.24; Chrome: S35.20, S35.21, S35.22, S35.23, S35.24

## GAP-F035-08-01

**Compare revisions is not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-08](../../20-features/035-research-workspace/F035-08-history-run-again-and-compare.md)
- Detail: Affects: All apps. Work needed: Link reruns to the original and add a diff view.
- Evidence: brief S35.27

## GAP-F035-08-02

**Run again missing in Library detail and mobile Reports detail**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-08](../../20-features/035-research-workspace/F035-08-history-run-again-and-compare.md)
- Detail: Affects: Web, mobile. Work needed: Pass onRunAgain in the gallery; add a button on mobile.
- Evidence: ResearchReportsGallery.tsx:176; ReportsScreen.tsx ReportDetail

## GAP-F035-08-03

**Chrome status unverified; no CLI or VS Code list**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-08](../../20-features/035-research-workspace/F035-08-history-run-again-and-compare.md)
- Detail: Affects: Chrome, CLI, VS Code. Work needed: Decide scope; verify Chrome.
- Evidence: brief; grep of apps/extension found no reports API use

## GAP-F035-08-04

**No search or filter in the list**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-08](../../20-features/035-research-workspace/F035-08-history-run-again-and-compare.md)
- Detail: Affects: Web, mobile. Work needed: Add search once volume warrants.
- Evidence: No code found

## GAP-F035-08-NOTBUILT

**History, run again and compare: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F035-08](../../20-features/035-research-workspace/F035-08-history-run-again-and-compare.md)
- Requirement items: S35.25, S35.26, S35.27
- Detail: Web: S35.27; Desktop: S35.27; Mobile: S35.27; CLI: S35.25, S35.26, S35.27; VS Code: S35.26, S35.27; Chrome: S35.25, S35.26, S35.27

## GAP-F035-08-PARTLY

**History, run again and compare: partly built on Chrome**

- Kind: partly built (read in the code; source: capability ledger)
- Apps: Chrome
- Features: [F035-08](../../20-features/035-research-workspace/F035-08-history-run-again-and-compare.md)
- Requirement items: S35.25

## GAP-F035-09-01

**Library button is never shown on web**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-09](../../20-features/035-research-workspace/F035-09-export-and-convert-a-report.md)
- Detail: Affects: Web. Work needed: Wire it to the library write path or delete the dead control.
- Evidence: No caller passes onSaveToLibrary (ResearchPanel.tsx:306-311; ResearchReportsGallery.tsx:176)

## GAP-F035-09-02

**Brief says mobile export missing but code has it**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-09](../../20-features/035-research-workspace/F035-09-export-and-convert-a-report.md)
- Detail: Affects: Brief accuracy. Work needed: Update brief status after a device check.
- Evidence: ReportsScreen.tsx:343-351

## GAP-F035-09-03

**Interactive page is not a reader action and does not carry the report**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-09](../../20-features/035-research-workspace/F035-09-export-and-convert-a-report.md)
- Detail: Affects: Web, public Desktop. Work needed: Add reader action that sends report plus request.
- Evidence: visual-intent.ts classifies prompt only

## GAP-F035-09-04

**Slides and audio overview not built**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-09](../../20-features/035-research-workspace/F035-09-export-and-convert-a-report.md)
- Detail: Affects: All apps. Work needed: Product decision, then build.
- Evidence: briefs S35.29, S35.30

## GAP-F035-09-05

**Charts in PDF/Word unverified**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-09](../../20-features/035-research-workspace/F035-09-export-and-convert-a-report.md)
- Detail: Affects: Web. Work needed: Test and implement.
- Evidence: Not found in export path

## GAP-F035-09-NOTBUILT

**Export and convert a report: not built on Web, Desktop, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, CLI, VS Code, Chrome
- Features: [F035-09](../../20-features/035-research-workspace/F035-09-export-and-convert-a-report.md)
- Requirement items: S35.28, S35.29, S35.30, S35.31
- Detail: Web: S35.29, S35.30; Desktop: S35.29, S35.30; CLI: S35.28, S35.29, S35.30, S35.31; VS Code: S35.28, S35.29, S35.30, S35.31; Chrome: S35.28, S35.29, S35.30, S35.31

## GAP-F035-10-01

**No scheduled recurring research**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-10](../../20-features/035-research-workspace/F035-10-schedule-and-notify.md)
- Detail: Affects: All apps. Work needed: Build a schedule type for research runs.
- Evidence: brief S35.32

## GAP-F035-10-02

**Web notice opens the chat, not the report tab**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-10](../../20-features/035-research-workspace/F035-10-schedule-and-notify.md)
- Detail: Affects: Web, public Desktop. Work needed: Open the Report tab or a report URL.
- Evidence: product-link-resolver.ts:117

## GAP-F035-10-03

**Mobile push may not open the chat's report because conversation id is not sent**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-10](../../20-features/035-research-workspace/F035-10-schedule-and-notify.md)
- Detail: Affects: Mobile. Work needed: Pass conversationId and runId.
- Evidence: research-run-options.ts:88-95 vs notifications.ts:536

## GAP-F035-10-04

**Failed-run push routing on mobile unconfirmed**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-10](../../20-features/035-research-workspace/F035-10-schedule-and-notify.md)
- Detail: Affects: Mobile. Work needed: Trace the handler and test.
- Evidence: type agent_failed at agent-notification-service.ts:251

## GAP-F035-10-05

**No notice on CLI, VS Code, Chrome**

- Kind: current behaviour differs from required (read in the code; source: feature page (code reading))
- Features: [F035-10](../../20-features/035-research-workspace/F035-10-schedule-and-notify.md)
- Detail: Affects: Those apps. Work needed: Decide scope.
- Evidence: brief S35.33

## GAP-F035-10-NOTBUILT

**Schedule and notify: not built on Web, Desktop, Mobile, CLI, VS Code, Chrome**

- Kind: not built on an app (read in the code; source: capability ledger)
- Apps: Web, Desktop, Mobile, CLI, VS Code, Chrome
- Features: [F035-10](../../20-features/035-research-workspace/F035-10-schedule-and-notify.md)
- Requirement items: S35.32, S35.33
- Detail: Web: S35.32; Desktop: S35.32; Mobile: S35.32; CLI: S35.32, S35.33; VS Code: S35.32, S35.33; Chrome: S35.32, S35.33
