# claude.ai Component Spec — 2026-07-10

Status: Reference for rebuilding AGI Workforce web UI to match claude.ai component-for-component.
Sources: (A) `/Users/siddhartha/Desktop/reference/claude_reference/` — 128 screenshots, no INDEX.md/manifest present, filenames used as citations below. (B) Live claude.ai crawl via Chrome MCP, signed in as Siddhartha Nagula (Max plan), 2026-07-10, tab `claude.ai/chat/ef86542d-5d88-415b-a68e-2e56a51d0ee5`.

**Contamination warning**: several source-A screenshots (`030_web-free__artifact-result.png`, `031_web-free__artifact-widget-interacted.png`, `391_artifacts__artifact-editor-html-code-source-view.png`, `393-394_artifacts__artifact-sidebar-markdown-*.png`, `399_artifacts__artifact-viewer-tabbed-content-with-print-button.png`) show a Chromium browser with an "Ask Gemini" button in the tab-strip corner and artifact cards carrying "Open in Comet" / "Open in Antigravity" pills. That is the **Perplexity Comet browser's own injected UI** overlaid on a genuine claude.ai page (URL bar confirms `claude.ai/chat/...`). Do not copy "Open in Comet"/"Open in Antigravity" pills or the "Ask Gemini" corner button — those are not claude.ai UI. Everything else in those screenshots (artifact panel chrome: eye/code toggle, title + type label, Copy/Publish, refresh, close) is real and consistent with the live crawl.

---

## 1. Composer

Live crawl, `claude.ai/new`, empty state.

**Layout (top to bottom):**

- Greeting heading: 🌟 emoji + "Up late, {first + last name}?" (time-of-day-aware greeting), serif italic-mixed display font, centered, ~40px.
- Input box: rounded rect, dark surface, single-line placeholder "How can I help you today?" that expands as text wraps.
- Toolbar row (inside the box, below the text area):
  - Left: `+` button (opens attachment/plus-menu, see §1.1) — 32px circular hit target.
  - Then a segmented pill toggle: **Chat** | **Cowork** (Chat active by default, dark-filled pill on the selected side).
  - Right-aligned: model picker "**{Model name}** {Effort tier}" with chevron (e.g. "Fable 5 Max ⌄") — see §1.2.
  - Mic icon (dictation).
  - Waveform/audio icon (voice mode) — rightmost.
- Below the box (only on the empty-state/home screen, not mid-chat): a row of quick-start chips — **Code**, **Write**, **Learn**, **Life stuff**, **Claude's choice** — each a pill with a small icon, horizontally scrollable.

Sidebar recents list below composer is unaffected by composer state.

### 1.1 Plus-menu (`+` button)

Opens upward when composer is near the bottom of the viewport, downward on the empty-state screen. Order, confirmed live:

1. **Add files or photos** — paperclip icon, right-aligned shortcut `⌘U`
2. **Take a screenshot** — camera icon
3. **Add to project** — folder icon, chevron (submenu)
4. **Add from GitHub** — GitHub mark icon, no chevron (opens a modal directly, see below)
5. — divider —
6. **Skills** — grid icon, chevron (submenu, §1.1.1)
7. **Connectors** — plug/grid icon, chevron (submenu, §1.1.2); carries an amber warning badge with a count (e.g. "⚠ 1") when a connected service needs attention
8. **Plugins** — puzzle-piece icon, chevron (submenu)
9. — divider —
10. **Research** — magnifying-glass-with-sparkle icon, no submenu (toggle-style action)
11. **Web search** — globe icon, right-aligned blue checkmark when enabled (this is a persistent toggle, not a one-shot action — it stayed checked across menu opens)

**"Add from GitHub"** opens a centered modal: title "Add content from GitHub", subtitle "Pick a repository and branch to link in this chat", a "Select a repository ⌄" dropdown with GitHub mark + a link/chain icon beside it, and helper copy: "Pick a repository and branch — Claude reads it through the GitHub connector when it needs it. Nothing is downloaded now, and sending is never blocked."

#### 1.1.1 Skills flyout

Right-opening flyout listing the user's configured skills, each with a small document-with-corner icon: `algorithmic-art`, `brand-guidelines`, `canvas-design`, `doc-coauthoring`, `humanizer`, `internal-comms`, `mcp-builder`, `skill-creator`, `slack-gif-creator` (partially visible), then a divider, then **Manage skills** (briefcase icon) and **Browse skills** (`+` icon).

#### 1.1.2 Connectors flyout

Right-opening flyout: **Add connector** (chevron submenu), **Manage connectors**, a divider, then each connected service as a row with a **toggle switch** on the right (Indeed off, Tsenta on, Vercel on) or a **warning triangle** in place of the toggle when the connector needs re-auth (Gmail), then **Add from Vercel** (chevron submenu, Vercel-specific content shortcut), then a divider and **Tool access** (chevron submenu).

### 1.2 Model picker

Trigger: `{Model} {Effort} ⌄` at composer right. Dropdown, bottom-anchored, opens upward:

- **Fable 5** — badge "Included until July 12" (usage-window chip), subtitle "For your toughest challenges", blue checkmark (current selection)
- **Opus 4.8** — subtitle "For complex tasks"
- **Sonnet 5** — subtitle "Most efficient for everyday tasks"
- **Haiku 4.5** — subtitle "Fastest for quick answers"
- — divider —
- **Effort** row — shows current value ("Max") right-aligned, chevron opens a second flyout (below)
- **More models** row — chevron opens a second flyout (below)

**Effort flyout** (opens to the right of "Effort"): helper line "Higher effort means more thorough responses, but takes longer and uses your limits faster." then radio-style rows **Low, Medium, High** (badge "Default"), **Extra, Max** (checked, has an ⓘ info glyph next to it).

**More models flyout** (opens to the right of "More models"): legacy/other models — **Opus 4.7, Opus 4.6, Opus 3, Sonnet 4.6** — no subtitles, flat list.

Model IDs visible live do not match `packages/types/src/models.json` naming 1:1 — treat "Fable 5 / Opus 4.8 / Sonnet 5 / Haiku 4.5" as the current claude.ai-displayed names as of 2026-07-10, re-verify against the models JSON before hardcoding anywhere in our app.

---

## 2. Artifact viewer — full anatomy

This is the priority component. Confirmed against a live-generated artifact (`claude.ai/chat/ef86542d-5d88-415b-a68e-2e56a41d0ee5`, "Counter" HTML artifact) plus source-A images `094`, `095`, `388`, `396`, `399`, `378-401` (artifacts set).

### 2.1 Trigger / layout

- Artifact panel opens as a **right-hand split pane**, roughly 40–45% of viewport width, full height, dark surface distinct from (slightly lighter/darker than) the chat pane.
- The chat pane compresses to the left ~55–60%; both panes scroll independently.
- Panel opening is not always a side-pane: very small/simple artifacts (e.g. a tiny checklist widget) can render **inline in the chat flow** without ever opening the side panel — confirmed in `030_web-free__artifact-result.png` / `031_web-free__artifact-widget-interacted.png` (task-tracker checklist rendered directly under the assistant message, fully interactive: tapping a checkbox live-updates a "X of 3 done" counter and a progress bar / percentage, with a "..." overflow menu appearing top-right once interacted with). Note: those two images also carry the Comet-browser contamination noted above — the artifact-panel absence in them is a genuine claude.ai inline-widget behavior, not a browser-injected one.

### 2.2 Header (confirmed live, pixel-inspected)

Left to right:

1. **Eye icon** (preview/render view) — pill-grouped with #2, active state has a filled/highlighted background
2. **`</>` code icon** (source view) — same pill group, click toggles between rendered preview and syntax-highlighted source
3. Artifact **title** (e.g. "Counter"), regular weight
4. **`· {TYPE}`** label in muted color immediately after title (e.g. "· HTML", "· MD", "· PDF") — this is the artifact's file type, not a tab
5. _(spacer, artifact-type-dependent middle content: for tabbed content per `399`, additional tab strip appears here)_
6. Right-aligned: **Copy** button (solid, rounded) with an attached **chevron** that opens a small dropdown: "Download as Markdown" / "Download as PDF" (options vary by artifact type — for HTML/code artifacts this is a plain Copy with no dropdown per the live crawl; the dropdown appeared specifically on a Markdown-type document artifact, `095_web-max__artifact-copy-export-menu.png`)
7. **Refresh/redo** icon (circular arrow) — re-runs/reloads the artifact preview
8. **Expand/fullscreen** icon (diagonal double-arrow) — maximizes the panel
9. **Close** icon (X)

For long-form **document** artifacts (Markdown/research reports, `094`/`096`), the header instead shows: Copy (with the Markdown/PDF dropdown) + a solid black **Publish** button + close X — no eye/code toggle, no refresh/expand (these are single-view documents, not renderable code).

For **PDF** artifacts (`396`), header shows: title + "· PDF" only, right side has a plain **download** icon, **refresh** icon, and close X — no Copy/Publish.

### 2.3 Body

- **Preview mode**: renders the artifact live (HTML/React canvas, rendered Markdown, PDF page image, etc.), centered, with generous padding and its own scroll.
- **Code/source mode**: monospace editor-style view, line numbers left gutter, syntax highlighting (keys/strings/tags colored), no visible line-wrap toggle observed, matches a code-editor read-only pane (`391`, live crawl code view).
- **Split-pane document view** (`094`): for research/report-type Markdown artifacts, a left rail table-of-contents can co-exist inside the artifact pane itself, separate from the chat-vs-artifact split — i.e. a nested TOC sidebar for long docs.
- **Tabbed content** (`399`): some HTML artifacts present their own internal tab bar with labeled sections plus a floating **Print** button pinned bottom-right of the artifact body (page/report-style artifacts only).

### 2.4 In-chat artifact card (before/after opening the panel)

Below the assistant's prose, a card row per artifact:

- Small icon tile (document or `</>` glyph depending on type) on a dark rounded-square background
- Title (e.g. "Counter") + `{Kind} · {TYPE}` subtitle (e.g. "Code · HTML", "Document · MD", "Document · PDF")
- Right-aligned action button: **Download** (single artifact) — confirmed live. When a message contains **multiple artifacts**, source-A `392` shows each gets its own card and a single **Download all** button appears below the stack instead of per-card downloads only.

### 2.5 States/behaviors observed

- Generating: card area shows a live-streaming code/text preview scrollable box before the artifact is "Done" (`030`/live crawl "Working" → code streams inline → panel auto-opens on completion).
- Claude reads a **frontend-design skill** automatically before producing any HTML artifact — visible as a tool-step line "Required first step: reading the frontend-design skill before creating an HTML artifact" in the reasoning trace (live crawl). This is a real backend behavior, not UI chrome, but explains why HTML artifacts consistently look designed (custom fonts, CSS variables, card layouts) rather than default browser styling.
- Artifact edits by the user prompt a **re-render in place**; the refresh icon re-mounts the same code without a new network round trip when possible.

---

## 3. Message rendering + hover actions

### 3.1 User message

- Right-aligned (in the live product; note some source-A shots show it left-aligned full-width — that's the older/2026-03 layout, superseded), dark rounded bubble, max-width constrained.
- **On hover**, a small toolbar appears above-right of the bubble: timestamp (e.g. "1:06 AM"), **retry/regenerate** icon, **edit** (pencil) icon, **copy** icon — left to right, muted-gray, no background chip until hovered individually.
- Pasted long text collapses into a **"PASTED"** chip card with a text preview (first ~5 lines, faded gradient at bottom) — confirmed in `389`.

### 3.2 Assistant message

- Left-aligned, no bubble background (plain text on the pane background), serif-mixed body typography for prose.
- Below the response, a persistent (not hover-only) action row: **copy** (stacked-rectangles icon), **read-aloud** (speaker icon), **thumbs up**, **thumbs down**, **retry/regenerate** (circular arrow) — confirmed live, 5 icons, muted gray, left-aligned under the response.
- A collapsible **reasoning/tool-trace summary line** sits above the final answer, muted color, e.g. "Viewed a file, created a file, read a file" or "Used Filesystem integration, loaded tools ⌄" — clicking/it being expanded reveals the full step list (§3.3).

### 3.3 Tool-call / reasoning trace (expanded)

Each step is a row: small **glyph** (search/magnifying-glass for search steps, `F` badge for file-tool calls, terminal `>_` icon for scripts, clock icon for "thinking"/reasoning steps, chat-bubble icon for "relevant chats" memory lookups, globe icon for web search, PDF icon for document reads) + step label (e.g. "Loading tools", "List Directory", "Reading the uploaded resume PDF - already in context").

- Each step can expand to a nested **Request / Response** panel showing raw JSON-ish payloads in monospace on a slightly darker inset card (`379`).
- Web-search steps show a **results list** with favicon + domain + title per result, and a "N results" counter top-right of the group (`035` reference, `381`).
- A trailing **"Done" / checkmark** row closes out the trace group.
- "Relevant chats" steps (memory retrieval across past conversations) render as a bordered card listing chat titles with a small speech-bubble icon each, and an "N results" counter (`384`).
- A floating **↓ scroll-to-bottom** circular button appears mid-conversation when the user has scrolled up (`380`), centered horizontally, semi-transparent dark circle with a down-chevron.

### 3.4 Code blocks (in prose, not artifacts)

Not separately confirmed live in this pass — treat as unknown/needs a follow-up check; the artifact code view (§2.3) is the closest confirmed analog (line numbers + syntax highlight, monospace).

---

## 4. Sidebar (live crawl, confirmed pixel-accurate)

Top to bottom, fixed left rail (~296px wide):

1. **"Claude" wordmark** (serif logotype) + a sidebar-collapse icon (two-rectangle toggle) + search icon (magnifying glass, opens Cmd+K, §5), all in one header row.
2. **Home | Code** — two-tab segmented control, "Home" active by default, "Code" has a small `</>` icon prefix.
3. **+ New** — full-width row, `+` icon, opens a fresh chat.
4. Nav list (each a full-width row with icon + label, no counts/badges observed):
   - **Chats and tasks** — speech-bubble icon
   - **Projects** — folder/briefcase icon
   - **Artifacts** — a stacked/layered-shapes icon (distinct from the plus-menu's document icon)
   - **Scheduled** — clock icon
   - **Customize** — a briefcase-like icon (this is the container for Skills/Connectors/Plugins management, matches the Settings modal's "Customize" section, §6)
5. **"Recents"** section header with a small sort/filter icon at the right edge, then a flat list of recent chat titles (single line, truncated, no timestamps or icons per row in the collapsed list).
6. A pinned **project entry** can appear below Recents as its own un-headered row (observed: "Design") — likely a pinned/starred project shortcut, not a nav item.
7. **Account chip**, bottom-left, sticky: avatar circle with initials (e.g. "SN"), name ("Siddhartha Nagula"), plan tag ("· Max"), chevron, and a small download-arrow icon at the far right edge of the rail (likely "download desktop app" or export shortcut — not confirmed by click in this pass).

### 4.1 Account chip menu (confirmed live)

Opens upward from the chip:

- Header: user's email (muted, non-interactive)
- **Settings** — gear icon, right-aligned shortcut `⇧⌘,`
- **Language** — globe icon, chevron submenu
- **Get help** — question-mark icon
- — divider —
- **View all plans** — checklist icon
- **Get apps and extensions** — download icon
- **Gift Claude** — gift-box icon
- **Learn more** — info icon, chevron submenu
- — divider —
- **Log out**

---

## 5. Global search (Cmd+K) / Settings modal shell

Triggered from the sidebar search icon. Renders as a **centered modal**, ~985px wide, dark surface with a lighter-inset content pane on the right:

- Left column (~200px): a search input at top, then **"Settings"** section header with rows **General** (gear, active/highlighted by default), **Account** (person), **Privacy** (shield), **Billing** (card), **Usage** (bar-chart), **Capabilities** (briefcase), **Claude Code** (`</>`), **Cowork** (checklist), **Claude in Chrome** (globe); then a **"Customize"** section header with **Skills** (doc-corner icon), **Connectors** (plug/grid icon), **Plugins** (puzzle icon).
- Right column: content pane for the selected section (not captured in detail this pass — General pane was still loading/spinner at capture time). Close via X top-right of the whole modal.
- This same modal is reachable both from the account-chip "Settings" item and (per the URL that resulted, `#settings/general`) is hash-routed, meaning it's linkable/deep-linkable state, not a one-off overlay.

---

## 6. Projects, Plugins, Connectors — reference-image findings (not re-verified live)

- **Connector detail pages** (`164-175`, `249-256`): a permission-scoped detail view per connector — icon, name, a colored risk/permission chip ("Ask" vs "Act" toggle per `341`), a list of granted tool-permissions with individual toggles, and an OAuth grant-access modal for first-time connection (`174`) styled as a centered card with the third-party's logo, scope list, and Allow/Cancel buttons.
- **Plugin directory / marketplace** (`253`, `203-206`): grid of plugin cards (icon, name, short description, install/manage state), with a per-plugin detail drawer showing bundled Skills + Connectors it registers (`204`, `205`).
- **Upgrade/pricing modal** (`024`, `085`, `177`, `285`, `286`): tiered plan cards in a horizontal row (Free/Pro/Max visible on web; mobile shows a vertical stacked variant), each with price, a feature checklist, and a CTA button; the current plan is visually de-emphasized/outlined rather than filled.

These were not re-verified live this pass — flag as image-sourced only if used for pixel-level rebuild decisions; re-check live before shipping billing/connector UI changes given how fast those surfaces churn.

---

## 7. Iconography

No explicit icon-font/library attribution found in DOM (not inspected via devtools this pass — `read_page` was not used on the live tab). Visually the set is a **thin-stroke, 1.5–2px line-icon family**, consistent stroke width across all icons (composer, sidebar, artifact header, message actions), rounded caps, ~18–20px default size, no fills except for state indicators (checkmarks, the model-picker's selected dot, toggle switches). This reads as either a custom icon set or a close relative of Lucide/Phosphor-style line icons — **not confirmed to be a named library**; if pixel-matching, trace individual SVGs from screenshots/live DOM rather than assuming a specific icon package ships them.

---

## 8. Top 10 parity gaps most likely missing in our app

Ranked by how visibly wrong it would look/feel if absent, artifact viewer first per the founder's priority:

1. **Artifact viewer header composition is exact and easy to get wrong**: eye/code toggle as a _grouped pill_ (not two separate buttons), title immediately followed by a muted `· TYPE` label (not a separate badge/chip), and the right-side control set _changes by artifact type_ (Copy+dropdown+Publish for docs, Copy+refresh+expand+close for code, download+refresh+close for PDF) — a single fixed toolbar for all artifact types will look off immediately.
2. **Inline artifact widgets for small/simple artifacts** — claude.ai does not always open the side panel; trivial interactive artifacts (a checklist, a counter) can render directly in the message flow with their own mini overflow menu. If our app always forces a side-panel open, that's a real behavioral gap, not just cosmetic.
3. **Plus-menu structure and ordering**: Add files/photos (⌘U) → Take a screenshot → Add to project → Add from GitHub → divider → Skills/Connectors/Plugins (each with submenus) → divider → Research → Web search (persistent toggle, not a fire-once action). Missing the GitHub-repo-picker modal or the Connectors warning-badge pattern (⚠ count for connectors needing re-auth) is a visible gap.
4. **Model picker's two-level flyouts** (Effort submenu with Low/Medium/High/Extra/Max + an info tooltip; "More models" submenu for legacy models) — collapsing this into a flat list loses real functionality users expect.
5. **Assistant message action row is persistent, not hover-only** (copy/read-aloud/thumbs-up/thumbs-down/retry always visible under the response) while **user message actions are hover-only** (timestamp/retry/edit/copy) — mixing these up (e.g. making assistant actions hover-only) is a common miss.
6. **Reasoning/tool-trace UI**: collapsed one-line summary → expandable step list with per-step-type glyphs (search, file `F` badge, terminal, clock/thinking, web globe, chat-bubble for memory) → nested Request/Response JSON panels on click → trailing "Done" row. A generic "thinking..." spinner is not equivalent.
7. **Sidebar's Home/Code top toggle** and the distinct **Artifacts** nav icon (stacked-shapes glyph, different from the plus-menu's flat document icon) — these are easy to conflate into one icon if not checked against the live product.
8. **Automatic skill invocation before HTML artifact generation** (reads a "frontend-design" skill first) — this is why claude.ai's generated HTML/CSS looks intentionally designed (custom fonts, CSS custom properties, card-based layout) rather than default-browser-styled; if our app's artifact generation doesn't have an equivalent design-system-priming step, generated artifacts will look visibly worse by comparison even with the same model.
9. **Settings modal is hash-routed and Cmd+K-reachable**, with two clearly separated sections — "Settings" (General/Account/Privacy/Billing/Usage/Capabilities/Claude Code/Cowork/Claude in Chrome) and "Customize" (Skills/Connectors/Plugins) — as one modal, not separate pages. A settings _page_ instead of a settings _modal_ is a structural, not just visual, difference.
10. **Account chip menu ordering and grouping**: email header (non-interactive) → Settings/Language/Get help → divider → View all plans/Get apps and extensions/Gift Claude/Learn more → divider → Log out. Small but a frequently-checked detail for "does this look like the real thing."

---

## Appendix: source citations by claim

- Composer, plus-menu, Skills/Connectors flyouts, model picker + Effort + More-models flyouts, sidebar, account-chip menu, settings-modal shell, artifact-viewer header/body/code-view, message hover actions, tool-trace glyphs, frontend-design-skill auto-read: **live crawl**, `claude.ai/new` → `claude.ai/chat/ef86542d-5d88-415b-a68e-2e56a51d0ee5`, 2026-07-10, signed in as Siddhartha Nagula (Max).
- Document-type artifact header (Copy+dropdown+Publish): `/Users/siddhartha/Desktop/reference/claude_reference/094_web-max__artifact-viewer-split-pane.png`, `095_web-max__artifact-copy-export-menu.png`.
- Inline artifact widget behavior: `030_web-free__artifact-result.png`, `031_web-free__artifact-widget-interacted.png` (Comet-browser-contaminated, artifact-panel-absence behavior only).
- PDF artifact header: `396_artifacts__artifact-sidebar-pdf-preview-dark-mode.png`.
- Tabbed artifact + Print button: `399_artifacts__artifact-viewer-tabbed-content-with-print-button.png` (Comet-contaminated, ignore "Open in Antigravity" pill).
- Multi-artifact "Download all": `392_artifacts__chat-response-multiple-artifact-cards-download-all.png`.
- Reasoning trace Request/Response panels: `379_artifacts__inline-tool-expanded-detail-json-request-response.png`.
- Web search results with favicons: `035_web-free__web-search-result.png`, `381_artifacts__inline-web-search-results-with-favicons.png`.
- Relevant-chats memory card: `384_artifacts__chat-context-relevant-chats-list.png`.
- Scroll-to-bottom floating button: `380_artifacts__chat-layout-scroll-to-bottom-floating-button.png`.
- Pasted-text chip: `389_artifacts__chat-user-message-pasted-tag-reasoning-steps.png`.
- Connector detail/permissions, OAuth grant modal: `164`–`175`, `249`–`256`, `341`, `174` (all `/Users/siddhartha/Desktop/reference/claude_reference/`).
- Plugin directory/detail: `203`–`206`, `253`.
- Pricing/upgrade modal: `024`, `085`, `177`, `285`, `286`.

## Not covered (follow-up needed)

- In-prose code block chrome (language label + copy button placement) — not observed live or in a clean reference image this pass.
- Citation chips for web-search-grounded answers — filename `381` shows favicons in search-result cards but not inline citation chips in prose.
- CLI (`287`–`290`), VS Code/JetBrains (`319`–`327`), Chrome extension (`341`–`357`), and mobile (`257`–`286`) surfaces were skimmed by filename only, not opened — out of scope for this web-parity pass per the founder's priority ordering, but available in the same reference folder if needed next.
