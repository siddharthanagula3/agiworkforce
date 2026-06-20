# REFERENCE_ANALYSIS.md

Status: Phase 1 deliverable (fact-check + reference analysis)
Owner: VC-demo production push (ultracode workflow)
Last updated: 2026-06-13
Sources: `~/Desktop/reference/` desktop/web screenshots (read directly), web search (current
ChatGPT/Claude state, June 2026), Context7 (Next.js 16), repo `apps/web/package.json` + design-tokens.

Goal: document the EXACT, implementable patterns that make a chat UI read as "ChatGPT/Claude-class"
rather than "generic AI card layout", so `apps/web` can be brought to parity for the VC demo.

---

## 0. ⚠ KEY DECISION SURFACED — palette direction (needs owner sign-off)

The brief specifies **ChatGPT's cool-grey palette** (`#212121` page, `#2f2f2f` composer, `#343541`
sidebar, white text). But the **existing `packages/design-tokens` system is warm/Claude-like**
(`--chat-bg:#1a1915` dark, terracotta accent `#c8892a`, IBM Plex / Crimson serif). The two reference
products themselves diverge:

| | ChatGPT (web, dark) | Claude.ai (web, dark) | AGI tokens today |
|---|---|---|---|
| Page bg | `#212121` neutral charcoal | `#262624` **warm** brown-black | `#1a1915` warm |
| Sidebar bg | `#171717` | `#1A1917` warm | `--chat-sidebar-bg` warm |
| Composer/raised | `#2F2F2F` | `#35332F` warm | `--chat-input-bg` warm |
| Text primary | `#ECECEC` cool off-white | `#F5F4EF` cream | `#e8e4db` cream |
| Accent | near-mono; desaturated blue toggles | terracotta/coral `#D97757`/`#CC785C` | terracotta `#c8892a` |
| Display type | grotesque sans (Söhne-like) | **serif** greeting (Anthropic Serif) | Crimson Pro display + IBM Plex serif |

**Implication:** "Match ChatGPT + Claude combined" is under-specified at the palette level. The
existing system is already ~90% aligned to **Claude's warm direction**. Three coherent options:
- **(A) Keep warm (Claude-leaning)** — least churn; tokens already exist; flip only the accent if desired.
- **(B) Go cool (ChatGPT-leaning)** — re-tokenize all `--chat-*` dark values to `#212121/#2f2f2f`
  neutral greys; biggest visual change, most work, matches the literal brief.
- **(C) Dual theme** — ship a theme switch ("ChatGPT mode" cool / "Claude mode" warm). Most product-y;
  the design-tokens layer already supports light/dark, so a third axis is feasible but is net-new scope.

This document records BOTH palettes so either direction is implementable. **Layout/structure patterns
below are identical regardless of palette** — proceed with them either way.

---

## 1. CURRENT STATE OF THE REFERENCE PRODUCTS (verified June 2026)

- **ChatGPT (2026 redesign):** model selection lives **inside the composer**; thinking-effort moved
  **into the model picker**; sidebar gained a **Pinned** section plus recent/pinned GPTs; suggested
  prompts surface **above the composer**. A broader "superapp" redesign (agents/coding/images/
  automation in one shell, worker toggles in the left rail) is rolling out mid-2026.
- **Claude.ai (April 2026 redesign):** **Projects** in the left sidebar (self-contained workspaces,
  own chat history + knowledge base); a **sessions/multi-session sidebar**; refreshed routines view;
  theme/editor settings persist. Top-of-sidebar **Chat | Cowork | Code** mode switcher on desktop.

These confirm the screenshot analysis below is current, not stale.

---

## 2. GLOBAL LANGUAGE

- **Font:** ChatGPT = clean grotesque sans (~15–16px body, line-height ~1.6). Claude = **two
  families**: serif display (greeting/headings, ~36–44px) + sans body. AGI already has the fonts
  (Geist sans, Crimson Pro/IBM Plex serif, JetBrains mono) — wire the serif into the empty-state
  greeting to get the Claude tell.
- **Dividers/borders:** very low-contrast hairlines, `rgba(255,255,255,0.06–0.1)`. Never high-contrast lines.
- **Radii:** rows ~8px; cards ~12px; composer pill ~24–28px; modal ~12–16px.
- **Density:** generous. ~24–32px between message turns; ~36px row height in sidebar nav.

---

## 3. SIDEBAR (anatomy to replicate)

- **Width:** ~260px fixed; collapsible to an icon rail / off-canvas.
- **ChatGPT order:** sidebar-toggle + new-chat icon → primary nav rows (New chat [active pill],
  Search chats, Library, Apps, Codex) → **GPTs** section → **Projects** (folder rows) → **Recents**
  (plain truncated titles, no icons) → footer (avatar + name + plan pill "Pro").
- **Claude order:** search + collapse → **Chat | Cowork | Code** segmented switcher → primary nav
  (New chat +, Projects, Artifacts, Customize) → **Recents** (plain titles) → footer (update banner +
  avatar "SN" + name + plan "Max" + chevron → profile popover).
- **Conversation item:** single-line title, ellipsis truncation, ~13–14px; hover = subtle rounded
  fill (`rgba(255,255,255,0.05)`); active = stronger fill; `⋯` menu + pin on hover.
- **Profile popover (Claude):** email header; rows Settings (⌘ shortcut), Language ›, Get help, —,
  Upgrade plan, Get apps and extensions, Gift Claude, Learn more ›, —, Log out.

AGI today: `ChatSidebar` is WIRED with session list, folders, new chat, collapse. **Gap:** no
ChatGPT/Claude-style sectioning (Projects/Recents headers), no top mode-switcher, no profile popover parity.

---

## 4. CHAT AREA (the core asymmetry)

- **Message column:** centered, **~720–768px max width**, wide gutters. Composer matches that width.
- **User turn:** **right-aligned rounded bubble** (~16–18px radius, ~10–14px padding, max ~60–70%
  width), subtle elevated grey/warm fill (ChatGPT `#2F2F2F` / Claude `#35332F`). No avatar.
- **Assistant turn:** **full-width, left-aligned, NO bubble, NO card** — plain text on the canvas,
  line-height ~1.7. *This bubble-right / flat-left asymmetry is the #1 tell.* Generic UIs wrongly card both.
- **Action row (below assistant, low-contrast until hover):** copy, 👍, 👎, retry/regenerate,
  read-aloud, share; Claude adds inline **Sources** (favicon + label).
- **Code block:** elevated dark panel, ~8px radius, top bar = language label (left) + Copy (right),
  muted-pastel syntax tokens. Inline code = small mono chip with faint bg.
- **Scroll-to-bottom:** small floating circular ↓ just above composer when scrolled up.
- **Disclaimer:** centered micro-grey line under composer.

---

## 5. COMPOSER (one big pill)

- **Shape:** single rounded-rectangle pill, radius ~24–28px, 1px soft border, faint elevation.
- **ChatGPT internals:** placeholder "Ask anything"; bottom-left cluster = `+` (attach), globe (web),
  agent cursor, Apps, then **model label as plain text** ("5.4 Thinking") as the switcher trigger;
  bottom-right = waveform/canvas, mic, **send = filled circle with ↑** (white when active).
- **Claude internals:** placeholder "How can I help you today?"; bottom-left `+`; bottom-right
  **model label text** ("Opus 4.7 Adaptive" — name primary, mode muted, chevron) + mic; Enter sends.
- **Empty state:** Claude = large **serif greeting** ("Good evening, {name}") + **centered** composer
  + outlined suggestion chips (Code · Write · Learn · Life stuff · From Gmail, each icon+label pill).
  ChatGPT = composer **bottom-docked** with "Ask anything".
- **Critical:** model switcher is **plain text, not a boxed `<select>`**; send is an **icon circle**, not a labeled button.

AGI today: `ChatComposerNew` is WIRED and feature-rich (voice, attachments, agent modes, slash
commands, drag/drop). **Gap:** confirm it reads as a single pill with text model-label + icon send,
and that the empty state uses the serif greeting + centered composer + chips.

---

## 6. MODEL SWITCHER (dropdown anatomy)

- **Trigger:** plain text in the composer toolbar.
- **Dropdown rows:** **bold title + muted one-line description**; active row gets a right **✓**.
  - ChatGPT: Auto ("Decides how long to think") / Instant ("Answers right away") / Thinking ("Thinks
    longer…", ✓) / **Legacy models ›** (submenu) / — / **Temporary Chat** (dashed-pencil icon + toggle).
  - Claude: Opus / Sonnet / Haiku, each with a descriptor; a **separate thinking-mode** dimension
    (Adaptive vs Extended).
- **Must be fed by the dynamic catalog** (`packages/types/src/models.json` via `useModelStore`), never
  a hardcoded list (locked repo rule). AGI already sources `availableModels` from `useModelStore` — good.

---

## 7. SETTINGS MODAL (centered two-pane)

- **Frame:** centered modal ~720px wide, rounded ~12–16px, over a dark scrim; close ✕.
- **Layout:** LEFT = ~180px vertical tab rail (icon + label; active = filled rounded-rect). RIGHT =
  scrollable content. Claude adds a **Search field atop the tab rail**.
- **ChatGPT tabs:** General · Notifications · Personalization · Apps · Schedules · Billing · Data
  controls · Storage · Security · Parental controls · Trusted contact · Account · Keyboard.
- **Claude tabs:** General · Account · Privacy · Billing · Usage · Capabilities · Connectors · Claude
  Code · Cowork · (Beta items) — plus a **"Desktop app"** group: General · Extensions · Developer.
- **Row pattern:** `Label (+ optional muted helper)` left, right-aligned control: toggle (pill track +
  knob, accent fill when ON), value+chevron dropdown, Play+value, count+`>`, or destructive button.
- **General/Profile rows:** Appearance (system/light/dark 3-segment), Accent, Language, **Chat font**
  (Claude: "Anthropic Serif"), Nickname/"What should Claude call you?", Occupation, Instructions (textarea), Memory toggle.

For AGI: the prompt wants a settings modal with tabs **General, Appearance, Models, BYOK, Memory,
Data** — a smaller, focused set. Map those onto the two-pane pattern above. BYOK tab must respect the
locked trust-boundary rules (visible provider label, no silent routing).

---

## 8. THINKING / TOOL / ARTIFACT RENDERING

- **Thinking (quiet, never a loud box):** ChatGPT = collapsible "Thought for Ns" header + muted
  paragraphs on expand. Claude = **thin vertical step list** with small clock/○ icons, muted text,
  "Show more" to expand, "Done" (✓) terminator. AGI has `ThinkingBlock` (collapsible) + `ReasoningAccordion` — align to the quiet style.
- **Tool calls (compact, not raw JSON):** Claude = header "Used … integration, loaded tools ›" then
  per-call rows (small file glyph + action + small **Result** pill); web search = **results card**
  ("…N results" header + stacked `favicon + title + domain` rows). AGI has `ToolCallCard` + `search/`
  + `ResearchPanel` — align to the favicon results-card pattern. (Note: favicon source must be
  CSP-safe; the Google S2 fallback is flagged as a production risk in PHASE2_MAP.)
- **Artifacts (right-side split panel):** layout becomes `icon rail | chat (~half) | artifact panel
  (~half)`. Panel header = title + format badge (e.g., "HTML") + Copy/refresh/close. In-chat, a small
  card ("…· Code · HTML" + Open pill, coral accent) launches it. AGI has `ArtifactsPanel` +
  `ArtifactBlock` + `InlineArtifactCards` — align headers/controls + the launcher card.

---

## 9. THE 10 HIGHEST-IMPACT DELTAS (implementation checklist)

1. **Background temperature** decided per §0 and applied consistently (no pure `#000`, no blue-grey).
2. **User-bubble-right / assistant-flat-left** asymmetry (the single biggest structural tell).
3. **Centered ~720–768px message column** with wide gutters (not full-bleed).
4. **Composer = one rounded pill** (~24–28px) with the toolbar inside; **model selector as plain text**.
5. **Send = filled icon circle (↑)**, low-contrast tool icons to its left.
6. **Product-specific empty state**: serif greeting + centered composer + outlined suggestion chips.
7. **Quiet reasoning blocks** (collapsible / thin step list), muted, never a bright box.
8. **Tool calls as compact rows + a favicon results-card** with an "N results" count.
9. **Artifacts open a right-side split panel** with its own header; a small launcher card in chat.
10. **Settings = centered two-pane modal** with icon+label tab rail (active = filled pill) and
    `label + helper → right control` rows; toggles = pill+knob with accent fill.

---

## 10. LIBRARY/PLATFORM FACTS (for safe edits)

- **Next.js 16.2.6** (App Router). Locked: routing middleware is `proxy.ts` exporting `function proxy`
  (NOT `middleware.ts`) — confirmed against current Next docs. `params` is a Promise (await it).
  `force-dynamic` already used on the chat layout.
- **React 19.2.6.** Tailwind **v4.2.2**, CSS-first config: `@import 'tailwindcss'` + `@theme` +
  `@variant dark (&:where(.dark, .dark *))` + `@plugin` in `globals.css`; **no `tailwind.config.js`**.
- Installed and available (match what ChatGPT/Claude-class UIs use): `@radix-ui/*`, `cmdk` (command
  palette), `vaul` (drawer/sheet), `sonner` (toasts), `framer-motion`, `class-variance-authority`,
  `@clerk/nextjs` (auth), `ai` (Vercel AI SDK v6, streaming), `zustand` (state).
- **⚠ `lucide-react ^1.14.0`** is version-anomalous (lucide-react's real line is `0.x`). Verify this
  isn't a wrong/typo-pinned or aliased package before relying on icon imports — flagged for Phase 2/edit-time.
- Per-component current docs (shadcn/ui, Radix, Lucide, Framer Motion) will be pulled via Context7 at
  edit time for the specific component being changed, per the locked "verify fast-moving APIs" rule.
