# Competitive Gap Analysis — AGI Workforce vs ChatGPT · Claude · Gemini · Manus

**Filed:** 2026-08-15 · **Re-verified:** 2026-08-20 · **Branch:** `compliance/dpdp`
**Benchmark:** `~/Desktop/competitive-product-research` (68 files, 4 products, live browser session, same date)

---

## What this is, and how it differs from the audit already on disk

There are now two gap audits from the same day. They are not duplicates and neither
supersedes the other:

|                  | `audit/parity-2026-08-15/` (earlier today)       | `audit/competitive-gap-2026-08-15/` (this one)              |
| ---------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| Benchmark source | Web research + 288 competitor screenshots        | A **live browser session** driving the real production apps |
| Products         | ChatGPT, Claude                                  | ChatGPT, Claude, **Gemini, Manus**                          |
| Scope            | All 8 surfaces, dead code, architecture, backend | Capability parity against observed competitor behavior      |
| Gaps             | 168                                              | **168** (coincidence — different gaps)                      |

The earlier audit answers _"is our product internally complete and consistent?"_
This one answers _"where does our product actually differ from what these four
products do when a human uses them?"_ — a question the earlier pass could only
approximate, because it was reading about competitors rather than watching them.

That difference shows in the numbers: **137 of 168 gaps here are NEW**, not because
the earlier audit was sloppy, but because Gemini and Manus were never benchmarked
before, and because observed behavior surfaces things documentation never states.

## Method

13 capability domains, plus a 14th of my own live browser verification. For each of
the 13, a Sonnet 5 agent read the relevant slice of the
research corpus and turned the prose into discrete **testable capability claims**
(preserving the corpus's own OBSERVED / STRONGLY INFERRED / UNVERIFIED labels and
recording how many of the four products converge on each). A second Sonnet 5 agent
then audited this repo against those claims. Synthesis, live browser verification,
and every correction below are mine (Opus 5).

The rule the auditing agents were held to is the one in this repo's own `CLAUDE.md`:

> Do not assume that an existing screen, component, button, API, service, package,
> route, hook, schema, tool, or backend implementation means that the capability is
> complete.

So agents traced `UI → client → contract → network → handler` and reported the
**first broken link**, which is why `BUILT_NOT_WIRED` is a separate state from
`MISSING`. That distinction is where most of the value is.

## Read this first

| If you want…                     | Read                                                 |
| -------------------------------- | ---------------------------------------------------- |
| Every gap, ranked, with evidence | **`GapMatrix.md`** (generated from `domains/*.json`) |
| One domain in depth              | `domains/<domain>.md`                                |
| What we should **not** copy      | `GapMatrix.md` → "Deliberately not copying"          |
| Where we're **ahead**            | `GapMatrix.md` → "Where we match or beat all four"   |

`GapMatrix.md` is generated deterministically by `build_matrix.py`. No model rewrites
it, so the counts here can never drift from the data. To change a row, change the JSON
and re-run.

---

## Findings at a glance

**168 gaps — 0 P0 · 14 P1 · 58 P2 · 96 P3.**

**There are no P0s, and that is a real result, not a rounding error.** Nothing in this
pass shows a user hitting a broken or incorrect experience against these four
benchmarks. The product works. What follows is parity and polish.

By state, as re-verified on **2026-08-20**:

| State               | Count | 15 Aug | What it means                                    |
| ------------------- | ----- | ------ | ------------------------------------------------ |
| MISSING             | 79    | 82     | Doesn't exist                                    |
| **FIXED**           | **36**| 0      | **Shipped since this audit was filed**           |
| PARTIAL             | 27    | 45     | Reachable but thinner than the benchmark         |
| **BUILT_NOT_WIRED** | **6** | 20     | **Works, but no user can reach it**              |
| DIFFERENT_BY_DESIGN | 11    | 11     | Deliberate divergence, filed so it stays visible |
| PRESENT_WORSE       | 9     | 10     | We ship it; ours is weaker                       |

### Read the 15 Aug column as history, not status

Thirty-six rows were shipped between 15 and 20 August. A row here is a **claim to
re-check, not a fact** — every `FIXED` entry carries `verifiedOn` and
`verifiedEvidence` naming the implementation that closed it, and the rows that
survived carry their original evidence unchanged.

Two rows were scored wrong rather than stale, and both were caught by re-reading
the code rather than trusting the row: `G4` (the reports gallery IS reachable, via
the ResearchPanel `library` tab, which passes no `conversationId`) and
`settings-21-gap` (`toolAccessMode` sits in `REMOVED_PERSISTED_SETTINGS_KEYS` — it
is deliberate migration cleanup, never dead code).

### BUILT_NOT_WIRED is down from 20 to 6

The pattern the original audit named — someone built the destination and nobody
built the door — was real, and most of it has been closed. What remains is
`settings-03-gap`, `settings-07-gap`, `settings-08-gap` (desktop PR automation,
still only a barrel re-export), plus `ART-CANVAS-03`, `memory-13-gap` and
`sched-gap-14`, the last of which is blocked on `sched-gap-01` and not actionable
on its own.

The eight small ones, in full: the artifacts gallery (P1), the mobile Skills screen
(P1), the voice settings page (P1), destructive-action confirmation falling back to
`window.confirm()` (P2), the model deprecation countdown (P2), the schedules
status filter (P3), the paywall's missing price (P3), and suggested-template icon
differentiation on web (P3).

The clearest case, which I verified in the browser rather than in source:

> **`/gallery` is a complete, working, Claude-parity artifacts gallery** — "Artifacts"
> heading, "New Artifact" button, Your artifacts / Inspiration tabs, rendering this
> account's real artifacts with correct type badges and timestamps. It is reachable
> from **nowhere** in the product. The only non-sitemap link to it lives in
> `WebShellV3.tsx`, a shell whose sole mount point (`UnifiedChatPage.tsx`) has **zero
> importers** — both `/` and `/chat` mount `WebChatRoot` instead. It also renders in
> marketing-site chrome rather than the app shell.

Claude's dedicated `/artifacts` gallery is, per the research, the core of its
"an artifact is a first-class object" philosophy — the thing that most distinguishes
it from ChatGPT's generic Library. We built the equivalent and then hid it.

Others in the same class: the mobile Skills screen (655 lines, tested, no nav entry),
the voice settings page (real, honest content, absent from `SETTINGS_NAV_GROUPS_WEB`),
a Reports-listing API with no UI caller, and a per-task credit ledger that never
reaches a screen.

### The 14 P1s cluster into five themes

1. **Extension surfaces are built but not reachable or not populated** — skill
   auto-invoke has zero call sites; connectors and plugins can't be attached
   per-message (only skills can); the plugin registry ships zero installable entries.
2. **Project-scoped memory doesn't exist** — all three benchmarked products let you
   scope memory to a workspace, and both ChatGPT and Claude _passed a live isolation
   test_. Ours is honestly disclosed as account-wide, which is the right way to ship
   an absence, but it's still an absence against a 3/3 convergence.
3. **Two controls silently do less than they claim** — Deep Research on the default
   model, and attachments staged in image/video mode being discarded on send.
4. **Account deletion isn't blocked by an active paid subscription** (two duplicate
   delete flows, neither checks).
5. **Three orphaned destinations** — the artifacts gallery, the mobile Skills screen,
   and the voice settings page are each complete and each reachable from nowhere.

Agentic modes contributed 1 P1 and 16 gaps overall; note that its effort ratings were
**inferred during a recovery pass** (that agent lost its structured return and the
markdown it wrote never stated effort), so treat its S/M/L values as softer than the
rest. Severities there are doc-stated and preserved.

---

## Corrections I made to the agents' findings

Recorded because a gap analysis that never audits itself is just an opinion.

1. **The artifacts agent filed `/gallery` as a strength**, citing
   `WebSidebar.tsx:112, WebShellV3.tsx:33` as "its own left-nav entry." That is a
   citation to dead code. Withdrawn and refiled as `orch-gap-01` (P1,
   BUILT_NOT_WIRED) after verifying in the browser that the live rail has no
   Artifacts entry.

2. **The search agent's "not worth copying" note contradicts its own P1.** It claims
   "our loop always performs a real planning turn and real search rounds by default,
   so a user who enables Deep Research always gets genuine multi-round work." False
   for Anthropic providers — i.e. for the **default model**. Verified live.

3. **I was wrong mid-pass about the nav rail.** I initially measured the `/chat`
   sidebar with a bounding-box heuristic, picked the chat-history column instead of
   the icon rail, and concluded the primary nav was missing entirely. Re-checking by
   enumerating rail buttons showed a full 6-item rail. The real finding is narrower
   and different: the rail is defined **twice** and the copies have drifted, so
   `Tasks` is reachable from `/chat/library` but not from `/chat` (`orch-gap-02`).

4. **The Deep Research P1's framing was too harsh.** "Silently degrades to an
   unbranded fallback" implies nothing happens. Live, it returned 10 real citations
   to real sources. The defect is the _lack of disclosure_ that one toggle means two
   different things — which is a different fix.

---

## Where we are genuinely ahead

Not flattery — each of these is cited to a file, and several beat all four products:

- **Markdown rendering.** I ran the researchers' own torture prompt live. We render
  every element correctly, **including the two Gemini fails** (GFM checklists render
  as real checkboxes, not raw `[x]` text; the horizontal rule renders). Wide tables
  get an `overflow-x-auto` container, so the one real bug the benchmark warns about
  doesn't occur here.
- **Per-message text-to-speech** in the action row — Claude is the _only_ one of the
  three benchmarked products that has this. We match it.
- **Reasoning effort**: 7 catalog-driven levels vs ChatGPT's 3.
- **Per-tool approval** (Always allow / Ask / Block) is strictly more granular than
  ChatGPT's single blanket toggle. The agent's note that "the benchmark should
  converge toward us" is fair.
- **Pricing honesty**: we publish Max 5x ($100) and Max 15x ($200) as separate priced
  cards. _Both_ ChatGPT Pro and Claude Max hide the 20x price behind "From $100/month."
- **No ads on any paid tier** — ChatGPT runs personalized advertising on Free and Go.
- **Self-serve MCP connector authoring** that really connects and lists advertised
  tools before you add it — matching Manus's most distinctive feature.
- **Send-destination disclosure** per message ("Sent to AGI managed cloud"). No
  benchmarked product tells you where the bytes are going before you send.

There is also a repeated pattern the agents kept independently noticing: **this
codebase removes dead controls instead of shipping them fake** — the project-memory
scope dropdown, the model-training toggle that gated nothing, the refusal to invent
plugin install counts (`0096_plugin_registry.sql`: _"a column invites a fabricated
number"_). That discipline is why there are no P0s.

---

## What not to build

`GapMatrix.md` has the full list with reasons. The ones worth knowing up front:

- **ChatGPT's countdown auto-start** on the research plan card — a timer that spends
  the user's budget by default is a dark pattern, not a target.
- **Gemini's "Create ▾"** derivative formats (Quiz/Flashcards/Audio Overview) — the
  research's single most distinctive Gemini finding, but it rides on NotebookLM.
  Multi-week build for a single-product, non-table-stakes differentiator.
- **Claude's precise install counts** (1.2M–2.2M) with no stated methodology — this
  repo already reasoned against exactly that.
- **ChatGPT's "Trusted contact"** crisis escalation — implies a clinical-risk
  classifier over live conversation content. `SafetySection.tsx` already declines it
  explicitly and correctly.
- **A GPT-Store-style public storefront** before a signing/review policy exists.

---

## Suggested order

1. **Wire the 8 S-effort orphans**, starting with `/gallery`. Highest
   payoff-to-effort in the pass — finished features become reachable for the cost of
   a nav entry. Deduplicate the nav rail first (`orch-gap-02`) so it's one change.
2. **Make Deep Research honest on the default model** — normalize the Anthropic
   stream, or disclose the lighter path. Don't leave one badge meaning two things.
3. **Gate account deletion on an active subscription** in both delete flows.
4. **Replace the ~7 `window.confirm()` destructive-action call sites** with the
   `AlertDialog` already proven correct elsewhere — a 4/4-product convergence, and
   `delete conversation` is the most frequent destructive action in the app.
5. Then project-scoped memory (P1, L) and the extension-surface P1s.

## Known limits of this pass

- Agents verified against **source plus targeted curl**; only my own findings and the
  markdown/action-row/Deep-Research checks were verified in a live browser.
- **No adversarial verification round.** The 165 agent-filed gaps have not been
  independently challenged the way the earlier audit's Done-claims were. Given I
  found two incorrect claims by hand-checking a small sample, assume a similar error
  rate remains in the untested remainder — treat individual P3s as leads.
- Benchmark coverage inherits the corpus's own gaps: Gemini Canvas untested,
  no live agentic run for Manus (real outage), voice mode untested for all products,
  and no accessibility or responsive audit for any of them.
