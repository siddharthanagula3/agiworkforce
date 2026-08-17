# Domain audit — Agentic work + scheduled tasks

Captured 2026-08-15 against commit `e15df56e3`, working tree clean.

## Scope and method

This domain covers agentic work as a product mode (§12 of the audit brief) and
scheduled/triggered work (§13): goal submission through completion, background
and cross-device execution, pause/resume/cancel/steer, permission boundaries,
and the scheduled-task lifecycle (create/edit/pause/resume/run-history/notify).

Prior art in this domain is unusually deep — 45+ rows across
`audit/ui-gaps.csv` already cover Desktop Cowork/recorder UI, mobile
scheduled-task templates, and the approval/consent boundary in detail (see
table below). Rather than re-deriving that ground, this pass (a) verified the
two explicitly-flagged prior findings (`GAP-P0-007`, `P2-001`), and (b)
traced end-to-end wiring — UI → IPC/API → runtime → persistence — through code
that no screenshot-diff method can see: Rust command registration, event-listener
coverage, `proxy.ts` route matchers, feature-flag defaults, and the literal
request body sent to the model for a scheduled run. That tracing surfaced
seven new, code-verified findings, several of them severe.

## What's already tracked (not duplicated here)

`audit/ui-gaps.csv` and `docs/current/gap-audit-2026-08-08.md` already cover,
in this domain: folder-access consent (GAP-002, Done), the recorder HUD
(GAP-003, Done), Cowork Dispatch cross-device task creation (GAP-006, Done),
the desktop Chat/AGI-Work composer toggle (GAP-064, Done — but see the
`DesktopShellV3.test.tsx` red-suite caveat in `done-claim-verification.md`),
global vs. per-conversation approval mode (GAP-058 Done / GAP-059 Not
Planned), skill-recorder narration and its gaps (GAP-060 Done, GAP-201/202/209/254/322
Open), the Web Tasks Outputs/Progress/Context panel (GAP-109, Done), mobile
scheduled-task templates and the prompt-only-context disclosure (GAP-028
Done, GAP-029 Not Planned), the declined-and-explained set around remote
folder browsing, per-conversation approval override, and computer-off pickup
(GAP-019/027/059/061/062/063/068/069/070/072, all Not Planned with reasoned
write-ups), and a long tail of P2/P3 desktop and mobile polish items
(GAP-155, 167–170, 199–213, 251, 255, 264, 278, 298, 302–305, 312, 321–322).
Full detail lives in those files; this report does not re-file them.

## Verification of the two explicitly-flagged prior findings

### GAP-P0-007 — "Scheduled tasks are degraded to one daily batch of ten runs"

**Partially resolved; the deeper constraint is confirmed and now honestly enforced rather than silently broken.**

The specific defect — one cron invocation claiming only 10 rows — is fixed.
`apps/web/app/api/cron/run-schedules/route.ts:32,52-74` now drains due
schedules in waves of 10, up to `MAX_WAVES = ceil(50/10) = 5`, inside a 55s
budget, so one invocation can clear up to 50 runs. Schedule creation also now
calls `assertDeliverableCadence` (`apps/web/lib/schedules/schedule-time.ts:384-411`),
which **rejects** any interval or cron expression tighter than the sweep's
actual cadence, with `schedule-cadence.test.ts` pinning `SWEEP_INTERVAL_MS`
to the real `vercel.json` cron entry so the two cannot drift apart silently
again. This is a good engineering pattern — a capability ceiling turned into
an honest, tested refusal instead of a silent backlog.

What's unchanged: `vercel.json:26-29` still fires `run-schedules` exactly
once daily (`0 1 * * *`). **The product cannot deliver any schedule finer
than once per day, full stop** — no hourly checks, no 15-minute monitors.
Both benchmark products support hourly as their floor (see below). See
`AGENTIC-WORK-004` in the gap file.

### P2-001 — "Standalone Cowork/workspace product is missing"

**Confirmed unchanged.** AGI Work is still a mode toggle on the ordinary chat
composer (Chat ⇄ AGI Work), not an independent workspace object with its own
creation surface. `/tasks` is a run-history list built on the shared
`packages/ui/unified-chat` `TasksPage` — genuinely capable (see Strengths
below) but still reached only after a run already exists; there is no
standalone "start a Cowork session" entry point parallel to, rather than
nested inside, chat. See `AGENTIC-WORK-006`.

## New findings

| ID               | Severity | Feature                      | One-line                                                                                                                                                                            |
| ---------------- | -------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AGENTIC-WORK-001 | **P0**   | Desktop background agents    | Full Rust subsystem (8 parallel agents, pause/resume/cancel/take-over) — zero frontend wiring; only the model can start one, and once running it is invisible and uncontrollable    |
| AGENTIC-WORK-002 | P1       | Web `/tasks` auth gating     | `proxy.ts`'s protected-route matcher omits `/tasks`; anonymous visitors see the full authenticated shell stuck loading, unlike its sibling `/chat/schedules`                        |
| AGENTIC-WORK-003 | P1       | Durable background execution | The genuine "close the laptop, it keeps running" transport exists (Vercel Workflow DevKit) but ships opt-in/off-by-default, contradicting its own CHANGELOG's "kill-switch" framing |
| AGENTIC-WORK-004 | P1       | Scheduled task cadence       | Daily-only ceiling confirmed as an architectural constraint (updates GAP-P0-007); now honestly enforced, but hourly/sub-daily monitoring is impossible product-wide                 |
| AGENTIC-WORK-005 | P1       | Mid-run steering             | Sending a message while a task runs is hard-blocked (409); the only intervention is binary tool approve/reject with no free-text guidance field                                     |
| AGENTIC-WORK-006 | P2       | Standalone Cowork surface    | Confirms P2-001: still a composer mode, not an independent product surface                                                                                                          |
| AGENTIC-WORK-007 | P1       | Scheduled task tool access   | Scheduled runs execute as a single tool-free chat completion — no web search, code execution, MCP, connectors, or file access, below even ChatGPT's narrowed Tasks floor            |

### AGENTIC-WORK-001 — Desktop background agents: fully built, fully dark

This is the flagship finding of the domain. `apps/desktop/src-tauri/src/core/agent/background_agent.rs`
implements a complete subsystem — doc-commented as "inspired by Cursor's `&`
prefix pattern" — supporting up to 8 parallel autonomous agents with a full
state machine (`Queued → Running ⇄ Paused → Completed/Failed/Cancelled/TakenOver`),
a 24-hour default timeout, and 9 distinct native events. Eleven Tauri
commands are registered in `lib.rs` (push, list, list_active, get, pause,
resume, cancel, take_over, stats, cleanup, should_push).

Tracing every one of those 11 command names through `apps/desktop/src`:

- **`registeredCommands.ts:174-184`** — an invoke-allowlist string array. Not a caller.
- **`tauri-mock.ts:1319-1369`** — a dev/test mock's `switch` cases. Not a caller.
- **Zero other files** contain any of these 11 strings.

The only way a background agent is ever created is the LLM itself deciding,
mid-conversation, to call the approval-gated `background_agent_start` tool
(`tool_executor/mod.rs:2218-2222`, `tool_guard.rs:562-575` — `requires_approval: true`,
`risk_level: High`). No `&`-prefix parser or "push to background" button
exists in the chat input. Once approved and running, the frontend listens to
exactly 2 of the 9 native events — `completed` and `failed`
(`agentWorkflowEvents.ts:1069-1082`) — solely to fire an OS notification and
an action-log entry. `progress`, `started`, and `created` have no listeners
anywhere, so there is no live view of what the agent is doing while it runs.
`list`, `pause`, `resume`, `take_over`, `stats`, and `cleanup` are not called
by anything — not the frontend, not even the model's own tool loop (only
`start`/`get`/`cancel` are wired into `tool_executor/mod.rs`'s dispatch).

The desktop's actual task-monitor panel, `AgentTaskMonitor.tsx`, wires a
_different_, simpler system — the generic named `bg_*` job queue
(`backgroundTaskStore.ts`) — which has no "take over" concept at all.
`backgroundTaskStore.ts:7-8` even contains a comment pointing to a
`backgroundAgentStore.ts` that would presumably wire the real system; that
file does not exist anywhere in the repository.

Net effect: an approval-gated but otherwise fully autonomous agent, with
`SystemOperation` capability and folder-execute access, can run for up to 24
hours with **no way for the user to check on it, pause it, or reclaim it** —
only a start-time approval prompt and an end-of-run notification. This is the
exact shape of failure `CLAUDE.md` names explicitly: a capability wired
through the backend with no path reaching the user, "described as done"
because the code compiles and the commands are registered.

### AGENTIC-WORK-002 — `/tasks` renders unauthenticated

`apps/web/proxy.ts:145-152`'s `isProtectedAppRoute` matcher is
`['/chat(.*)', '/library(.*)', '/schedules(.*)', '/settings(.*)', '/billing(.*)', '/admin(.*)']`.
`/tasks` — the Tasks screen, linked from the shared nav
(`WebAppShell.tsx`, nav id `tasks`) as the primary Cloud-run history surface
— is not in that list, and `apps/web/app/tasks/page.tsx` performs no auth
check of its own. Its sibling, `/chat/schedules`, is correctly covered by the
`/chat(.*)` pattern. An anonymous visit to `/tasks` renders the full signed-in
chrome (independently confirmed against a live `next dev` server by
`web-route-sweep-findings.md`) stuck on "Loading account…" instead of
redirecting to `/login`. One-line fix, but a real defect on the primary
agentic-work navigation entry.

### AGENTIC-WORK-003 — Durable execution is real but opt-in

This one cuts against a naive "everything is broken" reading: the actual
infrastructure for "close the laptop, the task keeps running" is built and
architecturally sound. `apps/web/lib/workflows/cloud-agent-workflow.ts` and
`start-cloud-agent-workflow.ts` launch agent turns on the **Vercel Workflow
DevKit** transport (`workflow/api`'s `start()`), which is genuinely decoupled
from the originating HTTP request — this is not a stub.

But `route.ts:533` only takes that path when
`areDurableInitialTurnsEnabled()` returns true, and
`durable-initial-turns.ts:9-14` documents the flag as **off by default,
requiring explicit `AGI_DURABLE_INITIAL_TURNS=1`/`true`/`on`**.
`.env.example:219` ships it commented out at `0`. Meanwhile `CHANGELOG.md:329-330`
describes the same flag as a "kill-switch" for an already-shipped
capability ("close the laptop and the run continues server-side") — language
that implies default-on, opt-out. Nothing in the repository confirms the
variable is actually set in production. One mitigating fact: once a run
pauses for a tool approval, `approve/route.ts:288` calls the same starter
**unconditionally** — so any run that reaches an approval checkpoint becomes
durable regardless of the flag. Only the segment of a run before its first
approval is affected. Still, if the flag is unset in production, the
headline "your task survives closing the laptop" claim is false for a
meaningful fraction of every run's lifetime.

### AGENTIC-WORK-004 — Scheduled cadence: honestly capped at once a day

See the GAP-P0-007 verification above. The daily-only ceiling is real,
current, and — refreshingly — no longer silently violated: creating a
schedule tighter than 24h now gets a clear rejection
(`"Scheduled tasks are swept once a day, so the shortest supported interval is 1 day"`)
instead of accepting a promise the sweep cannot keep. That is the right
engineering response to a hosting constraint (Vercel Hobby-tier cron rejects
sub-daily schedules — see the user's own operational memory on this exact
failure mode). It does not change the product gap: neither monitoring tasks
("check every 15 minutes") nor hourly digests are possible at all, while both
ChatGPT Tasks (hourly floor) and Claude Cowork/routines (hourly/daily/weekly,
full tool access) support them.

### AGENTIC-WORK-005 — No way to steer a running task

`route.ts:165-199`: any new message sent into a conversation with an active
managed run gets HTTP 409 `conversation_run_in_progress` —
_"This conversation already has a response in progress. Stop it before
sending a new message."_ There is no path that instead injects the new
message into the live run. The one other intervention point, the tool-approval
resume endpoint, has a wire schema (`ToolApprovalDecisionSchema`) that is
strictly `{tool_call_id, decision: 'approved'|'rejected'}` — no field exists
for attaching guidance ("approve, but skip the delete step") to a decision.
The only way to redirect a running task is to fully Stop it and lose whatever
context and partial progress it had built. ChatGPT/Codex's Remote Control
explicitly supports "view/steer a running host session" (GA'd May 29, 2026)
— this is a named capability gap against the current benchmark, not a
hypothetical one.

### AGENTIC-WORK-006 — Standalone Cowork surface: confirmed still absent

No new evidence beyond re-verifying P2-001's original finding. AGI Work
remains reachable only as a composer mode inside chat; `/tasks` is a
history list, not a creation surface. Filed here to record independent
re-verification, not to re-litigate.

### AGENTIC-WORK-007 — Scheduled tasks run with zero tools

`apps/web/lib/services/scheduled-agent-executor.ts:124-135` builds the
provider request for every scheduled run as a bare two-message, non-streaming
completion (`max_tokens: 4096`) with **no `tools` field at all** — no web
search, no code execution, no MCP servers, no user connectors, no file
access. The system prompt ("Do not claim to have performed external actions
unless a tool result proves it") reads as if tool use were expected, but
none is ever attached. A user who schedules "check this webpage daily and
summarize what changed" gets a hallucination-prone text completion with no
way to actually check anything. This sits below even ChatGPT's deliberately
narrowed Tasks (plain-text prompts, but still executed inside the product's
tool-aware runtime) and far below Claude Cowork/routines, which "retain full
Skills/connector access while running unattended." This is a broader,
backend-level version of the already-tracked GAP-168 (mobile UI has no
connector-binding control for schedules) — GAP-168's UI gap is a symptom of
this deeper architectural absence.

## Strengths — what this repo already does well

Several parts of this domain are genuinely strong and should be credited,
not just gap-hunted:

1. **The durable cloud-agent-run architecture is real engineering, not
   scaffolding.** `cloud-agent-run-service.ts` models a proper state machine
   (`queued/running/paused/awaiting_input/ready_for_review/…`) with a durable
   event journal, idempotent billing reservation/settlement, and
   cursor-based reattachment (`runs/route.ts`, `runs/[runId]/route.ts`).
   Cancellation is a DB flag polled cooperatively
   (`isCloudAgentRunCancellationRequested`), which correctly handles a
   stop-request arriving from a _different_ device or tab than the one that
   started the run — matching the domain's cross-device requirement.
2. **Cross-device approval resumption already works as designed.**
   Per `CHANGELOG.md`, pending tool approvals are answerable from Desktop,
   Web (`TasksPage`), or Mobile via the same signed checkpoint endpoint — a
   genuinely competitive answer to "what does the agent need permission for,
   and can I answer from any device."
3. **Scheduled-task cadence is enforced honestly, not silently violated**
   (see AGENTIC-WORK-004). Rejecting an undeliverable promise at the write
   boundary, with a test that pins the rejection threshold to the actual
   deployed cron, is exactly the right instinct and is worth preserving as
   the sweep cadence improves.
4. **Desktop's local `ExecutionSidecar`** (Timeline / Screen / Browser /
   Terminal / Approvals tabs, confirmed mounted in `DesktopShellV3.tsx`) is a
   real, live "what is the agent doing right now" surface for local
   tool-loop execution — this is a genuinely good answer to the domain
   brief's transparency bar, just not extended to the separate background-agent
   subsystem (AGENTIC-WORK-001).
5. **Mobile's Cloud Tasks screen** (`apps/mobile/app/(app)/agents/{index,[id]}.tsx`)
   has real pause/resume/cancel controls wired to `useAgentStore` and a
   backend-consistent `CloudAgentRun` type shared with web — this is not a
   read-only mirror, it is a genuine control surface.
6. **Web's `/tasks` (`packages/ui/unified-chat` `TasksPage`/`TaskDetailPanel`)**
   is a real shared component (not duplicated per-surface) with Progress /
   Outputs / Context sections driven off the durable journal, safe
   same-origin-only artifact links, and a "re-run this task" action that
   correctly mints a fresh run rather than replaying a stale billing
   reservation.

## What NOT to copy from the benchmark

- **Do not copy ChatGPT's stripped-down scheduled-task tool policy** (voice,
  files, and Custom GPTs explicitly disallowed inside a Task). The repo's
  current scheduled-task tool access is worse — zero tools at all
  (AGENTIC-WORK-007) — but the fix should aim past ChatGPT's floor at
  Claude's "full Skills/connector access while running unattended," which is
  both the better user experience and the more internally consistent design
  (a scheduled run should be able to do anything an interactive run can do,
  scoped by the same permission system, not a separately-nerfed subset).
- **Do not copy a bare `&`-prefix chat-input convention** as the entry point
  for AGENTIC-WORK-001's fix without a visible control surface arriving in
  the same release. Cursor's original pattern (referenced in the Rust doc
  comments) assumes a power-user CLI-adjacent audience; shipping the prefix
  parser alone without the list/pause/resume/take-over UI would recreate
  today's problem in a more discoverable but equally uncontrollable form.
- **The daily-cadence honesty pattern (AGENTIC-WORK-004) is worth keeping
  even after the underlying ceiling is raised** — an explicit, tested
  "we cannot deliver this yet" refusal at the write boundary is better
  product design than either benchmark's silent per-tier row limits, and
  should be the template for how other infrastructure-bound limits in this
  codebase get enforced.
