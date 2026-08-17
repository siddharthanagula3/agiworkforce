# Scheduled Tasks & Automation — 2026-08-15

Benchmark: live-observed ChatGPT, Claude, Gemini, Manus (2026-08-15) vs. AGI Workforce.
23 claims audited (sched-01…sched-23). Prior-audit cross-reference:
`audit/parity-2026-08-15/gaps/domain-agentic-work.json` / `.md` (7 rows, AGENTIC-WORK-001…007).

## Surfaces inspected

- **Web (flagship, primary competitive surface)** — `/chat/schedules`
  (`apps/web/features/schedules/**`, reachable via nav in
  `WebChatPage.tsx`/`WebShellV3.tsx`) for recurring text-only cron tasks, and
  `/tasks` (`apps/web/features/tasks/**` → shared
  `packages/ui/unified-chat/src/components/tasks/**`) for AGI Work / Research
  agent-run history — the closer analog to Gemini's live "Spark" task panel.
- **Mobile** — `apps/mobile/app/(app)/schedules/**` +
  `apps/mobile/src/features/schedules/**`. Has real capability web lacks
  (natural-language quick-composer, starter templates) — cited throughout as
  cross-surface evidence, not as satisfying the web-facing claim.
- **Desktop** — `apps/desktop/src/features/scheduler/**`, a _local_ scheduler
  store (`useSchedulerStore`), architecturally separate from Managed Cloud
  schedules. Has its own status-filter tabs and example-task list, again not
  ported to web.

Because the benchmark products were tested as web apps, gap severity below is
scored against the **web** surface; mobile/desktop divergence is called out
explicitly wherever it changes the picture (a capability that exists on one
surface and not on the flagship one is a porting/consistency gap, not a
green check).

## Method notes

- `/chat/schedules` schedules are explicitly labeled in-product as
  "Text Output / Managed Models / No Chat Memory / No Tools"
  (`SchedulesPage.tsx:384-389`) and the create-form banner repeats this
  (`ScheduleForm.tsx:110-115`). This is the root cause behind several claims
  below (sched-05, 07, 12, 13, 14, 17) — it is the same fact the prior audit
  already filed as **AGENTIC-WORK-007** ("Scheduled task execution has no
  tool access", P1, `scheduled-agent-executor.ts:88-135`). I have not
  re-filed that as a fresh P1; where a sched-\* claim is just this same fact
  observed from a different angle, I cite it as `CONFIRMS_PRIOR` and keep
  severity at or below what's already on record, to avoid double-counting
  the same underlying defect at inflated severity.
- `/tasks` (AGI Work run history) is a materially richer, better-built
  surface than `/chat/schedules` and is the correct point of comparison for
  several Gemini "live task panel" claims (sched-09, 11, 13, 14, 15, 21, 22).
  Conflating the two surfaces would have produced false MISSING verdicts for
  capabilities that are actually present, just on the other page.

## Claim-by-claim findings

### sched-01 — Real-task/suggested-template split with divider — MISSING (web) — P1

`SchedulesPage.tsx:432-443` — the only empty state is "No schedules yet" +
a single "Create Your First Schedule" button. No template list, no divider,
in any state (empty or populated). Confirmed by `grep -rin
"template|suggest" apps/web/features/schedules/` → zero hits.

Mobile (`apps/mobile/app/(app)/schedules/index.tsx:310-367`) and Desktop
(`apps/desktop/src/features/scheduler/ScheduledTasksPanel.tsx:198-243`) both
_do_ have a starter-template list with dashed-border cards — but neither
matches the benchmark pattern exactly: both show templates **only in the
empty state** (`schedules.length === 0 ? templates : real list`), never
alongside real tasks below a divider the way ChatGPT/Claude/Gemini do. Once
a user has one schedule, the templates vanish entirely on every surface.

This is table-stakes (`tableStakes: true`, `ALL_PRODUCTS`) and genuinely
absent on the flagship web surface. Recommendation: port the mobile
template set to `/chat/schedules`, and change the trigger from
"schedules.length === 0" to "always render below a divider", matching the
benchmark's mixed-list pattern rather than the empty-state-only pattern
already shipped on mobile/desktop.

### sched-02 — Dedicated automation page reachable from primary nav — PRESENT — strength

`/chat/schedules` has its own nav entry ("Schedules", `CalendarClock` icon)
in `WebChatPage.tsx:285-289` and `WebShellV3.tsx:40`, one click from the
main shell, and lists real tasks with a proper empty state
(`SchedulesPage.tsx:432-443`) rather than folding scheduling into a chat
toggle. This matches the table-stakes bar all three benchmarked products
set. Not a gap.

### sched-03 — Inline always-on task-creation composer on the list page — MISSING (web) — P2

`SchedulesPage.tsx:391-394` — the only creation affordance is a "Create
Schedule" button that opens a `Dialog` (`SchedulesPage.tsx:496-533`). No
bare text composer sits on the page itself.

Mobile has exactly this capability and it is wired: `QuickSchedule.tsx` is a
natural-language composer chip ("Run this every day at 9am") rendered
unconditionally above the list (`schedules/index.tsx:191-194`), with its own
lightweight NL parser (`extractTime`, day-name matching, etc.). It is real,
not a stub. It has never been ported to web.

### sched-04 — Explicit dual creation path (conversational vs. manual) — MISSING — P3

No surface offers an explicit choice between an AI-assisted conversational
setup and a raw form. Web only has the raw form (`ScheduleForm.tsx`).
Mobile's `QuickSchedule` is a rule-based NL parser, not a conversational
AI flow, and it is a separate control from the full form rather than a
"choose your creation mode" dropdown — so even combined, no surface has
Claude's explicit two-path picker.

### sched-05 — Approval/autonomy-mode picker at task-creation time — MISSING — P3

`grep -n "approval|autonomy|approve" apps/web/features/schedules/` → zero
hits. `ScheduleForm.tsx` has no such control. Directly downstream of
**AGENTIC-WORK-007** (`CONFIRMS_PRIOR`): since scheduled runs never call
tools, there is nothing to gate approval on — but that also means a user
cannot ask for tool access with any degree of caution, because the feature
doesn't exist at all yet.

### sched-06 — Model picker at task-creation time — PRESENT, fully wired — strength

`ScheduleForm.tsx:183-202` renders a `Model` select sourced from
`AVAILABLE_MODELS` (`types/index.ts:66-72`, built from
`getAutoRoutingProfiles()` + `getCoreManualModelOptions()` — the canonical
model registry, not a hardcoded list). The selection flows through
`ScheduleMutation.model` → `scheduled-agent-executor.ts:73-127`, which uses
`task.model` to resolve the actual provider route
(`route.modelKey`/`route.providerModelId`) that executes the run, and the
run's `ScheduleRun` receipt records the model actually used
(`scheduleRunUsage()`, `types/index.ts:172-193`). This is genuinely
end-to-end wired, independent of the chat composer's model picker, and adds
per-run cost/token receipts that none of the four benchmarked products'
scheduling surfaces are documented as showing. Not a gap — a strength.

### sched-07 — Project/workspace scoping at task-creation time — MISSING — P3

`grep -n "project|workspace|folder" ScheduleForm.tsx` → zero hits.
Consistent with the "No Chat Memory" / self-contained-prompt design
(`SchedulesPage.tsx:381-382`, `ScheduleForm.tsx:176-179`: "Scheduled runs do
not inherit chat context or memory") — there is no project/context binding
concept for scheduled tasks anywhere in the product today.

### sched-08 — Explicit cadence text on suggested-template cards — MISSING — P3

N/A on web (no templates exist there at all — see sched-01). On mobile,
where templates do exist, `TemplateCard` (`schedules/index.tsx:369-399`)
shows only emoji + title + one-line description — no cadence/time text, the
same gap the claim calls out against ChatGPT. Confirmed by reading the full
component: no reference to `timeOfDay`/cadence anywhere in its JSX.

### sched-09 — In-progress status indicator on active task rows, cleared on completion — PARTIAL — P3

**Present and functionally correct on `/tasks`:** `task-display.ts:79-84`
defines `TASK_TONE_BADGE_CLASS.active` as
`border-blue-500/30 bg-blue-500/10 text-blue-600` — a literally blue badge
for `queued`/`running` states, which flips to green (`success`, on
`completed`) or other tones on terminal states. It's a colored badge with a
label rather than a bare dot, but it conveys the identical "blue while
active, cleared on completion" signal the claim describes, live-refreshed
by 4s polling (`TasksPage.tsx: TASK_JOURNAL_POLL_INTERVAL_MS`).

**Absent on `/chat/schedules`:** the schema proves this structurally, not
just by inspection — `ManagedCloudScheduleTask.status` is
`z.enum(['active', 'paused', 'completed', 'failed', 'expired'])`
(`packages/contracts/cloud-contracts/src/schedules.ts:56`). There is no
`running` value in the schedule-level status enum at all, so a schedule's
collapsed row (`ScheduleCard.tsx:106-108`, `statusVariant()`) can never
visually indicate "a run is happening right now" — a currently-executing
run is only visible if the user expands run history
(`ScheduleRunHistory.tsx:38-44`, which does have a running-state spinner
icon at the individual-run level). A user watching the schedule list has no
way to tell a run just fired.

### sched-10 — Auto-generated semantic task title — MISSING — P3

Schedules: `name` is a required, user-typed field
(`schedule-form.ts:253`: "Enter a schedule name.") — never auto-generated.
`/tasks`: row labels are `workModeLabel(run.workMode)` — a static
"AGI Work"/"Research"/"Chat" string (`task-display.ts:18-28`,
`TasksPage.tsx:443-444`), not a per-run semantic title derived from the
prompt/goal. Confirmed by reading the full render path — nothing computes a
title from `run` content anywhere in `TasksPage.tsx` or
`TaskDetailPanel.tsx`.

### sched-11 — Named lifecycle-state status pill — PRESENT, exceeds the claim — strength

`task-display.ts:30-53` (`taskStateLabel`) defines nine explicit,
human-readable states — Queued, Running, Awaiting input, Ready for review,
Completed, Failed, Cancelled, Paused, Archived — each with its own tone
(`taskStateTone`) and rendered as a real status pill in both the list row
and `TaskDetailPanel` header (`TaskDetailPanel.tsx:250-257`). This is a
genuine, tested (`task-display.ts` is unit-testable, pure functions), fully
named lifecycle-state model — broader than Gemini's own claim, which the
source research rated only `STRONGLY_INFERRED`/Medium-confidence with three
observed phrases. Not a gap.

### sched-12 — Self-narrated task-complexity assessment in the visible log — MISSING — P3

`TaskDetailPanel.tsx:85-92` (`progressStatus`) returns a fixed vocabulary —
'In progress'/'Needs approval'/'Completed'/'Cancelled'/'Failed'/'Pending' —
never a first-person natural-language self-assessment of task complexity.
See `notWorthCopying` below — I would not recommend building this as
observed (it reads as exposed internal reasoning dressed as UI copy, which
raises its own honesty questions).

### sched-13 — Named, iconified tool-use steps inline in the live log — PARTIAL — P3

Tool invocations DO get their own named entries (`AgentActivityToolEntry`
via `entry.name`/`entry.summary` in `ProgressRow`,
`TaskDetailPanel.tsx:94-118`) rather than a generic "working" spinner — so
the "named" half of the claim holds. But every entry (progress or tool)
gets the identical small colored dot keyed only to `status`
(running/completed/failed/etc.), never a tool-identity icon (no
distinguishing icon for "web search" vs. "code execution" vs. any other
tool). Confirmed by reading the full `ProgressRow` implementation — one
`className` branch keyed to `entry.status`, none keyed to tool identity.

### sched-14 — Inline hyperlinked citations woven into output prose — MISSING (different pattern) — P3

Confirmed the opposite pattern from the claim: citations render as a
separate row of pill buttons below the message
(`MessageBubble.tsx:793-797` → `CitationPill.tsx`), each a rounded chip with
favicon + truncated domain that opens the source URL on click. This is
closer to "numbered footnote / appended source list" than "citations woven
inline into sentences" — the claim's own framing explicitly contrasts this
style against Gemini's. (Scheduled `/chat/schedules` runs cannot produce
citations at all — "No Tools" — so this only applies to `/tasks` / chat
surfaces that do call web search.)

### sched-15 — Overflow menu distinguishes 'Close' (dismiss) from 'Delete' (destroy) — PARTIAL — P2

No surface offers both actions together the way Gemini's ⋮ menu does.
`/tasks`: `TaskDetailPanel.tsx:283-291` has an explicit "Close" (X) button
that only clears `selectedRunId` — correctly non-destructive — but there is
**no delete action for a task run anywhere** in `TasksPage.tsx` (only
`Stop`/cancel for live runs and `Open chat`). `/chat/schedules`: the inverse
— `ScheduleCard.tsx:215-226` has a destructive "Delete Schedule" (confirmed
via `AlertDialog`, `SchedulesPage.tsx:535-569`), but no "Close" concept
exists because it isn't a panel (history is a collapse/expand toggle, not a
dismissible view). Marked P2 because the claim's own `tableStakes` flag is
`true` despite `SINGLE_PRODUCT` convergence; in practice this may be
intentional (run history read as an immutable, billing-relevant ledger) —
worth a deliberate product decision rather than an accidental omission.

### sched-16 — Delete confirmation discloses cascade-deleted schedules — DIFFERENT_BY_DESIGN — not a gap

Gemini's warning exists because a Gemini "thread" is a separate object that
can have schedules attached to/spawned from it, so deleting the thread can
silently orphan a schedule. Our `ManagedCloudScheduleTask` has no
`conversationId`/thread binding at all — a schedule _is_ the cron object,
not something attached to a chat — so there is no cascade-orphan risk to
warn about. The existing delete confirmation
(`SchedulesPage.tsx:544-547`: "Delete "{name}" and its run history. This
action cannot be undone.") already accurately states everything that will
be removed. This is a legitimately simpler architecture, not a gap;
flagged as `DIFFERENT_BY_DESIGN` and, if anything, a point in our favor
(nothing to accidentally orphan).

### sched-17 — Lightweight scheduled-action form distinct from a rich agentic composer — CONFIRMS_PRIOR (AGENTIC-WORK-007) — P2

Gemini deliberately offers two tiers: a rich, tool-using Spark composer and
a separate lightweight digest-delivery form. We only have the lightweight
tier — and not by product choice, but because scheduled execution has zero
tool access at all (`scheduled-agent-executor.ts:88-135`, no `tools` field
ever attached — the same fact already filed as **AGENTIC-WORK-007**, P1).
The "second, richer surface" simply doesn't exist for us at any maturity.
Severity kept at P2 here (below the existing P1) to avoid double-counting
the same underlying defect — see AGENTIC-WORK-007 for the primary fix.

### sched-18 — Status-filter chip on the automation list page — PARTIAL — P3

`/chat/schedules` (`SchedulesPage.tsx`) has **no filter control at all** —
confirmed by reading the full component, no `activeFilter`/tab state
exists. `/tasks` does have this, and it's real (not a stub): `Active`/`All`
tabs (`TasksPage.tsx:52-55,371-389`) that pass explicit `states` arrays to
the server (`ALL_STATES` vs. server-default active states). Desktop's local
scheduler goes further still — five-way filter tabs with live counts
(`ScheduledTasksPanel.tsx:14-20,126-160`: All/Active/Paused/Completed/
Failed). The capability clearly exists and is well-built elsewhere in the
codebase; it has simply never been carried over to the Managed Cloud
schedules list.

### sched-19 — Distinct icon for suggested-template rows vs. real-task rows — PARTIAL — P3

N/A on web (no templates — see sched-01). On mobile, this pattern is
already implemented correctly: `TemplateCard` uses a teal "+"-in-circle
icon (`schedules/index.tsx:391-396`) while real `ScheduleCard` rows use a
text `Badge` for status (`apps/mobile/src/features/schedules/components/
ScheduleCard.tsx:124-147,214`) — visually distinct per the claim's
intent — just not present on the primary web surface.

### sched-20 — Personalized (not generic) suggested templates — MISSING — P3

Where templates exist at all (mobile only), they are a static, hardcoded
array (`SCHEDULE_TEMPLATES`, `apps/mobile/src/features/schedules/
templates.ts:18-78`) — four fixed templates, identical for every account,
with no personalization signal read from account history. This matches the
Claude/Gemini "generic category templates" pattern the claim explicitly
contrasts against ChatGPT's (unconfirmed) personalization — i.e., we're at
parity with the majority pattern, just not with ChatGPT's differentiator.

### sched-21 — Two-pane task workspace with a dedicated follow-up composer — PARTIAL, CONFIRMS_PRIOR (AGENTIC-WORK-005) — P2

The two-pane structure is real: `/tasks` renders a list on the left and a
sticky `TaskDetailPanel` on the right (`TasksPage.tsx:420-585`) showing
goal, plan, progress, outputs, and context — a substantially richer panel
than a static log. But there is no follow-up composer anywhere in
`TaskDetailPanel.tsx` — no input field for steering a live or completed run.
This is the same root cause already filed as **AGENTIC-WORK-005** ("Mid-run
steering... hard 409, no free-text field," P1): a running conversation
rejects any new message outright, and the only in-run interaction point
(`ToolApprovalDecisionSchema`) accepts `approved|rejected` only, no text.
Severity kept at P2 here to avoid re-counting the same defect above its
existing P1.

### sched-22 — 'BETA' badge on the task panel header — MISSING — P3

No maturity badge anywhere in `/chat/schedules` or `/tasks` (`grep -rn
"BETA|Beta|Alpha" apps/web/features/schedules apps/web/features/tasks
packages/ui/unified-chat/.../tasks` → zero hits). Worth noting alongside
CLAUDE.md's own framing that Managed Cloud is "public alpha, open by
default" (founder decision, 2026-06-27) — that status is not disclosed
anywhere in the scheduling/task UI a user actually touches. I'm not scoring
this higher because the specific claim (clone Gemini's literal badge) is a
single-product cosmetic; but the underlying expectation-setting gap (users
running unattended, sometimes-billed automations with no maturity signal
at all) is worth a founder decision of its own, separate from copying
Gemini's chip.

### sched-23 — Frequency control defaults to on-demand ('Manual') — PRESENT_WORSE — P3

`INITIAL_SCHEDULE_DRAFT` (`lib/schedule-form.ts:26-43`) defaults
`recurrence: 'daily'`, `timeOfDay: '09:00'`, `daysOfWeek: [1,2,3,4,5]` — a
new "Create Schedule" dialog opens pre-configured as a **recurring**,
weekday, 9am task, not a one-time/manual default. This is the inverse of
Claude's documented default and is a real (if minor) product-honesty
concern: a user who doesn't touch the Frequency dropdown gets a standing,
billed, recurring automation rather than a single confirmable run.
Recommend defaulting `recurrence` to `'once'` (or requiring an explicit
choice) so accidental recurring creation isn't the path of least
resistance.

## Strengths (at or ahead of the benchmark)

1. **Fully wired per-task model routing with real cost/token receipts**
   (sched-06). `ScheduleForm.tsx:183-202` → `ScheduleMutation.model` →
   `scheduled-agent-executor.ts:73-127` → `ScheduleRun.result.usage` →
   `scheduleRunUsage()`/`formatCostCents()` (`types/index.ts:149-206`) shown
   per-run in `ScheduleRunHistory.tsx:73-100`. None of the four benchmarked
   products are documented as showing per-run cost/token accounting on
   their scheduling surfaces at all.
2. **DST-safe IANA timezone scheduling** (`schedule-form.ts:132-178`,
   `zonedLocalInputToIso`) — samples both sides of a DST boundary and
   explicitly rejects ambiguous/nonexistent local times ("This local time
   occurs twice because the clock changes for daylight saving") rather than
   silently picking one. This is unusually careful engineering not called
   out by any of the 23 claims but directly relevant to the domain.
3. **Nine-state named lifecycle model on `/tasks`** (sched-11,
   `task-display.ts:30-53`) exceeds Gemini's own inferred three-phase cycle
   in both breadth and confidence (ours is a tested, typed enum; theirs was
   rated `STRONGLY_INFERRED`/Medium by the source research).
4. **Explicit "Why this task failed" section** (`TaskDetailPanel.tsx:
363-398`) surfaces the failure reason and whether it's retryable
   up front, rather than a bare red "Failed" badge with no explanation —
   not claimed by any benchmarked product in this research set.
5. **Honest platform-cadence floor enforced client- and server-side**
   (not one of the 23 claims, but directly load-bearing context): unlike a
   silent capability gap, `assertDeliverableCadence`
   (`lib/schedules/schedule-time.ts`) rejects any cadence tighter than the
   deployed sweep with a specific, accurate error, and the client
   (`schedule-form.ts:342-347`) pre-validates the same rule so a user never
   submits a schedule the backend can't honor. See prior audit
   **AGENTIC-WORK-004** for the remaining architectural ceiling (daily-only
   sweep) this honesty is built on top of.

## Not worth copying

- **sched-12's self-narrated complexity assessment** ("My initial
  assessment classified the task as simple..."). This reads as exposing
  what should be an internal planning trace as permanent UI copy. It raises
  its own honesty question (is this genuinely gating behavior, or
  decorative post-hoc narration?) without giving the user anything
  actionable. Our fixed-vocabulary progress labels
  (`progressStatus()`) are more honest about what they represent.
- **Gemini's 'BETA' badge as a substitute for real reliability work**
  (sched-22). A maturity badge is not a fix for the underlying gaps this
  report and AGENTIC-WORK-007/004 describe (no tool access, daily-only
  cadence) — if we add a status disclosure, it should point at a real
  capability doc, not just decorate the header.
- **Gemini's thread-deletion cascade** (sched-16) is a symptom of coupling
  schedules to chat threads in the first place. Our simpler
  schedule-is-its-own-object model avoids the orphaning failure mode
  entirely; adopting Gemini's thread-attachment architecture just to also
  need its warning dialog would be a regression, not parity.

## Evidence I could not verify

- Whether `AGI_DURABLE_INITIAL_TURNS` / any equivalent affects scheduled
  (as opposed to interactive) run durability was out of scope for this
  pass; scheduled runs go through `scheduled-agent-executor.ts`, a
  different code path from the durable-workflow one AGENTIC-WORK-003
  describes, and I did not trace whether a scheduled run in progress
  survives the sweep function returning. Marking this unknown rather than
  guessing.
- I did not execute a real scheduled run against the dev server (the sweep
  is cron-triggered and cadence-gated to at least daily), so sched-09/11's
  "cleared on completion" behavior for `/tasks` is verified from the
  state-machine code (`isLiveTaskState`, polling loop) and tone mapping,
  not from watching a live badge flip in a browser.
