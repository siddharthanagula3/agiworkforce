---
id: "REQ-AREA-082"
type: "requirements"
title: "Requirement items: Usage dashboard and limit UI"
basis: "established: acceptance criteria recorded in the project's capability ledger"
source: "audit/ledger/ecosystem-capability-ledger.jsonl"
last_reviewed: "2026-11-24"
revision: "f51d16e747"
---
# Requirement items: 82. Usage dashboard and limit UI

33 items. Each is an established requirement: the acceptance criterion recorded for it in the project's capability ledger (`audit/ledger/ecosystem-capability-ledger.jsonl`). The status per app is what reading the code found; a result from a real run is given where one exists.

## S82.01

**Current plan.** Every signed-in surface shows the account's current plan, read from the server.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web PASS
- Feature: [F082-01 Plan and billing period](../../20-features/082-usage-dashboard-and-limit-ui/F082-01-plan-and-billing-period.md)
- Competitor trace: CAP-usage-limits-07, CAP-usage-limits-20

## S82.02

**Billing period.** Users can see the current billing period: when it renews or ends.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F082-01 Plan and billing period](../../20-features/082-usage-dashboard-and-limit-ui/F082-01-plan-and-billing-period.md)
- Competitor trace: CAP-usage-limits-05

## S82.03

**Overall usage meter.** An overall usage meter shows how much of the plan allowance is used.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web BLOCKED
- Feature: [F082-02 Usage meters and reset times](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md)
- Competitor trace: CAP-usage-limits-01, CAP-usage-limits-02, CAP-usage-limits-04, CAP-usage-limits-05, CAP-usage-limits-20, CAP-usage-limits-22, CAP-usage-limits-26

## S82.04

**Per-model usage.** Users can see usage broken down by model (at least the flagship-model cap and per-model spend).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web BLOCKED
- Feature: [F082-03 Usage by model, feature, work and project](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Competitor trace: CAP-usage-limits-03, CAP-usage-limits-20

## S82.05

**Per-feature usage.** Users can see usage broken down by feature/product area (chat, work, research, code, browser).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Seen in a real run: Web BLOCKED
- Feature: [F082-03 Usage by model, feature, work and project](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Competitor trace: CAP-research-13, CAP-usage-limits-20, CAP-usage-limits-23

## S82.06

**Voice usage.** Users can see their voice usage (minutes used against any voice allowance).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F082-05 Voice, image, video, research, storage and running jobs](../../20-features/082-usage-dashboard-and-limit-ui/F082-05-voice-image-video-research-storage-and-running-job.md)

## S82.07

**Image usage.** Users can see their image-generation usage.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F082-05 Voice, image, video, research, storage and running jobs](../../20-features/082-usage-dashboard-and-limit-ui/F082-05-voice-image-video-research-storage-and-running-job.md)

## S82.08

**Video usage.** Users can see their video-generation usage (seconds used against the allowance).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F082-05 Voice, image, video, research, storage and running jobs](../../20-features/082-usage-dashboard-and-limit-ui/F082-05-voice-image-video-research-storage-and-running-job.md)

## S82.09

**Research usage.** Users can see how much of their usage went to research (Deep Research).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F082-05 Voice, image, video, research, storage and running jobs](../../20-features/082-usage-dashboard-and-limit-ui/F082-05-voice-image-video-research-storage-and-running-job.md)
- Competitor trace: CAP-research-13

## S82.10

**Coding/work usage.** Users can see how much of their usage went to coding and agentic work.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F082-03 Usage by model, feature, work and project](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Competitor trace: CAP-usage-limits-22, CAP-usage-limits-23

## S82.11

**Storage usage.** Users can see storage used against their plan storage limit.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F082-05 Voice, image, video, research, storage and running jobs](../../20-features/082-usage-dashboard-and-limit-ui/F082-05-voice-image-video-research-storage-and-running-job.md)

## S82.12

**Active-job count.** Users can see how many jobs/responses are running now, ideally against their plan's concurrent limit.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F082-05 Voice, image, video, research, storage and running jobs](../../20-features/082-usage-dashboard-and-limit-ui/F082-05-voice-image-video-research-storage-and-running-job.md)

## S82.13

**Remaining credits.** Users can see how many credits remain (plan windows and purchased balance).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Seen in a real run: Web BLOCKED
- Feature: [F082-06 Credit balances: included, purchased, bonus and expiry](../../20-features/082-usage-dashboard-and-limit-ui/F082-06-credit-balances-included-purchased-bonus-and-expir.md)
- Competitor trace: CAP-usage-limits-20

## S82.14

**Purchased versus included credits.** Users can tell purchased credits apart from the plan's included allowance.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F082-06 Credit balances: included, purchased, bonus and expiry](../../20-features/082-usage-dashboard-and-limit-ui/F082-06-credit-balances-included-purchased-bonus-and-expir.md)
- Competitor trace: CAP-usage-limits-20

## S82.15

**Promotional credits.** Users can see promotional/bonus credits they were given, how much remains and when they lapse.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F082-06 Credit balances: included, purchased, bonus and expiry](../../20-features/082-usage-dashboard-and-limit-ui/F082-06-credit-balances-included-purchased-bonus-and-expir.md)
- Competitor trace: CAP-usage-limits-18

## S82.16

**Credit-expiry information.** Users can see when each kind of credit expires (plan allowance reset, purchased balance lifetime, bonus lapse).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Feature: [F082-06 Credit balances: included, purchased, bonus and expiry](../../20-features/082-usage-dashboard-and-limit-ui/F082-06-credit-balances-included-purchased-bonus-and-expir.md)
- Competitor trace: CAP-usage-limits-18

## S82.17

**Reset countdown.** Each usage window shows how long until it resets.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F082-02 Usage meters and reset times](../../20-features/082-usage-dashboard-and-limit-ui/F082-02-usage-meters-and-reset-times.md)
- Competitor trace: CAP-usage-limits-01, CAP-usage-limits-02, CAP-usage-limits-06

## S82.18

**Daily/weekly/monthly history.** Users can review usage history by day, week and month.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done
- Seen in a real run: Web BLOCKED
- Feature: [F082-07 Usage history, export and discrepancy report](../../20-features/082-usage-dashboard-and-limit-ui/F082-07-usage-history-export-and-discrepancy-report.md)
- Competitor trace: CAP-usage-limits-20

## S82.19

**Usage by Project.** Users can see usage broken down by project.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile missing
- Feature: [F082-03 Usage by model, feature, work and project](../../20-features/082-usage-dashboard-and-limit-ui/F082-03-usage-by-model-feature-work-and-project.md)
- Competitor trace: CAP-usage-limits-20

## S82.20

**Usage by task.** Users can see usage per task (agent run / work session).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F082-04 Usage by task and by device or surface](../../20-features/082-usage-dashboard-and-limit-ui/F082-04-usage-by-task-and-by-device-or-surface.md)
- Competitor trace: CAP-usage-limits-21

## S82.21

**Usage by device or surface where useful.** Where useful, users can see usage broken down by device or surface (web, desktop, mobile, CLI, IDE, extension).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing
- Feature: [F082-04 Usage by task and by device or surface](../../20-features/082-usage-dashboard-and-limit-ui/F082-04-usage-by-task-and-by-device-or-surface.md)

## S82.22

**Estimated task cost.** Before or while a task runs, the user sees an estimate of what it will cost.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F082-08 Task cost estimate and actual cost](../../20-features/082-usage-dashboard-and-limit-ui/F082-08-task-cost-estimate-and-actual-cost.md)
- Competitor trace: CAP-usage-limits-08, CAP-usage-limits-21

## S82.23

**Actual task cost.** After a task finishes, the user sees what it actually cost.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done
- Feature: [F082-08 Task cost estimate and actual cost](../../20-features/082-usage-dashboard-and-limit-ui/F082-08-task-cost-estimate-and-actual-cost.md)
- Competitor trace: CAP-usage-limits-08, CAP-usage-limits-21

## S82.24

**Budget warning.** Users are warned before they hit a usage limit.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F082-09 Limit warnings and blocked state](../../20-features/082-usage-dashboard-and-limit-ui/F082-09-limit-warnings-and-blocked-state.md)
- Competitor trace: CAP-usage-limits-10, CAP-usage-limits-29

## S82.25

**Budget-reached state.** When a limit is reached the user sees a clear blocked state explaining which limit and what they can do.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F082-09 Limit warnings and blocked state](../../20-features/082-usage-dashboard-and-limit-ui/F082-09-limit-warnings-and-blocked-state.md)
- Competitor trace: CAP-usage-limits-11

## S82.26

**Alternative eligible model suggestion.** When a limit or plan blocks the chosen model, the user is offered an eligible alternative model.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F082-09 Limit warnings and blocked state](../../20-features/082-usage-dashboard-and-limit-ui/F082-09-limit-warnings-and-blocked-state.md)
- Competitor trace: CAP-usage-limits-11, CAP-usage-limits-25

## S82.27

**Wait-until-reset option.** At a limit, the user is offered waiting until the reset, with the reset time, as an alternative to paying.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done, Mobile done, CLI done, VS Code done, Chrome done
- Feature: [F082-09 Limit warnings and blocked state](../../20-features/082-usage-dashboard-and-limit-ui/F082-09-limit-warnings-and-blocked-state.md)
- Competitor trace: CAP-usage-limits-11

## S82.28

**Resume-after-reset preference.** Users can choose to have blocked work resume automatically (or be notified) once their limit resets.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web missing, Desktop missing, Mobile missing
- Feature: [F082-12 Resume-after-reset preference](../../20-features/082-usage-dashboard-and-limit-ui/F082-12-resume-after-reset-preference.md)
- Competitor trace: CAP-usage-limits-13

## S82.29

**Extra-usage purchase.** Users can buy extra usage (credits) when they run out, from where they hit the limit.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F082-10 Buying extra usage and auto-reload](../../20-features/082-usage-dashboard-and-limit-ui/F082-10-buying-extra-usage-and-auto-reload.md)
- Competitor trace: CAP-usage-limits-14, CAP-usage-limits-15

## S82.30

**Auto-reload settings.** Users can turn on automatic credit reload (top up when the balance falls below a threshold) and configure it.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F082-10 Buying extra usage and auto-reload](../../20-features/082-usage-dashboard-and-limit-ui/F082-10-buying-extra-usage-and-auto-reload.md)
- Competitor trace: CAP-usage-limits-16

## S82.31

**Spending cap.** An owner can set a spending cap that stops managed usage once reached.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F082-11 Workspace spending cap](../../20-features/082-usage-dashboard-and-limit-ui/F082-11-workspace-spending-cap.md)
- Competitor trace: CAP-usage-limits-17, CAP-usage-limits-27

## S82.32

**Download usage report.** Users can download a usage report (e.g. CSV).

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Seen in a real run: Web BLOCKED
- Feature: [F082-07 Usage history, export and discrepancy report](../../20-features/082-usage-dashboard-and-limit-ui/F082-07-usage-history-export-and-discrepancy-report.md)
- Competitor trace: CAP-usage-limits-31

## S82.33

**Billing discrepancy report.** Users can report a billing or usage discrepancy and have it tracked.

- Status in the code (capability ledger, audit of 2026-09-26 and later updates): Web done, Desktop done
- Feature: [F082-07 Usage history, export and discrepancy report](../../20-features/082-usage-dashboard-and-limit-ui/F082-07-usage-history-export-and-discrepancy-report.md)
- Competitor trace: CAP-usage-limits-31
