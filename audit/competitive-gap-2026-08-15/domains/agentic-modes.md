# Agentic modes: Work / Cowork / Codex / Spark / Manus Agent

**Date: 2026-08-15**

Benchmarked against 22 live-observed claims across ChatGPT (Work), Claude (Cowork /
Code mode), Gemini (Spark), and Manus, on commit `e15df56e3` (branch `compliance/dpdp`,
working tree clean).

## Method

For every claim I traced the concrete chain — UI control → client state → request
contract → network call → server handler → rendered result — rather than stopping at
"a component with this name exists." Where the earlier `parity-2026-08-15` audit
already covered ground in this domain (it has an unusually deep `domain-agentic-work.md`,
45+ rows in `audit/ui-gaps.csv`, and dedicated composer/settings domain files), I
verified rather than re-derived, and I flag every relationship to that prior work
explicitly (`CONFIRMS_PRIOR` / `NEW` / `CONTRADICTS_PRIOR` / `SUPERSEDES_PRIOR`).

Two structural things color almost every finding below and are worth stating up front:

1. **AGI Work is a composer mode inside chat, not an independent product surface.**
   This was already filed by the prior audit as `P2-001` / confirmed as
   `AGENTIC-WORK-006`. It is the root cause behind several of this pass's findings
   (agentic-01, agentic-05) — the toggle, the task panel, and the task list all exist,
   but they are all still tenants of the ordinary chat page, not siblings of it.
2. **Local, BYOK, and Managed Cloud are separate apps in this codebase by explicit
   architectural rule** (`CLAUDE.md`: "Local, BYOK, and Managed Cloud are separate
   trust boundaries"). Several benchmark claims (agentic-14, agentic-22) ask whether a
   _single_ surface lets a user pick between local/cloud/remote execution. Ours
   deliberately does not, because the separation is a security boundary, not a missing
   feature. I have called these out as `DIFFERENT_BY_DESIGN` rather than manufacturing
   parity gaps, and flagged the literal "merge it into one settings page" version of
   the benchmark behavior as something **not** worth copying.

## Findings by claim

### agentic-01 — Global Chat↔Agentic-mode toggle: PARTIAL, half-shipped

We have a real "Chat | AGI Work" segmented toggle
(`apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2895-2924`, inline;
`:2377-2411`, relocated into the "+" overflow menu below the `sm` breakpoint so it
isn't lost on narrow viewports). It is wired to `workMode` state that threads through
`handleWorkModeChange` → send meta → `createConversation` → server project context
(confirmed by the surrounding comments and `workMode` usages at
`ChatComposerNew.tsx:1676,1872` and `WebChatPage.tsx:1437,1514`).

But per the claim's own bar — "changes the empty-state headline, composer placeholder,
and toolbar controls, not just a label" — two of those three do not happen:

- **Composer placeholder is unchanged.** `ChatComposerNew.tsx:2258-2266` branches the
  placeholder on `isTurnActive` / `imageMode` / `videoMode` only; `workMode` never
  appears in that ternary. Switching to AGI Work leaves the same
  `'Ask anything. Type / for commands'` (or caller-supplied) placeholder.
- **No empty-state headline change.** Grepping `WebChatPage.tsx` for `workMode` finds
  only 4 usages (label list building, send-meta, a hard-coded `'agiwork'` literal, and
  `showWorkSession`) — none touch the empty-chat greeting/headline.
- **Toolbar controls DO change** — the below-composer "Project or folder" picker
  appears only in AGI Work mode (`ChatComposerNew.tsx:3464`), so this third bar is met.

The toggle is also **not product-wide**: it renders only inside the chat composer
(`projectPicker && !imageMode && canUseAgiWork` — `ChatComposerNew.tsx:2902`), gated on
a Pro-tier billing entitlement (`canUseAgiWork` — `ChatComposerNew.tsx:455-456`), so
free/basic-tier users never see it at all, and it is invisible on every other screen of
the product (settings, /tasks, /library). ChatGPT's/Claude's/Gemini's benchmarked
version is chrome-level (top bar / composer-level-but-everywhere), not tied to a single
page.

**Prior audit relationship:** `CONFIRMS_PRIOR` — `AGENTIC-WORK-006` ("Standalone Cowork
surface: confirms P2-001") already established that AGI Work is a composer mode, not
an independent surface. This pass adds the specific, previously-unverified detail that
even _within_ the composer, the mode switch is visually incomplete (placeholder/empty
state untouched).

**Severity: P1** (tableStakes, ALL_PRODUCTS convergence, and the capability is
genuinely half-shipped rather than absent).

### agentic-02 — Disclosed separate usage pool for agentic mode vs. chat: MISSING

`packages/contracts/types/src/usage-vocabulary.ts:28` defines exactly four managed
usage buckets: `'session' | 'weekly' | 'weeklyFlagship' | 'period'` — all rolling
time-window / model-tier buckets. There is no `agiwork`/`cowork` bucket, and grepping
`apps/web/lib/services`, `apps/web/features/settings`, and the usage summary hook for
any AGI-Work-specific quota concept returns nothing. `managed-usage-accounting-service.ts`
has no `workMode` awareness either. AGI Work turns (tool calls, sandbox time, larger
context) draw from the same unified session/weekly/period pool as ordinary chat, and
the UI never discloses this one way or the other — a user cannot tell, from the product,
whether their agent-task usage is metered separately or eating the same weekly
allowance as their chats.

This is a real, verified gap against the ChatGPT/Claude behavior described in the
claim. It is not necessarily a worse _design_ (a single honest pool avoids the
confusing multi-bucket mental model), but it is an undisclosed one either way — no
settings copy or in-product UI states which model is in effect.

**Prior audit relationship:** `NEW` — not filed anywhere in `domain-agentic-work.md`,
`domain-settings.md`, or `domain-models.md`.

**Severity: P2** (MAJORITY convergence, tableStakes true, but the underlying risk is
a disclosure gap, not a billing-correctness bug).

### agentic-03 — Persistent quota meter with no pre-exhaustion warning: WE ARE AHEAD (strength, not a gap)

This is the one claim in this domain where we should credit ourselves plainly. We ship
**both** halves the benchmark claim is built around:

1. A persistent, always-visible sidebar usage widget
   (`WebChatPage.tsx:1050-1062`, `showUsageWidget`/`budgetPercent` on the shared
   `Sidebar`, driven by `getWorstUsagePercent(managedUsageSummary)`).
2. A **proactive** warning banner rendered above the composer, driven by
   `selectUsageWarning()` (`packages/contracts/types/src/usage-vocabulary.ts:177-207`),
   which fires at `USAGE_WARNING_REMAINING_PERCENT = 25` (75% used) and escalates to
   `severity: 'critical'` at `USAGE_CRITICAL_REMAINING_PERCENT = 10` (90% used) —
   `usage-vocabulary.ts:143,146,194,199`.

The code comments at `WebChatPage.tsx:1063-1069` are explicit that this exists
specifically to prevent the ChatGPT failure mode the benchmark claim documents
("Usage was previously visible only in Settings, so the first signal a user got was a
refused message mid-task"). `selectUsageWarning` also picks the **binding** bucket
(the one that will actually block the next turn) rather than surfacing whichever
number is lowest with no name attached — a genuinely more thoughtful design than a
flat "0% remaining" module.

I am not filing a gap for this claim. If anything, this is evidence the team already
read and fixed exactly the rough edge the benchmark research flagged in ChatGPT.

### agentic-04 — Live in-progress task list with status indicator that clears at completion: PARTIAL

The dedicated `/tasks` surface (`packages/ui/unified-chat/src/components/tasks/TasksPage.tsx`)
has a genuine live status system: each run row shows a tone-colored state badge
(`taskStateLabel`/`TASK_TONE_BADGE_CLASS` from `task-display.ts`), a `Loader2
animate-spin` while a cancel/approval action is in flight, and the whole page
self-reschedules its poll (`TasksPage.tsx:80-81,342-348`, "Self-rescheduling rather
than a fixed interval... each successful poll schedules the next"), so a running task's
status clears live, without a page refresh, once the run reaches a terminal state. This
is a real, working equivalent of the benchmark's blue-dot convention (different visual
form — badge/spinner vs. dot — but same behavioral contract).

What's missing is the claim's second half: **the same convention in the main
chat/conversation sidebar.** `ConversationListItem.tsx` has no run-status awareness at
all — its only state props are `isActive` (selected), `isStarred`, `isPinned`,
`isArchived` (`ConversationListItem.tsx:54-84`). A conversation with an AGI Work run
executing in the background looks identical in the sidebar to one sitting idle; a user
has to open `/tasks` to see anything is running. Both Claude Cowork and Gemini Spark
show the same dot in both places per the claim.

**Prior audit relationship:** `NEW`.

**Severity: P2** (MAJORITY convergence, tableStakes true; the primary surface works,
the secondary one is silent).

### agentic-05 — Dedicated task workspace/panel on submission: PARTIAL, weaker than benchmark

`WorkSessionPanel` (`apps/web/features/chat/components/work-session/WorkSessionPanel.tsx`,
659 lines) is real: a toggleable side panel (`open`/`onClose`, slide-in animation,
`WorkSessionPanel.tsx:481-513`) with a progress section (`Task progress`, N/M complete,
`:515-524`), an outputs section, and a context section — genuinely closer to Gemini's
two-pane workspace than a plain chat bubble thread. It mounts whenever
`hasWorkSession(displayedMessages, composerToggles?.workMode)` is true
(`WebChatPage.tsx:3695,4344-4348`).

Compared to the claim's bar, it is weaker on two specifics:

- **No auto-generated title.** The header is a static string, `"AGI Work session"`
  (`WorkSessionPanel.tsx:500`), for every task — not Gemini's per-task semantic title
  and not even Manus's truncated one. (See agentic-08 for the deeper root cause: there
  is no title-generation call anywhere for AGI Work sessions.)
- **No `⋮`/options menu.** The header has a status subtitle and a single close (`X`)
  button (`WorkSessionPanel.tsx:496-513`) — no per-task menu equivalent to Gemini's `⋮`
  or Manus's `···`.

It also remains anchored inside the same chat route rather than being a fully separate
task view/URL — consistent with the composer-mode framing from agentic-01.

**Prior audit relationship:** `NEW` (related to, but more specific than,
`AGENTIC-WORK-006`).

**Severity: P2** (MAJORITY convergence — Gemini + Manus — tableStakes true; a real
panel exists, so this is a half-ship, not an absence).

### agentic-06 — Live step-by-step process narration with icon differentiation: LIKELY PRESENT (strength, partially verified)

`AgentActivityTimeline.tsx` (in `packages/ui/unified-chat`, imported live by
`MessageBubble.tsx`, `ToolTimeline.tsx`, and `ChatMessageList.tsx` under
`apps/web/features/chat`) renders a `Clock3` icon (`AgentActivityTimeline.tsx:348`)
alongside a `BrainCircuit` icon (`:458`) and, per the prior audit's
`domain-extensibility.md:81`, per-tool icons parsed from the qualified MCP tool name
("rendered as an icon + label, not a generic spinner") — this is a materially richer
icon vocabulary than Gemini's binary clock-vs-`G`-icon scheme the claim describes.

Caveat: I did not independently confirm the dynamically-updating heading text (Gemini's
"Thinking it through..." → "Identifying three notable Eiffel Tower facts" → "Working on
it..." transition) inside `AgentActivityTimeline.tsx` in this pass — that would need a
live run to observe end-to-end. I'm crediting the icon-differentiation half of the
claim, which is code-verified, and marking the dynamic-heading half unverified rather
than asserting it either way.

A separate, desktop-ported `StatusTrail.tsx` component in the same package (with an
even richer `thinking/searching/coding/running/completed/error` icon+color vocabulary,
`StatusTrail.tsx:24-58`) has **zero import sites** anywhere under `apps/web/features/chat`
— it is dead code on web, superseded by `AgentActivityTimeline`. Not filing this as a
gap (the capability it would have added is already covered by `AgentActivityTimeline`),
but noting it for the dead-code domain if that pass hasn't already caught it.

Not filing a gap for the icon-differentiation half. Marking the dynamic-heading half
"unverified" rather than a finding.

### agentic-07 — Self-disclosed task-complexity classification in narration: MISSING

`request-processor.ts:441,450` has a `classifiedTaskType`/`RoutingTaskType` concept,
but it is used purely for internal model-routing decisions — it is never rendered to
the user as first-person narration ("My initial assessment classified the task as
simple..."). Grepping the agent-execution services and the LLM completions route for
any complexity/difficulty self-assessment string that reaches the client found nothing.

**Prior audit relationship:** `NEW`.

**Severity: P3** (SINGLE_PRODUCT Gemini differentiator, tableStakes false — real, but
minor per the audit brief's own severity guidance).

### agentic-08 — Auto-generated semantic task title (not truncation): PRESENT_WORSE, confirmed

Direct, unambiguous evidence:
`apps/web/app/api/chat/conversations/[id]/messages/route.ts:115-131`:

```ts
// Auto-title conversation from first user message
if (role === 'user') {
  ...
  if (Number(row?.count ?? 0) <= 1) {
    // First message - generate title
    const title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
    await db.execute(`update web_conversations set title = $1, ...`, [title, ...]);
  }
}
```

This is pure character truncation — no LLM call, no semantic rewrite. It sits at or
below even the claim's description of Manus's "lighter" version (Manus at least
produces a truncation/rephrase-style title; ours truncates with no rephrasing at all).
`renameConversation()` exists client-side (`WebChatRuntime.ts:383-391`) but has **zero
call sites** anywhere in `apps/web` outside its own definition — so there is no
auto-rename path at all after the fact, semantic or otherwise. This is also the root
cause of `WorkSessionPanel`'s static "AGI Work session" title (agentic-05) — there is
no task/session title-generation capability anywhere in the web stack to draw from.

**Prior audit relationship:** `NEW`.

**Severity: P3** (SINGLE*PRODUCT Gemini differentiator per the benchmark framing,
tableStakes false — but flagged `PRESENT_WORSE` rather than `MISSING` because we do
ship \_a* version of the feature, just a materially worse one, which is a distinct and
arguably more embarrassing state than not having it).

### agentic-09 — Cascading-deletion warning naming dependent objects: MISSING (copy gap, not a data-loss gap)

`ConversationListItem.tsx:320-323`:

```tsx
<AlertDialogTitle>Delete conversation?</AlertDialogTitle>
<AlertDialogDescription>
  This will permanently delete "{title}" and all its messages.
</AlertDialogDescription>
```

Generic copy — no mention of schedules, published artifacts, or any other dependent
object, unlike Gemini's ("along with any schedules created") or Manus's ("will also
delete the website"). Importantly, the actual delete handler
(`apps/web/app/api/chat/conversations/[id]/route.ts:233-242`) is a **soft delete**
(`set deleted_at = now()`), so the practical risk is lower than the benchmark
products' hard-delete framing suggests — this is a transparency/copy gap, not a
data-loss bug. I did not trace whether an active schedule tied to a deleted
conversation keeps firing or silently orphans; that would be a follow-up worth a
dedicated look in the scheduling domain if not already covered by `AGENTIC-WORK-004`.

**Prior audit relationship:** `NEW`.

**Severity: P2** (MAJORITY convergence — Gemini + Manus — tableStakes true, but capped
below P1 because the underlying soft-delete means no user actually loses data from this
gap today).

### agentic-10 — Non-destructive dismiss (archive) distinct from delete: PRESENT (strength)

`ConversationListItem.tsx:296-309` — a real, separate `Archive`/`Unarchive`
`DropdownMenuItem` sits alongside `Delete` in the same per-conversation menu, backed by
an `isArchived` prop and `onArchive` handler distinct from `onDelete`. This matches the
claim's bar exactly (two separate, explicitly-labeled actions, not an overloaded
delete). Not filing a gap.

### agentic-11 — Task entry persists through execution failure: LIKELY PRESENT, not independently reproduced

`task-display.ts:42,68` treats `'failed'` as a first-class terminal `AgentTaskState`
with its own label and tone in `TasksPage.tsx`, and the prior audit's Strength #1
(`domain-agentic-work.md`) independently documents `cloud-agent-run-service.ts` as "a
proper state machine (queued/running/paused/awaiting_input/ready_for_review/…)" with a
durable event journal. Together this strongly suggests a failed run stays visible with
an inspectable failure state rather than vanishing. I did not force an actual
backend-capacity failure end-to-end in this pass (that would require injecting a
provider outage), so I'm not filing this as either a confirmed strength or a gap —
recording it as an architecturally-plausible pass, unverified live.

### agentic-12 — Mandatory Project-scoping as the entry point: DIFFERENT_BY_DESIGN, not a gap

`canUseAgiWork` (`ChatComposerNew.tsx:455-456`) gates _whether the toggle is visible_
on billing tier, but nothing makes project selection mandatory once AGI Work is
active — `projectPicker` is present but optional, closer to ChatGPT Work's "optional,
secondary" model than Claude Cowork's apparently-mandatory one. This is a legitimate
product-design choice, not obviously a gap (an unscoped agent task is a real,
often-preferred user need). Filed under "not worth copying" below rather than as a gap.

### agentic-13 — Named three-tier autonomy/approval picker in composer chrome: MISSING on Web, degraded on Desktop

**Web:** grepping `ChatComposerNew.tsx` and `apps/web/features/settings` for any
approval-mode / auto-approve / manual-approve control returns nothing — there is no
approval-mode UI anywhere in the web composer.

**Desktop:** the prior audit already covered this precisely. `GAP-058` (Done): a
**global**, binary "Approvals: Auto" warning is shown persistently at the composer when
native auto-approve is on, linking to settings (`ComposerContextControls.tsx`).
`GAP-059` (Not Planned, reasoned): a true **per-conversation**, **named**, **3-tier**
picker (Claude's Manually approve / Automatically approve / Skip all approvals) was
explicitly declined, because the native Tauri executor only exposes a global policy —
adding a per-conversation selector would misrepresent an isolation the backend doesn't
enforce. That is a defensible reason to decline, not an oversight.

**Prior audit relationship:** `CONFIRMS_PRIOR` for Desktop (`GAP-058`/`GAP-059`); `NEW`
for Web, which doesn't even have Desktop's degraded (global, binary, warning-only)
version.

**Severity: P2** (SINGLE_PRODUCT Claude differentiator, tableStakes false, so capped
per the audit's own anti-inflation guidance — but real and cross-surface).

### agentic-14 — Execution-environment picker (local vs. cloud vs. remote-paired): MISSING, largely DIFFERENT_BY_DESIGN

No composer anywhere in the repo lets a user choose, within one session, between a
local machine, a cloud sandbox, and a remotely-paired local machine. This is
consistent with — and mostly explained by — the repo's explicit trust-boundary
separation (Local/BYOK/Managed Cloud as different apps: CLI/Desktop vs. Web). Claude's
version unifies all three into one composer control; this repo deliberately does not.
I am filing this as a real, user-facing capability gap (a user genuinely cannot, e.g.,
pick "run this on my paired laptop" from the web composer) while flagging in
`notWorthCopying` that literally merging the trust boundaries to match Claude's UI
would cut against this repo's own stated security architecture.

**Prior audit relationship:** `NEW`.

**Severity: P3** (SINGLE_PRODUCT Claude differentiator, tableStakes false).

### agentic-15 — Model picker + reasoning-effort slider in composer: PRESENT, ahead of naive parity (strength)

`ComposerFooter.tsx:74-129` implements a catalog-driven reasoning/effort control:
`reasoningFor(model)` reads each model's `reasoning` block from the model registry,
`effortChipsFor(reasoning)` renders **only** the effort marks that model actually
supports (no synthetic/dead effort levels), and it coexists with a model picker
(`showModelSelector` on the same `ComposerFooter`, `ChatComposerNew.tsx:3135-3136`).
This is already documented as a strength by the prior audit's
`domain-composer.md:73,93,115-124`, which specifically calls out that this avoids "the
exact anti-pattern ChatGPT's own surfaces exhibit" (three inconsistent effort widgets
across ChatGPT's own surfaces) and warns not to regress it into one global slider.

**Prior audit relationship:** `CONFIRMS_PRIOR` (`domain-composer.md`). Not filing a new
gap; recorded here as a strength this pass independently re-verified against the
specific benchmark claim.

### agentic-16 — Persistent "Beta" badge on agentic-mode chrome: MISSING

No "Beta"/"BETA" string appears anywhere in `WorkSessionPanel.tsx`,
`ChatComposerNew.tsx`'s work-mode toggle, or `TasksPage.tsx`. This matches ChatGPT's
absence (the claim itself notes ChatGPT has no badge either) but is worth flagging
because, per the prior audit's own findings in this exact domain
(`AGENTIC-WORK-001` dead background agents, `AGENTIC-WORK-003` opt-in durability,
`AGENTIC-WORK-005` no mid-run steering, `AGENTIC-WORK-007` zero-tool scheduled runs),
AGI Work is demonstrably rougher than a finished feature today — closer to Claude's
and Gemini's honestly-badged Beta state than to a GA feature. Shipping it with zero
"early access" signal is an expectation-setting gap, not just a cosmetic one.

**Prior audit relationship:** `NEW`.

**Severity: P2** (MAJORITY convergence — Claude + Gemini — tableStakes false, but
elevated from the default P3 because of the honesty angle above).

### agentic-17 — Persistent per-response "continue in new task" fork icon: PARTIAL, discoverability gap

The underlying capability is real and reasonably sophisticated:
`apps/web/lib/services/conversation-branch-service.ts` implements `ForkConversationInput
{ sourceConversationId, messageId, requestId }` with idempotent branch lookups
(`findIdempotentBranch`) and caps (`MAX_BRANCHES_PER_FORK = 50`,
`MAX_FORK_POINTS_PER_CONVERSATION = 100`). It is wired to the UI: `MessageBubble.tsx:1977-1980`
renders "Branch conversation" with a `GitFork` icon. But it lives inside a
`DropdownMenuItem` (an overflow/"more actions" menu), not as an always-visible icon row
beneath every response the way Manus's copy-icon + fork-icon pair is. The claim's bar
is specifically "always visible on every response, not a context-menu action" — ours is
the context-menu action.

**Prior audit relationship:** `NEW`.

**Severity: P3** (SINGLE_PRODUCT Manus differentiator, tableStakes false — the backend
capability is solid, this is a discoverability/UI-placement gap only).

### agentic-18 — Direct "promote task to recurring schedule" menu action: MISSING

No conversation/task menu anywhere (`MessageBubble.tsx`, `ConversationListItem.tsx`,
`WorkSessionPanel.tsx`) offers a schedule-creation shortcut, and `apps/web/features/schedules`
has no `conversationId`/`fromConversation`/`sourceConversation` concept in any
component — schedules are created from a standalone `/chat/schedules` flow only, with
no path from an existing task back into it.

**Prior audit relationship:** `NEW` (adjacent to, but distinct from, the already-filed
`AGENTIC-WORK-004` daily-cadence-ceiling finding, which is about scheduling capability,
not entry-point discoverability).

**Severity: P3** (SINGLE_PRODUCT Manus differentiator, tableStakes false).

### agentic-19 — Agent deployment to external messaging platforms as a first-class tier: MISSING

Grepping the whole web app for Telegram/Slack/WhatsApp "deploy an agent" surfaces only
finds Telegram/Slack as **inbound connector catalog entries** (data sources the agent
can read from — `apps/web/features/connectors/data/connectors.ts`), never an outbound
"deploy a branded, persistent agent identity onto this platform" flow. No dedicated nav
item, page, or service resembling Manus's "Agent" landing page exists.

**Prior audit relationship:** `NEW`.

**Severity: P3** (SINGLE_PRODUCT Manus differentiator, tableStakes false — a genuine
roadmap idea, not an urgent gap).

### agentic-20 — Self-serve custom-MCP authoring/import, no vendor intermediary: MOSTLY PRESENT, ahead of ChatGPT/Claude, short of Manus's full trio

This is worth stating plainly because it cuts against the "single product Manus
differentiator" framing: **we already have this**, end-to-end, across three surfaces.
`apps/web/app/api/connectors/custom/route.ts` is a real, live-validating
add-a-custom-MCP-by-URL API (`connectMcpServer` from `@agiworkforce/mcp` is called at
save time, "so a saved row is known-good at save time" per its own doc comment,
`:9-13`), HTTPS-only with DNS-resolved-public-hostname validation
(`validateHttpsMcpUrl`) and encrypted-at-rest bearer tokens. It's wired to a real form
in `apps/web/features/connectors/pages/ConnectorsPage.tsx` (`POST /api/connectors/custom`
at `:220`), and the prior audit's `domain-extensibility.md:79,84` independently confirms
the same capability is live on Desktop (`apps/desktop/src/api/cloudConnectors.ts`) and
Mobile (`AddCustomConnectorModal.tsx`) — explicitly noting "2 of 89 [connectors]
actually connectable by default: GitHub... and **user-defined custom remote MCP**,"
i.e., the escape hatch is more load-bearing here than for most of our catalog. Per the
claim's own text, neither ChatGPT nor Claude expose this at all ("only pre-built,
vendor-curated MCP integrations... neither exposes a raw paste-a-URL/JSON action to the
end user") — so on two of the three products this claim is benchmarked against, we are
already ahead.

The one specific thing missing relative to Manus is the **raw-JSON-config import**
variant (Manus: "Custom MCP" / "Import MCP by JSON" / "Add MCP by URL" as three
separate actions) — our form takes a URL + optional bearer token, not an arbitrary
pasted JSON server config.

**Prior audit relationship:** `NEW` framing (the prior audit recorded the URL-based
capability as an aside inside a connector-breadth table, not as a benchmarked
capability in its own right).

**Severity: P3** (SINGLE_PRODUCT Manus differentiator on the JSON-specific gap only;
the URL-based core capability is a strength, not a gap).

### agentic-21 — Credit-based, per-task debit usage ledger: DIFFERENT_BY_DESIGN / PARTIAL

Real usage/billing infrastructure exists (`managed-usage-accounting-service.ts`,
`/api/billing/overage`, `/api/billing/top-up`, and per the git history a recently
finished overage/headroom/opt-in-toggle feature set), but it is bucket-based
(session/weekly/weeklyFlagship/period — same buckets as agentic-02/03) and aggregate,
not an itemized per-task debit ledger. `/api/usage/history`'s own doc comment says
"Managed subscription ledger rows are **private**; exact Stripe invoice and top-up
history use their billing routes" (`:14-15`) and `/settings/usage` renders "credit
bars, analytics" (`apps/web/app/settings/usage/page.tsx:4-5`) — summary-level, not
itemized-by-task with sub-category breakdowns the way Manus splits Tasks/Websites/
Computers.

**Prior audit relationship:** `NEW`.

**Severity: P3** (SINGLE_PRODUCT Manus differentiator, tableStakes false).

### agentic-22 — Named settings destination for cloud + local "agent computer": MISSING, largely DIFFERENT_BY_DESIGN

No "My Computer"-style settings page exists anywhere (web, desktop, or mobile). As with
agentic-14, this is substantially explained by the repo's trust-boundary separation:
"local computer" and "cloud computer" are not two tabs of one setting here, they are
two different apps (Desktop vs. Web) by explicit architectural rule. Filing as a real
gap against the literal claim, but recommending against literally cloning Manus's
single-settings-page model — see `notWorthCopying`.

**Prior audit relationship:** `NEW`.

**Severity: P3** (SINGLE_PRODUCT Manus differentiator, tableStakes false).

## Strengths — where we are at or ahead of the benchmark

1. **Proactive, named, threshold-based usage warning that beats ChatGPT's own
   documented failure mode** — `selectUsageWarning()`
   (`packages/contracts/types/src/usage-vocabulary.ts:139-207`) warns at 75% used,
   escalates at 90%, and picks the _binding_ bucket by name, specifically engineered
   (per its own code comments) to prevent the "first signal was a refused message
   mid-task" experience the benchmark research documents for ChatGPT Work. See
   agentic-03 above.
2. **Catalog-driven, per-model reasoning/effort control that avoids ChatGPT's own
   internal inconsistency** — `ComposerFooter.tsx:74-129`, independently confirmed by
   the prior audit's `domain-composer.md:93,115-124`. See agentic-15 above.
3. **Self-serve custom remote MCP by URL, live-validated at save time, wired across
   Web/Desktop/Mobile** — ahead of both ChatGPT and Claude, which the benchmark
   research states only offer vendor-curated integrations. See agentic-20 above.
   `apps/web/app/api/connectors/custom/route.ts`, `apps/web/features/connectors/pages/ConnectorsPage.tsx:220`.
4. **Real, working archive/delete separation** on conversations
   (`ConversationListItem.tsx:296-309`) — matches the claim's bar exactly.
5. **A real, idempotent branch/fork-from-any-message backend**
   (`conversation-branch-service.ts`) — more sophisticated than a UI-only "new task"
   button (branch caps, idempotency keys, sibling-group tracking), just under-exposed
   in the UI (agentic-17).
6. **Live-polling `/tasks` surface that self-clears without a page refresh**
   (`TasksPage.tsx:80-81,342-348`) — a real, working version of the benchmark's
   "status disappears at completion" requirement, just not mirrored into the main
   chat sidebar (agentic-04).

## Not worth copying

- **Claude's apparently-mandatory Project-scoping for Cowork** (agentic-12). Forcing
  every agent task into a project/workspace context removes the "quick, unscoped
  task" use case that ChatGPT Work and our own optional `projectPicker` both support.
  If we ever tighten AGI Work's project requirement, it should be an opt-in default,
  not a forced gate.
- **Literally merging Local and Cloud execution into one composer-level picker**
  (agentic-14) or one settings page (agentic-22, Manus's "My Computer"). This repo's
  CLAUDE.md is explicit that Local, BYOK, and Managed Cloud are separate trust
  boundaries and must never be silently routed into one another. Manus's unified
  picker is a fine UX for a product without that boundary; cloning the UI pattern
  without first deciding we want to collapse the boundary would be a security
  regression dressed up as a parity fix. If we want to close this gap, it should be
  framed as "let a user explicitly pair/select a remote-controlled local machine from
  within a Managed Cloud session, with the same consent flow CLAUDE.md already
  requires for Local→BYOK forks" — not "put local and cloud in the same dropdown."
- **ChatGPT's zero-warning quota cliff** (the negative case in agentic-03) — obviously
  not something to copy; recorded here only to make explicit that we should keep our
  current proactive-warning behavior as the standard, not regress toward ChatGPT's.

## Things I could not verify

- **agentic-06's dynamic narration heading** (Gemini's "Thinking it through..." →
  task-specific phrase → "Working on it..." transition) — I confirmed the icon
  vocabulary in `AgentActivityTimeline.tsx` but did not run a live agent task to
  observe whether the heading text itself updates dynamically. Recorded as
  unverified, not asserted as present or absent.
- **agentic-11's specific failure scenario** (a _task-creation-level_ backend failure,
  before any run starts, still leaving a visible sidebar entry) — the state-machine
  architecture strongly suggests this holds, but I did not force an actual backend
  failure to observe it end-to-end. Recorded as architecturally-plausible, not
  confirmed.
- **Whether an active schedule tied to a deleted (soft-deleted) conversation keeps
  firing or silently orphans** (agentic-09 follow-up) — out of scope for this pass;
  flagged for whoever owns the scheduling domain if not already covered by
  `AGENTIC-WORK-004`.
