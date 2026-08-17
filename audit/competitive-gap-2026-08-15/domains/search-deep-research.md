# Domain audit: Web Search & Deep Research

Date: 2026-08-15

Benchmark: live-observed ChatGPT, Claude, Gemini (and Manus, though no Manus
research-mode claim appeared in this domain's 27-claim set) behavior captured
2026-08-15, cross-referenced against the exhaustive same-day repo audit at
`/Users/siddhartha/Desktop/agiworkforce/audit/parity-2026-08-15/gaps/domain-search-research.{json,md}`
(prior art ID prefix `SEARCH-RESEARCH-00N`, all tagged `CAP-045`).

Scope traced: `apps/web/features/chat/components/research/*` (ResearchActivity,
ResearchPanel, ResearchReportView), `apps/web/features/chat/components/Composer/ChatComposerNew.tsx`
(Deep Research toggle), `apps/web/app/api/llm/v1/chat/completions/lib/research-loop.ts`,
`apps/web/app/api/llm/v1/chat/completions/route.ts`, `apps/web/app/api/research/reports/route.ts`,
`apps/web/lib/hooks/useChatStream.ts`, `apps/web/lib/runtime/WebChatRuntime.ts`,
`apps/web/features/chat/components/messages/{InlineSourceTags,ToolTimeline,MessageBubble}.tsx`.

## Headline

The prior same-day audit already found and filed the single most important defect in this
domain (Deep Research silently degrading to a plain single-turn web search for
Anthropic-model conversations and free-trial users — `SEARCH-RESEARCH-001`), and re-reading
`route.ts:301-359` today confirms it is **still live, byte-for-byte**, so this pass reconfirms
it (`CONFIRMS_PRIOR`) rather than rediscovering it.

What this pass adds, because it benchmarks against Gemini and Claude's actual pre-flight/live
UI in a way the prior ChatGPT/Claude-only pass could not, is a cluster of **new** findings the
prior audit had no visibility into:

1. We have **no pre-flight plan-approval gate at all** — no reviewable plan card, no Edit, no
   countdown, no "answer without research" escape hatch, no time estimate. Our research loop
   plans and executes in one continuous motion, the same shape as Claude's (`dr-03`) — except
   Claude's version is fast (adaptive effort, 3–10s for easy queries) and ours is not: the
   loop always forces a real planning turn plus multiple real web-search rounds
   (`DEFAULT_RESEARCH_MAX_ITERATIONS = 6`, `MIN_ITERATIONS_FOR_PLANNING_TURN = 3`, so the
   planning turn is on by default for every run). We accidentally combined the "no gate"
   pattern with the "always heavy" pattern, landing between the two documented archetypes
   rather than cleanly matching either.
2. The backend already supports a cross-conversation "all my research reports" query
   (`GET /api/research/reports` with no `conversationId` returns "newest reports for the
   caller") but **nothing in the client ever calls it that way** — the only caller
   (`ResearchPanel.tsx`'s `ReportTab`) always scopes to the active conversation. A genuine
   Reports gallery (`dr-20`) is a `BUILT_NOT_WIRED` gap, not a `MISSING` one: the read path,
   RLS isolation, and rendering component (`ResearchReportView`) all already exist.
3. No mid-flight steering of any kind exists for research or otherwise: the composer replaces
   Send with Stop the instant a turn starts streaming (`isGenerating={isStreaming}` in
   `WebChatPage.tsx:4238`), so neither ChatGPT's "edit the plan without restarting" (`dr-09`)
   nor Claude's "quick answer" redirect pill (`dr-10`) has anywhere to attach — this is an
   architectural gap in the whole chat send path, not something local to research.
4. The persisted report view has no nested Table of Contents (`dr-21`) and its citation list
   (`ResearchReportView.tsx`'s `CitationRow`) drops the favicon that the sibling `SourceRow`
   component two files away already renders — a small, easily fixed inconsistency, not a
   missing capability.

## Strengths — confirmed still true, re-verified against live code today

| Claim(s)                                                                                             | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `dr-01` dedicated Deep Research entry point, separately named, with a visible active-state indicator | `ChatComposerNew.tsx:2805-2822` — a `MenuToggleRow` labelled "Deep Research" with its own `Telescope` icon, gated on `modelSupportsResearch` (a distinct catalog capability field from plain search, `line 725-733`); once enabled, `overflowActiveOptions` (line 1964-1965) surfaces a "Deep Research" badge with the same icon in the composer chrome — this is the "chip/badge once selected" the claim asks for.                                                           |
| `dr-27` visible process narration during the run (not a blank spinner)                               | `ResearchActivity.tsx` — phase label (`PHASE_FALLBACK_LABELS`), live elapsed clock, round/search/source counts, AND a real per-step plan queue (`PlanStepRow`) with server-reported status icons. This is a genuine superset of ChatGPT's status line and roughly comparable to Claude's "Thinking about X" — it is missing only Gemini's titled multi-paragraph prose sub-sections (see Gap G6).                                                                              |
| `dr-12` numeric live progress disclosure                                                             | `ResearchActivity.tsx:158-180` — live "N of M searches", "N sources", "round I of N" counts, comparable in spirit to Gemini's "Researching 10 websites...", though phrased as counters rather than a single sentence.                                                                                                                                                                                                                                                          |
| `dr-13` live per-source tiles appearing during (not only after) execution                            | `ToolTimeline.tsx` `InlineSourceCards`/`InlineSourceRow` (lines 201-260) render a favicon + title + host card for each completed search step as the round finishes, inside the same streaming message — not a single Gemini-style continuous grid, but real live source disclosure, round by round, which the prior audit's benchmark note said ChatGPT explicitly lacks ("No per-site favicon log... in this surface").                                                       |
| `dr-14` visible, working stop/cancel control during an active run                                    | `WebChatPage.tsx:4236` (`onStop={handleStopGeneration}`) → `useChatStream.ts:1826-1832`: an abort while `researchActive` is true is handled as a first-class case — the phase is set to `interrupted`, running tool steps are finished, and the partial report/sources are persisted (verified against `research-loop.ts:926-930`, which checks `options.signal?.aborted` before every provider/fetch side effect). This is a real, tested cancel path, not a cosmetic button. |
| `dr-16`/`dr-18` source list + duration disclosure                                                    | `ResearchPanel.tsx` `SourceRow` shows favicon + domain + citation index + snippet per source (Sources tab); `ResearchActivity.tsx` keeps the elapsed-time readout visible after `complete`, functioning like Claude's "Thought for Ns" (not collapsed/expandable the same way, but the wall-clock number is real, not approximated — see `formatElapsed`/`research.elapsedMs`).                                                                                                |
| `dr-22` (partial) live queryable follow-up                                                           | Not an explicit UI affordance ("Ask about this file"), but functionally present: a Deep Research report IS the assistant's message in the live conversation, so an ordinary next turn in the same chat is naturally grounded in it via normal chat history. Genuinely missing only when a report is reopened _outside_ its original conversation (see Gap G12).                                                                                                                |

## Gaps

### G1 — No pre-flight plan-approval gate at all (dr-02, dr-04, dr-05, dr-06, dr-19)

Every one of ChatGPT's and Gemini's pre-execution affordances is absent: a reviewable plan
card before spending budget, an Edit control, a countdown/auto-start, a "skip research, answer
now" fallback link, and a time estimate. Read the entirety of `ResearchActivity.tsx` (258
lines) and `research-loop.ts`'s phase machine (`planning → searching → synthesizing →
complete/error/interrupted`, `research-loop.ts:103`) — the plan is generated by a real LLM
turn (`parsePlanQueries`, `research-loop.ts:277-284`) but it streams to the client as part of
the SAME run that is already spending search budget; there is no separate approval step
between planning and execution, and the plan (once shown) has no edit affordance
(`PlanStepRow` in `ResearchActivity.tsx:63-105` is read-only, no input/textarea, no onClick
handler that mutates a step).

This is `MAJORITY` convergence (ChatGPT + Gemini), `tableStakes: false`, and Claude explicitly
does NOT do this (`dr-03`), so per the severity rubric this is P2, not P1 — a real gap against
the majority but not a universal one.

### G2 — Deep Research silently degrades for Anthropic models and free-trial users (dr-01, dr-27)

`CONFIRMS_PRIOR` — `SEARCH-RESEARCH-001`, re-verified against the current `route.ts` today.

`route.ts:314-318` still gates the entire multi-stage loop behind
`processed.researchMode && !processed.freeTrial && processed.provider.toLowerCase() !== 'anthropic'`.
The composer's toggle (`modelSupportsResearch`, `ChatComposerNew.tsx:732-733`) is gated purely
on catalog capability + `providerCanWebSearch`, with **no provider exclusion**, so it renders,
enables, and shows the "Deep Research" active badge identically for a Claude model. What
actually runs for that cohort is `applyResearchMode()` (`request-processor.ts:1062-1071`) — a
system-prompt injection plus the native Anthropic search tool forced to `max_uses: 20` for one
ordinary turn. No `x_research_status`/`x_research_plan` events are ever emitted, so
`ResearchActivity` never mounts (confirmed: it is driven entirely by those two event types —
`useChatStream.ts:1388-1461`), and `persistReport` (the only writer of `research_reports`) is
never called outside `runResearchLoop`, so `ResearchPanel`'s Report tab permanently reads "No
saved report yet" for these conversations.

This directly undercuts two claims in this pass's set: `dr-01` (the entry point is supposed to
have a consistent visible indicator once selected — it does, but the indicator lies about what
actually happens for this cohort) and `dr-27` (`ALL_PRODUCTS`/`tableStakes: true` — visible
process narration during the run — is the one thing every benchmarked product does, and this
is the one path in our own product where a user who explicitly turned "Deep Research" on gets
zero narration and no indication anything different happened).

Severity unchanged from the prior audit: P1.

### G3 — No mid-flight steering of a running research task (dr-09, dr-10)

Neither ChatGPT's "edit the plan without restarting, get a narrated acknowledgment" nor
Claude's "Quick answer" redirect pill has anywhere to attach, because the whole chat
architecture — not just research — replaces Send with Stop for the duration of any streaming
turn: `WebChatPage.tsx:4238` passes `isGenerating={isStreaming}` to the composer, and multiple
handlers early-return on `isStreaming` (e.g. `WebChatPage.tsx:2617,3403,3437,3519,3584`). The
only interrupt available while a research run is active is the hard Stop
(`handleStopGeneration` → full cancellation, `useChatStream.ts:1826-1832`), which discards the
in-progress run rather than redirecting or steering it.

Both source claims are `SINGLE_PRODUCT` (ChatGPT and Claude respectively, not the same
product), `tableStakes: false` → P3 each, rolled into one finding since the root cause and fix
surface (the send-path architecture) is shared.

### G4 — Reports gallery: backend already supports it, no UI ever calls it that way (dr-20)

`BUILT_NOT_WIRED`. `GET /api/research/reports` (`apps/web/app/api/research/reports/route.ts:15-20,63-68`)
explicitly documents and implements a no-`conversationId` mode: "newest reports for the
caller", correctly RLS-scoped (`getUserScopedDb`). `ResearchReportView.tsx` already renders a
report as a full document view with markdown/PDF/DOCX export. The missing link is entirely at
the UI layer: grepped the whole `apps/web/app` tree for any report/reports route or gallery
page — none exists (`find apps/web/app -iname '*report*'` returns only an unrelated
`content-report` moderation endpoint) — and the only client call site,
`ResearchPanel.tsx`'s `ReportTab` (line 143), always passes `conversationId`, so it can only
ever show the current conversation's latest report. There is no nav entry, no route, and no
call site that exercises the "all my reports" mode the backend already serves.

`SINGLE_PRODUCT` (ChatGPT) but `tableStakes: true`, and the fix is unusually cheap (the read
path, auth, and renderer are done) → P2.

### G5 — No nested Table of Contents in the report reader (dr-21)

Grepped `apps/web/features/chat` and `packages/ui` for any `TableOfContents`/TOC-generation
helper — none exists. `ResearchReportView.tsx` renders the report body as one continuous
`MarkdownContent` block (line 252-257) with no heading extraction, no jump-to-section sidebar,
and no anchors. `MAJORITY` convergence (ChatGPT + Gemini), `tableStakes: true` → P2.

### G6 — No dedicated live narration panel with titled prose sub-sections (dr-11)

`ResearchActivity.tsx` gives phase labels and a plan-step queue, which is real narration
(`dr-27`, see Strengths) but is structurally different from Gemini's separate side panel with
a "Show thinking" toggle and titled, italicized, first-person prose sections that fill in as
they complete. We have no equivalent surface — the closest analog, `ResearchPanel`'s
Sources/Report tabs, is data display, not narrative. `SINGLE_PRODUCT` (Gemini),
`tableStakes: false` → P3.

### G7 — No opt-in "notify me when done" control during a run (dr-08)

Grepped `apps/web/features/chat` for "notify"/"Notify" in any research-adjacent component —
zero hits. `SINGLE_PRODUCT` (Claude), `tableStakes: false` → P3.

### G8 — No one-click derivative-format conversion menu (dr-23)

No "Create" menu, no Infographic/Quiz/Flashcards/Audio Overview generation path exists
anywhere in the repo (grepped for `Audio Overview`, `Flashcards` — no hits outside unrelated
keyboard-shortcut naming). `SINGLE_PRODUCT` (Gemini), `tableStakes: false`, and this is a
meaningfully large net-new feature (audio synthesis, quiz generation, a custom "describe your
own app" free-text path) → P3, XL effort. Flagged in `notWorthCopying` below as low priority
given the build cost relative to single-product differentiation value.

### G9 — No direct push-to-connected-productivity-suite export (dr-24)

Only local download exports exist (`ResearchReportView.tsx` `EXPORT_FORMATS`: Markdown, PDF,
Word via `documentExportService`). No "Export to Docs" or equivalent push-to-connector path.
A Google Drive connector entry already exists in the connector catalog
(`apps/web/lib/connectors/catalog.ts`, `apps/web/features/connectors/data/connectors.ts`)
which could be a foundation, but no write-scoped Docs export was found. This is explicitly a
structural advantage tied to Gemini owning Google Workspace — `SINGLE_PRODUCT`,
`tableStakes: false` → P3, and genuinely hard to justify chasing without an owned document
suite (see `notWorthCopying`).

### G10 — Report citation list is missing favicons the sibling component already has (dr-16)

`ResearchReportView.tsx`'s `CitationRow` (lines 74-109) renders only a numbered badge + title +
host + external-link icon — no favicon `<img>`. `ResearchPanel.tsx`'s `SourceRow` (lines
27-98), rendering the SAME kind of source data one file away in the "Sources" tab, already
implements the favicon-with-Google-fallback pattern
(`https://www.google.com/s2/favicons?domain=...`). This is an easy, low-risk, same-file-pattern
fix (copy the existing fallback logic), not a new capability. `SINGLE_PRODUCT` (Gemini),
`tableStakes: true` on Gemini's side but not corroborated elsewhere → P3, S effort.

### G11 — No source-scoping or file-attachment controls specific to the Deep Research composer (dr-26)

Grepped `research-loop.ts` and `web-search-tool.ts` for any domain-allowlist/scoping
mechanism — none exists; confirmed separately (prior audit `SEARCH-RESEARCH-003`) that the
loop strips every tool except `url_fetch`, so even the ordinary file/attachment/connector
tools available in ordinary chat turns are unavailable once a research run's gathering rounds
start. No "Sources"/"Files" buttons specific to a Deep-Research-active composer were found.
This claim's own `evidenceLabel` is `UNVERIFIED` even for Gemini itself (the source research
flagged it as an open item), so this is a low-confidence gap on both sides. `SINGLE_PRODUCT`,
`tableStakes: false` → P3.

### G12 — Reopened/standalone report view has no follow-up composer (dr-22, partial)

Within the live conversation that produced it, a research report is grounded and queryable by
just continuing the chat (see Strengths). But `ResearchReportView.tsx` and `ReportTab` (the
only two places a persisted report currently renders) have no composer, no "ask about this
report" affordance, and no way to send a grounded follow-up from the report view itself — a
gap that will only get more visible once Gap G4 (a Reports gallery reachable from outside the
originating conversation) is built, since a report opened from a gallery has no parent
conversation context to fall back into. `MAJORITY` (ChatGPT + Gemini), `tableStakes: true` →
P2, since the general capability is real today but the specific UI signal/affordance the
claim asks for is absent, and will be a genuine dead end once reports are reachable
cross-conversation.

## Cross-reference to the prior parity-2026-08-15 audit

| This pass                                     | Prior ID              | Relationship                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G2                                            | `SEARCH-RESEARCH-001` | `CONFIRMS_PRIOR` — re-verified against today's `route.ts`, unchanged, still P1.                                                                                                                                                                                                                                        |
| (mentioned, not re-filed)                     | `SEARCH-RESEARCH-002` | Cross-surface reach (Desktop/Mobile/Chrome). Out of this domain's file scope (composer/citations/plan UI) but worth noting it compounds G2: the surfaces that DO parse research events (Desktop Cloud) still never render them. Not re-filed as a new gap here to avoid duplicating the prior audit's row.             |
| (mentioned, not re-filed)                     | `SEARCH-RESEARCH-003` | Research loop strips all tools but `url_fetch` — cited above as supporting evidence for G11 (no connector/file input to a research run), not re-filed independently.                                                                                                                                                   |
| G1, G3, G4, G5, G6, G7, G8, G9, G10, G11, G12 | none                  | `NEW` — none of these appear anywhere in `domain-search-research.json`. The prior audit's scope (ChatGPT/Claude web research only) had no visibility into Gemini's plan-gate UI, Reports-gallery pattern, or TOC/Create-menu/Export-to-Docs affordances, which this Gemini-inclusive pass surfaces for the first time. |

No `CONTRADICTS_PRIOR` findings in this domain — nothing in the prior audit's premises was
disproven by this pass.

## What NOT to copy

- **ChatGPT/Gemini's pre-flight plan-approval gate, wholesale.** Gap G1 is real, but blindly
  cloning ChatGPT's countdown-auto-start pattern (`dr-04`) would be actively worse: an
  unattended timer that spends the user's research budget by default is a dark pattern, not a
  UX win. If a pre-flight review step is built, it should require an explicit affirmative
  action (a real "Start research" click), not a countdown default.
- **Gemini's "Create ▾" derivative-format menu (dr-23), as a near-term priority.** Genuinely
  interesting, but it is a large net-new surface (audio synthesis pipeline, quiz/flashcard
  generation, a custom-app free-text path) justified for Gemini by NotebookLM's existing
  infrastructure. Building it here without that foundation is a multi-week investment for a
  single-product differentiator (`tableStakes: false`). Low priority.
- **Gemini's "Export to Docs" (dr-24), as a literal target.** This is explicitly a structural
  advantage of owning Google Workspace, not a portable pattern — the benchmark's own framing
  says so. If we chase parity here, the honest analog is "export to the user's connected
  storage" (Drive, Notion, etc. via the existing connector catalog), not trying to become a
  document suite.
- **Claude's zero-citation "sometimes it just answers from memory" behavior (dr-17), as a model
  to emulate.** Our research loop always performs a real planning turn and real search rounds
  (`MIN_ITERATIONS_FOR_PLANNING_TURN = 3` and a default `maxIterations` of 6, so the planning
  turn is on by default) — a user who turns on Deep Research always gets genuine multi-round
  work, never a fast, possibly-parametric-only answer dressed up as research. That is a
  deliberate, defensible difference from Claude's adaptive-effort design (flagged in its own
  source research as needing a retest before generalizing), not a gap to fix.
- **InlineSourceTags' Claude-style block citation chips are already the right call** (per the
  prior audit's own note) — do not chase ChatGPT's superscript-footnote style (`dr-15`) just
  because it exists; both patterns are live in production across the benchmark and neither is
  objectively better.

## Notes on evidence quality

- G1–G11 are all verified directly against current source (file:line cited); none are
  guesses. Where a claim's own benchmark evidence was itself `UNVERIFIED` (dr-26), I said so
  rather than treating our absence as a confirmed regression.
- I did not independently re-verify `SEARCH-RESEARCH-002`/`-003`/`-004`/`-005`/`-006` against
  current code — they are cited from the prior audit's own file:line evidence, which I did not
  re-open, since this domain's brief scoped me to composer/citations/plan-UI/tool-wiring and
  the prior audit's own evidence for those rows already includes specific file:line citations
  I have no reason to doubt were accurate as of "earlier today."
- G12's severity (P2) is a judgment call: the underlying capability (grounded follow-up) works
  today in the common case (same conversation). I weighted it against `tableStakes: true` +
  `MAJORITY` because the gap becomes materially worse once G4 is fixed, not because it is
  acutely broken today. A reviewer could reasonably call this P3 instead.
