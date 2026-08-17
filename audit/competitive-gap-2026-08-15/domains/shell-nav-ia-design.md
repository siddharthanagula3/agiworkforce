# Shell, Global Nav, IA & Design System

### 2026-08-15

Benchmarked against live-observed ChatGPT, Claude, Gemini, and Manus behavior (28 claims,
`shell-01`..`shell-28`). Cross-referenced against the same-day prior audit at
`audit/parity-2026-08-15/` (168 filed gaps, esp. `gaps/domain-shell-nav-ia.json`,
`gaps/domain-composer.json`, `gaps/domain-agentic-work.json`).

Repo state: branch `compliance/dpdp`, commit `e15df56e3`, tree clean (per gitStatus).

---

## Method note

The prior same-day audit already covers this exact domain (`domain-shell-nav-ia.md/json`,
7 filed gaps SHELL-NAV-IA-001..007) plus adjacent domains that materially overlap this
benchmark's claims (`domain-composer.json` — 8 gaps on composer fragmentation;
`domain-agentic-work.json` — the AGI Work mode-toggle architecture; `domain-design-system.json`).
Rather than re-deriving that ground, this pass verified each of the 28 new claims directly
against source, cited the prior gap where one already exists, and only wrote up NEW
observations this benchmark's extra evidence (Gemini, Manus, and specific interaction
mechanics like placeholder-copy-on-mode-switch) surfaced that the prior pass did not check.

---

## Claim-by-claim findings

### shell-01 — Persistent chat-vs-agentic-mode switch — **PARTIAL, CONFIRMS_PRIOR**

We have exactly one of Claude's two axes, and it is not fully wired to the effects the
benchmark requires.

- **What exists**: a composer-embedded "Chat | AGI Work" segmented toggle
  (`apps/web/features/chat/components/Composer/ChatComposerNew.tsx:2895-2921`, mirrored in
  the overflow menu at `:2377-2409` for narrow widths), explicitly commented as "claude.ai
  Chat/Cowork parity." Selecting `agiwork` reveals a project/folder picker and structured
  goal fields (`:3330`, `:3464`) and threads `workMode` through send metadata to the server.
  This is real, not cosmetic — it changes billing eligibility checks and what the send
  payload carries.
- **What's missing vs. the benchmark's specific "changes placeholder / sidebar / actions"
  bar**: the textarea's placeholder text is a static prop (`placeholder={t('chat:placeholder')}`)
  that does not vary with `workMode` — confirmed at `ChatComposerNew.tsx:2258-2266`, whose
  only placeholder branches are `isTurnActive` / `imageMode` / `videoMode`, never `workMode`.
  Claude's own composer axis is explicitly cited as shifting placeholder copy
  ("Write a message..." → "Describe a task or ask a question"); ours does not.
- **What's missing vs. the "persistent, always-visible... in the global chrome" half of the
  claim** (ChatGPT's top-bar Chat/Work pill, Gemini's sidebar-content-swapping Chat/Spark
  pill): we have no such control. "Code" is a flat, always-present sidebar nav item
  (`WebAppShell.tsx:251-256`) that performs a plain route navigation to `/chat/code` — the
  howToVerify note explicitly warns this doesn't count ("not just a route swap re-rendering
  the same chat component with a different title"), and it is literally that: `CloudCodePage`
  is a separate feature, not a sidebar-content-swap of the same shell.
- **Gating**: `canUseAgiWork` requires `billingPolicyReady && !isFreeTrial && canUse...('agi_work')`
  (`ChatComposerNew.tsx:455-456`) — free/basic-tier users never see this second axis at all,
  unlike all three benchmarked products' mode switches, which are visible regardless of plan.
- **Prior art**: `audit/parity-2026-08-15/gaps/domain-agentic-work.json` id `AGENTIC-WORK-006`
  (re-confirms prior finding `P2-001`) already documents "AGI Work exists as a mode toggle on
  the ordinary chat composer... no independent, deep-linkable workspace object" — the same
  underlying architecture fact, filed from the agentic-work-completeness angle. This finding
  adds the shell-specific angle prior audit did not check: placeholder-copy non-reactivity and
  the free/basic-tier invisibility of the one axis we do have.

### shell-02 — Overflow "More" flyout — **DIFFERENT_BY_DESIGN, not a gap**

Our persistent sidebar list has 7 items (Chat, Code, Projects, Library, Tasks, Schedules,
Customize — `WebAppShell.tsx:242-297`), right at the top of the benchmark's own "~6-7" comfort
line, with no overcrowding and no secondary vertical products (image gen, health, finance
equivalents) competing for rail space. The prior audit's own analytical §26 independently
reached the same conclusion ("nav lists are short enough... hide/show customization solves a
problem Claude has... that this repo doesn't yet have"). Per the claim's own howToVerify text
("note this as a navigable IA choice, not a defect, unless the rail is visibly overcrowded"),
no gap filed.

### shell-03 — Scheduled + Library nav items — **PRESENT, strength**

Both exist as permanently-visible, one-click sidebar destinations: `Schedules`
(`WebAppShell.tsx:284-289`, also present in `WebChatPage`'s own sidebar wiring) and `Library`
(`:270-276`). Matches all four benchmarked products' structural pattern.

### shell-04 — Shared blue status dot (task list + chat history) — **MISSING**

Genuinely absent, and verifiable at the data-contract level, not just the rendering level.

- `packages/ui/ui/src/sidebar/types.ts:16-34` — the `SidebarSession` interface (the type every
  chat-history row is built from) has no `status`, `isStreaming`, `isRunning`, or equivalent
  field at all. `SessionItem.tsx` (298 lines, the row renderer) has zero status/badge/dot logic —
  confirmed by grep, zero hits for "status" anywhere in the file.
- The Tasks surface itself (`packages/ui/unified-chat/src/components/tasks/TasksPage.tsx:440-462`)
  does show a real status indicator — but it's a text pill (`taskStateLabel(run.state)` inside
  a colored border-badge, not a plain dot) and it exists ONLY on the separate `/tasks` list.
  There is no code path connecting a running task's status back to that same conversation's row
  in the ordinary chat-history sidebar list a user is far more likely to have open.
- This means a user with an AGI Work task running has zero way to notice from the sidebar they
  normally look at; they must remember to separately check `/tasks`.
- Not found in prior audit (grepped all `gaps/*.json` for "status dot" / "blue dot" / "in-progress
  indicator" — no hits). Genuinely new for this pass.

### shell-05 — Single reusable composer, contextually relabeled — **PARTIAL, CONFIRMS_PRIOR + new evidence**

- Within the main chat surface itself, `ChatComposerNew.tsx` (3,600+ lines) is genuinely reused
  across many in-conversation contexts (home, mid-conversation, image mode, video mode, AGI Work
  mode) via internal branches — that part matches the benchmark pattern reasonably well.
- But the benchmark explicitly includes a scheduled-task creation screen as one of ChatGPT's
  7+ confirmed reused-composer contexts. Ours diverges here: `/chat/schedules`'s creation UI
  (`apps/web/features/schedules/components/ScheduleForm.tsx`) is a conventional multi-field
  settings FORM — labeled text inputs, a model `<select>`, numeric interval fields, a raw cron
  string field (`placeholder="0 9 * * 1-5…"`) — not the rounded chat-style composer at all.
  A user moving from "ask a question" to "schedule a recurring task" sees a completely different
  visual paradigm, not the same input relabeled.
- Prior audit's `domain-composer.json` id `COMPOSER-001` (P1) already documents the broader,
  more severe version of this: four independent composer codebases across web/desktop/mobile/
  extension with no shared component and measurable feature drift between them. This finding
  is `CONFIRMS_PRIOR` on that root cause, adding the narrower, within-web-surface angle
  (schedule creation isn't even attempting to look like the chat composer) that the prior pass's
  cross-surface framing didn't call out explicitly.

### shell-06 — Multiple distinct overlay types — **PRESENT, strength**

Real structural variety exists, not one generic modal reused everywhere:
`packages/ui/ui/src/primitives/{Dialog,AlertDialog,ConfirmDialog,PromptDialog,Sheet,Drawer,
AccessibleDialog}.tsx`, a dedicated `settings-modal/SettingsModal.tsx` (full-screen tabbed),
and a genuine persistent side panel (`ArtifactsPanel.tsx`, `WorkSessionPanel.tsx`) that behaves
differently from a dismissable dialog (stays open, has its own toolbar — see shell-08). Matches
the benchmark's structural bar.

### shell-07 — Two-step red-accented destructive confirmation — **PARTIAL / inconsistent, NEW finding**

This is the most consequential new finding in this domain pass — not present anywhere in the
prior 168-gap audit (grepped all `gaps/*.json` and `GapMatrix.md` for "window.confirm" — zero
hits).

The app has a properly-built destructive-confirm primitive
(`packages/ui/ui/src/primitives/{AlertDialog,ConfirmDialog}.tsx`, `variant: 'destructive'`
resolving to `bg-destructive text-destructive-foreground`) and uses it correctly in some flows:

- Schedule delete: `apps/web/features/schedules/components/SchedulesPage.tsx:535-568` — real
  `AlertDialog`, red `AlertDialogAction`, specific consequence copy ("Delete its run history.
  This action cannot be undone.").
- Project delete **from the Project Settings dialog**: `apps/web/features/projects/components/
ProjectSettingsDialog.tsx:326-334` — same pattern.

But the single most frequent destructive action in the product — deleting a conversation from
the sidebar's three-dot menu — and several other real destructive actions instead call the
native, unstyled browser `window.confirm()`, which cannot be red-accented, cannot carry the
app's design system, and reads as a generic OS dialog:

- `apps/web/features/chat/pages/WebChatPage.tsx:2955-2960` — delete conversation (primary shell)
- `apps/web/shared/components/layout/WebAppShell.tsx:175-179` — delete conversation (secondary shell)
- `apps/web/features/chat/pages/WebChatPage.tsx:3076-3081` — delete project **from the sidebar's
  own three-dot menu** (the SAME action that's properly styled when triggered from inside
  Project Settings two clicks away — same destructive action, two different UX depending on
  entry point)
- `apps/web/features/chat/components/messages/MessageBubble.tsx:2029` — delete message
- `apps/web/features/settings/sections/PrivacySection.tsx:255-258` — "Permanently delete every
  chat, including archived chats" (the single highest-stakes destructive action in the app)
- `apps/web/features/settings/sections/PrivacySection.tsx:221` — archive every chat
- `apps/web/features/schedules/components/SchedulesPage.tsx:189` — discard unsaved schedule changes

Net: a real confirmation step exists everywhere (no single-click destructive action was found,
matching the benchmark's core safety requirement), but roughly half the destructive-action
surface — and specifically the highest-frequency one (delete conversation) and highest-stakes
one (delete all chats) — uses a jarring, unbranded native dialog while the styled component sits
unused for exactly those flows. This is a "built, not fully wired" pattern: the destructive-variant
primitive exists and is proven correct elsewhere in the same codebase.

### shell-08 — Persistent artifact panel with Preview/Code toggle — **PRESENT, strength**

`apps/web/features/chat/components/artifacts/ArtifactsPanel.tsx` + `ArtifactPreview.tsx` is a
genuine, non-trivial implementation: a real side panel (`PanelRightOpen` open/close state via
`useArtifactsStore().togglePanel`), an actual `activeTab: 'preview' | 'code'` state
(`ArtifactPreview.tsx:202`) with visible tab buttons (`:1130-1152`), plus versioning, sharing,
and download — the file's own header comment explicitly frames it as "Claude Artifacts-like Live
Preview." This is a genuine parity feature, not a stub.

### shell-09 — Named serif typeface for chat text — **differentiator, not a defect**

Default chat text uses sans-serif (`--chat-font-sans: 'Inter'...`,
`packages/ui/design-tokens/src/chat.css:7`; `--font-chat: system-ui...`,
`apps/web/app/globals.css:1852`). A serif token (`--chat-font-serif: 'IBM Plex Serif'...`,
`chat.css:8`) exists in the design-token file but is not the default for message text — it
appears to back an alternate/accessibility mode rather than a branded first-party choice the
way Claude's named "Anthropic Serif" is. Recorded per the claim's own instruction ("a
differentiator, not a defect either way"); no gap filed.

### shell-10 / shell-11 / shell-12 / shell-13 — Code-block chrome & table styling — **hybrid, no gaps filed**

Verified directly in `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:24-70,
196-204` (the single shared markdown renderer web's `MessageBubble.tsx:1431-1440` explicitly
routes all code blocks through, confirmed by its own "rendered exactly once by <MarkdownContent>"
comment):

- Code blocks: a **persistent** `.code-block-header-bar` with an always-visible language label
  (`:44-47`) — matching ChatGPT's persistent-chrome pattern — but the copy button itself is
  `opacity-0 ... group-hover:opacity-100` (`:52`) — matching Claude's hover-only pattern. This is
  a genuine hybrid of the two single-product patterns, not a clean match to either. No Run
  button for Python (ChatGPT-only) and no download icon (Gemini-only) — both are single-product
  differentiators per the claim, not gaps.
- Tables: `th`/`td` both carry `border border-border` with `font-semibold` headers (`:201-204`)
  — ChatGPT's fully-boxed style, not Claude/Gemini's minimal single-underline style. The wrapper
  div is `overflow-x-auto` (`:197`), so a wide table scrolls its own container rather than
  breaking page layout — the one thing the claim flags as an actual bug risk (no truncate control
  AND no horizontal-scroll container) does not apply here. No truncate/expand control for very
  tall tables (Gemini-only) — single-product differentiator, not a gap.

All four of these are explicitly single-product / design-personality claims per their own
`tableStakes: false` and howToVerify text ("either is valid," "a differentiator, not a defect").
Documented, not filed as gaps.

### shell-14 — Content-aware progress copy — **PRESENT, strength**

`apps/web/features/chat/components/messages/ToolTimeline.tsx:774-845` builds a real,
content-specific status phrase — `Running: {statusPhrase ?? humanizeToolName(...)}` with a named
label map (`git_status: 'Git status'`, etc., `:181`) and falls back to `'Working...'` only when no
specific phrase is available, not as the default. Combined with `ThinkingBlock.tsx:195`'s
"Thought for Xs" duration disclosure (matching Claude's exact pattern named in the claim), this
meets the competitive bar.

### shell-15 — Composer model + reasoning-effort picker — **PRESENT, strength**

`packages/ui/unified-chat/src/components/ModelSelector.tsx` bundles a real `ThinkingToggle`
(`:271-297`) with effort levels (`Effort` type, `defaultEffortFor`, `:448-450`) directly inside
the same picker as model selection — matching Gemini's "one dropdown combining model list +
independent thinking toggle" shape, reachable in one click from the composer.

### shell-16 — Persistent account chip with plan tier — **PRESENT, strength**

`apps/web/features/chat/pages/WebChatPage.tsx:3841-3875` — the sidebar footer renders avatar
initials, display name, and tier label with no click required (`resolveChatAccountDisplay`
supplies `userInitial`/`displayName`/`tierLabel`/`showFreeUpgrade` directly into the footer JSX).
Matches all three benchmarked products' persistent-chip pattern. (Prior audit's
`SHELL-NAV-IA-006`, P3, separately notes the secondary `WebAppShell` shell's footer omits the
free-plan upgrade nudge banner that this primary shell shows — a real but minor cross-shell
consistency gap, already tracked; not re-filed here.)

### shell-17 — Two-stage async chat-title generation — **MISSING, single-stage only**

`apps/web/features/chat/pages/WebChatPage.tsx:3132-3145` — the "Auto-title" effect fires once,
when the second message (first assistant reply) arrives, and sets the title to
`firstUser.content.trim().slice(0, 60)` — the raw truncated prompt, permanently. There is no
LLM-generated cleanup pass that later replaces this with a shorter, cleaner title the way
ChatGPT does (confirmed: no title-generation API route exists — grepped `apps/web/app/api` for
any title-related endpoint, none found; `apps/web/app/api/chat/conversations/route.ts` only
persists whatever `body.title` a caller already supplies, it never derives one). This is exactly
the "only the raw prompt permanently" alternative the claim's howToVerify text names as the
non-matching case. Single-product (ChatGPT), not table-stakes — low severity, but a clean,
concrete miss worth a small ticket.

### shell-18 — Real vs. suggested-template split on schedule/automation list — **MISSING (no templates exist at all)**

Narrower than a "split" problem: `apps/web/features/schedules/components/SchedulesPage.tsx:432-443`
shows only real user schedules or, when empty, a single "Create Your First Schedule" CTA — there
is no suggested/template starter list anywhere in the file (grepped for "Suggested"/"template" —
zero hits beyond the empty-state CTA). Because the feature this claim assumes (a template gallery
to visually separate from real items) doesn't exist at all, the separation question is moot; the
underlying gap is one level more basic than the claim describes. All three relevant benchmarked
products (ChatGPT, Claude, Gemini) show this as `tableStakes: true`; see also shell-20 below —
this is the same underlying "we deliberately ship a bare empty state with no suggested-starter
content" product decision showing up on a second surface.

### shell-19 — Dedicated pinnable Projects sidebar section — **PRESENT, strength**

`packages/ui/ui/src/sidebar/Sidebar.tsx:807-808` (New-project action) plus the dedicated
`ProjectsView.tsx` and pinned/unpinned split the prior audit already verified in depth
(`domain-shell-nav-ia.md` §2, §Strengths: "Sidebar pinning + temporal grouping... on par with
ChatGPT macOS's Pinned/Projects/Recents sidebar"). Confirmed independently at the cited lines.

### shell-20 — Suggested-prompt chips below empty-state composer — **MISSING, deliberate founder decision**

Not present, and explicitly, recently removed on purpose — this is the single clearest,
best-evidenced finding in this pass. `apps/web/features/chat/components/GreetingBanner/
GreetingBanner.tsx:11-13`:

> "The six quick-start suggestion chips were removed here and on mobile and desktop (founder
> 2026-08-06): the empty state is the mark and the greeting, nothing else."

This directly contradicts an `ALL_PRODUCTS` / `tableStakes: true` convergence claim: ChatGPT,
Claude, Gemini, and Manus all show 3-5 clickable starter chips/cards on their empty-state
composer; ours shows a brand mark and a time-aware greeting only, across all three first-party
surfaces (web, mobile, desktop — the comment names all three as intentionally scoped together).
This is not an oversight or half-built feature; it's a dated, attributed product decision. Flagged
here at the severity the unanimous 4/4 convergence implies, with the explicit caveat that reversing
it is a product call, not an engineering fix.

### shell-21 — "New chat" as most prominent sidebar action — **PRESENT, strength**

Verified at `packages/ui/ui/src/sidebar/Sidebar.tsx:539-543` (collapsed rail) and the equivalent
expanded-state compose button; prior audit's click-count table independently confirms 1-click
"Start a new conversation" on web/desktop and 1-tap on mobile.

### shell-22 — Dedicated sidebar search entry point — **PRESENT, strength**

`Sidebar.tsx:544-548` (collapsed rail Search icon) and `:629-633` (expanded-state Search row),
both wired to `handleOpenSearch`. Matches ChatGPT/Gemini's pattern; exceeds Claude's own
(per the claim, Claude only shows a sort/filter icon, not a labeled search entry).

### shell-23 — Collapsible icon-only rail with tooltips, fast toggle — **PRESENT, minor timing note**

`Sidebar.tsx:529-573` — collapses to a real icon-only rail (`RailButton` components with
`label`/`title` tooltips), not a fully-hidden sidebar. One minor divergence: the container's
`transition-all duration-300` (`:532`, `:595`) is 300ms, double the benchmark's "no perceptible
delay over 150ms" bar. Not filed as a gap — 300ms is a smooth, standard transition, not a
janky one; noted for completeness only.

### shell-24 / shell-25 — Marketing nav interaction consistency — **PARTIAL, replicates ChatGPT's flagged anti-pattern**

`apps/web/shared/components/layout/Header.tsx:58-72, 185-220` — the marketing nav bar mixes
interaction models within itself: `Products` (line 186-214) is an in-place dropdown panel, while
`Pricing` / `Business` / `Docs` (`NAV_ITEMS`, line 68-72) are plain hard-navigating `<Link>`s
rendered in the same nav row. This is the same split-interaction-model pattern the claim
identifies as ChatGPT's own, self-flagged inconsistency (shell-24) rather than Claude's cleaner
all-consistent baseline (shell-25, explicitly named as "the more polished baseline to aim for").
Low-severity polish item; single-product-sourced comparison.

### shell-26 — Marketing nav responsive breakpoint above mobile width, CTAs stay visible — **PARTIAL**

`apps/web/app/globals.css:2246-2254` — `@media (max-width: 900px)` correctly collapses the
desktop nav to a hamburger above the typical 768px mobile cutoff (matching the spirit of Claude's
~1299px behavior, though narrower). But the same media query hides `.agi-top-actions-desktop`
(the Sign-in / "Open AGI" CTA) together with the nav links — Claude's benchmark behavior
specifically keeps "Contact sales" / "Try Claude" visible OUTSIDE the collapsed hamburger; ours
hides the primary conversion CTA behind it too. A visitor at ~900px sees no visible
call-to-action until they open the mobile menu.

### shell-27 — Persistent per-response fork/branch icon — **PARTIAL, gated behind a menu**

`apps/web/features/chat/components/messages/MessageBubble.tsx:1977-1982` — "Branch conversation"
(our fork/continue-in-new-thread equivalent, `GitFork` icon) exists and is functionally real
(wired through `onBranch`/`createBranch` in `WebChatPage.tsx`), but it lives inside the "More
actions" (⋯) `DropdownMenu`, not as a persistent always-visible icon directly under the response
the way Manus's benchmark behavior requires ("not gated behind a menu"). Additionally, the entire
action row (copy/regenerate/more, `:1742`, `:1761`) is itself `opacity-0 group-hover:opacity-100`
— hover-only, one further step removed from "persistent" than the benchmark's Manus behavior.
Single-product-sourced, low severity.

### shell-28 — "Promote to recurring schedule" action in per-task options menu — **MISSING**

Grepped the whole repo for any direct "turn this conversation into a schedule" action
("Schedule a task", "Turn into schedule", "promoteToSchedule", etc.) — zero hits.
`SessionItem.tsx`'s own header comment names its complete menu surface — "pin/star/rename/share/
archive/move-to-project/delete" — with no scheduling entry. The only path to create a recurring
schedule is the from-scratch multi-field form at `/chat/schedules` (see shell-05); there is no
shortcut from an existing conversation's options menu the way Manus's benchmark behavior
provides. Single-product-sourced, low severity, but a small, well-scoped and inexpensive
addition given the schedule-creation infrastructure already exists.

---

## Strengths (at or ahead of the four-product benchmark)

1. **Real content-aware agentic progress copy** (shell-14) —
   `ToolTimeline.tsx:774-845`, named tool labels + duration disclosure, not a bare spinner.
2. **Genuine persistent artifact panel with a real Preview/Code toggle** (shell-08) —
   `ArtifactsPanel.tsx` + `ArtifactPreview.tsx:202,1130-1152` — comparable depth to Claude's
   own signature feature, plus versioning/sharing/download Claude's basic version doesn't
   describe.
3. **Composer-level model + reasoning-effort picker in one control** (shell-15) —
   `ModelSelector.tsx:271-297,448-450` — matches Gemini's combined-dropdown shape.
4. **Persistent account chip with plan tier, zero clicks** (shell-16) —
   `WebChatPage.tsx:3841-3875`.
5. **Structural overlay variety** (shell-06) — seven distinct primitives
   (`Dialog/AlertDialog/ConfirmDialog/PromptDialog/Sheet/Drawer/AccessibleDialog`) plus a real
   persistent side panel, not one modal reused everywhere.
6. **Dedicated Projects section, New-chat prominence, and sidebar search** (shell-19, 21, 22) —
   already verified in depth by the prior same-day audit and independently re-confirmed here.
7. **Wide-table overflow handled safely** — `MarkdownContent.tsx:197`'s `overflow-x-auto`
   wrapper means the one real bug risk the claim set calls out (no truncate control AND no
   scroll container) does not apply, even though the Gemini-style truncate affordance itself
   is absent.

## Gaps NOT worth copying from the benchmark

- **ChatGPT's split marketing-nav interaction model (shell-24)** — this repo currently
  replicates it (`Header.tsx`), but the claim's own source material frames it as ChatGPT's own
  undocumented inconsistency, not a pattern to aspire to. The fix is to move toward shell-25's
  consistency (all-dropdown or all-hard-nav), not to leave the mix as-is.
- **A generic top-level Chat/Work segmented control purely to copy ChatGPT** — the prior
  same-day audit's own "what NOT to copy" section already makes this case well (ChatGPT's
  rebuilt macOS app reportedly shipped a "Chat mode went missing entirely on desktop"
  regression from exactly this pattern) — not repeated in depth here, but shell-01's fix should
  aim at wiring what we already chose (a composer-embedded axis, Claude's shape) correctly
  rather than bolting on a second, ChatGPT-shaped global-chrome axis on top.
- **Chasing every single-product code-block/table micro-affordance** (ChatGPT's Run button,
  Gemini's download icon + table truncate) — each is real but single-product and low-value in
  isolation; the current hybrid (persistent lang label + hover copy, boxed tables with safe
  overflow) is a reasonable, deliberate-enough middle ground, not obviously worse than any one
  competitor's choice.

## Evidence quality notes

- shell-04, shell-07, shell-17, shell-18, shell-20 are verified directly at the source with
  file:line citations and, where relevant, confirmed by direct code comments (not inferred from
  screenshots or behavior guesses).
- shell-09 (serif token existence but non-default use) was verified by reading the CSS token
  files directly; I did not additionally verify at runtime whether any settings surface exposes
  a serif/accessibility-mode toggle that activates `--chat-font-serif` — flagging this as an
  open question rather than asserting the token is fully dead.
- shell-23's 300ms-vs-150ms transition-timing comparison is a static CSS read, not a measured
  runtime frame-timing result — treat the "meets/misses 150ms" framing as directional, not a
  precise benchmark.
- I did not independently re-verify desktop/mobile/extension behavior for any of these 28 claims
  (the claim set and this pass are scoped to `apps/web`); several already-filed prior gaps
  (`SHELL-NAV-IA-002` through `-005`) cover cross-surface divergence that may also be relevant to
  a subset of these claims on non-web surfaces, but re-deriving that was out of scope for this
  pass per the "don't redo the prior audit" instruction.
