# Codex macOS App — Shell Evidence (Chat, Panels, Nav, PRs, Sites, Scheduled, Plugins)

**Source screenshots (9 files, all from `chatgpt_reference/`):**

| #   | Filename                                                              |
| --- | --------------------------------------------------------------------- |
| 079 | `codex-macos-chat-empty-state-agiworkforce-quick-actions.png`         |
| 080 | `codex-macos-right-panel-shortcuts-review-terminal-browser-files.png` |
| 081 | `codex-macos-terminal-panel-shell-prompt.png`                         |
| 082 | `codex-macos-sidebar-nav-toggle-tooltip-projects-chats.png`           |
| 083 | `codex-macos-sidebar-nav-projects-recent-chats.png`                   |
| 084 | `codex-macos-pull-requests-list-empty-error-state.png`                |
| 085 | `codex-macos-sites-empty-state-create-new-site.png`                   |
| 086 | `codex-macos-scheduled-tasks-daily-weekly-followup-suggestions.png`   |
| 087 | `codex-macos-plugins-marketplace-installed-featured.png`              |

**Caveats (read before using this as a spec):**

- All 9 files carry filesystem timestamps of **Jul 21 22:36–22:37** (same minute-scale capture session) — a single point-in-time snapshot of one build of the Codex macOS desktop app. Exact app version is not visible in any shot. Treat every label/count/layout below as "true as of that build," not as a permanent contract — Codex is shipping fast and menus/copy may have shifted since.
- The captured project is literally named **"agiworkforce"** in the sidebar/project list and composer chip — this is this operator's own local repo opened in Codex for the screenshot session, not a Codex product feature called "agiworkforce." Do not read anything product-significant into that string; it is scaffolding, not evidence.
- No screen here shows Settings — that is explicitly out of scope for this file (covered by the `codex-macos-settings-*` set elsewhere). I did not open any settings screens for this document.
- I did not see: a populated Pull Requests list (only empty+error state), a populated Sites list (only empty state), an in-progress terminal command (only a bare idle prompt), or the Skills tab content under Plugins (only its tab label). Where the capture set doesn't cover something, it is marked "not covered by these captures" below rather than inferred.
- Dark theme only in every shot; no light-theme captures in this set (light theme exists per the appearance settings screens in the excluded `-settings-` set, but that's out of scope here).

---

## 1. Overall window layout (the shell)

The Codex macOS app is a single native window with a persistent **top OS chrome strip** (solid black bar, ~40px, presumably macOS titlebar/traffic-light area — no traffic lights visible in the crop, so likely a custom titlebar or the crop excludes them) sitting above three horizontally-arranged zones:

```
┌───────────────────────────────────────────────────────────────────────────┐
│  (black titlebar strip)                                                    │
├───────────────┬───────────────────────────────────┬───────────────────────┤
│                │                                    │                       │
│   LEFT         │        CENTER                      │   RIGHT PANEL         │
│   SIDEBAR      │        (chat thread OR              │   (collapsible;       │
│   (fixed       │         full-bleed content: PRs,    │   Review/Terminal/    │
│   ~405px)      │         Sites, Scheduled, Plugins)  │   Browser/Files)      │
│                │                                     │                       │
│                │                                     │                       │
│                ├─────────────────────────────────────┤                       │
│                │  TERMINAL PANEL (optional, docks     │                       │
│                │  full-width beneath chat, own tab    │                       │
│                │  bar, resizes chat area up)          │                       │
├───────────────┴─────────────────────────────────────┴───────────────────────┤
│  Composer bar (repo/env chip row + "Do anything" input) spans center column  │
└───────────────────────────────────────────────────────────────────────────────┘
```

Key structural facts observed directly:

- **Left sidebar** is always present in every shot in this set (never auto-hidden), fixed width, own scroll region, with a **workspace switcher** ("Codex ⌄") pinned at its top and a **user identity row** ("Siddhartha Nagula" + avatar initials "SN" + a "?" help icon) pinned at its bottom. It is the single global nav — every top-level surface (chat, Pull requests, Sites, Scheduled, Plugins) is a sidebar item, not a separate window or top tab bar.
- **Center column** is the primary workspace and is context-dependent: it shows the chat thread + composer for chats, or swaps to a dedicated full-bleed list/grid UI for Pull requests, Sites, Scheduled tasks, and Plugins — the sidebar selection literally replaces the center pane's content, chat-app style, not a modal.
- **Right panel** is a distinct, independently collapsible column (toggle icon top-right, plus a "picture-in-picture"/pop-out icon and an expand icon also top-right). When empty of an active surface it shows a **shortcuts menu** (a list of jump targets: Review, Terminal, Browser, Files). Selecting one presumably docks that surface into the panel (the terminal shot shows Terminal actually docked at the **bottom of the center column**, not the right panel — see §4 discrepancy note below).
- **Composer** ("Do anything" input) is anchored at the bottom of the center column only on the chat screen, sitting above a **context chip row** showing repo/environment/branch — it is not visible on the Pull Requests, Sites, Scheduled, or Plugins screens, confirming those are non-chat, non-composer surfaces even though they share the sidebar.
- A **terminal panel**, when open, does not float — it docks as a **new horizontal band spanning the full width up to the right panel's left edge**, pushing the chat/composer stack upward, and carries its own **tab strip** (a pill labeled with the project name, a "+" to add another terminal tab, and a page-level "x" close control at the far right of that band). This is a genuine multi-pane docking terminal, not a simple output log.

## 2. Screen-by-screen detail

### 2.1 Chat empty state (`079`)

**Screen:** Default/landing chat view for a fresh conversation on the "agiworkforce" project, right panel closed.

Center column, vertically centered:

- A grey outline chat/terminal-bubble glyph icon (~64px, no label) — the empty-state mark.
- Headline: **"What should we build in agiworkforce?"** — the project name is rendered as underlined text within the sentence (dotted underline styling, suggesting it's an inline-editable/clickable project-name token, not a link).
- A row of **4 quick-action cards**, equal width, each with: a small colored icon (top-left of the card), then a two-line bold label:
  1. Pin icon (blue) — **"Explore and understand code"**
  2. Wrench/hammer icon (purple) — **"Build a new feature, app, or tool"**
  3. Circular-arrows/refresh icon (green) — **"Review code and suggest changes"**
  4. Ladybug icon (orange/red) — **"Fix issues and failures"**
- Below the cards, a **context chip bar** directly above the composer: folder icon + **"agiworkforce"**, laptop icon + **"Local"**, branch icon + **"chore/repo-restructure-2…"** (truncated branch name) — three chips in a row, each icon+label, no visible separators beyond spacing.
- **Composer** ("Do anything" placeholder text, greyed):
  - "+" icon button (bottom-left, presumably attach/add-context)
  - **"Full access"** badge/pill in orange with a warning-triangle icon — an inline permission-mode indicator sitting directly in the composer chrome (not just in settings)
  - Right side: a lightning-bolt icon + **"5.6 Sol"** (a usage/credit meter, "Sol" appears to be Codex's credit-unit name) + **"Light"** with a chevron (a model or a reasoning-effort/mode picker, dropdown affordance) + a microphone icon (dictation) + a circular up-arrow **send** button.
- Top-left window chrome (present in every shot): sidebar-toggle icon (with a small blue dot badge — likely "new"/unread indicator), back arrow, forward arrow, and a compose/new-chat pencil icon.
- Top-right window chrome (present in every shot): a rectangle/inset icon and a right-panel-toggle icon.

### 2.2 Right panel — shortcuts menu (`080`)

**Screen:** Same chat empty state as 079, but the **right panel is now open** and showing its default "nothing docked yet" state: a vertical menu of 4 rows.

Right panel contents, top to bottom:

- Panel header row (top-right of whole window, now 3 icons instead of 2): expand/fullscreen icon, inset-rectangle icon, panel-toggle icon.
- **"Review"** row — icon: a small window/pane icon with a "+"/arrow — right-aligned keyboard shortcut badge **"⌃⇧G"**.
- **"Terminal"** row — icon: terminal/prompt glyph — no shortcut shown in this row.
- **"Browser"** row — icon: globe — right-aligned shortcut **"⌘T"**.
- **"Files"** row — icon: folder — right-aligned shortcut **"⌘P"**.

This confirms the right panel is a **launcher/menu for 4 dockable sub-surfaces** (Review, Terminal, Browser, Files), each keyboard-shortcut-accessible, living in the same slot. This is the direct structural analog to a desktop coding agent's "tool tabs" — Codex unifies diff review, a real terminal, an embedded browser, and a file tree into one right-hand dock, chat-adjacent, so the user never leaves the window to check any of these.

### 2.3 Terminal panel with shell prompt (`081`)

**Screen:** Chat empty state with the terminal now actually opened — but notably it renders as a **bottom-docked full-width band**, not inside the right panel slot from §2.2. The right panel itself still shows its idle shortcuts menu (Review/Terminal/Browser/Files) simultaneously, confirming the terminal-docked-at-bottom and the right-panel-menu are independent, both visible at once.

Terminal band contents:

- A tab strip at the very top of the band: one tab pill with a terminal glyph icon + **"agiworkforce"** label + an "x" close-this-tab control, then a **"+"** button to open another terminal tab, then (far right of the whole band, outside the tab pill) a separate **"x"** to close the entire terminal band.
- Below the tab strip, a plain monospace shell prompt: `siddhartha@Siddharthas-MacBook-Air-2 agiworkforce %` followed by a blinking-style cursor block. Nothing has been typed — idle prompt only, real local shell (macOS username/hostname visible, `zsh`-style `%` prompt), confirming this is a **genuine local terminal session bound to the project's working directory**, not a simulated/sandboxed log view.

This is strong evidence Codex macOS embeds a real, interactive local terminal (multi-tab capable) as a first-class panel alongside chat — a capability that would require a pty-bridge/IPC layer in an Electron/Tauri build, not just a styled `<pre>` log.

### 2.4 Sidebar nav — toggle tooltip (`082`)

**Screen:** Same chat empty state, sidebar fully expanded, hovering the sidebar-toggle icon to reveal its tooltip. Notably the workspace-switcher label at the very top of the sidebar is obscured by the tooltip itself (only a stray "C" glyph peeks out from behind it) — everything below is otherwise identical to 083's sidebar.

- Tooltip on the toggle icon: **"Toggle sidebar"** with a right-aligned keyboard shortcut badge **"⌘B"** — standard macOS sidebar-collapse convention.
- Full sidebar structure visible beneath (see §3 for the reconstructed tree; contents match 083 exactly).

### 2.5 Sidebar nav — projects & recent chats (`083`)

**Screen:** Same chat empty state, clean full sidebar (no tooltip obscuring it). This is the cleanest capture of the sidebar and is the basis for the navigation tree in §3.

Sidebar, top to bottom, exact strings:

- **"Codex ⌄"** — bold, large, workspace/app switcher with a dropdown chevron. Search (magnifying-glass) icon at the far right of this same row.
- **"New chat"** (pencil-in-square icon)
- **"Pull requests"** (branch/PR icon)
- **"Sites"** (grid/apps icon)
- **"Scheduled"** (clock icon)
- **"Plugins"** (@ icon)
- Section label **"Pinned"** (muted grey, uppercase-style small caps but rendered in title case: "Pinned")
  - **"ROLE You are a senior full-stack + Rus…"** (truncated pinned chat/prompt title) — shortcut badge **"⌘1"**
- Section label **"Projects"** (muted grey)
  - **"agiworkforce"** (folder icon) — currently selected/highlighted row
    - **"hi"** — shortcut **"⌘2"**
    - **"hi"** — shortcut **"⌘3"**
    - **"AGI Workforce Cloud parity — Cod…"** (truncated) — shortcut **"⌘4"**
    - **"Map repo architecture"** — shortcut **"⌘5"**
    - **"Find current logo"** — shortcut **"⌘6"**
    - **"Show more"** (muted, expand affordance — implies the chat list under a project is truncated/collapsed by default, with only the first 5 chats keyboard-shortcut-numbered ⌘1–⌘6 including the pinned item)
  - **"cli"** (folder icon, second project)
    - **"No chats"** (muted placeholder — empty project state)
- Section label **"Chats"** (muted grey — presumably ungrouped/unpinned chats not tied to a project)
  - **"Show terminal commands for changes"** (a chat title, no shortcut badge shown)
- Bottom-pinned identity row: avatar circle **"SN"** initials + **"Siddhartha Nagula"** + a **"?"** help/support icon at the far right.

Note on 086/087 state drift: in the Scheduled and Plugins screenshots, the same "hi" chat row under agiworkforce now shows a **small blue unread/notification dot** to its right (and the ⌘-shortcut badges disappear from the whole project list in those two later shots — likely because keyboard-shortcut badges only render while the sidebar area has focus/hover, not a structural change).

### 2.6 Pull requests — empty + error state (`084`)

**Screen:** Sidebar → "Pull requests" selected. Three-column layout: sidebar (unchanged) | PR list column | PR detail column.

PR list column, top to bottom:

- Tab row: **"All"** (active/selected, filled pill), **"Reviewing"**, **"Authored"** — plain text tabs, muted when inactive.
- Search bar: magnifying-glass icon + placeholder **"Search pull requests"**, with a **filter icon** button docked to its right (separate rounded-square button, funnel glyph).
- Error banner (inline, not a modal/toast): **"Some pull requests couldn't be loaded"** + a **"Retry"** button (dark pill button) immediately beside the text, left-aligned, sitting directly under the search bar.
- Empty-state text, vertically centered in the remaining list area: **"No pull requests found"** (plain muted text, no icon, no CTA button here — unlike the Sites empty state which does have a CTA).

PR detail column (rightmost, third column — distinct from the right panel described in §2.2/§2.3):

- Centered placeholder text: **"Select pull request to view"**.

This confirms Pull Requests is a **three-pane master-detail view** (nav sidebar / list / detail), reusing the same right-hand real estate that the shortcuts panel and terminal use elsewhere, but here as a plain empty detail pane rather than the Review/Terminal/Browser/Files menu — i.e., that right column is contextual per top-level screen, not a fixed global dock.

### 2.7 Sites — empty state (`085`)

**Screen:** Sidebar → "Sites" selected. Two-column layout: sidebar | full-bleed content area (no third column/detail pane visible here — the right-hand space where the PR detail pane sat is just background, not a "Select site to view" style placeholder).

Content area, top to bottom:

- Top-right toolbar (outside the content card, aligned with the window's global top bar): a **refresh/sync icon** button and a solid white **"Create"** pill button (no dropdown chevron on this one, unlike the Scheduled/Plugins "Create" buttons — see below).
- Page heading: **"Sites"** (large serif-weight-looking sans headline, consistent style with "Scheduled tasks" and "Plugins" headers elsewhere).
- Subheading: **"Turn your ideas into live websites"** (muted grey, sentence-case tagline).
- Search bar: magnifying-glass + placeholder **"Search sites"**.
- Empty state, vertically centered, well below the search bar (large empty gap above it — center-of-viewport style empty state, not tucked under the search bar like the PR screen's was):
  - A grid/apps glyph icon (~40px, matches the sidebar "Sites" icon)
  - Bold text: **"No sites yet"**
  - Button: **"Create new site"** (dark outlined pill button)

This is a lightweight "vibe-hosting"/app-publishing feature — Codex can apparently turn a build into a hosted, shareable site directly from the desktop app, which is a backend capability (build → deploy → hosted URL) our product would need real infrastructure to match, not just UI.

### 2.8 Scheduled tasks — suggestions (`086`)

**Screen:** Sidebar → "Scheduled" selected. Two-column layout: sidebar | content area.

Content area, top to bottom:

- Top-right toolbar: a **"Create ⌄"** button (white pill, this one _does_ have a dropdown chevron, unlike Sites' plain "Create").
- Heading: **"Scheduled tasks"**.
- Subheading: **"Ask ChatGPT to schedule tasks, set reminders, or monitor for updates"**.
- Search bar: placeholder **"Search scheduled tasks"**.
- Section label: **"Suggestions"** (plain text header, not muted-grey like sidebar section labels — slightly larger/bolder).
- Three suggestion rows, each: colored icon, bold title, muted inline cadence text, then a second line of muted description directly beneath:
  1. Bell icon (blue) — **"Daily brief"** — **"Weekdays at 8:00 AM"** — _"Start each weekday with a summary of your calendar, unread email, and priorities"_
  2. Document/list icon (purple) — **"Weekly review"** — **"Fridays at 4:00 PM"** — _"Turn your recent work into a concise status update every Friday"_
  3. Document-with-magnifier icon (green) — **"Follow-up monitor"** — **"Weekdays at 9:00 AM"** — _"Review recent email and calendar activity and flag anything that needs your attention"_

No actual scheduled/active tasks are shown — only pre-canned suggestion templates, meaning this capture is of a fresh/unused Scheduled feature, not a populated schedule. The suggestions explicitly reference **calendar and email** integration, which is a real backend capability requirement (connected accounts, not just a cron-like scheduler) — this only works if Codex/ChatGPT has an actual calendar+email connector wired in, consistent with the Plugins screen's Gmail integration (§2.9).

### 2.9 Plugins — marketplace, installed + featured (`087`)

**Screen:** Sidebar → "Plugins" selected. This is the densest/most information-rich screen in the set.

Top of content area:

- Sub-tab row (page-level tabs, distinct from the sidebar): **"Plugins"** (active) and **"Skills"** (inactive — content not captured, out of scope/not covered by these captures).
- Top-right toolbar: refresh icon, **gear/settings icon**, **"Create ⌄"** button (white pill w/ chevron).
- Heading: **"Plugins"**.
- Subheading: **"Work with ChatGPT across your favorite tools"**.
- Search bar: placeholder **"Search plugins"**.

**"Installed"** section:

- Section header **"Installed"** with a small **gear icon** at the far right of the header row (manage-installed affordance).
- A single horizontal row of **13 plugin icons**, icon-only (no text labels), tightly packed: recognizable marks include a blue document icon, a red "PDF" badge icon, a green spreadsheet-grid icon, an orange/tan slide-deck icon, a multicolor pinwheel icon, a blue four-square/apps icon, a white cursor-in-speech-bubble icon, the Google "G" (colored) icon, a blue/purple gradient paper-plane icon, a blue sparkle-in-square icon, the GitHub octocat (white on black) icon, an orange/pink gradient icon, a green triangle/prism (Vercel-adjacent green mark) icon, and finally a small dark two-icon cluster at the end (looks like two stacked mini badges, possibly a "+N more" or a paired-icon plugin). Exact plugin identities beyond Google, GitHub are not textually labeled in this row — icons only.

Below the icon row: a **"Public" / "Personal"** toggle (Public active/filled) plus a **filter icon** button at the far right, mirroring the PR screen's search+filter pattern.

**"Imported plugins"** section (header + horizontal divider rule):

- **Gmail** row: red/yellow "M" gmail icon, title **"Gmail"**, description **"Read and manage Gmail"**, right-aligned action button **"Finish setup"** (dark pill — meaning it's imported/authorized but not fully configured yet, an incomplete-connection state).
- **Vercel** row: black square with white triangle icon, title **"Vercel"**, description **"Search docs and deploy apps"**, right-aligned **"…"** overflow-menu button (fully configured, no setup CTA needed).

**"Featured"** section (header + divider rule), a **2-column card grid**:

- **Computer Use** — gradient cursor/pointer icon — _"Control Mac apps from ChatGPT"_ — "…" overflow menu.
- **Chrome** — Google Chrome icon — _"Control Chrome with ChatGPT"_ — "…" overflow menu.
- **Spreadsheets** — green grid icon — _"Create and edit spreadsheet files"_ — "…" overflow menu.
- **Presentations** — orange slide icon — _"Create and edit presentations"_ — "…" overflow menu.
- **Data Analytics** — blue/purple gradient bar-chart icon — _"Answer product and business…"_ (truncated) — right-aligned **"Install"** button (this one is NOT yet installed — distinguishes not-installed cards, which get an "Install" CTA, from installed/featured-but-configurable cards, which get a "…" overflow menu).
- **GitHub** — octocat icon — _"Triage PRs, issues, CI, and publish…"_ (truncated) — "…" overflow menu.
- A partially cut-off row beneath (bottom edge of screenshot) showing 2–3 small stacked icons and truncated text **"See Investment Banking, Public Equity Investing, and 10 more"** — this reads as a finance/enterprise-vertical plugin bundle or a "browse more categories" teaser row; content is cut off by the screenshot boundary, so its full layout is **not covered by these captures**.

Notable: "Computer Use" and "Chrome" appearing as **installable plugins** confirms Codex macOS has (or exposes UI for) OS-level automation/control and browser-control capabilities gated behind an explicit plugin install+permission step, not something silently always-on. This is the same shape of capability our "Full access" composer badge (§2.1) and the right-panel "Browser" dock (§2.2) point to — Codex is positioning itself as a full computer-using agent, with granular per-capability opt-in surfaced right in the marketplace UI.

---

## 3. Reconstructed navigation tree

```
Codex (macOS desktop app)
├─ [Sidebar header] "Codex ⌄"  (workspace/app switcher)          [search icon →]
├─ New chat                                                      (⌘? not shown)
├─ Pull requests
│   ├─ Tabs: All | Reviewing | Authored
│   ├─ Search pull requests                              [filter icon]
│   ├─ (error banner) "Some pull requests couldn't be loaded" [Retry]
│   ├─ (empty state) "No pull requests found"
│   └─ Detail pane (empty) "Select pull request to view"
├─ Sites
│   ├─ [Create] (top-right)
│   ├─ "Turn your ideas into live websites"
│   ├─ Search sites
│   └─ (empty state) "No sites yet" → [Create new site]
├─ Scheduled
│   ├─ [Create ⌄] (top-right)
│   ├─ "Ask ChatGPT to schedule tasks, set reminders, or monitor for updates"
│   ├─ Search scheduled tasks
│   └─ Suggestions
│       ├─ Daily brief — Weekdays at 8:00 AM
│       ├─ Weekly review — Fridays at 4:00 PM
│       └─ Follow-up monitor — Weekdays at 9:00 AM
├─ Plugins
│   ├─ Sub-tabs: Plugins | Skills (Skills content not covered by these captures)
│   ├─ [refresh] [gear/settings] [Create ⌄] (top-right)
│   ├─ "Work with ChatGPT across your favorite tools"
│   ├─ Search plugins
│   ├─ Installed (icon strip, 13 icons)              [gear: manage]
│   ├─ Public | Personal                              [filter icon]
│   ├─ Imported plugins
│   │   ├─ Gmail — Read and manage Gmail          [Finish setup]
│   │   └─ Vercel — Search docs and deploy apps   [… overflow]
│   └─ Featured (2-col grid)
│       ├─ Computer Use — Control Mac apps from ChatGPT      [… overflow]
│       ├─ Chrome — Control Chrome with ChatGPT               [… overflow]
│       ├─ Spreadsheets — Create and edit spreadsheet files   [… overflow]
│       ├─ Presentations — Create and edit presentations      [… overflow]
│       ├─ Data Analytics — Answer product and business…      [Install]
│       ├─ GitHub — Triage PRs, issues, CI, and publish…      [… overflow]
│       └─ (cut off) "See Investment Banking, Public Equity Investing, and 10 more"
├─ Pinned
│   └─ "ROLE You are a senior full-stack + Rust sy…"  (⌘1)
├─ Projects
│   ├─ agiworkforce  (folder)
│   │   ├─ hi                                          (⌘2)
│   │   ├─ hi                                          (⌘3)
│   │   ├─ AGI Workforce Cloud parity — Cod…            (⌘4)
│   │   ├─ Map repo architecture                        (⌘5)
│   │   ├─ Find current logo                            (⌘6)
│   │   └─ Show more (collapsed overflow)
│   └─ cli  (folder)
│       └─ No chats (empty state)
├─ Chats  (ungrouped)
│   └─ Show terminal commands for changes
└─ [Footer] Siddhartha Nagula (avatar "SN")                     [? help icon]

Chat surface (center column, per-conversation):
├─ Empty state: "What should we build in <project>?"
├─ Quick actions (4 cards): Explore and understand code | Build a new feature, app, or tool
│                            | Review code and suggest changes | Fix issues and failures
├─ Context chips: [folder] agiworkforce   [laptop] Local   [branch] chore/repo-restructure-2…
└─ Composer: "Do anything" input
    ├─ [+] add/attach
    ├─ "Full access" badge (orange, warning icon)
    ├─ [lightning] 5.6 Sol  (usage/credit meter)
    ├─ [Light ⌄]  (mode/model picker)
    ├─ [mic] dictation
    └─ [↑] send

Right panel (collapsible, per-chat, contextual):
├─ (idle) Shortcuts menu:
│   ├─ Review     (⌃⇧G)
│   ├─ Terminal
│   ├─ Browser    (⌘T)
│   └─ Files      (⌘P)
└─ [expand] [inset] [panel toggle] (top-right controls)

Terminal (docks full-width beneath chat, independent of right panel):
├─ Tab strip: [terminal icon] agiworkforce [x]   [+ new tab]        [x close band]
└─ Shell prompt: siddhartha@Siddharthas-MacBook-Air-2 agiworkforce %
```

## 4. Control inventory table

| Screen           | Control                                                                          | Type                               | What it appears to do                                                     |
| ---------------- | -------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------- |
| Chat empty state | Sidebar toggle (blue-dot badge)                                                  | Icon button                        | Collapses/expands sidebar; tooltip "Toggle sidebar" ⌘B                    |
| Chat empty state | Back / forward arrows                                                            | Icon buttons                       | Chat navigation history (browser-style)                                   |
| Chat empty state | Compose/new-chat pencil                                                          | Icon button                        | Starts a new chat                                                         |
| Chat empty state | Inset-rectangle icon (top-right)                                                 | Icon button                        | Unclear from static shot — likely layout/pop-out toggle                   |
| Chat empty state | Right-panel toggle (top-right)                                                   | Icon button                        | Opens/closes the right panel                                              |
| Chat empty state | "Explore and understand code"                                                    | Quick-action card                  | Pre-fills/starts a chat intent for code exploration                       |
| Chat empty state | "Build a new feature, app, or tool"                                              | Quick-action card                  | Pre-fills/starts a build-feature intent                                   |
| Chat empty state | "Review code and suggest changes"                                                | Quick-action card                  | Pre-fills/starts a code-review intent                                     |
| Chat empty state | "Fix issues and failures"                                                        | Quick-action card                  | Pre-fills/starts a debugging intent                                       |
| Chat empty state | Project name (underlined, in headline)                                           | Inline token                       | Likely clickable/editable project switcher inline in the prompt           |
| Chat empty state | Repo chip "agiworkforce"                                                         | Chip/pill                          | Shows active project/repo; likely opens repo picker                       |
| Chat empty state | Environment chip "Local"                                                         | Chip/pill                          | Shows execution environment (Local vs. presumably Cloud); likely a picker |
| Chat empty state | Branch chip "chore/repo-restructure-2…"                                          | Chip/pill                          | Shows active git branch; likely a branch picker                           |
| Chat empty state | Composer input                                                                   | Text field                         | "Do anything" free-text prompt entry                                      |
| Chat empty state | "+" button                                                                       | Icon button                        | Add attachment/context to composer                                        |
| Chat empty state | "Full access" badge                                                              | Status pill (orange, warning icon) | Indicates current permission/autonomy mode inline in composer             |
| Chat empty state | "5.6 Sol" meter                                                                  | Label w/ icon                      | Usage/credit balance indicator ("Sol" = credit unit)                      |
| Chat empty state | "Light ⌄"                                                                        | Dropdown                           | Model or reasoning-effort/mode picker                                     |
| Chat empty state | Microphone icon                                                                  | Icon button                        | Voice dictation input                                                     |
| Chat empty state | Send (↑ circle)                                                                  | Icon button                        | Submits the composer prompt                                               |
| Right panel      | "Review" row                                                                     | Menu item                          | Opens diff/code-review sub-panel; shortcut ⌃⇧G                            |
| Right panel      | "Terminal" row                                                                   | Menu item                          | Opens terminal sub-panel                                                  |
| Right panel      | "Browser" row                                                                    | Menu item                          | Opens embedded browser sub-panel; shortcut ⌘T                             |
| Right panel      | "Files" row                                                                      | Menu item                          | Opens file-tree sub-panel; shortcut ⌘P                                    |
| Right panel      | Expand/fullscreen icon                                                           | Icon button                        | Expands panel (likely full-window)                                        |
| Terminal panel   | Tab pill "agiworkforce" + [x]                                                    | Tab                                | Names/closes an individual terminal session                               |
| Terminal panel   | "+"                                                                              | Icon button                        | Opens a new terminal tab                                                  |
| Terminal panel   | "x" (band-level)                                                                 | Icon button                        | Closes the entire terminal band                                           |
| Terminal panel   | Shell prompt                                                                     | Live terminal                      | Real interactive local shell bound to project directory                   |
| Sidebar          | "Codex ⌄"                                                                        | Dropdown                           | Workspace/app switcher                                                    |
| Sidebar          | Search (magnifying glass)                                                        | Icon button                        | Opens global search                                                       |
| Sidebar          | New chat                                                                         | Nav item                           | Starts new chat                                                           |
| Sidebar          | Pull requests                                                                    | Nav item                           | Opens PR list surface                                                     |
| Sidebar          | Sites                                                                            | Nav item                           | Opens Sites surface                                                       |
| Sidebar          | Scheduled                                                                        | Nav item                           | Opens Scheduled tasks surface                                             |
| Sidebar          | Plugins                                                                          | Nav item                           | Opens Plugins marketplace                                                 |
| Sidebar          | Pinned item row (⌘1)                                                             | List row                           | Opens pinned chat/prompt; numbered shortcut                               |
| Sidebar          | Project row "agiworkforce"                                                       | Collapsible group                  | Selects/expands project, shows its chats                                  |
| Sidebar          | Chat rows (⌘2–⌘6)                                                                | List rows                          | Open individual chats; first 5 are keyboard-numbered                      |
| Sidebar          | "Show more"                                                                      | Expand link                        | Reveals additional chats beyond the default 5                             |
| Sidebar          | Project row "cli" (empty)                                                        | Collapsible group                  | Second project, shows "No chats" empty state                              |
| Sidebar          | Unread dot (blue)                                                                | Status indicator                   | Marks a chat with new/unread activity                                     |
| Sidebar          | User row "Siddhartha Nagula"                                                     | Footer control                     | Account menu entry point (avatar)                                         |
| Sidebar          | "?" icon                                                                         | Icon button                        | Help/support                                                              |
| Pull requests    | Tabs: All / Reviewing / Authored                                                 | Tab group                          | Filters PR list by relationship to user                                   |
| Pull requests    | Search pull requests                                                             | Text field                         | Filters PR list by text                                                   |
| Pull requests    | Filter icon                                                                      | Icon button                        | Opens additional filter options                                           |
| Pull requests    | "Retry"                                                                          | Button                             | Re-attempts failed PR load                                                |
| Sites            | "Create"                                                                         | Button (top-right)                 | Starts new-site flow                                                      |
| Sites            | Refresh icon                                                                     | Icon button                        | Reloads site list                                                         |
| Sites            | Search sites                                                                     | Text field                         | Filters site list                                                         |
| Sites            | "Create new site"                                                                | Button (empty state CTA)           | Starts new-site flow (duplicate entry point to top "Create")              |
| Scheduled        | "Create ⌄"                                                                       | Dropdown button (top-right)        | Creates a new scheduled task, likely with type submenu                    |
| Scheduled        | Search scheduled tasks                                                           | Text field                         | Filters scheduled task list                                               |
| Scheduled        | Suggestion row (e.g. "Daily brief")                                              | List row / template                | One-click sets up a pre-defined scheduled task                            |
| Plugins          | Sub-tabs: Plugins / Skills                                                       | Tab group                          | Switches between plugin marketplace and skills library                    |
| Plugins          | Refresh icon                                                                     | Icon button                        | Reloads plugin list                                                       |
| Plugins          | Gear/settings icon (top-right)                                                   | Icon button                        | Opens plugin-related settings                                             |
| Plugins          | "Create ⌄"                                                                       | Dropdown button                    | Creates/adds a custom plugin, likely with submenu                         |
| Plugins          | Search plugins                                                                   | Text field                         | Filters plugin catalog                                                    |
| Plugins          | Installed icon strip                                                             | Icon row (13 icons)                | Quick view/access to installed plugins                                    |
| Plugins          | Gear icon (Installed section)                                                    | Icon button                        | Manage installed plugins                                                  |
| Plugins          | Public / Personal                                                                | Tab/toggle                         | Filters catalog scope                                                     |
| Plugins          | Filter icon (catalog)                                                            | Icon button                        | Additional catalog filters                                                |
| Plugins          | "Finish setup" (Gmail)                                                           | Button                             | Completes OAuth/config for an imported-but-incomplete plugin              |
| Plugins          | "…" overflow (Vercel, Computer Use, Chrome, Spreadsheets, Presentations, GitHub) | Icon button                        | Per-plugin management menu (configure/remove/etc.)                        |
| Plugins          | "Install" (Data Analytics)                                                       | Button                             | Installs a not-yet-installed featured plugin                              |

## 5. Notable design decisions

- **Sidebar-as-app-shell, not chat-as-app-shell.** Pull Requests, Sites, Scheduled, and Plugins are full top-level destinations in the left nav, each replacing the entire center column with its own header/subtitle/search/empty-state pattern — Codex macOS is explicitly a multi-surface IDE-adjacent workspace, not "a chat window with some settings." Every non-chat surface repeats the same template: big heading, one-line muted tagline, a search bar, then content — strong internal consistency.
- **Two independent secondary regions, not one.** The right panel (Review/Terminal/Browser/Files launcher) and the bottom-docked terminal band are separate docking zones that can be open simultaneously (both visible at once in `081`). This is a deliberate density trade-off — terminal gets prime full-width real estate (because output needs width), while Review/Browser/Files stay in a narrower side column.
- **Consistent empty-state grammar, but with meaningful variation.** Every list surface (PRs, Sites, Scheduled-suggestions-as-pseudo-empty, Plugins-imported) uses centered icon + bold label (+ optional CTA button) for "nothing here yet" — but Sites gets a prominent centered empty state with a CTA button, while Pull Requests' empty state is a plain muted line with no CTA (arguably a UX gap Codex itself has — creating a PR isn't a create-first action from that screen). Scheduled doesn't show a true empty state at all, instead defaulting straight to "Suggestions" — turning what could be a dead end into a templated onboarding.
- **Progressive disclosure inside the sidebar chat list.** Only 5 chats (plus 1 pinned) get keyboard shortcuts and are shown by default per project; a "Show more" link defers the rest. This keeps the sidebar from growing unbounded while still keyboard-accessible for recent items.
- **Inline permission/mode indicators live in the composer, not buried in settings.** The orange "Full access" badge with a warning triangle sits directly in the send bar on every chat screen — permission mode is treated as always-visible ambient state, not a settings-only toggle. This is a strong pattern for any agentic coding tool: the user should never wonder what autonomy level is currently active.
- **Plugins marketplace distinguishes 4 real states per plugin**, not just installed/not: (1) installed & configured (icon-only row, "…" menu), (2) imported but incomplete ("Finish setup" CTA — Gmail), (3) featured/not-installed ("Install" CTA — Data Analytics), (4) featured & presumably requiring no extra setup but not yet added to Installed (Computer Use, Chrome, Spreadsheets, Presentations, GitHub all show "…" despite being under "Featured" not "Installed" — ambiguous whether these are actually installed-with-defaults or just "manageable" already; worth flagging as an open question rather than asserting a specific state).
- **Credits/usage exposed as a live ambient meter ("5.6 Sol"), not just in a billing settings page** — same "don't bury critical state" pattern as the permission badge.
- **Skills is a sibling tab to Plugins**, not nested under it and not a separate sidebar item — suggesting Codex treats "Skills" (likely prompt/instruction bundles) as marketplace-adjacent to "Plugins" (tool/connector integrations), a taxonomy distinction worth mirroring if we build an equivalent extensibility surface.

## 6. Capabilities visible here that documentation would not tell you

- **A real, interactive, multi-tab local shell is embedded in the desktop app**, bound to the actual local username/hostname/working directory (`siddhartha@Siddharthas-MacBook-Air-2 agiworkforce %`) — this is not a sandboxed pseudo-terminal or a command-log viewer; it requires a genuine pty bridge from the Electron/Tauri-style shell into a real local shell process. Building this for our desktop surface means real terminal emulation (xterm.js-class rendering) plus a native pty spawn/IPC layer, not just streaming stdout text.
- **Codex can provision and host a live website directly ("Sites")** — "Turn your ideas into live websites" plus a "Create new site" flow implies an actual build → deploy → hosted-URL pipeline reachable from the desktop client, i.e., real backend infrastructure (a hosting/deploy service Codex controls), not a local-only feature.
- **Scheduled tasks reference calendar and email data directly** ("Start each weekday with a summary of your calendar, unread email, and priorities" / "Review recent email and calendar activity") — this requires actual connected-account integrations (calendar + email) wired into the scheduling/agent backend, consistent with the Gmail plugin shown with a "Finish setup" OAuth-style CTA. A scheduled-task feature that merely fires a cron-triggered chat prompt would not be able to promise calendar/email awareness without that plumbing.
- **"Computer Use" and "Chrome" are shipped as opt-in plugins with explicit install/permission gating**, not silent always-on capabilities — Codex is exposing OS-level automation (control Mac apps) and browser automation (control Chrome) as marketplace-installable capabilities alongside the "Full access" composer badge and the Browser dock in the right panel. This tells us the desktop app has (or is building toward) actual OS-automation and CDP-style browser-control backends reachable from chat, gated per-plugin rather than globally.
- **The PR list can independently fail to load while other data still renders** ("Some pull requests couldn't be loaded" + Retry, shown simultaneously with "No pull requests found") — implying PR data comes from a separate, fallible network call (presumably GitHub API) distinct from the rest of the shell's local/session data, with its own retry affordance built at the UI level.
- **A live usage/credit meter ("5.6 Sol") is computed and displayed in real time in the composer** — this requires the desktop client to have an authenticated, continuously-updated usage/billing read path wired directly into the chat composer component, not just a settings-page snapshot.
