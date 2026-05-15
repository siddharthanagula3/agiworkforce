# AGI Workforce Design Spec — Reference-Driven Launch Wave

**Date:** 2026-05-15
**Status:** LOCKED for launch wave. Source of truth for visual treatment across Desktop, Web, Mobile, CLI/TUI, Chrome extension, VS Code extension.
**Authored from:** strategic sample of `~/Desktop/reference/ui/` (Claude desktop, Claude chat/artifacts, ChatGPT desktop, Codex desktop, Gemini chat, Perplexity, Codex CLI, Gemini CLI, Claude Code).
**Already-shipped tokens:** `packages/design-tokens/src/index.ts` (`agiPalette`, `agiRadii`, `agiChatCssVars`, `agiNativeColors`, `agiExtensionCssVars`, `agiVsCodeCssVars`).
**User mandates (verbatim):**

- "No onboarding suggestions; users dig directly into work."
- "Match competitor visual density and inline tool-call treatment."
- "Icon style/family must be consistent across all 6 surfaces."
- "Inline tool calling and the icons — I like them so much." → **the centerpiece of this spec.**

---

## 0. Cross-competitor patterns we will match

All five primary competitors (Claude, ChatGPT, Codex Desktop, Gemini, Perplexity) converge on these patterns. We adopt them without divergence:

1. **Composer-first empty state.** No multi-step wizards. Centered headline → composer → 3–5 horizontal sample-prompt chips. (Claude, ChatGPT, Codex Desktop all use this.)
2. **Inline tool calls as a clickable, collapsible bar.** Subtle leading icon + status label + chevron. Expanded view shows the request/response payload in a recessed code-block panel. (Universal across Claude, ChatGPT, Gemini.)
3. **Bottom-anchored composer with a `+` plus-menu and bottom-row controls.** Plus opens attachment/tool menu; bottom row holds model picker, mode toggle, mic, send. (Claude, Codex Desktop, ChatGPT, Perplexity identical.)
4. **Left rail = thin icon-only sidebar by default, expands on hover/click into a labelled conversation list.** Hover-only sweep, ~260px expanded width. (Claude, ChatGPT, Codex Desktop.)
5. **Model picker lives inside the composer, not in the top bar.** Pill or text-with-chevron that opens a list. (All five.)

The five patterns above are the launch baseline. If a surface diverges, justify it in PR review.

---

## 1. Palette

The shipped `agiPalette` in `packages/design-tokens/src/index.ts` is the canonical source. This spec **converges with it** and adds nothing new — what follows is the working palette restated in CSS-var form so engineers don't need to look up the TS export.

### Light mode (6 named vars per surface band)

```css
:root[data-theme='light'] {
  --bg-base: #faf9f7; /* canvas — warm off-white, NOT pure #fff (Claude pattern) */
  --bg-raised: #ffffff; /* cards, composer interior */
  --bg-sidebar: #f5f4f1; /* one notch darker than canvas */
  --bg-hover: #f0eeeb; /* sidebar item hover, button hover */
  --bg-code: #f6f8fa; /* code blocks, tool-call body */
  --bg-overlay: #ffffff; /* popovers, menus */

  --text-primary: #1a1915; /* body, headings */
  --text-secondary: #6b6560; /* labels, metadata */
  --text-muted: #8b8680; /* timestamps, helper */
  --text-placeholder: #9b9590;

  --border-subtle: rgba(26, 25, 21, 0.08);
  --border-strong: rgba(26, 25, 21, 0.15);

  --accent-primary: #21808d; /* teal — actions, focus, link */
  --accent-secondary: #da7756; /* terracotta — branded marks, "Golden hour thinking" star */
  --accent-soft: #f5c1a9; /* warm peach — selection, badge bg */

  --state-danger: #dc2626;
  --state-info: #2563eb;
  --state-success: #16a34a;
  --state-warning: #d97706;
}
```

### Dark mode

```css
:root[data-theme='dark'] {
  --bg-base: #1a1915; /* warm near-black (NOT #000) — matches Claude/Codex/ChatGPT */
  --bg-raised: #242220;
  --bg-sidebar: #151410;
  --bg-hover: #363330;
  --bg-code: #11100d;
  --bg-overlay: #2e2b28;

  --text-primary: #e8e4db;
  --text-secondary: #8b8680;
  --text-muted: #5c5955;
  --text-placeholder: #6b6560;

  --border-subtle: rgba(255, 235, 205, 0.08);
  --border-strong: rgba(255, 235, 205, 0.15);

  --accent-primary: #21808d;
  --accent-secondary: #da7756;
  --accent-soft: #f5c1a9;

  --state-danger: #ef4444;
  --state-info: #3b82f6;
  --state-success: #22c55e;
  --state-warning: #f59e0b;
}
```

### Convergences with shipped tokens

- `--bg-base` / `--bg-raised` / `--bg-sidebar` / `--bg-hover` / `--bg-code` / `--bg-overlay` = `agiPalette.{mode}.surface.{base,raised,sidebar,hover,code,overlay}`.
- `--text-*` = `agiPalette.{mode}.text.*`.
- `--accent-primary` = `agiPalette.{mode}.accent.primary` (teal). `--accent-secondary` = `accent.secondary` (terracotta).
- `--state-*` = `agiPalette.{mode}.state.*`.

### Divergences from shipped tokens

- `agiChatCssVars` currently swaps `--chat-accent-primary` to `accent.secondary` (terracotta) and `--chat-accent-secondary` to `accent.primary` (teal). **Keep that swap inside the chat surface only.** Outside chat, teal is primary. Do NOT propagate the swap to `--accent-primary` system-wide.

---

## 2. Typography

### Stack (substitutes for proprietary Claude faces)

| Slot                                      | Claude uses             | We use (system-acceptable)                                                |
| ----------------------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| Body / UI                                 | Styrene B               | **Inter** (variable, weights 400/500/600/700)                             |
| Long-form serif (artifact / reading view) | Tiempos Text            | **IBM Plex Serif** (free, weights 400/600)                                |
| Display headers (empty-state hero)        | Galaxie Copernicus Book | **Crimson Pro** or **Inter Display** (single weight 400, italic optional) |
| Mono (code, terminal, tool-call body)     | n/a                     | **JetBrains Mono** weights 400/600                                        |

### CSS stacks

```css
--font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
--font-serif: 'IBM Plex Serif', Georgia, 'Times New Roman', serif;
--font-display: 'Crimson Pro', 'Inter Display', var(--font-serif);
--font-mono: 'JetBrains Mono', 'SF Mono', 'Menlo', 'Monaco', 'Consolas', monospace;
```

ChatGPT / Codex Desktop use **Söhne + SF Pro**; Apple-native surfaces should fall through to `-apple-system` (already in the stack). VS Code surface should use `var(--vscode-font-family)` — already wired via `agiVsCodeCssVars`.

### Scale (5 steps)

| Token         | Size | Line-height | Weight      | Use                                                                                  |
| ------------- | ---- | ----------- | ----------- | ------------------------------------------------------------------------------------ |
| `--text-xs`   | 12px | 16px (1.33) | 400         | Timestamps, metadata, tool-call status pill                                          |
| `--text-sm`   | 13px | 20px (1.54) | 400         | Sidebar items, secondary labels, code-block body                                     |
| `--text-base` | 14px | 22px (1.57) | 400         | Body message text (CLAUDE/CHATGPT VERIFIED — they run smaller than typical web 16px) |
| `--text-lg`   | 16px | 24px (1.5)  | 500         | Settings labels, panel titles                                                        |
| `--text-xl`   | 20px | 28px (1.4)  | 500         | Section headers                                                                      |
| `--text-2xl`  | 28px | 36px (1.29) | 400 (serif) | Empty-state hero ("Golden hour thinking", "Let's build agiworkforce")                |
| `--text-3xl`  | 36px | 44px (1.22) | 400 (serif) | Marketing only                                                                       |

**Important:** competitor chat body is **14px**, not 16px. We match this for density. Mobile clamps the floor at 15px for legibility on phones.

### Weight rules

- 400 default. 500 = labels/buttons. 600 = headings. 700 = reserved.
- Never bold body paragraphs. Bold only inline emphasis or section headers.

---

## 3. Spacing

### 8-step scale (T-shirt + half)

```css
--space-0: 0;
--space-0-5: 2px;
--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
--space-12: 48px;
--space-16: 64px;
```

Base unit = 4px. Steps double or half-double.

### Surface dimensions

| Surface                            | Token                   | Value                                |
| ---------------------------------- | ----------------------- | ------------------------------------ |
| Sidebar collapsed (icon-only rail) | `--sidebar-collapsed-w` | 48px                                 |
| Sidebar expanded                   | `--sidebar-expanded-w`  | 260px                                |
| Chat message column max-width      | `--chat-col-max-w`      | 760px (Claude is ~720, ChatGPT ~768) |
| Composer max-width                 | `--composer-max-w`      | 760px (matches column)               |
| Composer min-height (resting)      | `--composer-min-h`      | 56px                                 |
| Composer max-height (auto-grow)    | `--composer-max-h`      | 240px (then internal scroll)         |
| Top bar height                     | `--top-bar-h`           | 48px                                 |
| Tool-call bar height (collapsed)   | `--tool-bar-h`          | 32px                                 |

### Message-list rhythm

- Vertical gap between messages: `--space-6` (24px).
- Padding inside assistant message (no bubble — flush): block padding `--space-3` (12px) vertical only; no horizontal box.
- User message bubble: `padding: var(--space-3) var(--space-4)`; right-aligned; max-width 80% of column; `border-radius: 18px` (Claude/ChatGPT both use ~18px pill-rounded for user, no bubble for assistant).
- Tool call bar bottom margin: `--space-1` (4px) — stacks tightly.

---

## 4. Inline tool-call UI — THE CENTERPIECE

This is the differentiator the user cited. All 6 surfaces ship the same anatomy. Below is the locked spec based on Claude's pattern (which all competitors converge toward).

### 4.1 Anatomy (top-to-bottom in DOM)

```
┌──────────────────────────────────────────────────────────────────┐
│ [icon 16px] {Action label}                            [chevron]  │  ← collapsed bar (32px tall)
│             {arg summary, muted, ellipsis}                       │
└──────────────────────────────────────────────────────────────────┘
   ┌────────────────────────────────────────────────────────┐
   │ Request                                                 │  ← expanded body
   │ {                                                       │
   │   "query": "filesystem list directory"                  │
   │ }                                                       │
   │                                                          │
   │ Response                                                 │
   │ Loaded 5 filesystem tools:                              │
   │ ...                                                      │
   └────────────────────────────────────────────────────────┘
```

### 4.2 Visual treatment — the decision

**We adopt the "borderless inline run-block" pattern (Claude's approach), NOT a bordered card.**

Reasoning across the 8 Claude chat samples + ChatGPT response panel + Gemini "show thinking":

- Claude uses **no border, no background fill** on the collapsed bar. It's a flush flex-row sitting at body text-size. The only visual affordances are the small leading icon (file-type or operation), the label text, and the chevron at the trailing edge.
- A subtle **1px vertical guideline** runs down the left of multi-step tool sequences, connecting them like a checklist (visible in Claude image #10 "Viewed a file, created a file, read a file" and image #07 "Ran 5 commands"). This is rendered via `border-left: 1px solid var(--border-subtle)` on the parent stack, with `padding-left: var(--space-3)`.
- On expand, the body sits inside a **bordered recessed surface** at `--bg-code` with `border-radius: 8px` and 16px internal padding. The body uses `--font-mono` at `--text-sm`.

This matches the user's stated preference ("inline tool calling… I like them so much") because Claude's treatment is what they're referring to.

### 4.3 Component tokens

```css
.tool-call {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  font: var(--text-base)/22px var(--font-sans);
  color: var(--text-secondary);
}

.tool-call__bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: var(--tool-bar-h); /* 32px */
  padding: 0 var(--space-1);
  cursor: pointer;
  user-select: none;
  border-radius: 6px;
  transition: background 120ms ease;
}
.tool-call__bar:hover {
  background: var(--bg-hover);
}

.tool-call__icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--text-muted);
  stroke-width: 1.75px; /* Lucide default — see §5 */
}

.tool-call__label {
  color: var(--text-secondary);
  font-weight: 400;
}

.tool-call__summary {
  color: var(--text-muted);
  font-size: var(--text-sm);
  margin-left: var(--space-2);
  max-width: 360px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-call__chevron {
  width: 14px;
  height: 14px;
  color: var(--text-muted);
  margin-left: auto;
  transition: transform 160ms ease;
}
.tool-call--open .tool-call__chevron {
  transform: rotate(90deg);
}

.tool-call__body {
  background: var(--bg-code);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: var(--space-4);
  font: var(--text-sm)/20px var(--font-mono);
  color: var(--text-primary);
  overflow-x: auto;
  max-height: 480px;
  overflow-y: auto;
}

/* multi-step sequence — vertical guideline */
.tool-call-stack {
  border-left: 1px solid var(--border-subtle);
  padding-left: var(--space-3);
  margin-left: var(--space-2);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
```

### 4.4 States

| State     | Icon treatment                        | Label suffix                        | Color              |
| --------- | ------------------------------------- | ----------------------------------- | ------------------ |
| `pending` | spinner 14px (CSS rotate, no library) | `…`                                 | `--text-muted`     |
| `running` | spinner 14px                          | "Running"                           | `--text-secondary` |
| `success` | filled icon, no badge needed          | (none — silent success is the norm) | `--text-secondary` |
| `error`   | icon turns `--state-danger`           | "Error: {short msg}"                | `--state-danger`   |
| `partial` | half-filled circle 14px               | "Partial — see body"                | `--state-warning`  |

Closing summary line (e.g. "Done" with a check) sits **below** the entire stack as a separate row, never as a final pill inside the last tool-call bar. This matches Claude's "✓ Done" terminator pattern.

### 4.5 Body treatment per tool type

| Tool                     | Body renderer                                                             | Notes                                                                                   |
| ------------------------ | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `bash` / shell           | `<pre>` mono, ANSI-color-aware, scrollable, no line numbers               | Match Codex CLI / Claude Code terminal idiom                                            |
| `read` / file-read       | Syntax-highlighted code block (`highlight.js` or Shiki), line numbers OFF | Show first 40 lines collapsed; "Show all" chip                                          |
| `write` / `edit`         | Unified diff (red/green), monospace                                       | Use `--state-danger` for `-` lines, `--state-success` for `+`                           |
| `web-search`             | List of results, each = `[favicon 16px] {Title} {domain}`                 | Match Claude pattern (image #06) — favicon at left, domain right-aligned `--text-muted` |
| `web-fetch`              | URL pill at top, content excerpt below                                    | URL pill = `--bg-hover`, mono, 11px                                                     |
| `fs-list` / list-dir     | Tree (├─ └─) in mono, or JSON if structured                               | Limit to 50 entries, "Show all" chip below                                              |
| `image-gen`              | Inline preview at 320×240 max, click to expand to artifact pane           | Caption = prompt, muted, below                                                          |
| `browser` (computer use) | Numbered step list + thumbnail filmstrip across top                       | Match Cowork pattern; thumbnails 80×60                                                  |
| `mcp-custom`             | JSON request → JSON response, both in mono code blocks                    | Identical to Claude image #03                                                           |

### 4.6 Iconography per tool type — **all from Lucide** (see §5)

| Tool                   | Lucide icon                                      | Rationale                   |
| ---------------------- | ------------------------------------------------ | --------------------------- |
| `bash` / shell         | `Terminal`                                       | Universal                   |
| `read`                 | `FileText`                                       | File-read                   |
| `write`                | `FilePlus2`                                      | New file                    |
| `edit` / patch         | `FilePen` (alias of `FileEdit`)                  | Modify                      |
| `web-search`           | `Search` (or `Globe` when the tool is web-fetch) | Match Claude's search-glyph |
| `web-fetch`            | `Globe`                                          | Distinguish from search     |
| `fs-list`              | `Folder` (or `FolderTree` if expanded)           |                             |
| `image-gen`            | `Image`                                          |                             |
| `browser`              | `MousePointerClick`                              | Computer-use idiom          |
| `mcp-custom`           | `Plug`                                           | "Plugged-in" tool           |
| `done` (terminator)    | `CircleCheck`                                    | Match Claude ✓              |
| `thinking` / reasoning | `Brain` (or `Sparkles` for "thinking longer")    |                             |
| `pending` spinner      | `Loader2` rotating                               | Lucide ships this           |

---

## 5. Iconography

### 5.1 Decision: **Lucide React** is the single icon library for all 6 surfaces.

Justification (grounded in web research + sample audit):

- **Stroke weight matches our visual register.** Lucide ships at 1.5–2px stroke; Claude and ChatGPT both use 1.5–1.75px-equivalent strokes. Phosphor at "regular" weight reads heavier; Heroicons "outline" is similar to Lucide but tied to the Tailwind UI license aesthetic.
- **Bundle cost.** Lucide tree-shakes per-icon at ~280 bytes gzipped each; Phosphor's runtime registry adds 16×–18× overhead in Turbopack benchmarks (PkgPulse 2026 / N. Croft Turbopack bench).
- **Ecosystem.** Lucide is the default in shadcn/ui — already adjacent to our existing UI primitives.
- **Cross-surface portability.** Lucide ships `lucide-react`, `lucide-react-native` (mobile), `@lucide/svelte`, raw SVG sprites (for Chrome extension content scripts), and ASCII / Unicode fallbacks via custom mapping for the CLI. No competitor offers this breadth.
- **Per-tool icon coverage.** Every entry in §4.6 exists in Lucide today; nothing in the inline-tool-call set requires a custom SVG.

### 5.2 Locked attributes

```ts
// All Lucide usage:
<Icon size={16} strokeWidth={1.75} />        // tool-call bar, inline
<Icon size={18} strokeWidth={1.75} />        // sidebar icons, button glyphs
<Icon size={20} strokeWidth={1.75} />        // top-bar controls, modal triggers
<Icon size={14} strokeWidth={2} />           // chevrons, micro-affordances
```

- Default **stroke-width = 1.75**. Lucide's stock is 2; we slim down for the Claude-adjacent feel.
- Fill style: **stroke-only, never filled** (except the closing `CircleCheck` and badge states).
- Color: always inherit from `currentColor`. Never hard-code icon color in JSX. Use `text-{tone}` Tailwind classes or CSS `color:` on the parent.

### 5.3 CLI/TUI fallback

CLI surfaces use a Unicode mapping registered once in `apps/cli/src/tui/icons.rs`. Pair each Lucide name with a single glyph the TUI renders. Examples below; the full table goes in code.

| Lucide        | Unicode glyph              | Fallback ASCII |
| ------------- | -------------------------- | -------------- |
| `Terminal`    | `❯` U+276F                 | `>`            |
| `FileText`    | `📄` U+1F4C4               | `[F]`          |
| `FilePen`     | `✎` U+270E                 | `[E]`          |
| `Search`      | `🔍` U+1F50D               | `?`            |
| `Globe`       | `🌐` U+1F310               | `@`            |
| `CircleCheck` | `✓` U+2713                 | `v`            |
| `Loader2`     | `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` braille cycle | `\|/-\` cycle  |

`NO_COLOR=1` or `TERM=dumb` → ASCII column.

---

## 6. Sidebar / conversation list

### 6.1 Default state — icon-only rail (48px)

Vertical stack from top:

| Slot                | Lucide icon                       | Purpose                    |
| ------------------- | --------------------------------- | -------------------------- |
| New chat            | `SquarePen`                       | Primary action             |
| Search              | `Search`                          | Cmd/Ctrl+K                 |
| Library / Customize | `LayoutGrid`                      |                            |
| Chats               | `MessageSquare`                   |                            |
| Projects            | `FolderOpen`                      |                            |
| Artifacts           | `Sparkles`                        | (optional, Claude pattern) |
| Code                | `Code`                            | (optional)                 |
| — flex spacer —     |                                   |                            |
| User avatar         | initials in `--bg-overlay` circle | Bottom                     |
| Settings            | `Settings`                        | Bottom                     |

Spacing: 8px gap, 12px top/bottom padding. Each icon button is 32×32 with a 6px hover background (`--bg-hover`).

### 6.2 Expanded state — 260px

Mouse-over the rail OR click the toggle = sidebar slides to 260px showing labels next to each icon. Below the nav rail, a `Recents` group lists conversation titles.

```css
.sidebar--expanded {
  width: var(--sidebar-expanded-w);
}
.sidebar__item {
  height: 32px;
  padding: 0 var(--space-3);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font: var(--text-sm)/20px var(--font-sans);
  color: var(--text-secondary);
  border-radius: 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sidebar__item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.sidebar__item--active {
  background: var(--bg-hover);
  color: var(--text-primary);
  font-weight: 500;
}
```

### 6.3 Conversation list item

- Height 32px. Single-line title, ellipsis-truncated at 220px.
- **No timestamp inline.** Matches Claude — they only show timestamps on hover-revealed kebab menus and inside `Chats` history view (which is a separate full-pane screen).
- Active item = `--bg-hover` background + primary text color.
- Right-side affordances (rename, delete) appear on hover via 14px `MoreHorizontal` chevron-trigger.

### 6.4 Free-plan / upgrade pill

Lives at the bottom of the expanded sidebar, above the user avatar row. Pill style: `--bg-overlay` background, `--text-secondary`, ~28px tall, `border-radius: 14px`. Text: `Free plan · Upgrade` (Upgrade as link). Identical to Claude image #01.

---

## 7. Composer (chat input)

### 7.1 Resting state

```
┌──────────────────────────────────────────────────────────────┐
│  Ask anything                                                 │  ← placeholder
│                                                                │
│  [+]  Custom ⌄    Medium ⌄                       🎙  ▲       │  ← controls row
└──────────────────────────────────────────────────────────────┘
```

Tokens:

```css
.composer {
  width: 100%;
  max-width: var(--composer-max-w);
  margin: 0 auto;
  background: var(--bg-raised);
  border: 1px solid var(--border-subtle);
  border-radius: 16px; /* matches Claude / ChatGPT — soft pill */
  padding: var(--space-3) var(--space-4) var(--space-2);
  box-shadow: 0 1px 0 rgba(26, 25, 21, 0.04); /* light only; dark = none */
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.composer__input {
  font: var(--text-base)/22px var(--font-sans);
  color: var(--text-primary);
  background: transparent;
  border: 0;
  outline: 0;
  resize: none;
  min-height: 28px;
  max-height: 200px;
}
.composer__input::placeholder {
  color: var(--text-placeholder);
}
.composer__controls {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.composer__send {
  margin-left: auto;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--accent-primary);
  color: #ffffff;
  display: grid;
  place-items: center;
}
.composer__send:disabled {
  background: var(--bg-hover);
  color: var(--text-muted);
}
```

### 7.2 Placeholder exemplars (rotate per surface, NEVER multi-line)

| Surface          | Placeholder                                                  |
| ---------------- | ------------------------------------------------------------ |
| Desktop          | `How can I help you today?` (Claude pattern)                 |
| Web              | `Ask anything` (ChatGPT pattern — shortest, highest density) |
| Mobile           | `Ask anything`                                               |
| CLI/TUI          | `>` then blinking cursor (no placeholder text)               |
| Chrome ext popup | `Ask about this page` (context-aware)                        |
| VS Code ext      | `Ask about your code…`                                       |

### 7.3 Focused state

- Border becomes `--border-strong`.
- Soft 2px ring at `--accent-primary` with 25% alpha (`box-shadow: 0 0 0 2px rgba(33,128,141,0.25)`).
- No layout shift — border is offset-aware (use `outline-offset` or pre-allocated padding).

### 7.4 Attachment / tool chips (above input)

When the user adds an image/file or activates a tool (e.g. "Plan mode"), chips appear in a row directly above the input, separated by `--space-1`:

```
┌─ chip ─┐ ┌─ chip ─────────┐
│ 📎 a.png │ │ 🗒 Plan mode  ✕ │
└────────┘ └────────────────┘
```

Chip: `background: var(--bg-hover)`, `border-radius: 999px`, padding `var(--space-1) var(--space-2)`, 12px Lucide icon + 12px text + 12px `X` close.

### 7.5 Bottom-row controls — left to right

1. **`+` plus button** (32×32, `Plus` icon) — opens the attachment/tool menu (Claude / Codex Desktop / ChatGPT / Perplexity all converge on this).
2. **Mode selector** (text + chevron) — e.g. `Custom ⌄`, or model variant.
3. **Reasoning / speed toggle** (text + chevron) — `Medium ⌄`, `Thinking ⌄`, `Fast`.
4. **Tool pills** (optional) — `🌐 Web`, `🧠 Plan` rendered as togglable pill buttons.
5. **Flex spacer.**
6. **Mic** (`Mic` 18px, ghost button) — appears on Desktop, Web, Mobile.
7. **Send** (`ArrowUp` inside the round `--accent-primary` button) — replaced by `Square` "stop" icon when streaming.

### 7.6 Plus-menu (opens upward from `+`)

Sections, top-to-bottom (Claude / Codex Desktop / Perplexity superset):

1. Add photos & files (`Paperclip`)
2. Add from cloud → submenu (Drive / Photos / iCloud) (`Cloud`)
3. Use skills → submenu (`Sparkles`)
4. Connectors → submenu (`Plug`)
5. Plan mode toggle (inline switch)

Width 280px, `border-radius: 12px`, `background: var(--bg-overlay)`, `border: 1px solid var(--border-strong)`, `box-shadow: 0 8px 24px rgba(0,0,0,0.12)` (light) / `rgba(0,0,0,0.5)` (dark).

### 7.7 Send affordance

- Click the round send button OR press **Cmd+Enter** (Mac) / **Ctrl+Enter** (Win) to send. **Enter alone inserts a newline.** This matches Claude / ChatGPT / Codex Desktop. We deliberately diverge from "Enter sends" because power users type multi-line prompts.
- Mobile: tap to send; no keyboard shortcut.

---

## 8. Empty state / default landing

**User mandate: NO onboarding suggestions. No multi-step wizards. Users dig directly into work.**

### 8.1 Layout

Vertically centered in the message-list region:

1. **Plan pill** (`Free plan · Upgrade`) — only if non-paying; muted, top of stack.
2. **Display headline** — single line of `--text-2xl` in `--font-display` serif, optionally preceded by an 18px accent glyph (Claude renders a terracotta starburst). Examples:
   - Desktop: `✸ Golden hour thinking` (Claude pattern)
   - Codex Desktop: `Let's build agiworkforce` (project-aware)
   - Web: `What can I help with?` (ChatGPT-ish, generic)
   - Mobile: `Ask anything`
3. **Composer** — full width minus 32px each side, max 760px, focused on mount (cursor in input).
4. **Sample prompt chips row** — 3–5 chips below the composer, horizontal, scrollable on overflow.

### 8.2 Sample prompt chips — pattern, NOT onboarding

These are stateless one-tap shortcuts (not a wizard). Tap = prefill composer with the chip's text and focus.

```css
.prompt-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: 34px;
  padding: 0 var(--space-3);
  border: 1px solid var(--border-subtle);
  border-radius: 999px;
  background: var(--bg-raised);
  color: var(--text-secondary);
  font: var(--text-sm)/20px var(--font-sans);
  cursor: pointer;
}
.prompt-chip:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.prompt-chip__icon {
  width: 14px;
  height: 14px;
}
```

Exemplars (≤5):

- `</> Code`
- `✎ Write`
- `🎓 Learn`
- `▲ From Drive` (only when connector is enabled)
- `M From Gmail` (only when connector is enabled)

If connectors are not configured, show only the first three. NEVER stage a "set up connectors" CTA in the empty state — that lives under Settings only.

### 8.3 What we explicitly do NOT render

- ❌ Multi-step onboarding wizard
- ❌ "Welcome to AGI Workforce" splash card
- ❌ Tip-of-the-day banner
- ❌ Tour overlays / coachmark popups
- ❌ "Try one of these prompts" labeled section header (just the chips, no header label)

---

## 9. Top bar / chrome

### 9.1 Anatomy

```
┌──────┬─────────────────────────────────────────────────┬──────────────┐
│  ▢   │  {breadcrumb / thread title}              ⌕    │  share  …   │
└──────┴─────────────────────────────────────────────────┴──────────────┘
```

- Height 48px.
- **Left:** sidebar-toggle (`PanelLeft`), back/forward (`ChevronLeft` / `ChevronRight`) — only on Desktop.
- **Center:** current thread title; chevron-trigger opens a quick rename + history-of-this-thread modal. On empty state, the title is just `New thread` (Codex) or invisible (Claude on empty).
- **Right:** download/export (`Download`), share (`Share`), kebab (`MoreHorizontal`).

### 9.2 Model picker — **NOT in the top bar**

Per the cross-competitor pattern (item #5 in §0), the model picker lives **inside the composer**, not the top bar. The top bar carries only chrome controls. The model picker is a chevron-text trigger in the composer bottom row (`Sonnet 4.6 Extended ⌄`).

### 9.3 Cmd-K / model switching

- **Cmd/Ctrl+K** opens a global command palette (model switch, search, jump-to-thread).
- The palette is a modal at center-top, ~640px wide, with a single text input and a list below.
- **Switching the model mid-conversation** updates a small inline marker in the chat stream: `Model changed to GPT-5.4`. Matches Codex CLI image #15 ("Model changed" confirmation banner).

---

## 10. Cross-surface adaptation

| Pattern                        | Desktop                                  | Web                          | Mobile                                                    | CLI/TUI                                                                               | Chrome ext                                         | VS Code ext                                            |
| ------------------------------ | ---------------------------------------- | ---------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------ |
| **§1 Palette**                 | full                                     | full                         | full (`agiNativeColors`)                                  | ANSI palette mapping (256-color)                                                      | full (`agiExtensionCssVars`)                       | inherit from VS Code, override with `agiVsCodeCssVars` |
| **§2 Typography**              | Inter + IBM Plex Serif + JetBrains Mono  | same                         | clamps body to 15px floor                                 | terminal font only — surface fonts irrelevant                                         | system stack                                       | inherit `--vscode-font-family`                         |
| **§3 Spacing**                 | full 8-step                              | full                         | tighter — sidebar collapses by default, no expanded 260px | char-cell based; map 4px → 1ch                                                        | full                                               | full                                                   |
| **§4 Inline tool-call UI**     | full collapsible bar + recessed body     | full                         | full (collapsed by default; tap to expand bottom-sheet)   | text-only run-block with Unicode glyphs from §5.3; expand = open pager                | full (in popup chat view)                          | full (chat participant rendering)                      |
| **§4.6 Tool icons**            | Lucide                                   | Lucide                       | Lucide React Native                                       | Unicode mapping in `tui/icons.rs`                                                     | Lucide static SVGs (no React)                      | Lucide                                                 |
| **§5 Iconography**             | `lucide-react` size 16/18/20 stroke 1.75 | same                         | `lucide-react-native`                                     | Unicode + ASCII fallback                                                              | `lucide` raw SVG imports                           | `lucide-react`                                         |
| **§6 Sidebar**                 | 48 → 260 rail                            | 48 → 260 (hidden < 768px)    | drawer (full-width slide-in)                              | n/a (status bar instead)                                                              | n/a                                                | n/a (uses VS Code's view container)                    |
| **§7 Composer**                | full                                     | full                         | sticky bottom, safe-area aware                            | single-line prompt with `>` prefix                                                    | full inside popup                                  | full inside chat panel                                 |
| **§7.7 Send shortcut**         | Cmd+Enter                                | Cmd+Enter (Mac) / Ctrl+Enter | Tap                                                       | Enter sends (CLI is single-line)                                                      | Cmd+Enter                                          | Cmd+Enter                                              |
| **§8 Empty state**             | full                                     | full                         | full                                                      | banner + prompt (no chips)                                                            | composer only — no chips, ext is space-constrained | composer + 3 chips                                     |
| **§9 Top bar**                 | full                                     | full                         | replaced by mobile header (back arrow + title + kebab)    | status line at bottom (Gemini CLI pattern: workspace, branch, model, context, memory) | no top bar                                         | use VS Code title bar                                  |
| **§9.2 Model picker location** | composer                                 | composer                     | composer                                                  | `/model` slash command                                                                | composer                                           | composer                                               |

### Surface-specific overrides

**Mobile:**

- Sidebar collapses 100% by default; entered via hamburger.
- Tool-call expanded body opens as a **bottom-sheet** modal (90% height), not inline, because inline blows up the message list.
- Send button is bigger: 44×44 (Apple HIG minimum).

**CLI/TUI:**

- All Lucide icons map to single-glyph Unicode (§5.3 table). With `NO_COLOR=1` the ASCII column.
- Tool-call bar = `  {glyph} {label}  ` with optional `▾` chevron when expandable.
- Expand = open a `less`-like pager over the body content.
- Status line at bottom matches Gemini CLI pattern (image #16): `workspace · branch · sandbox · /model · context · memory`.

**Chrome extension:**

- Popup width 384px. Sidebar omitted entirely. Composer only.
- Tool-call icons rendered as inline SVG (no React deps) — fetched from `lucide` raw SVGs at build time.

**VS Code extension:**

- Uses `var(--vscode-*)` token bridge from `agiVsCodeCssVars`.
- Composer is the chat panel input — model picker still inside composer.
- Tool-call body uses VS Code's syntax highlight via `vscode.languages.getDiagnostics` adapter (we already have this wired in `apps/extension-vscode`).

---

## 11. Implementation checklist (for the 6 surface owners)

- [ ] **All surfaces:** install `lucide-react` (or platform variant). Set default `size={18} strokeWidth={1.75}`.
- [ ] **All surfaces:** wire `--bg-base/raised/sidebar/hover/code/overlay/text-primary/secondary/muted/border-subtle/border-strong/accent-primary/accent-secondary/state-*` from `agiPalette`. No inline color values in new code.
- [ ] **All surfaces:** font stack `Inter / IBM Plex Serif / JetBrains Mono`. Add Google Fonts import (or local `.woff2`) only on Desktop+Web; Mobile uses system stack already.
- [ ] **Desktop:** swap `ToolCallBlock` (currently in `packages/chat/src/components/`) to the bar+body anatomy in §4. Remove any existing "card with border" treatment.
- [ ] **Web:** match Desktop component byte-for-byte via `packages/chat` shared component.
- [ ] **Mobile:** port the same component using `lucide-react-native`; expand-handler → bottom-sheet (use `@gorhom/bottom-sheet` already in mobile deps).
- [ ] **CLI:** add `tui/icons.rs` Unicode/ASCII mapping. Wire it into the existing `update_plan` and tool-event renderers.
- [ ] **Chrome ext:** import 12 inline SVGs (the §4.6 tool set) at build time. No runtime Lucide React.
- [ ] **VS Code ext:** ensure chat participant renders the new bar anatomy — replace any existing "fenced code block summary" pattern.
- [ ] **All surfaces:** the empty state ships with NO multi-step wizard. Delete any existing welcome / tour overlay flows. Composer focused on mount, 3 stateless prompt chips below (or fewer if connectors are not configured).
- [ ] **All surfaces:** send shortcut = Cmd/Ctrl+Enter. Enter = newline. Update existing handlers.
- [ ] **All surfaces:** model picker INSIDE composer, not top bar. Top bar carries chrome only.

---

## 12. Open questions parked for follow-up

- **Artifact pane** (Claude image #12 / #16) is out of scope for this spec. When we add an artifact viewer, it inherits this palette / typography / icon stack — but the split-pane mechanics are a separate spec.
- **Computer-use / browser tool** (Cowork parity) needs its own deeper sub-spec for the numbered-step UI + thumbnail filmstrip. §4.5 line for `browser` is provisional.
- **Skills / connectors directory** (Claude image #21–#34) — also out of scope; reuses the prompt-chip primitive in §8.2 but the gallery layout is its own spec.

---

**End of spec.** Engineers: §4 (inline tool call) and §5 (icons) are mandatory for the launch wave. Everything else converges naturally from §1–§3 tokens, which are already shipped in `packages/design-tokens`.
