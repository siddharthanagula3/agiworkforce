# Frontend Gap Audit

Commit `e15df56e3`, `compliance/dpdp`, working tree clean. Audit date
2026-08-15. This document synthesizes six domain passes
(`gaps/domain-shell-nav-ia.md`, `domain-composer.md`, `domain-rendering.md`,
`domain-design-system.md`, `domain-settings.md`, `domain-artifacts.md`) plus
the `inventory/web-frontend.md` and `inventory/mobile.md` source-level
inventories. It does not re-run the audit — every claim below carries the
`path/file.ts:line` citation, benchmark reference, or explicit
UNVERIFIED/NEEDS VALIDATION label it inherited from those passes. Full
per-gap evidence lives in the six `domain-*.json` files; this document does
not restate it and links back to gap IDs instead.

**Scope of this document: 59 of the audit's 168 total gaps** — every gap
filed under Shell/Nav/IA (7), Composer (8), Message rendering & response
actions (12), Design system & accessibility (12), Settings (12), and
Artifacts & creation workspaces (8). **Zero of the 59 are P0.** 16 are P1,
31 are P2, 12 are P3. Backend/runtime, models, memory, agentic-work, voice,
and the remaining nine domains are out of scope here — see `GapMatrix.md`.

| Domain                               |   Gaps |     P1 |     P2 |     P3 | File                           |
| ------------------------------------ | -----: | -----: | -----: | -----: | ------------------------------ |
| Shell, nav & IA                      |      7 |      3 |      2 |      2 | `gaps/domain-shell-nav-ia.md`  |
| Composer                             |      8 |      3 |      3 |      2 | `gaps/domain-composer.md`      |
| Message rendering & response actions |     12 |      5 |      5 |      2 | `gaps/domain-rendering.md`     |
| Design system & accessibility        |     12 |      3 |      8 |      1 | `gaps/domain-design-system.md` |
| Settings                             |     12 |      1 |      9 |      2 | `gaps/domain-settings.md`      |
| Artifacts & creation workspaces      |      8 |      1 |      4 |      3 | `gaps/domain-artifacts.md`     |
| **Total**                            | **59** | **16** | **31** | **12** |                                |

**Corrections carried forward from the audit's own record** (per
`prior-art-reconciliation.md` and the domain passes): the "3 sign-in / 3
sign-up routes" finding from the initial route sweep is **retracted** —
source-level reading shows two canonical Clerk screens plus documented
`redirect()` aliases with named external callers, not unresolved
duplication (§1.1). A second retraction not specific to this document but
binding on it per the audit's standards: `agiworkforce.com` is confirmed
live; no claim in this document should be read as suggesting otherwise.

---

## 1. Application shell & navigation

Source: `gaps/domain-shell-nav-ia.md`, `inventory/web-frontend.md` §2.

### 1.1 The three "known leads" — resolved

| Lead                                                                                               | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Evidence                                                      |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| "3 sign-in + 3 sign-up routes, none canonical"                                                     | **Retracted — not a bug.** Two live Clerk screens (`/login`, `/signup`); every other URL (`/sign-in`, `/sign-up`, `/register`, `/auth/login`, `/device-auth`) is a documented `redirect()` alias with an inline comment naming its caller (desktop's cloud-auth handoff, Clerk's own routing convention, or old bookmarks). The sweep's "none redirects to a canonical implementation" claim is a `curl -L`-following artifact: `redirect()` issues a 307 that a following sweep silently absorbs and reports as 200 on the final URL. | `apps/web/app/sign-in/page.tsx:12-25`, `web-frontend.md` §1.1 |
| "`/tasks` renders the authenticated shell to signed-out visitors while `/chat/schedules` is gated" | **Confirmed, real bug — SHELL-NAV-IA-001 (P1).** `isProtectedAppRoute` in `proxy.ts` matches `/chat(.*)`, `/library(.*)`, `/schedules(.*)`, `/settings(.*)`, `/billing(.*)`, `/admin(.*)` — `/tasks` matches none of them, and `WebAppShell.tsx` has no auth logic of its own to fall back on.                                                                                                                                                                                                                                         | `apps/web/proxy.ts:145-152`                                   |
| "Desktop settings has adjacent tabs named 'Connections' AND 'Connectors'"                          | **Confirmed, already tracked (GAP-083) — SHELL-NAV-IA-002 (P2).** Two real, differently-wired tabs (mobile-companion pairing vs. MCP/OAuth integration catalog), three list positions apart, near-identical names.                                                                                                                                                                                                                                                                                                                     | `packages/ui/ui/src/settings-nav.ts:149-161`                  |

### 1.2 Nav structure by surface

| Surface              | Primary nav (file)                                                                            | Structure                                                                                                                                                                                                                                                 |
| -------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web                  | `WebAppShell.tsx:242-304` (secondary shell) + `WebChatPage.tsx` (primary, own sidebar wiring) | Chat, Code, Projects, Library, Tasks, Schedules, Customize — flat, 6-8 items                                                                                                                                                                              |
| Web sidebar          | `packages/ui/ui/src/sidebar/Sidebar.tsx:1-320`                                                | Pinned + temporal grouping (Today/Yesterday/This Week), pinned/unpinned Projects — on par with ChatGPT macOS                                                                                                                                              |
| Desktop (Managed)    | `apps/desktop/src/features/v3/Sidebar.tsx:154-160`                                            | Library, Tasks, Scheduled, Customize                                                                                                                                                                                                                      |
| Desktop (Local/BYOK) | `Sidebar.tsx:168-179`                                                                         | Artifacts, Code, Design, Research, Automation, Tasks, Scheduled, Customize — richer because these are Local-workspace-only capabilities, not features Web is denied (verified: Desktop's own Managed nav excludes the same five items; no broken-nav gap) |
| Desktop (Electron)   | `apps/desktop/electron/*`                                                                     | No native nav — thin Chromium wrapper around the hosted web app                                                                                                                                                                                           |
| Mobile               | `apps/mobile/src/features/drawer/components/DrawerContent.tsx:62-100`                         | Chats, Projects, Library, Schedules, Remote, conditional AGI Work — `expo-router/drawer`, no bottom tab bar (legacy `Tabs` explicitly hidden, kept only for route compatibility)                                                                          |
| Extension (Chrome)   | side panel                                                                                    | Chat-only composer + task-history dropdown; Settings deep-links to web, matching Claude in Chrome's own pattern                                                                                                                                           |
| Extension (VS Code)  | `apps/extension-vscode/package.json:526-540`                                                  | Standard activity-bar icon + webview sidebar                                                                                                                                                                                                              |
| CLI                  | `apps/cli/src/command_registry.rs`, `.../slash_commands.rs`                                   | Slash-command palette (`/plan`, `/model`, `/resume`, `/theme`, `/doctor`, `/status`, `/keybindings`) — **zero prior-art rows exist for CLI**; this round did a light pass only, lower confidence than every other surface                                 |

### 1.3 IA placement — what belongs where

- **Global nav (6-8 items, always visible):** Web and Desktop both keep the
  list short and never bury New Chat or Search — the opposite of ChatGPT
  macOS's internal-build pattern of 14+ flat items (Sites/Scheduled/Hooks/
  Connections/Git/Environments/Worktrees/Computer use/Appshots), which
  `cross-cutting-and-complaints.md` itself calls "approaching Microsoft and
  Facebook" settings complexity.
- **Sidebar:** conversation/project lists with pinned + temporal grouping —
  correct pattern, matches the competitive bar.
- **Composer (point-of-use):** mode toggles that change what a single turn
  does (Research, Agent/AGI Work, code execution, image/video gen, model +
  effort) are correctly kept in `ComposerFooter.tsx` rather than promoted to
  global nav — matching Claude's own stated design principle that a
  permission/approval control sits adjacent to the model picker, never
  buried in Settings. **Do not** imitate ChatGPT's separate Chat/Work
  navigation split, which shipped with an actual "Chat mode went missing
  entirely on desktop" regression (`cross-cutting-and-complaints.md` §6).
- **Settings:** correctly hosts durable cross-session preferences, and —
  worth calling out as a deliberate, defensible choice — the Skills/
  Connectors/Plugins directory lives one settings-click deep rather than as
  a bare sidebar item, unlike ChatGPT's top-level "Plugins." `/connectors`
  (`ConnectorsPage.tsx:65-1100`) is a full directory page with search,
  category filter, and connected/ready/request-access tri-state filtering —
  comparable depth to Claude's Directory modal.
- **Directory:** Skills/Connectors/Plugins each get a real, searchable page
  (`/skills`, `/connectors`, `/apps`) — real depth, not a stub. The only gap
  is cosmetic (SHELL-NAV-IA-007, no distinct `<title>`).
- **Progressive disclosure done well:** Local/BYOK-only nav richness
  correctly disappears in Managed Cloud rather than showing greyed/broken
  controls (`DesktopShellV3.tsx:853-878` gates on the exact same
  `privacyMode` value the nav-list function does). Mobile folding
  "Artifacts" into "Library" rather than shipping a second thumbnail-less
  grid (`DrawerContent.tsx:75-80`, dated 2026-08-13 founder-decision
  comment) is a self-aware consolidation, not a gap.

### 1.4 Click-count table

| Workflow               | Web                       | Desktop                             | Mobile                                                                                                                 |
| ---------------------- | ------------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Start new conversation | 1 click                   | 1 click                             | 1 tap                                                                                                                  |
| Global search          | 1 click (⌘K)              | 1 click                             | per-screen field, no single overlay                                                                                    |
| Reach Settings         | 1 click                   | 1 click                             | 1 tap                                                                                                                  |
| Reach Skills catalog   | 2 actions                 | 2 actions (label collision, §1.1)   | **0 — unreachable** (SHELL-NAV-IA-003 / GAP-001)                                                                       |
| Switch Personal ↔ Team | 1 click                   | **Not possible** (SHELL-NAV-IA-005) | **Not possible** (SHELL-NAV-IA-005)                                                                                    |
| Pair phone to Mac      | 1 click, then follow copy | —                                   | Copy names a destination ("Desktop Companion") that doesn't exist; real label is "Remote" (SHELL-NAV-IA-004 / GAP-210) |

### 1.5 Gaps

| ID               | Sev | Surface       | Gap                                                                                        | Prior art |
| ---------------- | --- | ------------- | ------------------------------------------------------------------------------------------ | --------- |
| SHELL-NAV-IA-001 | P1  | web           | `/tasks` renders the full authenticated shell to signed-out visitors                       | new       |
| SHELL-NAV-IA-002 | P2  | desktop-tauri | "Connections"/"Connectors" tab-name collision                                              | GAP-083   |
| SHELL-NAV-IA-003 | P1  | mobile        | Skills screen fully built, completely unreachable                                          | GAP-001   |
| SHELL-NAV-IA-004 | P1  | cross-surface | Desktop pairing copy names a nonexistent Mobile destination                                | GAP-210   |
| SHELL-NAV-IA-005 | P2  | cross-surface | Only Web has a Personal/Team switcher                                                      | new       |
| SHELL-NAV-IA-006 | P3  | web           | `WebAppShell` omits the free-plan upgrade nudge `WebChatPage` shows                        | new       |
| SHELL-NAV-IA-007 | P3  | web           | `/skills`, `/connectors`, `/apps`, `/device-auth`, `/user` have no page-specific `<title>` | new       |

### 1.6 Strengths

- Global search indexes sessions, messages, projects, **and** files in one
  query plus recent/popular/suggestion endpoints (`apps/web/app/api/search/route.ts`)
  — matches or exceeds ChatGPT's "Search chats, files, and projects."
- Sidebar pinning + temporal grouping (`Sidebar.tsx`) is on par with ChatGPT
  macOS's Pinned/Projects/Recents.
- The web workspace switcher (`WorkspaceMenuItems.tsx`) is a complete,
  live-selection Personal/Team picker — no captured competitor screenshot
  shows an equivalent in-place org switcher.
- Auth-alias hygiene is genuinely good, not the mess the raw HTTP sweep
  suggested (§1.1).
- Honest unavailability labeling: connector catalog shows `'Not yet
available on web'` rather than a Connect button that 501s
  (`WebSettingsModal.tsx:180-203`); mobile mirrors this for 19/21 providers.
- Desktop's `Sidebar.navParity.test.tsx` exists specifically because the
  team caught one nav-drift bug (collapsed rail missing Scheduled in Local
  mode) and wrote a regression test for the _class_ of bug, not the
  instance.

### What NOT to copy

Don't collapse Chat into a secondary mode behind Work/Codex the way
ChatGPT's rebuilt macOS app reportedly did — OpenAI President Greg Brockman
publicly called the app's navigation "kind of a mess" in July 2026 after
Work/Codex/GPT-5.6 were bolted onto the existing tab structure
(`research/chatgpt-mobile.md:37`, flagged there as forward-looking/
UNVERIFIED but the underlying critique is corroborated separately by
`cross-cutting-and-complaints.md` §8: "how can a product called ChatGPT
not default to chat mode?"). This repo's Chat nav item is always present.
Don't chase ChatGPT's flat 16-item settings list, and don't add a
sidebar-customize toggle purely to imitate Claude — this repo's nav lists
are short enough (6-8 items) that the problem doesn't exist yet here.

---

## 2. The composer, control by control

Source: `gaps/domain-composer.md`, `inventory/web-frontend.md` §3.2.

### 2.1 Summary

**Four independently-authored composer implementations exist with no shared
behavior layer beyond a slash-command registry.** Web's primary surface
renders a 3,621-line locally-owned `ChatComposerNew.tsx`. Desktop and web's
own secondary routes render a different, 1,422-line shared-package
`ChatInput.tsx` + ~470-line `AttachmentMenu.tsx`. Mobile is a from-scratch
1,249-line React Native implementation. The Chrome extension is 10,933
lines of vanilla DOM/TS whose own code comment admits it "mirrors" the
shared package by hand rather than importing it. This has already produced
measurable capability drift, not just an architecture smell: mobile has
large-paste-to-attachment and Library-reuse the other three lack; web's
primary composer has full image/video generation the shared package lacks
entirely; web's follow-up queue is single-slot where the architecture
supports more. None of this is P0 — every surface degrades to a working,
if less capable, composer.

### 2.2 Control-by-control matrix

✅ present & wired · ⚠ present but narrower/partial · ❌ absent · ° relies
partly on volume-of-hits heuristics, not independently re-verified
control-by-control.

| Control                               | Web (primary)                             | Shared pkg (Desktop)                                | Mobile                                      | Chrome ext                                                  |
| ------------------------------------- | ----------------------------------------- | --------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| Multiline input + auto-resize         | ✅                                        | ✅                                                  | ✅                                          | ✅                                                          |
| Rich/code paste                       | ✅                                        | ✅                                                  | ✅                                          | ✅                                                          |
| **Large-paste→attachment (≥10k ch.)** | **❌ COMPOSER-002**                       | **❌ COMPOSER-002**                                 | ✅ `LARGE_PASTE_THRESHOLD=10_000`           | **❌ COMPOSER-002**                                         |
| File/image attach                     | ✅ 10 files/12 MiB                        | ✅                                                  | ✅                                          | ⚠ image-only (GAP-122)                                      |
| Camera capture                        | ✅ `CameraCaptureDialog`                  | ✅ `AttachmentMenu`                                 | ✅ `AddToChatSheet`                         | ❌                                                          |
| Screenshot capture                    | ✅ desktop-cap-gated                      | ✅ `AttachmentMenu`                                 | n/a                                         | ✅ `chrome.runtime`                                         |
| Drag-and-drop                         | ✅                                        | ✅                                                  | n/a (touch)                                 | ✅°                                                         |
| **Attach from Library (reuse)**       | **❌ COMPOSER-003**                       | **❌ COMPOSER-003**                                 | ✅ `AddToChatSheet`                         | **❌ COMPOSER-003**                                         |
| Folder/project attach                 | ✅                                        | ✅ + "Add to project"                               | ⚠ project only                              | ❌                                                          |
| Audio-file attachment                 | ❌ (dictation only, all surfaces)         | ❌                                                  | ❌                                          | ❌                                                          |
| Dictation (speech→text)               | ✅                                        | ✅ `useVoiceInput`                                  | ✅ most mature (native STT, on-device)      | ✅                                                          |
| Voice mode (live conversation)        | ❌ honestly labeled (GAP-121, Done)       | ❌                                                  | ✅ (GAP-192: no text fallback while active) | ❌                                                          |
| Search toggle                         | ✅                                        | ✅                                                  | ✅                                          | ⚠° not confirmed as distinct                                |
| Research mode                         | ✅                                        | ✅                                                  | ✅                                          | ❌                                                          |
| Agent/Work mode                       | ✅ `workMode`                             | ✅ (GAP-064, Done)                                  | ✅ gated                                    | ⚠° present, not fully characterized                         |
| Code execution                        | ✅                                        | ✅ capability-gated                                 | ✅                                          | ❌                                                          |
| **Image generation mode**             | ✅ full                                   | **❌ COMPOSER-004** (`/image` prompt-template only) | ✅ full                                     | ❌                                                          |
| **Video generation mode**             | ✅ full                                   | **❌ COMPOSER-004**                                 | ✅ full                                     | ❌                                                          |
| Style selector                        | ✅                                        | ✅                                                  | ✅                                          | ❌                                                          |
| Skills                                | ✅ @-mention                              | ✅ + "Record a skill"                               | ✅                                          | ❌                                                          |
| Plugins                               | ✅ settings link-out                      | ❌                                                  | ❌ (GAP-190)                                | ❌                                                          |
| Connectors                            | ✅ settings link-out                      | ✅                                                  | ✅ (19/21 501, honest)                      | ⚠ deferred to web (GAP-122)                                 |
| @-mentions                            | ✅                                        | ✅°                                                 | ❌ (sheet menu, by design)                  | ❌                                                          |
| Slash commands                        | ✅ shared registry                        | ✅ same registry                                    | ⚠ own 4-command set                         | ⚠ own 6-command set, independently authored                 |
| Model selector                        | ✅ catalog-driven                         | ✅                                                  | ✅ (GAP-154: missing on Dispatch/Code)      | ✅                                                          |
| Reasoning/effort selector             | ✅ per-model chips                        | ✅ effort chips + thinking switch                   | ⚠ slider, not tappable list (GAP-142)       | ✅°                                                         |
| Send/Stop                             | ✅                                        | ✅                                                  | ✅                                          | ✅                                                          |
| Retry/Regenerate                      | ✅ message-level                          | ✅°                                                 | ✅ message-level                            | ✅°                                                         |
| **Queue message while streaming**     | ⚠ single-slot, cancel-only (COMPOSER-005) | ✅°                                                 | **❌ COMPOSER-006** (Send = Stop-only)      | ⚠ persisted, no user control (GAP-293)                      |
| Edit a queued message                 | ❌ (cancel-and-retype only)               | ❌°                                                 | n/a                                         | ❌ (GAP-293)                                                |
| Disabled/error/offline states         | ✅ `composerDisabled`/`trialExhausted`    | ✅                                                  | ✅ richest — offline retry queue w/ backoff | ✅                                                          |
| Configurable send shortcut            | ❌ hardcoded Enter (COMPOSER-008)         | ✅ persisted (GAP-086, Done)                        | ✅ standard, no override needed             | ⚠ tooltip claims Cmd+Enter, only Enter wired (COMPOSER-007) |

### 2.3 Gaps

| ID           | Sev | Surface             | Gap                                                             |
| ------------ | --- | ------------------- | --------------------------------------------------------------- |
| COMPOSER-001 | P1  | cross-surface       | Four independently-authored composers, no shared behavior layer |
| COMPOSER-002 | P1  | web + desktop + ext | Large-paste-to-attachment missing everywhere but mobile         |
| COMPOSER-003 | P2  | web + desktop + ext | "Attach from Library" missing everywhere but mobile             |
| COMPOSER-004 | P1  | desktop-tauri       | Shared-package composer has no image/video generation at all    |
| COMPOSER-005 | P2  | web                 | Follow-up queue single-slot, cancel-only                        |
| COMPOSER-006 | P2  | mobile              | No queue-and-flush; Send becomes Stop-only mid-stream           |
| COMPOSER-007 | P3  | extension-chrome    | Tooltip claims Cmd+Enter; only Enter wired                      |
| COMPOSER-008 | P3  | web                 | No user-facing send-shortcut preference (desktop has one)       |

### 2.4 Strengths

- Web's primary composer carries multiple in-place `AUDIT-FIX CMP-3/10/15/16/27`
  comments — a real prior "does this control do anything" pass whose fixes
  are still present, re-verified by this audit as not regressed.
- Trust-boundary-aware attachment preview: each thumbnail can carry a
  `PrivacyChip` showing the outbound destination (Local/BYOK/Managed) before
  send (`AttachmentPreview.tsx:90-99,124`) — a real differentiator neither
  competitor surfaced in research.
- The slash-command registry (`packages/ui/unified-chat/src/lib/slashCommands.ts`)
  is genuinely shared — the one piece of composer logic centralized, and
  proof the pattern COMPOSER-001 recommends is achievable.
- Reasoning-effort UI is per-model and catalog-driven, never a fixed global
  set (`ComposerFooter.tsx:74-129`) — avoids the exact anti-pattern ChatGPT
  exhibits (below).
- Mobile has the most complete large-paste and Library-reuse handling in the
  product and is the right implementation to port outward, not a laggard.
- Web already tests against its own anti-pattern: `ComposerFooter.overflow.test.tsx:24,80-82`
  asserts a persistent "Cmd+Enter to send" hint does NOT render, per a
  documented founder directive.

### What NOT to copy

1. ChatGPT renders "reasoning effort" as three different widgets across its
   own surfaces — a checkmarked dropdown (macOS), a pair of unrelated
   toggles ("Higher intelligence" + "Enable Ultra effort," web), and an
   unlabeled 5-stop slider (Chrome extension) — for one underlying lever
   (`shots-chatgpt-web-macos.md` §4.4). This repo's catalog-driven chips
   already avoid it; mobile's raw `Slider` (GAP-142) is the one surface
   still exposed to the same failure mode.
2. Don't bury a paid, working feature behind an "Experimental" flag with no
   discovery path, per Claude's file-creation upgrade
   (`cross-cutting-and-complaints.md` §7-8). Nothing in the composer does
   this today; keep it that way as new controls ship.
3. Don't ship a shortcut hint that disagrees with its own keydown handler —
   COMPOSER-007 is this exact failure mode, found in this repo. Shortcut
   labels are load-bearing UI copy, not decoration.
4. Don't let attach-menu depth substitute for capability: ChatGPT's Chrome
   attach menu lists six "Plugins" that are really prompt-routing shortcuts
   to the same chat turn, not distinct execution paths
   (`shots-chatgpt-web-macos.md` §3.4). This repo's honest "Coming soon" /
   disabled-with-reason gating is the better instinct.
5. Claude's branch editing is invisible in claude.ai — a documented,
   actively-requested gap (`claude-web-desktop.md:42`). This repo's web
   surface already has a visible `ConversationTitleMenu` "Duplicate as
   branch" action; don't regress this when porting message editing to other
   surfaces.

---

## 3. Message rendering, by response-part type

Source: `gaps/domain-rendering.md`, `inventory/web-frontend.md` §3.3.

### 3.1 Summary

Wide quality spread _within the same product_. Web's local
`MessageBubble.tsx` (2,254 lines) is a mature, carefully built renderer with
real streaming/empty/error states, a genuine branch/fork UI Claude itself
lacks, and rich response actions. It sits on top of **three independent
markdown engines** — web+desktop share a real `remark`/`rehype` pipeline;
mobile and the Chrome extension each hand-rolled their own regex parser —
and the "canonical shared" `packages/ui/unified-chat` package Desktop
actually renders through is measurably thinner than web's local
implementation in both response-part coverage and response actions. The
Chrome extension is the weakest surface in this entire domain: one working
response action (copy), zero citation UI, no table/image/math support.
None of this is P0 — every surface degrades to readable plain text — but
the desktop and extension gaps are verified regressions relative to what
this same codebase already built for web.

### 3.2 Response-part-type coverage

Confirmed, real state machines exist for specific part types — these are
the only places this audit round found an explicit, named state set, and
each is cited to its component:

| Response-part type       | Confirmed states                                                                                                                                                                                        | Where                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Tool call                | `pending / running / complete / error / awaiting_approval / cancelled` + a distinct **expired-approval** state that renders "no longer active, send a new message" instead of dead-looking live buttons | `ToolCallCard.tsx:23-183`                               |
| Deep research activity   | `planning / searching / synthesizing / complete / error / interrupted`, live elapsed clock, per-step plan list, real Retry on a failed/stopped run                                                      | `ResearchActivity.tsx`                                  |
| Code execution           | `executing / success / error`, stdout, stderr (visually distinct), inline plot images, non-zero exit code                                                                                               | `CodeExecutionBlock.tsx` (**web only** — RENDERING-006) |
| Image rendering          | loading (shimmer) / error (`ImageOff` fallback, not a broken-image glyph) / click-to-expand gated on navigable URL scheme                                                                               | `MarkdownContent.tsx:115-184`                           |
| Interactive/schema cards | unknown kind / newer schemaVersion / failed validation / deliberately-unrendered kind — all explicitly built _before_ any card producer existed                                                         | `InteractiveCardBlock.tsx:1-119`                        |

**Explicitly NOT assessed in this audit round, per the evidence-or-silence
standard** — no component-level state machine for these was located or
verified, and none is asserted here: **timeout**, **rate-limited**,
**permission-denied** (distinct from tool-approval), and a per-part-type
**empty-state** taxonomy beyond the citations/EmptyState findings in §5.
This is a gap in audit coverage, not a claim that these states are unhandled
— flagged as **NEEDS VALIDATION** for the next round rather than guessed at.

### 3.3 Three parallel markdown/rendering engines

| Surface(s)             | Engine                                                                                                                               | Evidence                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Web + Desktop (shared) | Real `react-markdown` + `remark-gfm`/`remark-math`/`remarkBreaks` + `rehype-raw`→`rehype-sanitize`→`rehype-katex`→`rehype-highlight` | `packages/ui/unified-chat/src/components/markdown/MarkdownContent.tsx:1-297`                                                                                                                                                          |
| Mobile                 | Hand-written, 642-line regex parser (`renderTextSegment`, `renderInlineMarkdown`)                                                    | `MessageContentRenderer.tsx`; RENDERING-003: no leading-whitespace tolerance for nested lists (silently loses indentation/bullets), table cells never run inline-markdown (literal `**bold**`/`` `code` `` shown as-is)               |
| Chrome extension       | A _third_, independently written, 179-line regex parser, smaller feature set than mobile's                                           | `markdown.ts:96-179`; RENDERING-002: no table handling, `img`/`src` explicitly in `FORBID_TAGS`/`FORBID_ATTR` so even trusted images are stripped, no math, code fences rendered via bare string replace with no highlighting library |

`grep -rn "MarkdownContent" apps/mobile apps/extension` returns zero hits —
a fix to the shared engine does not reach either surface.

### 3.4 Response actions by surface

| Action            | Web                          | Desktop (shared pkg)                                                  | Mobile                     | Chrome ext         |
| ----------------- | ---------------------------- | --------------------------------------------------------------------- | -------------------------- | ------------------ |
| Copy              | ✅                           | ✅                                                                    | ✅                         | ✅ (only action)   |
| Regenerate/Retry  | ✅                           | ✅ (wired)                                                            | ✅ message-level           | ❌ (RENDERING-005) |
| Thumbs feedback   | ✅ persisted                 | ❌ dead — `onFeedback` never passed anywhere (RENDERING-004)          | ✅                         | ❌                 |
| Edit user message | ✅                           | ❌ `editMessage` store action exists, zero UI callers (RENDERING-004) | ✅                         | ❌                 |
| Share             | ✅                           | ❌                                                                    | ✅                         | ❌                 |
| Read aloud        | ✅                           | ❌                                                                    | ✅ (toggles on-device TTS) | ❌                 |
| Branch/fork       | ✅ (RENDERING-009: web-only) | ❌                                                                    | ❌                         | ❌                 |
| Report/flag       | ✅                           | ❌                                                                    | ✅ (Play-Store-mandated)   | ❌                 |

Net result on Desktop: the per-message action row is Copy + conditional
Retry — every other action web has is either unwired or nonexistent on the
surface most competitor products treat as flagship (RENDERING-004). Net
result on the extension: Copy only, duplicated across two bubble-builder
code paths (RENDERING-005).

### 3.5 Progressive disclosure / card architecture

Two parallel, architecturally inconsistent mechanisms decide whether to
render a rich card (RENDERING-010, P2, web-only): a schema-versioned
backend-emitted registry (`InteractiveCardBlock.tsx:33-42`, cannot
false-positive by construction) and a regex heuristic that sniffs raw
markdown prose for structural signals (`detectCardType`,
`cards/index.tsx:26-77`, can misfire on ordinary prose — the component's
own comment concedes this). Only 2 of the declared `InteractiveCard` kinds
(`clarify.v1`, `map-search.v1`) have live producers (RENDERING-011, P3) —
`itinerary.v1` and any weather/stocks/shopping/local-business/reservations/
jobs kind are honestly undelivered, not faked. No native/interactive chart
component exists anywhere; a generated chart only reaches the user as a
static PNG via the code-execution image path (RENDERING-012, P3).

### 3.6 Gaps

| ID            | Sev | Surface          | Gap                                                                                     |
| ------------- | --- | ---------------- | --------------------------------------------------------------------------------------- |
| RENDERING-001 | P1  | cross-surface    | Three independent, non-converged markdown engines                                       |
| RENDERING-002 | P1  | extension-chrome | No tables/images/math/highlighting/per-block copy                                       |
| RENDERING-003 | P2  | mobile           | Regex parser drops nested lists, ignores inline formatting in table cells               |
| RENDERING-004 | P1  | desktop-tauri    | Missing thumbs feedback, edit, share, read-aloud, branch, report                        |
| RENDERING-005 | P1  | extension-chrome | Only response action anywhere is whole-message Copy                                     |
| RENDERING-006 | P1  | desktop-tauri    | No renderer for code-execution stdout/stderr                                            |
| RENDERING-007 | P2  | cross-surface    | No inline file-diff view in the chat transcript                                         |
| RENDERING-008 | P2  | cross-surface    | Citations are a flat trailing chip row, no rich popover; extension has zero citation UI |
| RENDERING-009 | P2  | cross-surface    | Branch/fork UI exists on Web only                                                       |
| RENDERING-010 | P2  | web              | Dual, architecturally inconsistent card-detection mechanisms                            |
| RENDERING-011 | P3  | web              | Only 2 of N declared interactive-card kinds have live producers                         |
| RENDERING-012 | P3  | cross-surface    | No native chart/graph rendering anywhere                                                |

### 3.7 Strengths

- `MessageBubble.tsx`'s branch/fork UI (`onBranch`, `BranchNavigator`,
  `:369-374,1977-1981`) beats Claude's own benchmark: claude.ai's branching
  is fully invisible, a known Anthropic GitHub issue.
- Mobile's response-action row (Copy, Read aloud, Share, Regenerate, thumbs,
  Play-Store-mandated Report) is richer than Desktop's.
- Mobile's citation chips open in an in-app browser sheet with a
  validated-URL gate, not a raw `Linking.openURL`.
- Code-execution rendering (web) and deep-research activity UI both match
  or exceed the researched competitor bar.

### What NOT to copy

Don't build a claim-adjacent citation-chip system that's merely decorative
— ChatGPT's own model-switch-per-turn UX is documented as feeling
"decorative" (`chatgpt-web-desktop.md` §4/§17: selected model doesn't
visibly change behavior). Don't chase weather/stocks/sports/shopping rich
cards as a priority — ChatGPT's own support for these is UNVERIFIED per
research and Claude shows no evidence of shipping them at all
(`cross-cutting-and-complaints.md` §1); RENDERING-011 is correctly P3.
Don't "fix" the mobile/extension markdown gap by adding more regex
branches — the fix that actually closes RENDERING-001 is converging on a
single AST-based parser with per-platform renderers.

---

## 4. Design system, tokens & accessibility

Source: `gaps/domain-design-system.md`.

### 4.1 Summary

The design-token layer (`packages/ui/design-tokens`) and the 56-component
shared primitive library (`packages/ui/ui`) are genuinely strong — dated
WCAG AA contrast remediation, forced-colors/`prefers-contrast` support, iOS
safe-area handling — better-documented than most production design systems
this size and beyond what either ChatGPT or Claude's web apps are known to
ship. The problem is not the system's design; it's inconsistent enforcement
and inconsistent adoption. Three separate "no-hardcoded-color" guards exist
(web, mobile, extension-vscode) built to the same pattern as the Chrome
extension's correctly-CI-gated one — but the web and mobile copies are
never invoked in CI, and the extension-vscode one is **currently failing**
on the audited commit from a regex bug. Two shared primitives (`EmptyState`,
`Spinner`) are barely used in the surface shipping the most code. A
dedicated `accessibility/` directory (650 LOC, including a fabricated
"95%, all checks passed" mock audit panel) is entirely dead code — so dead
the app currently ships with no working skip-to-content link despite having
built one. Both a11y CI gates (web, desktop) only ever see the signed-out
marketing shell, never the authenticated product.

### 4.2 Component/token adoption

| Surface            |             Files importing `@agiworkforce/ui` (56 primitives) | Consumes `@agiworkforce/design-tokens`? |
| ------------------ | -------------------------------------------------------------: | --------------------------------------- |
| Web                |                                         113 (primary consumer) | Yes — `app/globals.css`                 |
| Desktop            |                                           54 (second consumer) | Yes — `src/styles/globals.css`          |
| Mobile             |                                    0 (expected — React Native) | Yes — chat components, stores           |
| Extension (Chrome) | 0 — not React at all (87 `.ts`, 2 `.html`, 2 `.css`, 0 `.tsx`) | Yes — `src/tokens.ts`                   |
| Extension-vscode   |                            0 — hand-built HTML template string | Yes — `webviewContent.ts`               |
| CLI                |                                  0 (terminal UI, out of scope) | n/a                                     |

The token layer (colors/radii/fonts as CSS custom properties or JS
constants) is universal; the _component_ layer (button/modal/menu markup
and behavior) reaches only 2 of 6 surfaces — the structural root of
DESIGN-SYSTEM-002.

### 4.3 Raw hex colors, guard status per surface

`grep -rEo '#[0-9a-fA-F]{3,8}\b'`, source dirs only:

| Surface            |                                              Raw hex hits | Guard exists?           | Wired into CI?                                             | Guard currently passes?                    |
| ------------------ | --------------------------------------------------------: | ----------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| Web                |                     410 (4 real violations per the guard) | Yes                     | **No**                                                     | **No — 4 failures**                        |
| Mobile             |                          593 (640 grandfathered baseline) | Yes + ratchet baseline  | **No**                                                     | Yes (0 new)                                |
| Desktop            | 322 (mostly legit: xterm/syntax-highlight/chart palettes) | **No equivalent guard** | n/a                                                        | n/a                                        |
| Extension (Chrome) |                                                        21 | Yes                     | **Yes** (`ci.yml:146`, `release-chrome-extension.yml:114`) | Yes                                        |
| Extension-vscode   |                                                        12 | Yes                     | **Yes** (`release-vscode-extension.yml:98`)                | **No — 1 false-positive** on `color-mix()` |

Inline `style={{...}}` counts (not filtered for legitimacy — dynamic
values like computed widths are expected): web 1,638, desktop 206,
extension 2, extension-vscode 13. Web's number is large but mostly
load-bearing dynamic styling, not a hex-literal proxy.

**DESIGN-SYSTEM-001 is the single most concrete, reproducible finding in
this domain** — a currently-failing command on the exact audited commit:

```
$ cd apps/extension-vscode && node scripts/check-vscode-theme-tokens.mjs
check:vscode-theme-tokens — FAIL: 1 new hardcoded color literal(s) found.
  apps/extension-vscode/src/features/sidebar-webview/webviewContent.ts:290
```

Line 290 (`background: color-mix(in srgb, var(--warning) 10%, var(--bg-elevated));`)
is fully tokenized, correct CSS. The guard's regex excludes `var(`,
`transparent`, `inherit`, `initial`, `currentColor`, `none` but not
`color-mix(` — the word "color" at the start of the function name trips
it. This guard runs unconditionally on every `v-vscode-*` tag.

### 4.4 Light/dark/system, contrast, motion, keyboard, screen readers

| Area                                            | State                                                                                                                                                                                                            | Evidence                                                                                                                                                                         |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| WCAG AA contrast                                | Documented, _measured_ remediation across all 4 theme×palette combos                                                                                                                                             | `packages/ui/design-tokens/src/chat.css` `AUDIT-FIX GOV-34` comments with before/after ratios (e.g. dark-mode `--chat-text-muted` "was #5c5955, 2.53:1 ... now #8f8982, 5.08:1") |
| `forced-colors: active` (Windows High Contrast) | Strips shadows/gradients, forces `ButtonBorder`/`LinkText`/`Highlight`, neutralizes gradient/transparent-text utilities                                                                                          | `apps/web/app/globals.css:1757-1789`                                                                                                                                             |
| `prefers-contrast: more`                        | Strengthens muted-foreground/border tokens, widens focus ring to 3px                                                                                                                                             | `apps/web/app/globals.css:1730-1755`                                                                                                                                             |
| Focus ring (desktop)                            | Documented fix for a real prior bug: "under ordinary settings NOTHING in the desktop app showed a focus ring"                                                                                                    | `apps/desktop/src/styles/globals.css:338-360`                                                                                                                                    |
| Reduced motion — desktop/web                    | Not itemized in this pass beyond the primitive-level `Button`/motion tokens                                                                                                                                      | —                                                                                                                                                                                |
| Reduced motion — mobile                         | **Respected in 2 of 23 animation files (DESIGN-SYSTEM-011, P2)**                                                                                                                                                 | grepped animation APIs vs. reduce-motion checks                                                                                                                                  |
| Non-semantic clickable `<div>`s                 | web 0, extensions 0, desktop 2 (both `stopPropagation` wrappers, not real controls)                                                                                                                              | repo-wide grep                                                                                                                                                                   |
| Icon-library discipline                         | 100% `lucide-react` — web 141 imports, desktop 254 imports, zero mixed icon sets                                                                                                                                 | repo-wide grep                                                                                                                                                                   |
| `Button` primitive a11y                         | Sets `aria-busy` for loading, injects a visually-hidden fallback label for icon-only buttons with no `aria-label`                                                                                                | `packages/ui/ui/src/primitives/Button.tsx`                                                                                                                                       |
| `useSystemHighContrast` (mobile)                | Live-subscribes to iOS `isDarkerSystemColorsEnabled`/Android `isHighTextContrastEnabled`, correctly wired                                                                                                        | `apps/mobile/src/ui/theme/useSystemHighContrast.ts`, `useTheme.ts:43`                                                                                                            |
| jsx-a11y (web)                                  | Active via `eslint-config-next/core-web-vitals`; the `disabledReactRules` override turns off `react/*` only, not `jsx-a11y/*`; lint runs `--max-warnings=0`. No missing `alt=` found in real component code      | eslint config read directly                                                                                                                                                      |
| Skip-to-content link                            | **Built, never mounted — ships broken.** `AccessibilityAudit.tsx` mock panel always returns `{score:95, passed:12, failed:0, warnings:1}` and a canned "All checks passed!" report regardless of real page state | `apps/web/shared/components/accessibility/` — 650 LOC, 8 files, zero imports anywhere under `app/`, `features/`, `components/` (DESIGN-SYSTEM-009 / GAP-275)                     |
| Mobile a11y labels                              | ~49% of `Pressable`/`TouchableOpacity` instances have an `accessibilityLabel`; 624 unlabeled instances, no automated a11y test suite at all                                                                      | DESIGN-SYSTEM-010                                                                                                                                                                |
| a11y CI gates                                   | Both web and desktop gates only ever render the signed-out marketing shell — never Settings, never a populated chat thread                                                                                       | DESIGN-SYSTEM-003                                                                                                                                                                |

### 4.5 Touch targets / responsive behavior

Mobile's ~49% accessibility-label coverage on `Pressable`/`TouchableOpacity`
(§4.4) is the only quantified touch-target finding in the evidence base;
no dedicated hit-area-size (44×44pt/48×48dp) measurement was run this
round — flagged **NEEDS VALIDATION**, not asserted either way. Responsive
behavior: both web shells implement an independent `matchMedia
'(max-width: 768px)'` listener that flips to a compact header + slide-in
drawer with focus trap, Escape-to-close, and backdrop click-to-close
(`WebAppShell.tsx:93-121,464-521`; `WebChatPage.tsx:599-660,3971-4012`) —
functionally near-identical but independently maintained, a minor
duplication risk if one gets an accessibility fix the other doesn't
(`inventory/web-frontend.md` §2.7).

### 4.6 Gaps

| ID                | Sev | Surface          | Gap                                                                          |
| ----------------- | --- | ---------------- | ---------------------------------------------------------------------------- |
| DESIGN-SYSTEM-001 | P1  | extension-vscode | CI-wired color-token guard currently red on a `color-mix()` false positive   |
| DESIGN-SYSTEM-002 | P1  | cross-surface    | Shared component library reaches only 2 of 6 UI surfaces                     |
| DESIGN-SYSTEM-003 | P1  | cross-surface    | Both a11y CI gates cover only unauthenticated/pre-product screens            |
| DESIGN-SYSTEM-004 | P2  | web              | Web's own hex guard unwired from CI, currently failing (4 violations)        |
| DESIGN-SYSTEM-005 | P2  | mobile           | Mobile's hex guard + 640-entry baseline unwired from CI                      |
| DESIGN-SYSTEM-006 | P2  | web              | 4 chat-format cards inject un-tokenized rainbow gradients                    |
| DESIGN-SYSTEM-007 | P2  | web              | Chat top bar uses off-palette purple/blue gradient + raw grays               |
| DESIGN-SYSTEM-008 | P2  | web              | Shared `EmptyState` barely adopted; duplicates regress its own contrast fix  |
| DESIGN-SYSTEM-009 | P2  | web              | `accessibility/` directory 100% dead code incl. mocked audit panel (GAP-275) |
| DESIGN-SYSTEM-010 | P2  | mobile           | No automated a11y testing; ~49% of touch targets labeled                     |
| DESIGN-SYSTEM-011 | P2  | mobile           | Reduce-motion respected in 2/23 animation files                              |
| DESIGN-SYSTEM-012 | P3  | web              | Shared `Spinner` unused; 60+ ad-hoc `Loader2`/`animate-spin` implementations |

### 4.7 Strengths

Documented, measured WCAG AA remediation across every theme×palette
combination; Windows High Contrast and `prefers-contrast` support neither
competitor's web app is known to ship; a single canonical settings-nav
source of truth shared by web and desktop, purpose-built to prevent drift;
100% icon-library discipline; zero non-semantic clickable `<div>`s; design
tokens reaching 5 of 6 app surfaces. Badge usage (35 instances across 21
files) is already at a disciplined density comparable to Claude Web's
purposeful use of `Beta`/`Recommended`/`running` badges — no over-correction
needed.

### What NOT to copy

Don't let settings sprawl reach ChatGPT desktop's documented "rivaling
Microsoft and Facebook in complexity" territory — this repo's
`settings-nav.ts` (38 top-level keys) is not there today because it is a
single deduplicated source of truth for web and desktop, a structural
advantage neither benchmark demonstrably has. Don't copy either product's
habit of shipping a feature behind a settings flag no one finds — this
repo's dead `accessibility/` directory is the same failure mode in a
different shape (a _built_ feature nobody wired up, not a gated one); the
fix in both cases is the same discipline: mount it or delete it.

---

## 5. "AI-generated-looking UI" assessment

The audit brief for this document names a specific checklist — excessive
gradients, rounded cards, random borders, inconsistent spacing, generic
dashboards, oversized headings, repetitive cards, unnecessary labels,
excessive icons, misalignment, poor hierarchy — and asks for the numbers
that analysis produced. Per this audit's own scoping record
(`prior-art-reconciliation.md:75-76`): _"Design-system coherence is 8 rows
[in the prior 341-row tracker]. Typography, spacing, token adherence,
light/dark, a11y, and 'AI-generated-looking UI' are essentially
untouched."_ This round's design-system pass (§4 above) closed most of
that gap for tokens/a11y/adoption, but **did not run a dedicated,
named visual-heuristic sweep against this specific checklist** — there is
no single component-by-component "looks AI-generated" score anywhere in
the evidence base. Per the evidence-or-silence standard, the honest
position is: report what _was_ quantified that bears directly on each
checklist item, and mark the rest NOT MEASURED rather than assign an
adjective-only verdict.

| Checklist item                     | Evidence found                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Verdict                                                                                                                                                               |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Excessive gradients**            | Quantified: 4 chat-format cards inject un-tokenized rainbow gradients (CalculationCard 6 gradient/raw-color hits, ComparisonCard 14, StepsCard 8, RecipeCard 5 — none of the colors used exist in `chat.css`'s token set); the chat top bar's "Dashboard" CTA uses a `from-purple-500 to-blue-500` gradient matching neither of the product's two deliberate palettes (DESIGN-SYSTEM-006, -007)                                                                               | **Confirmed, narrow** — 5 components total, not systemic                                                                                                              |
| **Rounded cards / random borders** | Not measured — no `border-radius`/`rounded-*` consistency sweep was run this round                                                                                                                                                                                                                                                                                                                                                                                            | **NOT MEASURED**                                                                                                                                                      |
| **Inconsistent spacing**           | Not directly measured; the only adjacent data point is 1,638 inline `style={{}}` uses on web, assessed as "mostly load-bearing dynamic styling (progress bars, computed positions), not a hex-literal proxy" — not evidence of spacing inconsistency either way                                                                                                                                                                                                               | **NOT MEASURED**                                                                                                                                                      |
| **Generic dashboards**             | Not assessed — the one dashboard-labeled surface examined (`/admin`, `AdminConsolePage.tsx`) was evaluated for wiring completeness (COMPLETE, live security-ops panel), not visual genericness                                                                                                                                                                                                                                                                                | **NOT MEASURED**                                                                                                                                                      |
| **Oversized headings**             | Not assessed this round                                                                                                                                                                                                                                                                                                                                                                                                                                                       | **NOT MEASURED**                                                                                                                                                      |
| **Repetitive cards**               | Adjacent evidence: `EmptyState` primitive is duplicated rather than reused — 48 files have hand-written empty-state copy, and at least 2 (`ArtifactsPanel.tsx`, `ResearchPanel.tsx`) define local `function EmptyState()` shadowing the shared primitive, regressing its own documented contrast fix (DESIGN-SYSTEM-008); `Spinner` primitive has zero direct web usages, with 60 files implementing an ad-hoc `Loader2`/`animate-spin` treatment instead (DESIGN-SYSTEM-012) | **Confirmed pattern of duplicated, not visually repetitive, card/loading UI** — a code-reuse finding, distinct from the "every card looks the same" AI-slop complaint |
| **Unnecessary labels**             | Not assessed this round                                                                                                                                                                                                                                                                                                                                                                                                                                                       | **NOT MEASURED**                                                                                                                                                      |
| **Excessive icons**                | Measured, and the finding is the opposite of the checklist's concern: 100% `lucide-react` discipline (141 web imports, 254 desktop imports), zero mixed icon sets, zero non-semantic clickable `<div>`s (§4.4)                                                                                                                                                                                                                                                                | **Contradicted** — icon usage is disciplined, not excessive                                                                                                           |
| **Misalignment**                   | Not assessed this round                                                                                                                                                                                                                                                                                                                                                                                                                                                       | **NOT MEASURED**                                                                                                                                                      |
| **Poor hierarchy**                 | Not assessed this round                                                                                                                                                                                                                                                                                                                                                                                                                                                       | **NOT MEASURED**                                                                                                                                                      |

**Bottom line:** of the eleven checklist items, this audit round produced
hard numbers for two and a half (gradients: confirmed and narrow at 5
components; repetitive-card _duplication_, as distinct from repetitive
_appearance_: confirmed at 48+60 files; icon discipline: confirmed and
contradicts the concern). The remaining eight items are **NEEDS
VALIDATION** — a dedicated visual-heuristic pass (ideally screenshot-driven,
matching the methodology `audit/ui-gaps.csv` already uses for competitor
diffing) is the correct next step, not an inference from the token/adoption
data gathered here. Recorded as a concrete open item per `CLAUDE.md`'s "if
the full path genuinely cannot be completed, stop and record the exact
remaining step" rule, rather than either skipping the section or inventing
scores for it.

---

## 6. Settings UI

Source: `gaps/domain-settings.md`.

### 6.1 Per-surface inventory

| Surface             | Surface count                                                                                                                                                                               | Reachability                                                                                                                                                                                                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web                 | 21 gated `/settings/*` routes, single modal (`WebSettingsModal.tsx`)                                                                                                                        | **21/21 resolve to real content** (`web-route-sweep-findings.md` confirms 200s; this audit confirmed non-stub content behind each). One page (`voice`) is real but has no nav row and no search hit (SETTINGS-001).                                                                                    |
| Desktop             | `SettingsPanel.tsx` + `settings-nav.ts`, 20 nav keys, all resolve to a real component — no dead `case` branches                                                                             | Depth varies sharply: Appearance _exceeds_ Codex/Claude (full custom-theme editor, import/export, dyslexic font, UI scale, reduce motion); Cowork is 1 control vs. Claude's 5 (SETTINGS-011/GAP-006); Capabilities self-documents unfinished Artifacts/code-exec/network-egress toggles (SETTINGS-006) |
| Mobile              | ~33 screens under `app/(app)/settings/`                                                                                                                                                     | **Deepest, most disciplined settings surface in the product** — no new gaps found beyond what `mobile.md`/`ui-gaps.csv` already track                                                                                                                                                                  |
| Extension (VS Code) | 20 `agiWorkforce.*` configuration properties                                                                                                                                                | **Only settings surface with an automated schema-drift guard** — `SETTINGS_PANEL_SETTING_KEYS` ↔ Zod schema ↔ `contributes.configuration` locked in step by a failing test (SETTINGS-010's model to generalize)                                                                                        |
| Extension (Chrome)  | Options page, 5 sections (`options.ts`, 1,715 lines): Permissions, Account, Autofill Profile, Computer Use, Keyboard Shortcuts (read-only display of live `chrome.commands.getAll()`), Help | Notification granularity is a single flat toggle (SETTINGS-009, low severity — extension fires only one notification type today)                                                                                                                                                                       |

### 6.2 Settings that exist in code but are unreachable from any UI

The seed example (`setSendShortcut`, `apps/desktop/src/stores/settingsStore.ts:1252`,
zero call sites) turned out to be one instance of a much larger pattern:
**15 dead setters** in the desktop settings store (model-routing:
`setDefaultProvider`/`setTemperature`/`setMaxTokens`/`setTaskRouting`/
`setFavoriteModels`/`setProviderMode`; window/session:
`setStartupPosition`/`setDockOnStartup`; agent: `setEnableCheckpointing`/
`setCheckpointInterval`/`setAutoResumeOnRestart`; plus
`setAutoSaveMemories`/`setChatStorageMode`/`setFeature`/`setSendShortcut`),
**7 dead field/setter pairs** in the shared web+desktop unified-chat store
(`toolAccessMode`, `inlineVisualizationsEnabled`, 3× notify toggles, 2×
memory toggles — none read, none called), plus **one entire unreachable
settings page** (`/settings/voice`, reachable only via a miswired icon +
typed URL). Every one of the 22 dead setters was verified by a repo-wide
grep excluding the defining and test files, with counter-examples confirmed
for sibling fields in the same files that _do_ have live call sites — the
grep methodology is not just missing an indirection layer.

### 6.3 Controls with no backend effect — checked, not found (a strength)

Every place this audit checked for a "decorative toggle that saves but does
nothing," the toggle had already been found and _deleted_, with the
reasoning preserved in a code comment: `voice`/`chatFont` in
`GeneralSection.tsx:67-83`; `locationMetadata`/`improveModelTraining`/
`rememberChats` in `PrivacySection.tsx:23-32` (the last removed because it
"currently promises the opposite of what happens" — a truth-in-UI issue,
correctly treated as worse than a no-op); five dead notification toggles in
`NotificationsSection.tsx:20-38`, two correctly re-added only once their
backend senders shipped; an "Import memory from other AI providers" row
(which Claude ships) deliberately _not added_ because the underlying
import flow is a placeholder (`CapabilitiesSection.tsx:169-174`). No
counter-examples found — this pattern is real and consistent.

### 6.4 Gaps

| ID           | Sev | Surface          | Gap                                                                                                     | Prior art |
| ------------ | --- | ---------------- | ------------------------------------------------------------------------------------------------------- | --------- |
| SETTINGS-001 | P1  | web              | Settings gear icon in collapsed sidebar routes to Voice sub-page, not the Settings modal                | new       |
| SETTINGS-002 | P2  | desktop          | Model-routing setters (temperature/max-tokens/task-routing/favorites/provider) — 0 call sites           | new       |
| SETTINGS-003 | P2  | desktop          | Window/session setters + `setSendShortcut` — 0 call sites                                               | new       |
| SETTINGS-004 | P2  | desktop          | Agent checkpointing/auto-resume fully modeled, zero UI                                                  | new       |
| SETTINGS-005 | P2  | shared           | 7 dead field/setter pairs in unified-chat store                                                         | new       |
| SETTINGS-006 | P2  | web+desktop      | Capabilities settings missing Artifacts/Code-exec/Network-egress/Tool-access-mode                       | new       |
| SETTINGS-007 | P2  | web              | No accent color/contrast (mobile + desktop have it)                                                     | GAP-275   |
| SETTINGS-008 | P2  | cross-surface    | No passkey/WebAuthn or SMS MFA, TOTP-only (honestly disclosed)                                          | GAP-115   |
| SETTINGS-009 | P3  | extension-chrome | Notification control is a single flat toggle                                                            | new       |
| SETTINGS-010 | P2  | cross-surface    | Recurring "settings panel shipped with no nav entry" authoring pattern (4 historical + 2 new instances) | new       |
| SETTINGS-011 | P2  | desktop          | Cowork settings: 1 control vs. Claude's 5                                                               | GAP-006   |
| SETTINGS-012 | P3  | web              | Notifications: 3 categories vs. benchmark's 6-8 (deliberately, correctly narrow)                        | GAP-119   |

### 6.5 Strengths

Systemic hygiene of finding and deleting dead/misleading toggles rather
than letting them accumulate (§6.3) — no captured competitor evidence shows
equivalent self-correction. Desktop's `ThemeSettings.tsx` custom-theme
editor (live swatch preview, JSON import/export, dyslexic-font/UI-scale/
reduce-motion controls) exceeds every competitor screenshot captured.
VS Code's config-key/schema lock-step test is the template SETTINGS-010
recommends generalizing. Chrome extension's per-action, nonce-bound
approval model for computer-use/CDP access is architecturally ahead of a
static category-dropdown approach. Mobile's settings tree is the most
complete and disciplined single surface in the product, including one
place a settings type was actively _removed_ rather than half-wired
(`settings/permissions/registry.ts`'s deleted `location` stub).

### What NOT to copy

ChatGPT's "Intelligence" label means three different things in three
places at once (composer popover, General's "Pro level," Voice's
"Intelligence" dropdown — `shots-chatgpt-ios-shell-settings.md:425`);
AGI's keyword-search system could reproduce this if extended carelessly —
worth a lint rule (no keyword string under two nav keys) rather than a
feature to copy. ChatGPT iOS styles "Delete all chats" red but "Delete
account" as plain black (`shots-chatgpt-ios-shell-settings.md:424`) —
inconsistent danger-styling; worth a deliberate pass confirming every
destructive action in this repo's tree shares one red-outline treatment.
ChatGPT represents "reasoning effort" as three different widget types
across three settings surfaces (`shots-chatgpt-web-macos.md:716`) — pick
one shape and reuse it everywhere. Don't build a shadow "Trusted contact"/
"Parental controls" crisis feature without the same infrastructure
(verified contact consent, clinical-risk classification, legal review) the
real feature requires — this repo's explicit decline (GAP-044/GAP-023) is
the right call, not a gap to fill.

---

## 7. Artifacts & creation workspaces

Source: `gaps/domain-artifacts.md`.

### 7.1 Summary

One of the stronger domains in the repository. The web implementation
(`ArtifactPreview.tsx`, 1,851 lines) is not a thin Claude Artifacts clone —
it covers more artifact _types_ than Claude documents (spreadsheet/table/
csv, presentation, email, image, PDF, DOCX-via-mammoth, plus html/react/
svg/mermaid/code/markdown), has real content-keyed version history with
Restore, a working publish-to-public-URL flow with CSRF/rate-limiting/
forced RLS, a resizable split-view panel with keyboard-operable resize and
correct mobile modal semantics, a streamed "writing…" view for in-flight
artifacts, and a cross-conversation gallery (`/gallery`). The cross-origin
sandbox renderer (`infrastructure/sandbox/index.html`) is careful security
engineering with documented provenance for every mitigation (DOMPurify
pinned by SRI, null-origin `srcdoc`, CSP with `connect-src 'none'`). The
gaps are real but narrower than the strengths: Web-authored artifacts don't
sync to other devices, Desktop can't publish to a public link at all,
nothing supports direct manual editing of an artifact's source, and
Mobile's viewer lacks version history and publish.

### 7.2 Gaps

| ID            | Sev | Surface       | Gap                                                                                                             |
| ------------- | --- | ------------- | --------------------------------------------------------------------------------------------------------------- |
| ARTIFACTS-001 | P1  | cross-surface | Web-authored artifacts never push to the cloud sync endpoint (pull-only client against a full push/pull server) |
| ARTIFACTS-002 | P2  | desktop-tauri | Desktop's Publish is hardcoded to local `file://` export; no `CloudPublisher` exists                            |
| ARTIFACTS-003 | P2  | cross-surface | No direct/manual editing of artifact source anywhere; every revision requires a new LLM turn                    |
| ARTIFACTS-004 | P2  | mobile        | No version history, no publish action in the mobile viewer                                                      |
| ARTIFACTS-005 | P2  | cross-surface | AI-powered/model-calling artifacts entirely absent — correctly, per GAP-P0-009's red-team NO-GO                 |
| ARTIFACTS-006 | P3  | web           | No embed-code/domain-allowlist for published artifacts                                                          |
| ARTIFACTS-007 | P3  | web           | No keyboard shortcut to toggle the Artifacts panel (GAP-227)                                                    |
| ARTIFACTS-008 | P3  | cross-surface | "Live artifacts" nav label points at the same static gallery — no self-updating artifact concept exists         |

ARTIFACTS-001 is the one that matters most: `apps/web/app/api/chat/sync/route.ts`
is a complete, bidirectional sync endpoint that upserts conversations,
messages, _and_ artifacts with server-version compare-and-swap
(`:444-530`) — but the only artifact-sync consumer in the web app,
`useArtifactCloudSync()`, calls `pullArtifactCloudChanges()` and nothing
else. Desktop's Rust `cloud_sync.rs` does push its artifacts, so a
Desktop-authored artifact reaches Web; a Web-authored artifact reaches
nowhere — it lives only in that one browser's `localStorage`. This is
backend work that's already done and simply not wired to its second
caller.

### 7.3 Strengths

Split view with pointer + keyboard resize (`role="separator"`, arrow-key
resize); correct mobile modal semantics (`role="dialog"`, focus trap,
Escape, focus restore); content-keyed version history with a
non-destructive Restore; a CSRF-guarded, rate-limited, RLS-forced publish
flow with an honest 400 on unpublishable kinds rather than a silent
failure; a real `<iframe srcdoc>` sandbox (not `innerHTML`) with a pinned
parent-origin allowlist including desktop's `tauri://localhost`; office
file generation (docx/pptx) wired into the real tool loop, honestly scoping
xlsx to the sandbox path rather than advertising a capability it can't
deliver.

### What NOT to copy

Claude's artifacts silently stop working if "Code execution and file
creation" is toggled off in Settings, with no clear error path back
(`claude-web-desktop.md` §3) — this repo's artifact rendering has no
equivalent single point of silent failure; keep it that way. Claude states
republishing an unpublished artifact isn't possible — you have to create
anew (`claude-web-desktop.md` §13); this repo's `unique(user_id,
artifact_id)` constraint already makes republish an upsert that keeps the
same URL, a better design worth preserving as-is.

---

## 8. Full gap index (59 gaps, by severity)

### P1 (16)

| ID                | Surface          | Summary                                                     |
| ----------------- | ---------------- | ----------------------------------------------------------- |
| SHELL-NAV-IA-001  | web              | `/tasks` renders authenticated shell to signed-out visitors |
| SHELL-NAV-IA-003  | mobile           | Skills screen unreachable                                   |
| SHELL-NAV-IA-004  | cross-surface    | Pairing copy names nonexistent destination                  |
| COMPOSER-001      | cross-surface    | Four parallel composer implementations                      |
| COMPOSER-002      | web+desktop+ext  | Large-paste-to-attachment missing except mobile             |
| COMPOSER-004      | desktop-tauri    | No image/video generation in shared composer                |
| RENDERING-001     | cross-surface    | Three parallel markdown engines                             |
| RENDERING-002     | extension-chrome | No tables/images/math/highlighting                          |
| RENDERING-004     | desktop-tauri    | Missing thumbs/edit/share/read-aloud/branch/report          |
| RENDERING-005     | extension-chrome | Copy is the only response action                            |
| RENDERING-006     | desktop-tauri    | No stdout/stderr renderer for code execution                |
| DESIGN-SYSTEM-001 | extension-vscode | CI-wired color guard currently red                          |
| DESIGN-SYSTEM-002 | cross-surface    | Shared component library reaches 2/6 surfaces               |
| DESIGN-SYSTEM-003 | cross-surface    | a11y CI gates cover only unauthenticated screens            |
| SETTINGS-001      | web              | Settings gear routes to Voice sub-page, not modal           |
| ARTIFACTS-001     | cross-surface    | Web artifacts never push to cloud sync                      |

### P2 (31)

SHELL-NAV-IA-002, SHELL-NAV-IA-005 · COMPOSER-003, COMPOSER-005,
COMPOSER-006 · RENDERING-003, RENDERING-007, RENDERING-008, RENDERING-009,
RENDERING-010 · DESIGN-SYSTEM-004 through -011 (8) · SETTINGS-002 through
-008, -010, -011 (9) · ARTIFACTS-002, ARTIFACTS-003, ARTIFACTS-004,
ARTIFACTS-005 (4). Full detail for each in the corresponding
`gaps/domain-*.json`.

### P3 (12)

SHELL-NAV-IA-006, SHELL-NAV-IA-007 · COMPOSER-007, COMPOSER-008 ·
RENDERING-011, RENDERING-012 · DESIGN-SYSTEM-012 · SETTINGS-009,
SETTINGS-012 · ARTIFACTS-006, ARTIFACTS-007, ARTIFACTS-008.

---

## 9. Cross-cutting observations

- **Zero P0s in the entire frontend surface.** Every gap in this document
  degrades a surface to something less capable, less consistent, or less
  discoverable than its own sibling surfaces or the benchmark — none blocks
  a primary workflow or breaks the product for a serious demo.
- **The same failure shape recurs three times at different layers**: a
  fully-built capability with zero UI wiring. Desktop's 22 dead settings
  setters (§6.2), the desktop composer's missing image/video mode despite
  the backend and web/mobile UI already existing (COMPOSER-004), and the
  artifacts cloud-sync push path that exists server-side and in one client
  but not the other (ARTIFACTS-001) are the same root cause — a feature
  shipped on its "hard" side and never connected to its "easy" side —
  appearing in settings, composer, and artifacts independently.
- **Desktop's shared-package composer (`packages/ui/unified-chat`) is
  consistently the thinnest of the four composer implementations** despite
  being the one nominally meant to be canonical — RENDERING-004,
  RENDERING-006, and COMPOSER-004 all land there. If COMPOSER-001's
  consolidation recommendation is prioritized, closing that package's gaps
  against web's local implementation first is the highest-leverage single
  fix in this document, since it retroactively narrows four other P1/P2
  findings at once.
- **The Chrome extension is the floor of this audit** for rendering and
  response actions (RENDERING-002, RENDERING-005) specifically because it
  is not React and does not import the shared design system at all
  (§4.2) — a structural, not incidental, gap.
- **Honest-unavailability labeling is the strongest, most consistently
  repeated pattern across every domain in this document** — connectors,
  voice settings, capabilities, memory import, and the composer's
  coming-soon models all follow the same "truthful status label instead of
  a button known to fail" discipline (`WebSettingsModal.tsx:180-203` and
  parallels in §2.4, §6.3). This is the one design principle worth
  protecting above all others as new surfaces ship.

## 10. Open items for the next audit round

1. A dedicated visual-heuristic ("AI-generated-looking UI") sweep against
   the eleven-item checklist in §5 — ideally screenshot-driven, matching
   `audit/ui-gaps.csv`'s existing competitor-diff methodology. Eight of
   eleven checklist items have no evidence either way today.
2. Touch-target hit-area sizing on mobile (44×44pt/48×48dp) — only
   accessibility-_label_ coverage (~49%) was measured this round, not
   physical target size.
3. Timeout, rate-limited, and permission-denied state coverage per
   response-part type (§3.2) — only tool-call, research-activity,
   code-execution, image, and interactive-card state machines were
   confirmed; the other three states in the brief's checklist were not
   independently verified for any component.
4. CLI (`apps/cli`) frontend/TUI surface — zero rows in `ui-gaps.csv`, only
   a light slash-command pass in this round (§1.2).
