# Frontend Parity Round 1 — Shared Schema

All teammates output reports using this taxonomy so cross-tabulation is mechanical.

## What we're extracting (in scope)

- **Feature presence**: does the surface have a model picker, voice recording, artifact sidebar, etc.
- **Layout/IA patterns**: where things sit (left sidebar, bottom composer, right artifact panel) and how they nest
- **Interaction affordances**: what menus open from where, what slash commands exist, what keyboard shortcuts are shown
- **Information density**: how much fits in a screen, what's primary vs secondary
- **Component inventory**: what UI primitives the competitor uses (cards, dropdowns, modals, popovers, chips, sliders)

## What we are NOT extracting (out of scope)

- Verbatim copy text — we write our own product copy
- Logo/brand visual reproduction — we use AGI Workforce branding
- Specific illustrative assets — we use our own icon system (Lucide) and our own illustrations
- Pixel-exact color values — we use our design tokens (`packages/design-tokens`, teal `#21808d` + terracotta `#da7756`)
- Exact typography stacks — we use our system fonts

The goal is a **functional + structural parity checklist** the engineering team can use to identify gaps. The implementation will use our brand and copy.

## Component taxonomy (use these section headers verbatim)

### 1. APP SHELL

Sidebar (collapsed/expanded states, sections, footer placement), top bar, tab/window chrome, multi-window support, popout/mini mode.

### 2. ONBOARDING / AUTH

Splash, sign-in options (OAuth vs API key vs device flow), browser fallback, post-signin permissions overview, mode/profile selection.

### 3. EMPTY STATE

Hero copy framing (productivity-first vs coding-first), suggested prompts/quick-actions, model badge placement, illustration use.

### 4. COMPOSER

Text input affordances, attachment menu contents (file/photo/screenshot/cloud-drives/notebooks), model picker placement + contents, tools/mode menu (search/agent/canvas/deep-research/plan-mode), voice (push-to-talk vs recording lifecycle with pause/resume/upload), send/stop/cancel button states, slash command palette, @ mentions, citations toggle.

### 5. CHAT / MESSAGES

User message rendering, assistant message rendering, thinking/reasoning blocks (collapsed vs expanded with clock icons/duration), inline tool-use rendering (status chips, expandable JSON request/response), inline web search results with favicons, citations/sources, attachments inline, copy/rate/regenerate/branch actions, scroll-to-bottom FAB, comparison A/B layout.

### 6. ARTIFACTS / SIDEBAR

Sidebar viewer split-pane vs popout, tabs (preview/source/data), toolbar (copy/refresh/print/download/close), artifact types (HTML/MD/PDF/code/image/spreadsheet), multi-artifact cards with "Download all", dark-mode previews.

### 7. PROJECTS / SPACES

Gallery grid view, detail view tabs (Chats / Sources / Knowledge), create modal with presets, sidebar Projects section, project-level system prompt.

### 8. CONNECTORS / TOOLS / SKILLS

Directory/gallery grid, detail view with per-permission toggles, OAuth grant modal, skills library categorized (legal/marketing/data/etc.), inline slash-command for installed skills, plugin/connector toggles in sidebar submenu.

### 9. SETTINGS

Left-nav structure, sections present: General / Account / Appearance / Privacy / Billing / Usage / Capabilities / Connectors / Personalization / Shortcuts / Notifications / MCP-Servers / Developer / Extensions / Archived / Worktrees / Environments / Git.

### 10. PROFILE / USER POPOVER

Account info row, plan/tier badge, Upgrade CTA, Settings link, Log out, Zoom/font controls.

### 11. MODEL / MODE FEATURES

Reasoning effort selector (low/med/high), Plan mode toggle, Quick mode modal, Auto vs manual model selection UX, region/routing toggles (US-only), per-mode model changed banner.

### 12. PRICING / UPGRADE

Inline paywall card, plans modal comparison, individual vs team/enterprise tabs, usage-limit warning banners, credit balance + auto-refill, "weekly limit" countdown.

### 13. ADMIN / ENTERPRISE

Team admin console, audit log, SSO setup, seat management, organization-wide model availability.

### 14. MOBILE / COMPACT MODE

Popout mini-window patterns, narrow-width composer collapse, mobile-specific chat patterns (bottom-sheet model picker, full-screen modals, edge-swipe navigation).

### 15. AGENTIC / COMPUTER USE

Approval prompts (Ask vs Act), status bar with current action, action log/replay, sandbox/permissions mode cycle (e.g., shift-tab), bypass-permissions warning banners.

### 16. BROWSER EXTENSION UX

Sidebar empty state, model + permission selectors, attachment menu, more-options menu, quick mode modal, in-page floating panel (e.g., YouTube summarize), browser-control assistant patterns.

### 17. VSCODE EXTENSION UX

Sidebar chat empty state, modes dropdown + effort slider, actions menu, "Add context" menu, settings editor view, full-screen chat in editor, sessions history dropdown, marketplace detail page.

### 18. CLI / TUI UX

Status bar (workspace/branch/model/sandbox), slash command pages, model + reasoning selectors, theme selector, sandbox/yolo/folder-trust modes, splash + update-available banners, weekly limit warnings, post-signin permissions overview.

---

## Report format — REFERENCE ANALYSTS

File path: `reports/frontend-parity-r1/refs/<analyst-name>.md`

```markdown
# <Analyst name>

**Image set covered**: <list of folders + image counts>
**Total images read**: <N>

## Mislabel report

Filename → suggested rename → reason

- `<old>.png` → `<new>.png` — content was X, filename said Y
- (or "none found")

## Per-competitor pattern inventory

For each competitor in scope, fill out only the taxonomy sections where there's signal in the images you read.

### <competitor name>

#### 1. APP SHELL

- <bullet of pattern>
- <bullet>

#### 4. COMPOSER

- <bullet>
  ...

(skip sections with no signal)

## Standout patterns worth copying

Top 5-10 patterns from this image set that AGI Workforce should have. One line each, prioritized.

1. <pattern> — observed in `<file>`, useful for our <surface>
2. ...

## Anti-patterns or design choices to avoid

Top 3-5 things this competitor does that we should NOT copy. One line each, reason.

1. <thing> — why not
```

## Report format — SURFACE ENGINEERS

File path: `reports/frontend-parity-r1/surfaces/<surface>.md`

```markdown
# <surface> current state

**Frontend tree root**: <path>
**Approximate component count / file count**: <N>

## Per-category inventory

For every taxonomy section 1-18, write either:

- "HAS: <bullet list of what we have>"
- "PARTIAL: <bullet list of what we have + what's clearly half-built>"
- "MISSING: <one line>"
- "N/A: <one line>" (only if the category doesn't apply to this surface, e.g. "ADMIN/ENTERPRISE" on CLI)

#### 1. APP SHELL

HAS: ...

#### 4. COMPOSER

PARTIAL: ...

...

## Component reuse opportunities

Which packages/shared components we use for chat (e.g., `packages/unified-chat`, `packages/chat`, design tokens, Lucide icons). Note any one-off implementations that should be migrated to shared packages.

## Known gaps the surface owner already knows about

Top 5 gaps the surface engineer knows about (from CLAUDE.md, MEMORY, prior audits). One line each.
```

## Cross-check before writing

Before claiming "missing", grep the surface's tree for related identifiers. Examples:

- "MISSING voice composer" — first run `grep -ri "voice\|whisper\|microphone\|push.?to.?talk" apps/<surface>/`
- "MISSING artifact sidebar" — first run `grep -ri "artifact\|ArtifactPanel\|sidebar" apps/<surface>/`

False-negatives waste the synthesis step.
