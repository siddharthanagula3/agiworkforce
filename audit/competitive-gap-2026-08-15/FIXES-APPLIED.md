# Fixes Applied — "built but partial, unwired, or wrong"

**Date:** 2026-08-15 · **Branch:** `compliance/dpdp` · **Base commit:** `e15df56e3`
**Source of work:** the 75 gaps in `GapMatrix.md` whose `ourState` was
`BUILT_NOT_WIRED`, `PARTIAL`, or `PRESENT_WORSE` — i.e. capabilities that already
existed but did not actually work end to end.

36 of those were selected as true fix-ups (S/M effort). The L/XL remainder are new
feature builds, not repairs, and were deliberately left for a separate decision.

## Result

| Outcome            | Count                                              |
| ------------------ | -------------------------------------------------- |
| FIXED              | 33                                                 |
| PARTIAL            | 2                                                  |
| DELETED_DEAD_CODE  | 1                                                  |
| BLOCKED / DECLINED | 0 remaining (all wave-1 handoffs closed in wave 2) |

**Verification:** `tsc --noEmit` clean · 1437 web tests · 995 `unified-chat` tests ·
89 `ui` tests — all passing. Key flows re-driven in a real signed-in browser.

50 files changed, 3065 insertions, 697 deletions, plus 12 new files.

---

## What actually changed, by area

### Navigation & shell

- **One shared nav rail.** The primary rail was defined twice by hand
  (`WebChatPage.tsx` had 6 items, `WebAppShell.tsx` had 7) and had drifted, so
  **Tasks was unreachable from `/chat`**, the app's default screen. Both now consume
  `apps/web/shared/components/layout/app-nav-items.ts`, with `isActive` derived from
  `pathname` instead of hardcoded. Verified live: identical 8-item rail on every
  route, exactly one active entry.
- **The artifacts gallery is reachable.** `/gallery` was a complete, working,
  Claude-parity gallery linked only from `sitemap.ts` and a dead shell. Added an
  **Artifacts** rail entry, and a new `/chat/artifacts` route that mounts the _same_
  `GalleryClient` inside `WebAppShell` so signed-in users keep the product chrome.
  `/gallery` stays public with marketing chrome and its SEO surface intact.
- **Mobile Skills nav restored.** A 655-line, tested `SkillsScreen` had been
  unreachable since `1e858a7f1`. That commit dropped four rows at once; the other
  three had founder-dated comments explaining the removal, Skills had none — so it
  was collateral damage, not a decision, and was restored.

### Destructive actions

All four benchmarked products confirm every destructive action. Ours were
inconsistent — a styled `AlertDialog` existed and was used correctly in some places
while the highest-frequency and highest-stakes deletes used native `window.confirm()`.
Now routed through the shared `useConfirm()` primitive (which itself had **zero call
sites** before this): delete conversation, delete project, delete message, archive
all chats, **permanently delete every chat**, delete archived chats, and plugin
removal. One genuine bug surfaced en route: `WebAppShell.handleProjectDelete` had _no
confirmation at all_ — one stray click deleted a project from `/chat/projects`.

### Deep Research

The `provider !== 'anthropic'` exclusion in `route.ts` was removed after finding its
premise was **stale**: the comment claimed the loop consumed raw provider SSE, but
`runResearchLoop` dispatches solely through `buildToolLoopStream`, which already
normalizes every provider. Anthropic — the default — lit the same badge but silently
ran a single-turn fallback: real citations, no plan card, no narration, no persisted
report. Also added a **Reports gallery** on the already-existing, already-RLS-scoped
`/api/research/reports` endpoint that had no UI caller, and citation favicons.

Verified live on Gemini 3.1 Pro: a real Research plan list with per-step Done status,
a live elapsed timer, round counter, and a structured cited report.

### Legal, policy & marketing

- EU AI Act prohibited practices completed from **2 of 5 to 5 of 5**, and moved onto
  the canonical `/acceptable-use` page (it previously existed only on the mobile
  legal page).
- `medical` added to the automated-high-stakes-decision domain list.
- Sandbox retention now states the number the code actually enforces — "within 24
  hours" matching `SANDBOX_MAX_AGE_MS` — instead of the vague "reclaimed once
  unreachable".
- Pricing gained a training-data-use row (unconditional "No") and a **per-model
  tier-access matrix derived from `tierAllowedModels`** in the canonical registry,
  not hand-typed.
- The enterprise page stopped calling shipped, gated capabilities "roadmap" — each
  row was re-verified against real code, and genuinely-unbuilt rows were left alone.

### Composer & media

- **Data-loss bug fixed**: attachments staged before switching to image/video mode
  were silently dropped on send.
- Composer placeholder now reacts to the Chat ↔ AGI Work axis.
- Generation placeholders are pre-sized to the requested aspect ratio. The agent
  found and fixed a second-order bug its own change would have introduced: final
  media is height-capped independent of ratio, so a naive full-ratio portrait
  placeholder would have overshot and then collapsed — a worse jump than before.
  Verified by measuring DOM boxes before and after real generations.

### Other

- Model **retirement warnings**: `deprecation_date` was wired only to silently drop a
  model from the picker once the date passed. It now surfaces an advance warning,
  read from the catalog.
- **Conversation titles** are LLM-generated (two-stage, fire-and-forget, sanitized,
  guarded so a user rename is never clobbered) instead of permanently truncated.
  `renameConversation()` got its first caller — and had a latent 405 bug (PATCH to a
  route exposing only GET/PUT/DELETE) that zero callers had ever exposed.
- Code-block copy is always visible instead of hover-gated (unreachable on touch).
- Raw-JSON MCP config import, Zod-validated, feeding the existing inspect→add
  pipeline so it inherits the real server-side security boundary.
- Credit-history ledger surfaced from the real `credit_transactions` table.
- Voice settings page given a nav entry.
- `toolAccessMode` **deleted** — defined with zero readers and zero writers. Shipping
  a control for a value nothing consumes would have been a decorative toggle; this
  codebase deletes those rather than dressing them up.

---

## Corrections made during this work

- **I called the Deep Research change a regression. It was not.** I observed 4
  searches gathering 0 sources and an empty report on Claude Sonnet 5, and attributed
  it to the route change. The dev log shows the cause: the Anthropic API key has
  **zero credit balance** and was 400ing every call. The pre-fix comparison run
  succeeded ~90 minutes earlier, before credits ran out, so the two observations were
  not comparable. Re-verified on Gemini: the loop works correctly.
- **I misread the nav rail twice.** First a bounding-box heuristic picked the
  chat-history column and I concluded the rail was missing; then a className
  substring check reported all 8 items active because it matched `hover:bg-...`.
  Both corrected by matching exact class tokens.
- **An agent filed `/gallery` as a strength** citing a dead shell as its nav entry.
  Withdrawn and refiled as the P1 that drove the biggest fix in this batch.

## Known-remaining

- `agentic-modes-gap-06` residual: a pre-existing `AUTO_TITLE_PLACEHOLDERS` effect in
  `WebChatPage.tsx` races the generated title and re-truncates. Mitigated server-side
  by treating that effect's exact output as safe-to-replace; the durable fix belongs
  in that effect and is recorded as a follow-up.
- `shell-nav-ia-gap-03` second half (should the Chat/AGI-Work axis be visible to
  free/basic tiers?) was **declined as a product decision, not a defect** — hiding it
  is a deliberate prior audit fix (`AUDIT-FIX CMP-14`) preventing a control that
  hard-fails with `agi_work_plan_required`.
- `sched-gap-14` (template icon differentiation) is blocked on `sched-gap-01`, the
  web schedule-templates surface, which does not exist yet and is a new build.
- Pre-existing and **not** caused by this work: one failing test,
  `use-settings-queries-renderhook.test.tsx > useOrganizationSettings` — confirmed
  failing at clean `HEAD` by stashing all session changes and re-running.
- Opening an HTML artifact logs one CSP console error from `about:srcdoc`; present on
  `/gallery` before this work too.
